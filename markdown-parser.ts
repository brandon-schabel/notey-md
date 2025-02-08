
export function parseMarkdown(markdownText: string): string {
    // Normalize line endings and split into lines
    const lines = markdownText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    // Tokenize the text into block-level tokens
    const blocks = blockTokenize(lines);
    // Convert blocks to HTML strings
    const htmlBlocks = blocks.map(block => blockToHtml(block));
    // Join the HTML blocks with newlines
    return htmlBlocks.join("\n");
}

// Block types used for tokenizing the Markdown
type Block =
    | { type: "hr" }
    | { type: "heading"; level: number; content: string }
    | { type: "code"; code: string; lang?: string }
    | { type: "blockquote"; lines: string[] }
    | { type: "list"; ordered: boolean; items: ListItem[] }
    | { type: "html"; content: string }
    | { type: "paragraph"; lines: string[] };

interface ListItem {
    raw: string;
    blocks: Block[];
    taskState?: "checked" | "unchecked";
}

function blockTokenize(lines: string[]): Block[] {
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Skip blank lines
        if (!line.trim()) {
            i++;
            continue;
        }

        // 1) Horizontal rule
        if (/^(\s*)(---|___|\*\*\*)(\s*)$/.test(line)) {
            blocks.push({ type: "hr" });
            i++;
            continue;
        }

        // 2) Fenced code block
        const fencedMatch = line.match(/^(\s*)```([\w-]*)/);
        if (fencedMatch) {
            const lang = fencedMatch[2] || undefined;
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !/^\s*```/.test(lines[i])) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++; // skip closing ```
            blocks.push({ type: "code", code: codeLines.join("\n"), lang });
            continue;
        }

        // 3) ATX heading
        const atxMatch = line.match(/^(\s{0,3})(#{1,6})\s+(.*)$/);
        if (atxMatch) {
            const level = atxMatch[2].length;
            const content = atxMatch[3].trim();
            blocks.push({ type: "heading", level, content });
            i++;
            continue;
        }

        // 4) Setext heading (requires a following line of === or ---)
        if (i + 1 < lines.length) {
            if (line.trim() && /^(\s*)(===+|---+)\s*$/.test(lines[i + 1])) {
                const next = lines[i + 1];
                const isH1 = /=+/.test(next);
                const level = isH1 ? 1 : 2;
                blocks.push({
                    type: "heading",
                    level,
                    content: line.trim()
                });
                i += 2;
                continue;
            }
        }

        // 5) Blockquote
        if (/^\s*>/.test(line)) {
            const bqLines: string[] = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) {
                bqLines.push(lines[i].replace(/^\s*>\s?/, ""));
                i++;
            }
            blocks.push({ type: "blockquote", lines: bqLines });
            continue;
        }

        // 6) List (ordered or unordered)
        const listMatch = line.match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/);
        if (listMatch) {
            const listItems: ListItem[] = [];
            let isOrdered = false;
            while (true) {
                const ll = lines[i];
                if (!ll) break;
                const match = ll.match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/);
                if (!match) break;
                const marker = match[2];
                isOrdered = /\d+\./.test(marker);
                let content = match[3];
                let taskState: "checked" | "unchecked" | undefined;
                // Check for task list marker at start of the content
                const taskMatch = content.match(/^$begin:math:display$([ xX])$end:math:display$\s+(.*)$/);
                if (taskMatch) {
                    taskState = taskMatch[1].toLowerCase() === "x" ? "checked" : "unchecked";
                    content = taskMatch[2];
                }
                const itemBlocks: Block[] = [{
                    type: "paragraph",
                    lines: [content]
                }];
                listItems.push({
                    raw: match[3],
                    blocks: itemBlocks,
                    taskState
                });
                i++;
                if (i >= lines.length) break;
            }
            blocks.push({ type: "list", ordered: isOrdered, items: listItems });
            continue;
        }

        // 7) Indented code block (4 spaces or a tab)
        if (/^( {4,}|\t)/.test(line)) {
            const codeLines: string[] = [];
            while (i < lines.length && /^( {4,}|\t)/.test(lines[i])) {
                codeLines.push(lines[i].replace(/^( {4}|\t)/, ""));
                i++;
            }
            blocks.push({ type: "code", code: codeLines.join("\n") });
            continue;
        }

        // 8) Raw HTML block (if line starts with '<')
        if (/^</.test(line.trim())) {
            blocks.push({ type: "html", content: line });
            i++;
            continue;
        }

        // 9) Paragraph (gather consecutive lines until a block is detected)
        const paraLines = [line];
        i++;
        while (i < lines.length && lines[i].trim() &&
            !/^\s*(#{1,6})\s+/.test(lines[i]) &&
            !/^(\s*)```/.test(lines[i]) &&
            !/^(\s*)(---|___|\*\*\*)(\s*)$/.test(lines[i]) &&
            !/^\s*>/.test(lines[i]) &&
            !/^(\s*)([-+*]|\d+\.)\s+/.test(lines[i]) &&
            !/^( {4}|\t)/.test(lines[i]) &&
            !/^</.test(lines[i].trim())
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        blocks.push({ type: "paragraph", lines: paraLines });
    }
    return blocks;
}

function blockToHtml(block: Block): string {
    switch (block.type) {
        case "hr":
            return "<hr>";
        case "heading": {
            const { level, content } = block;
            const inline = parseInline(content);
            return `<h${level}>${inline}</h${level}>`;
        }
        case "code": {
            const safe = escapeHtml(block.code);
            return `<pre><code>${safe}</code></pre>`;
        }
        case "blockquote": {
            const subBlocks = blockTokenize(block.lines);
            const html = subBlocks.map(sb => blockToHtml(sb)).join("\n");
            return `<blockquote>\n${html}\n</blockquote>`;
        }
        case "list": {
            const tag = block.ordered ? "ol" : "ul";
            const itemsHtml = block.items.map(it => {
                const subHtml = it.blocks.map(b => blockToHtml(b)).join("\n");
                if (it.taskState === "checked") {
                    return `<li><input type="checkbox" checked disabled> ${subHtml}</li>`;
                } else if (it.taskState === "unchecked") {
                    return `<li><input type="checkbox" disabled> ${subHtml}</li>`;
                } else {
                    return `<li>${subHtml}</li>`;
                }
            }).join("");
            return `<${tag}>\n${itemsHtml}\n</${tag}>`;
        }
        case "html":
            return block.content;
        case "paragraph": {
            const combined = block.lines.join(" ");
            const inlineParsed = parseInline(combined);
            return `<p>${inlineParsed}</p>`;
        }
    }
}

function parseInline(text: string): string {
    let result = "";
    let i = 0;
    while (i < text.length) {
        // 1) Code spans: `...`
        if (text[i] === "`") {
            const end = text.indexOf("`", i + 1);
            if (end === -1) {
                result += escapeHtml(text[i]);
                i++;
                continue;
            }
            const codeContent = text.slice(i + 1, end);
            result += `<code class="inline">${escapeHtml(codeContent)}</code>`;
            i = end + 1;
            continue;
        }

        // 2) Image: ![alt](url "title")
        if (text[i] === "!" && text[i + 1] === "[") {
            const match = matchInlineLinkOrImage(text.slice(i), true);
            if (match) {
                result += match.output;
                i += match.length;
                continue;
            }
        }

        // 3) Link: [text](url "title")
        if (text[i] === "[") {
            const match = matchInlineLinkOrImage(text.slice(i), false);
            if (match) {
                result += match.output;
                i += match.length;
                continue;
            }
        }

        // 4) Auto-link: <http://...>
        if (text[i] === "<") {
            const autoLink = matchAutoLink(text.slice(i));
            if (autoLink) {
                result += autoLink.html;
                i += autoLink.length;
                continue;
            }
            const closePos = text.indexOf(">", i + 1);
            if (closePos !== -1) {
                const rawHtml = text.slice(i, closePos + 1);
                result += rawHtml;
                i = closePos + 1;
                continue;
            }
        }

        // 5) Emphasis (strong or italics)
        const strongOrEm = matchEmphasis(text, i);
        if (strongOrEm) {
            result += strongOrEm.output;
            i += strongOrEm.length;
            continue;
        }

        // 6) Backslash escape
        if (text[i] === "\\") {
            if (i + 1 < text.length) {
                const specialChars = "\\`*_{}[]()#+-.!>";
                if (specialChars.includes(text[i + 1])) {
                    result += escapeHtml(text[i + 1]);
                    i += 2;
                    continue;
                }
            }
            result += "\\";
            i++;
            continue;
        }

        // 7) Normal character
        result += escapeHtml(text[i]);
        i++;
    }
    return result;
}

