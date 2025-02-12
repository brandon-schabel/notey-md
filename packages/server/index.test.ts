import {
    test,
    describe,
    expect,
    beforeAll,
    afterAll
} from "bun:test";
import {
    ensureSafePath,
    readNoteFromDisk,
    writeNoteToDisk,
    buildSearchIndex,
    updateSearchIndexForNote,
    searchNotes,
    defaultConfig,
    buildSnippetForFileSync,
    renderEditorPage,
    readNoteFromDiskSync,
    writeNoteToDiskSync
} from "./index";
import {
    mkdirSync,
    rmSync,
    writeFileSync,
    readFileSync,
    existsSync
} from "node:fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const testWorkspace = resolve(__filename, "..", ".test-tmp-extra");

describe("File System Setup and Teardown", () => {
    beforeAll(() => {
        try {
            rmSync(testWorkspace, { recursive: true, force: true });
        } catch { }
        mkdirSync(testWorkspace, { recursive: true });
    });

    afterAll(() => {
        try {
            rmSync(testWorkspace, { recursive: true, force: true });
        } catch { }
    });

    test("Test workspace is writable", () => {
        const testFile = join(testWorkspace, "check.txt");
        writeFileSync(testFile, "data", "utf8");
        expect(existsSync(testFile)).toBe(true);
        rmSync(testFile);
    });
});

describe("File System Additional Edge Cases", () => {
    const unusualFilePath = join(testWorkspace, "unusualChars.md");

    afterAll(() => {
        try {
            rmSync(unusualFilePath);
        } catch { }
    });

    test("Reading and writing unusual characters is lossless", async () => {
        const data = "Emoji: 🐱‍👓 \nNonLatin: 你好 \nSymbols: ©®™";
        await writeNoteToDisk(unusualFilePath, data);
        const readData = await readNoteFromDisk(unusualFilePath);
        expect(readData).toBe(data);
    });

    test("writeNoteToDiskSync and readNoteFromDiskSync with emojis", () => {
        const data = "Sync version test 🧩∞";
        writeNoteToDiskSync(unusualFilePath, data);
        const readData = readNoteFromDiskSync(unusualFilePath);
        expect(readData).toBe(data);
    });
});

describe("Search Index Additional Cases", () => {
    const searchVaultPath = join(testWorkspace, "largeSearchVault");
    const noteXPath = join(searchVaultPath, "noteX.md");
    const noteYPath = join(searchVaultPath, "noteY.md");

    beforeAll(async () => {
        mkdirSync(searchVaultPath, { recursive: true });
        writeFileSync(noteXPath, "Mixed case Token. Another line.\nMore tokens here", "utf8");
        writeFileSync(noteYPath, "Multiple tokens appear. token, TOKEN, TokEn", "utf8");
        await buildSearchIndex({ ...defaultConfig, vaultPath: searchVaultPath });
    });

    afterAll(() => {
        rmSync(searchVaultPath, { recursive: true, force: true });
    });

    test("Case-insensitive search matches various capitalizations", async () => {
        const result = await searchNotes("toKen");
        expect(result.length).toBe(2);
    });

    test("Multiple tokens in query with no intersection => empty result", async () => {
        const result = await searchNotes("Mixed NotFoundWord");
        expect(result.length).toBe(0);
    });

    test("Extra spaces in query are ignored", async () => {
        const result = await searchNotes("   Mixed      case    ");
        expect(result.length).toBe(1);
        expect(result[0].notePath).toBe(noteXPath);
    });
});

describe("Editor and HTML Rendering", () => {
    test("renderEditorPage inserts the correct placeholders", () => {
        const name = "TestNote.md";
        const content = "# Test Title\n\nContent";
        const html = renderEditorPage(name, content);
        expect(html).toContain(`initEditor({ noteName:`);
        expect(html).toContain("<span id=\"note-name-display\">");
        expect(html).toContain("Test Title");
    });

    test("renderEditorPage throws if editor.html is missing (mocking readFileSync)", () => {
        const originalRead = readFileSync;
        let errorMessage = "";
        (globalThis as any).readFileSync = () => {
            throw new Error("Mocked missing file");
        };
        try {
            renderEditorPage("someNote", "someContent");
        } catch (err: any) {
            errorMessage = String(err);
        } finally {
            (globalThis as any).readFileSync = originalRead;
        }
        expect(errorMessage).toMatch(/Mocked missing file/);
    });
});

describe("Concurrent File Operations", () => {
    test("Simultaneous reads and writes do not corrupt file", async () => {
        const concurrencyFile = join(testWorkspace, `concurrent-${randomUUID()}.md`);
        const dataA = "Content A";
        const dataB = "Content B";
        const writeA = writeNoteToDisk(concurrencyFile, dataA);
        const writeB = writeNoteToDisk(concurrencyFile, dataB);
        await Promise.all([writeA, writeB]);
        const finalContent = await readNoteFromDisk(concurrencyFile);
        expect([dataA, dataB]).toContain(finalContent);
    });
});

describe("Boundary and Error Handling", () => {
    test("ensureSafePath with absolute path pointing inside vault is allowed", () => {
        const baseDir = join(testWorkspace, "vaultTest");
        mkdirSync(baseDir, { recursive: true });
        const abs = resolve(baseDir, "myNote.md");
        const safe = ensureSafePath(abs, baseDir);
        expect(safe).toBe(abs);
    });

    test("searchNotes returns empty array if token not found", () => {
        const results = searchNotes("nonexistenttoken");
        expect(results.length).toBe(0);
    });
});

describe("Snippet Building Additional Cases", () => {
    test("Snippet is truncated properly for long lines", async () => {
        const longLine = "myQuery " + "x".repeat(300);
        const filePath = join(testWorkspace, "longSnippet.md");
        writeFileSync(filePath, longLine);
        const snippet = await buildSnippetForFileSync(filePath, "myQuery");
        expect(snippet.length).toBeLessThanOrEqual(104);
        expect(snippet.endsWith("...")).toBe(true);
    });

    test("Snippet falls back to first line if token not found", async () => {
        const lines = `LineOne
    LineTwoPlain
    LineThreePlain
    `;
        const filePath = join(testWorkspace, "fallbackSnippet.md");
        writeFileSync(filePath, lines);
        const snippet = await buildSnippetForFileSync(filePath, "nomatch");
        expect(snippet).toContain("LineOne");
    });
});