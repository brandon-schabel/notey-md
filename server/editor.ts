import { parseMarkdown } from "../markdown-parser/dist/index.js";

export interface EditorOptions {
    noteName: string;
    initialContent: string;
}

let saveTimeout: number | null = null;
const SAVE_DELAY = 1000; // 1 second delay for autosave

export function initEditor(options: EditorOptions): void {
    const nameDisplay = document.getElementById("note-name-display") as HTMLElement;
    const textArea = document.getElementById("editorTextArea") as HTMLTextAreaElement;
    const preview = document.getElementById("preview") as HTMLElement;
    const saveStatus = document.getElementById("save-status") as HTMLElement;

    // Set the note name and initial content (values are already properly parsed)
    nameDisplay.textContent = options.noteName;
    textArea.value = options.initialContent;

    // Setup autosave
    textArea.addEventListener('input', () => {
        // Update preview
        preview.innerHTML = parseMarkdown(textArea.value);
        
        // Schedule save
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        saveStatus.textContent = 'Saving...';
        saveTimeout = setTimeout(() => saveContent(textArea.value), SAVE_DELAY);
    });

    async function saveContent(content: string) {
        try {
            const response = await fetch("/notes/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: options.noteName,
                    content: content
                })
            });

            if (!response.ok) {
                throw new Error(`Save failed: ${response.statusText}`);
            }

            const now = new Date().toLocaleTimeString();
            saveStatus.textContent = `Last saved at ${now}`;
            saveStatus.style.color = '#4caf50'; // Green color for success
        } catch (error) {
            console.error('Save failed:', error);
            saveStatus.textContent = 'Save failed! Check console for details.';
            saveStatus.style.color = '#f44336'; // Red color for error
        }
    }

    // Initial preview render
    preview.innerHTML = parseMarkdown(textArea.value);
}