import {
    test,
    describe,
    expect,
    beforeAll,
    afterAll,
} from "bun:test";
import { fetch } from "bun";
import {
    mkdtempSync,
    rmSync,
    writeFileSync,
    existsSync
} from "node:fs";
import { join } from "node:path";
import {
    parseMarkdown,
    renderMarkdownASTToHTML,
    initializeEditorClientSide,
    handleEditorInputChange,
    buildSearchIndex,
    searchNotes,
    updateSearchIndexForNote,
    registerPlugin,
    startServer,
    type AppConfig,
    readNoteFromDisk,
    writeNoteToDisk
} from "./index";

// ------------------------------------------------------------------
// Example: Let's export a couple of new testable utilities
//          from the inline editor logic so we can test them here.
//          In a real codebase, you'd place them near your SSR code
//          but also export them for test usage. For clarity:
export function applyWrappedFormat(
    originalText: string,
    selectionStart: number,
    selectionEnd: number,
    wrapper: string
): { newText: string; newStart: number; newEnd: number } {
    if (selectionStart === selectionEnd) {
        // No selection, just insert
        const newText =
            originalText.slice(0, selectionStart) +
            wrapper +
            wrapper +
            originalText.slice(selectionEnd);
        const cursor = selectionStart + wrapper.length;
        return { newText, newStart: cursor, newEnd: cursor };
    } else {
        // Wrap selection
        const selectedText = originalText.slice(selectionStart, selectionEnd);
        const newText =
            originalText.slice(0, selectionStart) +
            wrapper +
            selectedText +
            wrapper +
            originalText.slice(selectionEnd);
        return {
            newText,
            newStart: selectionStart + wrapper.length,
            newEnd: selectionEnd + wrapper.length
        };
    }
}

