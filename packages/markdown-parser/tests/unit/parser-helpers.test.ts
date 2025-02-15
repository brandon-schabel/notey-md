import { tryHtmlBlockOpenStrict, parseListLine } from "@/parser-helpers";
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

describe("parseListLine", () => {
    test("parses bullet list items with *, +, -", () => {
        const res1 = parseListLine("* Item 1");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "Item 1" });

        const res2 = parseListLine("+ Item 2");
        expect(res2).toEqual({ ordered: false, start: 1, bulletChar: "+", content: "Item 2" });

        const res3 = parseListLine("- Item 3");
        expect(res3).toEqual({ ordered: false, start: 1, bulletChar: "-", content: "Item 3" });
    });

    test("parses ordered list items with . and ) delimiters", () => {
        const res1 = parseListLine("1. Item 1");
        expect(res1).toEqual({ ordered: true, start: 1, content: "Item 1" });

        const res2 = parseListLine("2) Item 2");
        expect(res2).toEqual({ ordered: true, start: 2, content: "Item 2" });
    });

    test("handles leading spaces correctly (up to 3)", () => {
        const res1 = parseListLine("  * Item with 2 spaces");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "Item with 2 spaces" });

        const res2 = parseListLine("   1. Item with 3 spaces");
        expect(res2).toEqual({ ordered: true, start: 1, content: "Item with 3 spaces" });

         const res3 = parseListLine("    * Item with 4 spaces"); //This is not a list item
         expect(res3).toBeNull();
    });

    test("handles different start numbers for ordered lists", () => {
        const res1 = parseListLine("5. Item starting at 5");
        expect(res1).toEqual({ ordered: true, start: 5, content: "Item starting at 5" });

        const res2 = parseListLine("123456789. Large start number");
        expect(res2).toEqual({ ordered: true, start: 123456789, content: "Large start number" });
    });

    test("handles more than 9 digits", () => {
        const res1 = parseListLine("1234567890. Too many digits");
        expect(res1).toBeNull();
    })

    test("handles invalid start numbers for ordered lists", () => {
        const res1 = parseListLine("abc. Invalid");
        expect(res1).toBeNull();

        const res2 = parseListLine("0. Starts at zero"); // 0 is a valid, but unusual start number
        expect(res2).toEqual({ ordered: true, start: 0, content: "Starts at zero" });

        const res3 = parseListLine("1.2. Starts decimal"); // 0 is a valid, but unusual start number
        expect(res3).toBeNull();
    });

    test("handles empty list item content", () => {
        const res1 = parseListLine("* ");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "" });

        const res2 = parseListLine("1. ");
        expect(res2).toEqual({ ordered: true, start: 1, content: "" });
    });

    test("handles list items with no content after spaces", () => {
        const res1 = parseListLine("*     ");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "" });

        const res2 = parseListLine("1.      ");
        expect(res2).toEqual({ ordered: true, start: 1, content: "" });
    });

    test("returns null for lines that are not list items", () => {
        const res1 = parseListLine("This is just a regular line.");
        expect(res1).toBeNull();

        const res2 = parseListLine("  *Not* a list item (too many spaces).");
        expect(res2).toBeNull();

        const res3 = parseListLine("12a. Not a valid ordered list item.");
        expect(res3).toBeNull();

        const res4 = parseListLine(" *Not a list item (leading space before *).");
        expect(res4).toBeNull();
    });

    test("handles tabs as spaces", () => {
        const res1 = parseListLine("\t* Item with tab");
        expect(res1).toBeNull();
    });

    test("handles mixed spaces and tabs", () => {
        const res1 = parseListLine("  \t* Item with spaces and tab"); //Treats tab as more spaces
        expect(res1).toBeNull();
    });

    test("handles content with special characters", () => {
        const res1 = parseListLine("* Item with *bold* and _italic_.");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "Item with *bold* and _italic_." });

        const res2 = parseListLine("1. Item with [link](url).");
        expect(res2).toEqual({ ordered: true, start: 1, content: "Item with [link](url)." });
    });

    test("handles content with numbers",() => {
        const res = parseListLine("* item 1 with a number");
        expect(res).toEqual({ordered: false, start: 1, bulletChar: "*", content: "item 1 with a number"});
    });

    test("handles multiple spaces between bullet/number and content", () => {
        const res1 = parseListLine("*   Multiple spaces");
        expect(res1).toEqual({ ordered: false, start: 1, bulletChar: "*", content: "Multiple spaces" });

        const res2 = parseListLine("1.     Multiple spaces");
        expect(res2).toEqual({ ordered: true, start: 1, content: "Multiple spaces" });
    });
});

