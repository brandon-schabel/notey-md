
import { test, describe, expect } from "bun:test";
import {
    parseMarkdown,
    blockPhase,
    canContainLine,
    consumeContainerMarkers,
    // Helpful imports for constructing container types:
    type DocumentNode,
    type ParagraphNode,
    type BlockquoteNode,
    type CodeBlockNode,
    type HeadingNode,
    type ListNode,
    type ListItemNode,
    type ThematicBreakNode,
    type HtmlBlockNode,
    // Main functions under test
    tryOpenNewContainers,
    closeParagraphIfOpen,
    handleBlankLine,
    closeBlock,
    parseAtxHeading,
    isThematicBreak,
    getListMarker,
    tryHtmlBlockOpen,
    tryHtmlBlockOpenStrict,
    type RefDefinition,
    addChild,
    getParagraphContent,
    setParagraphContent,
    type MarkdownNode,
    escapeUrl,
    escapeHtml,
    escapeHtmlAttr,
    parseInlinesWithDelimiterStack,
    isLeftFlankingDelimiterRun,
    isRightFlankingDelimiterRun,
    processEmphasis,
    linkResolver,
    renderAstToHtml,
    wrapBlock,
    type InlineToken,
    parseRefDefLine,
    normalizeRefLabel,
    walkBlockTreeAndParseInlines,
    parseInlineString,
    lexInline,
    matchAutolink,
    matchRawInlineHtml,
} from "@/index";

describe("parseMarkdown - Basic Cases", () => {
    test("should transform an empty string into an empty document", () => {
        const result = parseMarkdown("");
        expect(result).toBe("");
    });

    test("should transform a single line of text into a paragraph", () => {
        const input = "Hello World";
        const output = parseMarkdown(input);
        expect(output).toBe("<p>Hello World</p>");
    });

    test("should transform an ATX heading (#) into a corresponding <h1> tag", () => {
        const input = "# Title";
        const output = parseMarkdown(input);
        expect(output).toBe("<h1>Title</h1>");
    });

    test("should transform multiple lines, including a heading and paragraph", () => {
        const input = `
  # My Heading
  This is a paragraph.
  `.trim();
        const output = parseMarkdown(input);
        expect(output).toContain("<h1>My Heading</h1>");
        expect(output).toContain("<p>This is a paragraph.</p>");
    });

    test("should parse a blockquote with a single line", () => {
        const input = "> This is a quote";
        const output = parseMarkdown(input);
        expect(output).toBe("<blockquote><p>This is a quote</p></blockquote>");
    });

    test("should handle fenced code blocks", () => {
        const input = "```\nconsole.log('hello');\n```";
        const output = parseMarkdown(input);
        expect(output).toContain("<pre><code");
        expect(output).toContain("console.log('hello');");
        expect(output).toContain("</code></pre>");
    });

    test("should handle thematic break (---)", () => {
        const input = "Some text\n---\nMore text";
        const output = parseMarkdown(input);
        expect(output).toContain("<hr />");
    });

    test("should handle lists (unordered)", () => {
        const input = `- Item A
  - Item B
  - Item C`;
        const output = parseMarkdown(input);
        expect(output).toContain("<ul><li>Item A</li><li>Item B</li><li>Item C</li></ul>");
    });
});

