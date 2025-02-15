import type { DocumentNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase } from "@/block-parser";

describe("blockPhase - Document Structure", () => {
    test("should return a DocumentNode with empty children for empty input", () => {
        const doc = blockPhase("");
        expect(doc.type).toBe("document");
        expect(doc.children.length).toBe(0);
        expect(doc.refDefinitions.size).toBe(0);
    });

    test("should create a single paragraph node for a single line of text", () => {
        const doc = blockPhase("Hello World");
        expect(doc.children.length).toBe(1);
        expect(doc.children[0].type).toBe("paragraph");
    });

    test("should create multiple blocks for multiple lines", () => {
        const doc = blockPhase("# Heading\n\nParagraph text\n");
        expect(doc.children.length).toBeGreaterThanOrEqual(2);
        const heading = doc.children.find(n => n.type === "heading") as any;
        const paragraph = doc.children.find(n => n.type === "paragraph") as any;
        expect(heading).toBeDefined();
        expect(paragraph).toBeDefined();
    });

     test("should handle multiple consecutive blank lines between paragraphs", () => {
        const doc = blockPhase("Paragraph1\n\n\nParagraph2\n");
        const paragraphs = doc.children.filter(n => n.type === "paragraph") as any[];
        expect(paragraphs.length).toBe(2);
    });
}); 