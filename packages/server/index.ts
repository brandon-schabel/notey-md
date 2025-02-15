import { readdirSync, existsSync as nodeExistsSync, readFileSync as nodeReadFileSync, writeFileSync as nodeWriteFileSync, Dirent, existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, relative, resolve, join, parse as parsePath, sep } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "node:fs/promises";
import { existsSync as existsSyncNode } from "node:fs";
import { Transpiler, type Server } from "bun";
import { watch } from "node:fs";

import { parseMarkdownToAst } from "../markdown-parser/src/parse-markdown";
import { renderAstToHtml } from "../markdown-parser/src/renderer";
import { PluginManager } from "./plugin-manager";
import { SearchEngine } from "search-engine";

const fileNameForThisModule = fileURLToPath(import.meta.url);
const directoryForThisModule = dirname(fileNameForThisModule);
const searchEngine = new SearchEngine();

type AppConfig = {
    port: number;
    vaultPath: string;
};

export const defaultConfig: AppConfig = {
    port: 3001,
    vaultPath:
        process.env.NODE_ENV === "test"
            ? resolve(directoryForThisModule, "test-notes")
            : resolve(directoryForThisModule, "notes"),
};

const isDev = process.env.NODE_ENV !== "production";
console.log("isDev", isDev);

const devFrontendDir = join(directoryForThisModule, "frontend");
const prodFrontendDir = join(directoryForThisModule, "dist", "frontend");
const frontendDir = isDev ? devFrontendDir : prodFrontendDir;

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

export async function startServer(config: AppConfig): Promise<Server> {
    try {
        await ensureVaultDirectoryExists(config.vaultPath);
        await buildSearchIndex(config, searchEngine);
    } catch (error) {
        console.error("Error during vault check or search index creation:", error);
        process.exit(1);
    }

    try {
        const manager = PluginManager.getInstance();
        const server = createServer(config);
        watchVaultFolder(config.vaultPath, searchEngine);
        return server;
    } catch (error) {
        console.error("Error during server startup:", error);
        process.exit(1);
    }
}

function watchVaultFolder(vaultPath: string, engine: SearchEngine) {
    let debounceTimer: NodeJS.Timeout | null = null;
    const changedFiles = new Set<string>();

    watch(vaultPath, { recursive: true }, async (eventType, filename) => {
        if (!filename?.endsWith(".md")) return;
        changedFiles.add(filename);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            for (const fileName of changedFiles) {
                const fullPath = resolve(vaultPath, fileName);
                if (!existsSyncNode(fullPath)) {
                    engine.removeDocument(fullPath);
                } else {
                    const content = await readNoteFromDisk(fullPath);
                    engine.addOrUpdateDocument(fullPath, content);
                }
            }
            changedFiles.clear();
            try {
                const serialized = JSON.stringify(engine.toJSON());
                await Bun.write("search-index.json", serialized);
            } catch (err) {
                console.error("Failed to persist search index cache:", err);
            }
        }, 30000) as unknown as NodeJS.Timeout;
    });
}

