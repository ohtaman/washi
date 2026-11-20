import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  checkIntegrality,
  expectFiniteNumber,
  expectNumericArray,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P090Input {
  fixedCosts: number[];
  capacities: number[];
  dropAmounts: number[];
  gamma: number;
  robustMinCap: number;
  probs: number[];
  demands: number[];
  offline: number[][];
  disruptionCost: number;
  shortfallPenalty: number;
}

export interface P090Output {
  committed: number[];
  recovered: number[][];
  totalCost: number;
}

function worstCaseCapDrop(dropAmounts: number[], y: number[], gamma: number): number {
  const impacts = y.map((bit, j) => dropAmounts[j] * bit).sort((a, b) => b - a);
  const full = Math.floor(gamma);
  const frac = gamma - full;
  let drop = 0;
  for (let k = 0; k < Math.min(full, impacts.length); k++) {
    drop += impacts[k];
  }
  if (frac > 1e-12 && full < impacts.length) {
    drop += frac * impacts[full];
  }
  return drop;
}

export function judge(
  input: P090Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.fixedCosts.length;
  const S = input.probs.length;

  const commRaw = expectNumericArray(
    output.committed,
    n,
    { en: "committed", ja: "committed", zh: "committed" },
    locale
  );
  if (typeof commRaw === "string") return runtimeError(commRaw);

  if (!Array.isArray(output.recovered) || output.recovered.length !== S) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: S }));
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const recoveredRows: number[][] = [];
  for (let s = 0; s < S; s++) {
    const recRaw = expectNumericArray(
      output.recovered[s],
      n,
      { en: `recovered[${s}]`, ja: `recovered[${s}]`, zh: `recovered[${s}]` },
      locale
    );
    if (typeof recRaw === "string") return runtimeError(recRaw);
    recoveredRows.push(recRaw);
  }

  const yClean: number[] = [];
  let fixedSum = 0;
  let nomCap = 0;
  for (let j = 0; j < n; j++) {
    const val = commRaw[j];
    if (!checkIntegrality(val)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: j, p1: roundNice(val) }));
    }
    const bit = Math.round(val);
    if (bit !== 0 && bit !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: j, p1: bit }));
    }
    yClean.push(bit);
    fixedSum += input.fixedCosts[j] * bit;
    nomCap += input.capacities[j] * bit;
  }

  const survivingCap = nomCap - worstCaseCapDrop(input.dropAmounts, yClean, input.gamma);
  if (survivingCap < input.robustMinCap - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(survivingCap),
        p1: input.robustMinCap,
        p2: input.gamma,
      })
    );
  }

  let stage2Expected = 0;
  for (let s = 0; s < S; s++) {
    const recRaw = recoveredRows[s];

    let scCap = 0;
    let scHamming = 0;
    for (let j = 0; j < n; j++) {
      const val = recRaw[j];
      if (!checkIntegrality(val)) {
        return violation(
          formatTemplate(JMSG[locale].m4, { p0: s, p1: j, p2: roundNice(val) })
        );
      }
      const bit = Math.round(val);
      if (bit !== 0 && bit !== 1) {
        return violation(formatTemplate(JMSG[locale].m4, { p0: s, p1: j, p2: bit }));
      }
      if (input.offline[s][j] === 1 && bit === 1) {
        return violation(formatTemplate(JMSG[locale].m5, { p0: s, p1: j }));
      }
      scCap += input.capacities[j] * bit;
      if (bit !== yClean[j]) {
        scHamming += 1;
      }
    }

    const shortfall = Math.max(0, input.demands[s] - scCap);
    stage2Expected +=
      input.probs[s] *
      (input.disruptionCost * scHamming + input.shortfallPenalty * shortfall);
  }

  const recomputed = fixedSum + stage2Expected;
  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `y=[${yClean.join(", ")}] | robCap=${roundNice(survivingCap)}/${input.robustMinCap} | E[cost]=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
