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

export interface ShipmentSpec {
  stdWindow: [number, number];
  expWindow: [number, number];
  stdDuration: number;
  expDuration: number;
  expFee: number;
  dueTime: number;
  tardinessPenalty: number;
}

export interface P049Input {
  shipments: ShipmentSpec[];
  blackout: [number, number];
  maxExpress: number;
}

export interface P049Output {
  express: boolean[];
  startTimes: number[];
  endTimes: number[];
  totalCost: number;
}

function findOptimalLiraCost(input: P049Input): number | null {
  const n = input.shipments.length;
  const [b0, b1] = input.blackout;
  let best: number | null = null;

  const used = new Array<boolean>(n).fill(false);
  const perm = new Array<number>(n);

  const evalBranch = (expMask: number, boMask: number): void => {
    let curTime = 0;
    let cost = 0;
    for (let pos = 0; pos < n; pos++) {
      const idx = perm[pos];
      const spec = input.shipments[idx];
      const isExp = ((expMask >> idx) & 1) === 1;
      const afterBlackout = ((boMask >> idx) & 1) === 1;
      const [wLo, wHi] = isExp ? spec.expWindow : spec.stdWindow;
      const dur = isExp ? spec.expDuration : spec.stdDuration;

      const s = Math.max(wLo, curTime, afterBlackout ? b1 : 0);
      const e = s + dur;
      if (e > wHi + 1e-9) return;
      if (!afterBlackout && e > b0 + 1e-9) return;

      curTime = e;
      if (isExp) cost += spec.expFee;
      if (e > spec.dueTime) cost += (e - spec.dueTime) * spec.tardinessPenalty;
      if (best !== null && cost >= best - 1e-9) return;
    }
    best = best === null ? cost : Math.min(best, cost);
  };

  const genPerm = (depth: number, expMask: number): void => {
    if (depth === n) {
      for (let boMask = 0; boMask < 1 << n; boMask++) {
        evalBranch(expMask, boMask);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        used[i] = true;
        perm[depth] = i;
        genPerm(depth + 1, expMask);
        used[i] = false;
      }
    }
  };

  for (let expMask = 0; expMask < 1 << n; expMask++) {
    let pop = 0;
    for (let i = 0; i < n; i++) if ((expMask >> i) & 1) pop++;
    if (pop > input.maxExpress) continue;
    genPerm(0, expMask);
  }

  return best;
}

export function judge(
  input: P049Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.shipments.length;
  if (!Array.isArray(output.express) || output.express.length !== n) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: n }));
  }
  const express: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (typeof output.express[i] !== "boolean") {
      return runtimeError(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: String(output.express[i]) })
      );
    }
    express.push(output.express[i]);
  }

  const startTimes = expectNumericArray(
    output.startTimes,
    n,
    { en: "startTimes", ja: "startTimes", zh: "startTimes" },
    locale
  );
  if (typeof startTimes === "string") return runtimeError(startTimes);

  const endTimes = expectNumericArray(
    output.endTimes,
    n,
    { en: "endTimes", ja: "endTimes", zh: "endTimes" },
    locale
  );
  if (typeof endTimes === "string") return runtimeError(endTimes);

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const expCount = express.filter(Boolean).length;
  if (expCount > input.maxExpress) {
    return violation(formatTemplate(JMSG[locale].m3, { p0: expCount, p1: input.maxExpress }));
  }

  const [b0, b1] = input.blackout;
  let recomputedCost = 0;

  for (let i = 0; i < n; i++) {
    const spec = input.shipments[i];
    const isExp = express[i];
    const dur = isExp ? spec.expDuration : spec.stdDuration;
    const [wLo, wHi] = isExp ? spec.expWindow : spec.stdWindow;
    const s = startTimes[i];
    const e = endTimes[i];

    if (!approxEqual(e, s + dur, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: i,
          p1: roundNice(e),
          p2: roundNice(s + dur),
        })
      );
    }
    if (s < wLo - 1e-4 || e > wHi + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: i,
          p1: roundNice(s),
          p2: roundNice(e),
          p3: wLo,
          p4: wHi,
        })
      );
    }
    if (!(e <= b0 + 1e-4 || s >= b1 - 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: i,
          p1: roundNice(s),
          p2: roundNice(e),
          p3: b0,
          p4: b1,
        })
      );
    }

    if (isExp) recomputedCost += spec.expFee;
    if (e > spec.dueTime) {
      recomputedCost += (e - spec.dueTime) * spec.tardinessPenalty;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!(endTimes[i] <= startTimes[j] + 1e-4 || endTimes[j] <= startTimes[i] + 1e-4)) {
        return violation(
          formatTemplate(JMSG[locale].m7, {
            p0: i,
            p1: j,
            p2: roundNice(startTimes[i]),
            p3: roundNice(endTimes[i]),
            p4: roundNice(startTimes[j]),
            p5: roundNice(endTimes[j]),
          })
        );
      }
    }
  }

  if (!approxEqual(totalCostCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const optCost = findOptimalLiraCost(input);
  const preview = `express=[${express.join(", ")}] | end=[${endTimes.map((v) => roundNice(v)).join(", ")}] | cost=${roundNice(recomputedCost)}`;

  if (optCost !== null && recomputedCost > optCost + 1e-2) {
    return suboptimal(
      recomputedCost,
      optCost,
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(recomputedCost),
        p1: roundNice(optCost),
      }),
      preview
    );
  }

  return accepted(
    roundNice(recomputedCost),
    formatTemplate(JMSG[locale].m10, { p0: roundNice(recomputedCost) }),
    preview
  );
}
