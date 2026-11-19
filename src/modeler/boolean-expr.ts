import { Constraint } from "./constraint.js";
import {
  LinExpr,
  toScalarLinExpr,
  collectAndValidateDiscreteExpr,
} from "./expression.js";
import type { QuadExpr } from "./quad-expr.js";
import type { Var } from "./variable.js";

let boolVarIdCounter = 0;

export type LogicalOpType = "and" | "or" | "not" | "implies" | "xor" | "eq";

export type LogicElement = BoolExpr | Constraint;

export type LogicInput = LogicElement | LinExpr | QuadExpr;

function assertLogicElement(el: unknown, op: string): LogicElement {
  if (el instanceof BoolExpr || el instanceof Constraint) {
    return el;
  }
  if (
    typeof el === "object" &&
    el !== null &&
    ("terms" in el || "quadTerms" in el)
  ) {
    throw new Error(
      `Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical operator "${op}". ` +
        `Use a comparison constraint such as expr\`\${x} <= 10\` or a BoolVar/BoolExpr.`
    );
  }
  if (
    typeof el === "object" &&
    el !== null &&
    "id" in el &&
    "name" in el &&
    "lb" in el &&
    "ub" in el &&
    !("sense" in el)
  ) {
    throw new Error(
      `Invalid operand passed to logical operator "${op}": expected a BoolVar, BoolExpr, or Constraint, but received numeric variable "${(el as { name: string }).name}". ` +
        `Use m.bool() for propositional variables, add a comparison such as expr\`\${x} == 1\`, or use m.indicator(binVar, constraint) for 0-1 Big-M indicator constraints.`
    );
  }
  throw new Error(
    `Invalid operand passed to logical operator "${op}": expected a BoolVar, BoolExpr, or Constraint.`
  );
}

/**
 * Base abstract class for propositional / SMT Boolean expressions (`BoolVar` and `BoolOp`).
 *
 * **Solver capability note**: Logical constraints are solved natively by Pumpkin (`{ solver: "pumpkin" }`,
 * bounded integer/boolean models) and Z3 (`{ solver: "z3" }`), and automatically linearized into 0-1 MIP
 * constraints on HiGHS and GLPK. Comparison `Constraint`s in negated positions (`implies` antecedents,
 * `not`, `xor`) require `Integer`/`Binary` variables with integer coefficients and RHS on MIP backends
 * (and bounded `Integer`/`Binary` models on Pumpkin; for `Continuous` or non-integer negated constraints,
 * use `{ solver: "z3" }`, or write `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`).
 */
export abstract class BoolExpr {
  /** Logical conjunction (`this AND other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public and(other: LogicInput): BoolOp {
    return new BoolOp("and", [this, assertLogicElement(other, "and")]);
  }

  /** Logical disjunction (`this OR other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public or(other: LogicInput): BoolOp {
    return new BoolOp("or", [this, assertLogicElement(other, "or")]);
  }

  /** Logical implication (`this => consequent`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public implies(consequent: LogicInput): BoolOp {
    return new BoolOp("implies", [this, assertLogicElement(consequent, "implies")]);
  }

  /** Logical exclusive-or (`this XOR other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public xor(other: LogicInput): BoolOp {
    return new BoolOp("xor", [this, assertLogicElement(other, "xor")]);
  }

  /** Logical negation (`NOT this`). */
  public not(): BoolOp {
    return new BoolOp("not", [this]);
  }
}

/**
 * Propositional Boolean variable (`true` / `false`) for logical / SMT modeling.
 * Created via `m.bool(...)`; solved natively on Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized into a 0-1 MIP binary variable on HiGHS and GLPK.
 * For 0-1 arithmetic variables in linear sums or objectives, use `m.binary(...)` instead.
 */
export class BoolVar extends BoolExpr {
  public readonly id: number;
  public readonly type = "Boolean" as const;
  public readonly name: string;
  public value: boolean | null = null;

