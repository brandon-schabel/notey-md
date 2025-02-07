import {
    readdirSync,
    existsSync as nodeExistsSync,
    readFileSync as nodeReadFileSync,
    writeFileSync as nodeWriteFileSync
} from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "node:fs/promises";
import { existsSync as existsSyncNode } from "node:fs";

export interface AppConfig {
    port: number;
    vaultPath: string;
}

const __filename = fileURLToPath(import.meta.url);
const workspace = dirname(__filename);

export const defaultConfig: AppConfig = {
    port: 3001,
    vaultPath:
        process.env.NODE_ENV === "test"
            ? resolve(workspace, "test-notes")
            : resolve(workspace, "notes")
};

// Create a type for the server
export type Server = ReturnType<typeof Bun.serve>;

// Separate server creation from starting it
export function createServer(config: AppConfig): Server {
    const server = Bun.serve({
        port: config.port,
        async fetch(request: Request): Promise<Response> {
            const { method } = request;
            try {
                if (method === "GET") {
                    return handleGetRequest(request, config);
                } else if (method === "POST") {
                    return handlePostRequest(request, config);
                }
                return new Response("Method Not Allowed", { status: 405 });
            } catch (err) {
                console.error("Server error:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        }
    });

    return server;
}

// Modify startServer to use createServer
export async function startServer(config: AppConfig): Promise<Server> {
    await ensureVaultDirectoryExists(config.vaultPath);
    await buildSearchIndex(config);
    registerPlugin(examplePlugin);

    const server = createServer(config);
    console.log(`Server running at http://localhost:${config.port}`);
    return server;
}

async function handleGetRequest(request: Request, config: AppConfig): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/") {
        const homeHTML = renderHomePageHTML(config);
        return new Response(homeHTML, {
            headers: { "Content-Type": "text/html" }
        });
    }

    if (path === "/editor.js" || path === "/notes/editor.js") {
        const tsContent = await Bun.file("./editor.ts").text();
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const jsContent = await transpiler.transform(tsContent);
        return new Response(jsContent, {
            headers: { "Content-Type": "application/javascript" }
        });
    }

    if (path.startsWith("/notes/")) {
        const noteName = path.replace("/notes/", "").trim();
        if (!noteName) {
            return new Response("No note specified.", { status: 400 });
        }
        try {
            const safePath = ensureSafePath(noteName, config.vaultPath);
            let rawMarkdown = "";
            if (!existsSyncNode(safePath)) {
                const defaultContent = "# New Note\n\nStart writing here...";
                await writeNoteToDisk(safePath, defaultContent);
                rawMarkdown = defaultContent;
            } else {
                rawMarkdown = await readNoteFromDisk(safePath);
            }
            rawMarkdown = fireOnNoteLoadPlugins(safePath, rawMarkdown);

            if (url.searchParams.has("copy")) {
                // Return plain text
                return new Response(rawMarkdown, {
                    headers: { "Content-Type": "text/plain" }
                });
            }
            // Return the HTML editor
            return new Response(renderEditorPage(noteName, rawMarkdown), {
                headers: { "Content-Type": "text/html" }
            });
        } catch (err) {
            console.error(err);
            return new Response("Failed to read or render note.", { status: 500 });
        }
    }

    if (path === "/search") {
        const query = url.searchParams.get("query") || "";
        return new Response(
            JSON.stringify(searchNotes(query), null, 2),
            { headers: { "Content-Type": "application/json" } }
        );
    }

    return new Response("Not Found", { status: 404 });
}

async function handlePostRequest(request: Request, config: AppConfig): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/notes/save") {
        try {
            const body = await request.json();
            const { filename, content } = body || {};

            if (typeof filename !== "string" || typeof content !== "string") {
                return new Response("Invalid request body.", { status: 400 });
            }
            const safePath = ensureSafePath(filename, config.vaultPath);
            // In index.ts inside the POST "/notes/save" block
            await writeNoteToDisk(safePath, content);

            fireOnNoteSavePlugins(safePath, content);
            updateSearchIndexForNote(safePath, content);
            return new Response("Note saved successfully.", { status: 200 });
        } catch (err) {
            console.error("Error saving note:", err);
            return new Response("Failed to save note.", { status: 500 });
        }
    }

    return new Response("Not implemented.", { status: 501 });
}

