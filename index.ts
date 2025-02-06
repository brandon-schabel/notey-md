/* --------------------------------------------------------------------------------
   index.ts

   SINGLE-FILE CORE OF OUR BUN-BASED MARKDOWN NOTES APP
   ---------------------------------------------------
   This file contains all primary logic:
     - Bun server setup (SSR)
     - Simple route to view/edit notes from disk
     - Markdown parser & renderer
     - Editor logic (live preview) with autosave & toolbar
     - Basic file I/O usage using Bun APIs
     - Basic Search/Indexing
     - Minimal plugin system with hooks

   Run:
     bun run index.ts

   Visit:
     http://localhost:3001

-------------------------------------------------------------------------------- */

import { readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'node:fs/promises';
//import editorHtml from './editor.html'; // No longer needed

/* --------------------------------------------------------------------------------
   CONFIGURATION INTERFACE
-------------------------------------------------------------------------------- */

export interface AppConfig {
    port: number;
    vaultPath: string;
}

export const defaultConfig: AppConfig = {
    port: 3001,
    vaultPath: "./notes"
};

/* --------------------------------------------------------------------------------
   SERVER LOGIC - BASIC SSR WITH BUN
-------------------------------------------------------------------------------- */

// Utility function to get the directory of the current file (more robust than import.meta.dir)
const __filename = fileURLToPath(import.meta.url);
console.log(`__filename: ${__filename}`);

const workspace = dirname(__filename);
console.log(`workspace: ${workspace}`);

const notesDir = resolve(workspace, "notes");
console.log(`notesDir: ${notesDir}`);


export async function startServer(config: AppConfig) {
    // Ensure the vault directory exists (will create if missing but never override an existing one)
    await ensureVaultDirectoryExists(notesDir);

    // Build a search index at startup so we can quickly handle search queries
    await buildSearchIndex(config);

    // Register any built-in or example plugins before the server starts
    registerPlugin(examplePlugin);

    const server = Bun.serve({
        port: config.port,
        async fetch(request: Request) {
            const { method } = request;
            try {
                if (method === "GET") {
                    return await handleGetRequest(request, config);
                } else if (method === "POST") {
                    return await handlePostRequest(request, config);
                }
                return new Response("Method Not Allowed", { status: 405 });
            } catch (err) {
                console.error("Server error handling request:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        }
    });

    console.log(`Server running at http://localhost:${config.port}`);
    return server;
}

async function handleGetRequest(request: Request, config: AppConfig): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Home route
    if (path === "/") {
        return new Response(renderHomePageHTML(), {
            headers: { "Content-Type": "text/html" }
        });
    }

    // GET /notes/<filename>
    // Renders an editable view of the note with a live-preview markdown editor
    if (path.startsWith("/notes/")) {
        const noteName = path.replace("/notes/", "").trim();
        if (!noteName) {
            return new Response("No note specified.", { status: 400 });
        }
        try {
            const safePath = ensureSafePath(noteName, notesDir);
            let rawMarkdown: string;

            if (!(await fileExists(safePath))) {
                // Initialize a new note with default content if it doesn't exist.
                const defaultContent = "# New Note\n\nStart writing here...";
                await writeNoteToDisk(safePath, defaultContent);
                rawMarkdown = defaultContent;
            } else {
                rawMarkdown = await readNoteFromDisk(safePath);
            }

            // Fire plugin hook: onNoteLoad
            rawMarkdown = fireOnNoteLoadPlugins(safePath, rawMarkdown);

            // If the URL has a "copy" query parameter, return the raw text
            if (url.searchParams.has("copy")) {
                return new Response(rawMarkdown, {
                    headers: { "Content-Type": "text/plain" }
                });
            }

            const editorPageHtml = await renderEditorPage(noteName, rawMarkdown);
            return new Response(editorPageHtml, {
                headers: { "Content-Type": "text/html" }
            });
        } catch (err) {
            console.error(err);
            return new Response("Failed to read or render note.", { status: 500 });
        }
    }

    // GET /search?query=...
    // Returns JSON array of search matches
    if (path === "/search") {
        const query = url.searchParams.get("query") || "";
        const results = await searchNotes(query);
        return new Response(JSON.stringify(results, null, 2), {
            headers: { "Content-Type": "application/json" }
        });
    }

    // Not found for other paths
    return new Response("Not Found", { status: 404 });
}

async function handlePostRequest(request: Request, config: AppConfig): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /notes/save
    // Expects a JSON body: { filename: string, content: string }
    if (path === "/notes/save") {
        try {
            const body = await request.json();
            const { filename, content } = body;
            if (typeof filename !== "string" || typeof content !== "string") {
                return new Response("Invalid request body.", { status: 400 });
            }
            const safePath = ensureSafePath(filename, notesDir);

            // Write the note to disk
            await writeNoteToDisk(safePath, content);

            // Fire plugin hook: onNoteSave
            fireOnNoteSavePlugins(safePath, content);

            // Update search index for this note
            updateSearchIndexForNote(safePath, content);

            return new Response("Note saved successfully!", { status: 200 });
        } catch (err) {
            console.error("Error in /notes/save:", err);
            return new Response("Failed to save note.", { status: 500 });
        }
    }

    // If no matching route
    return new Response("POST handler not implemented yet.", { status: 501 });
}

/* --------------------------------------------------------------------------------
   BASIC HOME PAGE HTML
-------------------------------------------------------------------------------- */

function renderHomePageHTML(): string {
    // List all markdown files from the vault
    const fileList = listAllMarkdownFiles(notesDir);
    const filesHtml = fileList.map(filePath => {
        const relPath = relative(notesDir, filePath);
        return `<li>
            <div class="note-item">
                <a href="/notes/${encodeURIComponent(relPath)}">${relPath}</a>
                <button class="copy-btn" data-path="${encodeURIComponent(relPath)}">Copy</button>
                <span class="copy-notification">Copied!</span>
            </div>
        </li>`;
    }).join("\n");

    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Bun Markdown Notes App</title>
      <style>
        body {
          font-family: sans-serif;
          margin: 2rem;
        }
        h1, h2 {
          color: #333;
        }
        ul {
          list-style: none;
          padding: 0;
        }
        li {
          margin-bottom: 0.5rem;
        }
        a {
          text-decoration: none;
          color: blue;
        }
        .note-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          position: relative;
        }
        .copy-btn {
          opacity: 0;
          padding: 0.2rem 0.5rem;
          font-size: 0.9rem;
          transition: opacity 0.2s ease;
          cursor: pointer;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 3px;
        }
        .note-item:hover .copy-btn {
          opacity: 1;
        }
        .copy-notification {
          position: absolute;
          left: 100%;
          margin-left: 8px;
          background: #4CAF50;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9rem;
          opacity: 0;
          transition: all 0.2s ease;
          transform: translateY(-50%);
          pointer-events: none;
          white-space: nowrap;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .copy-notification.show {
          opacity: 1;
        }
      </style>
    </head>
    <body>
      <h1>Welcome to the Bun Markdown Notes App</h1>
      <h2>Files in Vault</h2>
      <ul>
        ${filesHtml}
      </ul>
  
      <div style="margin-top: 1rem;">
        <strong>Search Demo</strong><br/>
        <form action="/search" method="GET">
          <input type="text" name="query" placeholder="Enter search query" />
          <button type="submit">Search</button>
        </form>
        <p>(Note: This will return raw JSON results for now.)</p>
      </div>
  
      <div class="placeholder">
        <p>Future Features:</p>
        <ul>
          <li>Live Markdown editing</li>
          <li>File-based storage in <code>./notes</code></li>
          <li>Search/indexing (now partially functional!)</li>
          <li>Plugin hooks</li>
          <li>And more...</li>
        </ul>
      </div>
  
        <script>
        document.addEventListener("DOMContentLoaded", function() {
            const buttons = document.querySelectorAll(".copy-btn");
            buttons.forEach(button => {
            button.addEventListener("click", async function() {
                const path = button.getAttribute("data-path");
                try {
                const response = await fetch("/notes/" + path + "?copy=1");
                if (!response.ok) {
                    console.error("Failed to copy: " + response.statusText);
                    return;
                }
                const content = await response.text();
                await navigator.clipboard.writeText(content);

                // Temporarily change the button text to "Copied!"
                const originalText = button.textContent;
                button.textContent = "Copied!";

                // Clear any existing timeout and revert the text after 1500ms
                if (button.timeoutId) {
                    clearTimeout(button.timeoutId);
                }
                button.timeoutId = setTimeout(() => {
                    button.textContent = originalText;
                }, 1500);

                // Optional visual feedback on the button
                button.style.backgroundColor = '#e0e0e0';
                setTimeout(() => {
                    button.style.backgroundColor = '';
                }, 200);
                } catch (err) {
                console.error("Error copying document: " + err);
                }
            });
            });
        });
        </script>
    </body>
    </html>
    `;
}

/* --------------------------------------------------------------------------------
   EDITOR PAGE HTML
   Updated to include a functional toolbar, live preview logic, and autosave.
-------------------------------------------------------------------------------- */

function escapeForTextarea(value: string): string {
    // Basic HTML escape, plus we specifically escape `</textarea>` to avoid breaking out of the textarea.
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        // Prevent a literal "</textarea>" from prematurely closing the textarea
        .replace(/<\/textarea>/gi, "&lt;/textarea&gt;");
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


/* --------------------------------------------------------------------------------
   MARKDOWN ENGINE (SERVER-SIDE VERSION)
-------------------------------------------------------------------------------- */

export interface MarkdownNode {
    type: string; // e.g. "heading", "paragraph", "codeblock"
    level?: number; // heading level (1..6) if type = heading
    content?: string; // raw text for paragraphs/headings
    children?: MarkdownNode[]; // for possible nesting if needed
}

/**
 * A naive Markdown parser (server-side):
 * - Detects triple backtick code blocks
 * - Detects headings (#, ##, ...)
 * - Groups other text into paragraphs
 * - Ignores lists/blockquotes for now
 * - Does minimal inline parse (bold/italic/code) only during final rendering
 */
export function parseMarkdown(markdownContent: string): MarkdownNode[] {
    const lines = markdownContent.split(/\r?\n/);
    const ast: MarkdownNode[] = [];
    let inCodeBlock = false;
    let codeBlockBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect code block fences ```
        if (line.trim().startsWith("```")) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockBuffer = [];
            } else {
                inCodeBlock = false;
                ast.push({
                    type: "codeblock",
                    content: codeBlockBuffer.join("\n")
                });
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockBuffer.push(line);
            continue;
        }

        // Headings (# up to 6)
        const headingMatch = /^(\#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const content = headingMatch[2];
            ast.push({
                type: "heading",
                level,
                content
            });
            continue;
        }

        // Paragraph fallback (non-empty)
        if (line.trim().length > 0) {
            ast.push({
                type: "paragraph",
                content: line.trim()
            });
        }
    }

    // If file ended while in code block
    if (inCodeBlock && codeBlockBuffer.length > 0) {
        ast.push({
            type: "codeblock",
            content: codeBlockBuffer.join("\n")
        });
    }

    return ast;
}

