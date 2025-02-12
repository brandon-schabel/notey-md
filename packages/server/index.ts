import { readdirSync, existsSync as nodeExistsSync, readFileSync as nodeReadFileSync, writeFileSync as nodeWriteFileSync, Dirent, existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, relative, resolve, join, parse as parsePath, sep } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "node:fs/promises";
import { existsSync as existsSyncNode } from "node:fs";
import { serve, Transpiler, type Server } from "bun";

import { parseMarkdownToAst } from "../markdown-parser/src/parse-markdown";
import { renderAstToHtml } from "../markdown-parser/src/renderer";
import { PluginManager } from "./plugin-manager";

////////////////////////////////////////////////////////////////////////////////
// App Configuration & Setup
////////////////////////////////////////////////////////////////////////////////

const fileNameForThisModule = fileURLToPath(import.meta.url);
const directoryForThisModule = dirname(fileNameForThisModule);

type AppConfig = {
    port: number;
    vaultPath: string;
}

export const defaultConfig: AppConfig = {
    port: 3001,
    vaultPath:
        process.env.NODE_ENV === "test"
            ? resolve(directoryForThisModule, "test-notes")
            : resolve(directoryForThisModule, "notes"),
};

console.log("process.env.NODE_ENV", process.env.NODE_ENV);
const isDev = process.env.NODE_ENV !== "production";
console.log("isDev", isDev);

const devFrontendDir = join(directoryForThisModule, "frontend");
const prodFrontendDir = join(directoryForThisModule, "dist", "frontend");

const frontendDir = isDev ? devFrontendDir : prodFrontendDir;

/**
 * Create the Bun server (HTTP) instance.
 */
export function createServer(config: AppConfig): Server {
    const server = Bun.serve({
        port: config.port,
        async fetch(request: Request): Promise<Response> {
            const requestMethod = request.method;
            try {
                if (requestMethod === "GET") {
                    return handleGetRequest(request, config);
                } else if (requestMethod === "POST") {
                    return handlePostRequest(request, config);
                }
                return new Response("Method Not Allowed", { status: 405 });
            } catch (error) {
                return new Response("Internal Server Error", { status: 500 });
            }
        },
    });
    return server;
}

/**
 * Start the server and do any needed initialization.
 */
export async function startServer(config: AppConfig): Promise<Server> {
    await ensureVaultDirectoryExists(config.vaultPath);
    await buildSearchIndex(config);

    // Initialize the plugin manager (register any plugins, if desired).
    const manager = PluginManager.getInstance();
    // Example: manager.registerPlugin(MyAstOrRendererOrBackendPlugin);

    const server = createServer(config);
    return server;
}

////////////////////////////////////////////////////////////////////////////////
// HTTP Handlers
////////////////////////////////////////////////////////////////////////////////