function renderHomePageHTML(config: AppConfig): string {
    const files = listAllMarkdownFiles(config.vaultPath);
    const listItems = files
        .map((filePath) => {
            const relPath = relative(config.vaultPath, filePath);
            return `
      <li class="note-item">
        <a href="/notes/${encodeURIComponent(relPath)}">${relPath}</a>
        <button class="copy-btn" data-path="${encodeURIComponent(relPath)}">Copy</button>
      </li>
    `;
        })
        .join("");
    return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <title>Notes Home</title>
      <style>
        :root {
          box-sizing: border-box;
        }
        * {
          box-sizing: inherit;
        }
        body {
          margin: 0;
          padding: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.5;
        }
        h1 {
          text-align: center;
          margin: 1rem 0;
        }
        .search-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .search-bar input {
          width: 70%;
          padding: 0.5rem;
          font-size: 1rem;
        }
        .sort-menu {
          padding: 0.5rem;
          font-size: 1rem;
        }
        ul {
          list-style: none;
          padding: 0;
        }
        .note-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0.5rem 0;
        }
        .copy-btn {
          padding: 0.4rem 0.8rem;
          font-size: 0.9rem;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <h1>My Markdown Notes</h1>
      <div class="search-bar">
        <form action="/search" method="GET" style="flex:1; margin-right:0.5rem;">
          <input type="text" name="query" placeholder="Search notes...">
        </form>
        <select class="sort-menu" onchange="alert('Sort not yet implemented!')">
          <option>Sort by Title</option>
          <option>Sort by Date Created</option>
          <option>Sort by Date Modified</option>
        </select>
      </div>
      <ul>${listItems}</ul>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          const copyButtons = document.querySelectorAll(".copy-btn");
          copyButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
              const path = btn.dataset.path;
              try {
                const resp = await fetch("/notes/" + path + "?copy=1");
                if (!resp.ok) {
                  console.error("Failed to copy: " + resp.statusText);
                  return;
                }
                const content = await resp.text();
                await navigator.clipboard.writeText(content);
                btn.textContent = "Copied!";
                setTimeout(() => { btn.textContent = "Copy"; }, 1500);
              } catch(e) {
                console.error("Error copying:", e);
              }
            });
          });
        });
      </script>
    </body>
    </html>
  `;
}

// In renderEditorPage we now use the globally overridable readFileSync.
// This lets our tests (which mock globalThis.readFileSync) work correctly.
export function renderEditorPage(noteName: string, rawMarkdown: string): string {
    const readFile =
        (typeof (globalThis as any).readFileSync === "function"
            ? (globalThis as any).readFileSync
            : nodeReadFileSync) as typeof nodeReadFileSync;
    const editorHtml = readFile(resolve(workspace, "editor.html"), { encoding: "utf8" });

    const ast = parseMarkdown(rawMarkdown);
    let rendered = renderMarkdownASTToHTML(ast);

    if (ast.length === 0) {
        rendered = "";
    }

    let replaced = editorHtml
        .replace("PLACEHOLDER_NOTE_NAME", JSON.stringify(noteName))
        .replace("PLACEHOLDER_CONTENT", JSON.stringify(rawMarkdown))
        .replace('<div id="preview"></div>', `<div id="preview">${rendered}</div>`);

    return replaced;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export interface MarkdownNode {
    type: string;
    level?: number;
    content?: string;
    children?: MarkdownNode[];
}

export function parseMarkdown(markdownContent: string): MarkdownNode[] {
    const lines = markdownContent.split(/\r?\n/);
    const ast: MarkdownNode[] = [];

    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmedLeft = rawLine.trimStart();

        if (trimmedLeft.startsWith("```")) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBuffer = [];
            } else {
                ast.push({ type: "codeblock", content: codeBuffer.join("\n") });
                inCodeBlock = false;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBuffer.push(rawLine);
            continue;
        }

        const headingMatch = /^[#]{1,6}\s+(.*)$/.exec(trimmedLeft);
        if (headingMatch) {
            const hashCount = (trimmedLeft.match(/^#+/) || [""])[0].length;
            ast.push({
                type: "heading",
                level: hashCount,
                content: headingMatch[1]
            });
            continue;
        }

        const checkboxMatch = /^[*-]\s+\$begin:math:display\$\s*([ xX])\s*\$end:math:display\$\s+(.*)$/.exec(trimmedLeft);
        if (checkboxMatch) {
            const isChecked = checkboxMatch[1].toLowerCase() === "x";
            const restContent = checkboxMatch[2];
            ast.push({
                type: "checkbox",
                content: (isChecked ? "[x] " : "[ ] ") + restContent
            });
            continue;
        }

        const listItemMatch = /^[*-]\s+(.*)$/.exec(trimmedLeft);
        if (listItemMatch) {
            ast.push({
                type: "list-item",
                content: listItemMatch[1]
            });
            continue;
        }

        if (trimmedLeft.length > 0) {
            ast.push({
                type: "paragraph",
                content: rawLine.trimEnd()
            });
        }
    }

    if (inCodeBlock && codeBuffer.length) {
        ast.push({
            type: "codeblock",
            content: codeBuffer.join("\n")
        });
    }

    return ast;
}

export function renderMarkdownASTToHTML(ast: MarkdownNode[]): string {
    const lines: string[] = [];

    for (const node of ast) {
        if (node.type === "heading" && node.level && node.content) {
            lines.push(`<h${node.level}>${inlineParse(escapeHtml(node.content))}</h${node.level}>`);
        } else if (node.type === "paragraph" && node.content) {
            lines.push(`<p>${inlineParse(escapeHtml(node.content))}</p>`);
        } else if (node.type === "codeblock" && node.content) {
            lines.push(`<pre><code>${escapeHtml(node.content)}</code></pre>`);
        } else if (node.type === "list-item" && node.content) {
            lines.push(`<ul><li>${inlineParse(escapeHtml(node.content))}</li></ul>`);
        } else if (node.type === "checkbox" && node.content) {
            const isChecked = node.content.startsWith("[x]");
            // The regex below is kept minimal for this example.
            const afterBracket = node.content.replace(/^$begin:math:display$x$end:math:display$\s+|^$begin:math:display$\\s$end:math:display$\s+/, "");
            lines.push(`
<ul>
  <li>
    <label>
      <input type="checkbox" ${isChecked ? "checked" : ""} disabled>
      ${inlineParse(escapeHtml(afterBracket))}
    </label>
  </li>
</ul>
			`);
        }
    }

    return lines.join("\n");
}

export function inlineParse(text: string): string {
    let result = text;
    result = result.replace(/\*\*\*(.*?)\*\*\*/g, (_, triple) => `<strong><em>${triple}</em></strong>`);
    result = result.replace(/\*\*(.*?)\*\*/g, (_, boldText) => `<strong>${boldText}</strong>`);
    result = result.replace(/\_\_(.*?)\_\_/g, (_, boldText) => `<strong>${boldText}</strong>`);
    result = result.replace(/\*(.*?)\*/g, (_, italics) => `<em>${italics}</em>`);
    result = result.replace(/\_(.*?)\_/g, (_, italics) => `<em>${italics}</em>`);
    result = result.replace(/`([^`]+)`/g, (_, codeText) => `<code class="inline">${codeText}</code>`);
    return result;
}

export function readNoteFromDiskSync(path: string): string {
    return nodeReadFileSync(path, { encoding: "utf8" });
}
export function writeNoteToDiskSync(path: string, content: string): void {
    nodeWriteFileSync(path, content, { encoding: "utf8" });
}

export async function readNoteFromDisk(notePath: string): Promise<string> {
    try {
        const file = Bun.file(notePath);
        return await file.text();
    } catch (err) {
        throw new Error(`readNoteFromDisk failed for ${notePath}: ${err}`);
    }
}

export async function writeNoteToDisk(notePath: string, content: string): Promise<void> {
    try {
        await Bun.write(notePath, content);
    } catch (err) {
        throw new Error(`writeNoteToDisk failed for ${notePath}: ${err}`);
    }
}

export function ensureSafePath(filename: string, baseDir: string): string {
    const fullPath = resolve(baseDir, filename);
    if (!fullPath.startsWith(resolve(baseDir) + "/")) {
        throw new Error("Unsafe path detected!");
    }
    return fullPath;
}

export async function ensureVaultDirectoryExists(vaultPath: string): Promise<void> {
    try {
        const stat = await fs.stat(vaultPath);
        if (!stat.isDirectory()) {
            throw new Error(`${vaultPath} is not a directory!`);
        }
    } catch (err: any) {
        if (err.code === "ENOENT") {
            await mkdir(vaultPath, { recursive: true });
            console.log(`Vault directory created at: ${vaultPath}`);
        } else {
            throw err;
        }
    }
}

// SEARCH
interface SearchResult {
    notePath: string;
    snippet: string;
}

const indexMap: Map<string, Set<string>> = new Map();

export async function buildSearchIndex(config: AppConfig): Promise<void> {
    indexMap.clear();
    const allFiles = listAllMarkdownFiles(config.vaultPath);
    for (const filePath of allFiles) {
        const content = await readNoteFromDisk(filePath);
        indexDocument(filePath, content);
    }
    console.log(`Search index built. ${allFiles.length} files indexed.`);
}

export function updateSearchIndexForNote(notePath: string, content: string): void {
    removeFromIndex(notePath);
    indexDocument(notePath, content);
}

function indexDocument(absPath: string, content: string): void {
    const words = content.toLowerCase().split(/[^a-z0-9_-]+/g);
    for (const w of words) {
        if (!w) continue;
        if (!indexMap.has(w)) {
            indexMap.set(w, new Set());
        }
        indexMap.get(w)!.add(absPath);
    }
}

function removeFromIndex(absPath: string) {
    for (const [term, paths] of indexMap) {
        if (paths.has(absPath)) {
            paths.delete(absPath);
            if (paths.size === 0) {
                indexMap.delete(term);
            }
        }
    }
}

function listAllMarkdownFiles(dirPath: string): string[] {
    const result: string[] = [];
    function recurse(current: string) {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory()) {
                recurse(`${current}/${e.name}`);
            } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
                result.push(`${current}/${e.name}`);
            }
        }
    }
    recurse(dirPath);
    return result;
}

export function searchNotes(query: string): SearchResult[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];

    let candidatePaths: Set<string> | null = null;
    for (const t of tokens) {
        const matchedPaths = indexMap.get(t) || new Set();
        if (!candidatePaths) {
            candidatePaths = new Set(matchedPaths);
        } else {
            for (const p of [...candidatePaths]) {
                if (!matchedPaths.has(p)) {
                    candidatePaths.delete(p);
                }
            }
            if (candidatePaths.size === 0) {
                break;
            }
        }
    }

    if (!candidatePaths || !candidatePaths.size) return [];
    return [...candidatePaths].map((notePath) => {
        const snippet = buildSnippetForFileSync(notePath, query);
        return { notePath, snippet };
    });
}

export function buildSnippetForFileSync(filePath: string, query: string): string {
    try {
        const content = readNoteFromDiskSync(filePath);
        const lines = content.split(/\r?\n/);
        const lower = query.toLowerCase();

        for (const line of lines) {
            if (line.toLowerCase().includes(lower)) {
                return line.slice(0, 100) + "...";
            }
        }
        return lines[0] ? lines[0].slice(0, 100) + "..." : "";
    } catch {
        return "";
    }
}

// PLUGIN SYSTEM
export interface Plugin {
    name: string;
    onNoteLoad?: (path: string, content: string) => string;
    onNoteSave?: (path: string, content: string) => void;
}

const plugins: Plugin[] = [];

export function registerPlugin(plugin: Plugin): void {
    plugins.push(plugin);
}

function fireOnNoteLoadPlugins(path: string, content: string): string {
    let output = content;
    for (const plg of plugins) {
        if (plg.onNoteLoad) {
            try {
                const res = plg.onNoteLoad(path, output);
                if (typeof res === "string") {
                    output = res;
                }
            } catch (err) {
                // log error if needed; continue to next plugin
            }
        }
    }
    return output;
}

function fireOnNoteSavePlugins(path: string, content: string): void {
    for (const plg of plugins) {
        if (plg.onNoteSave) {
            try {
                plg.onNoteSave(path, content);
            } catch (err) {
                // log error and continue
            }
        }
    }
}

const examplePlugin: Plugin = {
    name: "ExamplePlugin",
    onNoteLoad(path, content) {
        console.log(`[ExamplePlugin] Loading note: ${path}`);
        if (path.toLowerCase().includes("secret")) {
            return content + "\n<!-- SECRET NOTE DETECTED -->";
        }
        return content;
    },
    onNoteSave(path, _content) {
        console.log(`[ExamplePlugin] Saving note: ${path}`);
    }
};

// IMPORTANT: Only start the server if not in test mode
if (import.meta.main && process.env.NODE_ENV !== "test") {
    (async () => {
        try {
            await startServer(defaultConfig);
        } catch (err) {
            console.error("Error starting server:", err);
            process.exit(1);
        }
    })();
}