  constructor(name?: string) {
    super();
    this.id = ++boolVarIdCounter;
    this.name = name || `p_${this.id}`;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Compound Boolean operator AST node (`and`, `or`, `not`, `implies`, `xor`).
 */
export class BoolOp extends BoolExpr {
  public readonly op: LogicalOpType;
  public readonly children: LogicElement[];

  constructor(op: LogicalOpType, children: LogicInput[]) {
    super();
    this.op = op;
    this.children = children.map((c) => assertLogicElement(c, op));
  }

  toString(): string {
    if (this.op === "not") {
      return `not(${this.children[0].toString()})`;
    }
    return `(${this.children.map((c) => c.toString()).join(` ${this.op} `)})`;
  }
}

/**
 * Logical conjunction (`e1 AND e2 AND ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized into 0-1 MIP constraints on HiGHS and
 * GLPK. Passing an unconstrained arithmetic expression (`LinExpr` / `QuadExpr`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("AndExample");
 * const a = m.bool("a");
 * const x = m.integer("x", { lb: 0, ub: 20 });
 * m.constraint(and(a, expr`${x} >= 10`), "both_active");
 * ```
 */
export function and(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("and() requires at least one expression");
  return new BoolOp("and", exprs);
}

/**
 * Logical disjunction (`e1 OR e2 OR ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized via 0-1 MIP Big-M indicators on HiGHS
 * and GLPK (variables in comparison branches require finite bounds on MIP backends and Pumpkin). Passing
 * an unconstrained arithmetic expression (`LinExpr` / `QuadExpr`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("OrExample");
 * const x = m.integer("x", { lb: 0, ub: 20 });
 * m.constraint(or(expr`${x} <= 5`, expr`${x} >= 15`), "disjoint_range");
 * ```
 */
export function or(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("or() requires at least one expression");
  return new BoolOp("or", exprs);
}

/**
 * Logical negation (`NOT e`) of a `BoolVar`, `BoolExpr`, or linear comparison `Constraint`.
 *
 * **Solver capability note**: Solved natively by Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized on HiGHS and GLPK. Negating a
 * comparison `Constraint` on MIP backends uses exact `+/- 1` integer shifts and requires `Integer`/`Binary`
 * variables with integer coefficients and RHS (and bounded `Integer`/`Binary` models on Pumpkin); for
 * `Continuous` or non-integer constraints, use `{ solver: "z3" }`, or write an explicit
 * closed-tolerance disjunction `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("NotExample");
 * const blocked = m.bool("blocked");
 * m.constraint(not(blocked), "must_not_be_blocked");
 * ```
 */
export function not(expr: LogicInput): BoolOp {
  return new BoolOp("not", [expr]);
}

/**
 * Logical implication (`antecedent => consequent`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized into 0-1 MIP constraints on HiGHS and
 * GLPK. When `antecedent` contains a comparison `Constraint`, MIP backends negate it via exact `+/- 1`
 * integer shifts (`Integer`/`Binary` variables with integer coefficients and RHS), and Pumpkin requires
 * bounded `Integer`/`Binary` models; if `antecedent` involves `Continuous` variables or non-integer
 * coefficients/thresholds, MIP solvers and Pumpkin throw an Error—use `{ solver: "z3" }`, or rewrite
 * explicitly with `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("ImpliesExample");
 * const vip = m.bool("vip");
 * const discount = m.integer("discount", { lb: 0, ub: 50 });
 * m.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
 * ```
 */
export function implies(antecedent: LogicInput, consequent: LogicInput): BoolOp {
  return new BoolOp("implies", [antecedent, consequent]);
}

/**
 * Logical exclusive-or (`e1 XOR e2 ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Pumpkin (`{ solver: "pumpkin" }`, bounded integer/boolean
 * models) and Z3 (`{ solver: "z3" }`), and automatically linearized into 0-1 MIP constraints on HiGHS and
 * GLPK. Comparison `Constraint` operands require both positive and negated directions (`+/- 1` integer
 * shifts over bounded `Integer`/`Binary` variables with integer coefficients and RHS); for `Continuous`
 * or non-integer constraints, use `{ solver: "z3" }`, or model the propositions explicitly with
 * `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("XorExample");
 * const shiftA = m.bool("shiftA");
 * const shiftB = m.bool("shiftB");
 * m.constraint(xor(shiftA, shiftB), "exactly_one_shift");
 * ```
 */
export function xor(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("xor() requires at least one expression");
  return new BoolOp("xor", exprs);
}

export type DiscreteExprOperand = Var | LinExpr | QuadExpr | Constraint | number;

export interface DisjointTask {
  start: DiscreteExprOperand;
  duration: number;
}

export interface CumulativeTask {
  start: DiscreteExprOperand;
  duration: number;
  demand: number;
}

export type GlobalConstraintSpec =
  | { readonly kind: "distinct"; readonly args: ReadonlyArray<LinExpr> }
  | {
      readonly kind: "disjoint";
      readonly tasks: ReadonlyArray<{ readonly start: LinExpr; readonly duration: number }>;
    }
  | {
      readonly kind: "cumulative";
      readonly tasks: ReadonlyArray<{
        readonly start: LinExpr;
        readonly duration: number;
        readonly demand: number;
      }>;
      readonly capacity: number;
    }
  | {
      readonly kind: "allowed";
      readonly vars: ReadonlyArray<LinExpr>;
      readonly tuples: ReadonlyArray<ReadonlyArray<number>>;
    };

/**
 * High-level structural Constraint Programming (CP) predicate returning a composable `BoolExpr`
 * (`distinct`, `disjoint`, `cumulative`, `allowed`).
 */
export class GlobalConstraint extends BoolExpr {
  public readonly spec: GlobalConstraintSpec;
  public readonly discreteVars: ReadonlySet<Var>;

  constructor(spec: GlobalConstraintSpec, discreteVars: ReadonlySet<Var>) {
    super();
    this.spec = spec;
    this.discreteVars = discreteVars;
  }

  toString(): string {
    switch (this.spec.kind) {
      case "distinct":
        return `distinct(${this.spec.args.map((a) => a.toString()).join(", ")})`;
      case "disjoint":
        return `disjoint([${this.spec.tasks
          .map((t) => `{ start: ${t.start.toString()}, duration: ${t.duration} }`)
          .join(", ")}])`;
      case "cumulative":
        return `cumulative([${this.spec.tasks
          .map((t) => `{ start: ${t.start.toString()}, duration: ${t.duration}, demand: ${t.demand} }`)
          .join(", ")}], ${this.spec.capacity})`;
      case "allowed":
        return `allowed([${this.spec.vars.map((v) => v.toString()).join(", ")}], [${this.spec.tuples
          .map((row) => `[${row.join(", ")}]`)
          .join(", ")}])`;
    }
  }
}

function isPlainRecordObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) return false;
  if (val instanceof Constraint || val instanceof BoolExpr || val instanceof LinExpr) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function isScalarOperand(val: unknown): boolean {
  return (
    typeof val === "number" ||
    val instanceof Constraint ||
    val instanceof LinExpr ||
    (typeof val === "object" &&
      val !== null &&
      (("terms" in val && (val as { terms: unknown }).terms instanceof Map) ||
        ("quadTerms" in val && (val as { quadTerms: unknown }).quadTerms instanceof Map) ||
        ("id" in val && "name" in val && "lb" in val && "ub" in val && !("sense" in val))))
  );
}

/**
 * Enforce pairwise distinct values across all elements (`AllDifferent` global constraint).
 * Accepts variadic scalar expressions or 1D/2D `Array` / `Iterable` / plain `Record` containers
 * of `Integer` / `Binary` variables, discrete `LinExpr`s, or integer constants.
 *
 * @example
 * ```ts
 * const m = new Model("DistinctExample");
 * const room = m.integer(3, { lb: 1, ub: 3, prefix: "room" });
 * m.constraint(distinct(room), "unique_rooms");
 * ```
 */
export function distinct(
  ...args: Array<
    | DiscreteExprOperand
    | Iterable<DiscreteExprOperand | Iterable<DiscreteExprOperand> | Record<string, DiscreteExprOperand>>
    | Record<string, any>
  >
): GlobalConstraint {
  if (args.length === 0) {
    throw new Error("distinct() requires at least one expression or container.");
  }
  const flattened: LinExpr[] = [];
  const discreteVars = new Set<Var>();

  const visit = (item: unknown, depth: number): void => {
    if (item === null || item === undefined) {
      throw new Error("Unsupported nullish item in distinct(): expected an integer-valued expression.");
    }
    if (isScalarOperand(item)) {
      const lin = toScalarLinExpr(item, "distinct()");
      collectAndValidateDiscreteExpr(lin, "distinct()", discreteVars);
      flattened.push(lin);
      return;
    }
    if (Array.isArray(item)) {
      if (depth >= 2) {
        throw new Error("Nested containers deeper than 2D are not supported in distinct().");
      }
      for (let i = 0; i < item.length; i++) {
        if (!(i in item)) {
          throw new Error(`Unsupported item in distinct(): sparse array hole at index ${i}.`);
        }
        visit(item[i], depth + 1);
      }
      return;
    }
    if (
      typeof item === "object" &&
      !(item instanceof String) &&
      !(item instanceof Map) &&
      Symbol.iterator in item &&
      typeof (item as Iterable<unknown>)[Symbol.iterator] === "function"
    ) {
      if (depth >= 2) {
        throw new Error("Nested containers deeper than 2D are not supported in distinct().");
      }
      for (const sub of item as Iterable<unknown>) {
        visit(sub, depth + 1);
      }
      return;
    }
    if (isPlainRecordObject(item)) {
      if (depth >= 2) {
        throw new Error("Nested containers deeper than 2D are not supported in distinct().");
      }
      if (Object.getOwnPropertySymbols(item).length > 0) {
        throw new Error("Symbol keys are not supported in distinct().");
      }
      for (const key of Object.keys(item)) {
        visit(item[key], depth + 1);
      }
      return;
    }
    throw new Error("Unsupported item in distinct(): expected an integer-valued expression or container.");
  };

  for (const arg of args) {
    visit(arg, 0);
  }

  return new GlobalConstraint({ kind: "distinct", args: flattened }, discreteVars);
}

function collectTasksFromContainer(
  tasks: unknown,
  fnName: "disjoint" | "cumulative"
): unknown[] {
  if (tasks === null || tasks === undefined) {
    throw new Error(`${fnName}(tasks) requires an Array, Iterable, or Record of task objects.`);
  }
  if (Array.isArray(tasks)) {
    const out: unknown[] = [];
    for (let i = 0; i < tasks.length; i++) {
      if (!(i in tasks)) {
        throw new Error(`${fnName}(tasks) encountered sparse array hole at index ${i}.`);
      }
      out.push(tasks[i]);
    }
    return out;
  }
  if (
    typeof tasks === "object" &&
    !(tasks instanceof String) &&
    !(tasks instanceof Map) &&
    Symbol.iterator in tasks &&
    typeof (tasks as Iterable<unknown>)[Symbol.iterator] === "function"
  ) {
    return Array.from(tasks as Iterable<unknown>);
  }
  if (isPlainRecordObject(tasks)) {
    if ("start" in tasks && "duration" in tasks) {
      throw new Error(
        `${fnName}(tasks) expects an Array, Iterable, or Record of task objects, not a single task object.`
      );
    }
    if (Object.getOwnPropertySymbols(tasks).length > 0) {
      throw new Error(`Symbol keys are not supported in ${fnName}().`);
    }
    return Object.keys(tasks).map((k) => tasks[k]);
  }
  throw new Error(`${fnName}(tasks) requires an Array, Iterable, or Record of task objects.`);
}

/**
 * Enforce non-overlapping unary resource scheduling across tasks (`NoOverlap` / `Disjunctive` global constraint).
 *
 * @example
 * ```ts
 * const m = new Model("DisjointExample");
 * const s1 = m.integer("s1", { lb: 0, ub: 10 });
 * const s2 = m.integer("s2", { lb: 0, ub: 10 });
 * m.constraint(disjoint([{ start: s1, duration: 5 }, { start: s2, duration: 3 }]), "machine_1");
 * ```
 */
export function disjoint(
  tasks: Iterable<DisjointTask> | Record<string, DisjointTask>
): GlobalConstraint {
  const rawTasks = collectTasksFromContainer(tasks, "disjoint");
  const discreteVars = new Set<Var>();
  const normalized: Array<{ start: LinExpr; duration: number }> = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const item = rawTasks[i];
    if (typeof item !== "object" || item === null || !("start" in item) || !("duration" in item)) {
      throw new Error(`disjoint() task at index ${i} must be an object with { start, duration }.`);
    }
    const taskObj = item as { start: unknown; duration: unknown };
    const startLin = toScalarLinExpr(taskObj.start, `disjoint() task[${i}].start`);
    collectAndValidateDiscreteExpr(startLin, `disjoint() task[${i}].start`, discreteVars);
    if (
      typeof taskObj.duration !== "number" ||
      !Number.isSafeInteger(taskObj.duration) ||
      taskObj.duration < 0
    ) {
      throw new Error(
        `disjoint() task[${i}].duration must be a finite non-negative integer, received ${String(taskObj.duration)}.`
      );
    }
    normalized.push({ start: startLin, duration: Object.is(taskObj.duration, -0) ? 0 : taskObj.duration });
  }