async function handleGetRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname;

    // Serve the home page:
    if (requestPath === "/") {
        const homeHTML = renderHomePageHTML(config);
        return new Response(homeHTML, { headers: { "Content-Type": "text/html" } });
    }

    // Serve files under /app/... from the "frontend" folder (either dev or prod build)
    if (requestPath.startsWith("/app/")) {
        const subPath = requestPath.slice("/app/".length);

        if (isDev) {
            // Development => attempt to find matching file with alternative extensions
            const requestedFile = join(frontendDir, subPath);
            const fileInfo = parsePath(requestedFile);

            const findMatchingFile = (basePath: string, ext: string): string | null => {
                const alternatives = [ext, "jsx", "ts", "tsx"];
                if (ext === "js") {
                    for (const alt of alternatives) {
                        const candidatePath = `${basePath}.${alt}`;
                        if (existsSync(candidatePath)) {
                            return candidatePath;
                        }
                    }
                    return null;
                }
                return existsSync(`${basePath}.${ext}`) ? `${basePath}.${ext}` : null;
            };

            const matchingFile = findMatchingFile(fileInfo.dir + sep + fileInfo.name, fileInfo.ext.slice(1));

            if (!matchingFile) {
                return new Response("Not Found", { status: 404 });
            }

            // If it's TypeScript/TSX/JSX, transpile on the fly
            if (/\.(ts|tsx|jsx)$/.test(matchingFile)) {
                const source = await Bun.file(matchingFile).text();
                const transpiler = new Transpiler({
                    loader: matchingFile.endsWith("tsx") ? "tsx" : "ts",
                });
                const code = transpiler.transformSync(source);
                return new Response(code, {
                    headers: { "Content-Type": "application/javascript" },
                });
            }

            // Otherwise serve it as a static asset
            return new Response(Bun.file(matchingFile));
        } else {
            // Production => serve from dist/frontend
            const candidateProdPath = join(prodFrontendDir, subPath);
            if (!existsSync(candidateProdPath)) {
                return new Response("Not Found", { status: 404 });
            }
            return new Response(Bun.file(candidateProdPath));
        }
    }

    // Expose the compiled markdown parser to the client, if needed
    if (requestPath === "/markdown-parser/dist/index.js") {
        const jsContent = await Bun.file("../markdown-parser/dist/index.js").text();
        return new Response(jsContent, { headers: { "Content-Type": "application/javascript" } });
    }

    // If user requests /notes/<filename> => load note content, run backend hooks, then return editor page
    if (requestPath.startsWith("/notes/")) {
        const noteName = requestPath.replace("/notes/", "").trim();
        if (!noteName) {
            return new Response("No note specified.", { status: 400 });
        }
        try {
            const safePath = ensureSafePath(noteName, config.vaultPath);
            let existingContent = "";
            if (!existsSyncNode(safePath)) {
                // If file doesn't exist, create it
                const defaultNoteContent = "# New Note\n\nStart writing here...";
                await writeNoteToDisk(safePath, defaultNoteContent);
                existingContent = defaultNoteContent;
            } else {
                existingContent = await readNoteFromDisk(safePath);
            }

            // Fire backend plugin onNoteLoad hooks
            const manager = PluginManager.getInstance();
            for (const backendP of manager.getBackendPlugins()) {
                if (backendP.onNoteLoad) {
                    try {
                        existingContent = backendP.onNoteLoad(safePath, existingContent) ?? existingContent;
                    } catch {
                        // If plugin fails, skip it
                    }
                }
            }

            // If user appended "?copy" => return raw text
            const requestUrl = new URL(request.url);
            if (requestUrl.searchParams.has("copy")) {
                return new Response(existingContent, { headers: { "Content-Type": "text/plain" } });
            }

            // Render the editor page (server side includes a "preview" area)
            return new Response(renderEditorPage(noteName, existingContent), {
                headers: { "Content-Type": "text/html" },
            });
        } catch (error) {
            return new Response("Failed to read or render note.", { status: 500 });
        }
    }

    // Handle search
    if (requestPath === "/search") {
        const queryParam = requestUrl.searchParams.get("query") || "";
        return new Response(JSON.stringify(searchNotes(queryParam), null, 2), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response("Not Found", { status: 404 });
}

async function handlePostRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname;

    // Create note
    if (requestPath === "/notes/create") {
        try {
            const requestBody = await request.json();
            const { filename } = requestBody || {};
            if (!filename || typeof filename !== "string") {
                return new Response("Missing or invalid filename", {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const pathToCreate = ensureSafePath(filename, config.vaultPath);
            if (existsSyncNode(pathToCreate)) {
                return new Response(JSON.stringify({ success: false, error: "File already exists" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            await writeNoteToDisk(pathToCreate, "# New Note\n\nStart writing here...");
            return new Response(JSON.stringify({ success: true, message: "Note created", note: filename }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch {
            return new Response(JSON.stringify({ success: false, error: "Failed to create note" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    // Save note
    if (requestPath === "/notes/save") {
        try {
            const requestBody = await request.json();
            const { filename, content } = requestBody || {};
            if (!filename || typeof filename !== "string") {
                return new Response("Missing or invalid filename", {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (typeof content !== "string") {
                return new Response("Missing or invalid content", {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const safePath = ensureSafePath(filename, config.vaultPath);

            // Write to disk
            await writeNoteToDisk(safePath, content);

            // Fire backend plugin onNoteSave hooks
            const manager = PluginManager.getInstance();
            for (const backendP of manager.getBackendPlugins()) {
                if (backendP.onNoteSave) {
                    try {
                        backendP.onNoteSave(safePath, content);
                    } catch {
                        // If plugin fails, skip it
                    }
                }
            }

            // Update search index
            updateSearchIndexForNote(safePath, content);

            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Note saved successfully",
                    timestamp: new Date().toISOString(),
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        } catch {
            return new Response(JSON.stringify({ success: false, error: "Failed to save note" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    return new Response("Not implemented.", { status: 501 });
}

////////////////////////////////////////////////////////////////////////////////
// Rendering Helpers
////////////////////////////////////////////////////////////////////////////////

function renderHomePageHTML(config: AppConfig): string {
    const filesAndDirectories = listAllMarkdownFilesAsTree(config.vaultPath);
    const fileTreeHTML = buildNestedListMarkup(filesAndDirectories);

    const readFileReference =
        typeof (globalThis as any).readFileSync === "function"
            ? (globalThis as any).readFileSync
            : nodeReadFileSync;
    const indexFileContent = readFileReference(resolve(frontendDir, "index.html"), {
        encoding: "utf8",
    });

    return indexFileContent.replace("PLACEHOLDER_FILE_TREE", fileTreeHTML);
}

function buildNestedListMarkup(entries: TreeEntry[]): string {
    let output = "<ul>";
    for (const entry of entries) {
        if (entry.isDirectory) {
            output +=
                "<li>" + entry.name + buildNestedListMarkup(entry.children || []) + "</li>";
        } else {
            output += `
        <li>
          <a href="/notes/${encodeURIComponent(entry.relativePath)}">${entry.name}</a>
          <button class="copy-btn" data-path="${encodeURIComponent(entry.relativePath)}">Copy</button>
        </li>
      `;
        }
    }
    output += "</ul>";
    return output;
}

function listAllMarkdownFilesAsTree(baseDir: string): TreeEntry[] {
    return exploreDirectoryRecursive(baseDir, "");
}

function exploreDirectoryRecursive(baseDir: string, subPath: string): TreeEntry[] {
    const currentDir = resolve(baseDir, subPath);
    const entries: TreeEntry[] = [];
    const dirents = readdirSync(currentDir, { withFileTypes: true });

    for (const dirent of dirents) {
        if (dirent.isDirectory()) {
            const childEntries = exploreDirectoryRecursive(baseDir, join(subPath, dirent.name));
            entries.push({
                name: dirent.name,
                isDirectory: true,
                children: childEntries,
                relativePath: "",
            });
        } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith(".md")) {
            const fullChildPath = join(subPath, dirent.name);
            entries.push({
                name: dirent.name,
                isDirectory: false,
                children: [],
                relativePath: fullChildPath,
            });
        }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
}

interface TreeEntry {
    name: string;
    isDirectory: boolean;
    children: TreeEntry[];
    relativePath: string;
}

export function renderEditorPage(noteName: string, rawMarkdown: string): string {
    const readFileReference =
        typeof (globalThis as any).readFileSync === "function"
            ? (globalThis as any).readFileSync
            : nodeReadFileSync;
    const editorFileContent = readFileReference(
        resolve(directoryForThisModule, "frontend", "editor.html"),
        { encoding: "utf8" },
    );

    // Use the new plugin pipeline to parse AST, apply transformations, and render HTML
    const finalHtml = parseAndRenderWithPlugins(rawMarkdown);

    let replacedHTML = editorFileContent
        .replace("PLACEHOLDER_NOTE_NAME", JSON.stringify(noteName))
        .replace("PLACEHOLDER_CONTENT", JSON.stringify(rawMarkdown))
        .replace('<div id="preview"></div>', `<div id="preview">${finalHtml}</div>`);

    return replacedHTML;
}

/**
 * This function:
 * 1) Parses the markdown to an AST
 * 2) Runs all AST plugins
 * 3) Renders to HTML
 * 4) Runs all renderer plugins
 */
export function parseAndRenderWithPlugins(markdown: string): string {
    const manager = PluginManager.getInstance();

    // 1) Parse to AST
    let doc = parseMarkdownToAst(markdown);

    // 2) Apply AST plugins in priority order
    for (const astP of manager.getAstPlugins()) {
        if (astP.transformAst) {
            const updatedDoc = astP.transformAst(doc);
            if (updatedDoc) {
                doc = updatedDoc;
            }
        }
    }

    // 3) Render to HTML
    let html = renderAstToHtml(doc);

    // 4) Post-process with renderer plugins
    for (const rP of manager.getRendererPlugins()) {
        if (rP.postRender) {
            html = rP.postRender(html);
        }
    }

    return html;
}

////////////////////////////////////////////////////////////////////////////////
// File & Search Index Utilities
////////////////////////////////////////////////////////////////////////////////

export async function readNoteFromDisk(notePath: string): Promise<string> {
    const fileHandle = Bun.file(notePath);
    return fileHandle.text();
}

export async function writeNoteToDisk(notePath: string, content: string): Promise<void> {
    await mkdir(dirname(notePath), { recursive: true });
    await Bun.write(notePath, content);
}

export function ensureSafePath(filename: string, baseDir: string): string {
    const fullResolvedPath = resolve(baseDir, filename);
    const relativePortion = relative(baseDir, fullResolvedPath);
    if (
        relativePortion.startsWith("..") ||
        relativePortion.includes(".." + sep) ||
        relativePortion === ""
    ) {
        throw new Error("Unsafe path detected!");
    }
    return fullResolvedPath;
}

export async function ensureVaultDirectoryExists(vaultPath: string): Promise<void> {
    try {
        const stats = await fs.stat(vaultPath);
        if (!stats.isDirectory()) {
            throw new Error(vaultPath + " is not a directory!");
        }
    } catch (error: any) {
        if (error.code === "ENOENT") {
            await mkdir(vaultPath, { recursive: true });
        } else {
            throw error;
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
// Simple In-Memory Search Index
////////////////////////////////////////////////////////////////////////////////

interface SearchResult {
    notePath: string;
    snippet: string;
}

const inMemoryIndexMap: Map<string, Set<string>> = new Map();

/** Build index for all .md files in vault. */
export async function buildSearchIndex(config: AppConfig): Promise<void> {
    inMemoryIndexMap.clear();
    const allFiles = listAllMarkdownFiles(config.vaultPath);
    for (const filePath of allFiles) {
        const content = await readNoteFromDisk(filePath);
        indexDocumentContent(filePath, content);
    }
}

/** Update index for an individual note. */
export function updateSearchIndexForNote(notePath: string, content: string): void {
    removeFromIndex(notePath);
    indexDocumentContent(notePath, content);
}

function indexDocumentContent(fullPath: string, content: string): void {
    const lowercaseWords = content.toLowerCase().split(/[^a-z0-9_-]+/g);
    for (const w of lowercaseWords) {
        if (!w) continue;
        if (!inMemoryIndexMap.has(w)) {
            inMemoryIndexMap.set(w, new Set());
        }
        inMemoryIndexMap.get(w)!.add(fullPath);
    }
}

function removeFromIndex(fullPath: string) {
    for (const [word, paths] of inMemoryIndexMap) {
        if (paths.has(fullPath)) {
            paths.delete(fullPath);
            if (paths.size === 0) {
                inMemoryIndexMap.delete(word);
            }
        }
    }
}

function listAllMarkdownFiles(dirPath: string): string[] {
    const allPaths: string[] = [];
    function recursiveRead(currentDir: string) {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                recursiveRead(join(currentDir, entry.name));
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
                allPaths.push(join(currentDir, entry.name));
            }
        }
    }
    recursiveRead(dirPath);
    return allPaths;
}

export function searchNotes(searchQuery: string): SearchResult[] {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    let pathCandidates: Set<string> | null = null;
    for (const t of tokens) {
        const matched = inMemoryIndexMap.get(t) || new Set();
        if (!pathCandidates) {
            pathCandidates = new Set(matched);
        } else {
            for (const p of [...pathCandidates]) {
                if (!matched.has(p)) {
                    pathCandidates.delete(p);
                }
            }
            if (pathCandidates.size === 0) {
                break;
            }
        }
    }
    if (!pathCandidates || !pathCandidates.size) return [];
    return [...pathCandidates].map((noteFullPath) => {
        return {
            notePath: noteFullPath,
            snippet: buildSnippetForFileSync(noteFullPath, searchQuery),
        };
    });
}

export function buildSnippetForFileSync(filePath: string, query: string): string {
    try {
        const content = readNoteFromDiskSync(filePath);
        const lines = content.split(/\r?\n/);
        const lowerQuery = query.toLowerCase();
        for (const line of lines) {
            if (line.toLowerCase().includes(lowerQuery)) {
                return line.slice(0, 100) + "...";
            }
        }
        return lines[0] ? lines[0].slice(0, 100) + "..." : "";
    } catch {
        return "";
    }
}

export function readNoteFromDiskSync(notePath: string): string {
    return nodeReadFileSync(notePath, { encoding: "utf8" });
}

export function writeNoteToDiskSync(notePath: string, content: string): void {
    nodeWriteFileSync(notePath, content, { encoding: "utf8" });
}

// Global flag for "open browser once" logic
declare global {
    var __BROWSER_OPENED: boolean;
}
const BROWSER_STATE_FILE = resolve(directoryForThisModule, "node_modules", ".browser_opened");

if (import.meta.main && process.env.NODE_ENV !== "test") {
    process.on("SIGINT", () => {
        try {
            if (nodeExistsSync(BROWSER_STATE_FILE)) {
                Bun.spawnSync(["rm", BROWSER_STATE_FILE]);
            }
        } finally {
            process.exit();
        }
    });

    process.on("SIGTERM", () => {
        try {
            if (nodeExistsSync(BROWSER_STATE_FILE)) {
                Bun.spawnSync(["rm", BROWSER_STATE_FILE]);
            }
        } finally {
            process.exit();
        }
    });

    (async () => {
        try {
            const server = await startServer(defaultConfig);
            console.log(`Server is running on http://localhost:${defaultConfig.port}`);

            // Open browser once per session:
            if (!nodeExistsSync(BROWSER_STATE_FILE)) {
                try {
                    Bun.spawn({ cmd: ["open", `http://localhost:${defaultConfig.port}`] });
                    await mkdir(dirname(BROWSER_STATE_FILE), { recursive: true });
                    await Bun.write(BROWSER_STATE_FILE, "opened");
                } catch (e) {
                    console.error("Failed to open browser automatically", e);
                }
            }
        } catch {
            process.exit(1);
        }
    })();
}