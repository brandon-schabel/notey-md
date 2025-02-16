import type { InlineToken, RefDefinition } from "@/ast";
import { adjustDelimiterIndexes, isLeftFlankingDelimiterRun, isRightFlankingDelimiterRun, parseInlinesWithDelimiterStack } from "@/inline-parser/parse-inlines-with-delimiter-stack";
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
        expect(result).toEqual([
            { type: 'text', value: 'Hello ' },
            { type: 'emphasis', children: [{ type: 'text', value: 'world' }] }
        ]);
    });

    test("handles delim tokens for strong emphasis (double asterisk)", () => {
        const tokens: InlineToken[] = [
            { type: "text", content: "Hello " },
            { type: "delim", content: "**" },
            { type: "text", content: "world" },
            { type: "delim", content: "**" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: 'text', value: 'Hello ' },
            { type: 'strong', children: [{ type: 'text', value: 'world' }] }
        ]);
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

    test("handles triple emphasis delimiters *** as strong + em", () => {
        const tokens: InlineToken[] = [
            { type: "delim", content: "***" },
            { type: "text", content: "hello" },
            { type: "delim", content: "***" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            {
                type: 'strong',
                children: [{ type: 'emphasis', children: [{ type: 'text', value: 'hello' }] }]
            }
        ]);
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
        expect(result).toEqual([
            { type: 'emphasis', children: [{ type: 'text', value: 'world' }] },
            { type: 'text', value: '!' }
        ]);
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
        expect(result).toEqual([
            { type: 'text', value: 'This is a ' },
            {
                type: 'link',
                url: 'https://example.com',
                title: '',
                children: [{ type: 'text', value: 'link' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: 'My Title',
                children: [{ type: 'text', value: 'link' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: '',
                children: [{ type: 'text', value: 'link' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com/a b',
                title: '',
                children: [{ type: 'text', value: 'link' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: '',
                children: [{ type: 'text', value: 'link' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'image',
                url: 'https://example.com/image.jpg',
                title: '',
                alt: 'alt text'
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'image',
                url: 'https://example.com/image.jpg',
                alt: 'alt text',
                title: 'Image Title'
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: 'Ref Title',
                children: [{ type: 'text', value: 'link text' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: 'Ref Title',
                children: [{ type: 'text', value: 'myref' }]
            }
        ]);
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
        expect(result).toEqual([
            {
                type: 'link',
                url: 'https://example.com',
                title: 'Ref Title',
                children: [{ type: 'text', value: 'myref' }]
            }
        ]);
    });

    test("handles mismatched brackets as text", () => {
        const tokens: InlineToken[] = [
            { type: "lbracket", content: "[" },
            { type: "text", content: "unclosed bracket" },
        ];
        const result = parseInlinesWithDelimiterStack(tokens, new Map());
        expect(result).toEqual([
            { type: 'text', value: '[' },
            { type: 'text', value: 'unclosed bracket' }
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
        expect(result).toEqual([
            {
                type: 'emphasis',
                children: [
                    {
                        type: 'link',
                        url: 'https://example.com',
                        title: '',
                        children: [{ type: 'text', value: 'link' }]
                    }
                ]
            }
        ]);
    });
});










describe("isLeftFlankingDelimiterRun", () => {
    describe("for asterisk (*)", () => {
        test("returns true if next char is not whitespace", () => {
            expect(isLeftFlankingDelimiterRun("*", "", "a", 1)).toBe(true);
            expect(isLeftFlankingDelimiterRun("*", " ", "b", 1)).toBe(true);
            expect(isLeftFlankingDelimiterRun("*", "!", "c", 1)).toBe(true);
        });

        test("returns false if next char is whitespace", () => {
            expect(isLeftFlankingDelimiterRun("*", "", " ", 1)).toBe(false);
            expect(isLeftFlankingDelimiterRun("*", "a", "\t", 1)).toBe(false);
            expect(isLeftFlankingDelimiterRun("*", "!", "\n", 1)).toBe(false);
        });

        test("handles empty nextChar", () => {
            expect(isLeftFlankingDelimiterRun("*", "", "", 1)).toBe(false);
        });
    });

    describe("for underscore (_)", () => {
        test("returns true if next char is not whitespace or alphanumeric, and last char is not alphanumeric", () => {
            expect(isLeftFlankingDelimiterRun("_", "!", "!", 1)).toBe(true);
            expect(isLeftFlankingDelimiterRun("_", " ", ".", 1)).toBe(true);
            expect(isLeftFlankingDelimiterRun("_", "", "-", 1)).toBe(true);
        });

        test("returns false if next char is whitespace", () => {
            expect(isLeftFlankingDelimiterRun("_", "", " ", 1)).toBe(false);
            expect(isLeftFlankingDelimiterRun("_", "a", "\t", 1)).toBe(false);
            expect(isLeftFlankingDelimiterRun("_", "!", "\n", 1)).toBe(false);
        });

        test("returns false if next char is alphanumeric and last char is also alphanumeric", () => {
            expect(isLeftFlankingDelimiterRun("_", "a", "b", 1)).toBe(false);
            expect(isLeftFlankingDelimiterRun("_", "1", "2", 1)).toBe(false);
        });

        test("returns false if next char is underscore", () => {
            expect(isLeftFlankingDelimiterRun("_", "", "_", 1)).toBe(false);
        });

        test("handles empty nextChar", () => {
            expect(isLeftFlankingDelimiterRun("_", "", "", 1)).toBe(false);
        });

        test("handles next char alphanumeric, last char not alphanumeric", () => {
            expect(isLeftFlankingDelimiterRun("_", "!", "a", 1)).toBe(true);
        });
    });

    test("returns false for unknown delimiter characters", () => {
        expect(isLeftFlankingDelimiterRun("$", "", "a", 1)).toBe(false);
        expect(isLeftFlankingDelimiterRun("!", " ", "b", 1)).toBe(false);
    });
});



describe("isRightFlankingDelimiterRun", () => {
    describe("for asterisk (*)", () => {
        test("returns true if last char is not whitespace", () => {
            expect(isRightFlankingDelimiterRun("*", "a", "", 1)).toBe(true);
            expect(isRightFlankingDelimiterRun("*", "b", " ", 1)).toBe(true);
            expect(isRightFlankingDelimiterRun("*", "c", "!", 1)).toBe(true);
        });

        test("returns false if last char is whitespace", () => {
            expect(isRightFlankingDelimiterRun("*", " ", "", 1)).toBe(false);
            expect(isRightFlankingDelimiterRun("*", "\t", "a", 1)).toBe(false);
            expect(isRightFlankingDelimiterRun("*", "\n", "!", 1)).toBe(false);
        });

        test("handles empty lastChar", () => {
            expect(isRightFlankingDelimiterRun("*", "", "", 1)).toBe(false);
        });
    });

    describe("for underscore (_)", () => {
        test("returns true if last char is not whitespace or alphanumeric, and next char is not alphanumeric", () => {
            expect(isRightFlankingDelimiterRun("_", "!", "!", 1)).toBe(true);
            expect(isRightFlankingDelimiterRun("_", ".", " ", 1)).toBe(true);
            expect(isRightFlankingDelimiterRun("_", "-", "", 1)).toBe(true);
        });

        test("returns false if last char is whitespace", () => {
            expect(isRightFlankingDelimiterRun("_", " ", "", 1)).toBe(false);
            expect(isRightFlankingDelimiterRun("_", "\t", "a", 1)).toBe(false);
            expect(isRightFlankingDelimiterRun("_", "\n", "!", 1)).toBe(false);
        });

        test("returns false if last char is alphanumeric and next char is also alphanumeric", () => {
            expect(isRightFlankingDelimiterRun("_", "a", "b", 1)).toBe(false);
            expect(isRightFlankingDelimiterRun("_", "1", "2", 1)).toBe(false);
        });

        test("handles empty lastChar", () => {
            expect(isRightFlankingDelimiterRun("_", "", "", 1)).toBe(false);
        });
        test("handles last char alphanumeric, next char not alphanumeric", () => {
            expect(isRightFlankingDelimiterRun("_", "a", "!", 1)).toBe(true);
        });

    });

    test("returns false for unknown delimiter characters", () => {
        expect(isRightFlankingDelimiterRun("$", "a", "", 1)).toBe(false);
        expect(isRightFlankingDelimiterRun("!", "b", " ", 1)).toBe(false);
    });
});



describe("adjustDelimiterIndexes", () => {
    test("decrements indexes greater than removedIndex", () => {
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 4, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        adjustDelimiterIndexes(delims, 2);
        expect(delims).toEqual([
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 3, length: 1, char: "*", canOpen: true, canClose: true },
        ]);
    });

    test("does not modify indexes less than or equal to removedIndex", () => {
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 4, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        adjustDelimiterIndexes(delims, 4);
        expect(delims).toEqual([
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ]);
    });

    test("handles empty delimiters array", () => {
        const delims: any[] = [];
        adjustDelimiterIndexes(delims, 2);
        expect(delims).toEqual([]);
    });

    test("handles no delimiters greater than removedIndex", () => {
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        adjustDelimiterIndexes(delims, 4);
        expect(delims).toEqual([
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ]);
    });

    test("handles large removedIndex", () => {
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        adjustDelimiterIndexes(delims, 100);
        expect(delims).toEqual([
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ]);
    });
}); 