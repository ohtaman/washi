import { Var } from "./variable.js";
import { LinExpr, dot } from "./expression.js";
import { QuadExpr, type QuadTerm } from "./quad-expr.js";
import { Constraint } from "./constraint.js";
import type { ComparisonSense } from "./types.js";

export type ExprResolver = (name: string) => Var | LinExpr | QuadExpr | undefined;

type ScalarExpr = LinExpr | QuadExpr;
type ContainerLeaf = number | Var | LinExpr | QuadExpr;
type ContainerData =
  | ReadonlyArray<ContainerLeaf | ContainerData>
  | { readonly [key: string]: ContainerLeaf | ContainerData };

interface ContainerNode {
  readonly kind: "container";
  readonly data: ContainerData;
  readonly fromNonArrayIterable: boolean;
}

type EvalNode = ScalarExpr | ContainerNode;

function isContainerNode(node: EvalNode): node is ContainerNode {
  return (node as ContainerNode).kind === "container";
}

interface TemplateContext {
  readonly rawContainerMap: ReadonlyMap<string, unknown>;
  readonly functionMap: ReadonlyMap<string, (item: any, index: number) => unknown>;
}

interface Token {
  type:
    | "NUMBER"
    | "IDENT"
    | "PLUS"
    | "MINUS"
    | "STAR"
    | "SLASH"
    | "CARET"
    | "LPAREN"
    | "RPAREN"
    | "COMMA"
    | "COMP";
  value: string;
  numericValue?: number;
}

const STRICT_NUMBER_LITERAL_RE = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/**
 * Tokenize an algebraic expression string
 */
