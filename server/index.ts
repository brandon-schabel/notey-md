import { readdirSync, existsSync as nodeExistsSync, readFileSync as nodeReadFileSync, writeFileSync as nodeWriteFileSync, Dirent } from "node:fs"
import { promises as fs } from "node:fs"
import { dirname, relative, resolve, join, parse as parsePath, sep } from "path"
import { fileURLToPath } from "url"
import { mkdir } from "node:fs/promises"
import { existsSync as existsSyncNode } from "node:fs"
import { parseMarkdown } from "../markdown-parser/src"
import { serve } from "bun"

export interface AppConfig {
    port: number
    vaultPath: string
}

const fileNameForThisModule = fileURLToPath(import.meta.url)
const directoryForThisModule = dirname(fileNameForThisModule)

export const defaultConfig: AppConfig = {
    port: 3001,
    vaultPath: process.env.NODE_ENV === "test"
        ? resolve(directoryForThisModule, "test-notes")
        : resolve(directoryForThisModule, "notes")
}

export type Server = ReturnType<typeof Bun.serve>

export function createServer(config: AppConfig): Server {
    const server = Bun.serve({
        port: config.port,
        async fetch(request: Request): Promise<Response> {
            const requestMethod = request.method
            try {
                if (requestMethod === "GET") {
                    return handleGetRequest(request, config)
                } else if (requestMethod === "POST") {
                    return handlePostRequest(request, config)
                }
                return new Response("Method Not Allowed", { status: 405 })
            } catch (error) {
                return new Response("Internal Server Error", { status: 500 })
            }
        }
    })
    return server
}

export async function startServer(config: AppConfig): Promise<Server> {
    await ensureVaultDirectoryExists(config.vaultPath)
    await buildSearchIndex(config)
    registerPlugin(examplePlugin)
    const server = createServer(config)
    return server
}

async function handleGetRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url)
    const requestPath = requestUrl.pathname
    if (requestPath === "/") {
        const homeHTML = renderHomePageHTML(config)
        return new Response(homeHTML, { headers: { "Content-Type": "text/html" } })
    }
    if (requestPath === "/editor.js" || requestPath === "/notes/editor.js") {
        const tsContent = await Bun.file("./editor.ts").text()
        const transpiler = new Bun.Transpiler({ loader: "ts" })
        const jsContent = await transpiler.transform(tsContent)
        return new Response(jsContent, { headers: { "Content-Type": "application/javascript" } })
    }
    if (requestPath === "/markdown-parser/dist/index.js") {
        const jsContent = await Bun.file("../markdown-parser/dist/index.js").text()
        return new Response(jsContent, { headers: { "Content-Type": "application/javascript" } })
    }
    if (requestPath.startsWith("/notes/")) {
        const noteName = requestPath.replace("/notes/", "").trim()
        if (!noteName) {
            return new Response("No note specified.", { status: 400 })
        }
        try {
            const safePath = ensureSafePath(noteName, config.vaultPath)
            let existingContent = ""
            if (!existsSyncNode(safePath)) {
                const defaultNoteContent = "# New Note\n\nStart writing here..."
                await writeNoteToDisk(safePath, defaultNoteContent)
                existingContent = defaultNoteContent
            } else {
                existingContent = await readNoteFromDisk(safePath)
            }
            const processedContent = fireOnNoteLoadPlugins(safePath, existingContent)
            if (requestUrl.searchParams.has("copy")) {
                return new Response(processedContent, { headers: { "Content-Type": "text/plain" } })
            }
            return new Response(renderEditorPage(noteName, processedContent), { headers: { "Content-Type": "text/html" } })
        } catch (error) {
            return new Response("Failed to read or render note.", { status: 500 })
        }
    }
    if (requestPath === "/search") {
        const queryParam = requestUrl.searchParams.get("query") || ""
        return new Response(JSON.stringify(searchNotes(queryParam), null, 2), { headers: { "Content-Type": "application/json" } })
    }
    return new Response("Not Found", { status: 404 })
}

