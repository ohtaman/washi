import { Var } from "./variable.js";
import { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";
import type { ComparisonSense } from "./types.js";

type VarResolver = (name: string) => Var | undefined;

interface Token {
  type: "NUMBER" | "IDENT" | "PLUS" | "MINUS" | "STAR" | "SLASH" | "LPAREN" | "RPAREN" | "COMP";
  value: string;
}

/**
 * Tokenize an algebraic expression string
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "+" ) {
      tokens.push({ type: "PLUS", value: "+" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "MINUS", value: "-" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "STAR", value: "*" });
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
      let numStr = "";
      while (i < len && /[0-9.]/.test(input[i])) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: numStr });
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident });
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i} in: "${input}"`);
    }
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private resolver: VarResolver;

  constructor(tokens: Token[], resolver: VarResolver) {
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
  public parseExpression(): LinExpr {
    let result = this.parseTerm();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "PLUS") {
        this.consume();
        result = result.add(this.parseTerm());
      } else if (next.type === "MINUS") {
        this.consume();
        result = result.sub(this.parseTerm());
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Parse multiplication and division: factor (( '*' | '/' ) factor)*
   */
  private parseTerm(): LinExpr {
    let result = this.parseFactor();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === "STAR") {
        this.consume();
        const factor = this.parseFactor();
        result = this.multiplyExpressions(result, factor);
      } else if (next.type === "SLASH") {
        this.consume();
        const divisor = this.parseFactor();
        if (divisor.terms.size > 0) {
          throw new Error("Cannot divide by variable in linear expression");
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

  private multiplyExpressions(a: LinExpr, b: LinExpr): LinExpr {
    if (a.terms.size > 0 && b.terms.size > 0) {
      throw new Error("Multiplication of two variables creates a non-linear term (not allowed in MILP/LP)");
    }
    if (a.terms.size === 0) {
      return b.mul(a.constant);
    } else {
      return a.mul(b.constant);
    }
  }

  /**
   * Parse unary +/-, numbers, variables, and parenthesized expressions
   */
  private parseFactor(): LinExpr {
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

    if (t.type === "NUMBER") {
      this.consume();
      const val = parseFloat(t.value);
      // Check for implicit multiplication: e.g. "30x"
      if (this.peek()?.type === "IDENT") {
        const identToken = this.consume();
        const v = this.resolveVariable(identToken.value);
        return v.mul(val);
      }
      return new LinExpr(new Map(), val);
    }

    if (t.type === "IDENT") {
      this.consume();
      const v = this.resolveVariable(t.value);
      return new LinExpr(new Map([[v, 1]]), 0);
    }

    if (t.type === "LPAREN") {
      this.consume("LPAREN");
      const expr = this.parseExpression();
      this.consume("RPAREN");
      return expr;
    }

    throw new Error(`Unexpected token '${t.value}' in expression`);
  }

  private resolveVariable(name: string): Var {
    const v = this.resolver(name);
    if (!v) {
      throw new Error(`Unknown variable '${name}' in expression`);
    }
    return v;
  }
}

/**
 * Parse a mathematical expression string into a LinExpr
 */
export function parseExpr(text: string, resolver: VarResolver): LinExpr {
  const tokens = tokenize(text);
  const parser = new Parser(tokens, resolver);
  return parser.parseExpression();
}

/**
 * Parse a constraint string such as "chairs + 2 * tables <= 40"
 */
export function parseConstraint(text: string, resolver: VarResolver, name?: string): Constraint {
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

  const lhsExpr = parseExpr(leftStr, resolver);
  const rhsExpr = parseExpr(rightStr, resolver);

  // Normalization: lhs - rhs terms <= rhs_constant - lhs_constant
  if (sense === "<=") {
    return lhsExpr.le(rhsExpr, name);
  } else if (sense === ">=") {
    return lhsExpr.ge(rhsExpr, name);
  } else {
    return lhsExpr.eq(rhsExpr, name);
  }
}

/**
 * Parse a template literal with Var / LinExpr / number values
 */
function parseTemplate(
  strings: TemplateStringsArray,
  values: (Var | LinExpr | number)[]
): { fullText: string; resolver: VarResolver } {
  const placeholderMap = new Map<string, Var>();
  let fullText = "";

  for (let i = 0; i < strings.length; i++) {
    fullText += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (typeof val === "number") {
        fullText += `(${val})`;
      } else if (val instanceof Var) {
        const ph = `__v_${i}__`;
        placeholderMap.set(ph, val);
        fullText += ph;
      } else if (val instanceof LinExpr) {
        // Expand terms of LinExpr directly
        const ph = `__expr_${i}__`;
        fullText += `(${val.toString()})`;
        for (const [v] of val.terms) {
          placeholderMap.set(v.name, v);
        }
      }
    }
  }

  const resolver: VarResolver = (name) => placeholderMap.get(name);
  return { fullText, resolver };
}

/**
 * Tagged template literal for constraints:
 * c`${chairs} + 2 * ${tables} <= 40`
 * c`3 * ${x} - ${y} >= 5`
 * c`${x} == 2 * ${y} + 4`
 */
export function c(
  strings: TemplateStringsArray,
  ...values: (Var | LinExpr | number)[]
): Constraint {
  const { fullText, resolver } = parseTemplate(strings, values);
  return parseConstraint(fullText, resolver);
}

/**
 * Tagged template literal for linear expressions or inline constraints:
 * expr`45 * ${chairs} + 80 * ${tables}` -> LinExpr
 * expr`${x} + 2 * ${y} <= 40` -> Constraint
 */
export function expr(
  strings: TemplateStringsArray,
  ...values: (Var | LinExpr | number)[]
): LinExpr | Constraint {
  const { fullText, resolver } = parseTemplate(strings, values);
  if (/(<=|>=|==|=<|=>|=)/.test(fullText)) {
    return parseConstraint(fullText, resolver);
  } else {
    return parseExpr(fullText, resolver);
  }
}
