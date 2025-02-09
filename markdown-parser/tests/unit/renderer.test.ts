import type { MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { renderAstToHtml, wrapBlock, escapeHtml, escapeHtmlAttr, escapeUrl } from "@/renderer";

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
