import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PROBLEMS } from "../examples/web-demo/exercises/src/problems/registry.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import {
  registerChapterExerciseSuite,
  runHighspyBatch,
} from "./helpers/exercises-chapter-harness.js";
import { renderSafeMarkdown } from "../examples/web-demo/exercises/src/ui/markdown.js";
import type { ProblemDefinition } from "../examples/web-demo/exercises/src/types.js";

const hasUv = spawnSync("uv", ["--version"], { encoding: "utf-8" }).status === 0;
const itHighspy = hasUv ? it : it.skip;

const BATTERY_MIN_SOC_LOW_FINAL_INPUT = {
  baseLoads: [10],
  prices: [1],
  demandCharge: 1,
  capacity: 10,
  minSoc: 5,
  initSoc: 10,
  minFinalSoc: 0,
  maxPower: 10,
  etaCharge: 1,
  etaDischarge: 1,
};

const EXPECTED_IDS = [
  "061",
  "062",
  "063",
  "064",
  "065",
  "066",
  "067",
  "068",
  "069",
  "070",
] as const;

const EXPECTED_RUNTIMES = Object.fromEntries(
  EXPECTED_IDS.map((id) => [id, ["washi", "highspy"] as const])
);

function extractObjective(_id: string, output: unknown): number | null {
  if (typeof output !== "object" || output === null) return null;
  const rec = output as Record<string, unknown>;
  if (typeof rec.totalCost === "number" && Number.isFinite(rec.totalCost)) {
    return rec.totalCost;
  }
  if (typeof rec.netProfit === "number" && Number.isFinite(rec.netProfit)) {
    return rec.netProfit;
  }
  return null;
}

