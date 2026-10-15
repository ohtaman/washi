import { Var } from "./variable.js";
import { LinExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";
import { Constraint } from "./constraint.js";
import type { ComparisonSense } from "./types.js";

export type ExprResolver = (name: string) => Var | LinExpr | QuadExpr | undefined;

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
        numStr += input[i++];
        if (i < len && (input[i] === "+" || input[i] === "-")) {
          numStr += input[i++];
        }
        while (i < len && /[0-9]/.test(input[i])) {
          numStr += input[i++];
        }
      }
      while (
        i < len &&
        (input[i] === "." || input[i] === "e" || input[i] === "E" || /[0-9]/.test(input[i]))
      ) {
        numStr += input[i++];
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

function addExpressions(a: LinExpr | QuadExpr, b: LinExpr | QuadExpr): LinExpr | QuadExpr {
  if (a instanceof QuadExpr) {
    return a.add(b);
  }
  if (b instanceof QuadExpr) {
    return b.add(a);
  }
  return a.add(b);
}

function subExpressions(a: LinExpr | QuadExpr, b: LinExpr | QuadExpr): LinExpr | QuadExpr {
  if (a instanceof QuadExpr) {
    return a.sub(b);
  }
  if (b instanceof QuadExpr) {
    return b.neg().add(a);
  }
  return a.sub(b);
}

function multiplyExpressions(a: LinExpr | QuadExpr, b: LinExpr | QuadExpr): LinExpr | QuadExpr {
  const aQuadTerms = a instanceof QuadExpr ? a.quadTerms : new Map();
  const bQuadTerms = b instanceof QuadExpr ? b.quadTerms : new Map();
  const aLinTerms = a instanceof QuadExpr ? a.linearTerms : a.terms;
  const bLinTerms = b instanceof QuadExpr ? b.linearTerms : b.terms;

  if (aQuadTerms.size > 0 && (bQuadTerms.size > 0 || bLinTerms.size > 0)) {
    throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
  }
  if (bQuadTerms.size > 0 && (aQuadTerms.size > 0 || aLinTerms.size > 0)) {
    throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
  }

  // If a is pure scalar
  if (aQuadTerms.size === 0 && aLinTerms.size === 0) {
    return b.mul(a.constant);
  }
  // If b is pure scalar
  if (bQuadTerms.size === 0 && bLinTerms.size === 0) {
    return a.mul(b.constant);
  }

  // Both have at least one linear term, and neither has quadratic terms:
  // degree 1 * degree 1 => degree 2 QuadExpr
  let result = new QuadExpr();
  result.constant = a.constant * b.constant;

  if (Math.abs(b.constant) >= 1e-12) {
    for (const [v, c] of aLinTerms) {
      result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * b.constant);
    }
  }
  if (Math.abs(a.constant) >= 1e-12) {
    for (const [v, c] of bLinTerms) {
      result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * a.constant);
    }
  }

  for (const [v1, c1] of aLinTerms) {
    for (const [v2, c2] of bLinTerms) {
      result = result.add(QuadExpr.fromProduct(v1, v2, c1 * c2));
    }
  }

  return result;
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private resolver: ExprResolver;

  constructor(tokens: Token[], resolver: ExprResolver) {
    this.tokens = tokens;
    this.resolver = resolver;
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
   * Parse addition and subtraction: term (( '+' | '-' ) term)*
   */
  public parseExpression(): LinExpr | QuadExpr {
    let result = this.parseTerm();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "PLUS") {
        this.consume();
        result = addExpressions(result, this.parseTerm());
      } else if (next.type === "MINUS") {
        this.consume();
        result = subExpressions(result, this.parseTerm());
      } else {
        break;
      }
    }

    if (result instanceof QuadExpr && result.quadTerms.size === 0) {
      return new LinExpr(result.linearTerms, result.constant);
    }
    return result;
  }

  /**
   * Parse multiplication and division: factor (( '*' | '/' ) factor)*
   */
  private parseTerm(): LinExpr | QuadExpr {
    let result = this.parseFactor();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "STAR") {
        this.consume();
        const factor = this.parseFactor();
        result = multiplyExpressions(result, factor);
      } else if (next.type === "SLASH") {
        this.consume();
        const divisor = this.parseFactor();
        const divLin = divisor instanceof QuadExpr ? divisor.linearTerms : divisor.terms;
        const divQuad = divisor instanceof QuadExpr ? divisor.quadTerms.size : 0;
        if (divLin.size > 0 || divQuad > 0) {
          throw new Error("Cannot divide by variable in expression");
        }
        if (Math.abs(divisor.constant) < 1e-12) {
          throw new Error("Division by zero in expression");
        }
        result = result.div(divisor.constant);
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Parse unary +/-, numbers, variables, and parenthesized expressions
   */
  private parseFactor(): LinExpr | QuadExpr {
    const t = this.peek();
    if (!t) {
      throw new Error("Unexpected end of expression");
    }

    if (t.type === "PLUS") {
      this.consume();
      return this.parseFactor();
    }

    if (t.type === "MINUS") {
      this.consume();
      return this.parseFactor().neg();
    }

    let primary: LinExpr | QuadExpr;

    if (t.type === "NUMBER") {
      this.consume();
      const val = t.numericValue ?? Number(t.value);
      // Check for implicit multiplication: e.g. "30x", "2x^2", "2(x+1)^2", "2__ph_0__^2"
      if (this.peek()?.type === "IDENT" || this.peek()?.type === "LPAREN") {
        let subExpr: LinExpr | QuadExpr;
        if (this.peek()?.type === "IDENT") {
          const identToken = this.consume();
          const v = this.resolve(identToken.value);
          if (v instanceof Var || ("id" in v && !("terms" in v) && !("quadTerms" in v))) {
            subExpr = new LinExpr(new Map([[(v as Var), 1]]), 0);
          } else {
            subExpr = (v as LinExpr | QuadExpr).clone();
          }
        } else {
          this.consume("LPAREN");
          subExpr = this.parseExpression();
          this.consume("RPAREN");
        }
        // Exponentiation binds tighter than implicit scalar multiplication!
        // e.g. 2x^2 is 2 * (x^2), not (2x)^2.
        const powered = this.applyPower(subExpr);
        return powered.mul(val);
      }
      primary = new LinExpr(new Map(), val);
    } else if (t.type === "IDENT") {
      this.consume();
      const v = this.resolve(t.value);
      if (v instanceof Var || ("id" in v && !("terms" in v) && !("quadTerms" in v))) {
        primary = new LinExpr(new Map([[(v as Var), 1]]), 0);
      } else {
        primary = (v as LinExpr | QuadExpr).clone();
      }
    } else if (t.type === "LPAREN") {
      this.consume("LPAREN");
      primary = this.parseExpression();
      this.consume("RPAREN");
    } else {
      throw new Error(`Unexpected token '${t.value}' in expression`);
    }

    return this.applyPower(primary);
  }

  private applyPower(base: LinExpr | QuadExpr): LinExpr | QuadExpr {
    if (this.peek()?.type !== "CARET") {
      return base;
    }

    const exponents: number[] = [];
    while (this.peek()?.type === "CARET") {
      this.consume();
      const expToken = this.peek();
      if (!expToken || expToken.type !== "NUMBER") {
        throw new Error("Exponent must be a non-negative integer number");
      }
      this.consume();
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

    const isQuad = base instanceof QuadExpr;
    const quadTermsCount = isQuad ? base.quadTerms.size : 0;
    const linTermsCount = isQuad ? base.linearTerms.size : base.terms.size;
    const isPureConstant = quadTermsCount === 0 && linTermsCount === 0;

    if (isPureConstant) {
      const val = Math.pow(base.constant, totalPower);
      return new LinExpr(new Map(), val);
    }

    if (totalPower === 0) {
      return new LinExpr(new Map(), 1);
    }
    if (totalPower === 1) {
      return base;
    }
    if (totalPower === 2) {
      return multiplyExpressions(base, base);
    }
    throw new Error(`Exponent ${totalPower} creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)`);
  }

  getRemainingToken(): Token | undefined {
    return this.peek();
  }

  private resolve(name: string): Var | LinExpr | QuadExpr {
    const v = this.resolver(name);
    if (!v) {
      throw new Error(`Unknown variable '${name}' in expression`);
    }
    return v;
  }
}

function parseExprInternal(
  text: string,
  resolver: ExprResolver,
  numberMap?: ReadonlyMap<string, number>
): LinExpr | QuadExpr {
  const tokens = tokenize(text, numberMap);
  const parser = new Parser(tokens, resolver);
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

function parseConstraintInternal(
  text: string,
  resolver: ExprResolver,
  name?: string,
  numberMap?: ReadonlyMap<string, number>
): Constraint {
  const compMatch = text.match(/(<=|>=|==|=<|=>|=)/);
  if (!compMatch) {
    throw new Error(`Constraint must contain a comparison operator (<=, >=, ==, =): "${text}"`);
  }

  const rawOp = compMatch[0];
  const idx = compMatch.index!;
  const leftStr = text.substring(0, idx).trim();
  const rightStr = text.substring(idx + rawOp.length).trim();

  let sense: ComparisonSense;
  if (rawOp === "<=" || rawOp === "=<") sense = "<=";
  else if (rawOp === ">=" || rawOp === "=>") sense = ">=";
  else if (rawOp === "==" || rawOp === "=") sense = "==";
  else throw new Error(`Unsupported operator "${rawOp}"`);

  const lhsExpr = parseExprInternal(leftStr, resolver, numberMap);
  const rhsExpr = parseExprInternal(rightStr, resolver, numberMap);

  if (
    (lhsExpr instanceof QuadExpr && lhsExpr.quadTerms.size > 0) ||
    (rhsExpr instanceof QuadExpr && rhsExpr.quadTerms.size > 0)
  ) {
    throw new Error("Quadratic constraints are not supported (only linear constraints are allowed in MILP/LP/QP)");
  }

  const lhsLin = lhsExpr instanceof QuadExpr ? new LinExpr(lhsExpr.linearTerms, lhsExpr.constant) : lhsExpr;
  const rhsLin = rhsExpr instanceof QuadExpr ? new LinExpr(rhsExpr.linearTerms, rhsExpr.constant) : rhsExpr;

  // Normalization: lhs - rhs terms <= rhs_constant - lhs_constant
  if (sense === "<=") {
    return lhsLin.le(rhsLin, name);
  } else if (sense === ">=") {
    return lhsLin.ge(rhsLin, name);
  } else {
    return lhsLin.eq(rhsLin, name);
  }
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
  if (typeof val !== "object" || val === null) {
    return false;
  }
  if ("terms" in val && val.terms instanceof Map) {
    return true;
  }
  if ("quadTerms" in val && val.quadTerms instanceof Map) {
    return true;
  }
  return (
    "id" in val &&
    "name" in val &&
    "lb" in val &&
    "ub" in val &&
    "type" in val &&
    typeof (val as Var).mul === "function"
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
 * Parse a template literal with Var / LinExpr / QuadExpr / number values
 */
function parseTemplate(
  strings: TemplateStringsArray,
  values: (Var | LinExpr | QuadExpr | number)[]
): { fullText: string; resolver: ExprResolver; numberMap: Map<string, number> } {
  const placeholderMap = new Map<string, Var | LinExpr | QuadExpr>();
  const numberMap = new Map<string, number>();
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
        const numPh = `__num_${i}__`;
        numberMap.set(numPh, val);
        fullText += ` ${numPh} `;
      } else if (isTemplateExprOrVar(val)) {
        validateTemplateExprNumericSanity(val);
        const ph = `__ph_${i}__`;
        placeholderMap.set(ph, val);
        fullText += ` ${ph} `;
      } else {
        throw new Error(
          `Unsupported interpolation value in template expression: expected a finite number, Var, LinExpr, or QuadExpr.`
        );
      }
    }
  }

  const resolver: ExprResolver = (name) => placeholderMap.get(name);
  return { fullText, resolver, numberMap };
}

/**
 * Tagged template literal for constraints:
 * c`${chairs} + 2 * ${tables} <= 40`
 * c`3 * ${x} - ${y} >= 5`
 * c`${x} == 2 * ${y} + 4`
 */
export function c(
  strings: TemplateStringsArray,
  ...values: (Var | LinExpr | QuadExpr | number)[]
): Constraint {
  const { fullText, resolver, numberMap } = parseTemplate(strings, values);
  return parseConstraintInternal(fullText, resolver, undefined, numberMap);
}

/**
 * Tagged template literal for linear or quadratic expressions:
 * expr`45 * ${chairs} + 80 * ${tables}` -> LinExpr
 * expr`${x} * ${y} + 2 * ${x} * ${x}` -> QuadExpr
 *
 * For relational constraints, use the `c` tagged template instead:
 * c`${x} + 2 * ${y} <= 40` -> Constraint
 */
export function expr(
  strings: TemplateStringsArray,
  ...values: (Var | LinExpr | QuadExpr | number)[]
): LinExpr | QuadExpr {
  const { fullText, resolver, numberMap } = parseTemplate(strings, values);
  if (/(<=|>=|==|=<|=>|=)/.test(fullText)) {
    throw new Error(
      `Relational comparison operators (<=, >=, ==) cannot be used in expr\`...\`. ` +
      `Use the c\`...\` template tag for constraints (e.g. c\`\${x} <= 10\`), or remove the comparison operator for arithmetic expressions.`
    );
  }
  return parseExprInternal(fullText, resolver, numberMap);
}
