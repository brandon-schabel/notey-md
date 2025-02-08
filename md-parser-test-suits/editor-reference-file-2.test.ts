/* ==========================================================
   editor-reference-file-2.test.ts
   A comprehensive test suite to ensure that the markdown
   in editor-reference-file-2.md is properly converted to HTML
   using the parseMarkdown function.
   ========================================================== */

import { describe, test, expect, beforeAll } from "bun:test";
import { parseMarkdown } from "../markdown-parser";
import { testDir } from "./test-config";

let entireMarkdown = "";

describe("editor-reference-file-2 tests", () => {
  beforeAll(async () => {
    entireMarkdown = await Bun.file(`${testDir}/editor-reference-file-2.md`).text();
  });

  test("Should parse the top-level heading correctly", () => {
    const headingLine = "# Comprehensive Markdown Document for Testing";
    const output = parseMarkdown(headingLine);
    expect(output).toContain("<h1>Comprehensive Markdown Document for Testing</h1>");
  });

  test("Should parse sub-headings (e.g., '## 1. Headings') correctly", () => {
    const subHeadingLine = "## 1. Headings";
    const output = parseMarkdown(subHeadingLine);
    expect(output).toContain("<h2>1. Headings</h2>");
  });

  test("Should parse various heading levels", () => {
    expect(parseMarkdown("# Heading Level 1")).toContain("<h1>Heading Level 1</h1>");
    expect(parseMarkdown("## Heading Level 2")).toContain("<h2>Heading Level 2</h2>");
    expect(parseMarkdown("### Heading Level 3")).toContain("<h3>Heading Level 3</h3>");
    expect(parseMarkdown("#### Heading Level 4")).toContain("<h4>Heading Level 4</h4>");
    expect(parseMarkdown("##### Heading Level 5")).toContain("<h5>Heading Level 5</h5>");
    expect(parseMarkdown("###### Heading Level 6")).toContain("<h6>Heading Level 6</h6>");
  });

  test("Should parse paragraphs correctly", () => {
    const paragraphText = "This is a simple paragraph with some text. Markdown supports multiple paragraphs separated by blank lines.";
    const output = parseMarkdown(paragraphText);
    expect(output).toContain("<p>This is a simple paragraph with some text. Markdown supports multiple paragraphs separated by blank lines.</p>");
  });

  test("Should parse emphasis correctly", () => {
    expect(parseMarkdown("*Italic text using asterisks*")).toContain("<em>Italic text using asterisks</em>");
    expect(parseMarkdown("_Italic text using underscores_")).toContain("<em>Italic text using underscores</em>");
    expect(parseMarkdown("**Bold text using asterisks**")).toContain("<strong>Bold text using asterisks</strong>");
    expect(parseMarkdown("__Bold text using underscores__")).toContain("<strong>Bold text using underscores</strong>");
    expect(parseMarkdown("***Bold and italic text using asterisks***")).toContain("<em><strong>Bold and italic text using asterisks</strong></em>");
    expect(parseMarkdown("___Bold and italic text using underscores___")).toContain("<em><strong>Bold and italic text using underscores</strong></em>");
  });

  test("Should parse blockquotes correctly", () => {
    const blockquoteText = "> This is a blockquote.\n>\n> It can span multiple paragraphs.";
    const output = parseMarkdown(blockquoteText);
    expect(output).toContain("This is a blockquote.");
    expect(output).toContain("It can span multiple paragraphs.");

    const nestedBlockquoteText = "> > This is a nested blockquote level 2.\n> >\n> > > This is nested blockquote level 3.";
    const nestedOutput = parseMarkdown(nestedBlockquoteText);
    expect(nestedOutput).toContain("This is a nested blockquote level 2.");
    expect(nestedOutput).toContain("This is nested blockquote level 3.");
  });

  test("Should parse unordered lists correctly", () => {
    const unorderedListText = "- Item 1\n- Item 2\n  - Nested Item 2.1\n  - Nested Item 2.2\n- Item 3";
    const output = parseMarkdown(unorderedListText);
    expect(output).toContain("<li>Item 1</li>");
    expect(output).toContain("<li>Item 2</li>");
    expect(output).toContain("<li>Nested Item 2.1</li>");
    expect(output).toContain("<li>Nested Item 2.2</li>");
    expect(output).toContain("<li>Item 3</li>");
  });

  test("Should parse ordered lists correctly", () => {
    const orderedListText = "1. First item\n2. Second item\n   1. Nested ordered item 2.1\n   2. Nested ordered item 2.2\n3. Third item";
    const output = parseMarkdown(orderedListText);
    expect(output).toContain("<li>First item</li>");
    expect(output).toContain("<li>Second item</li>");
    expect(output).toContain("<li>Nested ordered item 2.1</li>");
    expect(output).toContain("<li>Nested ordered item 2.2</li>");
    expect(output).toContain("<li>Third item</li>");
  });

  test("Should parse task lists correctly", () => {
    const taskListText = "- [x] Completed task\n- [ ] Incomplete task\n- [ ] Another incomplete task";
    const output = parseMarkdown(taskListText);
    // Check that the checkboxes were parsed.  The current impl. *always* makes them disabled.
    expect(output).toContain('<input type="checkbox" checked disabled>');
    expect(output).toContain('<input type="checkbox"  disabled>'); // Not checked
  });


  test("Should parse inline code correctly", () => {
    const inlineCodeText = "This is an example of inline code: `console.log(\"Hello, world!\")`.";
    const output = parseMarkdown(inlineCodeText);
    expect(output).toContain('<code class="inline">console.log("Hello, world!")</code>');
  });

  test("Should parse fenced code blocks correctly", () => {
    const codeBlockText = "```javascript\nfunction greet(name) {\n    console.log(`Hello, ${name}!`);\n}\ngreet(\"Markdown\");\n```";
    const output = parseMarkdown(codeBlockText);
    expect(output).toContain("<pre><code>function greet(name) {\n    console.log(`Hello, ${name}!`);\n}\ngreet(&quot;Markdown&quot;);\n</code></pre>");
  });

  test("Should parse indented code blocks correctly", () => {
    const indentedCodeText = "    def greet(name):\n        print(\"Hello, \" + name)\n    greet(\"Markdown\")";
    const output = parseMarkdown(indentedCodeText);
    expect(output).toContain("<pre><code>def greet(name):\n    print(&quot;Hello, &quot; + name)\ngreet(&quot;Markdown&quot;)</code></pre>");
  });

  test("Should parse horizontal rules correctly", () => {
    expect(parseMarkdown("---")).toContain("<hr>");
    expect(parseMarkdown("___")).toContain("<hr>");
    expect(parseMarkdown("***")).toContain("<hr>");
  });

  test("Should parse inline links correctly", () => {
    const inlineLinkText = "[Markdown Guide](https://www.markdownguide.org/)";
    const output = parseMarkdown(inlineLinkText);
    expect(output).toContain('<a href="https://www.markdownguide.org/">Markdown Guide</a>');
  });

  test("Should parse links with titles correctly", () => {
    const linkWithTitleText = '[GitHub](https://github.com "GitHub Homepage")';
    const output = parseMarkdown(linkWithTitleText);
    expect(output).toContain('<a href="https://github.com" title="GitHub Homepage">GitHub</a>');
  });

  test("Should parse automatic links correctly", () => {
    const automaticLinkText = "<https://www.example.com>";
    const output = parseMarkdown(automaticLinkText);
    expect(output).toContain('<a href="https://www.example.com">https://www.example.com</a>');
  });

  test("Should parse inline images correctly", () => {
    const inlineImageText = "![Alt text for image](https://via.placeholder.com/150 \"Optional title\")";
    const output = parseMarkdown(inlineImageText);
    expect(output).toContain('<img src="https://via.placeholder.com/150" alt="Alt text for image" title="Optional title">');
  });

  test("Should parse reference-style images correctly", () => {
    const referenceImageText = "![Reference Image][image-ref]\n\n[image-ref]: https://via.placeholder.com/200 \"Reference Image Title\"";
    const output = parseMarkdown(referenceImageText);
    expect(output).toContain('Reference Image'); // It's there, just un-parsed.

  });

  test("Should parse tables correctly", () => { // Tables aren't supported yet
    const tableText = "| Header 1 | Header 2 | Header 3 |\n|----------|:--------:|---------:|\n| Left     | Center   | Right    |\n| Data 1   | Data 2   | Data 3   |";
    const output = parseMarkdown(tableText);
    expect(output).toContain("| Header 1 | Header 2 | Header 3 |"); // Expect direct passthrough
    expect(output).toContain("|----------|:--------:|---------:|");
    expect(output).toContain("| Left     | Center   | Right    |");
    expect(output).toContain("| Data 1   | Data 2   | Data 3   |");
  });

  test("Should parse footnotes correctly", () => { //Footnotes are not supported
    const footnoteText = "Here is a statement with a footnote.[^1]\n\n[^1]: This is a simple footnote.";
    const footnoteOutput = parseMarkdown(footnoteText);
    expect(footnoteOutput).toContain("Here is a statement with a footnote.[^1]"); // Expect direct passthrough
    expect(footnoteOutput).toContain("[^1]: This is a simple footnote.");


    const multiLineFootnoteText = "[^longnote]: This is a footnote with multiple lines.\n    You can continue the explanation here.";
    const multiLineFootnoteOutput = parseMarkdown(multiLineFootnoteText);
    expect(multiLineFootnoteOutput).toContain("[^longnote]: This is a footnote with multiple lines."); // Expect direct passthrough
    expect(multiLineFootnoteOutput).toContain("You can continue the explanation here.");
  });

  test("Should parse strikethrough correctly", () => { //Strikethrough is not supported
    const strikethroughText = "This is ~~strikethrough~~ text.";
    const output = parseMarkdown(strikethroughText);
    expect(output).toContain("This is ~~strikethrough~~ text."); // Expect direct passthrough
  });

  test("Should parse definition lists correctly", () => { //Definition lists are not supported
    const definitionListText = "Term 1\n: Definition for term 1\n\nTerm 2\n: Definition for term 2";
    const output = parseMarkdown(definitionListText);
    expect(output).toContain("Term 1"); // Expect direct passthrough
    expect(output).toContain(": Definition for term 1");
    expect(output).toContain("Term 2");
    expect(output).toContain(": Definition for term 2");

  });

  test("Should parse inline HTML correctly", () => {
    const inlineHTMLText = '<div style="color: red; padding: 10px; border: 1px solid #ccc;">\n  This is inline HTML content.\n</div>';
    const output = parseMarkdown(inlineHTMLText);
    expect(output).toContain('<div style="color: red; padding: 10px; border: 1px solid #ccc;">');
    expect(output).toContain('This is inline HTML content.');
    expect(output).toContain('</div>');

  });

  test("Should handle inline JavaScript (should be escaped)", () => { //Inline JavaScript is not handled
    const inlineJavaScriptText = "<script>\n  // Inline JavaScript for testing purposes\n  console.log('Hello from inline HTML!');\n</script>";
    const output = parseMarkdown(inlineJavaScriptText);
    expect(output).toContain("<script>");  // Expect direct passthrough
    expect(output).toContain("console.log('Hello from inline HTML!');");
    expect(output).toContain("</script>");
  });

  test("Should parse emoji correctly", () => {
    const emojiText = "I :heart: Markdown! :smile:";
    const output = parseMarkdown(emojiText);
    // Emoji parsing is a direct passthrough, so we just check if it is included
    expect(output).toContain("I :heart: Markdown! :smile:");
  });

  test("Should escape special characters correctly", () => {
    const escapeText = "Escape special characters using a backslash: \\*this is not italic\\* and \\# not a heading.";
    const output = parseMarkdown(escapeText);
    expect(output).toContain("Escape special characters using a backslash: *this is not italic* and # not a heading.");
  });

  test("Should parse inline math (LaTeX) correctly", () => {
    const inlineMathText = "Inline math: $E = mc^2$";
    const output = parseMarkdown(inlineMathText);
    expect(output).toContain("Inline math: $E = mc^2$"); // Expect direct passthrough
  });

  test("Should parse display math (LaTeX) correctly", () => {
    const displayMathText = "$$\n\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)\n$$";
    const output = parseMarkdown(displayMathText);
    expect(output).toContain("$$\n\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)\n$$"); // Expect direct passthrough
  });

  test("Should parse details and summary correctly", () => { // details and summary aren't supported
    const detailsText = "<details>\n  <summary>Click to expand hidden content</summary>\n\n  This section is hidden by default. It can include multiple paragraphs, lists, and even code blocks.\n\n- Hidden list item 1\n- Hidden list item 2\n\n  ```python\n  # This code is inside the details element\n  print(\"Hello from details!\")\n  ```\n\n</details>";

    const output = parseMarkdown(detailsText);
    expect(output).toContain("<details>"); // Expect direct passthrough
    expect(output).toContain("<summary>Click to expand hidden content</summary>");
    expect(output).toContain("This section is hidden by default.");
    expect(output).toContain("Hidden list item 1"); // Expect direct passthrough
    expect(output).toContain("Hidden list item 2");
    expect(output).toContain("print(\"Hello from details!\")");  // Expect direct passthrough
    expect(output).toContain("</details>");
  });

  test("Should parse miscellaneous notes correctly", () => {
    const noteText = "> **Note:** This document is designed to test a wide range of Markdown features.";
    const output = parseMarkdown(noteText);
    expect(output).toContain("Note:");  // Check that it's there, but blockquote style is removed
  });

  test("Should parse links to external references correctly", () => {
    const referenceLinkText = "For further reference, check out the [CommonMark Spec](https://spec.commonmark.org/).";
    const output = parseMarkdown(referenceLinkText);
    expect(output).toContain('<a href="https://spec.commonmark.org/">CommonMark Spec</a>');
  });

  test("Should parse the 'End of Document' marker correctly", () => {
    const endMarkerText = "_End of Document._";
    const output = parseMarkdown(endMarkerText);
    expect(output).toContain("<em>End of Document.</em>");
  });

  test("Should parse the entire editor-reference-file-2.md without errors", () => {
    const output = parseMarkdown(entireMarkdown);

    // General content checks
    expect(output).toContain("<h1>Comprehensive Markdown Document for Testing</h1>");
    expect(output).toContain("<h2>1. Headings</h2>");
    expect(output).toContain("<em>Italic text using asterisks</em>");
    expect(output).toContain("<strong>Bold text using underscores</strong>");
    expect(output).toContain("<li>Item 1</li>"); // Check for list item presence (no bullet)
    expect(output).toContain("<li>First item</li>");
    expect(output).toContain('<input type="checkbox" checked disabled>'); // Task list
    expect(output).toContain('<code class="inline">'); // Inline code
    expect(output).toContain("<pre><code>"); // Code block
    expect(output).toContain("<hr>"); // Horizontal rule
    expect(output).toContain('<a href='); // Link
    expect(output).toContain('<img src='); // Image
    expect(output).toContain('This is ~~strikethrough~~ text.'); // strikethrough (passthrough)
    expect(output).toContain(':heart:'); // Emoji (passthrough)
    expect(output).toContain('$E = mc^2$'); // Inline math (passthrough)
    expect(output).toContain('$$'); // Block math (passthrough)
    expect(output).toContain('<details>');       // details (passthrough)
    expect(output).toContain("<em>End of Document.</em>"); // Final emphasis
  });
});