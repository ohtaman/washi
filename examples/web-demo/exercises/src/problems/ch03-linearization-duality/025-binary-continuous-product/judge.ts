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

export interface P025Input {
  minOrders: number[];
  maxOrders: number[];
  baseCosts: number[];
  discounts: number[];
  contractFees: number[];
  totalDemand: number;
}

export interface P025Output {
  b: number[];
  x: number[];
  z: number[];
  totalCost: number;
}

export function judge(
  input: P025Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.minOrders.length;
  const bRaw = expectNumericArray(output.b, n, { en: "b", ja: "b", zh: "b" }, locale);
  if (typeof bRaw === "string") return runtimeError(bRaw);

  const x = expectNumericArray(output.x, n, { en: "x", ja: "x", zh: "x" }, locale);
  if (typeof x === "string") return runtimeError(x);

  const z = expectNumericArray(output.z, n, { en: "z", ja: "z", zh: "z" }, locale);
  if (typeof z === "string") return runtimeError(z);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const bClean: number[] = [];
  let sumX = 0;
  let trueCost = 0;
  for (let i = 0; i < n; i++) {
    const bi = bRaw[i];
    if (!checkIntegrality(bi)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(bi) }));
    }
    const bInt = Math.round(bi);
    if (bInt !== 0 && bInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: bInt }));
    }
    bClean.push(bInt);

    const xi = x[i];
    if (xi < input.minOrders[i] - 1e-4 || xi > input.maxOrders[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: roundNice(xi),
          p2: input.minOrders[i],
          p3: input.maxOrders[i],
        })
      );
    }

    const expectedZ = bInt * xi;
    if (!approxEqual(z[i], expectedZ, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(z[i]),
          p2: roundNice(expectedZ),
        })
      );
    }

    sumX += xi;
    trueCost +=
      input.baseCosts[i] * xi +
      input.contractFees[i] * bInt -
      input.discounts[i] * expectedZ;
  }

  if (sumX < input.totalDemand - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(sumX),
        p1: input.totalDemand,
      })
    );
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  const preview = `b=[${bClean.join(", ")}] | x=[${x.map((v) => roundNice(v, 2)).join(", ")}] | z=[${z.map((v) => roundNice(v, 2)).join(", ")}]`;

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
