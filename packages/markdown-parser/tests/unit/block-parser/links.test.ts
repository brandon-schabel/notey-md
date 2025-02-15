import type { LinkNode, MarkdownNode, ParagraphNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode, createParagraphNode } from "./test-helpers";

describe("tryOpenNewContainers - Links", () => {
    test("should not detect link at the block level (links are inline)", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "[link text](url)";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false); // Links are not block-level elements
        expect(stack.length).toBe(1); // Stack should remain unchanged
    });

    test("should not create a link if inside a paragraph (inline context)", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Some text");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const line = "[link](url) more text";
        const offset = 0;

        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false); // No new block-level container
        expect(stack.length).toBe(2); // Still within the paragraph
        expect(doc.children.length).toBe(1); // No new top-level nodes
        expect(para.children.length).toBe(0); // Paragraph's inline content is not parsed here
    });
});

// Since links are handled in the inline phase, we don't have block-level
// tests like canContainLine or consumeContainerMarkers for links. Those
// concepts apply to block-level containers like blockquotes and lists.
// Inline parsing logic will be tested separately in inline-parser tests.
