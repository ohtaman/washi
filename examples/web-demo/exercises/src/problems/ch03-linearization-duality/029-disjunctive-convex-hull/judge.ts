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

export interface P029Input {
  demand: number;
  bandLbs: number[][];
  bandUbs: number[][];
  fixedCosts: number[][];
  unitCosts: number[][];
}

export interface P029Output {
  modes: number[];
  outputs: number[];
  totalCost: number;
}

export function judge(
  input: P029Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nUnits = input.bandLbs.length;
  const nBands = input.bandLbs[0].length;

  const modesRaw = expectNumericArray(
    output.modes,
    nUnits,
    { en: "modes", ja: "modes", zh: "modes" },
    locale
  );
  if (typeof modesRaw === "string") return runtimeError(modesRaw);

  const outputs = expectNumericArray(
    output.outputs,
    nUnits,
    { en: "outputs", ja: "outputs", zh: "outputs" },
    locale
  );
  if (typeof outputs === "string") return runtimeError(outputs);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const modesClean: number[] = [];
  let sumOut = 0;
  let trueCost = 0;
  for (let i = 0; i < nUnits; i++) {
    const mVal = modesRaw[i];
    if (!checkIntegrality(mVal)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(mVal) }));
    }
    const k = Math.round(mVal);
    if (k < 0 || k >= nBands) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: k })
      );
    }
    modesClean.push(k);

    const outVal = outputs[i];
    const lb = input.bandLbs[i][k];
    const ub = input.bandUbs[i][k];
    if (outVal < lb - 1e-4 || outVal > ub + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: roundNice(outVal),
          p2: k,
          p3: lb,
          p4: ub,
        })
      );
    }
    sumOut += outVal;
    trueCost += input.fixedCosts[i][k] + input.unitCosts[i][k] * outVal;
  }

  if (sumOut < input.demand - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(sumOut),
        p1: input.demand,
      })
    );
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  const preview = `modes=[${modesClean.join(", ")}] | out=[${outputs.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(trueCost),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
