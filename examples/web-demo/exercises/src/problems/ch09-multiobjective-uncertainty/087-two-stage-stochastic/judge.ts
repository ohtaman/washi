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

export interface P087Input {
  orderCosts: number[];
  shortageCosts: number[];
  salvageValues: number[];
  warehouseCap: number;
  probs: number[];
  demands: number[][];
}

export interface P087Output {
  orders: number[];
  expectedCost: number;
}

export function judge(
  input: P087Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.orderCosts.length;
  const S = input.probs.length;
  const orders = expectNumericArray(
    output.orders,
    n,
    { en: "orders", ja: "orders", zh: "orders" },
    locale
  );
  if (typeof orders === "string") return runtimeError(orders);

  const costCheck = expectFiniteNumber(
    output.expectedCost,
    { en: "expectedCost", ja: "expectedCost", zh: "expectedCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let totalOrders = 0;
  let stage1Cost = 0;
  for (let j = 0; j < n; j++) {
    const x = orders[j];
    if (x < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(x) }));
    }
    totalOrders += x;
    stage1Cost += input.orderCosts[j] * x;
  }

  if (totalOrders > input.warehouseCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(totalOrders),
        p1: input.warehouseCap,
      })
    );
  }

  let stage2Expected = 0;
  for (let s = 0; s < S; s++) {
    let scenarioCost = 0;
    for (let j = 0; j < n; j++) {
      const diff = input.demands[s][j] - orders[j];
      if (diff >= 0) {
        scenarioCost += input.shortageCosts[j] * diff;
      } else {
        scenarioCost -= input.salvageValues[j] * (-diff);
      }
    }
    stage2Expected += input.probs[s] * scenarioCost;
  }

  const recomputed = stage1Cost + stage2Expected;
  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `orders=[${orders.map((v) => roundNice(v)).join(", ")}] | cap=${roundNice(totalOrders)}/${input.warehouseCap} | E[cost]=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
