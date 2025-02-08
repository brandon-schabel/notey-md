import { parseMarkdown } from "./markdown-parser";

export interface EditorOptions {
    noteName: string;
    initialContent: string;
}

export interface EditorState {
    noteName: string;
    lines: string[];
    activeLine: number | null;
    isSaving: boolean;
    saveTimeout: number | null;
}

export function createLineDiv(
    lineContent: string,
    index: number,
    activeIndex: number | null
): HTMLDivElement {
    const lineDiv = document.createElement("div");
    lineDiv.dataset.lineIndex = String(index);
    if (index === activeIndex) {
        lineDiv.textContent = lineContent;
        lineDiv.contentEditable = "true";
    } else {
        lineDiv.innerHTML = parseMarkdown(lineContent);
        lineDiv.contentEditable = "false";
    }
    return lineDiv;
}

export function updateLine(state: EditorState, index: number, newText: string): void {
    state.lines[index] = newText;
}

export function scheduleSave(state: EditorState, onSave: () => void): void {
    if (state.isSaving) return;
    if (state.saveTimeout !== null) {
        window.clearTimeout(state.saveTimeout);
    }
    state.saveTimeout = window.setTimeout(onSave, 1000);
}

async function doSave(state: EditorState, statusMessage: HTMLElement): Promise<void> {
    if (state.isSaving) return;
    state.isSaving = true;
    const content = state.lines.join("\n");
    try {
        await fetch("/notes/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: state.noteName, content }),
        });
        statusMessage.textContent = "Saved at " + new Date().toLocaleTimeString();
        setTimeout(() => {
            statusMessage.textContent = "";
        }, 3000);
    } catch (err) {
        statusMessage.textContent = "Save failed!";
    } finally {
        state.isSaving = false;
    }
}

export function applyFormatToActiveLine(state: EditorState, format: string): void {
    if (state.activeLine === null) return;
    let currentLine = state.lines[state.activeLine] || "";
    if (format === "```") {
        currentLine = "```\n" + currentLine + "\n```";
    } else if (format === "[ ] ") {
        currentLine = "- [ ] " + currentLine;
    } else {
        currentLine = `${format}${currentLine}${format}`;
    }
    updateLine(state, state.activeLine, currentLine);
}

export function insertLinkAtActiveLine(state: EditorState): void {
    if (state.activeLine === null) return;
    const linkText = "[Link Text](http://example.com)";
    const updated = state.lines[state.activeLine] + linkText;
    updateLine(state, state.activeLine, updated);
}

export function insertListItemAtActiveLine(state: EditorState): void {
    if (state.activeLine === null) return;
    const listItemText = "- List item";
    const updated = state.lines[state.activeLine] + listItemText;
    updateLine(state, state.activeLine, updated);
}

function copyAllContent(state: EditorState, statusMessage: HTMLElement): void {
    const joined = state.lines.join("\n");
    navigator.clipboard.writeText(joined).then(() => {
        statusMessage.textContent = "Copied entire note!";
        setTimeout(() => {
            statusMessage.textContent = "";
        }, 2000);
    }).catch(() => {
        statusMessage.textContent = "Copy failed!";
    });
}

export function getCaretRangeFromPoint(x: number, y: number): Range | null {
    if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y);
    } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(x, y);
        if (pos) {
            const range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            return range;
        }
    }
    return null;
}