async function handleGetRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname;

    if (requestPath === "/") {
        const homeHTML = renderHomePageHTML(config);
        return new Response(homeHTML, { headers: { "Content-Type": "text/html" } });
    }

    if (requestPath.startsWith("/app/")) {
        const subPath = requestPath.slice("/app/".length);
        if (isDev) {
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
            return new Response(Bun.file(matchingFile));
        } else {
            const candidateProdPath = join(prodFrontendDir, subPath);
            if (!existsSync(candidateProdPath)) {
                return new Response("Not Found", { status: 404 });
            }
            return new Response(Bun.file(candidateProdPath));
        }
    }

    if (requestPath === "/markdown-parser/dist/index.js") {
        const jsContent = await Bun.file("../markdown-parser/dist/index.js").text();
        return new Response(jsContent, { headers: { "Content-Type": "application/javascript" } });
    }

    if (requestPath.startsWith("/notes/")) {
        const noteName = requestPath.replace("/notes/", "").trim();
        if (!noteName) {
            return new Response("No note specified.", { status: 400 });
        }
        try {
            const safePath = ensureSafePath(noteName, config.vaultPath);
            let existingContent = "";
            if (!existsSyncNode(safePath)) {
                const defaultNoteContent = "# New Note\n\nStart writing here...";
                await writeNoteToDisk(safePath, defaultNoteContent);
                existingContent = defaultNoteContent;
            } else {
                existingContent = await readNoteFromDisk(safePath);
            }
            const manager = PluginManager.getInstance();
            for (const backendP of manager.getBackendPlugins()) {
                if (backendP.onNoteLoad) {
                    try {
                        existingContent = backendP.onNoteLoad(safePath, existingContent) ?? existingContent;
                    } catch { }
                }
            }
            const requestUrl = new URL(request.url);
            if (requestUrl.searchParams.has("copy")) {
                return new Response(existingContent, { headers: { "Content-Type": "text/plain" } });
            }
            return new Response(renderEditorPage(noteName, existingContent), {
                headers: { "Content-Type": "text/html" },
            });
        } catch (error) {
            return new Response("Failed to read or render note.", { status: 500 });
        }
    }

    if (requestPath === "/search") {
        const queryParam = requestUrl.searchParams.get("query") || "";
        if (!queryParam) {
            return new Response(JSON.stringify([]), {
                headers: { "Content-Type": "application/json" },
            });
        }
        const results = searchEngine.search(queryParam);
        const responseBody = results.map((r) => ({
            notePath: relative(config.vaultPath, r.filePath),
            snippet: buildSnippetForFileSync(r.filePath, queryParam),
        }));
        return new Response(JSON.stringify(responseBody, null, 2), {
            headers: { "Content-Type": "application/json" },
        });
    }

    if (requestPath === "/reindex") {
        try {
            await buildSearchIndex(config, searchEngine);
            return new Response(JSON.stringify({ success: true, message: "Search index rebuilt." }), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            console.error("Error during reindexing:", error);
            return new Response(JSON.stringify({ success: false, error: "Failed to reindex." }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    return new Response("Not Found", { status: 404 });
}

async function handlePostRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname;

    if (requestPath === "/notes/create") {
        try {
            const requestBody = await request.json();
            let { filename } = requestBody || {};
            if (!filename || typeof filename !== "string") {
                return new Response(JSON.stringify({ success: false, error: "Missing or invalid filename" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            filename = filename.trim();
            if (!filename.toLowerCase().endsWith(".md")) {
                filename += ".md";
            }
            if (filename.length <= 3 || !filename.slice(0, -3).trim()) {
                return new Response(JSON.stringify({ success: false, error: "Invalid filename.  Must contain characters other than whitespace." }), {
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
            await writeNoteToDisk(safePath, content);
            const manager = PluginManager.getInstance();
            for (const backendP of manager.getBackendPlugins()) {
                if (backendP.onNoteSave) {
                    try {
                        backendP.onNoteSave(safePath, content);
                    } catch { }
                }
            }
            searchEngine.addOrUpdateDocument(safePath, content);
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

    if (requestPath === "/notes/delete") {
        try {
            const requestBody = await request.json();
            const { filename } = requestBody || {};
            if (!filename || typeof filename !== "string") {
                return new Response(JSON.stringify({ success: false, error: "Missing or invalid filename" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const safePath = ensureSafePath(filename, config.vaultPath);
            if (!existsSyncNode(safePath)) {
                return new Response(
                    JSON.stringify({ success: false, error: "File does not exist" }),
                    {
                        status: 404,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
            await fs.unlink(safePath);
            searchEngine.removeDocument(safePath);
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Note deleted successfully",
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        } catch (error) {
            console.error("Error deleting note:", error);
            return new Response(
                JSON.stringify({ success: false, error: "Failed to delete note" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    }

    return new Response("Not implemented.", { status: 501 });
}

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

/**
 * Updated to include a "delete" button next to each note
 */
function buildNestedListMarkup(entries: TreeEntry[]): string {
    let output = "<ul>";
    for (const entry of entries) {
        if (entry.isDirectory) {
            output += "<li>" + entry.name + buildNestedListMarkup(entry.children || []) + "</li>";
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
    const finalHtml = parseAndRenderWithPlugins(rawMarkdown);
    let replacedHTML = editorFileContent
        .replace("PLACEHOLDER_NOTE_NAME", JSON.stringify(noteName))
        .replace("PLACEHOLDER_CONTENT", JSON.stringify(rawMarkdown))
        .replace('<div id="preview"></div>', `<div id="preview">${finalHtml}</div>`);
    return replacedHTML;
}

export function parseAndRenderWithPlugins(markdown: string): string {
    const manager = PluginManager.getInstance();
    let doc = parseMarkdownToAst(markdown);
    for (const astP of manager.getAstPlugins()) {
        if (astP.transformAst) {
            const updatedDoc = astP.transformAst(doc);
            if (updatedDoc) {
                doc = updatedDoc;
            }
        }
    }
    let html = renderAstToHtml(doc);
    for (const rP of manager.getRendererPlugins()) {
        if (rP.postRender) {
            html = rP.postRender(html);
        }
    }
    return html;
}

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

async function buildSearchIndex(config: AppConfig, engine: SearchEngine) {
    const allMarkdownFiles = listAllMarkdownFiles(config.vaultPath);
    for (const filePath of allMarkdownFiles) {
        const content = await readNoteFromDisk(filePath);
        engine.addOrUpdateDocument(filePath, content);
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