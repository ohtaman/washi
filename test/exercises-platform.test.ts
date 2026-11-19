import { describe, it, expect } from "vitest";
import { transpileExerciseTsToJs } from "../examples/web-demo/exercises/src/runner/ts-transpile.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import {
  PROGRESS_STORAGE_KEY,
  createEmptyProgress,
  loadProgress,
  saveProgress,
  recordSolvedProblem,
  saveDraft,
  isProblemSolved,
  countMainSolved,
  getSolvedRuntimeCount,
  getNextRecommendedProblemId,
  exportProgressJson,
  importProgressJson,
} from "../examples/web-demo/exercises/src/store/progress.js";
import {
  highlightCode,
  renderLineNumbers,
} from "../examples/web-demo/exercises/src/ui/code-editor.js";
import {
  renderSafeMarkdown,
  parseProblemMarkdown,
} from "../examples/web-demo/exercises/src/ui/markdown.js";
import {
  renderExerciseIndexHtml,
  renderWorkspaceHtml,
  renderResultsHtml,
} from "../examples/web-demo/exercises/src/ui/components.js";
import { UI_STRINGS } from "../examples/web-demo/exercises/src/i18n/ui-strings.js";
import { CHAPTERS, PROBLEMS } from "../examples/web-demo/exercises/src/problems/registry.js";

