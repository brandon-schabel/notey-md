import type { ParagraphNode, DocumentNode, MarkdownNode} from "@/ast";
import { test, describe, expect } from "bun:test";
import { canContainLine, closeParagraphIfOpen, handleBlankLine} from "@/block-parser";
import { createEmptyDocumentNode, createParagraphNode, createBlockquoteNode } from "./test-helpers";

describe("canContainLine - Paragraphs", () => {
    const paragraphNode: ParagraphNode = {
        type: "paragraph",
        children: []
    };
    test("should return true for paragraph if line is non-blank", () => {
        expect(canContainLine(paragraphNode, "Some text", 0)).toBe(true);
        expect(canContainLine(paragraphNode, "", 0)).toBe(false);
    });
});

describe("closeParagraphIfOpen", () => {
    test("closes paragraph if top of stack is paragraph", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Example paragraph");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        closeParagraphIfOpen(stack);
        expect(stack.length).toBe(1);
        expect(stack[0].type).toBe("document");
    });

    test("does nothing if top of stack is not paragraph", () => {
        const doc = createEmptyDocumentNode();
        const blockquote = createBlockquoteNode();
        doc.children.push(blockquote);
        const stack: MarkdownNode[] = [doc, blockquote];
        closeParagraphIfOpen(stack);
        expect(stack.length).toBe(2);
        expect(stack[1].type).toBe("blockquote");
    });

    test("does nothing if stack is empty", () => {
        const stack: MarkdownNode[] = [];
        closeParagraphIfOpen(stack);
        expect(stack.length).toBe(0);
    });
});

describe("handleBlankLine", () => {
    test("closes paragraph if top of stack is paragraph", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("Line one");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const refMap = new Map();
        handleBlankLine(stack, refMap);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(1); // paragraph is still in doc, but closed in stack
    });
}); 