export function stripWrappingQuotes(text: string): string {
    const trimmed = text.trim();
    if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
        return trimmed.slice(1, -1).trim();
    }
    const lines = text.split("\n");
    if (lines.length > 0 && lines[0].trim().match(/^['"]$/)) {
        lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1].trim().match(/^['"]$/)) {
        lines.pop();
    }
    return lines.join("\n");
}

export function handleEditorClick(
    event: MouseEvent,
    editorContainer: HTMLElement,
    state: EditorState
): void {
    const target = event.target as HTMLElement;
    const lineDiv = target.closest("[data-line-index]") as HTMLElement | null;
    if (!lineDiv) return;
    const clickedIndex = parseInt(lineDiv.dataset.lineIndex!, 10);
    const caretRange = getCaretRangeFromPoint(event.clientX, event.clientY);
    const caretOffset = caretRange ? caretRange.startOffset : 0;
    if (state.activeLine === clickedIndex) {
        const activeElement = lineDiv;
        activeElement.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        if (activeElement.firstChild && activeElement.firstChild.nodeType === Node.TEXT_NODE) {
            const textLength = activeElement.firstChild.textContent?.length || 0;
            range.setStart(activeElement.firstChild, Math.min(caretOffset, textLength));
        } else {
            range.setStart(activeElement, caretOffset);
        }
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
    } else {
        state.activeLine = clickedIndex;
        renderHybridEditor(editorContainer, state);
        const activeElement = editorContainer.querySelector(
            `[data-line-index="${clickedIndex}"]`
        ) as HTMLElement;
        if (activeElement) {
            activeElement.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            if (activeElement.firstChild && activeElement.firstChild.nodeType === Node.TEXT_NODE) {
                const textLength = activeElement.firstChild.textContent?.length || 0;
                range.setStart(activeElement.firstChild, Math.min(caretOffset, textLength));
            } else {
                range.setStart(activeElement, caretOffset);
            }
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }
}

export function handleEditorInput(event: Event, state: EditorState, statusMessage: HTMLElement): void {
    const target = event.target as HTMLElement;
    if (state.activeLine !== null && target.dataset.lineIndex) {
        const lineIndex = parseInt(target.dataset.lineIndex, 10);
        if (lineIndex === state.activeLine) {
            updateLine(state, state.activeLine, target.textContent || "");
            scheduleSave(state, () => doSave(state, statusMessage));
        }
    }
}

function handleEditorBlur(
    event: FocusEvent,
    editorContainer: HTMLElement,
    state: EditorState,
    statusMessage: HTMLElement
): void {
    const target = event.target as HTMLElement;
    if (state.activeLine !== null && target.dataset.lineIndex) {
        if (parseInt(target.dataset.lineIndex, 10) === state.activeLine) {
            updateLine(state, state.activeLine, target.textContent || "");
            state.activeLine = null;
            renderHybridEditor(editorContainer, state);
            scheduleSave(state, () => doSave(state, statusMessage));
        }
    }
}

export function handleEditorKeyDown(event: KeyboardEvent, editorContainer: HTMLElement, state: EditorState): void {
    if (state.activeLine === null) return;
    if (event.key === "Enter") {
        event.preventDefault();
        const currentElement = editorContainer.querySelector(
            `[data-line-index="${state.activeLine}"]`
        ) as HTMLElement;
        if (!currentElement) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const caretOffset = range.startOffset;
        const currentContent = currentElement.textContent || "";
        const beforeText = currentContent.slice(0, caretOffset);
        const afterText = currentContent.slice(caretOffset);
        state.lines[state.activeLine] = beforeText;
        state.lines.splice(state.activeLine + 1, 0, afterText);
        state.activeLine = state.activeLine + 1;
        renderHybridEditor(editorContainer, state);
        const newActiveElement = editorContainer.querySelector(
            `[data-line-index="${state.activeLine}"]`
        ) as HTMLElement;
        if (newActiveElement) {
            newActiveElement.focus();
            const newRange = document.createRange();
            if (newActiveElement.firstChild) {
                newRange.setStart(newActiveElement.firstChild, 0);
            } else {
                newRange.setStart(newActiveElement, 0);
            }
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        const currentElement = editorContainer.querySelector(
            `[data-line-index="${state.activeLine}"]`
        ) as HTMLElement;
        updateLine(state, state.activeLine, currentElement?.textContent || "");
        if (state.activeLine > 0) {
            state.activeLine--;
            renderHybridEditor(editorContainer, state);
        }
    } else if (event.key === "ArrowDown") {
        event.preventDefault();
        const currentElement = editorContainer.querySelector(
            `[data-line-index="${state.activeLine}"]`
        ) as HTMLElement;
        updateLine(state, state.activeLine, currentElement?.textContent || "");
        if (state.activeLine < state.lines.length - 1) {
            state.activeLine++;
            renderHybridEditor(editorContainer, state);
        }
    }
}

export function bindToolbarButtons(
    state: EditorState,
    editorContainer: HTMLElement,
    statusMessage: HTMLElement
): void {
    const formatButtons = document.querySelectorAll("[data-format]");
    formatButtons.forEach((btn) => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
            const format = btn.getAttribute("data-format")!;
            applyFormatToActiveLine(state, format);
            renderHybridEditor(editorContainer, state);
            scheduleSave(state, () => doSave(state, statusMessage));
        });
    });
    const linkButton = document.getElementById("linkBtn") as HTMLButtonElement;
    linkButton.addEventListener("mousedown", (e) => e.preventDefault());
    linkButton.addEventListener("click", () => {
        insertLinkAtActiveLine(state);
        renderHybridEditor(editorContainer, state);
        scheduleSave(state, () => doSave(state, statusMessage));
    });
    const listButton = document.getElementById("listBtn") as HTMLButtonElement;
    listButton.addEventListener("mousedown", (e) => e.preventDefault());
    listButton.addEventListener("click", () => {
        insertListItemAtActiveLine(state);
        renderHybridEditor(editorContainer, state);
        scheduleSave(state, () => doSave(state, statusMessage));
    });
    const copyButton = document.getElementById("copyBtn") as HTMLButtonElement;
    copyButton.addEventListener("mousedown", (e) => e.preventDefault());
    copyButton.addEventListener("click", () => {
        copyAllContent(state, statusMessage);
    });
    const saveButton = document.getElementById("saveBtn") as HTMLButtonElement;
    saveButton.addEventListener("mousedown", (e) => e.preventDefault());
    saveButton.addEventListener("click", () => {
        doSave(state, statusMessage);
    });
}

function renderHybridEditor(editorContainer: HTMLElement, state: EditorState): void {
    editorContainer.innerHTML = "";
    state.lines.forEach((line, index) => {
        const lineElement = createLineDiv(line, index, state.activeLine);
        editorContainer.appendChild(lineElement);
    });
    if (state.activeLine !== null) {
        const activeElement = editorContainer.querySelector(
            `[data-line-index="${state.activeLine}"]`
        ) as HTMLElement;
        if (activeElement) {
            activeElement.focus();
        }
    }
}

export function initEditor(options: EditorOptions): void {
    const nameDisplay = document.getElementById("note-name-display") as HTMLElement;
    const editorContainer = document.getElementById("hybridEditor") as HTMLElement;
    const statusMessage = document.getElementById("statusMsg") as HTMLElement;
    const cleanNoteName = stripWrappingQuotes(options.noteName);
    const cleanContent = stripWrappingQuotes(options.initialContent);
    nameDisplay.textContent = cleanNoteName;
    const state: EditorState = {
        noteName: cleanNoteName,
        lines: cleanContent.split("\n"),
        activeLine: null,
        isSaving: false,
        saveTimeout: null,
    };
    renderHybridEditor(editorContainer, state);
    editorContainer.addEventListener("click", (e) => {
        handleEditorClick(e, editorContainer, state);
    });
    editorContainer.addEventListener("input", (e) => {
        handleEditorInput(e, state, statusMessage);
    });
    editorContainer.addEventListener(
        "blur",
        (e) => {
            handleEditorBlur(e, editorContainer, state, statusMessage);
        },
        true
    );
    editorContainer.addEventListener("keydown", (e) => {
        handleEditorKeyDown(e, editorContainer, state);
    });
    bindToolbarButtons(state, editorContainer, statusMessage);
}

export function debounce<F extends (...args: any[]) => void>(func: F, wait: number) {
    let timeoutId: number | null = null;
    return (...args: Parameters<F>): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(() => {
            func(...args);
        }, wait);
    };
}

export function createEditorResponse(noteName: string, content: string): Response {
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
       `;
    return new Response(html, {
        headers: { "Content-Type": "text/html" },
    });
}

export function handleEditorRoute(req: Request): Response {
    const url = new URL(req.url);
    const noteName = url.pathname.replace("/editor/", "");
    try {
        const contentPromise = Bun.file(`notes/${noteName}.md`).text();
        return contentPromise.then((content) => {
            const cleanedContent = stripWrappingQuotes(content);
            return createEditorResponse(noteName, cleanedContent);
        });
    } catch {
        return createEditorResponse(noteName, "");
    }
}

export function handleEditorRequest(req: Request): Response {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/editor/")) {
        return handleEditorRoute(req);
    }
    return new Response("Not Found", { status: 404 });
}