describe("Exercises Platform — TypeScript Transpiler", () => {
  it("strips TS syntax while preserving strings, template literals, != comparisons, ternaries, and object literals", () => {
    const sample = `
import { Model, expr, maximize } from "@ohtaman/washi";

export interface SampleInput {
  cap: number;
  items: { name: string; weight: number }[];
}

type ResultMap = Record<string, number>;

export async function solve(input: SampleInput): Promise<{ x: number; label: string }> {
  const weights = new Map<string, number>();
  const m = new Model("Sample");
  const x = m.integer("x", { lb: 0, ub: 10 });
  const y = m.integer("y", { lb: 0, ub: 10 });
  const msg = "string with : type and -> not stripped!";
  m.constraint(expr\`\${x} != \${y}\`, "neq_rule");
  m.constraint(expr\`\${x} <= \${input.cap}\`);
  m.objective(maximize(expr\`\${x} + 2 * \${y}\`));
  await m.solve();
  const flag = x.value! !== 0 ? "ok" : "zero";
  const out: ResultMap = { val: Math.round(x.value!) };
  weights.set("a", out.val);
  return { x: out.val, label: \`\${msg}:\${flag}\` };
}
`;

    const js = transpileExerciseTsToJs(sample);
    expect(js).not.toMatch(/^\s*import\s+/m);
    expect(js).not.toMatch(/\binterface\s+SampleInput\b/);
    expect(js).not.toMatch(/\btype\s+ResultMap\b/);
    expect(js).toContain('"string with : type and -> not stripped!"');
    expect(js).toContain("${x} != ${y}");
    expect(js).toContain("new Map()");
    expect(js).toContain("x.value !== 0");

    // Must parse cleanly as valid JavaScript async function body
    const fn = new Function(js);
    expect(typeof fn).toBe("function");
  });

  it("preserves comparisons with parentheses, operators after `as` assertions, and semicolon-free type aliases", () => {
    const edgeTs = `
type PointInput = { x: number; n: number }
type UnionMode =
  | "fast"
  | "safe"
export function solve(input: PointInput) {
  const mode: UnionMode = "fast";
  if (input.n < 2 || input.n > (10)) {
    return -1;
  }
  const shifted = input.x as number + 1;
  return shifted + (mode === "fast" ? 10 : 0);
}
`;
    const js = transpileExerciseTsToJs(edgeTs);
    expect(js).not.toMatch(/PointInput\s*=/);
    expect(js).not.toMatch(/UnionMode\s*=/);
    expect(js).toContain("input.n < 2 || input.n > (10)");
    expect(js).toContain("input.x + 1");

    const fn = new Function(`${js}; return solve;`)() as (inp: { x: number; n: number }) => number;
    expect(fn({ x: 5, n: 4 })).toBe(16);
    expect(fn({ x: 5, n: 1 })).toBe(-1);
  });

  it("handles inline object return types, regex literals with `!`, and `<` after `as Type` assertions", () => {
    const sample = `
export function solve(input: { s: string; v: number }): { ok: boolean; lt: boolean } {
  const regexHit = /a!/.test(input.s);
  const lt = input.v as number < 10;
  const inv = /* keep logical not */ !regexHit;
  return { ok: inv || regexHit, lt };
}
`;
    const js = transpileExerciseTsToJs(sample);
    expect(js).toContain("/a!/");
    expect(js).toContain("!regexHit");
    expect(js).toMatch(/input\.v\s*<\s*10/);

    const solve = new Function(`${js}; return solve;`)() as (inp: {
      s: string;
      v: number;
    }) => { ok: boolean; lt: boolean };
    expect(solve({ s: "a", v: 5 })).toEqual({ ok: true, lt: true });
    expect(solve({ s: "a!", v: 12 })).toEqual({ ok: true, lt: false });
    expect(/a!/.test("a")).toBe(false);
    // Verify /a!/ inside transpiled solve genuinely distinguishes "a" from "a!"
    const directRegexCheck = `
export function check(s: string): { matched: boolean } {
  return { matched: /a!/.test(s) };
}
`;
    const checkFn = new Function(`${transpileExerciseTsToJs(directRegexCheck)}; return check;`)() as (
      s: string
    ) => { matched: boolean };
    expect(checkFn("a").matched).toBe(false);
    expect(checkFn("a!").matched).toBe(true);
  });

  it("preserves ternaries and comparisons in default parameter expressions", () => {
    const simple = transpileExerciseTsToJs(
      "export function solve(input = true ? 1 : 2) { return input; }",
    );
    const simpleSolve = new Function(`${simple}; return solve;`)() as () => number;
    expect(simpleSolve()).toBe(1);

    const sample = `
export function solve(
  input: number = true ? 10 : 20,
  untyped = false ? 1 : 2,
  cmp = 1 < 2 ? 3 : 4,
  m: Map<string, number> = new Map<string, number>(),
  m2 = new Map<Array<number>, (x: number) => number>(),
  { k = 1 < 2 }: { k?: boolean } = {},
  tail: number = 5,
): number {
  return input + untyped + cmp + m.size + m2.size + (k ? 1 : 0) + tail;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as () => number;
    expect(solve()).toBe(10 + 2 + 3 + 0 + 0 + 1 + 5);
  });

  it("distinguishes parenthesized arrow return types from function types", async () => {
    const sample = `
const make = (): (() => number) => () => 1;
const f = (x: number): (number & {}) => x + 1;
const u = (x: number): ((y: number) => number) | null =>
  x > 0 ? (y: number): number => x + y : null;
const arr = (x: number): (() => number)[] => [() => x];
const prom = (x: number): Promise<() => number> => Promise.resolve(() => x + 4);
export function makeAdder(x: number): (y: number) => Promise<number> {
  return async (y: number): Promise<number> =>
    x + y + make()() + f(0) + arr(2)[0]() + (u(1)?.(2) ?? 0) + (await prom(3))();
}
`;
    const js = transpileExerciseTsToJs(sample);
    const makeAdder = new Function(`${js}; return makeAdder;`)() as (
      x: number,
    ) => (y: number) => Promise<number>;
    expect(await makeAdder(10)(5)).toBe(10 + 5 + 1 + 1 + 2 + 3 + 7);
  });

  it("strips typed callbacks and function expressions inside parameter and destructuring defaults", () => {
    const basic = transpileExerciseTsToJs(
      "export function solve(input: number, transform = (x: number): number => x + 1) { return transform(input); }",
    );
    const basicFn = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicFn(41)).toBe(42);

    const sample = `
export function solve(
  input: number,
  cb = (x: number, sub = (y: number): number => y * 2): number => sub(x),
  fnExpr = function (x: number): number { return x + 3; },
  { fn = (x: number): number => x + 1 }: { fn?: (x: number) => number } = {},
): number {
  return cb(input) + fnExpr(input) + fn(input);
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(5)).toBe(10 + 8 + 6);
  });

  it("strips type annotations across multi-declarator variable statements and nested initializers", () => {
    const basic = transpileExerciseTsToJs(
      "export function solve(input: number) { let a: number = 1, b: number = 2; return input + a + b; }",
    );
    const basicFn = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicFn(10)).toBe(13);

    const sample = `
function pairSum(x: number, y: number): number {
  return x + y;
}
export function solve(input: number): number {
  let a: number = pairSum(1, 2),
    b: { k: number } = { k: 3 },
    c: Map<string, number> = new Map<string, number>(),
    d: number;
  d = 4;
  const f: (n: number) => number = (n: number) => {
      let x: number = 1, y: number = 2;
      return n + x + y;
    },
    g: number = 10;
  return input + a + b.k + c.size + d + f(0) + g;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(5)).toBe(5 + 3 + 3 + 0 + 4 + 3 + 10);
  });

  it("strips uninitialized, ASI, function-typed, loop, and destructured variable annotations while preserving property names", () => {
    const basic = transpileExerciseTsToJs(
      "export function solve(input: number) { let result: number; result = input + 1; return result; }",
    );
    const basicFn = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicFn(7)).toBe(8);

    const sample = `
export function solve(input: number): number {
  let asi: number
  asi = input + 2
  let fn: (x: number) => number;
  fn = (x: number): number => x * 2;
  let total: number = asi + fn(input);
  for (let i: number = 0, limit: number = 3; i < limit; i++) {
    total += i;
  }
  for (const v: number of [1, 2, 3]) {
    total += v;
  }
  const { a, b }: { a: number; b: number } = { a: 4, b: 5 };
  const [p, q]: [number, number] = [6, 7];
  const cast = ((x: number) => x + 1) as (x: number) => number;
  const obj = { let: 1, var: 2, const: 3 };
  const arr = [1, 2] as const
  const v = obj.let + obj.var + obj.const + arr[0];
  return total + a + b + p + q + cast(0) + v;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // asi = input + 2, fn(input) = 2*input => 3*input + 2 + (0+1+2) + (1+2+3) + (4+5) + (6+7) + 1 + (1+2+3+1)
    expect(solve(3)).toBe(11 + 3 + 6 + 9 + 13 + 1 + 7);
  });

  it("keeps relational comparisons from hiding declarator commas alongside real generics", () => {
    const sample = `
export function solve(input: number) {
  const min = 2, max = 10;
  let low = input<min, high: boolean = input>max;
  let a = input<min, b = input>max;
  let m: Map<string, number> = new Map<string, number>(), k: number = a === b ? 0 : 1;
  return { low, high, k, size: m.size };
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => {
      low: boolean;
      high: boolean;
      k: number;
      size: number;
    };
    expect(solve(1)).toEqual({ low: true, high: false, k: 1, size: 0 });
    expect(solve(12)).toEqual({ low: false, high: true, k: 1, size: 0 });
    expect(solve(5)).toEqual({ low: false, high: false, k: 0, size: 0 });
  });

  it("strips as and satisfies assertions following object literals", () => {
    const sample = `
type Output = { x: number };
export function solve(input: number) {
  const obj = { x: input } as { x: number };
  const sat = { x: input + 1 } satisfies Output;
  const ro = { x: input + 2 } as const;
  if (obj.x < 0) return { x: -1, sum: sat.x + ro.x } as Output & { sum: number };
  return { x: input + sat.x + ro.x } as Output;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => { x: number };
    expect(solve(5)).toEqual({ x: 5 + 6 + 7 });
  });

  it("removes type parameters from generic arrow functions", async () => {
    const sample = `
const identity = <T>(x: T): T => x;
const tag = <T,>(x: T): T => x;
const asyncId = async <T extends number>(x: T): Promise<T> => x;
const pair = <A, B>(a: A, b: B): [A, B] => [a, b], extra: number = 5;
const curry = () => <T>(x: T): T => x;
export async function solve(input: number, fn = <T>(x: T): T => x): Promise<number> {
  const [p0, p1] = pair<number, number>(input, extra);
  return identity(p0) + tag(p1) + (await asyncId(2)) + curry()(3) + fn(4);
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => Promise<number>;
    expect(await solve(10)).toBe(10 + 5 + 2 + 3 + 4);
  });

  it("handles local type/interface declarations, export default functions, and object/class methods", () => {
    const sample = `
export default function solve(input: number): number {
  interface Pair {
    a: number;
    b: number;
  }
  type Transform = (x: number) => number;
  const helper = {
    type: 100,
    add(x: number, y: number): number {
      return x + y;
    },
    async mul(x: number, y: number): Promise<number> {
      return x * y;
    },
  };
  class Acc {
    add<T extends number>(x: T): number {
      return x + 1;
    }
  }
  const p: Pair = { a: input, b: 2 };
  const inc: Transform = (v: number): number => v + 1;
  const check = input > 0 ? true : false;
  if (check) {
    return helper.add(p.a, p.b) + new Acc().add<number>(inc(1)) + helper.type;
  }
  return 0;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(5)).toBe(7 + 3 + 100);
  });

  it("preserves functions, methods, and calls named satisfies or as while stripping object assertions", () => {
    const basic = transpileExerciseTsToJs(
      "function satisfies (x: number) { return x + 1; }\nexport function solve(input: number) { return satisfies(input); }",
    );
    const basicSolve = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicSolve(10)).toBe(11);

    const sample = `
function as (x: number) {
  return x + 2;
}
class Checker {
  a() { return 1; }
  satisfies (x: number): boolean {
    return x > 0;
  }
  static satisfies (x: number): number {
    return x * 2;
  }
}
export function solve(input: number) {
  let acc = 0;
  function satisfies (v: number): number {
    return v + 3;
  }
  if (input > 0) {
    acc += 1;
  } satisfies (input);
  const obj = { a: input }
  satisfies (acc);
  const checker = new Checker();
  const asserted = { x: obj.a } satisfies { x: number };
  return asserted.x + as(1) + satisfies(2) + Checker.satisfies(3) + (checker.satisfies(1) ? acc : 0);
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(5)).toBe(5 + 3 + 5 + 6 + 1);
  });

  it("strips conditional type arguments and optional properties inside generic calls", () => {
    const sample = `
const identity = <T>(x: T): T => x;
const pair = <A, B>(a: A, b: B): [A, B] => [a, b];
const callWith = <F extends (x?: number) => number>(fn: F): number => fn(2);
export function solve(input: number): number {
  const exact = identity<number extends number ? number : never>(input);
  const nested = identity<number extends string ? never : number extends number ? number : never>(1);
  const [p0, p1] = pair<number extends number ? number : never, string extends string ? string : never>(2, "ok");
  const opt = identity<{ a?: number }>({ a: 3 }).a ?? 0;
  const cb = callWith<(x?: number) => number>((x = 1) => x + 4);
  const val: number extends number ? number : never = p1.length;
  return exact + nested + p0 + opt + cb + val;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(10)).toBe(10 + 1 + 2 + 3 + 6 + 2);
  });

  it("distinguishes contextual identifiers and property accesses from keyword tokens before assertions", () => {
    const basic = transpileExerciseTsToJs(
      "export function solve(input: number) { const get = input; return get as number; }",
    );
    const basicFn = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicFn(7)).toBe(7);

    const sample = `
function satisfies (arr: number[]) {
  return arr.map((v: number) => v + 1);
}
export function solve(input: { default: number; in: number; as: number }) {
  const get = input.default;
  const set = input.default + 1;
  const async = input.default + 2;
  const of = input.default + 3;
  const sum = (get as number) + (set satisfies number) + (async as number) + (of as number);
  const a = input.default as number;
  const b = input.default!;
  const c = input.default / (2 as number) + input.in / 2;
  const x = input.as
  const y: number = 1;
  const p = input.in
  const q: number = 2;
  let total = sum + a + b + c + x + y + p + q;
  for (const item of satisfies ([1, 2])) {
    total += item;
  }
  return total;
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (inp: {
      default: number;
      in: number;
      as: number;
    }) => number;
    // input = { default: 4, in: 6, as: 10 }:
    // get=4, set=5, async=6, of=7 => sum = 22
    // a=4, b=4, c=4/2 + 6/2 = 5, x=10, y=1, p=6, q=2 => 54
    // for item of [2, 3] => +5 => 59
    expect(solve({ default: 4, in: 6, as: 10 })).toBe(59);
  });

  it("strips inline type/interface declarations beyond line start while preserving property keys", () => {
    const basic = transpileExerciseTsToJs(
      "function solve(input: number) { type Value = number; const value: Value = input; return value; }",
    );
    const basicFn = new Function(`${basic}; return solve;`)() as (n: number) => number;
    expect(basicFn(42)).toBe(42);

    const sample = `
function solve(input: number) { type A = number; type B = { v: A }; interface Box { b: B } const x: Box = { b: { v: input } }; const ok = (() => { type Local = number })(); const meta = { type: 1, interface: 2 }; meta.type = 3; return x.b.v + (ok === undefined ? 1 : 0) + meta.type + meta.interface; }
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    expect(solve(5)).toBe(5 + 1 + 3 + 2);
  });

  it("recognizes for-of separators after keyword-named properties and allows newlines after as/satisfies", () => {
    const forOfProp = transpileExerciseTsToJs(
      "function satisfies(arr: number[]) { return arr; }\nexport function solve(input: { default: number }) { let total = 0; for (input.default of satisfies ([1, 2])) total += input.default; return total; }",
    );
    const forOfPropFn = new Function(`${forOfProp}; return solve;`)() as (inp: {
      default: number;
    }) => number;
    expect(forOfPropFn({ default: 0 })).toBe(3);

    const asNl = transpileExerciseTsToJs(
      "export function solve(input: number) { return input as\n number; }",
    );
    const asNlFn = new Function(`${asNl}; return solve;`)() as (n: number) => number;
    expect(asNlFn(9)).toBe(9);

    const sample = `
function satisfies(arr: { a?: number }[]) {
  return arr;
}
export function solve(input: { default: number }) {
  let total = 0;
  for (const { a = 1 } of satisfies ([{ a: 4 }])) {
    total += a;
  }
  const of = input.default;
  let loopInit = 0;
  for (let i = of as number; i < 3; i++) {
    loopInit += 1;
  }
  const x = (of as number) satisfies
    number;
  const arr = [1, 2] as
    const
  const y: number = 3;
  const fn = ((v: number) => v + 1) as
    (v: number) => number;
  const bad = () => {
    const obj = { a: 1 }
    satisfies ([{ a: 2 }]);
    return obj.a;
  };
  return total + loopInit + fn(x) + arr[0] + y + bad();
}
`;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (inp: { default: number }) => number;
    // input.default = 2 => total=4, loopInit=1 (i=2), fn(2)=3, arr[0]=1, y=3, bad()=1 => 13
    expect(solve({ default: 2 })).toBe(13);
  });

  it("strips type annotations from catch bindings while preserving .catch callbacks", () => {
    const sample = `
      export function solve(shouldThrow: boolean): number {
        try {
          if (shouldThrow) {
            throw new Error("boom");
          }
          return 1;
        } catch (err: unknown) {
          try {
            throw err;
          } catch ({ message }: Error) {
            const catcher = {
              catch(fn: (e: unknown) => number): number {
                return fn(err);
              },
            };
            const extra = catcher.catch((_e: unknown): number => 10);
            return message.length + extra;
          }
        }
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (b: boolean) => number;
    expect(solve(false)).toBe(1);
    expect(solve(true)).toBe(14);
  });

  it("strips generic interfaces whose constraints contain object braces", () => {
    const sample = `
      interface Value<T extends { x: number }> { value: T };
      interface Base<T> { base: T }
      interface Child<T extends { a: number }> extends Base<{ b: number }> {
        item: T;
      }
      export function solve(x: number): number {
        const v: Value<{ x: number }> = { value: { x } };
        const c: Child<{ a: number }> = { base: { b: 2 }, item: { a: 3 } };
        return v.value.x + c.base.b + c.item.a;
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (x: number) => number;
    expect(solve(5)).toBe(10);
  });

  it("strips export type/re-export statements, this parameter types, generic arrow constraints with semicolons, optional-chaining generics, and class TS syntax", () => {
    const sample = `
      interface Ctx { v: number; }
      type Foo = { x: number };
      export type { Foo };
      function readVal(this: Ctx, add: number): number {
        return this.v + add;
      }
      function onlyThis(this: Ctx): number {
        return this.v;
      }
      function id<T>(x: T): T {
        return x;
      }
      class Box<T extends { x: number }> implements Iterable<T> {
        private count: number = 1;
        value!: T;
        readonly label?: string;
        constructor(item: T, label?: string) {
          this.value = item;
          this.label = label;
        }
        *[Symbol.iterator](): Iterator<T> {
          yield this.value;
        }
        public getTotal(this: Box<T>): number {
          return this.value.x + this.count;
        }
      }
      export function solve(input: number): number {
        const pickA = <T extends { a: number; b: number }>(o: T): number => o.a;
        const maybeFn: (<T>(x: T) => T) | undefined = id;
        const box = new Box<{ x: number }>({ x: input }, "ok");
        const arr = [...box];
        const Inner = class Holder<U> {
          val: U;
          constructor(u: U) {
            this.val = u;
          }
        };
        const holder = new Inner<number>(3);
        return (
          readVal.call({ v: 10 }, 5) +
          onlyThis.call({ v: 7 }) +
          pickA<{ a: number; b: number }>({ a: 2, b: 3 }) +
          (maybeFn?.<number>(input) ?? 0) +
          box.getTotal() +
          arr[0].x +
          holder.val
        );
      }
      export { solve };
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // input=4: readVal=15, onlyThis=7, pickA=2, maybeFn=4, box.getTotal()=5, arr[0].x=4, holder.val=3 => 40
    expect(solve(4)).toBe(40);
  });

  it("preserves multiline class/object methods, multiline fields, keyword/string method names, index signatures, and async field ASI", () => {
    const sample = `
      class Plain {
        method
        (x) { return x + 1; }
      }
      class Fancy {
        [key: string]: unknown;
        x
        : number
        = 10;
        y!
        z: number = 2;
        async
        syncMethod(): number { return 3; }
        method
        <T extends { v: number }>
        (item: T)
        : number
        { return item.v + this.x + this.z; }
        delete(id: number): number { return id * 2; }
        "foo"(n: number): number { return n + 1; }
      }
      export function solve(input: number): number {
        const plain = new Plain();
        const fancy = new Fancy();
        const syncVal = fancy.syncMethod();
        const obj = {
          method
          (x: number)
          : number
          { return x + 1; },
          delete(x: number): number { return x * 3; },
          "foo"(x: number): number { return x + 2; },
        };
        return (
          plain.method(input) +
          (typeof syncVal === "number" ? syncVal : 0) +
          fancy.method<{ v: number }>({ v: 1 }) +
          fancy.delete(input) +
          fancy["foo"](5) +
          obj.method(6) +
          obj.delete(3) +
          obj["foo"](4)
        );
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // input=4: 5 + 3 + 13 + 8 + 6 + 7 + 9 + 6 = 57
    expect(solve(4)).toBe(57);
  });

  it("strips declaration-level abstract/declare modifiers, function overloads, and asserts return predicates while preserving ASI identifiers", () => {
    const sample = `
      abstract class Base {
        abstract compute(x: number): number;
        run(x: number): number { return this.compute(x) + 1; }
      }
      class Impl extends Base {
        override compute(x: number): number { return x * 2; }
      }
      export abstract class ExpAbs { val(): number { return 3; } }
      export default abstract class DefAbs { val(): number { return 4; } }
      declare class Amb { a: number; };
      export declare class ExpAmb { b: string; }
      declare abstract class AmbAbs { abstract f(): void; }
      declare function extFn(x: number): number;
      declare const EXT_CONST: number, EXT_OTHER: string;
      declare type AmbType = number;
      declare interface AmbIface { k: string; }
      declare module "ext-mod" { export const x: number; }
      declare module "*.css";
      declare global { interface Window { __x?: number; } }
      declare namespace AmbNs { export const y: number; }
      declare enum AmbEnum { A = 1, B = 2 }

      export function dbl(x: number): number;
      export function dbl(x: string): string;
      export function dbl(x: number | string): number | string {
        return typeof x === "number" ? x * 2 : x + x;
      }

      function assertPos(x: unknown): asserts x is number {
        if (typeof x !== "number" || x <= 0) throw new Error("bad");
      }
      function assertTruthy(x: unknown): asserts x {
        if (!x) throw new Error("falsy");
      }

      function checkAsi(): number {
        const abstract = 5;
        const declare = 6;
        abstract
        class Local {}
        declare
        function localFn(): number { return abstract + declare; }
        return new Local() ? localFn() : 0;
      }

      export function solve(input: number): number {
        assertPos(input);
        const doubledStr = dbl("a");
        assertTruthy(doubledStr);
        return (
          new Impl().run(input) +
          new ExpAbs().val() +
          new DefAbs().val() +
          dbl(input) +
          doubledStr.length +
          checkAsi()
        );
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // input=4: 9 + 3 + 4 + 8 + 2 + 11 = 37
    expect(solve(4)).toBe(37);
  });

  it("handles Round-11 multiline object methods, control-flow keyword methods, multiline variable annotations, multiline arrow return types, angle-bracket assertions, ASI after erased interfaces, and default exports", () => {
    const sample = `
      export default abstract class {};
      namespace TypeOnly {
        export type Num = number;
      }
      export function solve(input: TypeOnly.Num): TypeOnly.Num {
        const obj = {
          method(x: number)
          { return x; },
          if(x: number) { return x * 2; },
        };
        let x
        : number
        = input;
        const addOne = (n: number):
          number => n + 1;
        const castVal = <Array<number>>(([1, 2] as unknown));
        let asiSum = 0;
        const before = 10
        interface EraseMe { a: number }
        [3, 4].forEach((v: number) => {
          asiSum += v;
        });
        const extra: TypeOnly.Num = 5;
        return obj.method(input) + obj.if(input) + x + addOne(input) + castVal[0] + castVal[1] + before + asiSum + extra;
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // input=2: 2 + 4 + 2 + 3 + 1 + 2 + 10 + 7 + 5 = 36
    expect(solve(2)).toBe(36);
  });

  it("reports clear unsupported errors for non-erasable TypeScript enum, parameter properties, and runtime namespaces", () => {
    expect(() => transpileExerciseTsToJs("enum Color { Red, Blue }")).toThrow(/enum/i);
    expect(() => transpileExerciseTsToJs("class C { constructor(public x: number) {} }")).toThrow(
      /parameter propert/i,
    );
    expect(() => transpileExerciseTsToJs("namespace Ns { export const x = 1; }")).toThrow(
      /namespace/i,
    );
  });

  it("preserves ASI after brace-ending initializers, consecutive erased declarations, and erased class members", () => {
    const sample = `
      export function solve(input: number): number {
        let ran = 0;
        const obj = {}
        type T = number
        (() => { ran += 1; })();
        const fn = () => {}
        interface A { a: number }
        type B = string
        [2, 3].forEach((n: number) => { ran += n; });
        const obj2 = {}
        type C = number
        <U>(v: U) => v;
        class Seq {
          a = 1
          declare b: number
          [Symbol.iterator]() {
            return [this.a, input][Symbol.iterator]();
          }
        }
        const vals = [...new Seq()];
        return obj && fn && obj2 ? ran + vals[0] + vals[1] : 0;
      }
    `;
    const js = transpileExerciseTsToJs(sample);
    const solve = new Function(`${js}; return solve;`)() as (n: number) => number;
    // input=4: ran = 1 + 2 + 3 = 6, vals = [1, 4] => 6 + 1 + 4 = 11
    expect(solve(4)).toBe(11);
  });
});

describe("Exercises Platform — Progress Store (localStorage v1)", () => {
  const sampleProblems = [
    { id: "T1", chapter: 0 },
    { id: "T2", chapter: 0 },
    { id: "001", chapter: 1 },
    { id: "002", chapter: 1 },
    { id: "003", chapter: 1 },
  ];

  it("marks a problem solved when passed in EITHER runtime and tracks /100 progress without /200 denominators", () => {
    let state = createEmptyProgress();
    expect(countMainSolved(state, sampleProblems)).toBe(0);
    expect(isProblemSolved(state, "001")).toBe(false);
    expect(getSolvedRuntimeCount(state, "001")).toBe(0);
    expect(getNextRecommendedProblemId(state, sampleProblems)).toBe("001");

    state = recordSolvedProblem(state, "001", "washi", 15, "2026-11-19T00:02:00Z");
    expect(isProblemSolved(state, "001")).toBe(true);
    expect(countMainSolved(state, sampleProblems)).toBe(1);
    expect(getSolvedRuntimeCount(state, "001")).toBe(1);
    expect(getNextRecommendedProblemId(state, sampleProblems)).toBe("002");

    // Solving the second problem only in highspy also increments main count
    state = recordSolvedProblem(state, "002", "highspy", 45, "2026-11-19T00:03:00Z");
    expect(isProblemSolved(state, "002")).toBe(true);
    expect(countMainSolved(state, sampleProblems)).toBe(2);

    // Passing #001 in both runtimes preserves bestMs and keeps problem count at 2 (never double-counted)
    state = recordSolvedProblem(state, "001", "highspy", 10, "2026-11-19T00:04:00Z");
    expect(countMainSolved(state, sampleProblems)).toBe(2);
    expect(getSolvedRuntimeCount(state, "001")).toBe(2);
    expect(state.solved["001"].bestMs).toBe(10);
  });

  it("saves drafts, roundtrips through storage and JSON export/import, and rejects malformed imports", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };

    let state = createEmptyProgress();
    state = recordSolvedProblem(state, "001", "washi", 22, "2026-11-19T00:00:00Z");
    state = saveDraft(state, "002", "highspy", "import highspy\n# draft");
    saveProgress(state, storage);

    expect(map.has(PROGRESS_STORAGE_KEY)).toBe(true);
    const loaded = loadProgress(storage);
    expect(loaded).toEqual(state);

    const exported = exportProgressJson(loaded);
    const reimported = importProgressJson(exported);
    expect(reimported).toEqual(state);

    expect(() => importProgressJson("not json")).toThrow();
    expect(() => importProgressJson('{"version": 999}')).toThrow();
    expect(() => importProgressJson('{"version": 1, "solved": {"bad": {"runtimes": ["invalid"]}}}')).toThrow();
  });

  it("handles SecurityError thrown by window.localStorage property getter without crashing", () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const lockedWindow = {};
    Object.defineProperty(lockedWindow, "localStorage", {
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
    (globalThis as { window?: unknown }).window = lockedWindow;
    try {
      expect(loadProgress()).toEqual(createEmptyProgress());
      expect(() => saveProgress(createEmptyProgress())).not.toThrow();
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
    }
  });
});

describe("Exercises Platform — Safe Markdown & KaTeX Renderer", () => {
  it("escapes XSS vectors and unsafe URL protocols while rendering structured markdown & KaTeX", () => {
    const unsafeMd = `# Title

<script>alert(1)</script>
<img src=x onerror=alert(2)>
[bad](javascript:alert(3))
[good](https://washi.ohtaman.dev/)

| A | B |
| :--- | :---: |
| \`x\` | **bold** |

Inline math $x_1 + x_2 \\le 10$ and display:

$$
\\max \\sum_{i=1}^n c_i x_i
$$
`;
    const html = renderSafeMarkdown(unsafeMd);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('href="https://washi.ohtaman.dev/"');
    expect(html).toContain("<table>");
    expect(html).toContain("katex");

    const mathAndCurrency = renderSafeMarkdown("Range $0 \\le j < n$ and price $100 to $200.");
    expect(mathAndCurrency).toContain('<span class="math-inline">');
    expect(mathAndCurrency).toContain("katex");
    expect(mathAndCurrency).toContain("$100");
    expect(mathAndCurrency).toContain("$200");

    const nestedCode = renderSafeMarkdown("Use `` expr`dot(${w}, ${x}) <= ${B}` `` here.");
    expect(nestedCode).toContain("<code>expr`dot(${w}, ${x}) &lt;= ${B}`</code>");
  });

  it("parses localized problem markdown sections cleanly", () => {
    const md = `# #001 Sample Title

<!-- section:scenario -->
Scenario paragraph.

<!-- section:io -->
IO details.

<!-- section:example -->
Example text.

<!-- section:hint1 -->
Hint 1 body.

<!-- section:hint2 -->
Hint 2 pitfall body.

<!-- section:formulation -->
Formulation body.
`;
    const parsed = parseProblemMarkdown(md);
    expect(parsed.title).toBe("#001 Sample Title");
    expect(parsed.scenario).toContain("Scenario paragraph.");
    expect(parsed.ioSpec).toContain("IO details.");
    expect(parsed.example).toContain("Example text.");
    expect(parsed.hint1).toContain("Hint 1 body.");
    expect(parsed.hint2).toContain("Hint 2 pitfall body.");
    expect(parsed.formulation).toContain("Formulation body.");
  });
});

describe("Exercises Platform — Educational Book UI & Syntax Highlighter", () => {
  const GAMEY_UI_RE =
    /\bBoss\b|\u30dc\u30b9|\bQuest\b|\u30af\u30a8\u30b9\u30c8|\u{1f451}|\u2605|\u2606|\u9053\u5834|\u9053\u573a|\u901a\u5173|\u5173\u5361/ui;
  const CAPSTONE_LABELS = {
    en: "Synthesis",
    ja: "\u7ae0\u672b\u7dcf\u5408",
    zh: "\u7ae0\u672b\u7efc\u5408",
  } as const;

  function decodeHtmlEntities(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  it("highlights TypeScript & Python code while preserving character-for-character alignment and XSS escaping", () => {
    const tsSample = [
      '// <script>alert("xss")</script> comment with return & 42',
      'const m = new Model("IceCream");',
      'const cap = 120.5;',
      'm.constraint(expr`${cap} >= 0`);',
    ].join("\n");

    const tsHtml = highlightCode(tsSample, "ts");
    expect(tsHtml).not.toContain("<script>");
    expect(tsHtml).toContain('class="tok-comment"');
    expect(tsHtml).toContain('class="tok-keyword"');
    expect(tsHtml).toContain('class="tok-string"');
    expect(tsHtml).toContain('class="tok-number"');
    expect(tsHtml).toContain('class="tok-lib"');
    expect(decodeHtmlEntities(tsHtml)).toBe(tsSample);

    const pySample = [
      '# <b>comment</b> return highspy',
      'def solve(input_data: dict) -> dict:',
      '    h = highspy.Highs()',
      '    msg = "const async 123"',
      '    return {"val": 3.14}',
    ].join("\n");

    const pyHtml = highlightCode(pySample, "py");
    expect(pyHtml).not.toContain("<b>comment</b>");
    expect(pyHtml).toContain('class="tok-comment"');
    expect(pyHtml).toContain('class="tok-keyword"');
    expect(pyHtml).toContain('class="tok-lib"');
    expect(decodeHtmlEntities(pyHtml)).toBe(pySample);

    expect(renderLineNumbers("a\nb\nc")).toBe("1\n2\n3");
  });

  it("renders the book sidebar + hairline TOC index without cards, tutorials, or /200 denominators across en/ja/zh", () => {
    let state = createEmptyProgress();
    state = recordSolvedProblem(state, "001", "washi", 12, "2026-11-19T00:00:00Z");
    state = recordSolvedProblem(state, "002", "highspy", 40, "2026-11-19T00:02:00Z");

    for (const locale of ["en", "ja", "zh"] as const) {
      const html = renderExerciseIndexHtml({
        locale,
        strings: UI_STRINGS[locale],
        chapters: CHAPTERS,
        problems: PROBLEMS,
        progress: state,
      });

      expect(html, `index (${locale})`).not.toMatch(GAMEY_UI_RE);
      expect(html).toContain('class="book-sidebar"');
      expect(html).toContain('class="toc-list"');
      expect(html).toContain('class="toc-row"');
      expect(html).not.toContain('class="problem-grid"');
      expect(html).not.toContain('class="tutorial-strip"');
      expect(html).not.toMatch(/\/\s*200/);
      expect(html).toContain(CAPSTONE_LABELS[locale]);
      expect(html).toContain("is-capstone");

      // Solved in EITHER runtime shows unified solved badge cleanly; unsolved shows unsolved badge
      expect(html).toMatch(/data-problem-id="001"[\s\S]*?class="status-badge is-solved"/);
      expect(html).toMatch(/data-problem-id="002"[\s\S]*?class="status-badge is-solved"/);
      expect(html).toMatch(/data-problem-id="003"[\s\S]*?class="status-badge"/);
      expect(html).not.toMatch(/data-problem-id="003"[\s\S]*?class="status-badge is-solved"/);
    }
  });

  it("renders stacked workspace with unmistakable Answer Workbench, overlay editor, and single solved indicator", () => {
    const p010 = PROBLEMS.find((p) => p.meta.id === "010")!;
    let state = createEmptyProgress();
    state = recordSolvedProblem(state, "010", "washi", 18, "2026-11-19T00:00:00Z");

    for (const locale of ["en", "ja", "zh"] as const) {
      const wsHtml = renderWorkspaceHtml({
        locale,
        strings: UI_STRINGS[locale],
        chapters: CHAPTERS,
        problems: PROBLEMS,
        problem: p010,
        prevProblem: PROBLEMS.find((p) => p.meta.id === "009") ?? null,
        nextProblem: null,
        progress: state,
        activeRuntime: "washi",
        washiCode: p010.washiStarter,
        highspyCode: p010.highspyStarter,
      });

      expect(wsHtml, `workspace (${locale})`).not.toMatch(GAMEY_UI_RE);
      expect(wsHtml).toContain('class="book-sidebar"');
      expect(wsHtml).toContain('id="jump-to-editor-btn"');
      expect(wsHtml).toContain('id="answer-workbench"');
      expect(wsHtml).toContain('class="answer-workbench-head"');
      expect(wsHtml).toContain('class="editor-gutter"');
      expect(wsHtml).toContain('class="editor-highlight"');
      expect(wsHtml).toContain('id="editor-washi"');
      expect(wsHtml).toContain(`${p010.meta.difficulty}/5`);
      expect(wsHtml).toContain(UI_STRINGS[locale].solvedBadge);

      const resHtml = renderResultsHtml(locale, UI_STRINGS[locale], {
        overallStatus: "AC",
        cases: [
          {
            name: "Case 1",
            verdict: { status: "AC", ok: true, message: "Verified" },
            varCount: 4,
            constraintCount: 3,
            solveTimeMs: 5.2,
          },
        ],
        logs: [],
        runTimeMs: 12,
        nextProblemId: "010",
      });

      expect(resHtml, `results (${locale})`).not.toMatch(GAMEY_UI_RE);
      expect(resHtml).toContain("✓ ");
      expect(resHtml).toContain(UI_STRINGS[locale].results.nextProblemBtn("010"));
    }
  });
});

describe("Exercises Platform — WaSHI Runner Snapshot Isolation", () => {
  it("snapshots each returned case output independently across reusable objects and nested buffers", async () => {
    const reusedCode = `
const sharedArr = [0];
const sharedObj = { value: 0, arr: sharedArr };
export function solve(n: number) {
  sharedObj.value = n;
  sharedArr[0] = n * 10;
  return sharedObj;
}
`;
    const res1 = await runWashiExerciseCode(reusedCode, [1, 2]);
    expect(res1.ok).toBe(true);
    expect(res1.outputs).toEqual([
      { value: 1, arr: [10] },
      { value: 2, arr: [20] },
    ]);

    const nonCloneableCode = `
const shared = { value: 0, extra: () => 1 };
export function solve(n: number) {
  shared.value = n;
  return shared;
}
`;
    const res2 = await runWashiExerciseCode(nonCloneableCode, [3, 4]);
    expect(res2.ok).toBe(true);
    expect((res2.outputs[0] as { value: number }).value).toBe(3);
    expect((res2.outputs[1] as { value: number }).value).toBe(4);

    const accessorClassCode = `
class BakeryResult {
  croissants = 0;
  loaves = 0;
  get totalProfit() {
    return this.croissants * 40 + this.loaves * 70;
  }
}
const reusable = new BakeryResult();
export function solve(inp: { c: number; l: number }) {
  reusable.croissants = inp.c;
  reusable.loaves = inp.l;
  return reusable;
}
`;
    const res3 = await runWashiExerciseCode(accessorClassCode, [
      { c: 30, l: 20 },
      { c: 10, l: 5 },
    ]);
    expect(res3.ok).toBe(true);
    expect(res3.outputs).toEqual([
      { croissants: 30, loaves: 20, totalProfit: 2600 },
      { croissants: 10, loaves: 5, totalProfit: 750 },
    ]);

    const ownGetterCode = `
let current = 0;
const box = {};
Object.defineProperty(box, "totalProfit", {
  get() { return current; },
  enumerable: false,
});
export function solve(n: number) {
  current = n;
  return box;
}
`;
    const res4 = await runWashiExerciseCode(ownGetterCode, [2600, 3500]);
    expect(res4.ok).toBe(true);
    expect(res4.outputs).toEqual([{ totalProfit: 2600 }, { totalProfit: 3500 }]);
  });
});
