import type { DocumentNode, ParagraphNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { closeBlock, handleBlankLine } from "@/block-parser";
import { createParagraphNode } from "../block-parser/test-helpers";
import { setParagraphContent } from "@/parser-helpers";

describe("block-parser - Reference Definitions", () => {
  describe("closeBlock", () => {
    test("should extract reference definition from paragraph", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode("[foo]: /url \"title\"");
      const stack = [{}, paragraph]; // Dummy parent
      closeBlock(stack, refMap);
      expect(refMap.size).toBe(1);
      expect(refMap.get("foo")).toEqual({
        label: "foo",
        url: "/url",
        title: "title",
      });
      expect(stack.length).toBe(1); // Paragraph should be removed
    });

    test("should extract multiple reference definitions", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode(
        "[foo]: /url1 \"title1\"\n[bar]: /url2 'title2'",
      );
      const stack = [{}, paragraph];
      closeBlock(stack, refMap);
      expect(refMap.size).toBe(2);
      expect(refMap.get("foo")).toEqual({
        label: "foo",
        url: "/url1",
        title: "title1",
      });
      expect(refMap.get("bar")).toEqual({
        label: "bar",
        url: "/url2",
        title: "title2",
      });
    });

    test("should not extract if not a reference definition", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode("This is a normal paragraph.");
      const stack = [{}, paragraph];
      closeBlock(stack, refMap);
      expect(refMap.size).toBe(0);
      expect(stack.length).toBe(1); // Paragraph should remain
    });

    test("should handle mixed content with definitions and text", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode(
        "[foo]: /url \"title\"\nThis is some text.\n[bar]: /url2",
      );
      const stack = [{}, paragraph];
      closeBlock(stack, refMap);
      expect(refMap.size).toBe(2);
      expect(refMap.get("foo")).toEqual({
        label: "foo",
        url: "/url",
        title: "title",
      });
      expect(refMap.get("bar")).toEqual({ label: "bar", url: "/url2", title: undefined });

      // Check that the paragraph is still on the stack and contains the leftover text
      expect(stack.length).toBe(2);
      const remainingParagraph = stack[1] as ParagraphNode;
      expect(remainingParagraph.type).toBe("paragraph");
      expect(remainingParagraph._raw).toBe("This is some text.");
    });

    test("should not add duplicate reference definitions", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode(
        "[foo]: /url1 \"title1\"\n[foo]: /url2 'title2'",
      );
      const stack = [{}, paragraph];
      closeBlock(stack, refMap);
      expect(refMap.size).toBe(1);
      expect(refMap.get("foo")).toEqual({
        label: "foo",
        url: "/url1",
        title: "title1",
      }); // First definition should win
    });
  });

  describe("handleBlankLine", () => {
    test("should close a paragraph, potentially extracting ref definitions", () => {
      const refMap = new Map();
      const paragraph = createParagraphNode("[foo]: /url \"title\"");
      const stack = [{}, paragraph];
      handleBlankLine(stack, refMap);
      expect(refMap.size).toBe(1);
      expect(stack.length).toBe(1); // Paragraph should be closed
    });
  });
}); 