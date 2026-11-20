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

export interface P034Input {
  distances: number[][];
}

export interface P034Output {
  next: number[];
  totalDistance: number;
}

export function judge(
  input: P034Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.distances.length;
  const rawNext = expectNumericArray(
    output.next,
    n,
    { en: "next", ja: "next", zh: "next" },
    locale
  );
  if (typeof rawNext === "string") return runtimeError(rawNext);

  const distCheck = expectFiniteNumber(
    output.totalDistance,
    { en: "totalDistance", ja: "totalDistance", zh: "totalDistance" },
    locale
  );
  if (typeof distCheck === "string") return runtimeError(distCheck);

  const used = new Set<number>();
  const clean: number[] = [];
  let totalDist = 0;

  for (let i = 0; i < n; i++) {
    const raw = rawNext[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const nx = Math.round(raw);
    if (nx < 0 || nx >= n) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: nx, p2: n - 1 }));
    }
    if (nx === i || used.has(nx)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: nx }));
    }
    used.add(nx);
    clean.push(nx);
    totalDist += input.distances[i][nx];
  }

  const visited = new Set<number>();
  let cur = 0;
  for (let step = 0; step < n; step++) {
    if (visited.has(cur)) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: step }));
    }
    visited.add(cur);
    cur = clean[cur];
  }
  if (cur !== 0) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: n }));
  }

  if (!approxEqual(distCheck, totalDist, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(distCheck), p1: totalDist })
    );
  }

  const preview = `next=[${clean.join(", ")}] | totalDistance=${totalDist}`;

  if (totalDist > expectedOptimal + 1e-2) {
    return suboptimal(
      totalDist,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: totalDist, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