export function renderMarkdownASTToHTML(ast: MarkdownNode[]): string {
    let htmlOutput = "";

    for (const node of ast) {
        if (node.type === "heading" && node.level && node.content) {
            const safeText = escapeHtml(node.content);
            htmlOutput += `<h${node.level}>${inlineParse(safeText)}</h${node.level}>\n`;
        } else if (node.type === "paragraph" && node.content) {
            const safeText = escapeHtml(node.content);
            htmlOutput += `<p>${inlineParse(safeText)}</p>\n`;
        } else if (node.type === "codeblock" && node.content) {
            const safeCode = escapeHtml(node.content);
            htmlOutput += `<pre><code>${safeCode}</code></pre>\n`;
        }
    }

    return htmlOutput;
}

/**
 * Very naive inline parsing:
 * - **bold**, __bold__
 * - *italic*, _italic_
 * - `inline code`
 */
function inlineParse(text: string): string {
    let result = text;

    // Inline code
    result = result.replace(/`([^`]+)`/g, (_, codeText) => {
        return `<code class="inline">${codeText}</code>`;
    });

    // Bold: **text** or __text__
    result = result.replace(/\*\*(.*?)\*\*/g, (_, boldText) => {
        return `<strong>${boldText}</strong>`;
    });
    result = result.replace(/\_\_(.*?)\_\_/g, (_, boldText) => {
        return `<strong>${boldText}</strong>`;
    });

    // Italic: *text* or _text_
    result = result.replace(/\*(.*?)\*/g, (_, italics) => {
        return `<em>${italics}</em>`;
    });
    result = result.replace(/\_(.*?)\_/g, (_, italics) => {
        return `<em>${italics}</em>`;
    });

    return result;
}

/* --------------------------------------------------------------------------------
   EDITOR LOGIC PLACEHOLDERS (PUBLIC INTERFACE)
-------------------------------------------------------------------------------- */

/**
 * These are placeholders or server stubs for client-side actions.
 * We keep them exported so our tests can import them if needed.
 */
export function initializeEditorClientSide() {
    // Placeholder for older test usage
}

export function handleEditorInputChange(rawMarkdown: string) {
    // Placeholder for older test usage
}

/* --------------------------------------------------------------------------------
   FILESYSTEM & STORAGE (using Bun APIs)
-------------------------------------------------------------------------------- */

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
        console.log(`Writing note to ${notePath}`);
        await Bun.write(notePath, content); // Use the absolute path directly
    } catch (err) {
        throw new Error(`writeNoteToDisk failed for ${notePath}: ${err}`);
    }
}

/**
 * Ensures the requested file is inside the vault directory.
 */
function ensureSafePath(filename: string, baseDir: string): string {
    const resolved = new URL(filename, `file://${baseDir.replace(/\\/g, "/") + "/"}`).pathname;
    if (!resolved.startsWith(new URL(baseDir, "file://").pathname)) {
        throw new Error("Unsafe path detected!");
    }
    return resolved;
}

