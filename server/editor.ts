import { parseMarkdown } from "../markdown-parser/dist/index.js"

export interface EditorOptions {
    noteName: string
    initialContent: string
}

let scheduledAutosaveHandle: number | null = null
const autosaveDelayInMilliseconds = 1000

export function initEditor(options: EditorOptions): void {
    const noteNameDisplayElement = document.getElementById("note-name-display") as HTMLElement
    const textInputElement = document.getElementById("editorTextArea") as HTMLTextAreaElement
    const previewElement = document.getElementById("preview") as HTMLElement
    const saveStatusElement = document.getElementById("save-status") as HTMLElement
    noteNameDisplayElement.textContent = options.noteName
    textInputElement.value = options.initialContent
    textInputElement.addEventListener("input", () => {
        previewElement.innerHTML = parseMarkdown(textInputElement.value)
        if (scheduledAutosaveHandle) {
            clearTimeout(scheduledAutosaveHandle)
        }
        saveStatusElement.textContent = "Saving..."
        scheduledAutosaveHandle = setTimeout(() => persistEditedNoteContentToServer(textInputElement.value), autosaveDelayInMilliseconds)
    })
    function persistEditedNoteContentToServer(editedContent: string) {
        fetch("/notes/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: options.noteName,
                content: editedContent
            })
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Save failed")
                }
                return response
            })
            .then(() => {
                const currentTime = new Date().toLocaleTimeString()
                saveStatusElement.textContent = "Last saved at " + currentTime
                saveStatusElement.style.color = "#4caf50"
            })
            .catch((error) => {
                saveStatusElement.textContent = "Save failed! Check console for details."
                saveStatusElement.style.color = "#f44336"
            })
    }
    previewElement.innerHTML = parseMarkdown(textInputElement.value)
    const formattingButtons = document.querySelectorAll(".md-insert-button") as NodeListOf<HTMLButtonElement>
    formattingButtons.forEach(button => {
        button.addEventListener("click", () => {
            const before = button.dataset.before || ""
            const after = button.dataset.after || ""
            insertMarkdownAroundSelection(textInputElement, previewElement, saveStatusElement, options.noteName, before, after)
        })
    })
}

function insertMarkdownAroundSelection(
    textArea: HTMLTextAreaElement,
    preview: HTMLElement,
    saveStatus: HTMLElement,
    noteName: string,
    before: string,
    after: string
): void {
    const selectionStart = textArea.selectionStart
    const selectionEnd = textArea.selectionEnd
    const originalValue = textArea.value
    const selectedSubstring = originalValue.substring(selectionStart, selectionEnd)
    const combinedValue =
        originalValue.substring(0, selectionStart) +
        before +
        selectedSubstring +
        after +
        originalValue.substring(selectionEnd)
    textArea.value = combinedValue
    textArea.setSelectionRange(selectionStart + before.length, selectionEnd + before.length)
    preview.innerHTML = parseMarkdown(textArea.value)
    if (scheduledAutosaveHandle) {
        clearTimeout(scheduledAutosaveHandle)
    }
    saveStatus.textContent = "Saving..."
    scheduledAutosaveHandle = setTimeout(() => {
        fetch("/notes/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: noteName,
                content: textArea.value
            })
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Save failed")
                }
                return response
            })
            .then(() => {
                const currentTime = new Date().toLocaleTimeString()
                saveStatus.textContent = "Last saved at " + currentTime
                saveStatus.style.color = "#4caf50"
            })
            .catch(() => {
                saveStatus.textContent = "Save failed! Check console for details."
                saveStatus.style.color = "#f44336"
            })
    }, autosaveDelayInMilliseconds)
}