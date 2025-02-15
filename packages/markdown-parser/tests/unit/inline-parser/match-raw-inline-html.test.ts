import { matchRawInlineHtml } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("matchRawInlineHtml", () => {
    test("should capture raw inline HTML with angle brackets", () => {
        const html = `<div class="test">`;
        const match = matchRawInlineHtml(html, 0);
        expect(match).not.toBeNull();
        expect(match?.content).toBe(html);
        expect(match?.length).toBe(html.length);
    });

    test("should return null for text that does not match inline HTML", () => {
        const text = "< not actually html>";
        const match = matchRawInlineHtml(text, 0);
        expect(match).toBeNull();
    });

    test("should handle closing tags", () => {
        const html = "</span>";
        const match = matchRawInlineHtml(html, 0);
        expect(match).not.toBeNull();
        expect(match?.content).toBe("</span>");
    });

    test("should handle self-closing tags", () => {
        const html = "<img src='test.png'/>";
        const match = matchRawInlineHtml(html, 0);
        expect(match).not.toBeNull();
        expect(match?.content).toBe("<img src='test.png'/>");
    });

    test("should return null if HTML spans multiple lines", () => {
        const multiLine = `<div\nclass="multi-line">`;
        const match = matchRawInlineHtml(multiLine, 0);
        expect(match).toBeNull();
    });
});