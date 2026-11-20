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

export interface P063Input {
  demands: number[];
  capacities: number[];
  prodCosts: number[];
  unitPrice: number;
  holdCost: number;
  backorderCost: number;
  lostSalePenalty: number;
  initialInventory: number;
}

export interface P063Output {
  production: number[];
  sales: number[];
  inventory: number[];
  backlog: number[];
  lostSales: number[];
  netProfit: number;
}

export function judge(
  input: P063Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const T = input.demands.length;
  const production = expectNumericArray(
    output.production,
    T,
    { en: "production", ja: "production", zh: "production" },
    locale
  );
  if (typeof production === "string") return runtimeError(production);

  const sales = expectNumericArray(
    output.sales,
    T,
    { en: "sales", ja: "sales", zh: "sales" },
    locale
  );
  if (typeof sales === "string") return runtimeError(sales);

  const inventory = expectNumericArray(
    output.inventory,
    T,
    { en: "inventory", ja: "inventory", zh: "inventory" },
    locale
  );
  if (typeof inventory === "string") return runtimeError(inventory);

  const backlog = expectNumericArray(
    output.backlog,
    T,
    { en: "backlog", ja: "backlog", zh: "backlog" },
    locale
  );
  if (typeof backlog === "string") return runtimeError(backlog);

  const lostSales = expectNumericArray(
    output.lostSales,
    T,
    { en: "lostSales", ja: "lostSales", zh: "lostSales" },
    locale
  );
  if (typeof lostSales === "string") return runtimeError(lostSales);

  const profitCheck = expectFiniteNumber(
    output.netProfit,
    { en: "netProfit", ja: "netProfit", zh: "netProfit" },
    locale
  );
  if (typeof profitCheck === "string") return runtimeError(profitCheck);

  let prevInv = input.initialInventory;
  let prevBack = 0;
  let recomputed = 0;

  for (let t = 0; t < T; t++) {
    if (production[t] < -1e-6 || production[t] > input.capacities[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: t,
          p1: roundNice(production[t]),
          p2: input.capacities[t],
        })
      );
    }
    if (sales[t] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: "sales", p1: t, p2: roundNice(sales[t]) })
      );
    }
    if (inventory[t] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: "inventory", p1: t, p2: roundNice(inventory[t]) })
      );
    }
    if (backlog[t] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: "backlog", p1: t, p2: roundNice(backlog[t]) })
      );
    }
    if (lostSales[t] < -1e-6 || lostSales[t] > input.demands[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: t,
          p1: roundNice(lostSales[t]),
          p2: input.demands[t],
        })
      );
    }

    const expectedInv = prevInv + production[t] - sales[t];
    if (!approxEqual(inventory[t], expectedInv, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: t,
          p1: roundNice(expectedInv),
          p2: roundNice(inventory[t]),
        })
      );
    }

    const expectedBack = prevBack + input.demands[t] - sales[t] - lostSales[t];
    if (!approxEqual(backlog[t], expectedBack, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: t,
          p1: roundNice(expectedBack),
          p2: roundNice(backlog[t]),
        })
      );
    }

    recomputed +=
      input.unitPrice * sales[t] -
      input.prodCosts[t] * production[t] -
      input.holdCost * inventory[t] -
      input.backorderCost * backlog[t] -
      input.lostSalePenalty * lostSales[t];

    prevInv = inventory[t];
    prevBack = backlog[t];
  }

  if (Math.abs(backlog[T - 1]) > 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(backlog[T - 1]) })
    );
  }

  if (!approxEqual(profitCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(profitCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const totalLost = lostSales.reduce((acc, v) => acc + v, 0);
  const totalBacklog = backlog.reduce((acc, v) => acc + v, 0);
  const preview = `backlogSum=${roundNice(totalBacklog, 2)} | lost=${roundNice(totalLost, 2)} | netProfit=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
