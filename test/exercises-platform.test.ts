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