registerChapterExerciseSuite({
  chapter: 7,
  dirName: "ch07-supply-chain-energy",
  expectedIds: EXPECTED_IDS,
  expectedRuntimes: EXPECTED_RUNTIMES,
  extractObjective,
  enforceScaffoldPolicy: true,
  checkAdversarial: async (problems: ProblemDefinition[]) => {
    // Verify all 60 Chapter 7 markdown/editorial files render without KaTeX parse errors
    for (const p of problems) {
      for (const locale of ["en", "ja", "zh"] as const) {
        const probHtml = renderSafeMarkdown(await p.loadMarkdown(locale));
        const edHtml = renderSafeMarkdown(await p.loadEditorial!(locale));
        expect(probHtml, `${p.meta.id}/${locale} problem KaTeX error`).not.toContain("katex-error");
        expect(edHtml, `${p.meta.id}/${locale} editorial KaTeX error`).not.toContain("katex-error");
      }
    }

    const byId = new Map(problems.map((p) => [p.meta.id, p]));

    // #061: setup bypass & suboptimal plan
    {
      const p = byId.get("061")!;
      const c0 = p.cases[0];
      const noSetup = {
        setups: [0, 0, 0, 0],
        production: [20, 50, 10, 40],
        inventory: [0, 0, 0, 0],
        totalCost: 1380,
      };
      expect(p.judge(c0.input, noSetup, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const subopt = {
        setups: [1, 1, 1, 1],
        production: [20, 50, 10, 40],
        inventory: [0, 0, 0, 0],
        totalCost: 720 + 20 * 10 + 50 * 12 + 10 * 10 + 40 * 14,
      };
      expect(p.judge(c0.input, subopt, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
    }

    // #062: shared machine capacity overrun & setup leak
    {
      const p = byId.get("062")!;
      const c0 = p.cases[0];
      const overload = {
        setups: [
          [1, 1, 1, 1],
          [1, 1, 1, 1],
        ],
        production: [
          [20, 30, 15, 25],
          [10, 25, 30, 15],
        ],
        inventory: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        totalCost: 1080,
      };
      // t=1 uses 12+15 + 1.5*30 + 2.0*25 = 122 > 100
      expect(p.judge(c0.input, overload, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #063: terminal backlog not cleared, lostSales > demand, and suboptimal plan
    {
      const p = byId.get("063")!;
      const c0 = p.cases[0];
      const unclearedBacklog = {
        production: [30, 30, 30, 25],
        sales: [30, 35, 30, 25],
        inventory: [5, 0, 0, 0],
        backlog: [0, 15, 5, 5],
        lostSales: [0, 0, 0, 0],
        netProfit: 22 * 120 - (300 + 360 + 300 + 275) - 1.5 * 5 - 3 * 25,
      };
      expect(p.judge(c0.input, unclearedBacklog, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const allLost = {
        production: [0, 0, 0, 0],
        sales: [0, 0, 0, 0],
        inventory: [5, 5, 5, 5],
        backlog: [0, 0, 0, 0],
        lostSales: [30, 50, 20, 25],
        netProfit: -1.5 * 20 - 5 * 125,
      };
      expect(p.judge(c0.input, allLost, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
    }

    // #064: lead-time violation & non-integer production
    {
      const p = byId.get("064")!;
      const c0 = p.cases[0];
      const badTiming = {
        setups: [
          [0, 0, 1, 1, 1],
          [0, 1, 1, 1, 0],
          [0, 1, 1, 1, 0],
        ],
        production: [
          [0, 0, 10, 15, 12],
          [0, 20, 30, 24, 0],
          [0, 60, 90, 72, 0],
        ],
        inventory: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        totalCost: 2000,
      };
      // Item 0 released at t=2 doesn't arrive until t=3, violating t=2 balance
      expect(p.judge(c0.input, badTiming, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const fracProd = {
        setups: [
          [0, 1, 1, 0, 0],
          [1, 1, 0, 0, 0],
          [1, 1, 0, 0, 0],
        ],
        production: [
          [0, 10.5, 26.5, 0, 0],
          [21, 53, 0, 0, 0],
          [63, 159, 0, 0, 0],
        ],
        inventory: [
          [0, 0, 0.5, 12, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        totalCost: 1936,
      };
      expect(p.judge(c0.input, fracProd, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #065: DC flow conservation break & closed plant shipment
    {
      const p = byId.get("065")!;
      const c0 = p.cases[0];
      const brokenDcFlow = {
        openPlants: [1, 1],
        openDcs: [1, 0, 1],
        plantToDc: [
          [65, 0, 0],
          [0, 0, 60],
        ],
        dcToCustomer: [
          [30, 40, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 35, 25],
        ],
        totalCost: 2335,
      };
      expect(p.judge(c0.input, brokenDcFlow, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #066: time-sync violation & door capacity violation
    {
      const p = byId.get("066")!;
      const c0 = p.cases[0];
      const earlyDeparture = {
        inDoor: [0, 1, 1],
        outDoor: [1, 1, 0],
        flows: [
          [
            [0, 0],
            [0, 0],
            [20, 15],
          ],
          [
            [15, 5],
            [0, 20],
            [0, 0],
          ],
          [
            [0, 10],
            [25, 0],
            [0, 0],
          ],
        ],
        departures: [4, 5, 3], // outbound 0 receives from inbound 1 (arr=3, tt=2 -> min 5)
        totalCost: 220,
      };
      expect(p.judge(c0.input, earlyDeparture, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const doorOverflow = {
        inDoor: [1, 1, 1], // 3 trucks on door 1 > cap 2
        outDoor: [1, 1, 0],
        flows: earlyDeparture.flows,
        departures: [5, 5, 3],
        totalCost: 220,
      };
      expect(p.judge(c0.input, doorOverflow, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #067: single-supplier share cap breach & min-order breach
    {
      const p = byId.get("067")!;
      const c0 = p.cases[0];
      const shareBreach = {
        active: [0, 0, 1, 1],
        allocations: [
          [0, 0, 0],
          [0, 0, 0],
          [70, 48, 72], // 70 > 0.6 * 100 = 60
          [30, 32, 48],
        ],
        totalCost: 4734,
      };
      expect(p.judge(c0.input, shareBreach, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const minOrderBreach = {
        active: [1, 0, 1, 1],
        allocations: [
          [10, 0, 0], // 10 < minOrders[0] = 60
          [0, 0, 0],
          [40, 48, 72],
          [50, 32, 48],
        ],
        totalCost: 4934,
      };
      expect(p.judge(c0.input, minOrderBreach, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #068: ramp breach, minUp breach, and minDown breach
    {
      const p = byId.get("068")!;
      const c0 = p.cases[0];
      const minUpBreach = {
        commitment: [
          [1, 1, 1, 1, 1, 1],
          [1, 0, 1, 1, 1, 0], // gen 1 minUp=2 violated at t=0..1, and minDown=2 violated at t=1..2
          [0, 1, 0, 1, 0, 0],
        ],
        generation: [
          [80, 95, 110, 110, 110, 100],
          [0, 0, 50, 70, 40, 0],
          [0, 25, 0, 10, 0, 0],
        ],
        totalCost: 19000,
      };
      expect(p.judge(c0.input, minUpBreach, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const rampBreach = {
        commitment: [
          [1, 1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1, 0],
          [0, 0, 0, 1, 0, 0],
        ],
        generation: [
          [40, 95, 110, 110, 110, 100], // 40 -> 95 is +55 > rampLimit 45
          [40, 25, 50, 70, 40, 0],
          [0, 0, 0, 10, 0, 0],
        ],
        totalCost: 19790,
      };
      expect(p.judge(c0.input, rampBreach, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #069: simultaneous charge/discharge, terminal SOC short, & peak underestimate
    {
      const p = byId.get("069")!;
      const c0 = p.cases[0];
      const simChgDis = {
        charge: [30, 30, 10, 0, 0, 25],
        discharge: [0, 0, 10, 30, 24.4, 0],
        soc: [54, 78, 73.5, 36, 5.5, 25.5],
        peakLoad: 80,
        totalCost: 733.968,
      };
      expect(p.judge(c0.input, simChgDis, c0.expectedOptimal, "en").status).toBe("VIOLATION");

      const lowPeakClaim = {
        charge: [30, 30, 0, 0, 0, 25],
        discharge: [0, 0, 0, 30, 24.4, 0],
        soc: [54, 78, 78, 40.5, 10, 30],
        peakLoad: 75, // actual grid load hits 80
        totalCost: 693.968,
      };
      expect(p.judge(c0.input, lowPeakClaim, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #070: terminal SOC below initSoc & coupled grid load peak violation
    {
      const p = byId.get("070")!;
      const c0 = p.cases[0];
      const lowTerminalSoc = {
        setups: [1, 0, 1, 0],
        production: [55, 0, 55, 0],
        inventory: [35, 0, 30, 0],
        charge: [0, 0, 0, 0],
        discharge: [0, 10, 0, 6],
        soc: [20, 7.5, 7.5, 0], // < initSoc 20
        peakLoad: 84,
        totalCost: 1300,
      };
      expect(p.judge(c0.input, lowTerminalSoc, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    }

    // #069: minSoc must still hold in final period even when minFinalSoc < minSoc (WaSHI)
    {
      const p069 = byId.get("069")!;
      const run69 = await runWashiExerciseCode(p069.washiSolution, [
        structuredClone(BATTERY_MIN_SOC_LOW_FINAL_INPUT),
      ]);
      expect(run69.ok).toBe(true);
      const out = run69.outputs[0] as { soc: number[]; totalCost: number };
      expect(out.soc[0]).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(out.totalCost).toBeCloseTo(10, 6);
      expect(p069.judge(BATTERY_MIN_SOC_LOW_FINAL_INPUT, out, 10, "en").status).toBe("AC");
    }

    // Shape-before-violation RUNTIME_ERROR checks across Ch7 judges (#062, #064, #065, #066, #067, #068)
    for (const id of ["062", "064"] as const) {
      const p = byId.get(id)!;
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          { setups: [[-1, 0, 0, 0, 0]], production: [[0, 0, 0, 0, 0]], inventory: [[0, 0, 0, 0, 0]], totalCost: 0 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
    {
      const p065 = byId.get("065")!;
      const c0 = p065.cases[0];
      expect(
        p065.judge(
          c0.input,
          {
            openPlants: [1, 1],
            openDcs: [1, 1, 1],
            plantToDc: [[-5, 0, 0], [0, 0, 0]],
            dcToCustomer: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0]],
            totalCost: 0,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
    {
      const p066 = byId.get("066")!;
      const c0 = p066.cases[0];
      expect(
        p066.judge(
          c0.input,
          {
            inDoor: [0, 0, 0],
            outDoor: [0, 0, 0],
            flows: [
              [[-1, 0], [0, 0], [0, 0]],
              [[0, 0], [0, 0], [0, 0]],
              [[0, 0], [0, 0], [0, 0]],
            ],
            departures: [0, 0],
            totalCost: 0,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
    {
      const p067 = byId.get("067")!;
      const c0 = p067.cases[0];
      expect(
        p067.judge(
          c0.input,
          {
            active: [0, 0, 0, 0],
            allocations: [[-1, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
            totalCost: Number.NaN,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
    {
      const p068 = byId.get("068")!;
      const c0 = p068.cases[0];
      expect(
        p068.judge(
          c0.input,
          {
            commitment: [[2, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
            generation: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
            totalCost: Number.NaN,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
  },
});

describe("Exercises Chapter 7 Python parity (#069 minFinalSoc)", () => {
  const p069 = PROBLEMS.find((p) => p.meta.chapter === 7 && p.meta.id === "069")!;

  itHighspy("enforces max(minSoc, minFinalSoc) in final period in PuLP solution.py", () => {
    const batch = runHighspyBatch([
      { id: "069_minsoc", code: p069.highspySolution, inputs: [BATTERY_MIN_SOC_LOW_FINAL_INPUT] },
    ]);
    expect(batch["069_minsoc"].ok).toBe(true);
    const out = batch["069_minsoc"].outputs![0] as { soc: number[]; totalCost: number };
    expect(out.soc[0]).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(out.totalCost).toBeCloseTo(10, 6);
    expect(p069.judge(BATTERY_MIN_SOC_LOW_FINAL_INPUT, out, 10, "en").status).toBe("AC");
  });
});
