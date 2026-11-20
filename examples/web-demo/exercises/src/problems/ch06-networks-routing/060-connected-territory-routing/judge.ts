import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  expectFiniteNumber,
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

export interface P060Input {
  numTerritories: number;
  demands: number[];
  demandBounds: number[];
  hubCosts: number[];
  adjEdges: number[][];
  dist: number[][];
}

export interface P060Territory {
  hub: number;
  tour: number[];
}

export interface P060Output {
  territories: P060Territory[];
  totalCost: number;
}

export function judge(
  input: P060Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }
  if (!Array.isArray(output.territories)) {
    return runtimeError(JMSG[locale].m1);
  }
  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const territoriesClean: Array<{ hub: number; tour: number[] }> = [];
  for (let tIdx = 0; tIdx < output.territories.length; tIdx++) {
    const ter = output.territories[tIdx];
    if (!isRecord(ter) || typeof ter.hub !== "number" || !Number.isInteger(ter.hub)) {
      return runtimeError(formatTemplate(JMSG[locale].m3, { p0: tIdx }));
    }
    if (!Array.isArray(ter.tour) || ter.tour.length < 3) {
      return runtimeError(formatTemplate(JMSG[locale].m4, { p0: tIdx }));
    }
    for (let k = 0; k < ter.tour.length; k++) {
      if (typeof ter.tour[k] !== "number" || !Number.isInteger(ter.tour[k])) {
        return runtimeError(formatTemplate(JMSG[locale].m4, { p0: tIdx }));
      }
    }
    territoriesClean.push({ hub: ter.hub, tour: ter.tour as number[] });
  }

  const n = input.demands.length;
  const K = input.numTerritories;
  const [minD, maxD] = input.demandBounds;

  if (territoriesClean.length !== K) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: territoriesClean.length, p1: K })
    );
  }

  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of input.adjEdges) {
    adj[u].push(v);
    adj[v].push(u);
  }

  const assignedGlobal = new Set<number>();
  let recomputedCost = 0;

  for (let tIdx = 0; tIdx < K; tIdx++) {
    const { hub, tour } = territoriesClean[tIdx];
    if (hub < 0 || hub >= n) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: hub, p1: n - 1 }));
    }
    if (tour[0] !== hub || tour[tour.length - 1] !== hub) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: tIdx, p1: hub }));
    }

    const territoryNodes = new Set<number>();
    let terDemand = 0;
    for (let k = 0; k < tour.length - 1; k++) {
      const node = tour[k];
      if (node < 0 || node >= n) {
        return violation(formatTemplate(JMSG[locale].m5, { p0: node, p1: n - 1 }));
      }
      if (territoryNodes.has(node) || assignedGlobal.has(node)) {
        return violation(formatTemplate(JMSG[locale].m7, { p0: node }));
      }
      territoryNodes.add(node);
      assignedGlobal.add(node);
      terDemand += input.demands[node];
    }

    if (terDemand < minD - 1e-4 || terDemand > maxD + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: tIdx,
          p1: roundNice(terDemand),
          p2: minD,
          p3: maxD,
        })
      );
    }

    // Check geographic contiguity along input.adjEdges restricted to territoryNodes
    const reachable = new Set<number>([hub]);
    const queue = [hub];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nxt of adj[cur]) {
        if (territoryNodes.has(nxt) && !reachable.has(nxt)) {
          reachable.add(nxt);
          queue.push(nxt);
        }
      }
    }
    if (reachable.size !== territoryNodes.size) {
      return violation(formatTemplate(JMSG[locale].m9, { p0: tIdx }));
    }

    recomputedCost += input.hubCosts[hub];
    for (let k = 0; k < tour.length - 1; k++) {
      recomputedCost += input.dist[tour[k]][tour[k + 1]];
    }
  }

  for (let i = 0; i < n; i++) {
    if (!assignedGlobal.has(i)) {
      return violation(formatTemplate(JMSG[locale].m10, { p0: i }));
    }
  }

  if (!approxEqual(costCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `${K} connected territories | totalCost=${roundNice(recomputedCost)}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m12, {
        p0: roundNice(recomputedCost),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m13, { p0: expectedOptimal }),
    preview
  );
}
