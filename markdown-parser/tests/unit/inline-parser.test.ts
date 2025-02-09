import type { MarkdownNode, RefDefinition, ParagraphNode, HeadingNode, DocumentNode } from "@/ast";
import { type InlineToken, parseInlinesWithDelimiterStack, isLeftFlankingDelimiterRun, isRightFlankingDelimiterRun, processEmphasis, linkResolver, walkBlockTreeAndParseInlines, parseInlineString, lexInline, matchAutolink, matchRawInlineHtml } from "@/inline-parser";
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
        if (nodes[1].type === "emphasis") {
            expect(nodes[1].children).toEqual([{ type: "text", value: "world" }]);
        }
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
        expect(nodes.length).toBe(4);
        expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
        expect(nodes[1].type).toBe("emphasis");
        if (nodes[1].type === "emphasis") {
            expect(nodes[1].children).toEqual([{ type: "text", value: "world" }]);
        }
        expect(nodes[2]).toEqual({ type: "text", value: " and " });
        expect(nodes[3].type).toBe("strong");
        if (nodes[3].type === "strong") {
            expect(nodes[3].children).toEqual([{ type: "text", value: "beyond" }]);
        }
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
            // @ts-ignore
            children: [codeBlock],
            refDefinitions: new Map<string, RefDefinition>()
        }

        walkBlockTreeAndParseInlines(root, root.refDefinitions)
        // @ts-ignore
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
            // @ts-ignore
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