  return new GlobalConstraint({ kind: "disjoint", tasks: normalized }, discreteVars);
}

/**
 * Enforce cumulative resource capacity over tasks with `{ start, duration, demand }`
 * (`Cumulative` global constraint).
 *
 * @example
 * ```ts
 * const m = new Model("CumulativeExample");
 * const s1 = m.integer("s1", { lb: 0, ub: 10 });
 * const s2 = m.integer("s2", { lb: 0, ub: 10 });
 * m.constraint(cumulative([{ start: s1, duration: 5, demand: 2 }, { start: s2, duration: 3, demand: 1 }], 2), "workers");
 * ```
 */
export function cumulative(
  tasks: Iterable<CumulativeTask> | Record<string, CumulativeTask>,
  capacity: number
): GlobalConstraint {
  if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 0) {
    throw new Error(
      `cumulative() capacity must be a finite non-negative integer, received ${String(capacity)}.`
    );
  }
  const rawTasks = collectTasksFromContainer(tasks, "cumulative");
  const discreteVars = new Set<Var>();
  const normalized: Array<{ start: LinExpr; duration: number; demand: number }> = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const item = rawTasks[i];
    if (
      typeof item !== "object" ||
      item === null ||
      !("start" in item) ||
      !("duration" in item) ||
      !("demand" in item)
    ) {
      throw new Error(
        `cumulative() task at index ${i} must be an object with { start, duration, demand }.`
      );
    }
    const taskObj = item as { start: unknown; duration: unknown; demand: unknown };
    const startLin = toScalarLinExpr(taskObj.start, `cumulative() task[${i}].start`);
    collectAndValidateDiscreteExpr(startLin, `cumulative() task[${i}].start`, discreteVars);
    if (
      typeof taskObj.duration !== "number" ||
      !Number.isSafeInteger(taskObj.duration) ||
      taskObj.duration < 0
    ) {
      throw new Error(
        `cumulative() task[${i}].duration must be a finite non-negative integer, received ${String(taskObj.duration)}.`
      );
    }
    if (
      typeof taskObj.demand !== "number" ||
      !Number.isSafeInteger(taskObj.demand) ||
      taskObj.demand < 0
    ) {
      throw new Error(
        `cumulative() task[${i}].demand must be a finite non-negative integer, received ${String(taskObj.demand)}.`
      );
    }
    normalized.push({
      start: startLin,
      duration: Object.is(taskObj.duration, -0) ? 0 : taskObj.duration,
      demand: Object.is(taskObj.demand, -0) ? 0 : taskObj.demand,
    });
  }

  return new GlobalConstraint(
    {
      kind: "cumulative",
      tasks: normalized,
      capacity: Object.is(capacity, -0) ? 0 : capacity,
    },
    discreteVars
  );
}

