import type { RefDefinition } from "@/ast";
import { parseInlineString } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("parseInlineString", () => {
    test("should parse emphasis and strong delimiters", () => {
        const map = new Map<string, RefDefinition>();
        const result = parseInlineString("This *is* **strong** text", map);
        expect(result.some(r => r.type === "emphasis")).toBe(true);
        expect(result.some(r => r.type === "strong")).toBe(true);
    });

    test("should parse code spans", () => {
        const map = new Map<string, RefDefinition>();
        const result = parseInlineString("Here is a `code span` in text", map);
        expect(result.some(r => r.type === "code_span")).toBe(true);
    });

    test("should parse raw HTML tokens if recognized", () => {
        const map = new Map<string, RefDefinition>();
        const result = parseInlineString("Some <div>html</div> content", map);
        expect(result.some(r => r.type === "raw_html")).toBe(true);
    });

    test("should parse autolinks of URLs or emails", () => {
        const map = new Map<string, RefDefinition>();
        const autolink = "Check <http://example.com> or <test@example.org>";
        const result = parseInlineString(autolink, map);
        expect(result.filter(r => r.type === "link")).toHaveLength(2);
    });

    test("should handle multiple consecutive emphasis tokens correctly", () => {
        const map = new Map<string, RefDefinition>();
        const multiple = "Text ***with multiple*** tokens";
        const result = parseInlineString(multiple, map);
        // Expect a combination of strong + emphasis or emphasis + strong
        expect(result.some(r => r.type === "strong")).toBe(true);
        expect(result.some(r => r.type === "emphasis")).toBe(true);
    });

    test("should handle mismatched emphasis tokens as literal text", () => {
        const map = new Map<string, RefDefinition>();
        const mismatched = "some *emphasis ** mismatch";
        const result = parseInlineString(mismatched, map);
        expect(result.every(r => r.type !== "emphasis" && r.type !== "strong")).toBe(true);
    });

    test("should handle backslashes that escape punctuation", () => {
        const map = new Map<string, RefDefinition>();
        const escaped = "escaping \\* star but not this *one*";
        const result = parseInlineString(escaped, map);
        expect(result.some(r => r.type === "emphasis")).toBe(true);
        // The first star was escaped => literal
        expect(
            result
                .filter(r => r.type === "text")
                .some(t => (t as any).value.includes("*"))
        ).toBe(true);
    });

    test("should handle empty string input without errors", () => {
        const map = new Map<string, RefDefinition>();
        const result = parseInlineString("", map);
        expect(result).toHaveLength(0);
    });
});