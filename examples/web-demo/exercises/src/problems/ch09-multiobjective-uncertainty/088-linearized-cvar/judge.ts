import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
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

export interface P088Input {
  returns: number[][];
  probs: number[];
  alpha: number;
  riskWeight: number;
  maxWeight: number;
}

export interface P088Output {
  weights: number[];
  varThreshold: number;
  cvar: number;
  totalObjective: number;
}

export function judge(
  input: P088Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const S = input.returns.length;
  const n = input.returns[0].length;

  const weights = expectNumericArray(
    output.weights,
    n,
    { en: "weights", ja: "weights", zh: "weights" },
    locale
  );
  if (typeof weights === "string") return runtimeError(weights);

  const etaCheck = expectFiniteNumber(
    output.varThreshold,
    { en: "varThreshold", ja: "varThreshold", zh: "varThreshold" },
    locale
  );
  if (typeof etaCheck === "string") return runtimeError(etaCheck);

  const cvarCheck = expectFiniteNumber(
    output.cvar,
    { en: "cvar", ja: "cvar", zh: "cvar" },
    locale
  );
  if (typeof cvarCheck === "string") return runtimeError(cvarCheck);

  const objCheck = expectFiniteNumber(
    output.totalObjective,
    { en: "totalObjective", ja: "totalObjective", zh: "totalObjective" },
    locale
  );
  if (typeof objCheck === "string") return runtimeError(objCheck);

  let wSum = 0;
  for (let j = 0; j < n; j++) {
    const w = weights[j];
    if (w < -1e-6 || w > input.maxWeight + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: j,
          p1: roundNice(w, 5),
          p2: input.maxWeight,
        })
      );
    }
    wSum += w;
  }

  if (!approxEqual(wSum, 1.0, 1e-4)) {
    return violation(formatTemplate(JMSG[locale].m2, { p0: roundNice(wSum, 5) }));
  }

  const losses: number[] = [];
  let expectedLoss = 0;
  for (let s = 0; s < S; s++) {
    let portRet = 0;
    for (let j = 0; j < n; j++) {
      portRet += input.returns[s][j] * weights[j];
    }
    const loss = -portRet;
    losses.push(loss);
    expectedLoss += input.probs[s] * loss;
  }

  const tailDenom = 1 - input.alpha;
  const evalRU = (eta: number): number => {
    let tailSum = 0;
    for (let s = 0; s < S; s++) {
      tailSum += input.probs[s] * Math.max(0, losses[s] - eta);
    }
    return eta + tailSum / tailDenom;
  };

  let trueCvar = Infinity;
  for (let s = 0; s < S; s++) {
    const val = evalRU(losses[s]);
    if (val < trueCvar) trueCvar = val;
  }

  const ruAtReportedEta = evalRU(etaCheck);
  if (!approxEqual(ruAtReportedEta, trueCvar, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(etaCheck, 5),
        p1: roundNice(ruAtReportedEta, 5),
        p2: roundNice(trueCvar, 5),
      })
    );
  }

  if (!approxEqual(cvarCheck, trueCvar, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(cvarCheck, 5),
        p1: roundNice(trueCvar, 5),
      })
    );
  }

  const recomputedObj = expectedLoss + input.riskWeight * trueCvar;
  if (!approxEqual(objCheck, recomputedObj, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(objCheck, 5),
        p1: roundNice(recomputedObj, 5),
      })
    );
  }

  const preview = `w=[${weights.map((v) => roundNice(v, 4)).join(", ")}] | eta=${roundNice(etaCheck, 4)} | CVaR=${roundNice(trueCvar, 4)} | obj=${roundNice(recomputedObj, 5)}`;

  if (recomputedObj > expectedOptimal + 1e-3) {
    return suboptimal(
      recomputedObj,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputedObj, 5),
        p1: roundNice(expectedOptimal, 5),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal, 5) }),
    preview
  );
}
