/**
 * Lightweight, token-aware TypeScript-to-JavaScript stripper for browser exercise code.
 * Preserves strings, template literals (including nested ${...} expressions), comments,
 * comparison operators (`!=`, `!==`, `<=`, `>=`), and object literals cleanly.
 */

function isIdentChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_$]/.test(ch);
}

/** Mask strings, template literal static parts, and comments into neutral placeholder segments. */
interface CodeChunk {
  kind: "code" | "verbatim" | "comment";
  text: string;
}

const REGEX_PREFIX_KEYWORDS = new Set([
  "return",
  "throw",
  "case",
  "delete",
  "void",
  "typeof",
  "await",
  "yield",
  "in",
  "instanceof",
  "new",
  "else",
  "do",
  "as",
  "export",
  "default",
]);

function scanRegexLiteralEnd(src: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\" && i + 1 < src.length && src[i + 1] !== "\n") {
      i += 2;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      return -1;
    }
    if (ch === "[" && !inClass) {
      inClass = true;
    } else if (ch === "]" && inClass) {
      inClass = false;
    } else if (ch === "/" && !inClass) {
      i++;
      while (i < src.length && /[a-zA-Z]/.test(src[i])) i++;
      return i;
    }
    i++;
  }
  return -1;
}

function splitProtectedRegions(src: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let i = 0;
  let codeStart = 0;
  let regexAllowed = true;

  const pushCode = (end: number) => {
    if (end > codeStart) {
      chunks.push({ kind: "code", text: src.slice(codeStart, end) });
    }
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      pushCode(i);
      const start = i;
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      chunks.push({ kind: "comment", text: src.slice(start, i) });
      codeStart = i;
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      pushCode(i);
      const start = i;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(src.length, i + 2);
      chunks.push({ kind: "comment", text: src.slice(start, i) });
      codeStart = i;
      continue;
    }

    // Regex literal when division is not valid at current lexer state
    if (ch === "/" && next !== "/" && next !== "*" && regexAllowed) {
      const regexEnd = scanRegexLiteralEnd(src, i);
      if (regexEnd > i) {
        pushCode(i);
        chunks.push({ kind: "verbatim", text: src.slice(i, regexEnd) });
        i = regexEnd;
        codeStart = i;
        regexAllowed = false;
        continue;
      }
    }

    // Single or double quoted string
    if (ch === '"' || ch === "'") {
      pushCode(i);
      const start = i;
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      chunks.push({ kind: "verbatim", text: src.slice(start, i) });
      codeStart = i;
      regexAllowed = false;
      continue;
    }

    // Template literal: preserve static parts and `${...}` delimiters, recursively split `${...}` expressions
    if (ch === "`") {
      pushCode(i);
      let verbatimStart = i;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "`") {
          i++;
          chunks.push({ kind: "verbatim", text: src.slice(verbatimStart, i) });
          break;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          chunks.push({ kind: "verbatim", text: src.slice(verbatimStart, i) });
          const exprStart = i;
          let depth = 1;
          let exprRegexAllowed = true;
          while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === "/" && src[i + 1] === "/") {
              i += 2;
              while (i < src.length && src[i] !== "\n") i++;
              continue;
            }
            if (c === "/" && src[i + 1] === "*") {
              i += 2;
              while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
              i = Math.min(src.length, i + 2);
              continue;
            }
            if (c === "/" && src[i + 1] !== "/" && src[i + 1] !== "*" && exprRegexAllowed) {
              const rEnd = scanRegexLiteralEnd(src, i);
              if (rEnd > i) {
                i = rEnd;
                exprRegexAllowed = false;
                continue;
              }
            }
            if (c === '"' || c === "'" || c === "`") {
              const q = c;
              i++;
              while (i < src.length) {
                if (src[i] === "\\") {
                  i += 2;
                  continue;
                }
                if (src[i] === q) {
                  i++;
                  break;
                }
                i++;
              }
              exprRegexAllowed = false;
              continue;
            }
            if (c === "{") {
              depth++;
              exprRegexAllowed = true;
            } else if (c === "}") {
              depth--;
              if (depth === 0) break;
              exprRegexAllowed = true;
            } else if (c === ")" || c === "]" || /[0-9a-zA-Z_$]/.test(c)) {
              exprRegexAllowed = false;
            } else if (!/\s/.test(c)) {
              exprRegexAllowed = true;
            }
            i++;
          }
          chunks.push(...splitProtectedRegions(src.slice(exprStart, i)));
          if (src[i] === "}") i++;
          verbatimStart = i;
          chunks.push({ kind: "verbatim", text: "}" });
          continue;
        }
        i++;
      }
      codeStart = i;
      regexAllowed = false;
      continue;
    }

    // Track token state for regex vs division disambiguation
    if (isIdentStart(ch)) {
      const start = i;
      while (i < src.length && isIdentChar(src[i])) i++;
      const word = src.slice(start, i);
      regexAllowed = REGEX_PREFIX_KEYWORDS.has(word);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      while (i < src.length && /[0-9._a-fA-FxXoObBn]/.test(src[i])) i++;
      regexAllowed = false;
      continue;
    }

    if (ch === "+" && next === "+") {
      i += 2;
      regexAllowed = false;
      continue;
    }
    if (ch === "-" && next === "-") {
      i += 2;
      regexAllowed = false;
      continue;
    }

    if (ch === ")" || ch === "]") {
      regexAllowed = false;
    } else if (!/\s/.test(ch)) {
      regexAllowed = true;
    }

    i++;
  }

  pushCode(src.length);
  return chunks;
}