function tokenize(input: string, numberMap?: ReadonlyMap<string, number>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "+") {
      tokens.push({ type: "PLUS", value: "+" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "MINUS", value: "-" });
      i++;
    } else if (ch === "*") {
      if (i + 1 < len && input[i + 1] === "*") {
        tokens.push({ type: "CARET", value: "**" });
        i += 2;
      } else {
        tokens.push({ type: "STAR", value: "*" });
        i++;
      }
    } else if (ch === "^") {
      tokens.push({ type: "CARET", value: "^" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "SLASH", value: "/" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
    } else if (ch === "<" || ch === ">" || ch === "=") {
      let comp = ch;
      if (i + 1 < len && (input[i + 1] === "=" || input[i + 1] === "<" || input[i + 1] === ">")) {
        comp += input[i + 1];
        i += 2;
      } else {
        i++;
      }
      tokens.push({ type: "COMP", value: comp });
    } else if (/[0-9.]/.test(ch)) {
      const start = i;
      let numStr = "";
      while (i < len && /[0-9]/.test(input[i])) {
        numStr += input[i++];
      }
      if (i < len && input[i] === ".") {
        numStr += input[i++];
        while (i < len && /[0-9]/.test(input[i])) {
          numStr += input[i++];
        }
      }
      if (i < len && (input[i] === "e" || input[i] === "E")) {
        const nextCh = i + 1 < len ? input[i + 1] : "";
        const isIdentStartExceptExp = /[a-zA-Z_]/.test(nextCh);
        if (!isIdentStartExceptExp) {
          numStr += input[i++];
          if (i < len && (input[i] === "+" || input[i] === "-")) {
            numStr += input[i++];
          }
          while (i < len && /[0-9]/.test(input[i])) {
            numStr += input[i++];
          }
          while (
            i < len &&
            (input[i] === "." || input[i] === "e" || input[i] === "E" || /[0-9]/.test(input[i]))
          ) {
            numStr += input[i++];
          }
        }
      } else {
        while (i < len && (input[i] === "." || /[0-9]/.test(input[i]))) {
          numStr += input[i++];
        }
      }
      if (!STRICT_NUMBER_LITERAL_RE.test(numStr)) {
        throw new Error(`Invalid numeric literal '${numStr}' at position ${start} in: "${input}"`);
      }
      const numericValue = Number(numStr);
      if (!Number.isFinite(numericValue)) {
        throw new Error(
          `Numeric literal '${numStr}' overflows finite floating-point range in: "${input}"`
        );
      }
      if (numericValue === 0 && !/^[0.]+(?:[eE][+-]?\d+)?$/.test(numStr)) {
        throw new Error(
          `Numeric literal '${numStr}' underflows to zero at position ${start} in: "${input}"`
        );
      }
      tokens.push({ type: "NUMBER", value: numStr, numericValue });
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      if (numberMap && numberMap.has(ident)) {
        const numericValue = numberMap.get(ident)!;
        tokens.push({ type: "NUMBER", value: String(numericValue), numericValue });
      } else {
        tokens.push({ type: "IDENT", value: ident });
      }
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i} in: "${input}"`);
    }
  }

  return tokens;
}

function normalizeScalarExpr(e: ScalarExpr): ScalarExpr {
  if (e instanceof QuadExpr && e.quadTerms.size === 0) {
    return new LinExpr(e.linearTerms, e.constant);
  }
  return e;
}

function isContainerLeafValue(val: unknown): val is ContainerLeaf {
  return (
    typeof val === "number" ||
    val instanceof Var ||
    val instanceof LinExpr ||
    val instanceof QuadExpr ||
    isTemplateExprOrVar(val)
  );
}

function extractPureNumber(leaf: ContainerLeaf): number | null {
  if (typeof leaf === "number") return leaf;
  if (leaf instanceof LinExpr && leaf.terms.size === 0) return leaf.constant;
  if (leaf instanceof QuadExpr && leaf.quadTerms.size === 0 && leaf.linearTerms.size === 0) {
    return leaf.constant;
  }
  return null;
}

function leafToScalarExpr(leaf: ContainerLeaf): ScalarExpr {
  if (typeof leaf === "number") {
    return new LinExpr(new Map(), leaf);
  }
  if (leaf instanceof Var || ("id" in leaf && !("terms" in leaf) && !("quadTerms" in leaf))) {
    return new LinExpr(new Map([[leaf as Var, 1]]), 0);
  }
  return (leaf as ScalarExpr).clone();
}

function applyLeafBinaryOp(
  a: ContainerLeaf,
  b: ContainerLeaf,
  op: "+" | "-" | "*" | "/"
): ContainerLeaf {
  const numA = extractPureNumber(a);
  const numB = extractPureNumber(b);
  if (numA !== null && numB !== null) {
    if (op === "+") {
      const res = numA + numB;
      if (!Number.isFinite(res)) {
        throw new Error(`Invalid non-finite constant "${res}" in expression.`);
      }
      return res;
    }
    if (op === "-") {
      const res = numA - numB;
      if (!Number.isFinite(res)) {
        throw new Error(`Invalid non-finite constant "${res}" in expression.`);
      }
      return res;
    }
    if (op === "*") {
      const res = numA === 0 || numB === 0 ? 0 : numA * numB;
      if (numA !== 0 && numB !== 0 && res === 0) {
        throw new Error("Constant multiplication underflows to zero.");
      }
      if (!Number.isFinite(res)) {
        throw new Error(`Invalid non-finite constant "${res}" in expression.`);
      }
      return res;
    }
    if (numB === 0) {
      throw new Error("Division by zero");
    }
    const res = numA === 0 ? 0 : numA / numB;
    if (numA !== 0 && res === 0) {
      throw new Error("Constant multiplication underflows to zero.");
    }
    if (!Number.isFinite(res)) {
      throw new Error(`Invalid non-finite constant "${res}" in expression.`);
    }
    return res;
  }

  const exprA = leafToScalarExpr(a);
  const exprB = leafToScalarExpr(b);
  let res: ScalarExpr;
  if (op === "+") res = exprA.add(exprB);
  else if (op === "-") res = exprA.sub(exprB);
  else if (op === "*") res = exprA.mul(exprB);
  else res = exprA.div(exprB);
  const normalized = normalizeScalarExpr(res);
  validateTemplateExprNumericSanity(normalized);
  const pureNum = extractPureNumber(normalized);
  return pureNum !== null ? pureNum : normalized;
}

function mapContainerLeaves(
  data: ContainerData,
  fn: (leaf: ContainerLeaf) => ContainerLeaf
): ContainerData {
  if (Array.isArray(data)) {
    return data.map((item) =>
      isContainerLeafValue(item) ? fn(item) : mapContainerLeaves(item as ContainerData, fn)
    );
  }
  const out: Record<string, ContainerLeaf | ContainerData> = {};
  for (const key of Object.keys(data)) {
    const item = (data as Record<string, ContainerLeaf | ContainerData>)[key];
    out[key] = isContainerLeafValue(item)
      ? fn(item)
      : mapContainerLeaves(item as ContainerData, fn);
  }
  return out;
}

function zipContainerData(
  valA: ContainerLeaf | ContainerData,
  valB: ContainerLeaf | ContainerData,
  op: "+" | "-" | "*" | "/",
  path: string = ""
): ContainerLeaf | ContainerData {
  const isLeafA = isContainerLeafValue(valA);
  const isLeafB = isContainerLeafValue(valB);

  if (isLeafA && isLeafB) {
    return applyLeafBinaryOp(valA, valB, op);
  }
  if (isLeafA || isLeafB) {
    throw new Error(
      `Dimension mismatch in template expression at '${path || "root"}': cannot combine scalar element with sub-container.`
    );
  }

  if (Array.isArray(valA) || Array.isArray(valB)) {
    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) {
        throw new Error(
          `Array length mismatch in template expression at '${path || "root"}': received lengths ${valA.length} and ${valB.length}.`
        );
      }
      return valA.map((_, i) =>
        zipContainerData(valA[i], valB[i], op, path ? `${path}[${i}]` : `[${i}]`)
      );
    }

    const arr = Array.isArray(valA) ? valA : (valB as ReadonlyArray<ContainerLeaf | ContainerData>);
    const other = (Array.isArray(valA) ? valB : valA) as Record<string, ContainerLeaf | ContainerData>;

    const keys = Object.keys(other);
    const allNumeric =
      keys.length === arr.length && keys.every((k) => /^(?:0|[1-9]\d*)$/.test(k));

    if (allNumeric) {
      const missingIndices: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(other, i)) {
          missingIndices.push(i);
        }
      }
      if (missingIndices.length > 0) {
        throw new Error(
          `Key mismatch in template expression at '${path || "root"}': missing indices [${missingIndices.join(", ")}] in numeric record.`
        );
      }
      return arr.map((_, i) => {
        const itemA = Array.isArray(valA) ? valA[i] : (valA as Record<number, ContainerLeaf | ContainerData>)[i];
        const itemB = Array.isArray(valB) ? valB[i] : (valB as Record<number, ContainerLeaf | ContainerData>)[i];
        return zipContainerData(itemA, itemB, op, path ? `${path}[${i}]` : `[${i}]`);
      });
    }

    if (keys.length > 0 && keys.every((k) => /^(?:0|[1-9]\d*)$/.test(k))) {
      throw new Error(
        `Array length mismatch in template expression at '${path || "root"}': array has length ${arr.length}, but object has ${keys.length} indices.`
      );
    }

    throw new Error(
      `Type mismatch in template expression at '${path || "root"}': one operand is an Array while the other is an Object with keys [${keys.slice(0, 5).join(", ")}].`
    );
  }

  const recA = valA as Record<string, ContainerLeaf | ContainerData>;
  const recB = valB as Record<string, ContainerLeaf | ContainerData>;
  const keysA = Object.keys(recA);
  const keysB = Object.keys(recB);

  const missingInB = keysA.filter((k) => !Object.prototype.hasOwnProperty.call(recB, k));
  const missingInA = keysB.filter((k) => !Object.prototype.hasOwnProperty.call(recA, k));

  if (missingInB.length > 0 || missingInA.length > 0) {
    const parts: string[] = [];
    if (missingInB.length > 0) parts.push(`missing in second operand: [${missingInB.join(", ")}]`);
    if (missingInA.length > 0) parts.push(`missing in first operand: [${missingInA.join(", ")}]`);
    throw new Error(
      `Key mismatch in template expression at '${path || "root"}': ${parts.join("; ")}.`
    );
  }

  const out: Record<string, ContainerLeaf | ContainerData> = {};
  for (const key of keysA) {
    out[key] = zipContainerData(recA[key], recB[key], op, path ? `${path}.${key}` : key);
  }
  return out;
}

function combineEvalNodes(a: EvalNode, b: EvalNode, op: "+" | "-" | "*" | "/"): EvalNode {
  const isContA = isContainerNode(a);
  const isContB = isContainerNode(b);

  if (!isContA && !isContB) {
    let res: ScalarExpr;
    if (op === "+") res = a.add(b);
    else if (op === "-") res = a.sub(b);
    else if (op === "*") res = a.mul(b);
    else res = a.div(b);
    return normalizeScalarExpr(res);
  }

  if (isContA && !isContB) {
    return {
      kind: "container",
      data: mapContainerLeaves(a.data, (leaf) => applyLeafBinaryOp(leaf, b, op)),
      fromNonArrayIterable: a.fromNonArrayIterable,
    };
  }

  if (!isContA && isContB) {
    return {
      kind: "container",
      data: mapContainerLeaves(b.data, (leaf) => applyLeafBinaryOp(a, leaf, op)),
      fromNonArrayIterable: b.fromNonArrayIterable,
    };
  }

  const contA = a as ContainerNode;
  const contB = b as ContainerNode;
  return {
    kind: "container",
    data: zipContainerData(contA.data, contB.data, op) as ContainerData,
    fromNonArrayIterable: contA.fromNonArrayIterable || contB.fromNonArrayIterable,
  };
}

function negateEvalNode(node: EvalNode): EvalNode {
  if (!isContainerNode(node)) {
    return node.neg();
  }
  return {
    kind: "container",
    data: mapContainerLeaves(node.data, (leaf) => {
      const num = extractPureNumber(leaf);
      return num !== null ? -num : leafToScalarExpr(leaf).neg();
    }),
    fromNonArrayIterable: node.fromNonArrayIterable,
  };
}

function applyScalarPower(base: ScalarExpr, totalPower: number): ScalarExpr {
  const isQuad = base instanceof QuadExpr;
  const quadTermsCount = isQuad ? base.quadTerms.size : 0;
  const linTermsCount = isQuad ? base.linearTerms.size : base.terms.size;
  const isPureConstant = quadTermsCount === 0 && linTermsCount === 0;

  if (isPureConstant) {
    const val = Math.pow(base.constant, totalPower);
    if (base.constant !== 0 && totalPower > 0 && val === 0) {
      throw new Error("Constant exponentiation underflows to zero.");
    }
    return new LinExpr(new Map(), val);
  }

  if (totalPower === 0) {
    return new LinExpr(new Map(), 1);
  }
  if (totalPower === 1) {
    return base;
  }
  if (totalPower === 2) {
    return base.mul(base);
  }
  throw new Error(
    `Exponent ${totalPower} creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)`
  );
}

function isPlainRecordObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    return false;
  }
  if (isTemplateExprOrVar(val) || isConstraintLike(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function normalizeContainerLeaf(val: unknown): ContainerLeaf {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error(
        `Invalid numeric value "${val}" in template expression: interpolated numbers must be finite.`
      );
    }
    return val;
  }
  if (isConstraintLike(val)) {
    throw new Error(
      `Cannot interpolate a constraint comparison (<=, >=, ==) inside a template expression: expected a finite number, Var, LinExpr, or QuadExpr.`
    );
  }
  if (isTemplateExprOrVar(val)) {
    validateTemplateExprNumericSanity(val);
    if (val instanceof Var || ("id" in val && !("terms" in val) && !("quadTerms" in val))) {
      return val as Var;
    }
    return (val as ScalarExpr).clone();
  }
  throw new Error(
    `Unsupported interpolation value in template expression: expected a finite number, Var, LinExpr, or QuadExpr.`
  );
}

function isIterableContainerCandidate(val: unknown): val is Iterable<unknown> {
  return (
    typeof val === "object" &&
    val !== null &&
    !(val instanceof String) &&
    !(val instanceof Map) &&
    !isTemplateExprOrVar(val) &&
    !isConstraintLike(val) &&
    Symbol.iterator in val &&
    typeof (val as Iterable<unknown>)[Symbol.iterator] === "function"
  );
}

function buildContainerNode(val: unknown, depth: number = 0): ContainerNode {
  if (Array.isArray(val)) {
    let fromNonArrayIterable = false;
    const arr = val.map((item) => {
      if (
        Array.isArray(item) ||
        isPlainRecordObject(item) ||
        isIterableContainerCandidate(item)
      ) {
        if (depth >= 1) {
          throw new Error("Nested containers deeper than 2D are not supported in template expressions.");
        }
        const sub = buildContainerNode(item, depth + 1);
        if (sub.fromNonArrayIterable) fromNonArrayIterable = true;
        return sub.data;
      }
      return normalizeContainerLeaf(item);
    });
    return { kind: "container", data: arr, fromNonArrayIterable };
  }
  if (isIterableContainerCandidate(val)) {
    const items = Array.from(val);
    const arr = items.map((item) => {
      if (
        Array.isArray(item) ||
        isPlainRecordObject(item) ||
        isIterableContainerCandidate(item)
      ) {
        if (depth >= 1) {
          throw new Error("Nested containers deeper than 2D are not supported in template expressions.");
        }
        return buildContainerNode(item, depth + 1).data;
      }
      return normalizeContainerLeaf(item);
    });
    return { kind: "container", data: arr, fromNonArrayIterable: true };
  }
  if (isPlainRecordObject(val)) {
    if (Object.getOwnPropertySymbols(val).length > 0) {
      throw new Error("Symbol keys are not supported in template expression at 'root'.");
    }
    let fromNonArrayIterable = false;
    const out: Record<string, ContainerLeaf | ContainerData> = {};
    for (const key of Object.keys(val)) {
      const item = val[key];
      if (
        Array.isArray(item) ||
        isPlainRecordObject(item) ||
        isIterableContainerCandidate(item)
      ) {
        if (depth >= 1) {
          throw new Error("Nested containers deeper than 2D are not supported in template expressions.");
        }
        const sub = buildContainerNode(item, depth + 1);
        if (sub.fromNonArrayIterable) fromNonArrayIterable = true;
        out[key] = sub.data;
      } else {
        out[key] = normalizeContainerLeaf(item);
      }
    }
    return { kind: "container", data: out, fromNonArrayIterable };
  }
  throw new Error(
    "Unsupported interpolation value in template expression: expected a finite number, Var, LinExpr, or QuadExpr."
  );
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private resolver: ExprResolver;
  private templateCtx?: TemplateContext;

  constructor(tokens: Token[], resolver: ExprResolver, templateCtx?: TemplateContext) {
    this.tokens = tokens;
    this.resolver = resolver;
    this.templateCtx = templateCtx;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expected?: string): Token {
    const t = this.tokens[this.pos++];
    if (!t) {
      throw new Error("Unexpected end of input");
    }
    if (expected && t.value !== expected && t.type !== expected) {
      throw new Error(`Expected '${expected}', but found '${t.value}'`);
    }
    return t;
  }

  /**
   * Parse top-level expression and require it to resolve to a scalar LinExpr or QuadExpr
   */
  public parseExpression(): LinExpr | QuadExpr {
    const node = this.parseExpressionNode();
    if (isContainerNode(node)) {
      throw new Error(
        "Container expression (Array or Record) cannot be used directly as a scalar expression or constraint; wrap it in sum(...) or use dot(a, b)."
      );
    }
    return normalizeScalarExpr(node);
  }

  /**
   * Parse addition and subtraction: term (( '+' | '-' ) term)*
   */
  private parseExpressionNode(): EvalNode {
    let result = this.parseTermNode();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "PLUS") {
        this.consume();
        result = combineEvalNodes(result, this.parseTermNode(), "+");
      } else if (next.type === "MINUS") {
        this.consume();
        result = combineEvalNodes(result, this.parseTermNode(), "-");
      } else {
        break;
      }
    }

    return isContainerNode(result) ? result : normalizeScalarExpr(result);
  }

  /**
   * Parse multiplication and division: factor (( '*' | '/' ) factor)*
   */
  private parseTermNode(): EvalNode {
    let result = this.parseFactorNode();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "STAR") {
        this.consume();
        result = combineEvalNodes(result, this.parseFactorNode(), "*");
      } else if (next.type === "SLASH") {
        this.consume();
        result = combineEvalNodes(result, this.parseFactorNode(), "/");
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Parse unary +/-, numbers, variables, function calls (sum, dot), and parenthesized expressions
   */
  private parseFactorNode(): EvalNode {
    const t = this.peek();
    if (!t) {
      throw new Error("Unexpected end of expression");
    }

    if (t.type === "PLUS") {
      this.consume();
      return this.parseFactorNode();
    }

    if (t.type === "MINUS") {
      this.consume();
      return negateEvalNode(this.parseFactorNode());
    }

    let primary: EvalNode;

    if (t.type === "NUMBER") {
      this.consume();
      const val = t.numericValue ?? Number(t.value);
      // Check for implicit multiplication: e.g. "30x", "2x^2", "2(x+1)^2", "2sum(x)"
      if (this.peek()?.type === "IDENT" || this.peek()?.type === "LPAREN") {
        const subNode = this.parsePrimaryNode();
        // Exponentiation binds tighter than implicit scalar multiplication!
        // e.g. 2x^2 is 2 * (x^2), not (2x)^2.
        const powered = this.applyPowerNode(subNode);
        return combineEvalNodes(powered, new LinExpr(new Map(), val), "*");
      }
      primary = new LinExpr(new Map(), val);
    } else if (t.type === "IDENT" || t.type === "LPAREN") {
      primary = this.parsePrimaryNode();
    } else {
      throw new Error(`Unexpected token '${t.value}' in expression`);
    }

    return this.applyPowerNode(primary);
  }

  private parsePrimaryNode(): EvalNode {
    const t = this.peek();
    if (t?.type === "IDENT") {
      const identToken = this.consume();
      if (
        (identToken.value === "sum" || identToken.value === "dot") &&
        this.peek()?.type === "LPAREN"
      ) {
        return this.parseFunctionCall(identToken.value);
      }
      return this.resolveNode(identToken.value);
    }
    this.consume("LPAREN");
    const inner = this.parseExpressionNode();
    this.consume("RPAREN");
    return inner;
  }

  private parseFunctionCall(funcName: "sum" | "dot"): ScalarExpr {
    this.consume("LPAREN");

    let parenDepth = 1;
    for (let i = this.pos; i < this.tokens.length && parenDepth > 0; i++) {
      const tok = this.tokens[i];
      if (tok.type === "LPAREN") {
        parenDepth++;
      } else if (tok.type === "RPAREN") {
        parenDepth--;
      } else if (tok.type === "COMP") {
        if (funcName === "sum") {
          throw new Error(
            "Cannot sum a constraint comparison (<=, >=, ==) in sum(): expected a number, Var, LinExpr, or QuadExpr."
          );
        }
        throw new Error(
          "Cannot use a constraint comparison (<=, >=, ==) in dot(): expected 1D or 2D Array or Record containers."
        );
      }
    }

    if (this.peek()?.type === "RPAREN") {
      this.consume("RPAREN");
      if (funcName === "sum") {
        throw new Error("sum() in template expression requires at least 1 argument.");
      }
      throw new Error("dot() in template expression requires exactly 2 arguments: dot(a, b).");
    }

    if (funcName === "sum") {
      // Check for 1-argument raw container form: sum(${items})
      if (
        this.tokens[this.pos]?.type === "IDENT" &&
        this.templateCtx?.rawContainerMap.has(this.tokens[this.pos].value) &&
        this.tokens[this.pos + 1]?.type === "RPAREN"
      ) {
        const rawToken = this.consume();
        this.consume("RPAREN");
        const rawContainer = this.templateCtx.rawContainerMap.get(rawToken.value)!;
        return this.accumulateSumItems((addItem) => {
          addItem(rawContainer, 0);
        });
      }

      // Check for 2-argument mapper form: sum(${items}, ${mapFn}) or sum((${items}), ${mapFn})
      let scanPos = this.pos;
      let openParens = 0;
      while (this.tokens[scanPos]?.type === "LPAREN") {
        openParens++;
        scanPos++;
      }
      if (
        this.tokens[scanPos]?.type === "IDENT" &&
        this.templateCtx?.rawContainerMap.has(this.tokens[scanPos].value)
      ) {
        const rawIdent = this.tokens[scanPos].value;
        let closePos = scanPos + 1;
        let closeParens = 0;
        while (closeParens < openParens && this.tokens[closePos]?.type === "RPAREN") {
          closeParens++;
          closePos++;
        }
        if (closeParens === openParens && this.tokens[closePos]?.type === "COMMA") {
          this.pos = closePos + 1;
          const fnToken = this.peek();
          if (
            !fnToken ||
            fnToken.type !== "IDENT" ||
            !this.templateCtx.functionMap.has(fnToken.value)
          ) {
            throw new Error(
              "Second argument to sum() must be a mapping function: sum(itemsOrCount, mapFn)."
            );
          }
          this.consume();
          if (this.peek()?.type === "COMMA") {
            throw new Error(
              "sum() in template expression accepts at most 2 arguments: sum(container) or sum(itemsOrCount, mapFn)."
            );
          }
          this.consume("RPAREN");
          return this.evalSumWithMapper(
            this.templateCtx.rawContainerMap.get(rawIdent)!,
            this.templateCtx.functionMap.get(fnToken.value)!
          );
        }
      }

      const firstArg = this.parseExpressionNode();
      if (this.peek()?.type === "COMMA") {
        this.consume("COMMA");
        const fnToken = this.peek();
        if (!fnToken || fnToken.type !== "IDENT" || !this.templateCtx?.functionMap.has(fnToken.value)) {
          throw new Error(
            "Second argument to sum() must be a mapping function: sum(itemsOrCount, mapFn)."
          );
        }
        this.consume();
        if (this.peek()?.type === "COMMA") {
          throw new Error(
            "sum() in template expression accepts at most 2 arguments: sum(container) or sum(itemsOrCount, mapFn)."
          );
        }
        this.consume("RPAREN");
        const mapFn = this.templateCtx.functionMap.get(fnToken.value)!;
        if (!isContainerNode(firstArg) && firstArg instanceof LinExpr && firstArg.terms.size === 0) {
          return this.evalSumWithMapper(firstArg.constant, mapFn);
        }
        if (isContainerNode(firstArg)) {
          return this.evalSumWithMapper(firstArg.data, mapFn);
        }
        throw new Error(
          "Invalid first argument in sum(itemsOrCount, mapFn): expected an Iterable, Record, or non-negative integer count."
        );
      }

      this.consume("RPAREN");
      return this.evalSumSingle(firstArg);
    }

    // dot(a, b)
    const firstArg = this.parseExpressionNode();
    if (this.peek()?.type !== "COMMA") {
      throw new Error("dot() in template expression requires exactly 2 arguments: dot(a, b).");
    }
    this.consume("COMMA");
    const secondArg = this.parseExpressionNode();
    if (this.peek()?.type === "COMMA") {
      throw new Error("dot() in template expression requires exactly 2 arguments: dot(a, b).");
    }
    this.consume("RPAREN");
    return this.evalDot(firstArg, secondArg);
  }

  private accumulateSumItems(
    visit: (addItem: (item: unknown, depth?: number) => void) => void
  ): ScalarExpr {
    const linearTerms = new Map<Var, number>();
    const quadTerms = new Map<string, QuadTerm>();
    let constant = 0;

    const addItem = (val: unknown, depth: number = 0): void => {
      if (val === null || val === undefined) return;
      if (typeof val === "number") {
        if (!Number.isFinite(val)) {
          throw new Error(`Invalid non-finite number "${val}" in sum().`);
        }
        const nextConst = constant + val;
        if (!Number.isFinite(nextConst)) {
          throw new Error("Constant accumulation overflows finite floating-point range in sum().");
        }
        constant = nextConst;
        return;
      }
      if (isConstraintLike(val)) {
        throw new Error(
          "Cannot sum a constraint comparison (<=, >=, ==) in sum(): expected a number, Var, LinExpr, or QuadExpr."
        );
      }
      if (
        val instanceof QuadExpr ||
        (typeof val === "object" &&
          val !== null &&
          "quadTerms" in val &&
          (val as { quadTerms: unknown }).quadTerms instanceof Map &&
          "linearTerms" in val &&
          (val as { linearTerms: unknown }).linearTerms instanceof Map)
      ) {
        const q = val as QuadExpr;
        validateTemplateExprNumericSanity(q);
        const nextConst = constant + q.constant;
        if (!Number.isFinite(nextConst)) {
          throw new Error("Constant accumulation overflows finite floating-point range in sum().");
        }
        constant = nextConst;
        for (const [v, c] of q.linearTerms) {
          const next = (linearTerms.get(v) ?? 0) + c;
          if (!Number.isFinite(next)) {
            throw new Error(
              "Coefficient accumulation overflows finite floating-point range in sum()."
            );
          }
          linearTerms.set(v, next);
        }
        for (const [k, term] of q.quadTerms) {
          const existing = quadTerms.get(k);
          if (existing) {
            const next = existing.coeff + term.coeff;
            if (!Number.isFinite(next)) {
              throw new Error(
                "Quadratic coefficient accumulation overflows finite floating-point range in sum()."
              );
            }
            quadTerms.set(k, { var1: term.var1, var2: term.var2, coeff: next });
          } else {
            quadTerms.set(k, { var1: term.var1, var2: term.var2, coeff: term.coeff });
          }
        }
        return;
      }
      if (
        val instanceof LinExpr ||
        (typeof val === "object" &&
          val !== null &&
          "terms" in val &&
          (val as { terms: unknown }).terms instanceof Map &&
          typeof (val as { constant?: unknown }).constant === "number")
      ) {
        const l = val as LinExpr;
        validateTemplateExprNumericSanity(l);
        const nextConst = constant + l.constant;
        if (!Number.isFinite(nextConst)) {
          throw new Error("Constant accumulation overflows finite floating-point range in sum().");
        }
        constant = nextConst;
        for (const [v, c] of l.terms) {
          const next = (linearTerms.get(v) ?? 0) + c;
          if (!Number.isFinite(next)) {
            throw new Error(
              "Coefficient accumulation overflows finite floating-point range in sum()."
            );
          }
          linearTerms.set(v, next);
        }
        return;
      }
      if (isTemplateExprOrVar(val)) {
        const v = val as Var;
        const next = (linearTerms.get(v) ?? 0) + 1;
        if (!Number.isFinite(next)) {
          throw new Error(
            "Coefficient accumulation overflows finite floating-point range in sum()."
          );
        }
        linearTerms.set(v, next);
        return;
      }
      if (Array.isArray(val)) {
        if (depth >= 2) {
          throw new Error("Nested containers deeper than 2D are not supported in sum().");
        }
        for (const sub of val) {
          addItem(sub, depth + 1);
        }
        return;
      }
      if (isIterableContainerCandidate(val)) {
        if (depth >= 2) {
          throw new Error("Nested containers deeper than 2D are not supported in sum().");
        }
        for (const sub of val) {
          addItem(sub, depth + 1);
        }
        return;
      }
      if (isPlainRecordObject(val)) {
        if (depth >= 2) {
          throw new Error("Nested containers deeper than 2D are not supported in sum().");
        }
        if (Object.getOwnPropertySymbols(val).length > 0) {
          throw new Error("Symbol keys are not supported in sum().");
        }
        for (const key of Object.keys(val)) {
          addItem(val[key], depth + 1);
        }
        return;
      }
      throw new Error("Unsupported item in sum(): expected a number, Var, LinExpr, or QuadExpr.");
    };

    visit(addItem);

    for (const [v, c] of linearTerms) {
      if (c === 0) {
        linearTerms.delete(v);
      }
    }
    for (const [k, term] of quadTerms) {
      if (term.coeff === 0) {
        quadTerms.delete(k);
      }
    }

    if (quadTerms.size > 0) {
      return new QuadExpr(linearTerms, quadTerms, constant);
    }
    return new LinExpr(linearTerms, constant);
  }

  private evalSumSingle(arg: EvalNode): ScalarExpr {
    if (!isContainerNode(arg)) {
      throw new Error(
        "sum() requires a container (Array, Iterable, or Record) or (itemsOrCount, mapFn)."
      );
    }
    return this.accumulateSumItems((addItem) => {
      addItem(arg.data, 0);
    });
  }

  private evalSumWithMapper(
    itemsOrCount: unknown,
    mapFn: (item: any, index: number) => unknown
  ): ScalarExpr {
    return this.accumulateSumItems((addItem) => {
      if (typeof itemsOrCount === "number") {
        if (!Number.isInteger(itemsOrCount) || itemsOrCount < 0) {
          throw new Error("sum(count, mapFn) requires a non-negative integer count.");
        }
        for (let i = 0; i < itemsOrCount; i++) {
          addItem(mapFn(i, i));
        }
        return;
      }
      if (
        typeof itemsOrCount === "object" &&
        itemsOrCount !== null &&
        !(itemsOrCount instanceof String) &&
        !(itemsOrCount instanceof Map) &&
        Symbol.iterator in itemsOrCount &&
        typeof (itemsOrCount as Iterable<unknown>)[Symbol.iterator] === "function"
      ) {
        let index = 0;
        for (const item of itemsOrCount as Iterable<unknown>) {
          addItem(mapFn(item, index++));
        }
        return;
      }
      if (isPlainRecordObject(itemsOrCount)) {
        if (Object.getOwnPropertySymbols(itemsOrCount).length > 0) {
          throw new Error("Symbol keys are not supported in sum().");
        }
        let index = 0;
        for (const key of Object.keys(itemsOrCount)) {
          addItem(mapFn(itemsOrCount[key], index++));
        }
        return;
      }
      throw new Error(
        "Invalid first argument in sum(itemsOrCount, mapFn): expected an Iterable, Record, or non-negative integer count."
      );
    });
  }

  private evalDot(argA: EvalNode, argB: EvalNode): LinExpr {
    if (!isContainerNode(argA) || !isContainerNode(argB)) {
      throw new Error(
        "dot() in template expression requires 1D or 2D Array or Record containers as arguments."
      );
    }
    if (argA.fromNonArrayIterable || argB.fromNonArrayIterable) {
      throw new Error(
        "Unsupported operand types in dot() at 'root': dot() requires Array or Record containers (use sum() for general Iterables)."
      );
    }
    const res = dot(argA.data as any, argB.data as any);
    validateTemplateExprNumericSanity(res);
    return res;
  }

  private applyPowerNode(base: EvalNode): EvalNode {
    if (this.peek()?.type !== "CARET") {
      return base;
    }

    const exponents: number[] = [];
    while (this.peek()?.type === "CARET") {
      this.consume();
      const isParenthesizedNumber =
        this.tokens[this.pos]?.type === "LPAREN" &&
        this.tokens[this.pos + 1]?.type === "NUMBER" &&
        this.tokens[this.pos + 2]?.type === "RPAREN";
      if (isParenthesizedNumber) {
        this.consume("LPAREN");
      }
      const expToken = this.peek();
      if (!expToken || expToken.type !== "NUMBER") {
        throw new Error("Exponent must be a non-negative integer number");
      }
      this.consume();
      if (isParenthesizedNumber) {
        this.consume("RPAREN");
      }
      const power = expToken.numericValue ?? Number(expToken.value);
      if (!Number.isInteger(power) || power < 0) {
        throw new Error("Exponent must be a non-negative integer");
      }
      exponents.push(power);
    }

    // Right-associative exponentiation: a ^ b ^ c ... => a ^ (b ^ c)
    let totalPower = exponents[exponents.length - 1];
    for (let i = exponents.length - 2; i >= 0; i--) {
      totalPower = Math.pow(exponents[i], totalPower);
    }

    if (!Number.isFinite(totalPower) || totalPower < 0) {
      throw new Error("Exponent creates an invalid or out-of-range power");
    }

    if (!isContainerNode(base)) {
      return applyScalarPower(base, totalPower);
    }

    return {
      kind: "container",
      data: mapContainerLeaves(base.data, (leaf) => {
        const num = extractPureNumber(leaf);
        if (num !== null) {
          const val = Math.pow(num, totalPower);
          if (num !== 0 && totalPower > 0 && val === 0) {
            throw new Error("Constant exponentiation underflows to zero.");
          }
          if (!Number.isFinite(val)) {
            throw new Error("Constant exponentiation overflows finite floating-point range.");
          }
          return val;
        }
        const powered = normalizeScalarExpr(applyScalarPower(leafToScalarExpr(leaf), totalPower));
        validateTemplateExprNumericSanity(powered);
        const poweredNum = extractPureNumber(powered);
        return poweredNum !== null ? poweredNum : powered;
      }),
      fromNonArrayIterable: base.fromNonArrayIterable,
    };
  }

  getRemainingToken(): Token | undefined {
    return this.peek();
  }

  private resolveNode(name: string): EvalNode {
    if (this.templateCtx?.functionMap.has(name)) {
      throw new Error(
        "Function interpolation is only supported as the second argument of sum(itemsOrCount, mapFn) in template expressions."
      );
    }
    if (this.templateCtx?.rawContainerMap.has(name)) {
      return buildContainerNode(this.templateCtx.rawContainerMap.get(name));
    }
    const v = this.resolver(name);
    if (!v) {
      throw new Error(`Unknown variable '${name}' in expression`);
    }
    if (v instanceof Var || ("id" in v && !("terms" in v) && !("quadTerms" in v))) {
      return new LinExpr(new Map([[v as Var, 1]]), 0);
    }
    return (v as LinExpr | QuadExpr).clone();
  }
}

function parseExprInternal(
  text: string,
  resolver: ExprResolver,
  numberMap?: ReadonlyMap<string, number>,
  templateCtx?: TemplateContext
): LinExpr | QuadExpr {
  const tokens = tokenize(text, numberMap);
  const parser = new Parser(tokens, resolver, templateCtx);
  const expr = parser.parseExpression();
  const remaining = parser.getRemainingToken();
  if (remaining) {
    throw new Error(`Unexpected token '${remaining.value}' after expression in "${text}"`);
  }
  validateTemplateExprNumericSanity(expr);
  return expr;
}

/**
 * Parse a mathematical expression string into a LinExpr or QuadExpr
 */
export function parseExpr(text: string, resolver: ExprResolver): LinExpr | QuadExpr {
  return parseExprInternal(text, resolver);
}

function findTopLevelComparison(text: string): { rawOp: string; index: number } | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      if (depth > 0) depth--;
    } else if (depth === 0) {
      const twoChar = text.slice(i, i + 2);
      if (
        twoChar === "<=" ||
        twoChar === ">=" ||
        twoChar === "==" ||
        twoChar === "=<" ||
        twoChar === "=>"
      ) {
        return { rawOp: twoChar, index: i };
      }
      if (ch === "=") {
        return { rawOp: "=", index: i };
      }
    }
  }
  return null;
}

function parseConstraintInternal(
  text: string,
  resolver: ExprResolver,
  name?: string,
  numberMap?: ReadonlyMap<string, number>,
  templateCtx?: TemplateContext
): Constraint {
  const compMatch = findTopLevelComparison(text);
  if (!compMatch) {
    throw new Error(`Constraint must contain a comparison operator (<=, >=, ==, =): "${text}"`);
  }

  const rawOp = compMatch.rawOp;
  const idx = compMatch.index;
  const leftStr = text.substring(0, idx).trim();
  const rightStr = text.substring(idx + rawOp.length).trim();

  let sense: ComparisonSense;
  if (rawOp === "<=" || rawOp === "=<") sense = "<=";
  else if (rawOp === ">=" || rawOp === "=>") sense = ">=";
  else if (rawOp === "==" || rawOp === "=") sense = "==";
  else throw new Error(`Unsupported operator "${rawOp}"`);

  const lhsExpr = parseExprInternal(leftStr, resolver, numberMap, templateCtx);
  const rhsExpr = parseExprInternal(rightStr, resolver, numberMap, templateCtx);

  if (
    (lhsExpr instanceof QuadExpr && lhsExpr.quadTerms.size > 0) ||
    (rhsExpr instanceof QuadExpr && rhsExpr.quadTerms.size > 0)
  ) {
    throw new Error("Quadratic constraints are not supported (only linear constraints are allowed in MILP/LP/QP)");
  }

  const lhsLin = lhsExpr instanceof QuadExpr ? new LinExpr(lhsExpr.linearTerms, lhsExpr.constant) : lhsExpr;
  const rhsLin = rhsExpr instanceof QuadExpr ? new LinExpr(rhsExpr.linearTerms, rhsExpr.constant) : rhsExpr;

  // Normalization: lhs - rhs terms <= rhs_constant - lhs_constant
  let constr: Constraint;
  if (sense === "<=") {
    constr = lhsLin.le(rhsLin, name);
  } else if (sense === ">=") {
    constr = lhsLin.ge(rhsLin, name);
  } else {
    constr = lhsLin.eq(rhsLin, name);
  }
  validateTemplateExprNumericSanity(constr.lhs);
  if (!Number.isFinite(constr.rhs)) {
    throw new Error(`Invalid non-finite right-hand side "${constr.rhs}" in constraint.`);
  }
  return constr;
}

/**
 * Parse a constraint string such as "chairs + 2 * tables <= 40"
 */
export function parseConstraint(text: string, resolver: ExprResolver, name?: string): Constraint {
  return parseConstraintInternal(text, resolver, name);
}

function isTemplateExprOrVar(val: unknown): val is Var | LinExpr | QuadExpr {
  if (val instanceof Var || val instanceof LinExpr || val instanceof QuadExpr) {
    return true;
  }
  if (typeof val !== "object" || val === null || isConstraintLike(val)) {
    return false;
  }
  if (
    "terms" in val &&
    (val as { terms: unknown }).terms instanceof Map &&
    typeof (val as { constant?: unknown }).constant === "number"
  ) {
    return true;
  }
  if (
    "quadTerms" in val &&
    (val as { quadTerms: unknown }).quadTerms instanceof Map &&
    "linearTerms" in val &&
    (val as { linearTerms: unknown }).linearTerms instanceof Map &&
    typeof (val as { constant?: unknown }).constant === "number"
  ) {
    return true;
  }
  return (
    typeof (val as { id?: unknown }).id === "number" &&
    typeof (val as { name?: unknown }).name === "string" &&
    typeof (val as { lb?: unknown }).lb === "number" &&
    typeof (val as { ub?: unknown }).ub === "number" &&
    typeof (val as { type?: unknown }).type === "string" &&
    typeof (val as { mul?: unknown }).mul === "function"
  );
}

function validateTemplateExprNumericSanity(val: Var | LinExpr | QuadExpr): void {
  if ("constant" in val && !Number.isFinite(val.constant)) {
    throw new Error(`Invalid non-finite constant "${val.constant}" in expression.`);
  }
  if ("terms" in val && val.terms instanceof Map) {
    for (const [, coeff] of val.terms) {
      if (!Number.isFinite(coeff)) {
        throw new Error(`Invalid non-finite coefficient "${coeff}" in expression.`);
      }
    }
  }
  if ("linearTerms" in val && val.linearTerms instanceof Map) {
    for (const [, coeff] of val.linearTerms) {
      if (!Number.isFinite(coeff)) {
        throw new Error(`Invalid non-finite coefficient "${coeff}" in expression.`);
      }
    }
  }
  if ("quadTerms" in val && val.quadTerms instanceof Map) {
    for (const [, term] of val.quadTerms) {
      if (!Number.isFinite(term.coeff)) {
        throw new Error(`Invalid non-finite quadratic coefficient "${term.coeff}" in expression.`);
      }
    }
  }
}

/**
 * Union type returned by the unified `expr` template tag:
 * - `LinExpr` for linear arithmetic expressions (`expr\`2 * \${x} + 1\``)
 * - `QuadExpr` for quadratic arithmetic expressions (`expr\`\${x}^2 + \${x} * \${y}\``)
 * - `Constraint` for linear relational comparisons (`expr\`2 * \${x} <= 10\``)
 */
