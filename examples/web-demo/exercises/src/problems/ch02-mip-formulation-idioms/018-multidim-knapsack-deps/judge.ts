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

export interface P018Input {
  values: number[];
  weights: number[][];
  capacities: number[];
  prerequisites: number[][];
  incompatibles: number[][];
}

export interface P018Output {
  selected: number[];
  totalValue: number;
}

export function judge(
  input: P018Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.values.length;
  const selRaw = expectNumericArray(
    output.selected,
    n,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selRaw === "string") return runtimeError(selRaw);

  const valCheck = expectFiniteNumber(
    output.totalValue,
    { en: "totalValue", ja: "totalValue", zh: "totalValue" },
    locale
  );
  if (typeof valCheck === "string") return runtimeError(valCheck);

  const selClean: number[] = [];
  let recomputed = 0;

  for (let j = 0; j < n; j++) {
    const s = selRaw[j];
    if (!checkIntegrality(s)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(s) }));
    }
    const sInt = Math.round(s);
    if (sInt !== 0 && sInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: sInt }));
    }
    selClean.push(sInt);
    recomputed += input.values[j] * sInt;
  }

  for (let k = 0; k < input.capacities.length; k++) {
    const used = input.weights[k].reduce((acc, w, j) => acc + w * selClean[j], 0);
    if (used > input.capacities[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: k,
          p1: roundNice(used),
          p2: input.capacities[k],
        })
      );
    }
  }

  for (const [a, b] of input.prerequisites) {
    if (selClean[a] > selClean[b]) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: a, p1: b }));
    }
  }

  for (const [c, d] of input.incompatibles) {
    if (selClean[c] + selClean[d] > 1) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: c, p1: d }));
    }
  }

  if (!approxEqual(valCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(valCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `selected=[${selClean.join(", ")}] | totalValue=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