async function handlePostRequest(request: Request, config: AppConfig): Promise<Response> {
    const requestUrl = new URL(request.url)
    const requestPath = requestUrl.pathname
    if (requestPath === "/notes/create") {
        try {
            const requestBody = await request.json()
            const { filename } = requestBody || {}
            if (!filename || typeof filename !== "string") {
                return new Response("Missing or invalid filename", { status: 400, headers: { "Content-Type": "application/json" } })
            }
            const pathToCreate = ensureSafePath(filename, config.vaultPath)
            if (existsSyncNode(pathToCreate)) {
                return new Response(JSON.stringify({ success: false, error: "File already exists" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                })
            }
            await writeNoteToDisk(pathToCreate, "# New Note\n\nStart writing here...")
            return new Response(JSON.stringify({ success: true, message: "Note created", note: filename }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: "Failed to create note" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            })
        }
    }
    if (requestPath === "/notes/save") {
        try {
            const requestBody = await request.json()
            const { filename, content } = requestBody || {}
            if (!filename || typeof filename !== "string") {
                return new Response("Missing or invalid filename", { status: 400, headers: { "Content-Type": "application/json" } })
            }
            if (typeof content !== "string") {
                return new Response("Missing or invalid content", { status: 400, headers: { "Content-Type": "application/json" } })
            }
            const safePath = ensureSafePath(filename, config.vaultPath)
            await writeNoteToDisk(safePath, content)
            fireOnNoteSavePlugins(safePath, content)
            updateSearchIndexForNote(safePath, content)
            return new Response(JSON.stringify({ success: true, message: "Note saved successfully", timestamp: new Date().toISOString() }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: "Failed to save note" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            })
        }
    }
    return new Response("Not implemented.", { status: 501 })
}

function renderHomePageHTML(config: AppConfig): string {
    const filesAndDirectories = listAllMarkdownFilesAsTree(config.vaultPath)
    const fileTreeHTML = buildNestedListMarkup(filesAndDirectories, config.vaultPath)
    return `
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
          align-items: center;
          margin-bottom: 1rem;
        }
        #searchInput {
          width: 100%;
          padding: 0.5rem;
          font-size: 1rem;
        }
        .search-results {
          margin-top: 1rem;
        }
        #newNoteForm {
          margin-top: 1rem;
          display: flex;
          gap: 0.5rem;
        }
        #newNoteInput {
          flex: 1;
          padding: 0.4rem;
          font-size: 1rem;
        }
        #createNoteButton {
          padding: 0.5rem 0.8rem;
          font-size: 1rem;
          cursor: pointer;
        }
        .file-tree-container ul {
          list-style-type: none;
          padding-left: 1.5rem;
        }
        .file-tree-container li {
          margin: 0.25rem 0;
        }
        .copy-btn {
          margin-left: 0.5rem;
          font-size: 0.9rem;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <h1>My Markdown Notes</h1>
      <div class="search-bar">
        <input type="text" id="searchInput" placeholder="Search notes by content..." />
      </div>
      <div class="search-results" id="searchResults"></div>
      <form id="newNoteForm">
        <input type="text" id="newNoteInput" placeholder="New note filename (e.g. ideas.md)" />
        <button type="submit" id="createNoteButton">Create</button>
      </form>
      <div class="file-tree-container">${fileTreeHTML}</div>
      <script>
        const searchInputElement = document.getElementById("searchInput")
        const searchResultsElement = document.getElementById("searchResults")
        searchInputElement.addEventListener("input", async () => {
          const queryValue = searchInputElement.value.trim()
          if (!queryValue) {
            searchResultsElement.innerHTML = ""
            return
          }
          const response = await fetch("/search?query=" + encodeURIComponent(queryValue))
          if (!response.ok) {
            searchResultsElement.innerHTML = "Error searching"
            return
          }
          const data = await response.json()
          if (!Array.isArray(data)) {
            searchResultsElement.innerHTML = "No results"
            return
          }
          if (data.length === 0) {
            searchResultsElement.innerHTML = "No results"
            return
          }
          let resultsMarkup = "<ul>"
          for (const item of data) {
            const pathParts = item.notePath.split(/\\\\|\\|\\//)
            const lastPart = pathParts[pathParts.length - 1]
            resultsMarkup += "<li><a href='/notes/" + encodeURIComponent(relativePathFromVault(lastPart)) + "'>" + lastPart + "</a> - " + (item.snippet || "") + "</li>"
          }
          resultsMarkup += "</ul>"
          searchResultsElement.innerHTML = resultsMarkup
        })
        function relativePathFromVault(filename) {
          return filename
        }
        const newNoteFormElement = document.getElementById("newNoteForm")
        newNoteFormElement.addEventListener("submit", async (e) => {
          e.preventDefault()
          const newNoteInputElement = document.getElementById("newNoteInput")
          const filenameValue = newNoteInputElement.value.trim()
          if (!filenameValue) return
          const createResponse = await fetch("/notes/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: filenameValue })
          })
          if (!createResponse.ok) {
            alert("Failed to create note")
            return
          }
          const createData = await createResponse.json()
          if (createData.success) {
            window.location.href = "/notes/" + encodeURIComponent(filenameValue)
          } else {
            alert(createData.error || "Failed to create note")
          }
        })
        document.querySelectorAll(".copy-btn").forEach(button => {
          button.addEventListener("click", async () => {
            const targetPath = button.getAttribute("data-path")
            const resp = await fetch("/notes/" + targetPath + "?copy=1")
            if (!resp.ok) {
              alert("Copy failed")
              return
            }
            const content = await resp.text()
            await navigator.clipboard.writeText(content)
            button.textContent = "Copied!"
            setTimeout(() => { button.textContent = "Copy" }, 1500)
          })
        })
      </script>
    </body>
    </html>
  `
}

function buildNestedListMarkup(entries: TreeEntry[], vaultPath: string): string {
    let output = "<ul>"
    for (const entry of entries) {
        if (entry.isDirectory) {
            output += "<li>" + entry.name + buildNestedListMarkup(entry.children || [], vaultPath) + "</li>"
        } else {
            output += `
        <li>
          <a href="/notes/${encodeURIComponent(entry.relativePath)}">${entry.name}</a>
          <button class="copy-btn" data-path="${encodeURIComponent(entry.relativePath)}">Copy</button>
        </li>
      `
        }
    }
    output += "</ul>"
    return output
}

function listAllMarkdownFilesAsTree(baseDir: string): TreeEntry[] {
    return exploreDirectoryRecursive(baseDir, "")
}

function exploreDirectoryRecursive(baseDir: string, subPath: string): TreeEntry[] {
    const currentDir = resolve(baseDir, subPath)
    const entries: TreeEntry[] = []
    const dirents = readdirSync(currentDir, { withFileTypes: true })
    for (const dirent of dirents) {
        if (dirent.isDirectory()) {
            const childEntries = exploreDirectoryRecursive(baseDir, join(subPath, dirent.name))
            entries.push({ name: dirent.name, isDirectory: true, children: childEntries, relativePath: "" })
        } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith(".md")) {
            const fullChildPath = join(subPath, dirent.name)
            entries.push({
                name: dirent.name,
                isDirectory: false,
                children: [],
                relativePath: fullChildPath
            })
        }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    return entries
}

interface TreeEntry {
    name: string
    isDirectory: boolean
    children: TreeEntry[]
    relativePath: string
}

export function renderEditorPage(noteName: string, rawMarkdown: string): string {
    const readFileReference = typeof (globalThis as any).readFileSync === "function"
        ? (globalThis as any).readFileSync
        : nodeReadFileSync
    const editorFileContent = readFileReference(resolve(directoryForThisModule, "editor.html"), { encoding: "utf8" })
    const renderedMarkdown = parseMarkdown(rawMarkdown)
    let replacedHTML = editorFileContent
        .replace("PLACEHOLDER_NOTE_NAME", `${JSON.stringify(noteName)}`)
        .replace("PLACEHOLDER_CONTENT", `${JSON.stringify(rawMarkdown)}`)
        .replace('<div id="preview"></div>', `<div id="preview">${renderedMarkdown}</div>`)
    return replacedHTML
}

export function readNoteFromDiskSync(notePath: string): string {
    return nodeReadFileSync(notePath, { encoding: "utf8" })
}

export function writeNoteToDiskSync(notePath: string, content: string): void {
    nodeWriteFileSync(notePath, content, { encoding: "utf8" })
}

export async function readNoteFromDisk(notePath: string): Promise<string> {
    const fileHandle = Bun.file(notePath)
    return await fileHandle.text()
}

export async function writeNoteToDisk(notePath: string, content: string): Promise<void> {
    await Bun.write(notePath, content)
}

export function ensureSafePath(filename: string, baseDir: string): string {
    const fullResolvedPath = resolve(baseDir, filename)
    const relativePortion = relative(baseDir, fullResolvedPath)
    if (relativePortion.startsWith("..") || relativePortion.includes(".." + sep) || relativePortion === "") {
        throw new Error("Unsafe path detected!")
    }
    return fullResolvedPath
}

export async function ensureVaultDirectoryExists(vaultPath: string): Promise<void> {
    try {
        const stats = await fs.stat(vaultPath)
        if (!stats.isDirectory()) {
            throw new Error(vaultPath + " is not a directory!")
        }
    } catch (error: any) {
        if (error.code === "ENOENT") {
            await mkdir(vaultPath, { recursive: true })
        } else {
            throw error
        }
    }
}

interface SearchResult {
    notePath: string
    snippet: string
}

const inMemoryIndexMap: Map<string, Set<string>> = new Map()

export async function buildSearchIndex(config: AppConfig): Promise<void> {
    inMemoryIndexMap.clear()
    const allFiles = listAllMarkdownFiles(config.vaultPath)
    for (const filePath of allFiles) {
        const content = await readNoteFromDisk(filePath)
        indexDocumentContent(filePath, content)
    }
}

export function updateSearchIndexForNote(notePath: string, content: string): void {
    removeFromIndex(notePath)
    indexDocumentContent(notePath, content)
}

function indexDocumentContent(fullPath: string, content: string): void {
    const lowercaseWords = content.toLowerCase().split(/[^a-z0-9_-]+/g)
    for (const w of lowercaseWords) {
        if (!w) continue
        if (!inMemoryIndexMap.has(w)) {
            inMemoryIndexMap.set(w, new Set())
        }
        inMemoryIndexMap.get(w)!.add(fullPath)
    }
}

function removeFromIndex(fullPath: string) {
    for (const [word, paths] of inMemoryIndexMap) {
        if (paths.has(fullPath)) {
            paths.delete(fullPath)
            if (paths.size === 0) {
                inMemoryIndexMap.delete(word)
            }
        }
    }
}

function listAllMarkdownFiles(dirPath: string): string[] {
    const allPaths: string[] = []
    function recursiveRead(currentDir: string) {
        const entries = readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.isDirectory()) {
                recursiveRead(join(currentDir, entry.name))
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
                allPaths.push(join(currentDir, entry.name))
            }
        }
    }
    recursiveRead(dirPath)
    return allPaths
}