/** Replace comments with newline-preserving whitespace and mask strings/regexes so TS stripping never touches literals. */
function maskVerbatim(src: string): { masked: string; tokens: string[] } {
  const chunks = splitProtectedRegions(src);
  const tokens: string[] = [];
  let masked = "";
  for (const chunk of chunks) {
    if (chunk.kind === "verbatim") {
      const idx = tokens.length;
      tokens.push(chunk.text);
      masked += `\uE000LIT_${idx}\uE001`;
    } else if (chunk.kind === "comment") {
      masked += chunk.text.replace(/[^\n]/g, " ");
    } else {
      masked += chunk.text;
    }
  }
  return { masked, tokens };
}

function unmaskVerbatim(text: string, tokens: string[]): string {
  return text.replace(/\uE000LIT_(\d+)\uE001/g, (_, idxStr) => tokens[Number(idxStr)] ?? "");
}

function skipBalanced(s: string, start: number, open: string, close: string): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    if (open === "<" && close === ">" && s[i] === "=" && s[i + 1] === ">") {
      i += 2;
      continue;
    }
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return s.length;
}

function readTypeExpressionEnd(s: string, start: number, terminators: string[]): number {
  let i = start;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let angle = 0;

  while (i < s.length) {
    const ch = s[i];
    // Treat `=>` in function types carefully without closing `<`
    if (ch === "=" && s[i + 1] === ">") {
      if (paren === 0 && brace === 0 && bracket === 0 && angle === 0 && terminators.includes("=>")) {
        return i;
      }
      i += 2;
      continue;
    }
    if (paren === 0 && brace === 0 && bracket === 0 && angle === 0 && terminators.includes(ch)) {
      return i;
    }
    if (ch === "(") paren++;
    else if (ch === ")" && paren > 0) paren--;
    else if (ch === "{") brace++;
    else if (ch === "}" && brace > 0) brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]" && bracket > 0) bracket--;
    else if (ch === "<") angle++;
    else if (ch === ">" && angle > 0) angle--;
    else if (paren === 0 && brace === 0 && bracket === 0 && angle === 0 && ch === "\n") {
      return i;
    }
    i++;
  }
  return i;
}

const PRIMITIVE_TYPES = new Set([
  "number",
  "string",
  "boolean",
  "void",
  "any",
  "unknown",
  "never",
  "object",
  "symbol",
  "bigint",
  "null",
  "undefined",
  "this",
]);

function skipWsHorizontal(s: string, i: number): number {
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  return i;
}

