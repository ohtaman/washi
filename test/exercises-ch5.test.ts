import { expect } from "vitest";
import { UI_STRINGS } from "../examples/web-demo/exercises/src/i18n/ui-strings.js";
import { applySolverStatusToVerdict } from "../examples/web-demo/exercises/src/problems/judge-helpers.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import type { ProblemDefinition } from "../examples/web-demo/exercises/src/types.js";
import { parseProblemMarkdown, renderSafeMarkdown } from "../examples/web-demo/exercises/src/ui/markdown.js";
import { registerChapterExerciseSuite } from "./helpers/exercises-chapter-harness.js";

const EXPECTED_IDS = [
  "041",
  "042",
  "043",
  "044",
  "045",
  "046",
  "047",
  "048",
  "049",
  "050",
] as const;

const EXPECTED_RUNTIMES = Object.fromEntries(
  EXPECTED_IDS.map((id) => [id, ["washi"] as const])
);

function extractObjective(id: string, output: unknown): number | null {
  const rec = output as Record<string, unknown>;
  switch (id) {
    case "041":
      return rec.satisfiable ? 1 : 0;
    case "042":
      return rec.satisfiable ? (rec.unique ? 1 : 2) : 0;
    case "043":
      return rec.feasible ? (rec.installedCount as number) : -1;
    case "044":
      return rec.hasViolation ? 1 : 0;
    case "045":
      return (rec.deadRules as string[]).length + (rec.redundantRules as string[]).length;
    case "046":
      return null; // Subset-minimal MUS size is not restricted to a single cardinality
    case "047":
      return rec.totalPenalty as number;
    case "048":
      return (rec.violatedRules as string[]).length;
    case "049":
      return rec.totalCost as number;
    case "050":
      return rec.repairCost as number;
    default:
      return null;
  }
}