/**
 * Checks whether a file exists at the given path.
 */
async function fileExists(notePath: string): Promise<boolean> {
    try {
        const file = Bun.file(notePath);
        return await file.exists();
    } catch {
        return false;
    }
}

/**
 * Ensures the vault directory exists.
 * If the directory doesn't exist, it is created.
 * If the path exists but is not a directory, an error is thrown.
 */
async function ensureVaultDirectoryExists(vaultPath: string): Promise<void> {
    try {
        const stat = await fs.stat(vaultPath);
        if (!stat.isDirectory()) {
            throw new Error(`${vaultPath} exists and is not a directory!`);
        }
    } catch (err: any) {
        // If the error indicates the directory does not exist, create it.
        if (err.code === "ENOENT") {
            try {
                await fs.mkdir(vaultPath, { recursive: true });
                console.log(`Vault directory created at: ${vaultPath}`);
            } catch (mkdirErr) {
                throw new Error(`Failed to create vault directory at ${vaultPath}: ${mkdirErr}`);
            }
        } else {
            throw err;
        }
    }
}

/* --------------------------------------------------------------------------------
   SEARCH & INDEXING
-------------------------------------------------------------------------------- */

/**
 * We'll keep an in-memory inverted index. For example:
 *   indexMap[word] = Set of absolute file paths that contain this word
 */