function splitTopLevelTypeItems(inner: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let angle = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") paren++;
    else if (ch === ")") {
      if (paren === 0) return null;
      paren--;
    } else if (ch === "{") brace++;
    else if (ch === "}") {
      if (brace === 0) return null;
      brace--;
    } else if (ch === "[") bracket++;
    else if (ch === "]") {
      if (bracket === 0) return null;
      bracket--;
    } else if (ch === "<") angle++;
    else if (ch === ">") {
      // Preserve `=>` arrows inside nested parameter types
      if (i > 0 && inner[i - 1] === "=") continue;
      if (angle > 0) angle--;
    } else if (ch === "," && paren === 0 && brace === 0 && bracket === 0 && angle === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (paren !== 0 || brace !== 0 || bracket !== 0 || angle !== 0) return null;
  parts.push(inner.slice(start));
  return parts;
}

function isFunctionTypeParam(rawParam: string): boolean {
  const trimmed = rawParam.trim();
  if (!trimmed) return false;
  const isRest = trimmed.startsWith("...");
  const param = isRest ? trimmed.slice(3).trimStart() : trimmed;
  if (!param) return false;

  let i = 0;
  const first = param[0];
  if (first === "{" || first === "[") {
    const close = first === "{" ? "}" : "]";
    i = skipBalanced(param, 0, first, close);
    if (param[i - 1] !== close) return false;
  } else if (isIdentStart(first)) {
    while (i < param.length && isIdentChar(param[i])) i++;
  } else {
    return false;
  }

  while (i < param.length && /\s/.test(param[i])) i++;
  if (param[i] === "?") {
    i++;
    while (i < param.length && /\s/.test(param[i])) i++;
    if (i === param.length) return true;
  }
  if (param[i] === ":") return true;
  return isRest && i === param.length;
}

function looksLikeFunctionTypeParamList(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return true;
  const parts = splitTopLevelTypeItems(trimmed);
  if (!parts || parts.length === 0) return false;
  const items = parts[parts.length - 1].trim() === "" ? parts.slice(0, -1) : parts;
  if (items.length === 0) return false;
  return items.every(isFunctionTypeParam);
}

function readSingleTypeAtomEnd(s: string, start: number, allowFunctionType = true): number {
  let i = skipWsHorizontal(s, start);
  if (i >= s.length) return start;

  for (const kw of ["readonly", "keyof", "typeof", "unique"]) {
    if (s.startsWith(kw, i) && /\s/.test(s[i + kw.length] ?? "")) {
      return readSingleTypeAtomEnd(s, i + kw.length + 1, allowFunctionType);
    }
  }

  const ch = s[i];
  if (ch === "{" || ch === "[" || ch === "(") {
    const closeCh = ch === "{" ? "}" : ch === "[" ? "]" : ")";
    const openIdx = i;
    i = skipBalanced(s, i, ch, closeCh);
    if (ch === "(" && allowFunctionType && s[i - 1] === ")") {
      const inner = s.slice(openIdx + 1, i - 1);
      if (looksLikeFunctionTypeParamList(inner)) {
        const afterParen = skipWsHorizontal(s, i);
        if (s.startsWith("=>", afterParen)) {
          return readTypeEnd(s, afterParen + 2, true);
        }
      }
    }
  } else if (ch === "\uE000") {
    const endTok = s.indexOf("\uE001", i);
    i = endTok >= 0 ? endTok + 1 : i + 1;
  } else if (isIdentStart(ch) || /[0-9]/.test(ch)) {
    const firstStart = i;
    while (i < s.length && isIdentChar(s[i])) i++;
    let lastIdent = s.slice(firstStart, i);
    while (true) {
      const after = skipWsHorizontal(s, i);
      if (s[after] === "." && isIdentStart(s[after + 1] ?? "")) {
        i = after + 1;
        const segStart = i;
        while (i < s.length && isIdentChar(s[i])) i++;
        lastIdent = s.slice(segStart, i);
        continue;
      }
      if (
        after === i &&
        s[after] === "<" &&
        !PRIMITIVE_TYPES.has(lastIdent)
      ) {
        const endAng = skipBalanced(s, after, "<", ">");
        if (s[endAng - 1] === ">" && s[endAng] !== "=") {
          const inner = s.slice(after + 1, endAng - 1);
          if (looksLikeGenericTypeArgList(inner)) {
            i = endAng;
            continue;
          }
        }
      }
      break;
    }
  } else {
    return start;
  }

  while (true) {
    const after = skipWsHorizontal(s, i);
    if (s[after] === "[") {
      i = skipBalanced(s, after, "[", "]");
      continue;
    }
    break;
  }

  return i;
}

function readTypeEnd(s: string, start: number, allowFunctionType = true): number {
  let i = readSingleTypeAtomEnd(s, start, allowFunctionType);
  if (i === start) return start;
  while (true) {
    const after = skipWsHorizontal(s, i);
    const comb = s[after];
    if ((comb === "|" || comb === "&") && s[after + 1] !== comb) {
      const nextAtom = readSingleTypeAtomEnd(s, after + 1, allowFunctionType);
      if (nextAtom > after + 1) {
        i = nextAtom;
        continue;
      }
    }
    break;
  }
  return i;
}

function looksLikeGenericTypeArgList(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  if (/^[0-9]/.test(trimmed)) return false;

  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let angle = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "=" && trimmed[i + 1] === ">") {
      i++;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")" && paren > 0) paren--;
    else if (ch === "{") brace++;
    else if (ch === "}" && brace > 0) brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]" && bracket > 0) bracket--;
    else if (ch === "<") angle++;
    else if (ch === ">" && angle > 0) angle--;
    else if (paren === 0 && brace === 0 && bracket === 0 && angle === 0) {
      const two = trimmed.slice(i, i + 2);
      if (two === "||" || two === "&&" || two === "==" || two === "!=") {
        return false;
      }
      if (ch === ";" || ch === "+" || ch === "*" || ch === "/" || ch === "%") {
        return false;
      }
    }
  }

  return paren === 0 && brace === 0 && bracket === 0 && angle === 0;
}

