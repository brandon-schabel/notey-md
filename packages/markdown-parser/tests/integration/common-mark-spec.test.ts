import { test, describe, expect, afterAll } from "bun:test";
import { writeFileSync, readdirSync, mkdirSync, readFileSync } from "fs";
import { integrationTestDir, commonMarkSectionsDir, integrationResultsDir, specFilePath } from "./int-test-config";
import { parseMarkdown } from "@/parse-markdown";


interface CommonMarkTest {
    section: string;
    example: number;
    markdown: string;
    html: string;
    start_line?: number;
    end_line?: number;
}

// Helper to normalize HTML (if needed)
function normalizeHtml(input: string): string {
    return input.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
}

// Global map to store failed tests details per section
const failedTestsBySection: Map<string, {
    spec: string;
    example: number;
    input: string;
    expected: string;
    spec_markdown?: string;
}[]> = new Map();


describe("CommonMark Spec Test Suite", async () => {
    // Read the common-mark-sections directory
    const sectionFiles = readdirSync(commonMarkSectionsDir);

    // Iterate over each section file
    for (const file of sectionFiles) {
        if (file.endsWith(".json")) {
            const sectionName = file.replace(".json", "").replace(/-/g, " "); // Derive section name from filename
            const filePath = `${commonMarkSectionsDir}/${file}`;

            // Load the JSON file for the current section using Bun.file
            const jsonText = await Bun.file(filePath).text();
            const sectionTests: CommonMarkTest[] = JSON.parse(jsonText);

            describe(sectionName, () => { // Create a describe block for each section
                for (const testCase of sectionTests) {
                    test(`Example ${testCase.example}`, () => {
                        const actualOutput = parseMarkdown(testCase.markdown);
                        const normalizedActual = normalizeHtml(actualOutput);
                        const normalizedExpected = normalizeHtml(testCase.html);
                        try {
                            expect(normalizedActual).toBe(normalizedExpected);
                        } catch (error) {
                            // Get the corresponding markdown from spec.txt

                            // Record failure details per section, including spec_markdown
                            if (!failedTestsBySection.has(sectionName)) {
                                failedTestsBySection.set(sectionName, []);
                            }
                            failedTestsBySection.get(sectionName)!.push({
                                spec: sectionName,
                                example: testCase.example,
                                input: testCase.markdown,
                                expected: testCase.html,
                            });
                            throw error; // Re-throw to mark the test as failed.
                        }
                    });
                }
            });
        }
    }
});

// Once all tests complete, output any failures to a JSON file per section.
afterAll(async () => {
    if (failedTestsBySection.size > 0) {
        // Ensure integration-results directory exists using Bun.file().exists() and Bun.mkdir()
        if (!(await Bun.file(integrationResultsDir).exists())) {
            mkdirSync(integrationResultsDir, { recursive: true });
        }

        failedTestsBySection.forEach((failedTests, sectionName) => {
            if (failedTests.length > 0) {
                const outputPath = `${integrationResultsDir}/${sectionName.replace(/ /g, '-')}-failed-tests.json`; // Filename with section name
                const jsonOutput = JSON.stringify(failedTests, null, 2);
                writeFileSync(outputPath, jsonOutput, "utf8");
                console.log(`Failed tests for section '${sectionName}' output written to ${outputPath}`);
            }
        });
    }
});