import { describe, expect, it } from "vitest";
import {
  MAX_STARTER_COMMENT_LINES,
  checkScaffoldPolicy,
  extractPyComments,
  extractTsComments,
  scaffoldTierForChapter,
  type ScaffoldPolicyInput,
} from "./helpers/exercises-scaffold-policy.js";

const goodSections = {
  en: { hint1: "Think about which quantities you decide.", hint2: "Each item goes to one bin.", formulation: "" },
};

const scratchTs = `import { Model } from "@ohtaman/washi";

export interface P061Input {
  demands: number[];
}

export interface P061Output {
  totalCost: number;
}

export async function solve(input: P061Input): Promise<P061Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
`;

const scratchPy = `import pulp


def solve(input_data: dict) -> dict:
    """Return {"totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
`;

function base(overrides: Partial<ScaffoldPolicyInput>): ScaffoldPolicyInput {
  return {
    id: "061",
    chapter: 7,
    scaffold: "scratch",
    washiStarter: scratchTs,
    highspyStarter: scratchPy,
    sections: goodSections,
    ...overrides,
  };
}

describe("exercise scaffolding & hint-ladder policy", () => {
  it("maps chapters to monotonically decreasing scaffolding tiers", () => {
    expect(scaffoldTierForChapter(2)).toBe("guided");
    expect(scaffoldTierForChapter(3)).toBe("fill-in");
    expect(scaffoldTierForChapter(5)).toBe("fill-in");
    expect(scaffoldTierForChapter(6)).toBe("scratch");
    expect(scaffoldTierForChapter(10)).toBe("scratch");
  });

  it("accepts a compliant scratch exercise with both runtimes", () => {
    expect(checkScaffoldPolicy(base({}))).toEqual([]);
  });

  it("extracts TS line/block comments but ignores URLs inside strings", () => {
    const src = `const url = "https://example.com"; // keep demand met\n/* block\n * second line\n */\nconst x = 1;`;
    expect(extractTsComments(src)).toEqual(["block", "second line", "keep demand met"]);
  });

  it("extracts Python full-line and trailing comments but not '#' inside strings", () => {
    const src = `name = "set_#1"\nx = 1  # trailing note\n    # TODO: model it`;
    expect(extractPyComments(src)).toEqual(["trailing note", "TODO: model it"]);
  });

  it("rejects formula-level TODO recipes in WaSHI and PuLP starters", () => {
    const ts = scratchTs.replace(
      "// TODO: Build and solve the model, then return the output.",
      "// TODO: sum(assign[i]) == 1 for every item"
    );
    const py = scratchPy.replace(
      "# TODO: Build and solve the model, then return the output.",
      "# TODO: pulp.lpSum(x) <= cap"
    );
    const errors = checkScaffoldPolicy(base({ washiStarter: ts, highspyStarter: py }));
    expect(errors.some((e) => e.includes("washi/starter.ts") && e.includes("reveals a formula"))).toBe(true);
    expect(errors.some((e) => e.includes("highspy/starter.py") && e.includes("reveals a formula"))).toBe(true);
  });

  it(`rejects more than ${MAX_STARTER_COMMENT_LINES} comment lines`, () => {
    const ts = scratchTs.replace(
      "// TODO: Build and solve the model, then return the output.",
      "// TODO:\n  // 1. Declare variables\n  // 2. Add constraints\n  // 3. Optimize"
    );
    const errors = checkScaffoldPolicy(base({ washiStarter: ts, highspyStarter: "" }));
    expect(errors).toEqual([expect.stringContaining("at most 3 comment lines allowed (found 4)")]);
  });

  it("allows predeclared variables in Chapter 2 but rejects them from Chapter 3", () => {
    const ts = `export interface P013Input { n: number }
export interface P013Output { total: number }
export async function solve(input: P013Input): Promise<P013Output> {
  const m = new Model("x");
  const pick = m.binary(input.n, { prefix: "pick" });
  // TODO: Pick items within the limit and return the total.
  throw new Error("Not implemented");
}
`;
    const py = `import pulp


def solve(input_data: dict) -> dict:
    """Return {"total": float}."""
    prob = pulp.LpProblem("x", pulp.LpMaximize)
    pick = [pulp.LpVariable(f"p_{i}", cat=pulp.LpBinary) for i in range(3)]
    raise NotImplementedError
`;
    expect(checkScaffoldPolicy(base({ chapter: 2, scaffold: "fill-in", washiStarter: ts, highspyStarter: py }))).toEqual(
      []
    );
    const ch3 = checkScaffoldPolicy(base({ chapter: 3, scaffold: "fill-in", washiStarter: ts, highspyStarter: py }));
    expect(ch3).toEqual([
      expect.stringContaining("washi/starter.ts: Chapter 3 starters must not predeclare decision variables"),
      expect.stringContaining("highspy/starter.py: Chapter 3 starters must not predeclare decision variables"),
    ]);
  });

  it("requires scratch scaffolds from Chapter 6 with an empty solve() body", () => {
    const fillInTs = scratchTs.replace(
      "  // TODO: Build and solve the model, then return the output.",
      '  const m = new Model("x");\n  // TODO: Build and solve the model.'
    );
    const errors = checkScaffoldPolicy(base({ chapter: 6, scaffold: "fill-in", washiStarter: fillInTs, highspyStarter: "" }));
    expect(errors).toContain('#061: Chapter 6 exercises must use meta.scaffold "scratch" (received "fill-in").');

    const scratchErrors = checkScaffoldPolicy(base({ washiStarter: fillInTs, highspyStarter: "" }));
    expect(scratchErrors).toEqual([
      "#061 washi/starter.ts: scratch starters must not construct a model.",
      "#061 washi/starter.ts: scratch solve() body must contain only TODO comments and a not-implemented throw.",
    ]);
  });

  it("allows non-modeling helpers outside solve() in scratch starters", () => {
    const ts = scratchTs.replace(
      "export async function solve",
      "function key(i: number, j: number): string {\n  return `${i}-${j}`;\n}\n\nexport async function solve"
    );
    expect(checkScaffoldPolicy(base({ washiStarter: ts }))).toEqual([]);
  });

  it("requires hint1 and hint2 in every locale, without fenced code or problem-tab formulations", () => {
    const errors = checkScaffoldPolicy(
      base({
        sections: {
          en: { hint1: "", hint2: "```ts\nm.solve()\n```", formulation: "" },
          ja: { hint1: "a", hint2: "b", formulation: "$$x$$" },
        },
      })
    );
    expect(errors).toEqual([
      "#061 (en): missing <!-- section:hint1 -->.",
      "#061 (en) hint2: hints must not contain fenced code blocks.",
      "#061 (ja): keep the full formulation in the Editorial tab, not section:formulation.",
    ]);
  });
});
