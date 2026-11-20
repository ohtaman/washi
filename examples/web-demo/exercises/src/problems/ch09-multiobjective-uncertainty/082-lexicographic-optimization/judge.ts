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

export interface P082Input {
  coverage: number[];
  crews: number[];
  opCosts: number[];
  maxCrews: number;
  targetDemand: number;
  slack: number;
}

export interface P082Output {
  selected: number[];
  obj1: number;
  obj2: number;
}

function computeBestStage1Shortfall(input: P082Input): number {
  const n = input.coverage.length;
  if (n <= 18) {
    let bestShortfall = Infinity;
    const totalMasks = 1 << n;
    for (let mask = 0; mask < totalMasks; mask++) {
      let crewSum = 0;
      let covSum = 0;
      for (let i = 0; i < n; i++) {
        if ((mask >> i) & 1) {
          crewSum += input.crews[i];
          covSum += input.coverage[i];
        }
      }
      if (crewSum <= input.maxCrews + 1e-9) {
        const shortfall = Math.max(0, input.targetDemand - covSum);
        if (shortfall < bestShortfall) {
          bestShortfall = shortfall;
        }
      }
    }
    return bestShortfall;
  }

  // Integer-capacity DP fallback for larger instances
  const cap = Math.floor(input.maxCrews);
  const dp = new Array<number>(cap + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const w = Math.round(input.crews[i]);
    const v = input.coverage[i];
    for (let c = cap; c >= w; c--) {
      if (dp[c - w] + v > dp[c]) {
        dp[c] = dp[c - w] + v;
      }
    }
  }
  return Math.max(0, input.targetDemand - dp[cap]);
}

export function judge(
  input: P082Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.coverage.length;
  const selectedRaw = expectNumericArray(
    output.selected,
    n,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selectedRaw === "string") return runtimeError(selectedRaw);

  const obj1Check = expectFiniteNumber(
    output.obj1,
    { en: "obj1", ja: "obj1", zh: "obj1" },
    locale
  );
  if (typeof obj1Check === "string") return runtimeError(obj1Check);

  const obj2Check = expectFiniteNumber(
    output.obj2,
    { en: "obj2", ja: "obj2", zh: "obj2" },
    locale
  );
  if (typeof obj2Check === "string") return runtimeError(obj2Check);

  const cleanSel: number[] = [];
  let crewUsed = 0;
  let covered = 0;
  let actualObj2 = 0;

  for (let i = 0; i < n; i++) {
    const raw = selectedRaw[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const bit = Math.round(raw);
    if (bit !== 0 && bit !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: bit }));
    }
    cleanSel.push(bit);
    crewUsed += input.crews[i] * bit;
    covered += input.coverage[i] * bit;
    actualObj2 += input.opCosts[i] * bit;
  }

  if (crewUsed > input.maxCrews + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(crewUsed),
        p1: input.maxCrews,
      })
    );
  }

  const actualObj1 = Math.max(0, input.targetDemand - covered);
  if (!approxEqual(obj1Check, actualObj1, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(obj1Check),
        p1: roundNice(actualObj1),
      })
    );
  }

  const bestObj1 = computeBestStage1Shortfall(input);
  const maxAllowedObj1 = bestObj1 + input.slack;
  if (actualObj1 > maxAllowedObj1 + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(actualObj1),
        p1: roundNice(maxAllowedObj1),
        p2: roundNice(bestObj1),
      })
    );
  }

  if (!approxEqual(obj2Check, actualObj2, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(obj2Check),
        p1: roundNice(actualObj2),
      })
    );
  }

  const preview = `selected=[${cleanSel.join(", ")}] | crews=${roundNice(crewUsed)}/${input.maxCrews} | obj1=${roundNice(actualObj1)} (best=${roundNice(bestObj1)}) | obj2=${roundNice(actualObj2)}`;

  if (actualObj2 > expectedOptimal + 1e-2) {
    return suboptimal(
      actualObj2,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(actualObj2),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