describe("parseMarkdown - Additional & Edge Cases", () => {
    test("should correctly handle multiple consecutive blank lines", () => {
        const input = "Line one\n\n\nLine two\n\n";
        const output = parseMarkdown(input);
        // Expect two paragraphs:
        // <p>Line one</p>
        // <p>Line two</p>
        const paragraphs = output.match(/<p>(.*?)<\/p>/g) || [];
        expect(paragraphs.length).toBe(2);
        expect(paragraphs[0]).toBe("<p>Line one</p>");
        expect(paragraphs[1]).toBe("<p>Line two</p>");
    });

    test("should handle trailing whitespace on lines", () => {
        const input = "Hello World   \n\n";
        const output = parseMarkdown(input);
        expect(output).toBe("<p>Hello World</p>");
    });

    test("should parse a deeply nested blockquote", () => {
        const input = `> Outer
  > > Middle
  > > > Inner
  `;
        const output = parseMarkdown(input);
        // We expect nested <blockquote> tags
        // Outer blockquote:
        //   contains a paragraph "Outer"
        //   and another nested blockquote
        expect(output).toMatch(/<blockquote><p>Outer<\/p><blockquote><p>Middle<\/p><blockquote><p>Inner<\/p><\/blockquote><\/blockquote><\/blockquote>/);
    });

    test("should parse a code block with language info", () => {
        const input = "```typescript\nconst x = 42;\n```";
        const output = parseMarkdown(input);
        // Expect <pre><code class="language-typescript">...
        expect(output).toContain(`class="language-typescript"`);
        expect(output).toContain("const x = 42;");
    });

    test("should treat different bullet characters in unordered lists similarly", () => {
        const input = `* Star
  + Plus
  - Dash
  `;
        const output = parseMarkdown(input);
        // Should create three <li> items, all in separate <ul> or single <ul>
        // Because each line is a separate bullet
        // Some implementations might combine them into separate lists if they see different bullets
        // but commonly they handle them the same. We'll just check for three list items total.
        const liMatches = output.match(/<li>/g) || [];
        expect(liMatches.length).toBe(3);
    });

    test("should parse ordered list with different punctuation (dot or paren)", () => {
        const input = `1) First
  2. Second
  `;
        const output = parseMarkdown(input);
        // Expect a single <ol> with two items:
        expect(output).toContain("<ol");
        expect(output).toContain("<li>First</li>");
        expect(output).toContain("<li>Second</li>");
    });

    test("should parse heading with trailing hashes (#)", () => {
        const input = "## Heading ##";
        const output = parseMarkdown(input);
        // The spec says trailing hashes are optional, they shouldn't appear in final text
        expect(output).toBe("<h2>Heading</h2>");
    });

    test("should parse setext heading (underline style)", () => {
        const input = `Heading Level 1
  ===
  Heading Level 2
  ---
  `;
        const output = parseMarkdown(input);
        // Expect <h1>Heading Level 1</h1>
        // Then <h2>Heading Level 2</h2>
        expect(output).toContain("<h1>Heading Level 1</h1>");
        expect(output).toContain("<h2>Heading Level 2</h2>");
    });

    test("should gracefully handle an unterminated fenced code block by treating it as a code block until end", () => {
        const input = "```\nUnclosed code block\n";
        const output = parseMarkdown(input);
        // The code block doesn't have an ending fence
        // Implementation might close it at the end or treat the entire input as code
        expect(output).toContain("<pre><code");
        expect(output).toContain("Unclosed code block");
    });

    test("should parse an empty code block if there's ``` with nothing in between", () => {
        const input = "```\n```";
        const output = parseMarkdown(input);
        expect(output).toBe("<pre><code></code></pre>");
    });

    test("should handle nested lists (a list item containing another list)", () => {
        const input = `
  - Outer item
    - Inner item
  - Next outer
  `.trim();
        const output = parseMarkdown(input);
        // We might get a single top-level <ul> with 2 <li>, the first <li> has a nested <ul>
        expect(output).toContain("<ul><li>Outer item<ul><li>Inner item</li></ul></li><li>Next outer</li></ul>");
    });
});

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
        expect(canContainLine(docNode, "anything")).toBe(true);
        expect(canContainLine(docNode, "")).toBe(true);
    });

    test("should return true for blockquote if line is blank or starts with up to 3 spaces + >", () => {
        expect(canContainLine(bqNode, "> A quote")).toBe(true);
        expect(canContainLine(bqNode, "   > Indented quote")).toBe(true);
        expect(canContainLine(bqNode, "")).toBe(true);
        expect(canContainLine(bqNode, "No marker")).toBe(false);
    });

    test("should return true for paragraph if line is non-blank", () => {
        expect(canContainLine(paragraphNode, "Some text")).toBe(true);
        expect(canContainLine(paragraphNode, "")).toBe(false);
    });

    test("should return false for heading since we treat headings as single-line blocks", () => {
        expect(canContainLine(headingNode, "Extra line")).toBe(false);
        expect(canContainLine(headingNode, "")).toBe(false);
    });

    test("should return true for code_block lines (they can contain anything)", () => {
        expect(canContainLine(codeBlockNode, "console.log('test');")).toBe(true);
        expect(canContainLine(codeBlockNode, "")).toBe(true);
    });

    test("should return false for a thematic break node on additional lines", () => {
        expect(canContainLine(thematicBreakNode, "some text")).toBe(false);
        expect(canContainLine(thematicBreakNode, "")).toBe(false);
    });

    test("should return false for an html_block on additional lines", () => {
        expect(canContainLine(htmlBlockNode, "more html")).toBe(false);
        expect(canContainLine(htmlBlockNode, "")).toBe(false);
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
        expect(canContainLine(listNode, "Some text")).toBe(true);
        expect(canContainLine(listNode, "")).toBe(true);
        expect(canContainLine(listItemNode, "- Another item")).toBe(true);
        expect(canContainLine(listItemNode, "")).toBe(true);
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

describe("getListMarker", () => {
    test("returns bullet list marker info for lines starting with * or + or -", () => {
        const bullet = getListMarker("* Item text");
        expect(bullet).toEqual({ ordered: false, start: 1, bulletChar: "*" });
        const plus = getListMarker("+ Another");
        expect(plus).toEqual({ ordered: false, start: 1, bulletChar: "+" });
        const dash = getListMarker("- Third");
        expect(dash).toEqual({ ordered: false, start: 1, bulletChar: "-" });
    });

    test("returns ordered list marker info for lines starting with digits + . or )", () => {
        const ordered1 = getListMarker("1. Hello");
        const ordered2 = getListMarker("12) World");
        expect(ordered1).toEqual({ ordered: true, start: 1 });
        expect(ordered2).toEqual({ ordered: true, start: 12 });
    });

    test("handles up to 9 digits for ordered list marker", () => {
        const bigMarker = getListMarker("123456789. Large index");
        expect(bigMarker).toEqual({ ordered: true, start: 123456789 });
    });

    test("returns null for lines that don't match any list marker pattern", () => {
        expect(getListMarker("No marker")).toBeNull();
        expect(getListMarker("abc")).toBeNull();
        expect(getListMarker("1234567890. Too large index?")).toEqual(null);
    });
});

describe("tryHtmlBlockOpen", () => {
    test("recognizes simple HTML comment and returns content", () => {
        const res = tryHtmlBlockOpen("<!-- comment -->");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<!-- comment -->");
    });

    test("recognizes tags", () => {
        const res = tryHtmlBlockOpen("<div>Hello</div>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<div>Hello</div>");
    });

    test("recognizes processing instructions", () => {
        const res = tryHtmlBlockOpen("<?xml version='1.0'?>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<?xml version='1.0'?>");
    });

    test("returns null for lines that are not recognized as HTML blocks", () => {
        const res = tryHtmlBlockOpen("Plain text");
        expect(res).toBeNull();
    });
});

describe("tryHtmlBlockOpenStrict", () => {
    test("recognizes HTML comment as block type 2", () => {
        const res = tryHtmlBlockOpenStrict("<!-- some comment -->");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<!-- some comment -->");
    });

    test("recognizes DOCTYPE as block type 4", () => {
        const res = tryHtmlBlockOpenStrict("<!DOCTYPE html>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<!DOCTYPE html>");
    });

    test("recognizes script tag as type 1 block-level tag", () => {
        const res = tryHtmlBlockOpenStrict("<script>console.log('test')</script>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<script>console.log('test')</script>");
    });

    test("recognizes certain block-level tags like <div>", () => {
        const res = tryHtmlBlockOpenStrict("<div>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<div>");
    });

    test("returns null for lines not matching common block-level HTML patterns", () => {
        const res = tryHtmlBlockOpenStrict("<span>Inline element</span>");
        expect(res).toBeNull();
        const res2 = tryHtmlBlockOpenStrict("<mycustomtag>Some text</mycustomtag>");
        expect(res2).toBeNull();
    });
});



describe("parseInlinesWithDelimiterStack", () => {
    test("handles code_span tokens correctly", () => {
        const tokens: InlineToken[] = [{ type: "code_span", content: "some code" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([{ type: "code_span", code: "some code" }]);
    });

    test("handles raw_html tokens correctly", () => {
        const tokens: InlineToken[] = [{ type: "raw_html", content: "<div>test</div>" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([{ type: "raw_html", content: "<div>test</div>" }]);
    });

    test("converts autolink tokens (email) into link nodes", () => {
        const tokens: InlineToken[] = [{ type: "autolink", content: "someone@example.com" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            {
                type: "link",
                url: "mailto:someone@example.com",
                children: [{ type: "text", value: "someone@example.com" }],
            },
        ]);
    });

    test("converts autolink tokens (URL) into link nodes", () => {
        const tokens: InlineToken[] = [{ type: "autolink", content: "http://example.com" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            {
                type: "link",
                url: "http://example.com",
                children: [{ type: "text", value: "http://example.com" }],
            },
        ]);
    });

    test("handles softbreak as a single space text node", () => {
        const tokens: InlineToken[] = [{ type: "softbreak", content: "" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([{ type: "text", value: " " }]);
    });

    test("handles br as linebreak node", () => {
        const tokens: InlineToken[] = [{ type: "br", content: "" }];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([{ type: "linebreak" }]);
    });

    test("handles delim tokens for emphasis (single asterisk)", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "Hello " },
            { type: "delim", content: "*" },
            { type: "text", content: "world" },
            { type: "delim", content: "*" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        const emphasisNode = result[0];
        expect(emphasisNode.type).toBe("emphasis");
        if (emphasisNode.type === "emphasis") {
            expect(emphasisNode.children).toEqual([{ type: "text", value: "world" }]);
        }
    });

    test("handles delim tokens for strong emphasis (double asterisk)", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "Hello " },
            { type: "delim", content: "**" },
            { type: "text", content: "world" },
            { type: "delim", content: "**" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        const strongNode = result[0];
        expect(strongNode.type).toBe("strong");
        if (strongNode.type === "strong") {
            expect(strongNode.children).toEqual([{ type: "text", value: "world" }]);
        }
    });

    test("handles regular text tokens properly", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "abc" },
            { type: "text", content: "def" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: "text", value: "abc" },
            { type: "text", value: "def" },
        ]);
    });

    test("treats bracket tokens as text by default", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "rbracket", content: "]" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: "text", value: "[" },
            { type: "text", value: "]" },
        ]);
    });

    // Additional, more thorough tests

    test("handles triple emphasis delimiters *** as strong + em or just strong if no matching openers", () => {
        // Example: ***hello*** => should produce a strong node if the rule for triple is not fully handled.
        // In the naive approach, we might get strong or combined strong+em depending on logic. We'll check for correctness.
        const tokens: InlineToken[] = [
            { type: "delim", content: "***" },
            { type: "text", content: "hello" },
            { type: "delim", content: "***" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        // Depending on partial approach, we might end up with a strong node or a single emphasis node. We'll see if the code lumps them as strong with leftover '*'.
        // Let's see if it's recognized as isStrong = (opener.length >= 2 && closer.length >= 2) => we might end up with one strong, discarding one star each side or we might do 2 expansions.
        // The most likely naive approach is we get a strong node containing 'hello' if the code uses 2 of the 3 stars, leaving 1 star each side unused. Then the leftover star might remain as text or become an emphasis node inside.
        // We'll verify carefully. For TDD, let's assume we'd want a single strong node with "hello".
        expect(result.length).toBe(1);
        const onlyNode = result[0];
        // The code might produce a single strong node or it might produce nested emphasis. We'll check whichever we expect:
        expect(onlyNode.type).toBe("strong");
        if (onlyNode.type === "strong") {
            expect(onlyNode.children).toEqual([{ type: "text", value: "hello" }]);
        }
    });

    test("handles empty tokens array gracefully", () => {
        const result = parseInlinesWithDelimiterStack([], new Map());
        expect(result).toEqual([]);
    });

    test("handles emphasis delimiters with punctuation adjacency", () => {
        // e.g. "hello*world*!", lastChar='o', nextChar='w', then punctuation after
        const tokens: InlineToken[] = [
            { type: "text", content: "hello" },
            { type: "delim", content: "*" },
            { type: "text", content: "world" },
            { type: "delim", content: "*" },
            { type: "text", content: "!" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(2);
        expect(result[0].type).toBe("emphasis");
        expect(result[1]).toEqual({ type: "text", value: "!" });
    });

    test("handles multiple code spans and raw HTML in sequence", () => {
        const tokens: InlineToken[] = [
            { type: "code_span", content: "x=y" },
            { type: "code_span", content: "foo()" },
            { type: "raw_html", content: "<span>test</span>" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: "code_span", code: "x=y" },
            { type: "code_span", code: "foo()" },
            { type: "raw_html", content: "<span>test</span>" },
        ]);
    });
});

describe("isLeftFlankingDelimiterRun", () => {
    test("returns true for single asterisk with next char not whitespace", () => {
        expect(isLeftFlankingDelimiterRun("*", "", "w", 1)).toBe(true);
    });

    test("returns false for underscore if next char is whitespace", () => {
        expect(isLeftFlankingDelimiterRun("_", "", " ", 1)).toBe(false);
    });

    test("returns false for underscore in intraword context", () => {
        expect(isLeftFlankingDelimiterRun("_", "a", "b", 1)).toBe(false);
    });

    // Additional tests

    test("returns true for multiple asterisks if next char is punctuation but not whitespace", () => {
        // e.g. ***! might still open if the logic is naive about punctuation
        expect(isLeftFlankingDelimiterRun("*", "", "!", 3)).toBe(true);
    });

    test("returns false for empty nextChar", () => {
        expect(isLeftFlankingDelimiterRun("*", "a", undefined, 1)).toBe(false);
    });

    test("returns false for underscores if next char is underscore", () => {
        expect(isLeftFlankingDelimiterRun("_", "", "_", 2)).toBe(false);
    });
});

describe("isRightFlankingDelimiterRun", () => {
    test("returns true for single asterisk if last char is not whitespace", () => {
        expect(isRightFlankingDelimiterRun("*", "w", "", 1)).toBe(true);
    });

    test("returns false for underscore in intraword context", () => {
        expect(isRightFlankingDelimiterRun("_", "a", "b", 1)).toBe(false);
    });

    test("returns false if there is no last char", () => {
        expect(isRightFlankingDelimiterRun("*", "", "w", 1)).toBe(false);
    });

    // Additional tests

    test("returns true for double asterisks if last char is punctuation (still might close)", () => {
        expect(isRightFlankingDelimiterRun("*", "!", "", 2)).toBe(true);
    });

    test("returns false if next char is alphanumeric for underscore with last char also alphanumeric", () => {
        // underscores disallow intraword
        expect(isRightFlankingDelimiterRun("_", "A", "B", 1)).toBe(false);
    });
});

describe("processEmphasis", () => {
    test("converts single pair of * delimiters into emphasis node", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "*" },
            { type: "text", value: "world" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: false },
            { idx: 3, length: 1, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(2);
        expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
        expect(nodes[1].type).toBe("emphasis");
    });

    test("converts ** into strong node", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "**" },
            { type: "text", value: "bold" },
            { type: "text", value: "**" },
        ];
        const delims = [
            { idx: 0, length: 2, char: "*", canOpen: true, canClose: false },
            { idx: 2, length: 2, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("strong");
    });

    // Additional emphasis tests

    test("does not create emphasis node if canOpen/canClose flags do not match", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "something" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: false, canClose: false },
            { idx: 2, length: 1, char: "*", canOpen: false, canClose: false },
        ];
        processEmphasis(nodes, delims);
        // Should remain as is because canOpen/canClose are false
        expect(nodes.length).toBe(3);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "something" },
            { type: "text", value: "*" },
        ]);
    });

    test("handles nested emphasis with multiple pairs of delimiters", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "*" },
            { type: "text", value: "world" },
            { type: "text", value: "*" },
            { type: "text", value: " and " },
            { type: "text", value: "**" },
            { type: "text", value: "beyond" },
            { type: "text", value: "**" },
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: false },
            { idx: 3, length: 1, char: "*", canOpen: false, canClose: true },
            { idx: 5, length: 2, char: "*", canOpen: true, canClose: false },
            { idx: 7, length: 2, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(3);
        expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
        expect(nodes[1].type).toBe("emphasis");
        expect(nodes[2].type).toBe("strong");
    });

    test("ignores leftover or unpaired delimiters", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "Hello" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: false },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "Hello" },
        ]);
    });
});