function matchInlineLinkOrImage(src: string, imageMode: boolean): { output: string; length: number } | null {
    const re = imageMode
        ? /^!$begin:math:display$([^$end:math:display$]*)\]$begin:math:text$([^)\\s]+)(?:\\s+"([^"]+)")?$end:math:text$/
        : /^$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$([^)\\s]+)(?:\\s+"([^"]+)")?$end:math:text$/;
    const m = src.match(re);
    if (!m) return null;
    const fullMatch = m[0];
    const textOrAlt = m[1];
    const url = m[2];
    const title = m[3] || "";
    const length = fullMatch.length;
    if (imageMode) {
        const altEsc = escapeHtml(textOrAlt);
        const urlEsc = escapeHtml(url);
        const titleEsc = title ? ` title="${escapeHtml(title)}"` : "";
        const output = `<img src="${urlEsc}" alt="${altEsc}"${titleEsc}>`;
        return { output, length };
    } else {
        const txtEsc = parseInline(textOrAlt);
        const urlEsc = escapeHtml(url);
        const titleEsc = title ? ` title="${escapeHtml(title)}"` : "";
        const output = `<a href="${urlEsc}"${titleEsc}>${txtEsc}</a>`;
        return { output, length };
    }
}

function matchAutoLink(src: string): { html: string; length: number } | null {
    const re = /^<((?:https?:\/\/|www\.)[^>]+)>/i;
    const m = src.match(re);
    if (!m) return null;
    const full = m[0];
    const link = m[1];
    const hasProtocol = /^https?:\/\//i.test(link) ? link : `http://${link}`;
    const html = `<a href="${escapeHtml(hasProtocol)}">${escapeHtml(link)}</a>`;
    return { html, length: full.length };
}

function matchEmphasis(text: string, start: number): { output: string; length: number } | null {
    const c = text[start];
    if (c !== "*" && c !== "_") return null;
    if (start + 1 < text.length && text[start + 1] === c) {
        const end = text.indexOf(c + c, start + 2);
        if (end === -1) return null;
        const inner = text.slice(start + 2, end);
        const parsed = parseInline(inner);
        const output = `<strong>${parsed}</strong>`;
        return { output, length: end - start + 2 };
    } else {
        const end = text.indexOf(c, start + 1);
        if (end === -1) return null;
        const inner = text.slice(start + 1, end);
        const parsed = parseInline(inner);
        const output = `<em>${parsed}</em>`;
        return { output, length: end - start + 1 };
    }
}

function escapeHtml(raw: string): string {
    return raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}