const indexMap: Map<string, Set<string>> = new Map();

interface SearchResult {
    notePath: string;
    snippet: string;
}

/**
 * Scan the vault folder, read all .md files, and build an inverted index.
 */
export async function buildSearchIndex(config: AppConfig): Promise<void> {
    indexMap.clear();
    const allFiles = listAllMarkdownFiles(notesDir);

    for (const filePath of allFiles) {
        const content = await readNoteFromDisk(filePath);
        indexDocument(filePath, content);
    }

    console.log(`Search index built. Indexed ${allFiles.length} markdown file(s).`);
}

/**
 * After we save/modify a single note, update the index for that note.
 */
export function updateSearchIndexForNote(notePath: string, newContent: string): void {
    removeFromIndex(notePath);
    indexDocument(notePath, newContent);
}

/**
 * Index a single document's content.
 */
function indexDocument(absPath: string, content: string): void {
    const text = content.toLowerCase();
    const tokens = text.split(/[^a-z0-9_-]+/g);

    for (const token of tokens) {
        if (!token) continue;
        if (!indexMap.has(token)) {
            indexMap.set(token, new Set());
        }
        indexMap.get(token)?.add(absPath);
    }
}

/**
 * Removes all references to a particular note from the index.
 */
function removeFromIndex(absPath: string) {
    for (const [word, paths] of indexMap.entries()) {
        if (paths.has(absPath)) {
            paths.delete(absPath);
            if (paths.size === 0) {
                indexMap.delete(word);
            }
        }
    }
}

