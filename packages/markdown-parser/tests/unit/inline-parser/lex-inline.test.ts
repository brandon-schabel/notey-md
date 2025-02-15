import { lexInline } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("lexInline", () => {
    test("should tokenize text with emphasis delimiters", () => {
        const tokens = lexInline("*emph* _alsoEmph_");
        expect(tokens.some(t => t.type === "delim" && t.content === "*")).toBe(true);
        expect(tokens.some(t => t.type === "delim" && t.content === "_")).toBe(true);
    });

    test("should handle code backticks", () => {
        const tokens = lexInline("Some `code` text");
        expect(tokens.some(t => t.type === "code_span")).toBe(true);
    });

    test("should handle backslash escapes", () => {
        const tokens = lexInline("Line with \\*escaped star*");
        expect(tokens.some(t => t.type === "text" && t.content === "*")).toBe(true);
    });

    test("should produce a softbreak for newline characters", () => {
        const tokens = lexInline("Line1\nLine2");
        expect(tokens.some(t => t.type === "softbreak")).toBe(true);
    });

    test("should handle multiple consecutive backticks", () => {
        const tokens = lexInline("``double ticks`` still code `single`");
        expect(tokens.filter(t => t.type === "code_span")).toHaveLength(2);
    });

    test("should handle text containing angle brackets not matching autolink or raw HTML", () => {
        const tokens = lexInline("regular < text > not autolink");
        expect(tokens.some(t => t.type === "text" && t.content === "<")).toBe(true);
        expect(tokens.some(t => t.type === "text" && t.content === ">")).toBe(true);
        expect(tokens.every(t => t.type !== "autolink")).toBe(true);
    });

    test("should handle empty input", () => {
        const tokens = lexInline("");
        expect(tokens).toHaveLength(0);
    });
});