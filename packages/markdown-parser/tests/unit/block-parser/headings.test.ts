import type { HeadingNode, ParagraphNode, MarkdownNode, DocumentNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, parseAtxHeading, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode, createParagraphNode } from "./test-helpers";

describe("blockPhase - Headings", () => {
    test("should handle setext heading creation", () => {
        const doc = blockPhase(`Title\n===\nSubtitle\n---\nLast line paragraph`);
        const h1 = doc.children.find(n => n.type === "heading" && (n as HeadingNode).level === 1) as HeadingNode | undefined;
        const h2 = doc.children.find(n => n.type === "heading" && (n as HeadingNode).level === 2) as HeadingNode | undefined;
        const paragraph = doc.children.find(n => n.type === "paragraph") as ParagraphNode | undefined;
        expect(h1).toBeDefined();
        expect(h2).toBeDefined();
        expect(paragraph).toBeDefined();
    });
});

describe("parseAtxHeading", () => {
    test("returns a HeadingNode if the line is a valid ATX heading", () => {
        const h1 = parseAtxHeading("# Heading");
        const h3 = parseAtxHeading("### Another heading");
        expect(h1?.type).toBe("heading");
        expect(h1?.level).toBe(1);
        expect(h1?.children[0].type).toBe("text");
        expect((h1?.children[0] as any).value).toBe("Heading");
        expect(h3?.level).toBe(3);
    });

    test("handles trailing hashes with spacing", () => {
        const heading = parseAtxHeading("## Some heading ##   ");
        expect(heading).not.toBeNull();
        if (heading) {
            expect(heading.level).toBe(2);
            expect(heading.children[0].type).toBe("text");
            expect((heading.children[0] as any).value).toBe("Some heading");
        }
    });

    test("returns null for lines that don't match the pattern", () => {
        expect(parseAtxHeading("No heading")).toBe(null);
        expect(parseAtxHeading("####### Too many hashes")).toBe(null);
        expect(parseAtxHeading("#HeadingNoSpace")).toBe(null);
    });
});

describe("tryOpenNewContainers - Headings", () => {
    test("detects ATX heading and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc, createParagraphNode("temp")];
        const line = "# Heading text";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(1);
        const heading = doc.children[0] as HeadingNode;
        expect(heading.type).toBe("heading");
        expect(heading.level).toBe(1);
        expect(heading.children[0].type).toBe("text");
        expect((heading.children[0] as any).value).toBe("Heading text");
    });

    test("returns true for heading lines with trailing hashes", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "## Heading with trailing ##";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(1);
        const heading = doc.children[0] as HeadingNode;
        expect(heading.level).toBe(2);
        expect(heading.children[0].type).toBe("text");
        expect((heading.children[0] as any).value).toBe("Heading with trailing");
    });

    test("does not open heading if more than 6 # in start (invalid)", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "####### Too many hashes";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(0);
    });

    test("detects setext heading (level 1) under a paragraph and returns true", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Heading text line");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const line = "===";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(doc.children.length).toBe(1);
        const heading = doc.children[0] as HeadingNode;
        expect(heading.type).toBe("heading");
        expect(heading.level).toBe(1);
        expect(heading.children[0].type).toBe("text");
        expect((heading.children[0] as any).value).toBe("Heading text line");
    });

    test("detects setext heading (level 2) under paragraph and returns true", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Another heading text");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const line = "---";
        // Thematic break also matches '---', but setext logic is tested:
        // By the time we get here, isThematicBreak might already cause a return. This test specifically checks
        // that we do not overshadow the setext logic if the top of stack is paragraph.
        // Typically '---' could be a thematic break at top-level. But let's assume we are not top-level or so.
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        // For setext heading detection, we need it to skip the them-break if top is a paragraph
        // The example code first checks them-break at the top, so practically
        // there's some order-of-check nuance. We'll still test it.
        if (result) {
            const heading = doc.children[0] as HeadingNode;
            expect(heading.type).toBe("heading");
            expect(heading.level).toBe(2);
            expect(heading.children[0].type).toBe("text");
            expect((heading.children[0] as any).value).toBe("Another heading text");
        } else {
            // If it was recognized as a thematic break first, result is true anyway
            // @ts-ignore
            expect(result).toBe(true);
            expect(doc.children[0].type).toBe("thematic_break");
        }
    });
     test("returns false if top is paragraph but setext markers are invalid (e.g. '-=' )", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Heading text");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const line = "-=";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false);
        expect(stack.length).toBe(2);
        expect(doc.children.length).toBe(1); // paragraph remains
    });
}); 