/**
 * Returns a list of .md file paths for everything inside the vault, recursively.
 */
function listAllMarkdownFiles(dirPath: string): string[] {
    const result: string[] = [];
    function recurse(currentPath: string) {
        const entries = readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                recurse(`${currentPath}/${entry.name}`);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
                result.push(`${currentPath}/${entry.name}`);
            }
        }
    }
    recurse(dirPath);
    return result;
}

/**
 * Search the in-memory index for the query.
 */
export async function searchNotes(query: string): Promise<SearchResult[]> {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    const tokens = lowerQuery.split(/\s+/);
    let candidatePaths: Set<string> | null = null;

    for (const token of tokens) {
        const pathsForToken = indexMap.get(token) || new Set();
        if (candidatePaths === null) {
            candidatePaths = new Set(pathsForToken);
        } else {
            for (const path of [...candidatePaths]) {
                if (!pathsForToken.has(path)) {
                    candidatePaths.delete(path);
                }
            }
        }
        if (candidatePaths.size === 0) break;
    }

    if (!candidatePaths || candidatePaths.size === 0) return [];

    const results: SearchResult[] = [];
    for (const filePath of candidatePaths) {
        const snippet = await buildSnippetForFile(filePath, query);
        results.push({
            notePath: filePath,
            snippet
        });
    }
    return results;
}

/**
 * Build a snippet showing where the query text is found in the file, or return the first line.
 */
async function buildSnippetForFile(filePath: string, query: string): Promise<string> {
    try {
        const content = await readNoteFromDisk(filePath);
        const lines = content.split(/\r?\n/);
        const lowerQ = query.toLowerCase();
        for (const line of lines) {
            if (line.toLowerCase().includes(lowerQ)) {
                return line.slice(0, 100).replace(/</g, "&lt;") + "...";
            }
        }
        return lines[0]?.slice(0, 100) + "...";
    } catch (err) {
        return "";
    }
}

/* --------------------------------------------------------------------------------
   PLUGIN SYSTEM PLACEHOLDERS
-------------------------------------------------------------------------------- */

export interface Plugin {
    name: string;
    onNoteLoad?: (path: string, content: string) => string;
    onNoteSave?: (path: string, content: string) => void;
}

