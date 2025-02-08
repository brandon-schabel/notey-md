import { test, describe, expect } from "bun:test";
import { parseMarkdown } from "../../../markdown-parser/src/index";
import { integrationTestDir } from "./int-test-config";


interface CommonMarkTest {
    section: string;
    example: number;
    markdown: string;
    html: string;
    start_line?: number;
    end_line?: number;
}

// Load the JSON file synchronously using top-level await.
const jsonText = await Bun.file(`${integrationTestDir}/common-mark-0-31-2-spec.json`).text();
const commonMarkTests: CommonMarkTest[] = JSON.parse(jsonText);

// Helper to normalize HTML (if needed)
function normalizeHtml(input: string): string {
    return input.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
}

describe("CommonMark Spec Test Suite", () => {
    const testsBySection = new Map<string, CommonMarkTest[]>();
    for (const testCase of commonMarkTests) {
        const section = testCase.section || "Unspecified Section";
        if (!testsBySection.has(section)) {
            testsBySection.set(section, []);
        }
        testsBySection.get(section)!.push(testCase);
    }

    for (const [section, tests] of testsBySection) {
        describe(section, () => {
            for (const testCase of tests) {
                test(`Example ${testCase.example}`, () => {
                    const actualOutput = parseMarkdown(testCase.markdown);
                    const normalizedActual = normalizeHtml(actualOutput);
                    const normalizedExpected = normalizeHtml(testCase.html);
                    expect(normalizedActual).toBe(normalizedExpected);
                });
            }
        });
    }
});