describe("linkResolver", () => {
    test("returns same array if no references exist", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "hello" },
            { type: "text", value: "world" },
        ];
        const refMap = new Map<string, RefDefinition>();
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });

    test("handles empty reference map gracefully", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "[example]" },
        ];
        const result = linkResolver(inputNodes, new Map());
        expect(result).toEqual(inputNodes);
    });

    // Additional reference tests

    test("does not alter nodes without bracket text even if refMap is non-empty", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "hello" },
            { type: "text", value: "world" },
        ];
        const refMap = new Map<string, RefDefinition>();
        refMap.set("example", { label: "example", url: "https://example.com" });
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });

    test("ignores bracket text that doesn't match reference map keys", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "[unknown]" },
        ];
        const refMap = new Map<string, RefDefinition>();
        refMap.set("example", { label: "example", url: "https://example.com" });
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });
});

describe("renderAstToHtml", () => {
    test("renders text node", () => {
        const textNode: MarkdownNode = { type: "text", value: "hello" };
        expect(renderAstToHtml(textNode)).toBe("hello");
    });

    test("renders emphasis node", () => {
        const emphasisNode: MarkdownNode = {
            type: "emphasis",
            children: [{ type: "text", value: "world" }],
        };
        expect(renderAstToHtml(emphasisNode)).toBe("<em>world</em>");
    });

    test("renders strong node", () => {
        const strongNode: MarkdownNode = {
            type: "strong",
            children: [{ type: "text", value: "bold" }],
        };
        expect(renderAstToHtml(strongNode)).toBe("<strong>bold</strong>");
    });

    test("renders code_span node", () => {
        const codeSpan: MarkdownNode = { type: "code_span", code: "x+y" };
        expect(renderAstToHtml(codeSpan)).toBe("<code>x+y</code>");
    });

    test("renders link node", () => {
        const linkNode: MarkdownNode = {
            type: "link",
            url: "http://example.com",
            children: [{ type: "text", value: "example" }],
        };
        expect(renderAstToHtml(linkNode)).toBe('<a href="http://example.com">example</a>');
    });

    // Additional rendering tests

    test("renders nested emphasis within strong", () => {
        const node: MarkdownNode = {
            type: "strong",
            children: [
                { type: "text", value: "hello " },
                {
                    type: "emphasis",
                    children: [
                        { type: "text", value: "world" },
                    ],
                },
            ],
        };
        const result = renderAstToHtml(node);
        expect(result).toBe("<strong>hello <em>world</em></strong>");
    });

    test("renders raw_html node as-is", () => {
        const rawHtmlNode: MarkdownNode = {
            type: "raw_html",
            content: "<b>bold</b>",
        };
        expect(renderAstToHtml(rawHtmlNode)).toBe("<b>bold</b>");
    });

    test("escapes text node content properly", () => {
        const textNode: MarkdownNode = {
            type: "text",
            value: '<script>alert("xss")</script>',
        };
        const result = renderAstToHtml(textNode);
        expect(result).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });
});

