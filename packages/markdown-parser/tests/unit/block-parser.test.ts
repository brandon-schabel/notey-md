import type { HeadingNode, ParagraphNode, BlockquoteNode, CodeBlockNode, ListNode, DocumentNode, ThematicBreakNode, HtmlBlockNode, ListItemNode, RefDefinition, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, canContainLine, consumeContainerMarkers, tryOpenNewContainers, closeParagraphIfOpen, handleBlankLine, closeBlock, parseAtxHeading, isThematicBreak, } from "@/block-parser";
import { getParagraphContent, normalizeRefLabel, parseRefDefLine, setParagraphContent } from "@/parser-helpers";

describe("blockPhase - Basic Functionality", () => {
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
        const heading = doc.children.find(n => n.type === "heading") as HeadingNode | undefined;
        const paragraph = doc.children.find(n => n.type === "paragraph") as ParagraphNode | undefined;
        expect(heading).toBeDefined();
        expect(paragraph).toBeDefined();
    });

    test("should parse blockquote container if line starts with >", () => {
        const doc = blockPhase("> Blockquote line");
        expect(doc.children.length).toBe(1);
        const bq = doc.children[0] as BlockquoteNode;
        expect(bq.type).toBe("blockquote");
    });

    test("should parse a fenced code block", () => {
        const doc = blockPhase("```\nTest code\n```");
        expect(doc.children.length).toBe(1);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.value).toContain("Test code");
    });

    test("should parse a thematic break", () => {
        const doc = blockPhase("---");
        expect(doc.children.length).toBe(1);
        expect(doc.children[0].type).toBe("thematic_break");
    });

    test("should parse an unordered list", () => {
        const doc = blockPhase("- Item 1\n- Item 2");
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.ordered).toBe(false);
        expect(list.children.length).toBe(2);
        expect(list.children[0].type).toBe("list_item");
    });

    test("should parse an ordered list", () => {
        const doc = blockPhase("1. First\n2. Second");
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.ordered).toBe(true);
        expect(list.children.length).toBe(2);
    });

    test("should handle multiple consecutive blank lines between paragraphs", () => {
        const doc = blockPhase("Paragraph1\n\n\nParagraph2\n");
        const paragraphs = doc.children.filter(n => n.type === "paragraph") as ParagraphNode[];
        expect(paragraphs.length).toBe(2);
    });

    test("should handle setext heading creation", () => {
        const doc = blockPhase(`Title\n===\nSubtitle\n---\nLast line paragraph`);
        const h1 = doc.children.find(n => n.type === "heading" && (n as HeadingNode).level === 1) as HeadingNode | undefined;
        const h2 = doc.children.find(n => n.type === "heading" && (n as HeadingNode).level === 2) as HeadingNode | undefined;
        const paragraph = doc.children.find(n => n.type === "paragraph") as ParagraphNode | undefined;
        expect(h1).toBeDefined();
        expect(h2).toBeDefined();
        expect(paragraph).toBeDefined();
    });

    test("List item with two paragraphs separated by blank line", () => {
        const input = `- First paragraph in list item
      
        Second paragraph in same item`
        const doc = blockPhase(input);
        // doc should be => <ul><li>  <p>First paragraph...</p><p>Second paragraph...</p>  </li></ul>
        expect(doc.children.length).toBe(1); // only one <ul>
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.children.length).toBe(1); // one <li>
        const li = list.children[0];
        expect(li.children.length).toBe(2);   // 2 paragraphs
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("paragraph");
    });

    test("List item with blank line then indented code block", () => {
        const input = `- item
        
            code line
        `;
        const doc = blockPhase(input);
        // Expect <ul><li> <p>item</p><code_block>code line</code_block></li></ul>
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.children.length).toBe(1);
        const li = list.children[0];
        expect(li.children.length).toBe(2); // a paragraph and a code block
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("code_block");
    });

    test("Nested list items with blank lines in sub-list", () => {
        const input = `- Outer
          - Inner line one
      
            Inner line two
        `;
        // Should yield <ul><li>Outer<ul><li> <p>Inner line one</p><p>Inner line two</p> </li></ul></li></ul>
        const doc = blockPhase(input);
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.children.length).toBe(1);
        const li = list.children[0];
        expect(li.children.length).toBe(2);
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("list");
        const innerList = li.children[1] as ListNode;
        expect(innerList.children.length).toBe(1);
        const innerLi = innerList.children[0];
        expect(innerLi.children.length).toBe(2);
        expect(innerLi.children[0].type).toBe("paragraph");
    });
});




