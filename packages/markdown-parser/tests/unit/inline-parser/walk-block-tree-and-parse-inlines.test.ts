import type { DocumentNode, RefDefinition, ParagraphNode, HeadingNode } from "@/ast";
import { walkBlockTreeAndParseInlines } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("walkBlockTreeAndParseInlines", () => {
    test("should parse paragraphs and headings in document into inline nodes", () => {
        const paragraph: ParagraphNode = {
            type: "paragraph",
            children: []
        } as ParagraphNode;
        (paragraph as any)._raw = "Some *emphasis* text";

        const heading: HeadingNode = {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "A **strong** heading" }]
        };

        const root: DocumentNode = {
            type: "document",
            children: [paragraph, heading],
            refDefinitions: new Map<string, RefDefinition>()
        };

        walkBlockTreeAndParseInlines(root, root.refDefinitions);

        expect(root.children[0].type).toBe("paragraph");
        expect(root.children[1].type).toBe("heading");

        const paragraphChildren = (root.children[0] as ParagraphNode).children;
        expect(paragraphChildren.some(n => n.type === "emphasis")).toBe(true);

        const headingChildren = (root.children[1] as HeadingNode).children;
        expect(headingChildren.some(n => n.type === "strong")).toBe(true);
    });

    test("should leave code blocks unchanged", () => {
        const codeBlock = {
            type: "code_block",
            value: "console.log('hello')"
        };
        const root: DocumentNode = {
            type: "document",
            // @ts-ignore
            children: [codeBlock],
            refDefinitions: new Map<string, RefDefinition>()
        };

        walkBlockTreeAndParseInlines(root, root.refDefinitions);
        // @ts-ignore
        expect(root.children[0]).toStrictEqual(codeBlock);
    });

    test("should recurse through blockquotes", () => {
        const paragraphInside = {
            type: "paragraph",
            children: []
        } as ParagraphNode;
        (paragraphInside as any)._raw = "`code` block inside";

        const blockquote = {
            type: "blockquote",
            children: [paragraphInside]
        };

        const doc: DocumentNode = {
            type: "document",
            // @ts-ignore
            children: [blockquote],
            refDefinitions: new Map<string, RefDefinition>()
        };

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions);
        const nestedParagraph = (doc.children[0] as any).children[0];
        expect(nestedParagraph.type).toBe("paragraph");
        expect(nestedParagraph.children.some((n: any) => n.type === "code_span")).toBe(true);
    });

    test("should handle empty paragraph without errors", () => {
        const emptyParagraph: ParagraphNode = {
            type: "paragraph",
            children: []
        } as ParagraphNode;
        (emptyParagraph as any)._raw = "";

        const doc: DocumentNode = {
            type: "document",
            children: [emptyParagraph],
            refDefinitions: new Map<string, RefDefinition>()
        };

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions);
        expect(doc.children[0].type).toBe("paragraph");
        expect((doc.children[0] as ParagraphNode).children.length).toBe(0);
    });

    test("should handle heading with multiple text children", () => {
        const heading: HeadingNode = {
            type: "heading",
            level: 3,
            children: [
                { type: "text", value: "Part " },
                { type: "text", value: "**One** " },
                { type: "text", value: "and " },
                { type: "text", value: "*Two* " }
            ]
        };
        const doc: DocumentNode = {
            type: "document",
            children: [heading],
            refDefinitions: new Map<string, RefDefinition>()
        };

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions);
        const processedHeading = doc.children[0] as HeadingNode;
        expect(processedHeading.children.some(n => n.type === "emphasis")).toBe(true);
        expect(processedHeading.children.some(n => n.type === "strong")).toBe(true);
    });
});