const plugins: Plugin[] = [];

export function registerPlugin(plugin: Plugin): void {
    plugins.push(plugin);
}

function fireOnNoteLoadPlugins(path: string, originalContent: string): string {
    let content = originalContent;
    for (const plugin of plugins) {
        if (plugin.onNoteLoad) {
            const maybeTransformed = plugin.onNoteLoad(path, content);
            if (typeof maybeTransformed === "string") {
                content = maybeTransformed;
            }
        }
    }
    return content;
}

function fireOnNoteSavePlugins(path: string, content: string): void {
    for (const plugin of plugins) {
        if (plugin.onNoteSave) {
            plugin.onNoteSave(path, content);
        }
    }
}

/**
 * An example plugin: logs when a note is loaded or saved.
 */
const examplePlugin: Plugin = {
    name: "ExamplePlugin",
    onNoteLoad: (path, content) => {
        console.log(`[ExamplePlugin] onNoteLoad triggered for: ${path}`);
        if (path.toLowerCase().endsWith("secret.md")) {
            return content + "\n\n<!-- Plugin says: This is a secret note! -->";
        }
        return content;
    },
    onNoteSave: (path, _content) => {
        console.log(`[ExamplePlugin] onNoteSave triggered for: ${path}`);
    }
};

/* --------------------------------------------------------------------------------
   TESTABILITY & EXPORTS
-------------------------------------------------------------------------------- */
// (Already exporting the key items above)

/* --------------------------------------------------------------------------------
   MAIN EXECUTION
-------------------------------------------------------------------------------- */

if (import.meta.main) {
    (async () => {
        try {
            await startServer(defaultConfig);
        } catch (err) {
            console.error("Error starting server:", err);
            process.exit(1);
        }
    })();
}


async function renderEditorPage(noteName: string, rawMarkdown: string): Promise<string> {
    // 1. Read the editor.html file
    const editorHtml = await Bun.file("./editor.html").text();

    // 2. Server-side Markdown rendering for initial preview
    const initialAst = parseMarkdown(rawMarkdown);
    const initialHtml = renderMarkdownASTToHTML(initialAst);

    // 3. Escape the rawMarkdown for safe insertion into <textarea>
    const escapedNoteContent = escapeForTextarea(rawMarkdown);
    // Also escape the noteName for inserting into the <span> (to avoid injecting HTML)
    const escapedNoteName = escapeHtml(noteName);

    // 4. Do naive string replacements
    //    (We replace the <span>, <textarea>, and <div> "preview" contents)
    let replacedHtml = editorHtml;

    // -- A) Insert the noteName into the <span id="note-name-display">
    replacedHtml = replacedHtml.replace(
        '<span id="note-name-display"></span>',
        `<span id="note-name-display">${escapedNoteName}</span>`
    );

    // -- B) Insert the rawMarkdown into <textarea id="editor">
    replacedHtml = replacedHtml.replace(
        '<textarea id="editor"></textarea>',
        `<textarea id="editor">${escapedNoteContent}</textarea>`
    );

    // -- C) Insert the server-rendered HTML into <div id="preview">
    replacedHtml = replacedHtml.replace(
        '<div id="preview"></div>',
        `<div id="preview">${initialHtml}</div>`
    );

    // -- D) Replace the call to initEditor("NOTE_NAME_PLACEHOLDER", "INITIAL_CONTENT_PLACEHOLDER")
    //       so the client script receives the same noteName and content
    //       (We must JSON.stringify them to avoid any special characters breaking the JS string)
    replacedHtml = replacedHtml.replace(
        'initEditor("NOTE_NAME_PLACEHOLDER", "INITIAL_CONTENT_PLACEHOLDER");',
        `initEditor(${JSON.stringify(noteName)}, ${JSON.stringify(rawMarkdown)});`
    );

    // 5. Return the modified HTML
    return replacedHtml;
}