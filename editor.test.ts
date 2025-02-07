import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { initEditor, naiveClientMarkdownRender } from "./editor";

function createMockDOM(): void {
    document.body.innerHTML = `
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
    `;
}

describe("Editor Functionality", () => {
    beforeEach(() => {
        createMockDOM();
        initEditor({ noteName: "Test Note", initialContent: "Initial line 1\nInitial line 2" });
        global.fetch = (input: RequestInfo, init?: RequestInit) =>
            Promise.resolve(new Response(null, { status: 200 }));
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("Clicking a line sets it as active", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query the element after re-rendering
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.contentEditable).toBe("true");
        expect(line1.textContent).toBe("Initial line 1");
    });

    test("Clicking a different line changes active line", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        let line2 = editor.querySelector("[data-line-index='1']") as HTMLElement;
        line1.click();
        // Re-query after first click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line2 = editor.querySelector("[data-line-index='1']") as HTMLElement;
        expect(line1.contentEditable).toBe("true");
        expect(line2.contentEditable).toBe("false");
        line2.click();
        // Re-query after second click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line2 = editor.querySelector("[data-line-index='1']") as HTMLElement;
        expect(line1.contentEditable).toBe("false");
        expect(line2.contentEditable).toBe("true");
    });

    test("Editing an active line updates the content", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.textContent = "Updated line 1";
        const event = new Event("input", { bubbles: true });
        line1.dispatchEvent(event);
    });

    test("Blurring from a line sets active line to null", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.contentEditable).toBe("true");
        const blurEvent = new Event("blur", { bubbles: true });
        line1.dispatchEvent(blurEvent);
        // Re-query all lines after blur
        const allLines = editor.querySelectorAll("[data-line-index]");
        allLines.forEach((line) => {
            expect((line as HTMLElement).contentEditable).toBe("false");
        });
    });

    test("applyFormatToActiveLine bolds the active line", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        const boldButton = document.querySelector("[data-format='**']") as HTMLButtonElement;
        boldButton.click();
        // Re-query after formatting
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.textContent).toBe("**Initial line 1**");
    });

    test("insertLinkAtActiveLine adds a link to the active line", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        const linkButton = document.getElementById("linkBtn") as HTMLButtonElement;
        linkButton.click();
        // Re-query after inserting link
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.textContent).toBe("Initial line 1[Link Text](http://example.com)");
    });

    test("insertListItemAtActiveLine adds a list item to the active line", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        const listButton = document.getElementById("listBtn") as HTMLButtonElement;
        listButton.click();
        // Re-query after inserting list item
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.textContent).toBe("Initial line 1- List item");
    });

    test("Clicking copy button copies content", async () => {
        const copyButton = document.getElementById("copyBtn") as HTMLButtonElement;
        const mockWriteText = mock(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText: mockWriteText },
            writable: true,
        });
        copyButton.click();
        // Allow a tick for the promise to resolve
        await Promise.resolve();
        expect(mockWriteText.mock.calls[0][0]).toBe("Initial line 1\nInitial line 2");
    });

    test("Clicking save button calls fetch", async () => {
        const saveButton = document.getElementById("saveBtn") as HTMLButtonElement;
        const mockFetch = mock(() => Promise.resolve(new Response()));
        global.fetch = mockFetch;
        saveButton.click();
        // Allow a tick for any async operations
        await Promise.resolve();
        expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });

    test("applyFormatToActiveLine correctly inserts checkbox", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        const checkboxButton = document.querySelector("[data-format='[ ] ']") as HTMLButtonElement;
        checkboxButton.click();
        // Re-query after formatting
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.textContent).toBe("- [ ] Initial line 1");
    });

    test("applyFormatToActiveLine correctly inserts code block", () => {
        const editor = document.getElementById("hybridEditor")!;
        let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        line1.click();
        // Re-query after click
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        const codeBlockButton = document.querySelector("[data-format='```']") as HTMLButtonElement;
        codeBlockButton.click();
        // Re-query after formatting
        line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
        expect(line1.textContent).toContain("```");
    });
});

test("naiveClientMarkdownRender converts markdown to HTML", () => {
    const md = "# Heading\n\n**Bold Text**\n\n*Italic Text*\n\n`inline code`\n\n```code block```";
    const html = naiveClientMarkdownRender(md);
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>Bold Text</strong>");
    expect(html).toContain("<em>Italic Text</em>");
    expect(html).toContain("<code class=\"inline\">inline code</code>");
    expect(html).toContain("<pre><code>code block</code></pre>");
});


describe("Editor Initialization Edge Cases", () => {
    beforeEach(() => {
        createMockDOM();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("initEditor with empty content should not crash", () => {
        initEditor({ noteName: "EmptyNote", initialContent: "" });
        const editor = document.getElementById("hybridEditor")!;
        const lines = editor.querySelectorAll("[data-line-index]");
        // Expect either zero or one line, depending on how you prefer to handle empty input
        expect(lines.length).toBe(1);
        // Or if you prefer to show nothing for empty content:
        // expect(lines.length).toBe(0);
    });
});