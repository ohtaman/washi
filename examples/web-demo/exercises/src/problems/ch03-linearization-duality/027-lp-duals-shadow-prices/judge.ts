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

export interface P027Input {
  costs: number[];
  capacities: number[];
  yields: number[][];
  minRequirements: number[];
  resourceUsages: number[][];
  maxResources: number[];
}

export interface P027Output {
  quantities: number[];
  duals: number[];
  optimalCost: number;
}

export function judge(
  input: P027Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costs.length;
  const m1 = input.minRequirements.length;
  const m2 = input.maxResources.length;

  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const duals = expectNumericArray(
    output.duals,
    m1 + m2,
    { en: "duals", ja: "duals", zh: "duals" },
    locale
  );
  if (typeof duals === "string") return runtimeError(duals);

  const costCheck = expectFiniteNumber(
    output.optimalCost,
    { en: "optimalCost", ja: "optimalCost", zh: "optimalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let trueCost = 0;
  for (let i = 0; i < n; i++) {
    const q = quantities[i];
    if (q < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(q) }));
    }
    if (q > input.capacities[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: roundNice(q),
          p2: input.capacities[i],
        })
      );
    }
    trueCost += input.costs[i] * q;
  }

  const reqLhs: number[] = [];
  for (let k = 0; k < m1; k++) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val += input.yields[k][i] * quantities[i];
    }
    if (val < input.minRequirements[k] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: roundNice(val),
          p2: input.minRequirements[k],
        })
      );
    }
    reqLhs.push(val);
  }

  const capLhs: number[] = [];
  for (let l = 0; l < m2; l++) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val += input.resourceUsages[l][i] * quantities[i];
    }
    if (val > input.maxResources[l] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: l,
          p1: roundNice(val),
          p2: input.maxResources[l],
        })
      );
    }
    capLhs.push(val);
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(trueCost),
        p1: roundNice(expectedOptimal),
      })
    );
  }

  // Dual sign & complementary slackness checks on requirement (>=) rows
  for (let k = 0; k < m1; k++) {
    const d = duals[k];
    if (d < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, { p0: k, p1: roundNice(d) })
      );
    }
    if (reqLhs[k] > input.minRequirements[k] + 1e-3 && Math.abs(d) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m9, {
          p0: k,
          p1: roundNice(reqLhs[k] - input.minRequirements[k]),
          p2: roundNice(d),
        })
      );
    }
  }

  // Dual sign & complementary slackness checks on resource cap (<=) rows
  for (let l = 0; l < m2; l++) {
    const d = duals[m1 + l];
    if (d > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m8, { p0: l, p1: roundNice(d) })
      );
    }
    if (capLhs[l] < input.maxResources[l] - 1e-3 && Math.abs(d) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m9, {
          p0: m1 + l,
          p1: roundNice(input.maxResources[l] - capLhs[l]),
          p2: roundNice(d),
        })
      );
    }
  }

  // Dual feasibility & variable complementarity: rc_i = c_i - y^T A_i
  let dualObj = 0;
  for (let k = 0; k < m1; k++) dualObj += input.minRequirements[k] * duals[k];
  for (let l = 0; l < m2; l++) dualObj += input.maxResources[l] * duals[m1 + l];

  for (let i = 0; i < n; i++) {
    let rc = input.costs[i];
    for (let k = 0; k < m1; k++) rc -= duals[k] * input.yields[k][i];
    for (let l = 0; l < m2; l++) rc -= duals[m1 + l] * input.resourceUsages[l][i];

    const q = quantities[i];
    const cap = input.capacities[i];
    if (q <= 1e-4 && rc < -1e-4) {
      return violation(formatTemplate(JMSG[locale].m10, { p0: i, p1: roundNice(rc) }));
    }
    if (q >= cap - 1e-4 && rc > 1e-4) {
      return violation(formatTemplate(JMSG[locale].m10, { p0: i, p1: roundNice(rc) }));
    }
    if (q > 1e-4 && q < cap - 1e-4 && Math.abs(rc) > 1e-4) {
      return violation(formatTemplate(JMSG[locale].m10, { p0: i, p1: roundNice(rc) }));
    }
    dualObj += cap * Math.min(0, rc);
  }

  if (!approxEqual(dualObj, expectedOptimal, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(dualObj),
        p1: roundNice(expectedOptimal),
      })
    );
  }

  const preview = `x=[${quantities.map((v) => roundNice(v, 2)).join(", ")}] | duals=[${duals.map((v) => roundNice(v, 3)).join(", ")}]`;

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m12, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
