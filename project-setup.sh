#!/usr/bin/env bash
set -e

# ---------------------------------------
# This script bootstraps the initial project
# structure for a Bun-based TypeScript
# Markdown parser library, following the
# "Markdown Parser Initial Plan Breakdown."
#
# This version creates files in the CURRENT directory.
# ---------------------------------------

# 1. (Removed mkdir for project root)

# 3. Create a minimal bunfig.toml for test configurations (optional coverage, etc.)
cat <<EOF > ./bunfig.toml
[test]
# You can enable coverage by uncommenting:
# coverage = true
# coverageReporter = ["text"]
# coverageDir = "coverage"

# If you need a preload script for global DOM or setup, specify below:
# preload = ["./tests/setup.ts"]
EOF

# 4. Create src/markdown-parser directory structure
mkdir -p ./src/markdown-parser

# 4.1. ast.ts
cat <<EOF > ./src/markdown-parser/ast.ts
export interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  // Potentially add fields like 'position' or 'line/column' here
}

export interface TextNode extends MarkdownNode {
  type: "text";
  value: string;
}

export interface ParagraphNode extends MarkdownNode {
  type: "paragraph";
  children: MarkdownNode[];
}

export interface HeadingNode extends MarkdownNode {
  type: "heading";
  level: number;
  children: MarkdownNode[];
}

export interface DocumentNode extends MarkdownNode {
  type: "document";
  children: MarkdownNode[];
}
EOF

# 4.2. parser.ts
cat <<EOF > ./src/markdown-parser/parser.ts
import {
  DocumentNode,
  ParagraphNode,
  TextNode,
  HeadingNode,
  MarkdownNode
} from "./ast";

/**
 * For now, a simple placeholder approach that splits
 * on lines, checks if a line starts with '#' for a heading,
 * else a paragraph. This will be expanded to fully parse
 * CommonMark in subsequent phases.
 */