export type ParsedExpr = LinExpr | QuadExpr | Constraint;

export type ExprContainerLeaf = Var | ParsedExpr | number;

export type ExprRecordContainer = {
  readonly [key: string]:
    | ExprContainerLeaf
    | Iterable<ExprContainerLeaf>
    | { readonly [subKey: string]: ExprContainerLeaf };
};

type ExprRecordShape<T> = object & {
  readonly [K in keyof T]:
    | ExprContainerLeaf
    | Iterable<ExprContainerLeaf>
    | (object & { readonly [L in keyof T[K]]: ExprContainerLeaf });
};

export type ExprMapperFn = (item: any, index: number) => Var | ParsedExpr | number;

export type ExprInterpolation<T = any> =
  | Var
  | ParsedExpr
  | number
  | ExprMapperFn
  | ReadonlyArray<any>
  | Iterable<ExprContainerLeaf>
  | Iterable<Iterable<ExprContainerLeaf>>
  | ExprRecordContainer
  | ExprRecordShape<T>;

function isConstraintLike(val: unknown): val is Constraint {
  if (val instanceof Constraint) {
    return true;
  }
  if (typeof val !== "object" || val === null) {
    return false;
  }
  if ((val as { kind?: unknown }).kind === "constraint") {
    return true;
  }
  return (
    "sense" in val &&
    ((val as { sense: unknown }).sense === "<=" ||
      (val as { sense: unknown }).sense === ">=" ||
      (val as { sense: unknown }).sense === "==") &&
    "lhs" in val &&
    "rhs" in val &&
    typeof (val as { rhs: unknown }).rhs === "number" &&
    typeof (val as { lhs: unknown }).lhs === "object" &&
    (val as { lhs: unknown }).lhs !== null &&
    "terms" in (val as { lhs: object }).lhs &&
    ((val as { lhs: { terms: unknown } }).lhs).terms instanceof Map
  );
}