describe("wrapBlock", () => {
    test("adds newline when isTop and not last element", () => {
        const result = wrapBlock("<p>test</p>", true, 0, 2);
        expect(result).toBe("<p>test</p>\n");
    });

    test("no newline when last element", () => {
        const result = wrapBlock("<p>test</p>", true, 1, 2);
        expect(result).toBe("<p>test</p>");
    });

    // Additional tests

    test("no newline when not top-level block", () => {
        const result = wrapBlock("<li>test</li>", false, 0, 3);
        expect(result).toBe("<li>test</li>");
    });
});

describe("escapeHtml", () => {
    test("escapes &, <, >, \", and '", () => {
        const input = `& < > " '`;
        const expected = "&amp; &lt; &gt; &quot; &#39;";
        expect(escapeHtml(input)).toBe(expected);
    });

    // Additional tests

    test("handles empty string", () => {
        expect(escapeHtml("")).toBe("");
    });

    test("handles string with no escapable characters", () => {
        expect(escapeHtml("plaintext")).toBe("plaintext");
    });

    test("handles multiple special characters in sequence", () => {
        const input = `&&&<<<>>>""''`;
        // & -> &amp;
        // < -> &lt;
        // > -> &gt;
        // " -> &quot;
        // ' -> &#39;
        const expected = "&amp;&amp;&amp;&lt;&lt;&lt;&gt;&gt;&gt;&quot;&quot;&#39;&#39;";
        expect(escapeHtml(input)).toBe(expected);
    });
});

