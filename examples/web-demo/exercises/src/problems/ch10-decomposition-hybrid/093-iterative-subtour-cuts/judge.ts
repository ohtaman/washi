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

export interface P093Input {
  distances: number[][];
}

export interface P093Output {
  tour: number[];
  totalDistance: number;
  iterations: number;
}

export function judge(
  input: P093Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.distances.length;
  const tourRaw = expectNumericArray(
    output.tour,
    n,
    { en: "tour", ja: "tour", zh: "tour" },
    locale
  );
  if (typeof tourRaw === "string") return runtimeError(tourRaw);

  const distCheck = expectFiniteNumber(
    output.totalDistance,
    { en: "totalDistance", ja: "totalDistance", zh: "totalDistance" },
    locale
  );
  if (typeof distCheck === "string") return runtimeError(distCheck);

  const iterCheck = expectFiniteNumber(
    output.iterations,
    { en: "iterations", ja: "iterations", zh: "iterations" },
    locale
  );
  if (typeof iterCheck === "string") return runtimeError(iterCheck);

  if (!checkIntegrality(iterCheck) || Math.round(iterCheck) < 1) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: roundNice(iterCheck) }));
  }

  const tour: number[] = [];
  const seen = new Set<number>();
  for (let idx = 0; idx < n; idx++) {
    const val = tourRaw[idx];
    if (!checkIntegrality(val)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: idx, p1: roundNice(val), p2: n - 1 }));
    }
    const city = Math.round(val);
    if (city < 0 || city >= n) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: idx, p1: city, p2: n - 1 }));
    }
    if (seen.has(city)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: city }));
    }
    seen.add(city);
    tour.push(city);
  }

  let recomputed = 0;
  for (let k = 0; k < n; k++) {
    const u = tour[k];
    const v = tour[(k + 1) % n];
    recomputed += input.distances[u][v];
  }

  if (!approxEqual(distCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(distCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `tour=[${tour.join(" -> ")} -> ${tour[0]}] | dist=${roundNice(recomputed)} | iters=${Math.round(iterCheck)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, {
      p0: expectedOptimal,
      p1: Math.round(iterCheck),
    }),
    preview
  );
}