function stripTopLevelDeclarations(s: string): string {
  let out = "";
  let i = 0;
  let depth = 0;

  while (i < s.length) {
    const ch = s[i];
    const atLineStart = i === 0 || s[i - 1] === "\n";

    if (depth === 0 && atLineStart) {
      // Skip leading horizontal whitespace on the line
      let wsEnd = i;
      while (wsEnd < s.length && (s[wsEnd] === " " || s[wsEnd] === "\t")) wsEnd++;

      // import ... ;
      if (s.startsWith("import", wsEnd) && !isIdentChar(s[wsEnd + 6] ?? "")) {
        let j = wsEnd + 6;
        while (j < s.length && s[j] !== ";") {
          // Stop if single-line import without semicolon hits newline after quote placeholder
          if (s[j] === "\n" && s.slice(wsEnd, j).includes("\uE001")) {
            j++;
            break;
          }
          j++;
        }
        if (s[j] === ";") j++;
        while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
        if (s[j] === "\n") j++;
        i = j;
        continue;
      }

      // export interface / export type / interface / type
      let declStart = wsEnd;
      if (s.startsWith("export", declStart) && /\s/.test(s[declStart + 6] ?? "")) {
        let afterExport = declStart + 6;
        while (afterExport < s.length && (s[afterExport] === " " || s[afterExport] === "\t")) {
          afterExport++;
        }
        if (
          (s.startsWith("interface", afterExport) && /\s/.test(s[afterExport + 9] ?? "")) ||
          (s.startsWith("type", afterExport) && /\s/.test(s[afterExport + 4] ?? ""))
        ) {
          declStart = afterExport;
        }
      }

      if (s.startsWith("interface", declStart) && /\s/.test(s[declStart + 9] ?? "")) {
        let j = declStart + 9;
        while (j < s.length && s[j] !== "{") j++;
        if (s[j] === "{") j = skipBalanced(s, j, "{", "}");
        while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === ";")) j++;
        if (s[j] === "\n") j++;
        i = j;
        continue;
      }

      if (s.startsWith("type", declStart) && /\s/.test(s[declStart + 4] ?? "")) {
        let j = declStart + 4;
        let b = 0;
        let p = 0;
        let sq = 0;
        let a = 0;
        let seenEq = false;
        while (j < s.length) {
          const c = s[j];
          if (c === "=" && s[j + 1] === ">") {
            j += 2;
            continue;
          }
          if (c === "=" && b === 0 && p === 0 && sq === 0 && a === 0 && !seenEq) {
            seenEq = true;
            j++;
            continue;
          }
          if (c === "{") b++;
          else if (c === "}" && b > 0) b--;
          else if (c === "(") p++;
          else if (c === ")" && p > 0) p--;
          else if (c === "[") sq++;
          else if (c === "]" && sq > 0) sq--;
          else if (c === "<") a++;
          else if (c === ">" && a > 0) a--;
          else if (c === ";" && b === 0 && p === 0 && sq === 0 && a === 0) {
            j++;
            break;
          } else if (c === "\n" && seenEq && b === 0 && p === 0 && sq === 0 && a === 0) {
            let back = j - 1;
            while (back >= declStart && (s[back] === " " || s[back] === "\t" || s[back] === "\r")) {
              back--;
            }
            const prevCh = s[back] ?? "";
            let fwd = j + 1;
            while (fwd < s.length && (s[fwd] === " " || s[fwd] === "\t" || s[fwd] === "\r")) {
              fwd++;
            }
            const nextCh = s[fwd] ?? "";
            const continuesLine =
              prevCh === "=" || prevCh === "|" || prevCh === "&" || nextCh === "|" || nextCh === "&";
            if (!continuesLine) {
              j++;
              break;
            }
          }
          j++;
        }
        while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
        if (s[j] === "\n") j++;
        i = j;
        continue;
      }
    }

    if (ch === "{") depth++;
    else if (ch === "}" && depth > 0) depth--;

    out += ch;
    i++;
  }

  return out;
}