/**
 * Parse a template literal with Var / LinExpr / QuadExpr / number / container / mapper values
 */
function parseTemplate(
  strings: TemplateStringsArray,
  values: readonly unknown[]
): {
  fullText: string;
  resolver: ExprResolver;
  numberMap: Map<string, number>;
  templateCtx: TemplateContext;
} {
  const placeholderMap = new Map<string, Var | LinExpr | QuadExpr>();
  const numberMap = new Map<string, number>();
  const rawContainerMap = new Map<string, unknown>();
  const functionMap = new Map<string, (item: any, index: number) => unknown>();
  const rawJoined = strings.join("");
  let tag = "__washi_";
  while (rawJoined.includes(tag)) {
    tag += "_";
  }
  let fullText = "";

  for (let i = 0; i < strings.length; i++) {
    fullText += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (typeof val === "number") {
        if (!Number.isFinite(val)) {
          throw new Error(
            `Invalid numeric value "${val}" in template expression: interpolated numbers must be finite.`
          );
        }
        const numPh = `${tag}num_${i}__`;
        numberMap.set(numPh, val);
        fullText += `(${numPh})`;
      } else if (isConstraintLike(val)) {
        throw new Error(
          `Cannot interpolate a constraint comparison (<=, >=, ==) inside a template expression: expected a finite number, Var, LinExpr, or QuadExpr.`
        );
      } else if (isTemplateExprOrVar(val)) {
        validateTemplateExprNumericSanity(val);
        const ph = `${tag}ph_${i}__`;
        placeholderMap.set(ph, val);
        fullText += ` ${ph} `;
      } else if (typeof val === "function") {
        const fnPh = `${tag}fn_${i}__`;
        functionMap.set(fnPh, val as (item: any, index: number) => unknown);
        fullText += ` ${fnPh} `;
      } else if (
        Array.isArray(val) ||
        isIterableContainerCandidate(val) ||
        isPlainRecordObject(val)
      ) {
        const ph = `${tag}ph_${i}__`;
        rawContainerMap.set(ph, val);
        fullText += ` ${ph} `;
      } else {
        throw new Error(
          `Unsupported interpolation value in template expression: expected a finite number, Var, LinExpr, or QuadExpr.`
        );
      }
    }
  }

  const resolver: ExprResolver = (name) => placeholderMap.get(name);
  return {
    fullText,
    resolver,
    numberMap,
    templateCtx: { rawContainerMap, functionMap },
  };
}

