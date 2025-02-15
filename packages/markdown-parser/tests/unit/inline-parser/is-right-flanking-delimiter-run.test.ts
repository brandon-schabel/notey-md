import { isRightFlankingDelimiterRun } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

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

    test("returns true for double asterisks if last char is punctuation (still might close)", () => {
        expect(isRightFlankingDelimiterRun("*", "!", "", 2)).toBe(true);
    });

    test("returns false if next char is alphanumeric for underscore with last char also alphanumeric", () => {
        // underscores disallow intraword
        expect(isRightFlankingDelimiterRun("_", "A", "B", 1)).toBe(false);
    });
});