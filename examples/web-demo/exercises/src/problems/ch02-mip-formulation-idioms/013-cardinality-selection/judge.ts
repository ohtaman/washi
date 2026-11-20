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

export interface P013ExactGroup {
  indices: number[];
  count: number;
}

export interface P013Input {
  budget: number;
  costs: number[];
  values: number[];
  mutexGroups: number[][];
  exactGroups: P013ExactGroup[];
  atLeastOneGroups: number[][];
}

export interface P013Output {
  selected: number[];
  totalValue: number;
}

export function judge(
  input: P013Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costs.length;
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
  let spent = 0;
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const s = selRaw[i];
    if (!checkIntegrality(s)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(s) }));
    }
    const sInt = Math.round(s);
    if (sInt !== 0 && sInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: sInt }));
    }
    selClean.push(sInt);
    spent += input.costs[i] * sInt;
    recomputed += input.values[i] * sInt;
  }

  if (spent > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: roundNice(spent), p1: input.budget })
    );
  }

  for (let g = 0; g < input.mutexGroups.length; g++) {
    const count = input.mutexGroups[g].reduce((acc, idx) => acc + selClean[idx], 0);
    if (count > 1) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: g, p1: count }));
    }
  }

  for (let g = 0; g < input.exactGroups.length; g++) {
    const rule = input.exactGroups[g];
    const count = rule.indices.reduce((acc, idx) => acc + selClean[idx], 0);
    if (count !== rule.count) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: g, p1: count, p2: rule.count })
      );
    }
  }

  for (let g = 0; g < input.atLeastOneGroups.length; g++) {
    const count = input.atLeastOneGroups[g].reduce((acc, idx) => acc + selClean[idx], 0);
    if (count < 1) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: g, p1: count }));
    }
  }

  if (!approxEqual(valCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(valCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `selected=[${selClean.join(", ")}] | budget=${roundNice(spent)}/${input.budget}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