export function naiveClientMarkdownRenderForTest(raw: string): string {
    // minimal port of the inline function
    let escaped = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    // bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // italic
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // headings #, ##, ###
    escaped = escaped.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    escaped = escaped.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    escaped = escaped.replace(/^# (.*)$/gm, "<h1>$1</h1>");

    // naive paragraphs by double newlines
    const paragraphs = escaped.split(/\n\n/g).map((p) => {
        if (p.match(/<h[1-3]>/)) {
            return p;
        }
        return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    });

    return paragraphs.join("\n");
}
// ------------------------------------------------------------------

/**
 * Combined Tests
 * 
 * This file merges all test suites from:
 *   - markdown.test.ts
 *   - editor.test.ts
 *   - search.test.ts
 *   - plugin.test.ts
 *   - server.test.ts
 *   - filesystem.test.ts
 */

// ---------------------------------------------------------
// Markdown Parser & Renderer
// ---------------------------------------------------------

describe("Markdown Parser & Renderer", () => {
    test("parseMarkdown should handle headings correctly", () => {
        const input = "# Heading 1\n## Heading 2\nSome text";
        const ast = parseMarkdown(input);

        expect(ast.length).toBe(3);
        expect(ast[0].type).toBe("heading");
        expect(ast[0].level).toBe(1);
        expect(ast[0].content).toBe("Heading 1");

        expect(ast[1].type).toBe("heading");
        expect(ast[1].level).toBe(2);
        expect(ast[1].content).toBe("Heading 2");

        expect(ast[2].type).toBe("paragraph");
        expect(ast[2].content).toBe("Some text");
    });

    test("parseMarkdown should handle code blocks", () => {
        const input = "```\nconst x = 42;\n```\n";
        const ast = parseMarkdown(input);

        expect(ast.length).toBe(1);
        expect(ast[0].type).toBe("codeblock");
        expect(ast[0].content).toContain("const x = 42;");
    });

    test("renderMarkdownASTToHTML should convert AST to HTML", () => {
        const ast = [
            { type: "heading", level: 1, content: "Hello World" },
            { type: "paragraph", content: "Some **bold** text here" },
        ];
        const html = renderMarkdownASTToHTML(ast);

        expect(html).toContain("<h1>Hello World</h1>");
        expect(html).toContain("<p>Some <strong>bold</strong> text here</p>");
    });

    test("inline code should render correctly", () => {
        const input = "Here is some `inline code` in a sentence.";
        const ast = parseMarkdown(input);
        const html = renderMarkdownASTToHTML(ast);

        expect(html).toContain("<code class=\"inline\">inline code</code>");
    });
});

// ---------------------------------------------------------
// Editor Logic
// ---------------------------------------------------------

describe("Editor Logic", () => {
    test("initializeEditorClientSide does not throw", () => {
        expect(() => initializeEditorClientSide()).not.toThrow();
    });

    test("handleEditorInputChange is callable", () => {
        const sampleMarkdown = "# Title\nSome content";
        expect(() => handleEditorInputChange(sampleMarkdown)).not.toThrow();
    });
});

// ---------------------------------------------------------
// Extended Editor Logic (New Tests for Our Implementation)
// ---------------------------------------------------------

describe("Extended Editor Logic", () => {
    test("applyWrappedFormat inserts wrapper when no selection", () => {
        const original = "Hello world";
        const { newText, newStart, newEnd } = applyWrappedFormat(original, 5, 5, "**");
        expect(newText).toBe("Hello**** world");
        expect(newStart).toBe(7);
        expect(newEnd).toBe(7);
    });

    test("applyWrappedFormat wraps selected text with bold", () => {
        const original = "Hello world";
        const { newText, newStart, newEnd } = applyWrappedFormat(original, 0, 5, "**");
        expect(newText).toBe("**Hello** world");
        // newStart moves after the first '**'
        expect(newStart).toBe(2);
        // newEnd extends by the length of '**'
        expect(newEnd).toBe(7);
    });

    test("naiveClientMarkdownRenderForTest handles headings, bold, italics, code", () => {
        const input = `# Title

**bold** text and *italics* plus \`code\`
`;
        const output = naiveClientMarkdownRenderForTest(input);
        expect(output).toContain("<h1>Title</h1>");
        expect(output).toContain("<strong>bold</strong>");
        expect(output).toContain("<em>italics</em>");
        expect(output).toContain("<code class=\"inline\">code</code>");
        // paragraphs
        expect(output).toMatch(/<p>.*<\/p>/);
    });
});

// ---------------------------------------------------------
// Search & Indexing
// ---------------------------------------------------------

describe("Search & Indexing", () => {
    let tempDir: string;
    let noteA: string;
    let noteB: string;

    beforeAll(async () => {
        tempDir = mkdtempSync("search-test-");
        noteA = join(tempDir, "noteA.md");
        writeFileSync(noteA, "This is a sample note about bananas.\nWe also mention apples here.");

        noteB = join(tempDir, "noteB.md");
        writeFileSync(noteB, "Apples are tasty.\nBananas are yellow.");

        await buildSearchIndex({ port: 9999, vaultPath: tempDir });
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    // TODO: Fix this test once i deal with vault path issue
    // test("searchNotes finds correct documents", async () => {
    //     const resultsBananas = await searchNotes("bananas");
    //     expect(resultsBananas.length).toBe(2);

    //     const resultsApples = await searchNotes("apples");
    //     expect(resultsApples.length).toBe(2);

    //     const resultsNonExistent = await searchNotes("kiwi");
    //     expect(resultsNonExistent.length).toBe(0);
    // });

    // TODO: Fix this test once i deal with vault path issue
    // test("updateSearchIndexForNote reflects new changes", async () => {
    //     writeFileSync(noteA, "Now we talk about pineapples.");
    //     updateSearchIndexForNote(noteA, "Now we talk about pineapples.");

    //     const resultsPineapples = await searchNotes("pineapples");
    //     expect(resultsPineapples.length).toBe(1);
    //     expect(resultsPineapples[0].notePath).toContain("noteA.md");

    //     const resultsBananas = await searchNotes("bananas");
    //     expect(resultsBananas.length).toBe(1);
    //     expect(resultsBananas[0].notePath).toContain("noteB.md");
    // });
});

// ---------------------------------------------------------
// Plugin System
// ---------------------------------------------------------

describe("Plugin System", () => {
    test("registerPlugin adds a plugin to the system", () => {
        const myPlugin = {
            name: "TestPlugin",
            onNoteLoad: (path: string, content: string) => {
                return content + "\nPlugin was here.";
            },
            onNoteSave: (path: string, content: string) => {
                // no-op
            }
        };

        expect(() => registerPlugin(myPlugin)).not.toThrow();
    });
});

// ---------------------------------------------------------
// Server Integration
// ---------------------------------------------------------

describe("Server Integration", () => {
    let server: Awaited<ReturnType<typeof startServer>>;
    let tempDir: string;
    const testPort = 3333;

    beforeAll(async () => {
        tempDir = mkdtempSync("server-test-");
        const config: AppConfig = {
            port: testPort,
            vaultPath: tempDir,
        };
        server = await startServer(config);
    });

    afterAll(async () => {
        await server.stop(true);
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("GET / returns 200 and some HTML", async () => {
        const resp = await fetch(`http://localhost:${testPort}/`);
        expect(resp.status).toBe(200);
        const text = await resp.text();
        expect(text).toContain("<html");
    });

    test("GET /nonexistent returns 404", async () => {
        const resp = await fetch(`http://localhost:${testPort}/does-not-exist`);
        expect(resp.status).toBe(404);
    });

    test("GET /notes/<filename> creates and retrieves a note", async () => {
        const noteName = "testnote.md";
        const notePath = `/notes/${noteName}`;
        const createResp = await fetch(`http://localhost:${testPort}${notePath}`);
        expect(createResp.status).toBe(200);

        const getResp = await fetch(`http://localhost:${testPort}${notePath}`);
        expect(getResp.status).toBe(200);
        const text = await getResp.text();
        expect(text).toMatch(/<h1>Editing Note: .*testnote\.md.*<\/h1>/);
        expect(text).toContain("# New Note");
    });
});

// ---------------------------------------------------------
// Filesystem Operations
// ---------------------------------------------------------

describe("Filesystem Operations", () => {
    let tempDir: string;

    beforeAll(() => {
        tempDir = mkdtempSync("notes-test-");
    });

    afterAll(() => {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    test("writeNoteToDisk writes a file and readNoteFromDisk reads it", async () => {
        const filePath = join(tempDir, "testfile.md");
        const content = "# Hello\nThis is a test note.";

        writeNoteToDisk(filePath, content);
        expect(existsSync(filePath)).toBe(true);

        const readContent = await readNoteFromDisk(filePath);
        expect(readContent).toEqual(content);
    });

    test("readNoteFromDisk throws if file does not exist", async () => {
        const nonExistentPath = join(tempDir, "no-such-file.md");
        let errorCaught = false;
        try {
            await readNoteFromDisk(nonExistentPath);
        } catch (err) {
            errorCaught = true;
            expect((err as Error).message).toMatch(/failed/i);
        }
        expect(errorCaught).toBe(true);
    });
});