function stripExportKeywords(s: string): string {
  return s.replace(/^([ \t]*)export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm, "$1");
}

function stripParameterAndReturnTypes(s: string): string {
  // Handle `function foo<T>(...) : RetType {` and `const f = async (x: T): Promise<U> =>`
  let out = "";
  let i = 0;

  while (i < s.length) {
    const fnMatch = /^(?:async\s+)?function\b/.exec(s.slice(i));
    const prevCh = i > 0 ? s[i - 1] : " ";
    if (fnMatch && !isIdentChar(prevCh)) {
      out += fnMatch[0];
      i += fnMatch[0].length;
      while (i < s.length && /\s/.test(s[i])) {
        out += s[i++];
      }
      // Optional function name
      while (i < s.length && isIdentChar(s[i])) {
        out += s[i++];
      }
      while (i < s.length && /\s/.test(s[i])) {
        out += s[i++];
      }
      // Optional generic params `<...>` before `(`
      if (s[i] === "<") {
        i = skipBalanced(s, i, "<", ">");
        while (i < s.length && /\s/.test(s[i])) i++;
      }
      if (s[i] === "(") {
        const paramEnd = skipBalanced(s, i, "(", ")");
        out += stripParamList(s.slice(i, paramEnd));
        i = paramEnd;
        while (i < s.length && /\s/.test(s[i])) {
          out += s[i++];
        }
        if (s[i] === ":") {
          const afterType = readTypeEnd(s, i + 1);
          if (afterType > i + 1) {
            i = afterType;
          }
        }
        continue;
      }
      continue;
    }

    // Arrow functions `(a: T, b: U): R =>`
    if (s[i] === "(") {
      const closeIdx = skipBalanced(s, i, "(", ")");
      // Inspect whether this `(` list is immediately followed by `=>` or `: Type =>`
      let after = closeIdx;
      while (after < s.length && (s[after] === " " || s[after] === "\t")) after++;
      let isArrowWithTypes = false;
      let bodyStart = after;
      if (s.slice(after, after + 2) === "=>") {
        isArrowWithTypes = true;
      } else if (s[after] === ":") {
        // Arrow function return types cannot be unparenthesized function types, so leave top-level `=>` to the arrow body
        const afterColon = skipWsHorizontal(s, readTypeEnd(s, after + 1, false));
        if (s.slice(afterColon, afterColon + 2) === "=>") {
          isArrowWithTypes = true;
          bodyStart = afterColon;
        }
      }
      if (isArrowWithTypes) {
        out += stripParamList(s.slice(i, closeIdx));
        i = bodyStart;
        continue;
      }
    }

    out += s[i++];
  }

  return out;
}

function stripParamList(parenText: string): string {
  // Recursively remove `: Type` annotations from top-level parameters inside `(...)`
  const inner = parenText.slice(1, -1);
  let out = "";
  let i = 0;
  let p = 0;
  let b = 0;
  let sq = 0;
  let inDefault = false;

  while (i < inner.length) {
    const ch = inner[i];
    if (ch === "(") p++;
    else if (ch === ")" && p > 0) p--;
    else if (ch === "{") b++;
    else if (ch === "}" && b > 0) b--;
    else if (ch === "[") sq++;
    else if (ch === "]" && sq > 0) sq--;
    else if (p === 0 && b === 0 && sq === 0) {
      if (
        inDefault &&
        ch === "<" &&
        isIdentChar(out[out.length - 1] ?? "") &&
        inner[i + 1] !== "="
      ) {
        const endAng = skipBalanced(inner, i, "<", ">");
        const angInner = inner.slice(i + 1, endAng - 1);
        if (
          inner[endAng - 1] === ">" &&
          (!angInner.includes("?") || /\bextends\b/.test(angInner)) &&
          looksLikeGenericTypeArgList(angInner)
        ) {
          out += inner.slice(i, endAng);
          i = endAng;
          continue;
        }
      } else if (ch === ",") {
        inDefault = false;
      } else if (!inDefault && ch === "=" && inner[i + 1] !== ">" && inner[i + 1] !== "=") {
        inDefault = true;
      } else if (!inDefault && ch === "?" && /\s*[:,)=]/.test(inner.slice(i + 1))) {
        i++;
        continue;
      } else if (!inDefault && ch === ":") {
        i++;
        i = readTypeExpressionEnd(inner, i, [",", "="]);
        continue;
      }
    }
    out += ch;
    i++;
  }

  return `(${out})`;
}

