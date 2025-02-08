import { test, expect } from "bun:test";
import {
    // AST and helper functions
    createTextNode,
    applyInlineParsing,
    renderAstToHtml,
    // Block parsing functions
    expandTabsAndNormalizeNewlines,
    blockParseToAst,
    isBlockquoteLine,
    parseBlockquote,
    isFencedCodeStart,
    parseFencedCode,
    isFencedCodeEnd,
    isThematicBreak,
    isAtxHeading,
    createAtxHeading,
    isListStart,
    parseList,
    isHtmlBlockStart,
    parseHtmlBlock,
    isIndentedCode,
    parseIndentedCode,
    parseParagraph,
    // Main entry point
    parseMarkdown,
    // Types
    type CodeBlockNode,
    type ParagraphNode,
    type BlockquoteNode,
    type HeadingNode,
    type ListNode,
    type HtmlBlockNode,
} from "@/index";

////////////////////////////////////////////////////////////////////////////////////////////////////
// expandTabsAndNormalizeNewlines
////////////////////////////////////////////////////////////////////////////////////////////////////
test("expandTabsAndNormalizeNewlines converts tabs and CRLF", () => {
    const input = "Line\twith\ttabs\r\nAnother line\rEnd";
    const output = expandTabsAndNormalizeNewlines(input);
    expect(output).toBe("Line    with    tabs\nAnother line\nEnd");
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Blockquote parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isBlockquoteLine detects blockquote lines", () => {
    expect(isBlockquoteLine("> This is a quote")).toBe(true);
    expect(isBlockquoteLine("   > Another quote")).toBe(true);
    expect(isBlockquoteLine("No quote here")).toBe(false);
});

test("parseBlockquote parses consecutive blockquote lines", () => {
    const lines = [
        "> Quote line 1",
        "> Quote line 2",
        "",
        "Not a quote",
    ];
    const { node, linesUsed } = parseBlockquote(lines, 0);
    expect(node.type).toBe("blockquote");
    // Expect to have parsed both non-blank quote lines
    expect(linesUsed).toBe(3);
    const html = renderAstToHtml(node);
    // Since blockParseToAst on the joined lines creates a paragraph,
    // the expected HTML is a blockquote with one paragraph.
    expect(html).toBe("<blockquote><p>Quote line 1\nQuote line 2</p></blockquote>");
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Fenced code parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isFencedCodeStart detects fenced code", () => {
    expect(isFencedCodeStart("```")).toBe(true);
    expect(isFencedCodeStart("~~~")).toBe(true);
    expect(isFencedCodeStart("``")).toBe(false);
});

test("parseFencedCode parses a fenced code block", () => {
    const lines = [
        "```js",
        "console.log('Hello');",
        "```",
        "Next paragraph"
    ];
    const { node, linesUsed } = parseFencedCode(lines, 0);
    expect(node.type).toBe("code_block");
    expect(node.language).toBe("js");
    expect(node.value).toBe("console.log('Hello');");
    expect(linesUsed).toBe(3);
});