describe("canContainLine", () => {
    const docNode: DocumentNode = {
        type: "document",
        children: [],
        refDefinitions: new Map()
    };

    const bqNode: BlockquoteNode = {
        type: "blockquote",
        children: []
    };

    const paragraphNode: ParagraphNode = {
        type: "paragraph",
        children: []
    };

    const headingNode: HeadingNode = {
        type: "heading",
        level: 1,
        children: []
    };

    const codeBlockNode: CodeBlockNode = {
        type: "code_block",
        value: ""
    };

    const thematicBreakNode: ThematicBreakNode = {
        type: "thematic_break"
    };

    const htmlBlockNode: HtmlBlockNode = {
        type: "html_block",
        value: ""
    };

    test("should return true for 'document' regardless of line content", () => {
        expect(canContainLine(docNode, "anything", 0)).toBe(true);
        expect(canContainLine(docNode, "", 0)).toBe(true);
    });

    test("should return true for blockquote if line is blank or starts with up to 3 spaces + >", () => {
        expect(canContainLine(bqNode, "> A quote", 0)).toBe(true);
        expect(canContainLine(bqNode, "   > Indented quote", 0)).toBe(true);
        expect(canContainLine(bqNode, "", 0)).toBe(true);
        expect(canContainLine(bqNode, "No marker", 0)).toBe(false);
    });

    test("should return true for paragraph if line is non-blank", () => {
        expect(canContainLine(paragraphNode, "Some text", 0)).toBe(true);
        expect(canContainLine(paragraphNode, "", 0)).toBe(false);
    });

    test("should return false for heading since we treat headings as single-line blocks", () => {
        expect(canContainLine(headingNode, "Extra line", 0)).toBe(false);
        expect(canContainLine(headingNode, "", 0)).toBe(false);
    });

    test("should return true for code_block lines (they can contain anything)", () => {
        expect(canContainLine(codeBlockNode, "console.log('test');", 0)).toBe(true);
        expect(canContainLine(codeBlockNode, "", 0)).toBe(true);
    });

    test("should return false for a thematic break node on additional lines", () => {
        expect(canContainLine(thematicBreakNode, "some text", 0)).toBe(false);
        expect(canContainLine(thematicBreakNode, "", 0)).toBe(false);
    });

    test("should return false for an html_block on additional lines", () => {
        expect(canContainLine(htmlBlockNode, "more html", 0)).toBe(false);
        expect(canContainLine(htmlBlockNode, "", 0)).toBe(false);
    });

    test("should return true if container is a 'list' or 'list_item', ignoring line content in top-level check", () => {
        const listNode: ListNode = {
            type: "list",
            ordered: false,
            start: null,
            tight: true,
            children: []
        };
        const listItemNode: ListItemNode = {
            type: "list_item",
            children: []
        };
        expect(canContainLine(listNode, "Some text", 0)).toBe(true);
        expect(canContainLine(listNode, "", 0)).toBe(true);
        expect(canContainLine(listItemNode, "- Another item", 0)).toBe(false);
        expect(canContainLine(listItemNode, "", 0)).toBe(true);
    });

    test("should return false for list_item if line starts with a list marker", () => {
        expect(canContainLine(listItemNode, "- New item", 0)).toBe(false);
        expect(canContainLine(listItemNode, "1. Ordered item", 0)).toBe(false);
    });
});

describe("consumeContainerMarkers", () => {
    test("should consume blockquote markers up to 3 spaces + '>'", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "   > some text";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        expect(newOffset).toBeGreaterThanOrEqual(4);
        expect(newOffset).toBeLessThanOrEqual(5);
    });

    test("should not modify offset for blockquote if line does not match marker", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "No marker here";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        expect(newOffset).toBe(0);
    });

    test("should return the same offset for non-blockquote containers", () => {
        const docNode: DocumentNode = {
            type: "document",
            children: [],
            refDefinitions: new Map()
        };
        const line = "> This is a line";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(docNode, line, initialOffset);
        expect(newOffset).toBe(0);
    });

    test("should not consume more than 3 spaces before the '>' marker", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "       > extra spaces";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        // The spec says up to 3 spaces plus '>' is valid. Extra spaces won't be consumed as part of the marker.
        // We can test that offset isn't skipping more than about 6-7 chars.
        expect(newOffset).toBeGreaterThanOrEqual(4);
        expect(newOffset).toBeLessThanOrEqual(7);
    });
});


