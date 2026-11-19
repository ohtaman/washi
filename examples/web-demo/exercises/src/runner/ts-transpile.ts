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
  let prevWasDot = false;

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
        prevWasDot = false;
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
      prevWasDot = false;
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
      prevWasDot = false;
      continue;
    }

    // Track token state for regex vs division disambiguation (treat `.keyword` as property access, not prefix keyword)
    if (isIdentStart(ch)) {
      const start = i;
      while (i < src.length && isIdentChar(src[i])) i++;
      const word = src.slice(start, i);
      regexAllowed = !prevWasDot && REGEX_PREFIX_KEYWORDS.has(word);
      prevWasDot = false;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      while (i < src.length && /[0-9._a-fA-FxXoObBn]/.test(src[i])) i++;
      regexAllowed = false;
      prevWasDot = false;
      continue;
    }

    if (ch === "+" && next === "+") {
      i += 2;
      regexAllowed = false;
      prevWasDot = false;
      continue;
    }
    if (ch === "-" && next === "-") {
      i += 2;
      regexAllowed = false;
      prevWasDot = false;
      continue;
    }

    if (ch === "." && src[i - 1] !== "." && next !== ".") {
      prevWasDot = true;
      regexAllowed = true;
    } else if (ch === ")" || ch === "]") {
      regexAllowed = false;
      prevWasDot = false;
    } else if (!/\s/.test(ch)) {
      regexAllowed = true;
      prevWasDot = false;
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

function readTypeExpressionEnd(
  s: string,
  start: number,
  terminators: string[],
  stopAtNewline = true,
): number {
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
    else if (stopAtNewline && paren === 0 && brace === 0 && bracket === 0 && angle === 0 && ch === "\n") {
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

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function readPrevWord(text: string): string {
  const trimmed = text.trimEnd();
  const end = trimmed.length;
  let start = end;
  while (start > 0 && isIdentChar(trimmed[start - 1])) start--;
  return trimmed.slice(start, end);
}

function isPropertyAccessWord(text: string, word: string): boolean {
  if (!word) return false;
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(word)) return false;
  const beforeWord = trimmed.slice(0, trimmed.length - word.length).trimEnd();
  return beforeWord.endsWith(".") && !beforeWord.endsWith("..");
}

function scanGenericArgListEnd(s: string, start: number, prevChar: string): number {
  const isOptionalChain = start >= 2 && s[start - 2] === "?" && s[start - 1] === ".";
  if ((!isIdentChar(prevChar) && !isOptionalChain) || s[start] !== "<" || s[start + 1] === "=") {
    return -1;
  }
  const endAng = skipBalanced(s, start, "<", ">");
  if (s[endAng - 1] !== ">") return -1;
  const angInner = s.slice(start + 1, endAng - 1);
  if (!looksLikeGenericTypeArgList(angInner)) return -1;
  const after = skipWsHorizontal(s, endAng);
  const nextCh = s[after] ?? "";
  if (
    nextCh !== "" &&
    nextCh !== "(" &&
    nextCh !== "\uE000" &&
    nextCh !== "," &&
    nextCh !== ";" &&
    nextCh !== ")" &&
    nextCh !== "}" &&
    nextCh !== "]" &&
    nextCh !== "." &&
    nextCh !== "\n"
  ) {
    return -1;
  }
  return endAng;
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

function readSingleTypeAtomEnd(
  s: string,
  start: number,
  allowFunctionType = true,
  allowNewline = false,
): number {
  const skip = allowNewline ? skipWs : skipWsHorizontal;
  let i = skip(s, start);
  if (i >= s.length) return start;

  for (const kw of ["readonly", "keyof", "typeof", "unique"]) {
    if (s.startsWith(kw, i) && /\s/.test(s[i + kw.length] ?? "")) {
      return readSingleTypeAtomEnd(s, i + kw.length + 1, allowFunctionType, allowNewline);
    }
  }

  let ch = s[i];
  if (ch === "-" && /[0-9]/.test(s[i + 1] ?? "")) {
    i++;
    ch = s[i];
  }
  if (ch === "{" || ch === "[" || ch === "(") {
    const closeCh = ch === "{" ? "}" : ch === "[" ? "]" : ")";
    const openIdx = i;
    i = skipBalanced(s, i, ch, closeCh);
    if (ch === "(" && allowFunctionType && s[i - 1] === ")") {
      const inner = s.slice(openIdx + 1, i - 1);
      if (looksLikeFunctionTypeParamList(inner)) {
        const afterParen = skipWsHorizontal(s, i);
        if (s.startsWith("=>", afterParen)) {
          return readTypeEnd(s, afterParen + 2, true, allowNewline);
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
    const afterIdent = skipWsHorizontal(s, i);
    if (s.startsWith("is", afterIdent) && /\s/.test(s[afterIdent + 2] ?? "")) {
      const predEnd = readTypeEnd(s, afterIdent + 3, allowFunctionType, allowNewline);
      if (predEnd > afterIdent + 3) {
        return predEnd;
      }
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

function readTypeEnd(
  s: string,
  start: number,
  allowFunctionType = true,
  allowNewline = false,
): number {
  const skip = allowNewline ? skipWs : skipWsHorizontal;
  let firstStart = skip(s, start);
  if ((s[firstStart] === "|" || s[firstStart] === "&") && s[firstStart + 1] !== s[firstStart]) {
    firstStart = firstStart + 1;
  }
  let i = readSingleTypeAtomEnd(s, firstStart, allowFunctionType, allowNewline);
  if (i <= firstStart) return start;
  while (true) {
    const after = skip(s, i);
    const comb = s[after];
    if ((comb === "|" || comb === "&") && s[after + 1] !== comb) {
      const nextAtom = readSingleTypeAtomEnd(s, after + 1, allowFunctionType, allowNewline);
      if (nextAtom > after + 1) {
        i = nextAtom;
        continue;
      }
    }
    break;
  }
  const extStart = skipWsHorizontal(s, i);
  if (s.startsWith("extends", extStart) && /\s/.test(s[extStart + 7] ?? "")) {
    const checkEnd = readTypeEnd(s, extStart + 8, true, allowNewline);
    if (checkEnd > extStart + 8) {
      const qPos = skip(s, checkEnd);
      if (s[qPos] === "?") {
        const trueEnd = readTypeEnd(s, qPos + 1, true, allowNewline);
        if (trueEnd > qPos + 1) {
          const cPos = skip(s, trueEnd);
          if (s[cPos] === ":") {
            const falseEnd = readTypeEnd(s, cPos + 1, allowFunctionType, allowNewline);
            if (falseEnd > cPos + 1) {
              return falseEnd;
            }
          }
        }
      }
    }
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
  let ternaryDepth = 0;
  let argStart = 0;

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
      if (ch === ",") {
        if (ternaryDepth !== 0) return false;
        argStart = i + 1;
        continue;
      }
      if (ch === "?") {
        if (!/\bextends\b/.test(trimmed.slice(argStart, i))) return false;
        ternaryDepth++;
        continue;
      }
      if (ch === ":") {
        if (ternaryDepth === 0) return false;
        ternaryDepth--;
        continue;
      }
      const two = trimmed.slice(i, i + 2);
      if (two === "||" || two === "&&" || two === "==" || two === "!=") {
        return false;
      }
      if (
        ch === ";" ||
        ch === "+" ||
        ch === "*" ||
        ch === "/" ||
        ch === "%" ||
        ch === "=" ||
        ch === "!" ||
        ch === "~" ||
        ch === "^"
      ) {
        return false;
      }
    }
  }

  return paren === 0 && brace === 0 && bracket === 0 && angle === 0 && ternaryDepth === 0;
}

function isStatementBoundary(out: string, s: string, i: number): boolean {
  if (i === 0 || s[i - 1] === "\n") return true;
  const trimmed = out.trimEnd();
  if (!trimmed) return true;
  const last = trimmed[trimmed.length - 1];
  return last === ";" || last === "{" || last === "}";
}

function stripTopLevelDeclarations(s: string): string {
  let out = "";
  let i = 0;
  let depth = 0;

  while (i < s.length) {
    const ch = s[i];
    const atLineStart = i === 0 || s[i - 1] === "\n";
    const atBoundary = isStatementBoundary(out, s, i);

    if (atBoundary) {
      let wsEnd = i;
      if (atLineStart) {
        while (wsEnd < s.length && (s[wsEnd] === " " || s[wsEnd] === "\t")) wsEnd++;
      }

      // Top-level `import ... ;` (excluding dynamic `import(...)` calls)
      if (depth === 0 && s.startsWith("import", wsEnd) && !isIdentChar(s[wsEnd + 6] ?? "")) {
        const afterImp = skipWsHorizontal(s, wsEnd + 6);
        if (s[afterImp] !== "(") {
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
      }

      // Top-level `export { ... }`, `export type { ... }`, `export * ...`, `export type * ...`
      if (
        depth === 0 &&
        s.startsWith("export", wsEnd) &&
        !isIdentChar(s[wsEnd + 6] ?? "")
      ) {
        const afterExport = skipWsHorizontal(s, wsEnd + 6);
        let exportTailStart = afterExport;
        if (s.startsWith("type", afterExport) && !isIdentChar(s[afterExport + 4] ?? "")) {
          const afterTypeKw = skipWsHorizontal(s, afterExport + 4);
          if (s[afterTypeKw] === "{" || s[afterTypeKw] === "*") {
            exportTailStart = afterTypeKw;
          }
        }
        if (s[exportTailStart] === "{" || s[exportTailStart] === "*") {
          let j =
            s[exportTailStart] === "{"
              ? skipBalanced(s, exportTailStart, "{", "}")
              : exportTailStart + 1;
          if (s[exportTailStart] === "*") {
            const afterStar = skipWsHorizontal(s, j);
            if (s.startsWith("as", afterStar) && (s[afterStar + 2] === " " || s[afterStar + 2] === "\t")) {
              j = skipWsHorizontal(s, afterStar + 2);
              while (j < s.length && isIdentChar(s[j])) j++;
            }
          }
          const kwPos = skipWsHorizontal(s, j);
          if (s.startsWith("from", kwPos) && !isIdentChar(s[kwPos + 4] ?? "")) {
            j = skipWsHorizontal(s, kwPos + 4);
            while (j < s.length && !/[\s;]/.test(s[j])) j++;
          }
          while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === ";")) j++;
          if (s[j] === "\n") j++;
          i = j;
          continue;
        }
      }

      // `export interface / export type / interface / type` at module or inline statement boundary
      let declStart = wsEnd;
      if (s.startsWith("export", declStart) && (s[declStart + 6] === " " || s[declStart + 6] === "\t")) {
        const afterExport = skipWsHorizontal(s, declStart + 6);
        if (
          (s.startsWith("interface", afterExport) && (s[afterExport + 9] === " " || s[afterExport + 9] === "\t")) ||
          (s.startsWith("type", afterExport) && (s[afterExport + 4] === " " || s[afterExport + 4] === "\t"))
        ) {
          declStart = afterExport;
        }
      }

      if (s.startsWith("interface", declStart) && (s[declStart + 9] === " " || s[declStart + 9] === "\t")) {
        const nameStart = skipWsHorizontal(s, declStart + 9);
        if (isIdentStart(s[nameStart] ?? "")) {
          let j = nameStart;
          while (j < s.length) {
            const ch = s[j];
            if (ch === "<") {
              j = skipBalanced(s, j, "<", ">");
              continue;
            }
            if (ch === "(") {
              j = skipBalanced(s, j, "(", ")");
              continue;
            }
            if (ch === "[") {
              j = skipBalanced(s, j, "[", "]");
              continue;
            }
            if (ch === "{" || ch === ";" || ch === "}") break;
            j++;
          }
          if (s[j] === "{") {
            j = skipBalanced(s, j, "{", "}");
            while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === ";")) j++;
            if (s[j] === "\n") j++;
            i = j;
            continue;
          }
        }
      }

      if (s.startsWith("type", declStart) && (s[declStart + 4] === " " || s[declStart + 4] === "\t")) {
        const nameStart = skipWsHorizontal(s, declStart + 4);
        if (isIdentStart(s[nameStart] ?? "")) {
          let afterName = nameStart;
          while (afterName < s.length && isIdentChar(s[afterName])) afterName++;
          afterName = skipWsHorizontal(s, afterName);
          if (s[afterName] === "<") {
            afterName = skipWsHorizontal(s, skipBalanced(s, afterName, "<", ">"));
          }
          if (s[afterName] === "=" && s[afterName + 1] !== ">" && s[afterName + 1] !== "=") {
            let j = afterName + 1;
            let b = 0;
            let p = 0;
            let sq = 0;
            let a = 0;
            while (j < s.length) {
              const c = s[j];
              if (c === "=" && s[j + 1] === ">") {
                j += 2;
                continue;
              }
              if (c === "{") b++;
              else if (c === "}" && b > 0) b--;
              else if (c === "}" && b === 0 && p === 0 && sq === 0 && a === 0) {
                // Stop before an enclosing block's closing `}` on inline type aliases
                break;
              } else if (c === "(") p++;
              else if (c === ")" && p > 0) p--;
              else if (c === "[") sq++;
              else if (c === "]" && sq > 0) sq--;
              else if (c === "<") a++;
              else if (c === ">" && a > 0) a--;
              else if (c === ";" && b === 0 && p === 0 && sq === 0 && a === 0) {
                j++;
                break;
              } else if (c === "\n" && b === 0 && p === 0 && sq === 0 && a === 0) {
                let back = j - 1;
                while (back >= afterName && (s[back] === " " || s[back] === "\t" || s[back] === "\r")) {
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
      }
    }

    if (ch === "{") depth++;
    else if (ch === "}" && depth > 0) depth--;

    out += ch;
    i++;
  }

  return out;
}

const TRAILING_CONTINUATION_WORDS = new Set([
  "typeof",
  "void",
  "delete",
  "await",
  "yield",
  "in",
  "instanceof",
  "new",
  "as",
  "satisfies",
  "of",
]);

const LEADING_CONTINUATION_WORDS = new Set(["instanceof", "in"]);
const PARAM_MODIFIERS = /^(?:public|private|protected|readonly|override)\b/;

const NON_ASSERTION_OPERAND_WORDS = new Set([
  "function",
  "class",
  "const",
  "let",
  "var",
  "import",
  "export",
  "default",
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
  "if",
  "while",
  "for",
  "switch",
  "catch",
  "try",
  "finally",
  "break",
  "continue",
  "debugger",
  "extends",
]);

const OBJECT_LITERAL_PREFIX_WORDS = new Set([
  "return",
  "throw",
  "yield",
  "await",
  "case",
  "default",
  "typeof",
  "void",
  "delete",
  "in",
  "instanceof",
  "new",
  "of",
  "as",
  "satisfies",
]);

function isObjectLiteralBrace(text: string): boolean {
  let depth = 0;
  let openIdx = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      depth--;
      if (depth === 0) {
        openIdx = i;
        break;
      }
    }
  }
  if (openIdx < 0) return false;
  const before = text.slice(0, openIdx).trimEnd();
  if (!before) return true;
  if (before.endsWith("=>")) return false;
  const ch = before[before.length - 1];
  if ("=([,:?!~+-*/%&|^".includes(ch)) return true;
  if (isIdentChar(ch)) {
    return OBJECT_LITERAL_PREFIX_WORDS.has(readPrevWord(before));
  }
  return false;
}

function isForOfSeparator(beforeOf: string): boolean {
  if (!beforeOf.trim()) return false;
  let paren = 0;
  let brace = 0;
  let bracket = 0;

  for (let k = beforeOf.length - 1; k >= 0; k--) {
    const ch = beforeOf[k];
    if (ch === ")") paren++;
    else if (ch === "}") brace++;
    else if (ch === "]") bracket++;
    else if (ch === "(") {
      if (paren > 0) {
        paren--;
      } else if (brace === 0 && bracket === 0) {
        if (!beforeOf.slice(k + 1).trim()) return false;
        const prefix = beforeOf.slice(0, k).trimEnd();
        const pWord = readPrevWord(prefix);
        if (pWord === "for" && !isPropertyAccessWord(prefix, "for")) return true;
        if (pWord === "await" && !isPropertyAccessWord(prefix, "await")) {
          const beforeAwait = prefix.slice(0, prefix.length - 5).trimEnd();
          return readPrevWord(beforeAwait) === "for" && !isPropertyAccessWord(beforeAwait, "for");
        }
        return false;
      } else {
        return false;
      }
    } else if (ch === "{") {
      if (brace > 0) brace--;
      else return false;
    } else if (ch === "[") {
      if (bracket > 0) bracket--;
      else return false;
    } else if ((ch === ";" || ch === "=") && paren === 0 && brace === 0 && bracket === 0) {
      return false;
    }
  }
  return false;
}

function canPrecedeTypeAssertion(out: string): boolean {
  const prevTrim = out.trimEnd();
  if (!prevTrim) return false;
  // TypeScript forbids a newline before `as` or `satisfies` assertions
  if (out.slice(prevTrim.length).includes("\n")) return false;
  const prevC = prevTrim[prevTrim.length - 1];
  if (prevC === "}") return isObjectLiteralBrace(prevTrim);
  if (isIdentChar(prevC)) {
    const word = readPrevWord(prevTrim);
    if (isPropertyAccessWord(prevTrim, word)) return true;
    if (word === "of") {
      return !isForOfSeparator(prevTrim.slice(0, prevTrim.length - 2));
    }
    return !NON_ASSERTION_OPERAND_WORDS.has(word);
  }
  return prevC === ")" || prevC === "]" || prevC === "\uE001";
}

function readWordAt(s: string, start: number): string {
  let end = start;
  while (end < s.length && isIdentChar(s[end])) end++;
  return s.slice(start, end);
}

function continuesExpressionAcrossNewline(s: string, nlIdx: number, exprStart: number): boolean {
  let back = nlIdx - 1;
  while (back >= exprStart && (s[back] === " " || s[back] === "\t" || s[back] === "\r")) {
    back--;
  }
  if (back < exprStart) {
    return true;
  }

  const prevTwo = s.slice(Math.max(exprStart, back - 1), back + 1);
  if (prevTwo === "=>") return true;
  if (prevTwo !== "++" && prevTwo !== "--") {
    const prevCh = s[back];
    if ("=?.:+-*/%&|^!~<>".includes(prevCh)) return true;
  }

  const beforeNl = s.slice(exprStart, back + 1);
  const prevWord = readPrevWord(beforeNl);
  if (
    prevWord &&
    TRAILING_CONTINUATION_WORDS.has(prevWord) &&
    !isPropertyAccessWord(beforeNl, prevWord)
  ) {
    return true;
  }

  const fwd = skipWs(s, nlIdx + 1);
  if (fwd >= s.length) return false;
  if (s.startsWith("?.", fwd) || s.startsWith("==", fwd) || s.startsWith("!=", fwd)) {
    return true;
  }
  const nextTwo = s.slice(fwd, fwd + 2);
  if (nextTwo === "++" || nextTwo === "--" || s.startsWith("...", fwd)) {
    return false;
  }
  const nextCh = s[fwd];
  if (".?:*/%&|^<>+-".includes(nextCh)) {
    return true;
  }

  if (isIdentStart(nextCh)) {
    return LEADING_CONTINUATION_WORDS.has(readWordAt(s, fwd));
  }
  return false;
}

function scanExpressionEnd(
  s: string,
  start: number,
  stopChars: Set<string>,
  stopOnAsiNewline: boolean,
): number {
  let i = start;
  let paren = 0;
  let brace = 0;
  let bracket = 0;

  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") paren++;
    else if (ch === ")") {
      if (paren === 0 && stopChars.has(")")) return i;
      if (paren > 0) paren--;
    } else if (ch === "{") brace++;
    else if (ch === "}") {
      if (brace === 0 && stopChars.has("}")) return i;
      if (brace > 0) brace--;
    } else if (ch === "[") bracket++;
    else if (ch === "]") {
      if (bracket === 0 && stopChars.has("]")) return i;
      if (bracket > 0) bracket--;
    } else if (paren === 0 && brace === 0 && bracket === 0) {
      if (ch === "<") {
        const endAng = scanGenericArgListEnd(s, i, i > start ? s[i - 1] : "");
        if (endAng > i) {
          i = endAng;
          continue;
        }
        const genericArrowEnd = scanGenericArrowPrefixEnd(s, i);
        if (genericArrowEnd > i) {
          i = genericArrowEnd;
          continue;
        }
      } else if (stopChars.has(ch)) {
        return i;
      } else if (stopOnAsiNewline && ch === "\n" && !continuesExpressionAcrossNewline(s, i, start)) {
        return i;
      }
    }
    i++;
  }
  return i;
}

const VAR_INIT_STOP_CHARS = new Set([",", ";", "}", ")"]);
const PARAM_DEFAULT_STOP_CHARS = new Set([","]);

function isBindingStart(ch: string): boolean {
  return ch === "{" || ch === "[" || isIdentStart(ch);
}

const TS_MEMBER_MODIFIERS = new Set([
  "public",
  "private",
  "protected",
  "readonly",
  "override",
  "abstract",
  "declare",
]);

const JS_MEMBER_MODIFIERS = new Set(["static", "async", "get", "set", "accessor"]);

function scanClassFieldInitializerEnd(s: string, start: number): number {
  let i = start;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") paren++;
    else if (ch === ")" && paren > 0) paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]" && bracket > 0) bracket--;
    else if (ch === "{") brace++;
    else if (ch === "}") {
      if (brace === 0 && paren === 0 && bracket === 0) return i;
      brace--;
    } else if (ch === ";" && paren === 0 && bracket === 0 && brace === 0) {
      return i;
    } else if (ch === "\n" && paren === 0 && bracket === 0 && brace === 0) {
      const before = s.slice(start, i).trimEnd();
      const last = before[before.length - 1] ?? "";
      const next = skipWs(s, i + 1);
      const nextCh = s[next] ?? "";
      const continuesBefore = before.length === 0 || "=+-*/%&|^?:,.<>".includes(last);
      const continuesAfter = ".?:+-*/%&|".includes(nextCh);
      if (!continuesBefore && !continuesAfter) {
        return i;
      }
    }
    i++;
  }
  return i;
}

function stripClassBody(body: string): string {
  let out = "";
  let i = 0;

  while (i < body.length) {
    while (i < body.length && (/\s/.test(body[i]) || body[i] === ";")) {
      out += body[i++];
    }
    if (i >= body.length) break;

    const firstWord = readWordAt(body, i);
    if (firstWord === "static") {
      const afterStatic = skipWs(body, i + 6);
      if (body[afterStatic] === "{") {
        const closeBlock = skipBalanced(body, afterStatic, "{", "}");
        if (body[closeBlock - 1] === "}") {
          out += `static {${stripClassDeclarations(body.slice(afterStatic + 1, closeBlock - 1))}}`;
          i = closeBlock;
          continue;
        }
      }
    }

    const memberStartOutLen = out.length;
    let isAmbient = false;

    while (i < body.length) {
      const modWord = readWordAt(body, i);
      if (!modWord || (!TS_MEMBER_MODIFIERS.has(modWord) && !JS_MEMBER_MODIFIERS.has(modWord))) {
        break;
      }
      const modEnd = i + modWord.length;
      const afterMod = skipWs(body, modEnd);
      const nextCh = body[afterMod] ?? "";
      if (!nextCh || ":=;()<>?!}".includes(nextCh)) {
        break;
      }
      if (modWord === "declare" || modWord === "abstract") {
        isAmbient = true;
      }
      if (TS_MEMBER_MODIFIERS.has(modWord)) {
        i = afterMod;
      } else {
        out += modWord + body.slice(modEnd, afterMod);
        i = afterMod;
      }
    }

    if (body[i] === "*") {
      out += "*";
      i++;
      while (i < body.length && /\s/.test(body[i])) out += body[i++];
    }

    if (body[i] === "[") {
      const endBracket = skipBalanced(body, i, "[", "]");
      out += stripClassDeclarations(body.slice(i, endBracket));
      i = endBracket;
    } else if (body[i] === "#") {
      out += "#";
      i++;
      while (i < body.length && isIdentChar(body[i])) out += body[i++];
    } else if (isIdentStart(body[i] ?? "")) {
      while (i < body.length && isIdentChar(body[i])) out += body[i++];
    } else {
      const nameStart = i;
      while (i < body.length && !/[\s<(?!=:;}\n]/.test(body[i])) out += body[i++];
      if (i === nameStart) {
        out += body[i++];
        continue;
      }
    }

    let pos = skipWsHorizontal(body, i);
    if (body[pos] === "?" || body[pos] === "!") {
      pos = skipWsHorizontal(body, pos + 1);
    }

    if (body[pos] === "<") {
      const endAng = skipBalanced(body, pos, "<", ">");
      const afterAng = skipWsHorizontal(body, endAng);
      if (body[endAng - 1] === ">" && body[afterAng] === "(") {
        pos = afterAng;
      }
    }

    if (body[pos] === "(") {
      const closeParen = skipBalanced(body, pos, "(", ")");
      if (body[closeParen - 1] !== ")") {
        out += body.slice(i);
        break;
      }
      const paramsText = body.slice(pos, closeParen);
      let afterParen = skipWsHorizontal(body, closeParen);
      if (body[afterParen] === ":") {
        afterParen = skipWsHorizontal(body, readTypeEnd(body, afterParen + 1));
      }
      const bodyStart = skipWs(body, afterParen);
      if (!isAmbient && body[bodyStart] === "{") {
        const closeBrace = skipBalanced(body, bodyStart, "{", "}");
        out += `${paramsText} {${stripClassDeclarations(body.slice(bodyStart + 1, closeBrace - 1))}}`;
        i = closeBrace;
        continue;
      }
      out = out.slice(0, memberStartOutLen);
      i = body[afterParen] === ";" ? afterParen + 1 : afterParen;
      continue;
    }

    if (body[pos] === ":") {
      pos = skipWsHorizontal(body, readTypeEnd(body, pos + 1));
    }
    i = pos;

    if (isAmbient) {
      if (body[i] === ";") i++;
      out = out.slice(0, memberStartOutLen);
      continue;
    }

    if (body[i] === "=") {
      out += " =";
      i++;
      const initEnd = scanClassFieldInitializerEnd(body, i);
      out += stripClassDeclarations(body.slice(i, initEnd));
      i = initEnd;
    }
  }

  return out;
}

function parseAndStripClass(
  s: string,
  classStart: number,
): { text: string; nextIndex: number } | null {
  let p = skipWs(s, classStart + 5);
  let header = "class";

  const nameWord = readWordAt(s, p);
  if (nameWord && nameWord !== "extends" && nameWord !== "implements") {
    header += ` ${nameWord}`;
    p = skipWs(s, p + nameWord.length);
  }

  if (s[p] === "<") {
    const endAng = skipBalanced(s, p, "<", ">");
    if (s[endAng - 1] !== ">") return null;
    p = skipWs(s, endAng);
  }

  const nextWord = readWordAt(s, p);
  if (nextWord !== "extends" && nextWord !== "implements" && s[p] !== "{") {
    return null;
  }

  if (nextWord === "extends") {
    header += " extends ";
    p = skipWs(s, p + 7);
    let extOut = "";
    while (p < s.length) {
      const ch = s[p];
      if (ch === "<") {
        const endAng = skipBalanced(s, p, "<", ">");
        if (s[endAng - 1] === ">" && looksLikeGenericTypeArgList(s.slice(p + 1, endAng - 1))) {
          p = endAng;
          continue;
        }
      }
      if (ch === "(") {
        const endParen = skipBalanced(s, p, "(", ")");
        extOut += stripClassDeclarations(s.slice(p, endParen));
        p = endParen;
        continue;
      }
      if (ch === "[") {
        const endBracket = skipBalanced(s, p, "[", "]");
        extOut += stripClassDeclarations(s.slice(p, endBracket));
        p = endBracket;
        continue;
      }
      if (ch === "{") break;
      if (readWordAt(s, p) === "implements" && (p === 0 || !isIdentChar(s[p - 1]))) {
        break;
      }
      extOut += s[p++];
    }
    header += extOut.trimEnd();
  }

  p = skipWs(s, p);
  if (readWordAt(s, p) === "implements") {
    p += 10;
    while (p < s.length) {
      const ch = s[p];
      if (ch === "<") {
        p = skipBalanced(s, p, "<", ">");
        continue;
      }
      if (ch === "(") {
        p = skipBalanced(s, p, "(", ")");
        continue;
      }
      if (ch === "[") {
        p = skipBalanced(s, p, "[", "]");
        continue;
      }
      if (ch === "{") break;
      if (ch === ";" || ch === "}") return null;
      p++;
    }
  }

  p = skipWs(s, p);
  if (s[p] !== "{") return null;
  const bodyClose = skipBalanced(s, p, "{", "}");
  if (s[bodyClose - 1] !== "}") return null;

  return {
    text: `${header} {${stripClassBody(s.slice(p + 1, bodyClose - 1))}}`,
    nextIndex: bodyClose,
  };
}

function stripClassDeclarations(s: string): string {
  let out = "";
  let i = 0;

  while (i < s.length) {
    if (
      s.startsWith("class", i) &&
      (i === 0 || !isIdentChar(s[i - 1])) &&
      !isIdentChar(s[i + 5] ?? "")
    ) {
      const trimmed = out.trimEnd();
      if (!trimmed.endsWith(".") && !trimmed.endsWith("#")) {
        const parsed = parseAndStripClass(s, i);
        if (parsed) {
          out += parsed.text;
          i = parsed.nextIndex;
          continue;
        }
      }
    }
    out += s[i++];
  }

  return out;
}

function stripExportKeywords(s: string): string {
  return s.replace(
    /(^|[;\n{}])([ \t]*)export\s+(?:default\s+)?(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm,
    "$1$2",
  );
}

function stripVariableTypeAnnotations(s: string): string {
  let out = "";
  let i = 0;

  while (i < s.length) {
    const declMatch = /^(?:const|let|var)\b/.exec(s.slice(i));
    const prevCh = i > 0 ? s[i - 1] : " ";
    const prevTrim = out.trimEnd();
    const isAsConstFollow =
      readPrevWord(prevTrim) === "as" &&
      !isPropertyAccessWord(prevTrim, "as") &&
      canPrecedeTypeAssertion(prevTrim.slice(0, prevTrim.length - 2));
    if (
      declMatch &&
      !isIdentChar(prevCh) &&
      !prevTrim.endsWith(".") &&
      !isAsConstFollow
    ) {
      const afterKw = skipWs(s, i + declMatch[0].length);
      if (afterKw > i + declMatch[0].length && isBindingStart(s[afterKw] ?? "")) {
        out += s.slice(i, afterKw);
        i = afterKw;

        while (i < s.length) {
          if (s[i] === "{" || s[i] === "[") {
            const closeCh = s[i] === "{" ? "}" : "]";
            const patEnd = skipBalanced(s, i, s[i], closeCh);
            out += stripVariableTypeAnnotations(s.slice(i, patEnd));
            i = patEnd;
          } else if (isIdentStart(s[i] ?? "")) {
            while (i < s.length && isIdentChar(s[i])) out += s[i++];
          } else {
            break;
          }

          // Optional definite assignment `!` before `: Type`
          const beforeAnnot = i;
          let annotStart = skipWsHorizontal(s, i);
          if (s[annotStart] === "!") {
            const afterBang = skipWsHorizontal(s, annotStart + 1);
            if (s[afterBang] === ":") {
              annotStart = afterBang;
            }
          }
          if (s[annotStart] === ":") {
            const typeEnd = readTypeEnd(s, annotStart + 1, true, true);
            i = typeEnd > annotStart + 1 ? typeEnd : beforeAnnot;
          }

          // Optional `= initExpr` (excluding `==`, `=>`)
          const eqPos = skipWsHorizontal(s, i);
          if (s[eqPos] === "=" && s[eqPos + 1] !== "=" && s[eqPos + 1] !== ">") {
            out += s.slice(i, eqPos + 1);
            i = eqPos + 1;
            const initEnd = scanExpressionEnd(s, i, VAR_INIT_STOP_CHARS, true);
            out += stripVariableTypeAnnotations(s.slice(i, initEnd));
            i = initEnd;
          }

          const commaPos = skipWs(s, i);
          if (s[commaPos] === ",") {
            const nextDecl = skipWs(s, commaPos + 1);
            if (isBindingStart(s[nextDecl] ?? "")) {
              out += s.slice(i, nextDecl);
              i = nextDecl;
              continue;
            }
          }
          break;
        }
        continue;
      }
    }

    out += s[i++];
  }

  return out;
}

const NON_METHOD_KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "return",
  "throw",
  "typeof",
  "void",
  "delete",
  "await",
  "yield",
  "new",
  "case",
  "do",
  "in",
  "instanceof",
  "function",
]);

function matchArrowHeader(
  s: string,
  parenStart: number,
): { closeIdx: number; bodyStart: number } | null {
  if (s[parenStart] !== "(") return null;
  const closeIdx = skipBalanced(s, parenStart, "(", ")");
  if (s[closeIdx - 1] !== ")") return null;
  const after = skipWsHorizontal(s, closeIdx);
  if (s.slice(after, after + 2) === "=>") {
    return { closeIdx, bodyStart: after };
  }
  if (s[after] === ":") {
    // Arrow function return types cannot be unparenthesized function types, so leave top-level `=>` to the arrow body
    const afterColon = skipWsHorizontal(s, readTypeEnd(s, after + 1, false));
    if (s.slice(afterColon, afterColon + 2) === "=>") {
      return { closeIdx, bodyStart: afterColon };
    }
  }
  return null;
}

function isGenericArrowPrefixContext(out: string): boolean {
  const trimmed = out.trimEnd();
  if (!trimmed) return true;
  if ("=(,:?[{;>".includes(trimmed[trimmed.length - 1])) return true;
  const prevWord = readPrevWord(trimmed);
  if (!prevWord || isPropertyAccessWord(trimmed, prevWord)) return false;
  return prevWord === "async" || REGEX_PREFIX_KEYWORDS.has(prevWord);
}

function hasTopLevelSemicolon(s: string): boolean {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") paren++;
    else if (ch === ")" && paren > 0) paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]" && bracket > 0) bracket--;
    else if (ch === "{") brace++;
    else if (ch === "}" && brace > 0) brace--;
    else if (ch === ";" && paren === 0 && bracket === 0 && brace === 0) return true;
  }
  return false;
}

function scanGenericArrowPrefixEnd(s: string, ltStart: number): number {
  if (s[ltStart] !== "<") return -1;
  const endAngle = skipBalanced(s, ltStart, "<", ">");
  if (s[endAngle - 1] !== ">") return -1;
  const inner = s.slice(ltStart + 1, endAngle - 1);
  if (!inner.trim() || hasTopLevelSemicolon(inner)) return -1;
  const parenIdx = skipWs(s, endAngle);
  if (s[parenIdx] !== "(") return -1;
  return matchArrowHeader(s, parenIdx) ? endAngle : -1;
}

function isMethodHeaderPrefix(out: string): boolean {
  const trimmed = out.trimEnd();
  if (!trimmed) return false;
  if (trimmed.endsWith("]")) {
    let depth = 0;
    let k = trimmed.length - 1;
    while (k >= 0) {
      if (trimmed[k] === "]") depth++;
      else if (trimmed[k] === "[") {
        depth--;
        if (depth === 0) break;
      }
      k--;
    }
    if (k < 0) return false;
    const beforeBracket = trimmed.slice(0, k).trimEnd();
    if (!beforeBracket) return true;
    const lastCh = beforeBracket[beforeBracket.length - 1];
    if ("{,;}\n*".includes(lastCh)) return true;
    const kw = readPrevWord(beforeBracket);
    return (
      (kw === "static" || kw === "async" || kw === "get" || kw === "set") &&
      !isPropertyAccessWord(beforeBracket, kw)
    );
  }
  const prevWord = readPrevWord(trimmed);
  if (!prevWord || NON_METHOD_KEYWORDS.has(prevWord)) return false;
  const beforeWord = trimmed.slice(0, trimmed.length - prevWord.length).trimEnd();
  return !beforeWord.endsWith(".");
}

function matchMethodHeader(
  s: string,
  parenStart: number,
): { closeIdx: number; bodyStart: number } | null {
  if (s[parenStart] !== "(") return null;
  const closeIdx = skipBalanced(s, parenStart, "(", ")");
  if (s[closeIdx - 1] !== ")") return null;
  const after = skipWsHorizontal(s, closeIdx);
  if (s[after] === "{") {
    return { closeIdx, bodyStart: after };
  }
  if (s[after] === ":") {
    const afterColon = skipWsHorizontal(s, readTypeEnd(s, after + 1));
    if (s[afterColon] === "{") {
      return { closeIdx, bodyStart: afterColon };
    }
  }
  return null;
}

function stripParameterAndReturnTypes(s: string): string {
  // Handle `function foo<T>(...) : RetType {`, generic/typed arrows `<T>(x: T): R =>`, and methods
  let out = "";
  let i = 0;

  while (i < s.length) {
    const fnMatch = /^(?:async\s+)?function\b(?:\s*\*)?/.exec(s.slice(i));
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

    // Generic arrow functions `<T>(a: T): R =>`
    if (s[i] === "<" && isGenericArrowPrefixContext(out)) {
      const endAngle = scanGenericArrowPrefixEnd(s, i);
      if (endAngle > i) {
        const parenIdx = skipWs(s, endAngle);
        const arrow = matchArrowHeader(s, parenIdx);
        if (arrow) {
          out += stripParamList(s.slice(parenIdx, arrow.closeIdx));
          i = arrow.bodyStart;
          continue;
        }
      }
    }

    // Generic object/class methods `add<T>(a: T): R {`
    if (s[i] === "<" && isMethodHeaderPrefix(out)) {
      const endAngle = skipBalanced(s, i, "<", ">");
      if (s[endAngle - 1] === ">") {
        const parenIdx = skipWsHorizontal(s, endAngle);
        const method = matchMethodHeader(s, parenIdx);
        if (method) {
          out += stripParamList(s.slice(parenIdx, method.closeIdx));
          out += " ";
          i = method.bodyStart;
          continue;
        }
      }
    }

    // Arrow functions `(a: T, b: U): R =>` (preserve `expr as/satisfies (x: T) => U` for Pass 6)
    if (s[i] === "(") {
      const prevTrim = out.trimEnd();
      const prevWord = readPrevWord(prevTrim);
      if (prevWord === "catch" && !isPropertyAccessWord(prevTrim, prevWord)) {
        const method = matchMethodHeader(s, i);
        if (method) {
          out += stripParamList(s.slice(i, method.closeIdx));
          out += " ";
          i = method.bodyStart;
          continue;
        }
        const closeIdx = skipBalanced(s, i, "(", ")");
        if (s[closeIdx - 1] === ")" && s[skipWs(s, closeIdx)] === "{") {
          out += stripParamList(s.slice(i, closeIdx));
          i = closeIdx;
          continue;
        }
      }
      const isAssertCast =
        (prevWord === "as" || prevWord === "satisfies") &&
        !isPropertyAccessWord(prevTrim, prevWord) &&
        canPrecedeTypeAssertion(prevTrim.slice(0, prevTrim.length - prevWord.length));
      if (!isAssertCast) {
        const arrow = matchArrowHeader(s, i);
        if (arrow) {
          out += stripParamList(s.slice(i, arrow.closeIdx));
          i = arrow.bodyStart;
          continue;
        }
      }
      if (isMethodHeaderPrefix(out)) {
        const method = matchMethodHeader(s, i);
        if (method) {
          out += stripParamList(s.slice(i, method.closeIdx));
          out += " ";
          i = method.bodyStart;
          continue;
        }
      }
    }

    out += s[i++];
  }

  return out;
}

function stripParamList(parenText: string): string {
  // Recursively remove `: Type` annotations and transform nested callbacks inside parameter defaults
  const inner = parenText.slice(1, -1);
  let out = "";
  let i = 0;
  let isFirstParam = true;

  while (i < inner.length) {
    const beforeWsOutLen = out.length;
    const wsStart = i;
    while (i < inner.length && /\s/.test(inner[i])) out += inner[i++];
    if (i >= inner.length) break;
    if (inner[i] === ",") {
      out += inner[i++];
      isFirstParam = false;
      continue;
    }

    let hasPrefix = false;
    if (inner.startsWith("...", i)) {
      hasPrefix = true;
      out += "...";
      i += 3;
      while (i < inner.length && /\s/.test(inner[i])) out += inner[i++];
    }

    while (i < inner.length) {
      const modMatch = PARAM_MODIFIERS.exec(inner.slice(i));
      if (!modMatch) break;
      const afterMod = skipWs(inner, i + modMatch[0].length);
      if (afterMod > i + modMatch[0].length && isBindingStart(inner[afterMod] ?? "")) {
        hasPrefix = true;
        i = afterMod;
        continue;
      }
      break;
    }

    if (inner[i] === "{" || inner[i] === "[") {
      const openCh = inner[i];
      const closeCh = openCh === "{" ? "}" : "]";
      const patEnd = skipBalanced(inner, i, openCh, closeCh);
      out += stripParameterAndReturnTypes(inner.slice(i, patEnd));
      i = patEnd;
    } else if (isIdentStart(inner[i] ?? "")) {
      const identStart = i;
      while (i < inner.length && isIdentChar(inner[i])) i++;
      const ident = inner.slice(identStart, i);
      const thisColonPos = skipWs(inner, i);
      if (isFirstParam && !hasPrefix && ident === "this" && inner[thisColonPos] === ":") {
        i = readTypeExpressionEnd(inner, thisColonPos + 1, [","], false);
        i = skipWsHorizontal(inner, i);
        if (inner[i] === ",") {
          i++;
          i = skipWsHorizontal(inner, i);
        }
        if (!inner.slice(wsStart, identStart).includes("\n")) {
          out = out.slice(0, beforeWsOutLen);
        }
        isFirstParam = false;
        continue;
      }
      out += ident;
    } else {
      out += inner[i++];
      isFirstParam = false;
      continue;
    }

    isFirstParam = false;

    const afterBinding = skipWs(inner, i);
    if (inner[afterBinding] === "?") {
      i = afterBinding + 1;
    }

    const beforeColon = i;
    const colonPos = skipWs(inner, i);
    let strippedType = false;
    if (inner[colonPos] === ":") {
      i = readTypeExpressionEnd(inner, colonPos + 1, [",", "="], false);
      strippedType = true;
    } else {
      i = beforeColon;
    }

    while (i < inner.length && /\s/.test(inner[i])) out += inner[i++];
    if (inner[i] === "=") {
      if (strippedType && out.length > 0 && !/\s/.test(out[out.length - 1])) {
        out += " ";
      }
      out += "=";
      i++;
      const defEnd = scanExpressionEnd(inner, i, PARAM_DEFAULT_STOP_CHARS, false);
      out += stripParameterAndReturnTypes(inner.slice(i, defEnd));
      i = defEnd;
    }

    while (i < inner.length && /\s/.test(inner[i])) out += inner[i++];
    if (inner[i] === ",") {
      out += ",";
      i++;
    }
  }

  return `(${out})`;
}

function stripGenericsAsAndNonNull(s: string): string {
  let out = "";
  let i = 0;

  while (i < s.length) {
    // 1. Call-site / constructor generic type arguments: `new Map<K, V>(` or `fn<T>(`
    const endAngle = scanGenericArgListEnd(s, i, out[out.length - 1] ?? "");
    if (endAngle > i) {
      let after = endAngle;
      while (after < s.length && (s[after] === " " || s[after] === "\t")) after++;
      if (s[after] === "(") {
        i = endAngle;
        continue;
      }
    }

    // 2. `as const`, `as Type`, or `satisfies Type` assertions
    const assertKw =
      s.startsWith("as", i) && /\s/.test(s[i + 2] ?? "")
        ? "as"
        : s.startsWith("satisfies", i) && /\s/.test(s[i + 9] ?? "")
          ? "satisfies"
          : null;
    if (assertKw && (i === 0 || !isIdentChar(s[i - 1])) && canPrecedeTypeAssertion(out)) {
      const j = skipWs(s, i + assertKw.length);
      if (assertKw === "as" && s.startsWith("const", j) && !isIdentChar(s[j + 5] ?? "")) {
        i = j + 5;
        continue;
      }
      const typeEnd = readTypeEnd(s, j, true, true);
      if (typeEnd > j && s[skipWsHorizontal(s, typeEnd)] !== "{") {
        if (out.endsWith(" ") && (s[typeEnd] === " " || s[typeEnd] === "\t")) {
          out = out.slice(0, -1);
        }
        i = typeEnd;
        continue;
      }
    }

    // 3. Non-null assertions `expr!` without touching `!=`, `!==`, or prefix `!` after keywords (`return!flag`)
    if (s[i] === "!" && s[i + 1] !== "=") {
      const prevC = out[out.length - 1] ?? "";
      const prevWord = readPrevWord(out);
      const isKeywordPrefix =
        REGEX_PREFIX_KEYWORDS.has(prevWord) && !isPropertyAccessWord(out.trimEnd(), prevWord);
      if ((isIdentChar(prevC) || prevC === ")" || prevC === "]") && !isKeywordPrefix) {
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
  transformed = stripClassDeclarations(transformed);
  transformed = stripVariableTypeAnnotations(transformed);
  transformed = stripParameterAndReturnTypes(transformed);
  transformed = stripGenericsAsAndNonNull(transformed);
  return unmaskVerbatim(transformed, tokens);
}
