import { blockPhase } from "./block-parser";
import { walkBlockTreeAndParseInlines } from "./inline-parser";
import { renderAstToHtml } from "./renderer";
import type { DocumentNode } from "./ast";
import { getPlugins } from "./plugin-system";
import { setDebugMode, isDebugMode, captureSnapshot, resetDebugState, getDebugSnapshots } from "./debug";

export interface ParseOptions {
  debug?: boolean;
}

export function parseMarkdown(markdown: string, options: ParseOptions = {}): string {
  resetDebugState();
  setDebugMode(!!options.debug);

  const doc = parseMarkdownToAst(markdown, options);
  captureSnapshot("beforeRender", doc);

  let html = renderAstToHtml(doc);
  captureSnapshot("afterRender", doc);

  const plugins = getPlugins();
  for (const { plugin } of plugins) {
    if (plugin.onRender) {
      const before = html;
      html = plugin.onRender(html, doc);
      if (isDebugMode()) {
        captureSnapshot(`afterPluginOnRender(${plugin.constructor.name || "anonymous"})`, doc);
      }
    }
  }

  return html;
}

export function parseMarkdownToAst(markdown: string, options: ParseOptions = {}): DocumentNode {
  const plugins = getPlugins();

  const doc = blockPhase(markdown);
  captureSnapshot("afterBlockPhase", doc);

  for (const { plugin } of plugins) {
    if (plugin.onParseBlock) {
      plugin.onParseBlock(doc);
      if (isDebugMode()) {
        captureSnapshot(`afterPluginOnParseBlock(${plugin.constructor.name || "anonymous"})`, doc);
      }
    }
  }

  walkBlockTreeAndParseInlines(doc, doc.refDefinitions);
  captureSnapshot("afterInlinePhase", doc);

  for (const { plugin } of plugins) {
    if (plugin.onParseInline) {
      plugin.onParseInline(doc);
      if (isDebugMode()) {
        captureSnapshot(`afterPluginOnParseInline(${plugin.constructor.name || "anonymous"})`, doc);
      }
    }
  }

  for (const { plugin } of plugins) {
    if (plugin.onTransform) {
      plugin.onTransform(doc);
      if (isDebugMode()) {
        captureSnapshot(`afterPluginOnTransform(${plugin.constructor.name || "anonymous"})`, doc);
      }
    }
  }

  captureSnapshot("finalAST", doc);

  return doc;
}

export function parseMarkdownWithDebug(markdown: string): {
  html: string;
  snapshots: ReturnType<typeof getDebugSnapshots>;
} {
  const html = parseMarkdown(markdown, { debug: true });
  const snapshots = getDebugSnapshots();
  return { html, snapshots };
}