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

export interface P059Input {
  dist: number[][];
  demands: number[];
  vehicleCapacity: number;
  depotMaxVehicles: number[];
  depotCapacities: number[];
}

export interface P059Output {
  routes: number[][];
  totalDistance: number;
}

export function judge(
  input: P059Input,
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

  const n = input.dist.length;
  const D = input.depotMaxVehicles.length;

  const routesClean: number[][] = [];
  for (let rIdx = 0; rIdx < output.routes.length; rIdx++) {
    const r = output.routes[rIdx];
    if (!Array.isArray(r) || r.length < 3) {
      return runtimeError(formatTemplate(JMSG[locale].m2, { p0: rIdx }));
    }
    for (let k = 0; k < r.length; k++) {
      if (typeof r[k] !== "number" || !Number.isInteger(r[k])) {
        return runtimeError(formatTemplate(JMSG[locale].m2, { p0: rIdx }));
      }
    }
    routesClean.push(r as number[]);
  }

  const depotVehicles = new Array<number>(D).fill(0);
  const depotLoad = new Array<number>(D).fill(0);
  const visited = new Set<number>();
  let totalDist = 0;

  for (let rIdx = 0; rIdx < routesClean.length; rIdx++) {
    const r = routesClean[rIdx];
    const startDepot = r[0];
    const endDepot = r[r.length - 1];
    if (startDepot < 0 || startDepot >= D) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: rIdx, p1: startDepot, p2: D - 1 })
      );
    }
    if (endDepot !== startDepot) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: rIdx, p1: startDepot, p2: endDepot })
      );
    }

    depotVehicles[startDepot] += 1;
    if (depotVehicles[startDepot] > input.depotMaxVehicles[startDepot]) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: startDepot,
          p1: depotVehicles[startDepot],
          p2: input.depotMaxVehicles[startDepot],
        })
      );
    }

    let routeLoad = 0;
    for (let k = 1; k < r.length - 1; k++) {
      const c = r[k] as number;
      if (c < D || c >= n) {
        return violation(
          formatTemplate(JMSG[locale].m6, { p0: c, p1: D, p2: n - 1 })
        );
      }
      if (visited.has(c)) {
        return violation(formatTemplate(JMSG[locale].m7, { p0: c }));
      }
      visited.add(c);
      routeLoad += input.demands[c];
    }

    if (routeLoad > input.vehicleCapacity + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: rIdx,
          p1: roundNice(routeLoad),
          p2: input.vehicleCapacity,
        })
      );
    }

    depotLoad[startDepot] += routeLoad;
    if (depotLoad[startDepot] > input.depotCapacities[startDepot] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m9, {
          p0: startDepot,
          p1: roundNice(depotLoad[startDepot]),
          p2: input.depotCapacities[startDepot],
        })
      );
    }

    for (let k = 0; k < r.length - 1; k++) {
      totalDist += input.dist[r[k] as number][r[k + 1] as number];
    }
  }

  for (let c = D; c < n; c++) {
    if (!visited.has(c)) {
      return violation(formatTemplate(JMSG[locale].m10, { p0: c }));
    }
  }

  if (!approxEqual(distCheck, totalDist, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m11, {
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
      formatTemplate(JMSG[locale].m12, {
        p0: roundNice(totalDist),
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
