import { tryHtmlBlockOpenStrict } from "@/parser-helpers";
import { test, describe, expect } from "bun:test";



describe("tryHtmlBlockOpenStrict", () => {
    test("recognizes HTML comment as block type 2", () => {
        const res = tryHtmlBlockOpenStrict("<!-- some comment -->");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<!-- some comment -->");
    });

    test("recognizes DOCTYPE as block type 4", () => {
        const res = tryHtmlBlockOpenStrict("<!DOCTYPE html>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<!DOCTYPE html>");
    });

    test("recognizes script tag as type 1 block-level tag", () => {
        const res = tryHtmlBlockOpenStrict("<script>console.log('test')</script>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<script>console.log('test')</script>");
    });

    test("recognizes certain block-level tags like <div>", () => {
        const res = tryHtmlBlockOpenStrict("<div>");
        expect(res).not.toBeNull();
        expect(res?.content).toBe("<div>");
    });

    test("returns null for lines not matching common block-level HTML patterns", () => {
        const res = tryHtmlBlockOpenStrict("<span>Inline element</span>");
        expect(res).toBeNull();
        const res2 = tryHtmlBlockOpenStrict("<mycustomtag>Some text</mycustomtag>");
        expect(res2).toBeNull();
    });
});

