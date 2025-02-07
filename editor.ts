export function naiveClientMarkdownRender(md: string): string {
    let out = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    out = out.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    out = out.replace(/`([^`]+)`/g, (_, c) => `<code class="inline">${c}</code>`);
    out = out.replace(/\*\*(.*?)\*\*/g, (_, b) => `<strong>${b}</strong>`);
    out = out.replace(/\*(.*?)\*/g, (_, i) => `<em>${i}</em>`);
    out = out.replace(
        /^[-*]\s+\$begin:math:display\$\s*([xX])\s*\$end:math:display\$\s+(.*)$/gm,
        (_, check, text) => {
            const checked = check.toLowerCase() === "x" ? "checked" : "";
            return `<ul><li><label><input type="checkbox" ${checked} disabled> ${text}</label></li></ul>`;
        }
    );
    out = out.replace(/^[-*]\s+(.*)$/gm, `<ul><li>$1</li></ul>`);
    out = out.replace(/^###### (.*)$/gm, `<h6>$1</h6>`);
    out = out.replace(/^##### (.*)$/gm, `<h5>$1</h5>`);
    out = out.replace(/^#### (.*)$/gm, `<h4>$1</h4>`);
    out = out.replace(/^### (.*)$/gm, `<h3>$1</h3>`);
    out = out.replace(/^## (.*)$/gm, `<h2>$1</h2>`);
    out = out.replace(/^# (.*)$/gm, `<h1>$1</h1>`);
    return out.split(/\n\s*\n/g).map((p) => `<p>${p}</p>`).join("\n");
}

function renderLine(line: string, index: number, activeLine: number | null): HTMLDivElement {
    const lineDiv = document.createElement("div");
    lineDiv.dataset.lineIndex = String(index);
    if (index === activeLine) {
        lineDiv.textContent = line;
        lineDiv.contentEditable = "true";
    } else {
        lineDiv.innerHTML = naiveClientMarkdownRender(line);
        lineDiv.contentEditable = "false";
    }
    return lineDiv;
}

export interface EditorOptions {
    noteName: string;
    initialContent: string;
}

export function initEditor(options: EditorOptions): void {
    const { noteName, initialContent } = options;
    const nameDisplay = document.getElementById("note-name-display") as HTMLElement;
    const editorContainer = document.getElementById("hybridEditor") as HTMLElement;
    const statusMessage = document.getElementById("statusMsg") as HTMLElement;
    nameDisplay.textContent = noteName;
    let lines = initialContent.split("\n");
    let activeLine: number | null = null;
    let isSaving = false;
    let saveTimeout: number | null = null;

    function renderHybridEditor(): void {
        editorContainer.innerHTML = "";
        lines.forEach((line, index) => {
            const lineElement = renderLine(line, index, activeLine);
            editorContainer.appendChild(lineElement);
        });
        if (activeLine !== null) {
            const activeElement = editorContainer.querySelector(`[data-line-index="${activeLine}"]`) as HTMLElement;
            if (activeElement) {
                activeElement.focus();
            }
        }
    }

    function updateLine(index: number, newText: string): void {
        lines[index] = newText;
    }

    function handleLineClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const lineDiv = target.closest("[data-line-index]") as HTMLElement | null;
        if (lineDiv) {
            const lineIndex = parseInt(lineDiv.dataset.lineIndex!, 10);
            activeLine = lineIndex;
            renderHybridEditor();
        }
    }

    function handleLineInput(event: Event): void {
        const target = event.target as HTMLElement;
        if (activeLine !== null && target.dataset.lineIndex && parseInt(target.dataset.lineIndex) === activeLine) {
            updateLine(activeLine, target.textContent || "");

            scheduleSave();
        }
    }

    function handleLineBlur(event: FocusEvent): void {
        const target = event.target as HTMLElement;
        if (activeLine !== null && target.dataset.lineIndex && parseInt(target.dataset.lineIndex) === activeLine) {
            updateLine(activeLine, target.textContent || "");
            activeLine = null;
            renderHybridEditor();

            scheduleSave();
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (activeLine === null) return;
        if (event.key === "ArrowUp") {
            event.preventDefault();
            const currentElement = editorContainer.querySelector(`[data-line-index="${activeLine}"]`) as HTMLElement;
            updateLine(activeLine, currentElement.textContent || "");
            if (activeLine > 0) {
                activeLine = activeLine - 1;
                renderHybridEditor();
            }
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            const currentElement = editorContainer.querySelector(`[data-line-index="${activeLine}"]`) as HTMLElement;
            updateLine(activeLine, currentElement.textContent || "");
            if (activeLine < lines.length - 1) {
                activeLine = activeLine + 1;
                renderHybridEditor();
            }
        }
    }

    function scheduleSave(): void {
        if (isSaving) return;
        if (saveTimeout !== null) clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(doSave, 1000);
    }

    function doSave(): void {
        if (isSaving) return;
        isSaving = true;
        const content = lines.join("\n");
        fetch("/notes/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: noteName, content }),
        })
            .then(() => {
                statusMessage.textContent = "Saved at " + new Date().toLocaleTimeString();
                setTimeout(() => {
                    statusMessage.textContent = "";
                }, 3000);
            })
            .catch((error) => {
                console.error("Save error:", error);
                statusMessage.textContent = "Save failed!";
            })
            .finally(() => {
                isSaving = false;
            });
    }

    function applyFormatToActiveLine(format: string): void {
        if (activeLine === null) return;
        let currentLine = lines[activeLine] || "";
        if (format === "```") {
            currentLine = "```\n" + currentLine + "\n```";
        } else if (format === "[ ] ") {
            currentLine = "- [ ] " + currentLine;
        } else {
            currentLine = `${format}${currentLine}${format}`;
        }
        updateLine(activeLine, currentLine);
        renderHybridEditor();
        scheduleSave();
    }

    function insertLinkAtActiveLine(): void {
        if (activeLine === null) return;
        const linkText = "[Link Text](http://example.com)";
        updateLine(activeLine, lines[activeLine] + linkText);
        renderHybridEditor();
        scheduleSave();
    }

    function insertListItemAtActiveLine(): void {
        if (activeLine === null) return;
        const listItemText = "- List item";
        updateLine(activeLine, lines[activeLine] + listItemText);
        renderHybridEditor();
        scheduleSave();
    }

    function copyAll(): void {
        navigator.clipboard
            .writeText(lines.join("\n"))
            .then(() => {
                statusMessage.textContent = "Copied entire note!";
                setTimeout(() => {
                    statusMessage.textContent = "";
                }, 2000);
            })
            .catch((error) => {
                console.error("Copy error:", error);
                statusMessage.textContent = "Copy failed!";
            });
    }

    function setupEventListeners(): void {
        editorContainer.addEventListener("click", handleLineClick);
        editorContainer.addEventListener("input", handleLineInput);
        editorContainer.addEventListener("blur", handleLineBlur, true);
        editorContainer.addEventListener("keydown", handleKeyDown);
        const formatButtons = document.querySelectorAll("[data-format]");
        formatButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const format = btn.getAttribute("data-format")!;
                applyFormatToActiveLine(format);
            });
        });
        const linkButton = document.getElementById("linkBtn") as HTMLButtonElement;
        linkButton.addEventListener("click", insertLinkAtActiveLine);
        const listButton = document.getElementById("listBtn") as HTMLButtonElement;
        listButton.addEventListener("click", insertListItemAtActiveLine);
        const copyButton = document.getElementById("copyBtn") as HTMLButtonElement;
        copyButton.addEventListener("click", copyAll);
        const saveButton = document.getElementById("saveBtn") as HTMLButtonElement;
        saveButton.addEventListener("click", doSave);
    }

    renderHybridEditor()
    setupEventListeners();
}

// Add this type for route handling
type RouteHandler = (req: Request) => Response;

// Add these utility functions at the top level
function createEditorResponse(noteName: string, content: string): Response {
    const html = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Editor - ${noteName}</title>
                <!-- Add your CSS here -->
            </head>
            <body>
                <!-- Add your editor HTML here -->
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        initEditor({
                            noteName: ${JSON.stringify(noteName)},
                            initialContent: ${JSON.stringify(content)}
                        });
                    });
                </script>
            </body>
        </html>
    `;

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html',
        },
    });
}

function handleEditorRoute(req: Request): Response {
    const url = new URL(req.url);
    const noteName = url.pathname.replace('/editor/', '');

    try {
        // Synchronously read the file
        const content = Bun.file(`notes/${noteName}.md`).text();
        return createEditorResponse(noteName, content);
    } catch (error) {
        // If file doesn't exist, create new empty note
        return createEditorResponse(noteName, '');
    }
}

// Export the route handler for use in your main server file
export function handleEditorRequest(req: Request): Response {
    const url = new URL(req.url);

    // Check if this is an editor route
    if (url.pathname.startsWith('/editor/')) {
        return handleEditorRoute(req);
    }

    // Return 404 for unknown routes
    return new Response('Not Found', { status: 404 });
}