async function checkCh05Adversarial(problems: ProblemDefinition[]): Promise<void> {
  const byId = new Map(problems.map((p) => [p.meta.id, p]));
  const statusMsgs = UI_STRINGS.en.results.solverStatus;

  // #042: Uniqueness-cut dishonesty rejection
  const p042 = byId.get("042")!;
  // 1) Claiming unique=true when multiple solutions exist (case[1])
  const multiRun = await runWashiExerciseCode(
    p042.washiSolution.replace("unique: second.status === \"Unsat\"", "unique: true"),
    [structuredClone(p042.cases[1].input)]
  );
  expect(multiRun.ok).toBe(true);
  const v42DishonestUnique = applySolverStatusToVerdict(
    p042.judge(p042.cases[1].input, multiRun.outputs[0], p042.cases[1].expectedOptimal, "en"),
    multiRun.metrics[0]?.solverStatus,
    statusMsgs
  );
  expect(v42DishonestUnique.ok).toBe(false);
  expect(v42DishonestUnique.status).toBe("VIOLATION");

  // 2) Claiming unique=false on a provably unique case (case[0])
  const v42DishonestNonUnique = p042.judge(
    p042.cases[0].input,
    {
      satisfiable: true,
      assignment: { a: true, b: true, c: false, d: true },
      unique: false,
    },
    p042.cases[0].expectedOptimal,
    "en"
  );
  expect(v42DishonestNonUnique.ok).toBe(false);
  expect(v42DishonestNonUnique.status).toBe("VIOLATION");

  // #043: Suboptimal package count rejection
  const p043 = byId.get("043")!;
  const subopt43 = p043.judge(
    p043.cases[1].input,
    {
      feasible: true,
      selected: {
        cli: "1.0",
        core: "2.0",
        logger: "1.0",
        telemetry: "1.0",
        plugin: null,
      },
      installedCount: 4,
    },
    p043.cases[1].expectedOptimal,
    "en"
  );
  expect(subopt43.status).toBe("SUBOPTIMAL");

  // #044: Counterexample that actually satisfies safeInvariant must be rejected with VIOLATION
  const p044 = byId.get("044")!;
  const fakeCe44 = p044.judge(
    p044.cases[0].input,
    {
      hasViolation: true,
      counterexample: {
        isAdmin: true,
        mfaVerified: true,
        external: true,
        allowSsh: true,
        portTier: 1,
      },
    },
    p044.cases[0].expectedOptimal,
    "en"
  );
  expect(fakeCe44.status).toBe("VIOLATION");

  // #046: Non-minimal unsat core rejection (VIOLATION)
  const p046 = byId.get("046")!;
  // Case 0 has unique MUS ["R1", "R2", "R4"]; adding decoy "R3" or returning all rules is non-minimal
  const nonMin46 = p046.judge(
    p046.cases[0].input,
    { coreRules: ["R1", "R2", "R3", "R4"] },
    p046.cases[0].expectedOptimal,
    "en"
  );
  expect(nonMin46.ok).toBe(false);
  expect(nonMin46.status).toBe("VIOLATION");

  // Also test shortcut non-minimal core in Case 2: ["R1", "R2", "R3", "R4", "R5"] is non-minimal
  const nonMin46Case2 = p046.judge(
    p046.cases[2].input,
    { coreRules: ["R1", "R2", "R3", "R4", "R5"] },
    p046.cases[2].expectedOptimal,
    "ja"
  );
  expect(nonMin46Case2.status).toBe("VIOLATION");

  // #048: Missed-violation rejection (both direct judge and runWashiExerciseCode + applySolverStatusToVerdict)
  const p048 = byId.get("048")!;
  const missed48Direct = p048.judge(
    p048.cases[2].input,
    { valid: true, violatedRules: [] },
    p048.cases[2].expectedOptimal,
    "en"
  );
  expect(missed48Direct.ok).toBe(false);
  expect(missed48Direct.status).toBe("VIOLATION");

  const partialMissed48 = await runWashiExerciseCode(
    p048.washiSolution.replace(
      "const violatedRules = Array.from(new Set(report.violations.map((v) => v.name))).sort();",
      "const violatedRules = report.violations.slice(0, 1).map((v) => v.name);"
    ),
    [structuredClone(p048.cases[2].input)]
  );
  expect(partialMissed48.ok).toBe(true);
  const v48Partial = applySolverStatusToVerdict(
    p048.judge(p048.cases[2].input, partialMissed48.outputs[0], p048.cases[2].expectedOptimal, "en"),
    partialMissed48.metrics[0]?.solverStatus,
    statusMsgs
  );
  expect(v48Partial.status).toBe("VIOLATION");

  // #049: Blackout overlap rejection and suboptimal schedule rejection
  const p049 = byId.get("049")!;
  const blackoutOverlap49 = p049.judge(
    p049.cases[0].input,
    {
      express: [false, true],
      startTimes: [0, 2.5],
      endTimes: [2.5, 3.5],
      totalCost: 21,
    },
    p049.cases[0].expectedOptimal,
    "en"
  );
  expect(blackoutOverlap49.status).toBe("VIOLATION");

  // #050: Non-minimal core rejection and suboptimal repair rejection
  const p050 = byId.get("050")!;
  const nonMin50 = p050.judge(
    p050.cases[0].input,
    {
      consistent: false,
      minimalCore: ["H1", "H2", "H3", "S1", "S2"],
      relaxedRules: ["S2"],
      repairCost: 2,
      repairedAssignment: {
        prod: true,
        mfa: true,
        legacy: false,
        audit: true,
        tier: 2,
      },
    },
    p050.cases[0].expectedOptimal,
    "en"
  );
  expect(nonMin50.status).toBe("VIOLATION");

  const subopt50 = p050.judge(
    p050.cases[0].input,
    {
      consistent: false,
      minimalCore: ["H1", "H2", "S1", "S2"],
      relaxedRules: ["S1"],
      repairCost: 6,
      repairedAssignment: {
        prod: false,
        mfa: false,
        legacy: true,
        audit: true,
        tier: 1,
      },
    },
    p050.cases[0].expectedOptimal,
    "en"
  );
  expect(subopt50.status).toBe("SUBOPTIMAL");

  // Markdown table integrity across #041-#050 (no truncated pipe cells in EN/JA/ZH) & #042 no-spoiler check
  for (const prob of problems) {
    for (const locale of ["en", "ja", "zh"] as const) {
      const md = await prob.loadMarkdown(locale);
      const html = renderSafeMarkdown(md);
      expect(html).not.toContain("<td></td>");
      if (prob.meta.id === "042") {
        const parsed = parseProblemMarkdown(md);
        expect(parsed.scenario).not.toContain("no-good");
        expect(parsed.scenario).not.toContain("No-Good");
        expect(parsed.example).not.toContain("no-good");
        expect(parsed.example).not.toContain("No-Good");
        expect(parsed.example).not.toContain("or(not(");
      }
    }
  }
  const rendered41En = renderSafeMarkdown(await byId.get("041")!.loadMarkdown("en"));
  expect(rendered41En).toContain("Valid Boolean assignment for every variable");
  const rendered43En = renderSafeMarkdown(await p043.loadMarkdown("en"));
  expect(rendered43En).toContain("Chosen version per package");
  expect(rendered43En).toContain("Minimized count of installed packages");

  // Shape-before-violation RUNTIME_ERROR checks on #041, #042, #043
  const p041 = byId.get("041")!;
  expect(
    p041.judge(p041.cases[0].input, { satisfiable: true, assignment: { badge: "yes" } }, 1, "en").status
  ).toBe("RUNTIME_ERROR");
  expect(
    p042.judge(p042.cases[0].input, { satisfiable: true, unique: true, assignment: null }, 1, "en").status
  ).toBe("RUNTIME_ERROR");
  expect(
    p043.judge(
      p043.cases[0].input,
      {
        feasible: true,
        selected: { app: "99.0", http: 123, tls: null, legacy: null },
        installedCount: 1,
      },
      p043.cases[0].expectedOptimal,
      "en"
    ).status
  ).toBe("RUNTIME_ERROR");
  expect(
    p044.judge(
      p044.cases[2].input,
      {
        hasViolation: true,
        counterexample: {
          isPaid: true,
          isInternal: false,
          throttled: false,
          allowBurst: false,
          reqLevel: 0.5,
        },
      },
      p044.cases[2].expectedOptimal,
      "en"
    ).status
  ).toBe("RUNTIME_ERROR");
  expect(
    p050.judge(
      p050.cases[3].input,
      {
        consistent: true,
        minimalCore: [],
        relaxedRules: [],
        repairCost: 0,
        repairedAssignment: {
          vip: true,
          fast: true,
          strict: false,
          x: 1.5,
        },
      },
      p050.cases[3].expectedOptimal,
      "en"
    ).status
  ).toBe("RUNTIME_ERROR");
}

registerChapterExerciseSuite({
  chapter: 5,
  dirName: "ch05-propositional-smt-diagnosis",
  expectedIds: EXPECTED_IDS,
  expectedRuntimes: EXPECTED_RUNTIMES,
  usesZ3: true,
  extractObjective,
  checkAdversarial: checkCh05Adversarial,
  enforceScaffoldPolicy: true,
  timeoutMs: 180_000,
});
