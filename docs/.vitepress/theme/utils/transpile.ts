import { parse } from "@babel/parser";

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  abstract?: boolean | null;
  declare?: boolean | null;
  async?: boolean | null;
  computed?: boolean | null;
  optional?: boolean | null;
  definite?: boolean | null;
  global?: boolean | null;
  name?: string;
  id?: AstNode | null;
  key?: AstNode | null;
  body?: AstNode | AstNode[] | null;
  declaration?: AstNode | null;
  expression?: AstNode | null;
  typeAnnotation?: AstNode | null;
  typeParameters?: AstNode | null;
  superTypeParameters?: AstNode | null;
  implements?: AstNode[] | null;
  returnType?: AstNode | null;
  params?: AstNode[];
  [key: string]: unknown;
}

interface LexToken {
  start: number;
  end: number;
  value?: unknown;
  type: { label: string };
}

interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

const TS_MEMBER_MODIFIERS = new Set([
  "public",
  "private",
  "protected",
  "readonly",
  "override",
  "abstract",
]);

const ASI_HAZARD_NEXT_TOKENS = new Set(["(", "[", "`", "regexp", "/", "+/-"]);

function isIdentOrNumChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

function needsSpaceBetween(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (isIdentOrNumChar(left) && isIdentOrNumChar(right)) return true;
  if (left === "+" && right === "+") return true;
  if (left === "-" && right === "-") return true;
  if (left === "/" && (right === "/" || right === "*")) return true;
  if (left === "." && /[0-9.]/.test(right)) return true;
  return false;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

function isLexToken(value: unknown): value is LexToken {
  if (typeof value !== "object" || value === null) return false;
  const tok = value as { start?: unknown; end?: unknown; type?: unknown };
  return (
    typeof tok.start === "number" &&
    typeof tok.end === "number" &&
    typeof tok.type === "object" &&
    tok.type !== null &&
    typeof (tok.type as { label?: unknown }).label === "string"
  );
}

function isTypeOnlyNamespaceBody(body: AstNode | AstNode[] | null | undefined): boolean {
  if (!body || Array.isArray(body)) return false;
  if (body.type === "TSModuleDeclaration") {
    return isTypeOnlyNamespaceBody(body.body);
  }
  if (body.type !== "TSModuleBlock" || !Array.isArray(body.body)) return false;
  return body.body.every((stmt) => isErasedStatement(stmt));
}

function isErasedStatement(node: AstNode | null | undefined): boolean {
  if (!node) return false;
  if (node.declare) return true;
  switch (node.type) {
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSDeclareFunction":
    case "TSImportEqualsDeclaration":
    case "TSExportAssignment":
    case "ImportDeclaration":
    case "ExportAllDeclaration":
      return true;
    case "TSModuleDeclaration":
      return (
        Boolean(node.global) ||
        node.id?.type === "StringLiteral" ||
        isTypeOnlyNamespaceBody(node.body)
      );
    case "ExportNamedDeclaration":
      return !node.declaration || isErasedStatement(node.declaration);
    case "ExportDefaultDeclaration":
      return isErasedStatement(node.declaration);
    default:
      return false;
  }
}

/**
 * Strip TypeScript-specific syntax via `@babel/parser` AST range erasure
 * while preserving JavaScript line structure for clean browser execution.
 */
export function stripTypeScriptToJs(rawCode: string): string {
  const ast = parse(rawCode, {
    sourceType: "module",
    tokens: true,
    allowUndeclaredExports: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    plugins: ["typescript"],
  });

  const rawTokens: unknown[] = Array.isArray(ast.tokens) ? ast.tokens : [];
  const tokens: LexToken[] = rawTokens.filter(isLexToken);
  const edits: SourceEdit[] = [];
  const erasedStatementRanges: Array<{ start: number; end: number }> = [];

  const blank = (start: number, end: number, preserveNewlines = true): void => {
    if (start >= end) return;
    const slice = rawCode.slice(start, end);
    const text = preserveNewlines ? slice.replace(/[^\n]/g, "") : "";
    edits.push({ start, end, text });
  };

  const skipHorizWsAfter = (pos: number): number => {
    let p = pos;
    while (p < rawCode.length && (rawCode[p] === " " || rawCode[p] === "\t")) p++;
    return p;
  };

  const rewindHorizWsBefore = (pos: number, minPos: number): number => {
    let p = pos;
    while (p > minPos && (rawCode[p - 1] === " " || rawCode[p - 1] === "\t")) p--;
    return p;
  };

  const findToken = (
    pred: (t: LexToken) => boolean,
    fromStart: number,
    toEnd: number,
    last = false,
  ): LexToken | null => {
    let found: LexToken | null = null;
    for (const t of tokens) {
      if (t.end <= fromStart) continue;
      if (t.start >= toEnd) break;
      if (t.start >= fromStart && t.end <= toEnd && pred(t)) {
        if (!last) return t;
        found = t;
      }
    }
    return found;
  };

  const firstTokenAtOrAfter = (pos: number): LexToken | null => {
    for (const t of tokens) {
      if (t.start >= pos && t.type.label !== "eof") return t;
    }
    return null;
  };

  const isInsideErasedStmt = (pos: number): boolean =>
    erasedStatementRanges.some((r) => pos >= r.start && pos < r.end);

  const needsAsiLeadingSemi = (start: number, end: number): boolean => {
    const nextTok = firstTokenAtOrAfter(end);
    if (!nextTok || (!ASI_HAZARD_NEXT_TOKENS.has(nextTok.type.label) && nextTok.value !== "<")) {
      return false;
    }

    let prevTok: LexToken | null = null;
    for (let idx = tokens.length - 1; idx >= 0; idx--) {
      const t = tokens[idx];
      if (t.end <= start && !isInsideErasedStmt(t.start)) {
        prevTok = t;
        break;
      }
    }
    if (!prevTok) return false;
    return prevTok.type.label !== ";" && prevTok.type.label !== "{";
  };

  const blankStatement = (start: number, end: number): void => {
    erasedStatementRanges.push({ start, end });
    if (start >= end) return;
    const newlines = rawCode.slice(start, end).replace(/[^\n]/g, "");
    edits.push({
      start,
      end,
      text: needsAsiLeadingSemi(start, end) ? `;${newlines}` : newlines,
    });
  };

  const getKeyOuterRange = (node: AstNode): { start: number; end: number } => {
    const key = node.key;
    const nodeStart = node.start ?? 0;
    const nodeEnd = node.end ?? 0;
    if (!key || typeof key.start !== "number" || typeof key.end !== "number") {
      return { start: nodeStart, end: nodeStart };
    }
    if (!node.computed) return { start: key.start, end: key.end };
    const openBr = findToken((t) => t.type.label === "[", nodeStart, key.start, true);
    const closeBr = findToken((t) => t.type.label === "]", key.end, nodeEnd, false);
    return {
      start: openBr ? openBr.start : key.start,
      end: closeBr ? closeBr.end : key.end,
    };
  };

  const eraseMemberModifiers = (from: number, to: number): void => {
    for (const t of tokens) {
      if (t.end <= from) continue;
      if (t.start >= to) break;
      if (typeof t.value === "string" && TS_MEMBER_MODIFIERS.has(t.value)) {
        blank(t.start, Math.min(to, skipHorizWsAfter(t.end)));
      }
    }
  };

  const visitChildren = (node: AstNode, skipKeys?: Set<string>): void => {
    for (const [k, v] of Object.entries(node)) {
      if (
        skipKeys?.has(k) ||
        k === "type" ||
        k === "start" ||
        k === "end" ||
        k === "loc" ||
        k === "extra"
      ) {
        continue;
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          if (isAstNode(item)) visit(item);
        }
      } else if (isAstNode(v)) {
        visit(v);
      }
    }
  };

  const visitParams = (params: AstNode[] | undefined): void => {
    if (!params || params.length === 0) return;
    let startIdx = 0;
    const first = params[0];
    if (first.type === "Identifier" && first.name === "this" && typeof first.start === "number" && typeof first.end === "number") {
      const nextTok = firstTokenAtOrAfter(first.end);
      const eraseEnd =
        nextTok && nextTok.type.label === "," ? skipHorizWsAfter(nextTok.end) : first.end;
      blank(first.start, eraseEnd);
      startIdx = 1;
    }
    for (let idx = startIdx; idx < params.length; idx++) {
      visit(params[idx]);
    }
  };

  const visit = (node: AstNode | null | undefined): void => {
    if (!node) return;
    const start = typeof node.start === "number" ? node.start : 0;
    const end = typeof node.end === "number" ? node.end : 0;

    if (isErasedStatement(node)) {
      blankStatement(start, end);
      return;
    }

    switch (node.type) {
      case "TSTypeAnnotation":
      case "TSTypeParameterDeclaration":
      case "TSTypeParameterInstantiation":
        blank(start, end);
        return;

      case "TSIndexSignature":
      case "TSDeclareMethod":
        blankStatement(start, end);
        return;

      case "TSEnumDeclaration":
        throw new SyntaxError(
          "TypeScript enum declarations are not supported in strip-only browser mode; use const objects or union types.",
        );

      case "TSModuleDeclaration":
        throw new SyntaxError(
          "Non-ambient TypeScript namespace declarations are not supported in strip-only browser mode.",
        );

      case "TSParameterProperty":
        throw new SyntaxError(
          "TypeScript parameter properties are not supported in strip-only browser mode.",
        );

      case "ExportNamedDeclaration":
        if (node.declaration && typeof node.declaration.start === "number") {
          blank(start, node.declaration.start);
          visit(node.declaration);
        }
        return;

      case "ExportDefaultDeclaration": {
        const decl = node.declaration;
        if (!decl || typeof decl.start !== "number" || typeof decl.end !== "number") return;
        const isNamedDecl =
          (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && Boolean(decl.id);
        if (isNamedDecl) {
          blank(start, decl.start);
        } else {
          const prefix = rawCode.slice(start, decl.start).replace(/[^\n]/g, "");
          edits.push({ start, end: decl.start, text: `${prefix};(` });
          const nextTok = firstTokenAtOrAfter(decl.end);
          const needsEndSemi =
            Boolean(nextTok && (ASI_HAZARD_NEXT_TOKENS.has(nextTok.type.label) || nextTok.value === "<")) &&
            decl.end === end;
          edits.push({ start: decl.end, end: decl.end, text: needsEndSemi ? ");" : ")" });
        }
        visit(decl);
        return;
      }

      case "TSAsExpression":
      case "TSSatisfiesExpression": {
        const expr = node.expression;
        const typeAnn = node.typeAnnotation;
        if (expr && typeof expr.end === "number" && typeAnn && typeof typeAnn.start === "number") {
          const kw = node.type === "TSAsExpression" ? "as" : "satisfies";
          const kwTok = findToken((t) => t.value === kw, expr.end, typeAnn.start, true);
          if (kwTok) blank(rewindHorizWsBefore(kwTok.start, expr.end), end);
          visit(expr);
        }
        return;
      }

      case "TSNonNullExpression": {
        const expr = node.expression;
        if (expr && typeof expr.end === "number") {
          const bang = findToken((t) => t.type.label === "!", expr.end, end, true);
          if (bang) blank(bang.start, bang.end);
          visit(expr);
        }
        return;
      }

      case "TSTypeAssertion": {
        const typeAnn = node.typeAnnotation;
        const typeEnd = typeAnn && typeof typeAnn.end === "number" ? typeAnn.end : start;
        const gtTok = findToken((t) => t.value === ">", typeEnd, end, false);
        const afterGt = gtTok ? gtTok.end : typeEnd;
        const nextTok = firstTokenAtOrAfter(afterGt);
        const eraseEnd = nextTok && nextTok.start <= end ? nextTok.start : afterGt;
        blank(start, eraseEnd, false);
        visit(node.expression);
        return;
      }

      case "TSInstantiationExpression":
        if (node.typeParameters && typeof node.typeParameters.start === "number" && typeof node.typeParameters.end === "number") {
          blank(node.typeParameters.start, node.typeParameters.end);
        }
        visit(node.expression);
        return;

      case "ClassDeclaration":
      case "ClassExpression": {
        const bodyEnd = isAstNode(node.body) && typeof node.body.start === "number" ? node.body.start : end;
        if (node.abstract) {
          const classTok = findToken((t) => t.type.label === "class", start, bodyEnd, false);
          const absTok = findToken(
            (t) => t.value === "abstract",
            start,
            classTok ? classTok.start : bodyEnd,
            false,
          );
          if (absTok) blank(absTok.start, skipHorizWsAfter(absTok.end));
        }
        if (node.implements && node.implements.length > 0) {
          const firstImplStart = node.implements[0].start ?? bodyEnd;
          const lastImplEnd = node.implements[node.implements.length - 1].end ?? bodyEnd;
          const implTok = findToken((t) => t.value === "implements", start, firstImplStart, true);
          if (implTok) blank(rewindHorizWsBefore(implTok.start, start), lastImplEnd);
        }
        visitChildren(node, new Set(["implements"]));
        return;
      }

      case "ClassProperty":
      case "ClassPrivateProperty":
      case "ClassAccessorProperty": {
        if (node.declare || node.abstract) {
          blankStatement(start, end);
          return;
        }
        const keyRange = getKeyOuterRange(node);
        eraseMemberModifiers(start, keyRange.start);
        if (node.optional || node.definite) {
          const valNode = isAstNode(node.value) ? node.value : null;
          const markEnd = node.typeAnnotation?.start ?? valNode?.start ?? end;
          const mark = findToken(
            (t) => t.type.label === "?" || t.type.label === "!",
            keyRange.end,
            markEnd,
            false,
          );
          if (mark) blank(mark.start, mark.end);
        }
        visitChildren(node);
        return;
      }

      case "ClassMethod":
      case "ClassPrivateMethod": {
        if (node.abstract) {
          blankStatement(start, end);
          return;
        }
        const keyRange = getKeyOuterRange(node);
        eraseMemberModifiers(start, keyRange.start);
        if (node.optional) {
          const bodyStart = isAstNode(node.body) && typeof node.body.start === "number" ? node.body.start : end;
          const parenOrTp =
            node.typeParameters?.start ??
            findToken((t) => t.type.label === "(", keyRange.end, bodyStart, false)?.start ??
            bodyStart;
          const q = findToken((t) => t.type.label === "?", keyRange.end, parenOrTp, false);
          if (q) blank(q.start, q.end);
        }
        if (node.typeParameters) visit(node.typeParameters);
        if (node.returnType) visit(node.returnType);
        visit(node.key);
        visitParams(node.params);
        if (isAstNode(node.body)) visit(node.body);
        return;
      }

      case "ArrowFunctionExpression": {
        if (node.typeParameters && typeof node.typeParameters.start === "number" && typeof node.typeParameters.end === "number") {
          blank(node.typeParameters.start, node.typeParameters.end, !node.async);
        }
        if (node.returnType && typeof node.returnType.start === "number" && typeof node.returnType.end === "number") {
          blank(node.returnType.start, node.returnType.end, false);
        }
        visitParams(node.params);
        if (isAstNode(node.body)) visit(node.body);
        return;
      }

      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ObjectMethod":
        if (node.typeParameters) visit(node.typeParameters);
        if (node.returnType) visit(node.returnType);
        if (node.type === "ObjectMethod") visit(node.key);
        visitParams(node.params);
        if (isAstNode(node.body)) visit(node.body);
        return;

      case "VariableDeclarator": {
        const idNode = node.id;
        if (node.definite && idNode && typeof idNode.start === "number" && typeof idNode.end === "number") {
          const bangEnd = idNode.typeAnnotation?.start ?? idNode.end;
          const bang = findToken((t) => t.type.label === "!", idNode.start, bangEnd, true);
          if (bang) blank(bang.start, bang.end);
        }
        visitChildren(node);
        return;
      }

      case "Identifier":
      case "ObjectPattern":
      case "ArrayPattern":
        if (node.optional) {
          const qEnd = node.typeAnnotation?.start ?? end;
          const qStart =
            node.type === "Identifier" && typeof node.name === "string"
              ? start + node.name.length
              : start;
          const q = findToken((t) => t.type.label === "?", qStart, qEnd, true);
          if (q) blank(q.start, q.end);
        }
        visitChildren(node);
        return;

      default:
        visitChildren(node);
    }
  };

  if (isAstNode(ast.program)) {
    visit(ast.program);
  }

  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let result = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    result += rawCode.slice(cursor, edit.start) + edit.text;
    if (edit.text === "" && needsSpaceBetween(result.slice(-1), rawCode[edit.end] ?? "")) {
      result += " ";
    }
    cursor = edit.end;
  }
  result += rawCode.slice(cursor);
  return result;
}

/**
 * Strip TypeScript-specific syntax from documentation code snippets
 * so they can be executed directly in the browser via AsyncFunction.
 */
export function transpileSnippetToJs(rawCode: string): string {
  const stripped = stripTypeScriptToJs(rawCode);
  return stripped.replace(/\n([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/, "\nawait $1();");
}