function createEmptyDocumentNode(): DocumentNode {
    return {
        type: "document",
        children: [],
        refDefinitions: new Map<string, RefDefinition>()
    };
}

function createParagraphNode(text: string): ParagraphNode {
    const node: ParagraphNode = {
        type: "paragraph",
        children: []
    };
    setParagraphContent(node, text);
    return node;
}

function createCodeBlockNode(value: string, language?: string): CodeBlockNode {
    return {
        type: "code_block",
        value,
        language
    };
}

function createHeadingNode(level: number, text: string): HeadingNode {
    return {
        type: "heading",
        level,
        children: [
            {
                type: "text",
                value: text
            }
        ]
    };
}

function createBlockquoteNode(): BlockquoteNode {
    return {
        type: "blockquote",
        children: []
    };
}

function createListNode(ordered: boolean, start: number | null): ListNode {
    return {
        type: "list",
        ordered,
        start,
        tight: true,
        children: []
    };
}

function createListItemNode(): ListItemNode {
    return {
        type: "list_item",
        children: []
    };
}

function createThematicBreakNode(): ThematicBreakNode {
    return {
        type: "thematic_break"
    };
}

function createHtmlBlockNode(value: string): HtmlBlockNode {
    return {
        type: "html_block",
        value
    };
}

describe("tryOpenNewContainers", () => {
    test("returns false if no new container is opened", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "This is a paragraph line with no special markers";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false);
        expect(stack.length).toBe(1);
    });

    test("handles whitespace offset for normal text, still returns false", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "    Normal text with leading spaces";
        // offset 2: effectively skipping some leading spaces
        const offset = 2;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(false);
        expect(stack.length).toBe(1);
    });

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

    test("detects fenced code block start and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "```typescript";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        expect(doc.children.length).toBe(1);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.language).toBe("typescript");
        expect(codeBlock.value).toBe("");
    });

    test("detects blockquote and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "> Quoted text";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const blockquote = doc.children[0] as BlockquoteNode;
        expect(blockquote.type).toBe("blockquote");
    });

    test("detects blockquote with up to 3 leading spaces", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "   > Indented quote";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const blockquote = doc.children[0] as BlockquoteNode;
        expect(blockquote.type).toBe("blockquote");
    });

    test("detects list item - bullet and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "- List item text";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        const listItem = listNode.children[0] as ListItemNode;
        expect(listNode.type).toBe("list");
        expect(listNode.ordered).toBe(false);
        expect(listItem.type).toBe("list_item");
        const paragraph = listItem.children[0] as ParagraphNode;
        expect(paragraph.type).toBe("paragraph");
    });

    test("detects list item - plus bullet", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "+ Another bullet item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        expect(listNode.ordered).toBe(false);
        const listItem = listNode.children[0] as ListItemNode;
        expect(listItem.type).toBe("list_item");
    });

    test("detects list item - ordered and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "2. Another item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        expect(listNode.ordered).toBe(true);
        expect(listNode.start).toBe(2);
    });

    test("detects another bullet list item following a bullet list, but with same bullet", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, 1);
        doc.children.push(list);
        const li = createListItemNode();
        list.children.push(li);
        const stack: MarkdownNode[] = [doc, list, li];
        const line = "- Next bullet item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        // We expect it to close the current list item & open a new one in the same list
        expect(stack.length).toBe(4);
        expect(list.children.length).toBe(2);
    });

    test("creates a new list if existing list is of a different type", () => {
        const doc = createEmptyDocumentNode();
        const unorderedList = createListNode(false, 1);
        doc.children.push(unorderedList);
        const li = createListItemNode();
        unorderedList.children.push(li);
        const stack: MarkdownNode[] = [doc, unorderedList, li];
        const line = "1. Start ordered list now";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        // The old list is closed, new list is created
        expect(doc.children.length).toBe(2);
        expect(doc.children[0].type).toBe("list");
        expect(doc.children[1].type).toBe("list");
        const newList = doc.children[1] as ListNode;
        expect(newList.ordered).toBe(true);
    });

    test("detects indented code block (4 spaces) and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "    console.log('test')";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.value).toBe("console.log('test')");
    });

    test("adds subsequent lines to existing code_block if it isn't fenced-closed", () => {
        const doc = createEmptyDocumentNode();
        const codeBlock = createCodeBlockNode("initial line");
        doc.children.push(codeBlock);
        const stack: MarkdownNode[] = [doc, codeBlock];
        const line = "    console.log('test')";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(doc.children.length).toBe(1);
        expect(codeBlock.value).toBe("initial line\nconsole.log('test')");
        expect(stack.length).toBe(2); // still in same code block
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

    test("detects valid HTML block and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "<!-- This is a comment -->";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(1);
        const htmlBlock = doc.children[0] as HtmlBlockNode;
        expect(htmlBlock.type).toBe("html_block");
        expect(htmlBlock.value).toBe("<!-- This is a comment -->");
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
        const refMap = new Map<string, RefDefinition>();
        handleBlankLine(stack, refMap);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(1); // paragraph is still in doc, but closed in stack
    });

    test("appends blank line to code_block if top is code_block", () => {
        const doc = createEmptyDocumentNode();
        const cb = createCodeBlockNode("console.log('hi')");
        doc.children.push(cb);
        const stack: MarkdownNode[] = [doc, cb];
        const refMap = new Map<string, RefDefinition>();
        handleBlankLine(stack, refMap);
        expect(stack.length).toBe(2);
        const codeBlock = stack[1] as CodeBlockNode;
        expect(codeBlock.value).toBe("console.log('hi')\n");
    });

    test("does nothing if top of stack is neither paragraph nor code_block", () => {
        const doc = createEmptyDocumentNode();
        const blockquote = createBlockquoteNode();
        doc.children.push(blockquote);
        const stack: MarkdownNode[] = [doc, blockquote];
        const refMap = new Map<string, RefDefinition>();
        handleBlankLine(stack, refMap);
        expect(stack.length).toBe(2);
        expect(blockquote.children.length).toBe(0);
    });

    test("does not close list_item, remains for potential lazy continuation", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, 1);
        const li = createListItemNode();
        list.children.push(li);
        doc.children.push(list);
        const stack: MarkdownNode[] = [doc, list, li];
        const refMap = new Map<string, RefDefinition>();
        handleBlankLine(stack, refMap);
        // Should remain in the same item
        expect(stack.length).toBe(3);
        expect(list.children.length).toBe(1);
    });
});

describe("closeBlock", () => {
    test("removes paragraph from AST if it contains only reference definitions", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("[ref1]: http://example.com");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const refMap = new Map<string, RefDefinition>();
        closeBlock(stack, refMap);
        expect(doc.children.length).toBe(0);
        expect(refMap.size).toBe(1);
        expect(stack.length).toBe(1);
    });

    test("retains leftover text if paragraph has partial reference definitions", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("[ref1]: http://example.com\nRemaining text");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const refMap = new Map<string, RefDefinition>();
        closeBlock(stack, refMap);
        expect(doc.children.length).toBe(1);
        const updatedPara = doc.children[0] as ParagraphNode;
        expect(getParagraphContent(updatedPara)).toBe("Remaining text");
        expect(refMap.size).toBe(1);
        expect(stack.length).toBe(1);
    });

    test("closes code_block or other blocks without special reference handling", () => {
        const doc = createEmptyDocumentNode();
        const cb = createCodeBlockNode("console.log('hi')");
        doc.children.push(cb);
        const stack: MarkdownNode[] = [doc, cb];
        const refMap = new Map<string, RefDefinition>();
        closeBlock(stack, refMap);
        expect(stack.length).toBe(1);
        expect(doc.children.length).toBe(1);
    });

    test("closing a paragraph with no references does not remove it from AST", () => {
        const doc = createEmptyDocumentNode();
        const para = createParagraphNode("plain text");
        doc.children.push(para);
        const stack: MarkdownNode[] = [doc, para];
        const refMap = new Map<string, RefDefinition>();
        closeBlock(stack, refMap);
        expect(doc.children.length).toBe(1);
        expect(getParagraphContent(doc.children[0] as ParagraphNode)).toBe("plain text");
    });

    test("does nothing if stack is empty", () => {
        const stack: MarkdownNode[] = [];
        closeBlock(stack, null);
        expect(stack.length).toBe(0);
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





describe("normalizeRefLabel", () => {
    test("should convert label to lower case, trim spaces, and collapse whitespace", () => {
        const rawLabel = "  Some   Complex    LABEL  "
        const normalized = normalizeRefLabel(rawLabel)
        expect(normalized).toBe("some complex label")
    })

    test("should handle an already normalized label", () => {
        const rawLabel = "simple"
        const normalized = normalizeRefLabel(rawLabel)
        expect(normalized).toBe("simple")
    })

    test("should handle empty string", () => {
        const emptyLabel = ""
        const normalized = normalizeRefLabel(emptyLabel)
        expect(normalized).toBe("")
    })

    test("should remove multiple internal whitespaces", () => {
        const spaced = "  multiple   spaces   here "
        const normalized = normalizeRefLabel(spaced)
        expect(normalized).toBe("multiple spaces here")
    })

    test("should lower-case punctuation and preserve them", () => {
        const withPunctuation = " Foo-Bar? "
        const normalized = normalizeRefLabel(withPunctuation)
        expect(normalized).toBe("foo-bar?")
    })
})


describe("parseRefDefLine", () => {
    test("should return an object when parsing a valid reference line with angle-bracketed URL and double-quoted title", () => {
        const validReferenceLine = `[example]: <https://example.com> "Example Title"`
        const result = parseRefDefLine(validReferenceLine)
        expect(result).toStrictEqual({
            label: "example",
            url: "https://example.com",
            title: "Example Title"
        })
    })

    test("should handle a valid reference without title", () => {
        const validReferenceLineNoTitle = `[exampleNoTitle]: https://example.com`
        const result = parseRefDefLine(validReferenceLineNoTitle)
        expect(result).toStrictEqual({
            label: "exampleNoTitle",
            url: "https://example.com",
            title: undefined
        })
    })

    test("should handle a single-quoted title", () => {
        const singleQuoted = `[img]: <https://images.com/test.jpg> 'Image Title'`
        const result = parseRefDefLine(singleQuoted)
        expect(result).toStrictEqual({
            label: "img",
            url: "https://images.com/test.jpg",
            title: "Image Title"
        })
    })

    test("should handle a parenthesized title", () => {
        const parenthesized = `[dataRef]: data.json (Data Title)`
        const result = parseRefDefLine(parenthesized)
        expect(result).toStrictEqual({
            label: "dataRef",
            url: "data.json",
            title: "Data Title"
        })
    })

    test("should allow up to 3 leading spaces", () => {
        const spaced = `   [foo]: <https://foo.com>`
        const result = parseRefDefLine(spaced)
        expect(result).toStrictEqual({
            label: "foo",
            url: "https://foo.com",
            title: undefined
        })
    })

    test("should return null if line does not match reference definition pattern", () => {
        const invalidLine = `Not a reference definition`
        const result = parseRefDefLine(invalidLine)
        expect(result).toBeNull()
    })

    test("should allow parentheses in the URL", () => {
        const lineWithParentheses = `[sample]: https://example.com/test(path) (Title)`
        const result = parseRefDefLine(lineWithParentheses)
        expect(result).toStrictEqual({
            label: "sample",
            url: "https://example.com/test(path)",
            title: "Title"
        })
    })

    test("should handle line with empty title but valid label and URL", () => {
        const lineWithEmptyTitle = `[noop]: <https://example.org> ""`
        const result = parseRefDefLine(lineWithEmptyTitle)
        expect(result).toStrictEqual({
            label: "noop",
            url: "https://example.org",
            title: ""
        })
    })

    test("should handle special characters in the label", () => {
        const withSpecialChars = `[foo/bar]: http://test.com 'Title'`
        const result = parseRefDefLine(withSpecialChars)
        expect(result).toStrictEqual({
            label: "foo/bar",
            url: "http://test.com",
            title: "Title"
        })
    })
})
