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

export interface P026Input {
  power: number[];
  costs: number[];
  budget: number;
  maxPartySize: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export function judge(
  input: P026Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.power.length;
  const P = input.pairs.length;
  const selectedRaw = expectNumericArray(
    output.selected,
    n,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selectedRaw === "string") return runtimeError(selectedRaw);

  const pairRaw = expectNumericArray(
    output.pairProducts,
    P,
    { en: "pairProducts", ja: "pairProducts", zh: "pairProducts" },
    locale
  );
  if (typeof pairRaw === "string") return runtimeError(pairRaw);

  const valCheck = expectFiniteNumber(
    output.totalValue,
    { en: "totalValue", ja: "totalValue", zh: "totalValue" },
    locale
  );
  if (typeof valCheck === "string") return runtimeError(valCheck);

  const selClean: number[] = [];
  let partySize = 0;
  let totalCost = 0;
  let trueValue = 0;
  for (let i = 0; i < n; i++) {
    const v = selectedRaw[i];
    if (!checkIntegrality(v)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(v) }));
    }
    const vInt = Math.round(v);
    if (vInt !== 0 && vInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: vInt }));
    }
    selClean.push(vInt);
    partySize += vInt;
    totalCost += input.costs[i] * vInt;
    trueValue += input.power[i] * vInt;
  }

  if (partySize > input.maxPartySize) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: partySize,
        p1: input.maxPartySize,
      })
    );
  }

  if (totalCost > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(totalCost),
        p1: input.budget,
      })
    );
  }

  const wClean: number[] = [];
  for (let k = 0; k < P; k++) {
    const [i, j, bonus] = input.pairs[k];
    const wk = pairRaw[k];
    const expectedW = selClean[i] * selClean[j];
    if (!approxEqual(wk, expectedW, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: i,
          p2: j,
          p3: roundNice(wk),
          p4: expectedW,
        })
      );
    }
    wClean.push(expectedW);
    trueValue += bonus * expectedW;
  }

  if (!approxEqual(valCheck, trueValue, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(valCheck),
        p1: roundNice(trueValue),
      })
    );
  }

  const preview = `x=[${selClean.join(", ")}] | w=[${wClean.join(", ")}] | size=${partySize}/${input.maxPartySize} | cost=${totalCost}/${input.budget}`;

  if (trueValue < expectedOptimal - 1e-2) {
    return suboptimal(
      trueValue,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(trueValue),
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
