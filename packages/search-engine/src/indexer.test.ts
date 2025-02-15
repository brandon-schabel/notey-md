import { describe, it, expect } from "bun:test";
import {
    extractPlainText,
    tokenize,
    buildIndexForFile,
    removeDocFromIndex,
    computeTermFrequency,
} from "./indexer";
import type { SearchIndex } from "./types";

describe("computeTermFrequency", () => {
    it("should return an empty object for an empty array", () => {
        expect(computeTermFrequency([])).toEqual({});
    });

    it("should correctly count single occurrences", () => {
        expect(computeTermFrequency(["hello"])).toEqual({ hello: 1 });
    });

    it("should correctly count multiple occurrences", () => {
        expect(computeTermFrequency(["hello", "world", "hello"])).toEqual({
            hello: 2,
            world: 1,
        });
    });

    it("should handle mixed case and return lowercase keys", () => {
        expect(computeTermFrequency(["Hello", "World", "hello"])).toEqual({
            hello: 2,
            world: 1,
        });
    });
     it("should handle numbers", () => {
        expect(computeTermFrequency(["123", "456", "123"])).toEqual({
            123: 2,
            456: 1,
        });
    });
});

describe("extractPlainText", () => {
    it("removes code blocks completely", () => {
        const input = `
\`\`\`
function helloWorld() {
console.log("Hello, World!");
}
\`\`\`
`;
        const output = extractPlainText(input);
        expect(output).toBe("");
    });

    it("removes inline code markers but keeps code text", () => {
        const input = "This is \`inline code\` in markdown.";
        const output = extractPlainText(input);
        expect(output).toBe("This is inline code in markdown.");
    });

    it("removes any custom math tags or images (placeholder example)", () => {
        // Using the patterns from your function
        const input = "!$begin:math:display$someMath$end:math:display$$begin:math:text$extra$end:math:text$";
        const output = extractPlainText(input);
        expect(output).toBe("");
    });

    it("removes links but keeps link text", () => {
        // Adjust the test based on your actual patterns used for links
        const input = "$begin:math:display$Google$end:math:display$$begin:math:text$(https://google.com)$end:math:text$";
        const output = extractPlainText(input);
        expect(output).toBe("Google");
    });

    it("removes bold markers but keeps text", () => {
        const input = "**bold** text and ***triple bold*** also **mix**ed**";
        const output = extractPlainText(input);
        expect(output).toBe("bold text and triple bold also mixed");
    });

    it("removes italic markers but keeps text", () => {
        const input = "_italic_ text and __double italic__ also ___triple italic___";
        const output = extractPlainText(input);
        expect(output).toBe("italic text and double italic also triple italic");
    });

    it("trims extra whitespace", () => {
        const input = "   some text   ";
        const output = extractPlainText(input);
        expect(output).toBe("some text");
    });

});

describe("tokenize", () => {
    it("splits text on non-alphanumeric characters", () => {
        const input = "Hello, world! #100DaysOfCode";
        const tokens = tokenize(input);
        expect(tokens).toEqual(["hello", "world", "100daysofcode"]);
    });

    it("returns only tokens of length > 1", () => {
        const input = "A an at I be by me 1 12 ab bc";
        const tokens = tokenize(input);
        // 'A', 'I', '1' are only length 1 -> removed
        expect(tokens).toEqual(["an", "at", "be", "by", "me", "12", "ab", "bc"]);
    });

    it("converts tokens to lowercase", () => {
        const input = "MIXED Case TEXT";
        const tokens = tokenize(input);
        expect(tokens).toEqual(["mixed", "case", "text"]);
    });

    it("returns an empty array when no valid tokens", () => {
        const input = "a _ # *";
        const tokens = tokenize(input);
        expect(tokens).toEqual([]);
    });
});

describe("buildIndexForFile", () => {
    it("adds tokens to the index", () => {
        const index: SearchIndex = {};
        const markdown = "Hello **bold** world. Hello again!";
        buildIndexForFile(markdown, 1, index);

        // After extraction, tokens might be: ["hello", "bold", "world", "hello", "again"]
        // Frequency map for docId=1: {hello: 2, bold: 1, world: 1, again: 1}
        expect(index["hello"]?.get(1)).toBe(2);
        expect(index["bold"]?.get(1)).toBe(1);
        expect(index["world"]?.get(1)).toBe(1);
        expect(index["again"]?.get(1)).toBe(1);
    });

    it("updates an existing docId by removing old tokens first", () => {
        const index: SearchIndex = {};
        const firstMarkdown = "Hello world";
        buildIndexForFile(firstMarkdown, 1, index);
        // "hello" -> 1, "world" -> 1

        // Re-build with different text
        const updatedMarkdown = "Hello updated test";
        buildIndexForFile(updatedMarkdown, 1, index);
        // "hello" -> 1, "updated" -> 1, "test" -> 1
        // "world" should be removed for docId=1

        expect(index["hello"]?.get(1)).toBe(1);
        expect(index["updated"]?.get(1)).toBe(1);
        expect(index["test"]?.get(1)).toBe(1);
        expect(index["world"]?.has(1) ?? false).toBe(false);
    });

    it("does not affect other docIds", () => {
        const index: SearchIndex = {};
        buildIndexForFile("Hello world", 1, index);
        buildIndexForFile("Hello universe", 2, index);

        expect(index["hello"]?.get(1)).toBe(1);
        expect(index["hello"]?.get(2)).toBe(1);
        expect(index["world"]?.get(1)).toBe(1);
        expect(index["universe"]?.get(2)).toBe(1);
    });
});

describe("removeDocFromIndex", () => {
    it("removes all tokens for a given docId", () => {
        const index: SearchIndex = {};
        buildIndexForFile("Hello world", 1, index);
        buildIndexForFile("Another world hello", 2, index);

        // Before removal, docId=1 is in the index for "hello" and "world"
        expect(index["hello"]?.has(1)).toBe(true);
        expect(index["world"]?.has(1)).toBe(true);

        removeDocFromIndex(1, index);

        // After removal, docId=1 should be gone from all tokens
        expect(index["hello"]?.has(1)).toBe(false);
        expect(index["world"]?.has(1)).toBe(false);

        // docId=2 remains
        expect(index["another"]?.has(2)).toBe(true);
        expect(index["world"]?.has(2)).toBe(true);
        expect(index["hello"]?.has(2)).toBe(true);
    });

    it("removes token entries entirely if no docs remain for that token", () => {
        const index: SearchIndex = {};
        buildIndexForFile("Hello", 1, index);

        // Only docId=1 references "hello"
        expect(index["hello"]).toBeDefined();

        removeDocFromIndex(1, index);

        // The "hello" key should be removed entirely since it's empty
        expect(index["hello"]).toBeUndefined();
    });

    it("does nothing if docId is not in the index", () => {
        const index: SearchIndex = {};
        buildIndexForFile("Hello world", 1, index);

        // docId=2 does not exist
        removeDocFromIndex(2, index);

        // Expect the index to remain unchanged
        expect(index["hello"]?.has(1)).toBe(true);
        expect(index["world"]?.has(1)).toBe(true);
    });
});