describe("escapeHtmlAttr", () => {
    test("uses escapeHtml under the hood", () => {
        const input = `&attr"test'`;
        const expected = "&amp;attr&quot;test&#39;";
        expect(escapeHtmlAttr(input)).toBe(expected);
    });

    // Additional tests

    test("handles newline or tab gracefully", () => {
        expect(escapeHtmlAttr('\n\t"')).toBe("\n\t&quot;");
    });

    test("handles a mix of quotes and angle brackets", () => {
        const input = `"foo" <bar>`;
        const expected = `&quot;foo&quot; &lt;bar&gt;`;
        expect(escapeHtmlAttr(input)).toBe(expected);
    });
});

describe("escapeUrl", () => {
    test("escapes quotes", () => {
        const input = 'https://example.com/?a="test"';
        const expected = "https://example.com/?a=%22test%22";
        expect(escapeUrl(input)).toBe(expected);
    });

    // Additional tests

    test("does nothing if no quotes found", () => {
        const input = "https://example.com/path";
        expect(escapeUrl(input)).toBe("https://example.com/path");
    });

    test("escapes multiple quotes in a single url", () => {
        const input = `https://example.com/"foo"?"bar"`;
        const expected = "https://example.com/%22foo%22?%22bar%22";
        expect(escapeUrl(input)).toBe(expected);
    });
});

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