/**
 * Unified tagged template literal for linear/quadratic arithmetic expressions and linear comparison constraints:
 * - Linear expression (`LinExpr`): `` expr`45 * ${chairs} + 80 * ${tables} - 10` ``
 * - Aggregations (`sum`, `dot`) & element-wise container ops: `` expr`dot(${profit}, ${qty}) - 20 * ${lineOpen}` ``, `` expr`sum((${price} - ${cost}) * ${qty}) <= 100` ``
 * - Quadratic expression (`QuadExpr`): `` expr`${x}^2 + 2 * ${x} * ${y} + ${y}^2` ``, `` expr`sum((${x} - ${target})^2)` ``
 * - Linear comparison constraint (`Constraint`): `` expr`${chairs} + 2 * ${tables} <= 40` `` (supports `<=`, `>=`, `==`, and `=`)
 *
 * **Formulation & solver capability notes**:
 * - **Quadratic terms (`^2`, `${x} * ${y}`) are supported in objectives only** (convex QP on QP-capable solvers such as HiGHS; throws on GLPK and Z3).
 * - Using quadratic terms inside a comparison constraint (`<=`, `>=`, `==`) throws an Error (`"Quadratic constraints are not supported"`).
 * - Interpolated containers (`Array` or `Record`) must be reduced to a scalar via `sum(...)` or `dot(..., ...)`.
 * - Interpolating a `Constraint` inside another `expr` template throws an Error.
 * - Constructing an `expr` does not attach it to a `Model` until passed to `m.objective(...)` or `m.constraint(...)`.
 *
 * @example
 * ```ts
 * const m = new Model("TemplateExprExample");
 * const x = m.continuous("x", { lb: 0 });
 * const y = m.continuous("y", { lb: 0 });
 * const qty = m.integer(["desk", "chair"] as const, { lb: 0 });
 * const profit = { desk: 30, chair: 50 };
 *
 * // 1. Linear arithmetic expression (LinExpr) with sum() and dot()
 * const linCost = expr`30 * ${x} + 50 * ${y} + dot(${profit}, ${qty}) - 10`;
 *
 * // 2. Quadratic objective expression (QuadExpr — supported in objectives only)
 * m.objective(minimize(expr`${x}^2 + 2 * ${x} * ${y} + ${y}^2 + ${linCost}`));
 *
 * // 3. Linear comparison constraints (Constraint: <=, >=, ==)
 * m.constraint(expr`${x} + 2 * ${y} <= 40`, "upper_cap");
 * m.constraint(expr`sum(${qty}) >= 4`, "min_total");
 * m.constraint(expr`${x} - ${y} == 0`, "balance");
 * ```
 */
export function expr<const Args extends readonly unknown[] = readonly any[]>(
  strings: TemplateStringsArray,
  ...values: { [I in keyof Args]: ExprInterpolation<Args[I]> }
): ParsedExpr {
  const { fullText, resolver, numberMap, templateCtx } = parseTemplate(strings, values);
  if (findTopLevelComparison(fullText)) {
    return parseConstraintInternal(fullText, resolver, undefined, numberMap, templateCtx);
  }
  return parseExprInternal(fullText, resolver, numberMap, templateCtx);
}


