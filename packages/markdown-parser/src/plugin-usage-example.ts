import type { DocumentNode } from "./ast";
import { parseMarkdown, parseMarkdownWithDebug } from "./parse-markdown";
import { usePlugin } from "./plugin-system";

// Example plugin that capitalizes all text in headings during onTransform
const MyHeadingPlugin = {
    onTransform(doc: DocumentNode) {
        function walk(node: DocumentNode | any) {
            if (node.type === "heading") {
                for (const c of node.children) {
                    if (c.type === "text") {
                        c.value = c.value.toUpperCase();
                    }
                }
            }
            if (node.children) {
                for (const child of node.children) {
                    walk(child);
                }
            }
        }
        walk(doc);
    }
};

// Register plugin
usePlugin(MyHeadingPlugin);

// Normal parse
const md = "# Hello\n\nSome paragraph text";
const htmlOutput = parseMarkdown(md);
console.log(htmlOutput);

// Debug parse
const debugResult = parseMarkdownWithDebug(md);
console.log(debugResult.html);
for (const snap of debugResult.snapshots) {
    console.log(`Stage: ${snap.stage}, logs: `, snap.logs);
}