export function parseMarkdownToAst(markdown: string): DocumentNode {
  const root: DocumentNode = {
    type: "document",
    children: []
  };

  // Very naive splitting on newlines
  const lines = markdown.split(/\\r?\\n/);

  for (const line of lines) {
    // Check for heading (just a naive detection of '#' at start)
    if (line.trim().startsWith("#")) {
      const level = countHeadingLevel(line);
      const headingText = line.replace(/^#+/, "").trim();
      const headingNode: HeadingNode = {
        type: "heading",
        level,
        children: [{
          type: "text",
          value: headingText
        } as TextNode]
      };
      root.children?.push(headingNode);
    } else if (line.trim().length > 0) {
      // Otherwise consider it a paragraph
      const paragraphNode: ParagraphNode = {
        type: "paragraph",
        children: [{
          type: "text",
          value: line
        } as TextNode]
      };
      root.children?.push(paragraphNode);
    }
    // Ignore blank lines for now
  }

  return root;
}

function countHeadingLevel(line: string): number {
  let level = 0;
  for (const char of line) {
    if (char === "#") level++;
    else break;
  }
  return level;
}
EOF

# 4.3. renderer.ts
cat <<EOF > ./src/markdown-parser/renderer.ts
import {
  DocumentNode,
  ParagraphNode,
  HeadingNode,
  TextNode,
  MarkdownNode
} from "./ast";

export function renderAstToHtml(node: MarkdownNode): string {
  switch (node.type) {
    case "document":
      return node.children?.map(renderAstToHtml).join("") || "";

    case "heading":
      return renderHeading(node as HeadingNode);

    case "paragraph":
      return renderParagraph(node as ParagraphNode);

    case "text":
      return escapeHtml((node as TextNode).value);

    default:
      return ""; // In the future, handle more node types (lists, code, etc.)
  }
}

function renderHeading(node: HeadingNode): string {
  const content = node.children?.map(renderAstToHtml).join("") || "";
  return \`<h\${node.level}>\${content}</h\${node.level}>\`;
}

function renderParagraph(node: ParagraphNode): string {
  const content = node.children?.map(renderAstToHtml).join("") || "";
  return \`<p>\${content}</p>\`;
}

function escapeHtml(raw: string): string {
  // Very minimal escaping for placeholders
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
EOF

# 4.4. index.ts
cat <<EOF > ./src/markdown-parser/index.ts
import { parseMarkdownToAst } from "./parser";
import { renderAstToHtml } from "./renderer";

/**
 * Combined entry point:
 * parse the given markdown to an AST, then
 * render to HTML. This can be tested against
 * the CommonMark suite.
 */
export function parseMarkdown(markdown: string): string {
  const ast = parseMarkdownToAst(markdown);
  return renderAstToHtml(ast);
}

// Re-export any important internals:
export {
  parseMarkdownToAst,
  renderAstToHtml
};
EOF

# 5. Create initial test structure
mkdir -p ./tests/unit
mkdir -p ./tests/integration

# 5.1. Unit test for ast-nodes
cat <<EOF > ./tests/unit/ast-nodes.test.ts
import { test, expect } from "bun:test";
import {
  TextNode,
  ParagraphNode,
  HeadingNode,
  DocumentNode
} from "../../src/markdown-parser/ast";

test("Create a simple TextNode", () => {
  const textNode: TextNode = {
    type: "text",
    value: "Hello AST"
  };
  expect(textNode.type).toBe("text");
  expect(textNode.value).toBe("Hello AST");
});

test("Create a ParagraphNode", () => {
  const pNode: ParagraphNode = {
    type: "paragraph",
    children: [
      { type: "text", value: "Paragraph content" }
    ]
  };
  expect(pNode.type).toBe("paragraph");
  expect(pNode.children?.length).toBe(1);
});

test("Create a HeadingNode", () => {
  const hNode: HeadingNode = {
    type: "heading",
    level: 2,
    children: [
      { type: "text", value: "Section Title" }
    ]
  };
  expect(hNode.type).toBe("heading");
  expect(hNode.level).toBe(2);
  expect(hNode.children?.length).toBe(1);
});

test("Create a DocumentNode", () => {
  const docNode: DocumentNode = {
    type: "document",
    children: []
  };
  expect(docNode.type).toBe("document");
  expect(docNode.children).toEqual([]);
});
EOF

# 5.2. Unit test for parser-blocks
cat <<EOF > ./tests/unit/parser-blocks.test.ts
import { test, expect } from "bun:test";
import { parseMarkdownToAst } from "../../src/markdown-parser/parser";

test("Parser handles single-line heading", () => {
  const md = "# Heading 1";
  const ast = parseMarkdownToAst(md);
  expect(ast.children?.[0]?.type).toBe("heading");
});

test("Parser handles single-line paragraph", () => {
  const md = "Just a paragraph.";
  const ast = parseMarkdownToAst(md);
  expect(ast.children?.[0]?.type).toBe("paragraph");
});

test("Parser ignores blank lines", () => {
  const md = "\\n\\n   \\nSomething here";
  const ast = parseMarkdownToAst(md);
  // Expect only one paragraph node
  expect(ast.children?.length).toBe(1);
  expect(ast.children?.[0]?.type).toBe("paragraph");
});
EOF

# 5.3. Unit test for parser-inlines (placeholder; refine later)
cat <<EOF > ./tests/unit/parser-inlines.test.ts
import { test, expect } from "bun:test";
// Inline parsing is not yet advanced. We'll expand later.

test("Inline parse placeholder", () => {
  expect(1).toBe(1);
});
EOF

# 5.4. Integration test for combined parse+render
cat <<EOF > ./tests/integration/renderer.test.ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "../../src/markdown-parser";

test("Render heading to HTML", () => {
  const result = parseMarkdown("# Hello");
  expect(result).toBe("<h1>Hello</h1>");
});

test("Render paragraph to HTML", () => {
  const result = parseMarkdown("A paragraph here.");
  expect(result).toBe("<p>A paragraph here.</p>");
});
EOF

# 7. Print instructions for next steps
echo "--------------------------------------------------"
echo "✅ Project structure created in the current directory."
echo "Next Steps:"
echo "1. Place your 'common-mark-0-31-2-spec.json' in the './tests/' folder."
echo "2. Implement the spec test logic in 'common-mark-0-31-2-spec.test.ts'."
echo "3. Run tests with: bun test"
echo "4. Expand parser.ts to handle more CommonMark rules."
echo "--------------------------------------------------" 