test("isFencedCodeEnd works correctly", () => {
    // fence with 3 backticks
    expect(isFencedCodeEnd("```", "`", 3)).toBe(true);
    expect(isFencedCodeEnd("````", "`", 3)).toBe(true);
    expect(isFencedCodeEnd("``", "`", 3)).toBe(false);
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Thematic Break parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isThematicBreak detects valid thematic breaks", () => {
    expect(isThematicBreak("---")).toBe(true);
    expect(isThematicBreak("***")).toBe(true);
    expect(isThematicBreak("___")).toBe(true);
    expect(isThematicBreak("--")).toBe(false);
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// ATX Headings
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isAtxHeading and createAtxHeading handle headings", () => {
    expect(isAtxHeading("# Heading")).toBe(true);
    const headingNode: HeadingNode = createAtxHeading("### Heading 3 ###");
    expect(headingNode.type).toBe("heading");
    expect(headingNode.level).toBe(3);
    const html = renderAstToHtml(headingNode);
    expect(html).toBe("<h3>Heading 3</h3>");
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// List parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isListStart and parseList detect and parse lists", () => {
    const lines = [
        "- Item 1",
        "- Item 2",
        "",
        "Not a list"
    ];
    expect(isListStart(lines[0].trim())).toBe(true);
    const { listNode, usedLines } = parseList(lines, 0);
    expect(listNode.type).toBe("list");
    expect(listNode.ordered).toBe(false);
    expect(listNode.children.length).toBe(2);
    // The blank line is counted as affecting tightness so usedLines should be 3.
    expect(usedLines).toBe(3);
    const html = renderAstToHtml(listNode);
    // Each list item renders a paragraph inside an <li> (due to blockParseToAst and parseParagraph)
    expect(html).toBe("<ul><li><p>Item 1</p></li><li><p>Item 2</p></li></ul>");
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// HTML Block parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isHtmlBlockStart and parseHtmlBlock detect HTML blocks", () => {
    const lines = [
        "<div>",
        "Some HTML content",
        "</div>",
        "",
        "Paragraph after"
    ];
    expect(isHtmlBlockStart(lines[0].trim())).toBe(true);
    const { node, linesUsed } = parseHtmlBlock(lines, 0);
    expect(node.type).toBe("html_block");
    expect(node.value).toBe("<div>\nSome HTML content\n</div>");
    expect(linesUsed).toBe(3);
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Indented code block parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("isIndentedCode and parseIndentedCode handle indented code", () => {
    const lines = [
        "    const a = 10;",
        "    console.log(a);",
        "Not indented"
    ];
    expect(isIndentedCode(lines[0])).toBe(true);
    const { codeNode, linesUsed } = parseIndentedCode(lines, 0);
    expect(codeNode.type).toBe("code_block");
    expect(codeNode.value).toBe("const a = 10;\nconsole.log(a);");
    expect(linesUsed).toBe(2);
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Paragraph parsing
////////////////////////////////////////////////////////////////////////////////////////////////////
test("parseParagraph collects consecutive non-block lines", () => {
    const lines = [
        "This is a paragraph.",
        "Still same paragraph.",
        "",
        "Next paragraph"
    ];
    const { paragraph, linesUsed } = parseParagraph(lines, 0);
    expect(paragraph.type).toBe("paragraph");
    const html = renderAstToHtml(paragraph);
    expect(html).toBe("<p>This is a paragraph.\nStill same paragraph.</p>");
    expect(linesUsed).toBe(2);
});


test("applyInlineParsing replaces paragraph text with inline nodes", () => {
    // Create a paragraph node with a single text child.
    const para: ParagraphNode = {
        type: "paragraph",
        children: [createTextNode("This is *emphasis* text")]
    };
    applyInlineParsing(para);
    // With our trivial inlineParse, the content remains the same.
    expect(para.children.length).toBe(1);
    expect(para.children[0].type).toBe("text");
    const html = renderAstToHtml(para);
    expect(html).toBe("<p>This is *emphasis* text</p>");
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// Rendering: Code Block, Headings, Paragraphs, etc.
////////////////////////////////////////////////////////////////////////////////////////////////////
test("renderAstToHtml converts a code block to HTML", () => {
    const codeNode: CodeBlockNode = {
        type: "code_block",
        language: "ts",
        value: "console.log('test');"
    };
    const html = renderAstToHtml(codeNode);
    expect(html).toBe('<pre><code class="language-ts">console.log(&#39;test&#39;);</code></pre>');
});

////////////////////////////////////////////////////////////////////////////////////////////////////
// End-to-End Parsing and Rendering
////////////////////////////////////////////////////////////////////////////////////////////////////
test("parseMarkdown end-to-end renders all block types", () => {
    const md = `
# Heading 1

Paragraph text with some *inline* content.

> A blockquote with
> multiple lines.

- List item 1
- List item 2

\`\`\`js
console.log("Hello World");
\`\`\`
  `;
    const html = parseMarkdown(md);
    expect(html).toContain("<h1>Heading 1</h1>");
    expect(html).toContain("<p>Paragraph text with some *inline* content.</p>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<pre><code");
    // Note: Inline content remains unparsed for emphasis as inlineParse is minimal.
});