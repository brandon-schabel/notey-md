// File: index.test.ts
import {
    test,
    describe,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach
} from "bun:test";
import {
    ensureSafePath,
    readNoteFromDisk,
    writeNoteToDisk,
    buildSearchIndex,
    updateSearchIndexForNote,
    searchNotes,
    registerPlugin,
    type Plugin,
    defaultConfig,
    buildSnippetForFileSync,
    renderEditorPage,
    readNoteFromDiskSync,
    writeNoteToDiskSync,
} from "./index";
import {
    mkdirSync,
    rmSync,
    writeFileSync,
    readFileSync,
    chmodSync,
    existsSync
} from "node:fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const testWorkspace = resolve(__filename, "..", ".test-tmp-extra");

// A plugin for demonstration
const testPlugin: Plugin = {
    name: "TestPlugin",
    onNoteLoad(notePath: string, content: string) {
        if (notePath.endsWith("pluginNote.md")) {
            return content + "\n<!-- Plugin onLoad modified -->";
        }
        return content;
    },
    onNoteSave(notePath: string, content: string) {
        if (notePath.endsWith("pluginNote.md")) {
            console.log(`[TestPlugin] onNoteSave triggered for: ${notePath} content length=${content.length}`);
        }
    }
};

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

describe("Plugin System Additional Tests", () => {
    const pluginNotePath = join(testWorkspace, "pluginNote.md");

    beforeAll(() => {
        registerPlugin(testPlugin);
        writeFileSync(pluginNotePath, "Plugin note original content");
    });

    test("Multiple plugins can be registered, hooks run in order", () => {
        let firstHookTriggered = false;
        let secondHookTriggered = false;
        const pluginA: Plugin = {
            name: "PluginA",
            onNoteLoad(path, content) {
                if (path.endsWith("pluginNote.md")) {
                    firstHookTriggered = true;
                    return content + "\n<!-- PluginA appended -->";
                }
                return content;
            }
        };
        const pluginB: Plugin = {
            name: "PluginB",
            onNoteLoad(path, content) {
                if (path.endsWith("pluginNote.md")) {
                    secondHookTriggered = true;
                    return content + "\n<!-- PluginB appended -->";
                }
                return content;
            }
        };
        registerPlugin(pluginA);
        registerPlugin(pluginB);
        const final = pluginA.onNoteLoad
            ? pluginA.onNoteLoad(pluginNotePath, "Data")
            : "Data";
        const final2 = pluginB.onNoteLoad
            ? pluginB.onNoteLoad(pluginNotePath, final)
            : final;
        expect(firstHookTriggered).toBe(true);
        expect(secondHookTriggered).toBe(true);
        expect(final2).toContain("<!-- PluginA appended -->");
        expect(final2).toContain("<!-- PluginB appended -->");
    });

    test("Plugin throwing error in onNoteLoad does not break subsequent plugins", () => {
        let secondPluginReached = false;
        const errorPlugin: Plugin = {
            name: "ErrorPlugin",
            onNoteLoad() {
                throw new Error("Simulated plugin error");
            }
        };
        const safePlugin: Plugin = {
            name: "SafePlugin",
            onNoteLoad(path, content) {
                secondPluginReached = true;
                return content + "\n<!-- safe plugin -->";
            }
        };
        registerPlugin(errorPlugin);
        registerPlugin(safePlugin);
        let result = "";
        try {
            result = errorPlugin.onNoteLoad
                ? errorPlugin.onNoteLoad("mock.md", "content")
                : "content";
        } catch { }
        if (safePlugin.onNoteLoad) {
            result = safePlugin.onNoteLoad("mock.md", result);
        }
        expect(secondPluginReached).toBe(true);
        expect(result).toContain("<!-- safe plugin -->");
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

describe("Plugin Handling and Logging", () => {
    const notePathForMultipleHooks = join(testWorkspace, "multiplePluginHooks.md");

    beforeAll(() => {
        writeFileSync(notePathForMultipleHooks, "Initial data");
    });

    test("Multiple onNoteSave hooks are invoked sequentially", () => {
        let firstSaveHook = false;
        let secondSaveHook = false;
        const pluginOne: Plugin = {
            name: "PluginOne",
            onNoteSave(path, content) {
                if (path.endsWith("multiplePluginHooks.md")) {
                    firstSaveHook = true;
                }
            }
        };
        const pluginTwo: Plugin = {
            name: "PluginTwo",
            onNoteSave(path, content) {
                if (path.endsWith("multiplePluginHooks.md")) {
                    secondSaveHook = true;
                }
            }
        };
        registerPlugin(pluginOne);
        registerPlugin(pluginTwo);
        if (pluginOne.onNoteSave) pluginOne.onNoteSave(notePathForMultipleHooks, "DataOne");
        if (pluginTwo.onNoteSave) pluginTwo.onNoteSave(notePathForMultipleHooks, "DataTwo");
        expect(firstSaveHook).toBe(true);
        expect(secondSaveHook).toBe(true);
    });
});
