const TS_KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "interface",
  "type",
  "async",
  "await",
  "function",
  "return",
  "const",
  "let",
  "var",
  "for",
  "of",
  "in",
  "if",
  "else",
  "new",
  "throw",
  "true",
  "false",
  "null",
  "undefined",
  "number",
  "string",
  "boolean",
  "void",
  "as",
]);

const TS_LIB = new Set([
  "Model",
  "expr",
  "dot",
  "sum",
  "minimize",
  "maximize",
  "continuous",
  "integer",
  "binary",
  "constraint",
  "objective",
  "solve",
  "Math",
  "Array",
]);

const PY_KEYWORDS = new Set([
  "import",
  "from",
  "as",
  "def",
  "return",
  "for",
  "in",
  "if",
  "elif",
  "else",
  "and",
  "or",
  "not",
  "with",
  "raise",
  "True",
  "False",
  "None",
  "range",
  "len",
  "enumerate",
  "zip",
  "float",
  "int",
  "round",
  "next",
  "dict",
  "list",
]);

const PY_LIB = new Set([
  "highspy",
  "Highs",
  "addVariable",
  "addVariables",
  "addIntegral",
  "addIntegrals",
  "addBinary",
  "addBinaries",
  "addConstr",
  "qsum",
  "maximize",
  "minimize",
  "val",
  "getObjectiveValue",
  "getModelStatus",
  "modelStatusToString",
  "silent",
]);

function escapeCodeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TS_TOKEN_RE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

const PY_TOKEN_RE =
  /#[^\n]*|[fFrRbBuU]{0,2}"""[\s\S]*?"""|[fFrRbBuU]{0,2}'''[\s\S]*?'''|[fFrRbBuU]{0,2}"(?:\\[\s\S]|[^"\\])*"|[fFrRbBuU]{0,2}'(?:\\[\s\S]|[^'\\])*'|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

/**
 * Highlight TypeScript or Python code into inline color-only spans without changing
 * character count or line breaks, so an overlaid transparent textarea keeps exact caret alignment.
 */
export function highlightCode(code: string, lang: "ts" | "py"): string {
  const tokenRe = lang === "ts" ? TS_TOKEN_RE : PY_TOKEN_RE;
  const keywords = lang === "ts" ? TS_KEYWORDS : PY_KEYWORDS;
  const libs = lang === "ts" ? TS_LIB : PY_LIB;

  tokenRe.lastIndex = 0;
  let out = "";
  let pos = 0;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(code)) !== null) {
    if (m.index > pos) {
      out += escapeCodeHtml(code.slice(pos, m.index));
    }
    const tok = m[0];
    let cls: string | null = null;

    if (
      (lang === "ts" && (tok.startsWith("//") || tok.startsWith("/*"))) ||
      (lang === "py" && tok.startsWith("#"))
    ) {
      cls = "tok-comment";
    } else if (
      tok.startsWith('"') ||
      tok.startsWith("'") ||
      tok.startsWith("`") ||
      (lang === "py" && /^[fFrRbBuU]{1,2}["']/.test(tok))
    ) {
      cls = "tok-string";
    } else if (tok.charCodeAt(0) >= 48 && tok.charCodeAt(0) <= 57) {
      cls = "tok-number";
    } else if (keywords.has(tok)) {
      cls = "tok-keyword";
    } else if (libs.has(tok)) {
      cls = "tok-lib";
    }

    const escaped = escapeCodeHtml(tok);
    out += cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    pos = tokenRe.lastIndex;
  }

  if (pos < code.length) {
    out += escapeCodeHtml(code.slice(pos));
  }
  return out;
}

/**
 * Render sequential 1-based line numbers matching code line breaks.
 */
export function renderLineNumbers(code: string): string {
  const count = Math.max(1, code.split("\n").length);
  const lines: string[] = [];
  for (let i = 1; i <= count; i++) {
    lines.push(String(i));
  }
  return lines.join("\n");
}