function stripVarAnnotationsAndGenerics(s: string): string {
  let out = "";
  let i = 0;

  while (i < s.length) {
    // 1. Variable declarations: `const|let|var name: Type =`
    const declMatch = /\b(const|let|var)\b/.exec(s.slice(i));
    if (declMatch && declMatch.index === 0 && (i === 0 || !isIdentChar(s[i - 1]))) {
      out += declMatch[0];
      i += declMatch[0].length;
      while (i < s.length && /\s/.test(s[i])) out += s[i++];
      if (isIdentStart(s[i] ?? "")) {
        while (i < s.length && isIdentChar(s[i])) out += s[i++];
        let ws = i;
        while (ws < s.length && (s[ws] === " " || s[ws] === "\t")) ws++;
        if (s[ws] === ":") {
          const typeEnd = readTypeExpressionEnd(s, ws + 1, ["=", ";"]);
          if (s[typeEnd] === "=") {
            out += " ";
            i = typeEnd;
            continue;
          }
        }
      }
      continue;
    }

    // 2. Call-site / constructor generic type arguments: `new Map<K, V>(` or `fn<T>(`
    if (s[i] === "<" && isIdentChar(out[out.length - 1] ?? "")) {
      const endAngle = skipBalanced(s, i, "<", ">");
      if (s[endAngle - 1] === ">" && s[endAngle] !== "=") {
        const inner = s.slice(i + 1, endAngle - 1);
        let after = endAngle;
        while (after < s.length && (s[after] === " " || s[after] === "\t")) after++;
        if (s[after] === "(" && looksLikeGenericTypeArgList(inner)) {
          i = endAngle;
          continue;
        }
      }
    }

    // 3. `as const` or `as Type` assertions
    if (
      s.startsWith("as", i) &&
      (i === 0 || !isIdentChar(s[i - 1])) &&
      (s[i + 2] === " " || s[i + 2] === "\t")
    ) {
      // Distinguish `as ...` type assertion from normal identifiers
      let j = i + 2;
      while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
      if (s.startsWith("const", j) && !isIdentChar(s[j + 5] ?? "")) {
        i = j + 5;
        continue;
      }
      // If inside code (preceded by expression token like ident, ), ], or verbatim string), strip type expression
      const prevTrim = out.trimEnd();
      const prevC = prevTrim[prevTrim.length - 1] ?? "";
      if (isIdentChar(prevC) || prevC === ")" || prevC === "]" || prevC === "\uE001") {
        const typeEnd = readTypeEnd(s, j);
        if (typeEnd > j) {
          if (out.endsWith(" ") && (s[typeEnd] === " " || s[typeEnd] === "\t")) {
            out = out.slice(0, -1);
          }
          i = typeEnd;
          continue;
        }
      }
    }

    // 4. Non-null assertions `expr!` without touching `!=` or `!==`
    if (s[i] === "!" && s[i + 1] !== "=") {
      const prevC = out[out.length - 1] ?? "";
      if (isIdentChar(prevC) || prevC === ")" || prevC === "]") {
        i++;
        continue;
      }
    }

    out += s[i++];
  }

  return out;
}

export function transpileExerciseTsToJs(rawCode: string): string {
  const { masked, tokens } = maskVerbatim(rawCode);
  let transformed = stripTopLevelDeclarations(masked);
  transformed = stripExportKeywords(transformed);
  transformed = stripParameterAndReturnTypes(transformed);
  transformed = stripVarAnnotationsAndGenerics(transformed);
  return unmaskVerbatim(transformed, tokens);
}