export function searchNotes(searchQuery: string): SearchResult[] {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) return []
    let pathCandidates: Set<string> | null = null
    for (const t of tokens) {
        const matched = inMemoryIndexMap.get(t) || new Set()
        if (!pathCandidates) {
            pathCandidates = new Set(matched)
        } else {
            for (const p of [...pathCandidates]) {
                if (!matched.has(p)) {
                    pathCandidates.delete(p)
                }
            }
            if (pathCandidates.size === 0) {
                break
            }
        }
    }
    if (!pathCandidates || !pathCandidates.size) return []
    return [...pathCandidates].map((noteFullPath) => {
        return {
            notePath: noteFullPath,
            snippet: buildSnippetForFileSync(noteFullPath, searchQuery)
        }
    })
}

export function buildSnippetForFileSync(filePath: string, query: string): string {
    try {
        const content = readNoteFromDiskSync(filePath)
        const lines = content.split(/\r?\n/)
        const lowerQuery = query.toLowerCase()
        for (const line of lines) {
            if (line.toLowerCase().includes(lowerQuery)) {
                return line.slice(0, 100) + "..."
            }
        }
        return lines[0] ? lines[0].slice(0, 100) + "..." : ""
    } catch {
        return ""
    }
}

export interface Plugin {
    name: string
    onNoteLoad?: (path: string, content: string) => string
    onNoteSave?: (path: string, content: string) => void
}

const plugins: Plugin[] = []

export function registerPlugin(plugin: Plugin): void {
    plugins.push(plugin)
}

function fireOnNoteLoadPlugins(path: string, content: string): string {
    let output = content
    for (const p of plugins) {
        if (p.onNoteLoad) {
            try {
                const result = p.onNoteLoad(path, output)
                if (typeof result === "string") {
                    output = result
                }
            } catch (error) { }
        }
    }
    return output
}

function fireOnNoteSavePlugins(path: string, content: string): void {
    for (const p of plugins) {
        if (p.onNoteSave) {
            try {
                p.onNoteSave(path, content)
            } catch (error) { }
        }
    }
}

const examplePlugin: Plugin = {
    name: "ExamplePlugin",
    onNoteLoad(notePath, noteContent) {
        if (notePath.toLowerCase().includes("secret")) {
            return noteContent + "\n<!-- SECRET NOTE DETECTED -->"
        }
        return noteContent
    },
    onNoteSave(notePath, noteContent) {
    }
}

if (import.meta.main && process.env.NODE_ENV !== "test") {
    ; (async () => {
        try {
            await startServer(defaultConfig)
        } catch (error) {
            process.exit(1)
        }
    })()
}