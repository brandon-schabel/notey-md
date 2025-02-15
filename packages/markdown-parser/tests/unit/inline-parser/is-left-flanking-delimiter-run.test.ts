import { isLeftFlankingDelimiterRun } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

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

    test("returns true for multiple asterisks if next char is punctuation but not whitespace", () => {
        // e.g. ***! 
        expect(isLeftFlankingDelimiterRun("*", "", "!", 3)).toBe(true);
    });

    test("returns false for empty nextChar", () => {
        expect(isLeftFlankingDelimiterRun("*", "a", undefined, 1)).toBe(false);
    });

    test("returns false for underscores if next char is underscore", () => {
        expect(isLeftFlankingDelimiterRun("_", "", "_", 2)).toBe(false);
    });
});