/* ===========================
   editor.ts
   =========================== */

   export interface EditorOptions {
    noteName: string
    initialContent: string
}

export interface EditorState {
    noteName: string
    lines: string[]
    activeLine: number | null
    isSaving: boolean
    saveTimeout: number | null
}

export function naiveClientMarkdownRender(md: string): string {
    let out = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    out = out.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`)
    out = out.replace(/`([^`]+)`/g, (_, c) => `<code class="inline">${c}</code>`)
    out = out.replace(/\*\*(.*?)\*\*/g, (_, b) => `<strong>${b}</strong>`)
    out = out.replace(/\*(.*?)\*/g, (_, i) => `<em>${i}</em>`)
    out = out.replace(
        /^[-*]\s+\$begin:math:display\$\s*([xX])\s*\$end:math:display\$\s+(.*)$/gm,
        (_, check, text) => {
            const checked = check.toLowerCase() === "x" ? "checked" : ""
            return `<ul><li><label><input type="checkbox" ${checked} disabled> ${text}</label></li></ul>`
        }
    )
    out = out.replace(/^[-*]\s+(.*)$/gm, `<ul><li>$1</li></ul>`)
    out = out.replace(/^###### (.*)$/gm, `<h6>$1</h6>`)
    out = out.replace(/^##### (.*)$/gm, `<h5>$1</h5>`)
    out = out.replace(/^#### (.*)$/gm, `<h4>$1</h4>`)
    out = out.replace(/^### (.*)$/gm, `<h3>$1</h3>`)
    out = out.replace(/^## (.*)$/gm, `<h2>$1</h2>`)
    out = out.replace(/^# (.*)$/gm, `<h1>$1</h1>`)
    return out.split(/\n\s*\n/g)
        .map((p) => `<p>${p}</p>`)
        .join("\n")
}

function createLineDiv(lineContent: string, index: number, activeIndex: number | null): HTMLDivElement {
    const lineDiv = document.createElement("div")
    lineDiv.dataset.lineIndex = String(index)
    if (index === activeIndex) {
        lineDiv.textContent = lineContent
        lineDiv.contentEditable = "true"
    } else {
        lineDiv.innerHTML = naiveClientMarkdownRender(lineContent)
        lineDiv.contentEditable = "false"
    }
    return lineDiv
}

function renderHybridEditor(editorContainer: HTMLElement, state: EditorState): void {
    editorContainer.innerHTML = ""
    state.lines.forEach((line, index) => {
        const lineElement = createLineDiv(line, index, state.activeLine)
        editorContainer.appendChild(lineElement)
    })
    if (state.activeLine !== null) {
        const activeElement = editorContainer.querySelector(`[data-line-index="${state.activeLine}"]`) as HTMLElement
        if (activeElement) {
            activeElement.focus()
        }
    }
}

function updateLine(state: EditorState, index: number, newText: string): void {
    state.lines[index] = newText
}

function scheduleSave(state: EditorState, onSave: () => void): void {
    if (state.isSaving) return
    if (state.saveTimeout !== null) window.clearTimeout(state.saveTimeout)
    state.saveTimeout = window.setTimeout(onSave, 1000)
}

async function doSave(state: EditorState, statusMessage: HTMLElement): Promise<void> {
    if (state.isSaving) return
    state.isSaving = true
    const content = state.lines.join("\n")
    try {
        await fetch("/notes/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: state.noteName, content }),
        })
        statusMessage.textContent = "Saved at " + new Date().toLocaleTimeString()
        setTimeout(() => {
            statusMessage.textContent = ""
        }, 3000)
    } catch (err) {
        console.error("Save error:", err)
        statusMessage.textContent = "Save failed!"
    } finally {
        state.isSaving = false
    }
}

function applyFormatToActiveLine(state: EditorState, format: string): void {
    if (state.activeLine === null) return
    let currentLine = state.lines[state.activeLine] || ""
    if (format === "```") {
        currentLine = "```\n" + currentLine + "\n```"
    } else if (format === "[ ] ") {
        currentLine = "- [ ] " + currentLine
    } else {
        currentLine = `${format}${currentLine}${format}`
    }
    updateLine(state, state.activeLine, currentLine)
}

function insertLinkAtActiveLine(state: EditorState): void {
    if (state.activeLine === null) return
    const linkText = "[Link Text](http://example.com)"
    const updated = state.lines[state.activeLine] + linkText
    updateLine(state, state.activeLine, updated)
}

function insertListItemAtActiveLine(state: EditorState): void {
    if (state.activeLine === null) return
    const listItemText = "- List item"
    const updated = state.lines[state.activeLine] + listItemText
    updateLine(state, state.activeLine, updated)
}

function copyAllContent(state: EditorState, statusMessage: HTMLElement): void {
    const joined = state.lines.join("\n")
    navigator.clipboard.writeText(joined).then(() => {
        statusMessage.textContent = "Copied entire note!"
        setTimeout(() => {
            statusMessage.textContent = ""
        }, 2000)
    }).catch((error) => {
        console.error("Copy error:", error)
        statusMessage.textContent = "Copy failed!"
    })
}

export function initEditor(options: EditorOptions): void {
    const nameDisplay = document.getElementById("note-name-display") as HTMLElement
    const editorContainer = document.getElementById("hybridEditor") as HTMLElement
    const statusMessage = document.getElementById("statusMsg") as HTMLElement
    nameDisplay.textContent = options.noteName

    const state: EditorState = {
        noteName: options.noteName,
        lines: options.initialContent.split("\n"),
        activeLine: null,
        isSaving: false,
        saveTimeout: null,
    }

    function handleLineClick(event: MouseEvent): void {
        const target = event.target as HTMLElement
        const lineDiv = target.closest("[data-line-index]") as HTMLElement | null
        if (!lineDiv) return
        const clickedIndex = parseInt(lineDiv.dataset.lineIndex!, 10)
        state.activeLine = clickedIndex
        renderHybridEditor(editorContainer, state)
        const activeElement = editorContainer.querySelector(`[data-line-index="${clickedIndex}"]`) as HTMLElement
        if (activeElement) activeElement.focus()
    }

    function handleLineInput(event: Event): void {
        const target = event.target as HTMLElement
        if (state.activeLine !== null && target.dataset.lineIndex) {
            const lineIndex = parseInt(target.dataset.lineIndex, 10)
            if (lineIndex === state.activeLine) {
                updateLine(state, state.activeLine, target.textContent || "")
                scheduleSave(state, () => doSave(state, statusMessage))
            }
        }
    }

    function handleLineBlur(event: FocusEvent): void {
        const target = event.target as HTMLElement
        if (state.activeLine !== null && target.dataset.lineIndex) {
            if (parseInt(target.dataset.lineIndex, 10) === state.activeLine) {
                updateLine(state, state.activeLine, target.textContent || "")
                state.activeLine = null
                renderHybridEditor(editorContainer, state)
                scheduleSave(state, () => doSave(state, statusMessage))
            }
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (state.activeLine === null) return
        if (event.key === "ArrowUp") {
            event.preventDefault()
            const currentElement = editorContainer.querySelector(`[data-line-index="${state.activeLine}"]`) as HTMLElement
            updateLine(state, state.activeLine, currentElement.textContent || "")
            if (state.activeLine > 0) {
                state.activeLine--
                renderHybridEditor(editorContainer, state)
            }
        } else if (event.key === "ArrowDown") {
            event.preventDefault()
            const currentElement = editorContainer.querySelector(`[data-line-index="${state.activeLine}"]`) as HTMLElement
            updateLine(state, state.activeLine, currentElement.textContent || "")
            if (state.activeLine < state.lines.length - 1) {
                state.activeLine++
                renderHybridEditor(editorContainer, state)
            }
        }
    }

    function bindToolbarButtons(): void {
        const formatButtons = document.querySelectorAll("[data-format]")
        formatButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const format = btn.getAttribute("data-format")!
                applyFormatToActiveLine(state, format)
                renderHybridEditor(editorContainer, state)
                scheduleSave(state, () => doSave(state, statusMessage))
            })
        })

        const linkButton = document.getElementById("linkBtn") as HTMLButtonElement
        linkButton.addEventListener("click", () => {
            insertLinkAtActiveLine(state)
            renderHybridEditor(editorContainer, state)
            scheduleSave(state, () => doSave(state, statusMessage))
        })

        const listButton = document.getElementById("listBtn") as HTMLButtonElement
        listButton.addEventListener("click", () => {
            insertListItemAtActiveLine(state)
            renderHybridEditor(editorContainer, state)
            scheduleSave(state, () => doSave(state, statusMessage))
        })

        const copyButton = document.getElementById("copyBtn") as HTMLButtonElement
        copyButton.addEventListener("click", () => {
            copyAllContent(state, statusMessage)
        })

        const saveButton = document.getElementById("saveBtn") as HTMLButtonElement
        saveButton.addEventListener("click", () => {
            doSave(state, statusMessage)
        })
    }

    renderHybridEditor(editorContainer, state)
    editorContainer.addEventListener("click", handleLineClick)
    editorContainer.addEventListener("input", handleLineInput)
    editorContainer.addEventListener("blur", handleLineBlur, true)
    editorContainer.addEventListener("keydown", handleKeyDown)
    bindToolbarButtons()
}

type RouteHandler = (req: Request) => Response

function createEditorResponse(noteName: string, content: string): Response {
    const html = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Editor - ${noteName}</title>
            </head>
            <body>
                <h1>Editing Note: <span id="note-name-display"></span></h1>
                <div class="toolbar">
                  <button id="saveBtn">Save</button>
                  <button data-format="**">Bold</button>
                  <button data-format="*">Italic</button>
                  <button data-format="\`">Inline Code</button>
                  <button data-format="\`\`\`">Code Block</button>
                  <button data-format="[ ] ">Checkbox</button>
                  <button id="linkBtn">Link</button>
                  <button id="listBtn">List Item</button>
                  <button id="copyBtn">Copy</button>
                  <span class="status" id="statusMsg"></span>
                </div>
                <div class="editor-container">
                  <div id="hybridEditor"></div>
                </div>
                <script type="module">
                    import { initEditor } from './editor.js'
                    initEditor({
                        noteName: ${JSON.stringify(noteName)},
                        initialContent: ${JSON.stringify(content)}
                    })
                </script>
            </body>
        </html>
    `
    return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
    })
}

function handleEditorRoute(req: Request): Response {
    const url = new URL(req.url)
    const noteName = url.pathname.replace('/editor/', '')
    try {
        const contentPromise = Bun.file(`notes/${noteName}.md`).text()
        return contentPromise.then((content) => createEditorResponse(noteName, content))
    } catch (error) {
        return createEditorResponse(noteName, '')
    }
}

export function handleEditorRequest(req: Request): Response {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/editor/')) {
        return handleEditorRoute(req)
    }
    return new Response('Not Found', { status: 404 })
}