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

export interface P030Input {
  baseCosts: number[];
  values: number[];
  minValue: number;
  loads: number[][];
  targets: number[];
  devWeights: number[];
  peakWeight: number;
  pairs: number[][];
}

export interface P030Output {
  selected: number[];
  pairProducts: number[];
  peakLoad: number;
  totalCost: number;
}

export function judge(
  input: P030Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.baseCosts.length;
  const mZones = input.loads.length;
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

  const peakCheck = expectFiniteNumber(
    output.peakLoad,
    { en: "peakLoad", ja: "peakLoad", zh: "peakLoad" },
    locale
  );
  if (typeof peakCheck === "string") return runtimeError(peakCheck);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const selClean: number[] = [];
  let totalValue = 0;
  let trueCost = 0;
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
    totalValue += input.values[i] * vInt;
    trueCost += input.baseCosts[i] * vInt;
  }

  if (totalValue < input.minValue - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(totalValue),
        p1: input.minValue,
      })
    );
  }

  const wClean: number[] = [];
  for (let k = 0; k < P; k++) {
    const [i, j, pairCost] = input.pairs[k];
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
    trueCost += pairCost * expectedW;
  }

  let actualPeak = 0;
  for (let r = 0; r < mZones; r++) {
    let loadR = 0;
    for (let i = 0; i < n; i++) {
      loadR += input.loads[r][i] * selClean[i];
    }
    if (loadR > actualPeak) actualPeak = loadR;
    trueCost += input.devWeights[r] * Math.abs(loadR - input.targets[r]);
  }

  if (!approxEqual(peakCheck, actualPeak, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(peakCheck),
        p1: roundNice(actualPeak),
      })
    );
  }

  trueCost += input.peakWeight * actualPeak;

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  const preview = `x=[${selClean.join(", ")}] | w=[${wClean.join(", ")}] | peak=${roundNice(actualPeak, 2)}`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(trueCost),
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
