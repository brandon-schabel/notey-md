import type { ThematicBreakNode, DocumentNode, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, canContainLine, isThematicBreak, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode } from "./test-helpers";

describe("blockPhase - Thematic Breaks", () => {
    test("should parse a thematic break", () => {
        const doc = blockPhase("---");
        expect(doc.children.length).toBe(1);
        expect(doc.children[0].type).toBe("thematic_break");
    });
});

describe("canContainLine - Thematic Breaks", () => {
    const thematicBreakNode: ThematicBreakNode = {
        type: "thematic_break"
    };
    test("should return false for a thematic break node on additional lines", () => {
        expect(canContainLine(thematicBreakNode, "some text", 0)).toBe(false);
        expect(canContainLine(thematicBreakNode, "", 0)).toBe(false);
    });
});

describe("isThematicBreak", () => {
    test("returns true for lines that match *** or --- or ___ with 3+ symbols", () => {
        expect(isThematicBreak("***")).toBe(true);
        expect(isThematicBreak("****")).toBe(true);
        expect(isThematicBreak("___")).toBe(true);
        expect(isThematicBreak("---")).toBe(true);
        expect(isThematicBreak("-----")).toBe(true);
    });

    test("returns false for lines with fewer than 3 symbols or with mixed chars", () => {
        expect(isThematicBreak("**")).toBe(false);
        expect(isThematicBreak("**-")).toBe(false);
        expect(isThematicBreak("--")).toBe(false);
        expect(isThematicBreak("- - -")).toBe(true); // spaced out still counts if it collapses to ---
    });

    test("handles spaces in between symbols", () => {
        expect(isThematicBreak("* * *")).toBe(true);
        expect(isThematicBreak("-  -  -")).toBe(true);
    });
});

describe("tryOpenNewContainers - Thematic Breaks", () => {
    test("detects thematic break and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "---";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(1);
        expect(doc.children[0].type).toBe("thematic_break");
    });
}); 