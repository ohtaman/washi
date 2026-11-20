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
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

function solveMpcWindowCost(
  invCurr: number,
  forecasts: number[],
  prodCosts: number[],
  prodCap: number,
  holdCost: number,
  shortfallPenalty: number,
  fixedX0?: number
): number {
  const L = forecasts.length;
  const effInv = invCurr + (fixedX0 !== undefined ? fixedX0 : 0);
  const fixedCost = fixedX0 !== undefined ? prodCosts[0] * fixedX0 : 0;

  const cumNetReq: number[] = [];
  let cum = 0;
  for (let k = 0; k < L; k++) {
    cum += forecasts[k];
    cumNetReq.push(cum - effInv);
  }

  let obj = fixedCost - holdCost * cumNetReq.reduce((acc, d) => acc + d, 0);
  const pools: Array<{ effCost: number; remCap: number }> = [];
  let prevReq = 0;

  for (let k = 0; k < L; k++) {
    const capK = k === 0 && fixedX0 !== undefined ? 0 : prodCap;
    if (capK > 0) {
      pools.push({ effCost: prodCosts[k] + (L - k) * holdCost, remCap: capK });
    }
    pools.push({ effCost: shortfallPenalty + (L - k) * holdCost, remCap: Infinity });

    const curCumPos = Math.max(0, cumNetReq[k]);
    let req = curCumPos - prevReq;
    prevReq = curCumPos;
    if (req <= 1e-12) continue;

    pools.sort((a, b) => a.effCost - b.effCost);
    for (const pool of pools) {
      if (req <= 1e-12) break;
      if (pool.remCap <= 1e-12) continue;
      const take = Math.min(req, pool.remCap);
      obj += take * pool.effCost;
      pool.remCap -= take;
      req -= take;
    }
  }

  return obj;
}

export interface P086Input {
  actualDemands: number[];
  forecastDemands: number[];
  prodCosts: number[];
  prodCap: number;
  holdCost: number;
  shortfallPenalty: number;
  initialInventory: number;
  windowLen: number;
}

export interface P086Output {
  produced: number[];
  inventories: number[];
  shortfalls: number[];
  totalCost: number;
}

export function judge(
  input: P086Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const T = input.actualDemands.length;
  const produced = expectNumericArray(
    output.produced,
    T,
    { en: "produced", ja: "produced", zh: "produced" },
    locale
  );
  if (typeof produced === "string") return runtimeError(produced);

  const inventories = expectNumericArray(
    output.inventories,
    T,
    { en: "inventories", ja: "inventories", zh: "inventories" },
    locale
  );
  if (typeof inventories === "string") return runtimeError(inventories);

  const shortfalls = expectNumericArray(
    output.shortfalls,
    T,
    { en: "shortfalls", ja: "shortfalls", zh: "shortfalls" },
    locale
  );
  if (typeof shortfalls === "string") return runtimeError(shortfalls);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let prevInv = input.initialInventory;
  let realizedCost = 0;

  for (let t = 0; t < T; t++) {
    const x = produced[t];
    if (x < -1e-6 || x > input.prodCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: t,
          p1: roundNice(x),
          p2: input.prodCap,
        })
      );
    }

    const supply = prevInv + x;
    const dem = input.actualDemands[t];
    const expInv = Math.max(0, supply - dem);
    const expShort = Math.max(0, dem - supply);

    if (!approxEqual(inventories[t], expInv, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: t,
          p1: roundNice(inventories[t]),
          p2: roundNice(expInv),
        })
      );
    }
    if (!approxEqual(shortfalls[t], expShort, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: t,
          p1: roundNice(shortfalls[t]),
          p2: roundNice(expShort),
        })
      );
    }

    realizedCost +=
      input.prodCosts[t] * x +
      input.holdCost * expInv +
      input.shortfallPenalty * expShort;
    prevInv = expInv;
  }

  if (!approxEqual(costCheck, realizedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(costCheck),
        p1: roundNice(realizedCost),
      })
    );
  }

  const preview = `prod=[${produced.map((v) => roundNice(v)).join(", ")}] | inv=[${inventories.map((v) => roundNice(v)).join(", ")}] | cost=${roundNice(realizedCost)}`;

  let mpcInv = input.initialInventory;
  for (let t = 0; t < T; t++) {
    const end = Math.min(T, t + input.windowLen);
    const fc = input.forecastDemands.slice(t, end);
    const pc = input.prodCosts.slice(t, end);
    const optWin = solveMpcWindowCost(
      mpcInv,
      fc,
      pc,
      input.prodCap,
      input.holdCost,
      input.shortfallPenalty
    );
    const userWin = solveMpcWindowCost(
      mpcInv,
      fc,
      pc,
      input.prodCap,
      input.holdCost,
      input.shortfallPenalty,
      produced[t]
    );
    if (userWin > optWin + 1e-2) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: t,
          p1: roundNice(produced[t]),
          p2: roundNice(userWin),
          p3: roundNice(optWin),
        }),
        preview
      );
    }
    mpcInv = inventories[t];
  }

  return accepted(
    realizedCost,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(realizedCost) }),
    preview
  );
}
