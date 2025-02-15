import type { InlineToken, RefDefinition } from "@/ast";
import { parseInlinesWithDelimiterStack } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

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

    test("handles triple emphasis delimiters *** as strong + em or just strong if no matching openers", () => {
        const tokens: InlineToken[] = [
            { type: "delim", content: "***" },
            { type: "text", content: "hello" },
            { type: "delim", content: "***" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        const onlyNode = result[0];
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

    test("handles basic inline link", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "This is a " },
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com" },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(2);
        expect(result[0]).toEqual({ type: "text", value: "This is a " });
        expect(result[1]).toEqual({
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "link" }],
        });
    });

    test("handles link with title", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com" },
            { type: "text", content: ' "My Title"' },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            title: "My Title",
            children: [{ type: "text", value: "link" }],
        });
    });

    test("handles link with empty title", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com" },
            { type: "text", content: ' ""' },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            title: "",
            children: [{ type: "text", value: "link" }],
        });
    });

    test("handles link with no title and spaces in URL", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "<https://example.com/a b>" },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com/a b",
            children: [{ type: "text", value: "link" }],
        });
    });

    test("handles link with angle brackets around URL", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "<https://example.com>" },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "link" }],
        });
    });

    test("handles image link", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "!" },
            { type: "lbracket", content: "[" },
            { type: "text", content: "alt text" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com/image.jpg" },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "image",
            url: "https://example.com/image.jpg",
            alt: "alt text",
        });
    });

    test("handles image link with title", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "!" },
            { type: "lbracket", content: "[" },
            { type: "text", content: "alt text" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com/image.jpg" },
            { type: "text", content: ' "Image Title"' },
            { type: "rparen", content: ")" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "image",
            url: "https://example.com/image.jpg",
            alt: "alt text",
            title: "Image Title",
        });
    });

    test("handles reference link", () => {
        const refMap = new Map<string, RefDefinition>();
        refMap.set("myref", { label: "myref", url: "https://example.com", title: "Ref Title" });

        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "link text" },
            { type: "rbracket", content: "]" },
            { type: "lbracket", content: "[" },
            { type: "text", content: "myref" },
            { type: "rbracket", content: "]" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, refMap);
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            title: "Ref Title",
            children: [{ type: "text", value: "link text" }],
        });
    });

    test("handles collapsed reference link", () => {
        const refMap = new Map<string, RefDefinition>();
        refMap.set("myref", { label: "myref", url: "https://example.com", title: "Ref Title" });

        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "myref" },
            { type: "rbracket", content: "]" },
            { type: "lbracket", content: "[" },
            { type: "rbracket", content: "]" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, refMap);
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            title: "Ref Title",
            children: [{ type: "text", value: "myref" }],
        });
    });

    test("handles shortcut reference link", () => {
        const refMap = new Map<string, RefDefinition>();
        refMap.set("myref", { label: "myref", url: "https://example.com", title: "Ref Title" });

        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "myref" },
            { type: "rbracket", content: "]" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, refMap);
        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            type: "link",
            url: "https://example.com",
            title: "Ref Title",
            children: [{ type: "text", value: "myref" }],
        });
    });

    test("handles mismatched brackets as text", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "unclosed bracket" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: "text", value: "[" },
            { type: "text", value: "unclosed bracket" },
        ]);
    });

    test("handles link inside emphasis", () => {
        const tokens: InlineToken[] = [
            { type: "delim", content: "*" },
            { type: "lbracket", content: "[" },
            { type: "text", content: "link" },
            { type: "rbracket", content: "]" },
            { type: "lparen", content: "(" },
            { type: "text", content: "https://example.com" },
            { type: "rparen", content: ")" },
            { type: "delim", content: "*" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result.length).toBe(1);
        expect(result[0].type).toBe("emphasis");
        expect((result[0] as any).children[0]).toEqual({
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "link" }],
        });
    });
});