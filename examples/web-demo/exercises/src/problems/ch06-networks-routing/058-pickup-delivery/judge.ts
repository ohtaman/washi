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

export interface P058Request {
  pickup: number;
  delivery: number;
  demand: number;
}

export interface P058Input {
  dist: number[][];
  requests: P058Request[];
  capacity: number;
  maxVehicles: number;
  maxStopsPerVehicle: number;
}

export interface P058Output {
  routes: number[][];
  totalDistance: number;
}

export function judge(
  input: P058Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }
  if (!Array.isArray(output.routes)) {
    return runtimeError(JMSG[locale].m1);
  }
  const distCheck = expectFiniteNumber(
    output.totalDistance,
    { en: "totalDistance", ja: "totalDistance", zh: "totalDistance" },
    locale
  );
  if (typeof distCheck === "string") return runtimeError(distCheck);

  const routesClean: number[][] = [];
  for (let rIdx = 0; rIdx < output.routes.length; rIdx++) {
    const r = output.routes[rIdx];
    if (!Array.isArray(r) || r.length < 3) {
      return runtimeError(formatTemplate(JMSG[locale].m3, { p0: rIdx }));
    }
    for (let k = 0; k < r.length; k++) {
      if (typeof r[k] !== "number" || !Number.isInteger(r[k])) {
        return runtimeError(formatTemplate(JMSG[locale].m3, { p0: rIdx }));
      }
    }
    routesClean.push(r as number[]);
  }

  const n = input.dist.length;
  if (routesClean.length > input.maxVehicles) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: routesClean.length,
        p1: input.maxVehicles,
      })
    );
  }

  const delta = new Array<number>(n).fill(0);
  for (const r of input.requests) {
    delta[r.pickup] = r.demand;
    delta[r.delivery] = -r.demand;
  }

  const nodeLoc = new Map<number, { routeIdx: number; pos: number }>();
  let totalDist = 0;

  for (let rIdx = 0; rIdx < routesClean.length; rIdx++) {
    const r = routesClean[rIdx];
    if (r[0] !== 0 || r[r.length - 1] !== 0) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: rIdx }));
    }
    const stopCount = r.length - 2;
    if (stopCount > input.maxStopsPerVehicle) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: rIdx,
          p1: stopCount,
          p2: input.maxStopsPerVehicle,
        })
      );
    }

    for (let k = 1; k < r.length - 1; k++) {
      const node = r[k] as number;
      if (node < 1 || node >= n) {
        return violation(formatTemplate(JMSG[locale].m6, { p0: node, p1: n - 1 }));
      }
      if (nodeLoc.has(node)) {
        return violation(formatTemplate(JMSG[locale].m7, { p0: node }));
      }
      nodeLoc.set(node, { routeIdx: rIdx, pos: k });
    }

    for (let k = 0; k < r.length - 1; k++) {
      totalDist += input.dist[r[k] as number][r[k + 1] as number];
    }
  }

  for (let node = 1; node < n; node++) {
    if (!nodeLoc.has(node)) {
      return violation(formatTemplate(JMSG[locale].m9, { p0: node }));
    }
  }

  for (let idx = 0; idx < input.requests.length; idx++) {
    const req = input.requests[idx];
    const pLoc = nodeLoc.get(req.pickup)!;
    const dLoc = nodeLoc.get(req.delivery)!;
    if (pLoc.routeIdx !== dLoc.routeIdx) {
      return violation(
        formatTemplate(JMSG[locale].m10, {
          p0: idx,
          p1: req.pickup,
          p2: req.delivery,
        })
      );
    }
    if (pLoc.pos >= dLoc.pos) {
      return violation(
        formatTemplate(JMSG[locale].m11, {
          p0: idx,
          p1: req.pickup,
          p2: req.delivery,
        })
      );
    }
  }

  for (let rIdx = 0; rIdx < output.routes.length; rIdx++) {
    const r = output.routes[rIdx] as number[];
    let load = 0;
    for (let k = 1; k < r.length - 1; k++) {
      const node = r[k];
      load += delta[node];
      if (load < -1e-6 || load > input.capacity + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m8, {
            p0: rIdx,
            p1: node,
            p2: roundNice(load),
            p3: input.capacity,
          })
        );
      }
    }
  }

  if (!approxEqual(distCheck, totalDist, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m12, {
        p0: roundNice(distCheck),
        p1: roundNice(totalDist),
      })
    );
  }

  const preview = `${output.routes.length} routes | totalDistance=${roundNice(totalDist)}`;

  if (totalDist > expectedOptimal + 1e-2) {
    return suboptimal(
      totalDist,
      expectedOptimal,
      formatTemplate(JMSG[locale].m13, {
        p0: roundNice(totalDist),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m14, { p0: expectedOptimal }),
    preview
  );
}