describe("walkBlockTreeAndParseInlines", () => {
    test("should parse paragraphs and headings in document into inline nodes", () => {
        const paragraph: ParagraphNode = {
            type: "paragraph",
            children: []
        } as ParagraphNode
            ; (paragraph as any)._raw = "Some *emphasis* text"

        const heading: HeadingNode = {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "A **strong** heading" }]
        }

        const root: DocumentNode = {
            type: "document",
            children: [paragraph, heading],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(root, root.refDefinitions)

        expect(root.children[0].type).toBe("paragraph")
        expect(root.children[1].type).toBe("heading")

        const paragraphChildren = (root.children[0] as ParagraphNode).children
        expect(paragraphChildren.some(n => n.type === "emphasis")).toBe(true)

        const headingChildren = (root.children[1] as HeadingNode).children
        expect(headingChildren.some(n => n.type === "strong")).toBe(true)
    })

    test("should leave code blocks unchanged", () => {
        const codeBlock = {
            type: "code_block",
            value: "console.log('hello')"
        }
        const root: DocumentNode = {
            type: "document",
            children: [codeBlock],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(root, root.refDefinitions)
        expect(root.children[0]).toStrictEqual(codeBlock)
    })

    test("should recurse through blockquotes", () => {
        const paragraphInside = {
            type: "paragraph",
            children: []
        } as ParagraphNode
            ; (paragraphInside as any)._raw = "`code` block inside"

        const blockquote = {
            type: "blockquote",
            children: [paragraphInside]
        }

        const doc: DocumentNode = {
            type: "document",
            children: [blockquote],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions)
        const nestedParagraph = (doc.children[0] as any).children[0]
        expect(nestedParagraph.type).toBe("paragraph")
        expect(nestedParagraph.children.some((n: any) => n.type === "code_span")).toBe(true)
    })

    test("should handle empty paragraph without errors", () => {
        const emptyParagraph: ParagraphNode = {
            type: "paragraph",
            children: []
        } as ParagraphNode
            ; (emptyParagraph as any)._raw = ""

        const doc: DocumentNode = {
            type: "document",
            children: [emptyParagraph],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions)
        expect(doc.children[0].type).toBe("paragraph")
        expect((doc.children[0] as ParagraphNode).children.length).toBe(0)
    })

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
        }
        const doc: DocumentNode = {
            type: "document",
            children: [heading],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(doc, doc.refDefinitions)
        const processedHeading = doc.children[0] as HeadingNode
        expect(processedHeading.children.some(n => n.type === "emphasis")).toBe(true)
        expect(processedHeading.children.some(n => n.type === "strong")).toBe(true)
    })
})