/**
 * Enforce extensional tuple membership `(vars[0], ..., vars[k-1]) in tuples`
 * (`Table` / `AllowedAssignments` global constraint; wrap in `not(...)` for forbidden tuples).
 *
 * @example
 * ```ts
 * const m = new Model("AllowedExample");
 * const a = m.integer("a", { lb: 1, ub: 2 });
 * const b = m.integer("b", { lb: 1, ub: 2 });
 * m.constraint(allowed([a, b], [[1, 2], [2, 1]]), "valid_pair");
 * ```
 */
export function allowed(
  vars: ReadonlyArray<DiscreteExprOperand>,
  tuples: Iterable<ReadonlyArray<number>>
): GlobalConstraint {
  if (!Array.isArray(vars) || vars.length === 0) {
    throw new Error("allowed(vars, tuples) requires a non-empty Array of expressions as its first argument.");
  }
  const discreteVars = new Set<Var>();
  const normalizedVars: LinExpr[] = new Array(vars.length);
  for (let i = 0; i < vars.length; i++) {
    if (!(i in vars)) {
      throw new Error(`allowed() vars encountered sparse array hole at index ${i}.`);
    }
    const vLin = toScalarLinExpr(vars[i], `allowed() vars[${i}]`);
    collectAndValidateDiscreteExpr(vLin, `allowed() vars[${i}]`, discreteVars);
    normalizedVars[i] = vLin;
  }

  if (
    tuples === null ||
    tuples === undefined ||
    typeof tuples !== "object" ||
    tuples instanceof String ||
    !(Symbol.iterator in tuples) ||
    typeof (tuples as Iterable<unknown>)[Symbol.iterator] !== "function"
  ) {
    throw new Error("allowed(vars, tuples) requires an Iterable of integer tuples as its second argument.");
  }

  const normalizedTuples: number[][] = [];
  let rowIdx = 0;
  for (const row of tuples as Iterable<unknown>) {
    if (!Array.isArray(row) || row.length !== vars.length) {
      throw new Error(
        `allowed() tuple at index ${rowIdx} must be an Array of length ${vars.length}.`
      );
    }
    const copyRow: number[] = new Array(vars.length);
    for (let j = 0; j < vars.length; j++) {
      if (!(j in row)) {
        throw new Error(`allowed() tuple[${rowIdx}] encountered sparse array hole at index ${j}.`);
      }
      const cell = row[j];
      if (typeof cell !== "number" || !Number.isSafeInteger(cell)) {
        throw new Error(
          `allowed() tuple[${rowIdx}][${j}] must be a safe integer, received ${String(cell)}.`
        );
      }
      copyRow[j] = Object.is(cell, -0) ? 0 : cell;
    }
    normalizedTuples.push(copyRow);
    rowIdx++;
  }

  return new GlobalConstraint(
    { kind: "allowed", vars: normalizedVars, tuples: normalizedTuples },
    discreteVars
  );
}


