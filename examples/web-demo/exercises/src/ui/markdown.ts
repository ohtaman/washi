import katex from "katex";

export interface ParsedProblemSections {
  title: string;
  scenario: string;
  ioSpec: string;
  example: string;
  hint1: string;
  hint2: string;
  formulation: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^(?:https?:\/\/|\/|\.\/|\.\.\/|#|\?)/i.test(trimmed)) {
    return !/[\s<>"'`]/.test(trimmed);
  }
  return false;
}

function renderInlineSegments(rawLine: string): string {
  const stash: string[] = [];
  const hold = (renderedHtml: string): string => {
    const id = stash.length;
    stash.push(renderedHtml);
    return `\uE000SPAN_${id}\uE001`;
  };

  let s = rawLine;

  // 1. Extract inline code spans first so `$` or `*` (and inner backticks) stay literal
  s = s.replace(/``([^\n]+?)``/g, (_, code: string) => hold(`<code>${escapeHtml(code.trim())}</code>`));
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => hold(`<code>${escapeHtml(code)}</code>`));

  // 2. Extract inline KaTeX math $...$ while preserving literal currency tokens like $100 / $200
  s = s.replace(
    /\$(?!\s)((?:\\.|[^$\n\\])+?)(?<!\s)\$(?![0-9])/g,
    (wholeMatch, latex: string) => {
      if (/^\d/.test(latex) && !/[\\^_=<>+\-*/]/.test(latex)) {
        return wholeMatch;
      }
      const mathHtml = katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
      });
      return hold(`<span class="math-inline">${mathHtml}</span>`);
    }
  );

  // 3. Escape all remaining raw HTML characters so no untrusted tags survive
  s = escapeHtml(s);

  // 4. Safe Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    if (!isSafeLinkUrl(url)) {
      return `${label}`;
    }
    const isExternal = /^https?:\/\//i.test(url.trim());
    const attrs = isExternal
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
    return `<a href="${escapeHtml(url.trim())}"${attrs}>${label}</a>`;
  });

  // 5. Bold and italic emphasis
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // 6. Restore stashed inline code and math spans
  return s.replace(/\uE000SPAN_(\d+)\uE001/g, (_, idStr) => stash[Number(idStr)] ?? "");
}

function parseTableRowCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const cells = parseTableRowCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

export function renderSafeMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code blocks ```lang
    const fenceMatch = /^```([a-zA-Z0-9_-]*)\s*$/.exec(trimmed);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        `<pre class="md-code" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(
          codeLines.join("\n")
        )}</code></pre>`
      );
      continue;
    }

    // Display math block $$ ... $$
    if (trimmed.startsWith("$$")) {
      const mathLines: string[] = [];
      const firstRest = trimmed.slice(2);
      if (firstRest.endsWith("$$") && firstRest.length > 2) {
        mathLines.push(firstRest.slice(0, -2));
        i++;
      } else {
        if (firstRest.length > 0) mathLines.push(firstRest);
        i++;
        while (i < lines.length) {
          const cur = lines[i].trim();
          if (cur.endsWith("$$")) {
            const inner = cur.slice(0, -2);
            if (inner.length > 0) mathLines.push(inner);
            i++;
            break;
          }
          mathLines.push(lines[i]);
          i++;
        }
      }
      const rendered = katex.renderToString(mathLines.join("\n").trim(), {
        displayMode: true,
        throwOnError: false,
      });
      blocks.push(`<div class="math-block">${rendered}</div>`);
      continue;
    }

    // Headings # .. #### (optional explicit anchor syntax: ## Heading {#slug})
    const headingMatch = /^(#{1,4})\s+(.+?)(?:\s+\{#([a-zA-Z0-9_-]+)\})?\s*$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const idAttr = headingMatch[3] ? ` id="${escapeHtml(headingMatch[3])}"` : "";
      blocks.push(`<h${level}${idAttr}>${renderInlineSegments(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquotes >
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(`<blockquote>${renderInlineSegments(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    // GFM tables
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = parseTableRowCells(line);
      const alignments = parseTableRowCells(lines[i + 1]).map((sep) => {
        if (sep.startsWith(":") && sep.endsWith(":")) return "center";
        if (sep.endsWith(":")) return "right";
        return "left";
      });
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        bodyRows.push(parseTableRowCells(lines[i]));
        i++;
      }
      const thHtml = headers
        .map((h, idx) => `<th style="text-align:${alignments[idx] ?? "left"}">${renderInlineSegments(h)}</th>`)
        .join("");
      const trHtml = bodyRows
        .map(
          (row) =>
            `<tr>${headers
              .map(
                (_, idx) =>
                  `<td style="text-align:${alignments[idx] ?? "left"}">${renderInlineSegments(
                    row[idx] ?? ""
                  )}</td>`
              )
              .join("")}</tr>`
        )
        .join("");
      blocks.push(
        `<div class="md-table-wrap"><table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table></div>`
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInlineSegments(lines[i].trim().replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInlineSegments(lines[i].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph (coalesce contiguous plain text lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const curTrim = lines[i].trim();
      if (
        curTrim === "" ||
        curTrim.startsWith("```") ||
        curTrim.startsWith("$$") ||
        curTrim.startsWith(">") ||
        /^(#{1,4})\s+/.test(curTrim) ||
        /^[-*]\s+/.test(curTrim) ||
        /^\d+\.\s+/.test(curTrim) ||
        (lines[i].includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(curTrim);
      i++;
    }
    blocks.push(`<p>${renderInlineSegments(paraLines.join("\n"))}</p>`);
  }

  return blocks.join("\n");
}

export function parseProblemMarkdown(md: string): ParsedProblemSections {
  const normalized = md.replace(/\r\n/g, "\n");
  const titleMatch = /^#\s+(.+)$/m.exec(normalized);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const extractSection = (tag: string): string => {
    const marker = `<!-- section:${tag} -->`;
    const startIdx = normalized.indexOf(marker);
    if (startIdx === -1) return "";
    const contentStart = startIdx + marker.length;
    const nextIdx = normalized.indexOf("<!-- section:", contentStart);
    const slice =
      nextIdx === -1 ? normalized.slice(contentStart) : normalized.slice(contentStart, nextIdx);
    return slice.trim();
  };

  return {
    title,
    scenario: extractSection("scenario"),
    ioSpec: extractSection("io"),
    example: extractSection("example"),
    hint1: extractSection("hint1"),
    hint2: extractSection("hint2"),
    formulation: extractSection("formulation"),
  };
}
