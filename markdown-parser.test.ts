import { parseMarkdown } from "./markdown-parser";

/* ===========================
   editor.test.ts
   =========================== */
import { initEditor, type EditorState, } from "./editor";

/* ===========================
   editor.edge.test.ts
   =========================== */
import { test, describe, expect, beforeEach, afterEach, mock } from "bun:test";
import {
    createLineDiv,
    updateLine,

} from "./editor";

describe("Edge Case Tests for parseMarkdown", () => {
    test("Escapes HTML special characters and wraps in paragraph", () => {
        const input = "a & b < c > d";
        const expected = "<p>a &amp; b &lt; c &gt; d</p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts code blocks", () => {
        const input = "```console.log('hello');```";
        const expected = "<p><pre><code>console.log('hello');</code></pre></p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts inline code", () => {
        const input = "This is `inline` code";
        const expected = "<p>This is <code class=\"inline\">inline</code> code</p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts bold text", () => {
        const input = "This is **bold** text";
        const expected = "<p>This is <strong>bold</strong> text</p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts italic text", () => {
        const input = "This is *italic* text";
        const expected = "<p>This is <em>italic</em> text</p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts math display checkbox with lowercase x", () => {
        const input = "- $begin:math:display$ x $end:math:display$ Math content";
        const expected = "<p><ul><li><label><input type=\"checkbox\" checked disabled> Math content</label></li></ul></p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts math display checkbox with uppercase X", () => {
        const input = "* $begin:math:display$ X $end:math:display$ Another math";
        const expected = "<p><ul><li><label><input type=\"checkbox\" checked disabled> Another math</label></li></ul></p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts bullet lists", () => {
        const input = "- Item one\n- Item two";
        const expected = "<p><ul><li>Item one</li></ul>\n<ul><li>Item two</li></ul></p>";
        expect(parseMarkdown(input)).toBe(expected);
    });

    test("Converts headers", () => {
        const input = "# Header1\n## Header2\n### Header3\n#### Header4\n##### Header5\n###### Header6";
        const expected =
            "<p><h1>Header1</h1>\n<h2>Header2</h2>\n<h3>Header3</h3>\n<h4>Header4</h4>\n<h5>Header5</h5>\n<h6>Header6</h6></p>";
        expect(parseMarkdown(input)).toBe(expected);
    });
});

describe("Edge Case Tests for createLineDiv", () => {
    test("Creates an active line div with contentEditable true", () => {
        const lineContent = "Active line";
        const activeIndex = 0;
        const div = createLineDiv(lineContent, 0, activeIndex);
        expect(div.dataset.lineIndex).toBe("0");
        expect(div.contentEditable).toBe("true");
        expect(div.textContent).toBe(lineContent);
    });

    test("Creates an inactive line div with parsed markdown", () => {
        const lineContent = "**Bold text**";
        const div = createLineDiv(lineContent, 1, 0);
        expect(div.dataset.lineIndex).toBe("1");
        expect(div.contentEditable).toBe("false");
        expect(div.innerHTML).toBe(parseMarkdown(lineContent));
    });
});

describe("Edge Case Tests for updateLine", () => {
    test("Updates the line content in state", () => {
        const state: EditorState = {
            noteName: "Test",
            lines: ["Line 1", "Line 2"],
            activeLine: 0,
            isSaving: false,
            saveTimeout: null,
        };
        updateLine(state, 1, "Updated Line 2");
        expect(state.lines[1]).toBe("Updated Line 2");
    });
});


test("Blurring from a line sets active line to null", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.contentEditable).toBe("true");
    const blurEvent = new Event("blur", { bubbles: true });
    line1.dispatchEvent(blurEvent);
    const allLines = editor.querySelectorAll("[data-line-index]");
    allLines.forEach((line) => {
        expect((line as HTMLElement).contentEditable).toBe("false");
    });
});

test("applyFormatToActiveLine bolds the active line", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    const boldButton = document.querySelector("[data-format='**']") as HTMLButtonElement;
    boldButton.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.textContent).toBe("**Initial line 1**");
});

test("insertLinkAtActiveLine adds a link to the active line", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    const linkButton = document.getElementById("linkBtn") as HTMLButtonElement;
    linkButton.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.textContent).toBe("Initial line 1[Link Text](http://example.com)");
});

test("insertListItemAtActiveLine adds a list item to the active line", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    const listButton = document.getElementById("listBtn") as HTMLButtonElement;
    listButton.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.textContent).toBe("Initial line 1- List item");
});

test("Clicking copy button copies content", async () => {
    const copyButton = document.getElementById("copyBtn") as HTMLButtonElement;
    const mockWriteText = mock(() => Promise.resolve());

    // Create a proper mock that tracks calls
    const calls: string[] = [];
    const clipboardMock = {
        writeText: (text: string) => {
            calls.push(text);
            return Promise.resolve();
        }
    };

    Object.defineProperty(navigator, "clipboard", {
        value: clipboardMock,
        writable: true,
    });

    copyButton.click();
    await Promise.resolve();

    expect(calls[0]).toBe("Initial line 1\nInitial line 2");
});

test("Clicking save button calls fetch", async () => {
    const saveButton = document.getElementById("saveBtn") as HTMLButtonElement;
    const mockFetch = mock(() => Promise.resolve(new Response()));
    global.fetch = mockFetch;
    saveButton.click();
    await Promise.resolve();
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
});

test("applyFormatToActiveLine correctly inserts checkbox", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    const checkboxButton = document.querySelector("[data-format='[ ] ']") as HTMLButtonElement;
    checkboxButton.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.textContent).toBe("- [ ] Initial line 1");
});

test("applyFormatToActiveLine correctly inserts code block", () => {
    const editor = document.getElementById("hybridEditor")!;
    let line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    line1.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    const codeBlockButton = document.querySelector("[data-format='```']") as HTMLButtonElement;
    codeBlockButton.click();
    line1 = editor.querySelector("[data-line-index='0']") as HTMLElement;
    expect(line1.textContent).toContain("```");
});