describe("parseInlineString", () => {
    test("should parse emphasis and strong delimiters", () => {
        const map = new Map<string, RefDefinition>()
        const result = parseInlineString("This *is* **strong** text", map)
        expect(result.some(r => r.type === "emphasis")).toBe(true)
        expect(result.some(r => r.type === "strong")).toBe(true)
    })

    test("should parse code spans", () => {
        const map = new Map<string, RefDefinition>()
        const result = parseInlineString("Here is a `code span` in text", map)
        expect(result.some(r => r.type === "code_span")).toBe(true)
    })

    test("should parse raw HTML tokens if recognized", () => {
        const map = new Map<string, RefDefinition>()
        const result = parseInlineString("Some <div>html</div> content", map)
        expect(result.some(r => r.type === "raw_html")).toBe(true)
    })

    test("should parse autolinks of URLs or emails", () => {
        const map = new Map<string, RefDefinition>()
        const autolink = "Check <http://example.com> or <test@example.org>"
        const result = parseInlineString(autolink, map)
        expect(result.filter(r => r.type === "link")).toHaveLength(2)
    })

    test("should handle multiple consecutive emphasis tokens correctly", () => {
        const map = new Map<string, RefDefinition>()
        const multiple = "Text ***with multiple*** tokens"
        const result = parseInlineString(multiple, map)
        // Expect a combination of strong + emphasis or emphasis + strong
        expect(result.some(r => r.type === "strong")).toBe(true)
        expect(result.some(r => r.type === "emphasis")).toBe(true)
    })

    test("should handle mismatched emphasis tokens as literal text", () => {
        const map = new Map<string, RefDefinition>()
        const mismatched = "some *emphasis ** mismatch"
        const result = parseInlineString(mismatched, map)
        // No strong or emphasis should be found because mismatch
        expect(result.every(r => r.type !== "emphasis" && r.type !== "strong")).toBe(true)
    })

    test("should handle backslashes that escape punctuation", () => {
        const map = new Map<string, RefDefinition>()
        const escaped = "escaping \\* star but not this *one*"
        const result = parseInlineString(escaped, map)
        expect(result.some(r => r.type === "emphasis")).toBe(true)
        // The first star was escaped => literal
        expect(result.filter(r => r.type === "text").some(t => (t as any).value.includes("*"))).toBe(true)
    })

    test("should handle empty string input without errors", () => {
        const map = new Map<string, RefDefinition>()
        const result = parseInlineString("", map)
        expect(result).toHaveLength(0)
    })
})

