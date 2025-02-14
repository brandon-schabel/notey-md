import type { MarkdownNode } from "./ast";

export function renderAstToHtml(node: MarkdownNode, isTop = true, idx = 0, count = 1): string {
  switch (node.type) {
    case "document":
      return node.children
        .map((c, i) => renderAstToHtml(c, true, i, node.children.length))
        .join("");
    case "paragraph": {
      const inner = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      return wrapBlock(`<p>${inner}</p>`, isTop, idx, count);
    }
    case "heading": {
      const inner = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      return wrapBlock(`<h${node.level}>${inner}</h${node.level}>`, isTop, idx, count);
    }
    case "blockquote": {
      const inner = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      return wrapBlock(`<blockquote>${inner}</blockquote>`, isTop, idx, count);
    }
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      let startAttr = "";
      if (node.ordered && node.start !== null && node.start !== 1) {
        startAttr = ` start="${node.start}"`;
      }
      const inner = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      return wrapBlock(`<${tag}${startAttr}>${inner}</${tag}>`, isTop, idx, count);
    }
    case "list_item": {
      const inner = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      return `<li>${inner}</li>`;
    }
    case "thematic_break":
      return wrapBlock("<hr />", isTop, idx, count);
    case "html_block":
      return wrapBlock(node.value, isTop, idx, count);
    case "code_block": {
      const lang = node.language ? ` class="language-${escapeHtmlAttr(node.language)}"` : "";
      const escaped = escapeHtml(node.value);
      return wrapBlock(`<pre><code${lang}>${escaped}</code></pre>`, isTop, idx, count);
    }
    case "text":
      return escapeHtml(node.value);
    case "emphasis":
      return `<em>${node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("")}</em>`;
    case "strong":
      return `<strong>${node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("")}</strong>`;
    case "code_span":
      return `<code>${escapeHtml(node.code)}</code>`;
    case "linebreak":
      return `<br />`;
    case "raw_html":
      return node.content;
    case "link": {
      const inn = node.children
        .map((c, i) => renderAstToHtml(c, false, i, node.children.length))
        .join("");
      const t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
      return `<a href="${escapeUrl(node.url)}"${t}>${inn}</a>`;
    }
    case "image": {
      const t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
      return `<img src="${escapeUrl(node.url)}" alt="${escapeHtmlAttr(node.alt)}"${t} />`;
    }
  }
}

export function wrapBlock(html: string, isTop: boolean, idx: number, count: number) {
  if (isTop && idx < count - 1) return html + "\n";
  return html;
}

export function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttr(str: string) {
  return escapeHtml(str);
}

export function escapeUrl(str: string) {
  return str.replace(/"/g, "%22");
}
