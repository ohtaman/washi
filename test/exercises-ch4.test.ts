import { expect } from "vitest";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import { renderSafeMarkdown } from "../examples/web-demo/exercises/src/ui/markdown.js";
import { registerChapterExerciseSuite } from "./helpers/exercises-chapter-harness.js";

const EXPECTED_IDS = [
  "031",
  "032",
  "033",
  "034",
  "035",
  "036",
  "037",
  "038",
  "039",
  "040",
] as const;

const EXPECTED_RUNTIMES = Object.fromEntries(
  EXPECTED_IDS.map((id) => [id, ["washi"] as const])
);

function extractObjective(id: string, output: unknown): number | null {
  if (id === "039") return null;
  const rec = output as Record<string, unknown>;
  for (const key of ["totalCost", "totalDistance", "makespan", "height", "usedColors"]) {
    if (typeof rec[key] === "number" && Number.isFinite(rec[key])) {
      return rec[key] as number;
    }
  }
  throw new Error(`Missing numeric objective for #${id}: ${JSON.stringify(output)}`);
}

registerChapterExerciseSuite({
  chapter: 4,
  dirName: "ch04-constraint-programming",
  expectedIds: EXPECTED_IDS,
  expectedRuntimes: EXPECTED_RUNTIMES,
  enforceScaffoldPolicy: true,
  extractObjective,
  checkAdversarial: async (problems) => {
    for (const prob of problems) {
      // Every Chapter 4 starter & solution should use auto-registered Pumpkin CP without extra import
      expect(prob.washiStarter).not.toContain('import "@ohtaman/washi/solvers/pumpkin"');
      expect(prob.washiStarter).toContain('solve({ solver: "pumpkin" })');
      expect(prob.washiSolution).not.toContain('import "@ohtaman/washi/solvers/pumpkin"');
      expect(prob.washiSolution).toContain('solve({ solver: "pumpkin" })');

      // Execution speed check: 5-case run must complete cleanly in under 2 seconds
      const inputs = prob.cases.map((c) => structuredClone(c.input));
      const runRes = await runWashiExerciseCode(prob.washiSolution, inputs);
      expect(runRes.ok, `#${prob.meta.id} speed run failed: ${runRes.error}`).toBe(true);
      expect(
        runRes.runTimeMs,
        `#${prob.meta.id} exceeded 2000ms budget (${runRes.runTimeMs.toFixed(1)}ms)`
      ).toBeLessThan(2000);
    }

    const byId = Object.fromEntries(problems.map((p) => [p.meta.id, p]));

    // #031: weighted N-Queens -> RUNTIME_ERROR / VIOLATION / SUBOPTIMAL / AC
    const p31 = byId["031"];
    for (const locale of ["en", "ja", "zh"] as const) {
      const rendered = renderSafeMarkdown(await p31.loadMarkdown(locale));
      expect(rendered).toContain("<code>costMatrix[r][c]</code>");
    }
    expect(
      p31.judge(p31.cases[0].input, { cols: [1, 3, 0], totalCost: 8 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("RUNTIME_ERROR");
    expect(
      p31.judge(p31.cases[0].input, { cols: [1, 3, 0, NaN], totalCost: 8 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("RUNTIME_ERROR");
    expect(
      p31.judge(p31.cases[0].input, { cols: [1, 1, 0, 2], totalCost: 8 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p31.judge(p31.cases[0].input, { cols: [0, 2, 1, 3], totalCost: 26 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p31.judge(p31.cases[0].input, { cols: [2, 0, 3, 1], totalCost: 28 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("SUBOPTIMAL");
    expect(
      p31.judge(p31.cases[0].input, { cols: [1, 3, 0, 2], totalCost: 8 }, p31.cases[0].expectedOptimal, "en").status
    ).toBe("AC");

    // #032: broken distinct assignment -> VIOLATION; valid suboptimal -> SUBOPTIMAL
    const p32 = byId["032"];
    expect(
      p32.judge(p32.cases[0].input, { assignment: [0, 0, 1], totalCost: 36 }, p32.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p32.judge(p32.cases[0].input, { assignment: [1, 2, 0], totalCost: 56 }, p32.cases[0].expectedOptimal, "en").status
    ).toBe("SUBOPTIMAL");

    // #033: forbidden tuple / invalid allowed tuple -> VIOLATION
    const p33 = byId["033"];
    expect(
      p33.judge(p33.cases[0].input, { choices: [0, 1, 0], totalCost: 33 }, p33.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p33.judge(p33.cases[0].input, { choices: [0, 0, 1], totalCost: 32 }, p33.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // #034: disjoint subtours (0<->1, 2<->3) -> VIOLATION
    const p34 = byId["034"];
    expect(
      p34.judge(p34.cases[0].input, { next: [1, 0, 3, 2], totalDistance: 8 }, p34.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // #035: overlapping tasks on same machine -> VIOLATION
    const p35 = byId["035"];
    expect(
      p35.judge(p35.cases[0].input, { starts: [0, 2, 0, 4], makespan: 6 }, p35.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // #036: cumulative peak demand exceeded -> VIOLATION
    const p36 = byId["036"];
    expect(
      p36.judge(p36.cases[0].input, { starts: [0, 0, 0, 4], makespan: 6 }, p36.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // #037: overlapping rectangles -> VIOLATION; out-of-strip -> VIOLATION
    const p37 = byId["037"];
    expect(
      p37.judge(p37.cases[0].input, { x: [0, 0, 0], y: [0, 0, 0], height: 4 }, p37.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p37.judge(p37.cases[0].input, { x: [4, 0, 0], y: [0, 0, 0], height: 4 }, p37.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // #038: graph coloring -> RUNTIME_ERROR / VIOLATION / SUBOPTIMAL / AC
    const p38 = byId["038"];
    expect(
      p38.judge(p38.cases[0].input, { colors: [0, 1, 2, 0], usedColors: 3 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("RUNTIME_ERROR");
    expect(
      p38.judge(p38.cases[0].input, { colors: [0, 0, 1, 0, 1], usedColors: 2 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p38.judge(p38.cases[0].input, { colors: [0, 1, 2, 0, 2], usedColors: 2 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p38.judge(p38.cases[0].input, { colors: [0, 1, 2, 3, 0], usedColors: 4 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("SUBOPTIMAL");
    expect(
      p38.judge(p38.cases[0].input, { colors: [0, 1, 2, 0, 2], usedColors: 3 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("AC");
    expect(
      p38.judge(p38.cases[0].input, { colors: [2, 0, 1, 2, 1], usedColors: 3 }, p38.cases[0].expectedOptimal, "en").status
    ).toBe("AC");

    // #039: duplicate row/col or wrong cage sum -> VIOLATION
    const p39 = byId["039"];
    expect(
      p39.judge(
        p39.cases[0].input,
        {
          grid: [
            [1, 2, 3, 4],
            [3, 4, 1, 2],
            [2, 1, 4, 3],
            [4, 3, 2, 2],
          ],
        },
        0,
        "en"
      ).status
    ).toBe("VIOLATION");
    expect(
      p39.judge(
        p39.cases[0].input,
        {
          grid: [
            [1, 3, 2, 4],
            [3, 4, 1, 2],
            [2, 1, 4, 3],
            [4, 2, 3, 1],
          ],
        },
        0,
        "en"
      ).status
    ).toBe("VIOLATION");
    expect(
      p39.judge(
        p39.cases[0].input,
        {
          grid: [[9, 2, 3, 4], null, [1, 2, 3, 4], [1, 2, 3, 4]],
        },
        0,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");

    // #040: machine overlap / power overflow / forbidden mode pair -> VIOLATION
    const p40 = byId["040"];
    expect(
      p40.judge(p40.cases[0].input, { starts: [0, 0, 4, 8], modes: [0, 0, 0, 1], makespan: 11 }, p40.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p40.judge(p40.cases[0].input, { starts: [4, 0, 0, 8], modes: [1, 0, 0, 1], makespan: 10 }, p40.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p40.judge(p40.cases[0].input, { starts: [4, 0, 4, 9], modes: [1, 0, 1, 1], makespan: 11 }, p40.cases[0].expectedOptimal, "en").status
    ).toBe("VIOLATION");
  },
});