describe("lexInline", () => {
    test("should tokenize text with emphasis delimiters", () => {
        const tokens = lexInline("*emph* _alsoEmph_")
        expect(tokens.some(t => t.type === "delim" && t.content === "*")).toBe(true)
        expect(tokens.some(t => t.type === "delim" && t.content === "_")).toBe(true)
    })

    test("should handle code backticks", () => {
        const tokens = lexInline("Some `code` text")
        expect(tokens.some(t => t.type === "code_span")).toBe(true)
    })

    test("should handle backslash escapes", () => {
        const tokens = lexInline("Line with \\*escaped star*")
        expect(tokens.some(t => t.type === "text" && t.content === "*")).toBe(true)
    })

    test("should produce a softbreak for newline characters", () => {
        const tokens = lexInline("Line1\nLine2")
        expect(tokens.some(t => t.type === "softbreak")).toBe(true)
    })

    test("should handle multiple consecutive backticks", () => {
        const tokens = lexInline("``double ticks`` still code `single`")
        expect(tokens.filter(t => t.type === "code_span")).toHaveLength(2)
    })

    test("should handle text containing angle brackets not matching autolink or raw HTML", () => {
        const tokens = lexInline("regular < text > not autolink")
        expect(tokens.some(t => t.type === "text" && t.content === "<")).toBe(true)
        expect(tokens.some(t => t.type === "text" && t.content === ">")).toBe(true)
        expect(tokens.every(t => t.type !== "autolink")).toBe(true)
    })

    test("should handle empty input", () => {
        const tokens = lexInline("")
        expect(tokens).toHaveLength(0)
    })
})

describe("matchAutolink", () => {
    test("should return an object with content and length for valid autolink", () => {
        const input = "<http://example.com>"
        const match = matchAutolink(input, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("http://example.com")
        expect(match?.length).toBe(input.length)
    })

    test("should return null if the angle-brackets do not match an autolink", () => {
        const input = "<not an autolink"
        const match = matchAutolink(input, 0)
        expect(match).toBeNull()
    })

    test("should match emails as autolinks", () => {
        const input = "<test@example.com>"
        const match = matchAutolink(input, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("test@example.com")
    })

    test("should handle ftp URLs as autolinks", () => {
        const input = "<ftp://my.server.org/files>"
        const match = matchAutolink(input, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("ftp://my.server.org/files")
    })

    test("should handle scheme with +, ., or - in it (e.g. mailto:, myapp+foo: )", () => {
        const input = "<myapp+foo://someThing>"
        const match = matchAutolink(input, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("myapp+foo://someThing")
    })

    test("should return null for angle bracket text that doesn't follow scheme/email pattern", () => {
        const input = "<noSchemeYet>"
        const match = matchAutolink(input, 0)
        expect(match).toBeNull()
    })
})

describe("matchRawInlineHtml", () => {
    test("should capture raw inline HTML with angle brackets", () => {
        const html = `<div class="test">`
        const match = matchRawInlineHtml(html, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe(html)
        expect(match?.length).toBe(html.length)
    })

    test("should return null for text that does not match inline HTML", () => {
        const text = "< not actually html>"
        const match = matchRawInlineHtml(text, 0)
        expect(match).toBeNull()
    })

    test("should handle closing tags", () => {
        const html = "</span>"
        const match = matchRawInlineHtml(html, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("</span>")
    })

    test("should handle self-closing tags", () => {
        const html = "<img src='test.png'/>"
        const match = matchRawInlineHtml(html, 0)
        expect(match).not.toBeNull()
        expect(match?.content).toBe("<img src='test.png'/>")
    })

    test("should return null if HTML spans multiple lines", () => {
        // The simple regex in matchRawInlineHtml doesn't handle multiline tags
        const multiLine = `<div\nclass="multi-line">`
        const match = matchRawInlineHtml(multiLine, 0)
        expect(match).toBeNull()
    })
})