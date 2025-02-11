
import { test, describe, expect } from "bun:test";
import { parseMarkdown } from "@/parse-markdown";


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