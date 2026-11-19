import { describe, it, expect } from "vitest";
import { transpileExerciseTsToJs } from "../examples/web-demo/exercises/src/runner/ts-transpile.js";
import {
  PROGRESS_STORAGE_KEY,
  createEmptyProgress,
  loadProgress,
  saveProgress,
  recordSolvedProblem,
  saveDraft,
  countMainSolved,
  getStarLevel,
  getNextRecommendedProblemId,
  exportProgressJson,
  importProgressJson,
} from "../examples/web-demo/exercises/src/store/progress.js";
import {
  renderSafeMarkdown,
  parseProblemMarkdown,
} from "../examples/web-demo/exercises/src/ui/markdown.js";

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
const f = (x: number): (number) => x + 1;
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
});

describe("Exercises Platform — Progress Store (localStorage v1)", () => {
  const sampleProblems = [
    { id: "T1", chapter: 0 },
    { id: "T2", chapter: 0 },
    { id: "001", chapter: 1 },
    { id: "002", chapter: 1 },
    { id: "003", chapter: 1 },
  ];

  it("excludes tutorial problems (T1, T2) from main problem count and tracks 1-star vs 2-star mastery", () => {
    let state = createEmptyProgress();
    expect(countMainSolved(state, sampleProblems)).toBe(0);
    expect(getStarLevel(state, "T1")).toBe(0);
    expect(getNextRecommendedProblemId(state, sampleProblems)).toBe("001");

    state = recordSolvedProblem(state, "T1", "washi", 12, "2026-11-19T00:00:00Z");
    state = recordSolvedProblem(state, "T2", "highspy", 45, "2026-11-19T00:01:00Z");
    expect(countMainSolved(state, sampleProblems)).toBe(0);
    expect(getStarLevel(state, "T1")).toBe(1);
    expect(getNextRecommendedProblemId(state, sampleProblems)).toBe("001");

    state = recordSolvedProblem(state, "001", "washi", 15, "2026-11-19T00:02:00Z");
    expect(countMainSolved(state, sampleProblems)).toBe(1);
    expect(getStarLevel(state, "001")).toBe(1);
    expect(getNextRecommendedProblemId(state, sampleProblems)).toBe("002");

    state = recordSolvedProblem(state, "001", "highspy", 10, "2026-11-19T00:03:00Z");
    expect(countMainSolved(state, sampleProblems)).toBe(1);
    expect(getStarLevel(state, "001")).toBe(2);
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
