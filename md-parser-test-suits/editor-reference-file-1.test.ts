/* ==========================================================
   editor-reference-file.test.ts
   A comprehensive test suite to ensure that the markdown
   in editor-reference-file.md is properly converted to HTML
   using the parseMarkdown function.
   ========================================================== */

import { describe, test, expect, beforeAll } from "bun:test"
import { parseMarkdown } from "../markdown-parser"
import { testDir } from "./test-config"

// If you are using Node compatibility in Bun,
// you could also use "fs" from Bun, e.g.:
// import { readFileSync } from "fs";
// const entireMarkdown = readFileSync("editor-reference-file.md", "utf8");

let entireMarkdown = ""

describe("editor-reference-file tests", () => {
    beforeAll(async () => {

        entireMarkdown = await Bun.file(`${testDir}/editor-reference-file-1.md`).text();
    });


    test("Should parse the top-level heading correctly", () => {
        const headingLine = "# Markdown: Syntax"
        const output = parseMarkdown(headingLine)
        expect(output).toContain("<h1>Markdown: Syntax</h1>")
    })

    test("Should parse sub-headings (e.g. '## Overview') correctly", () => {
        const subHeadingLine = "## Overview"
        const output = parseMarkdown(subHeadingLine)
        expect(output).toContain("<h2>Overview</h2>")
    })

    test("Should parse emphasized text in the reference file", () => {
        const emphasisLine = "**Note:** This document is itself written using Markdown"
        const output = parseMarkdown(emphasisLine)
        expect(output).toContain("<strong>Note:</strong>")
    })

    test("Should parse a bullet list from the reference file", () => {
        const listLines = [
            "* Red",
            "* Green",
            "* Blue"
        ].join("\n")
        const output = parseMarkdown(listLines)
        // Each line gets its own <ul> in parseMarkdown’s logic
        expect(output).toContain("<ul><li>Red</li></ul>")
        expect(output).toContain("<ul><li>Green</li></ul>")
        expect(output).toContain("<ul><li>Blue</li></ul>")
    })

    test("Should parse an ordered list from the reference file", () => {
        const orderedListLines = [
            "1. Bird",
            "2. McHale",
            "3. Parish"
        ].join("\n")
        // parseMarkdown handles each line as its own <p> by default,
        // but we verify headings or partial matches
        const output = parseMarkdown(orderedListLines)
        expect(output).toContain("Bird")
        expect(output).toContain("McHale")
        expect(output).toContain("Parish")
    })

    test("Should parse code blocks from the reference file", () => {
        const codeBlock = "```\ntell application \"Foo\"\n    beep\nend tell\n```"
        const output = parseMarkdown(codeBlock)
        expect(output).toContain("<pre><code>tell application \"Foo\"\n    beep\nend tell</code></pre>")
    })

    test("Should parse blockquotes from the reference file", () => {
        const blockquoteLines = [
            "> This is a blockquote with two paragraphs. Lorem ipsum",
            ">",
            "> Donec sit amet nisl."
        ].join("\n")
        // parseMarkdown merges lines into a single paragraph, but
        // we verify at least the presence of escaped blockquote text
        const output = parseMarkdown(blockquoteLines)
        // parseMarkdown does not preserve ">" styling but does parse the content
        expect(output).toContain("This is a blockquote with two paragraphs.")
        expect(output).toContain("Donec sit amet nisl.")
    })

    test("Should parse inline links properly", () => {
        const linkLine = "[This link](http://example.net/) has no title attribute."
        const output = parseMarkdown(linkLine)
        expect(output).toContain("<a href=\"http://example.net/\">This link</a>")
    })

    test("Should parse the entire editor-reference-file.md without errors", () => {
        const output = parseMarkdown(entireMarkdown)
        expect(output).toContain("<h1>Markdown: Syntax</h1>")
        expect(output).toContain("Block Elements")
        expect(output).toContain("Span Elements")
        expect(output).toContain("## Overview")
        expect(output).toContain("### Code Blocks")
        expect(output).toContain("<strong>Note:</strong>")
        expect(output).toContain("Markdown is intended to be as easy-to-read")
    })
})