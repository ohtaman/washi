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

export interface P057Input {
  travelTimes: number[][];
  earliest: number[];
  latest: number[];
  visitDurations: number[];
  maxGroups: number;
}

export interface P057Output {
  itineraries: number[][];
  totalCost: number;
}

export function judge(
  input: P057Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }
  if (!Array.isArray(output.itineraries)) {
    return runtimeError(JMSG[locale].m1);
  }
  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const routesClean: number[][] = [];
  for (let rIdx = 0; rIdx < output.itineraries.length; rIdx++) {
    const r = output.itineraries[rIdx];
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

  const n = input.travelTimes.length;
  if (routesClean.length > input.maxGroups) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: routesClean.length,
        p1: input.maxGroups,
      })
    );
  }

  const visited = new Set<number>();
  let totalTravel = 0;

  for (let rIdx = 0; rIdx < routesClean.length; rIdx++) {
    const r = routesClean[rIdx];
    if (r[0] !== 0 || r[r.length - 1] !== 0) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: rIdx }));
    }

    let time = input.earliest[0] + input.visitDurations[0];
    let prev = 0;

    for (let k = 1; k < r.length - 1; k++) {
      const c = r[k];
      if (c < 1 || c >= n) {
        return violation(formatTemplate(JMSG[locale].m5, { p0: c, p1: n - 1 }));
      }
      if (visited.has(c)) {
        return violation(formatTemplate(JMSG[locale].m6, { p0: c }));
      }
      visited.add(c);

      const stepTime = input.travelTimes[prev][c];
      totalTravel += stepTime;
      const start = Math.max(input.earliest[c], time + stepTime);
      if (start > input.latest[c] + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m7, {
            p0: c,
            p1: roundNice(start),
            p2: input.latest[c],
          })
        );
      }
      time = start + input.visitDurations[c];
      prev = c;
    }

    const backTime = input.travelTimes[prev][0];
    totalTravel += backTime;
    const returnTime = time + backTime;
    if (returnTime > input.latest[0] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: rIdx,
          p1: roundNice(returnTime),
          p2: input.latest[0],
        })
      );
    }
  }

  for (let c = 1; c < n; c++) {
    if (!visited.has(c)) {
      return violation(formatTemplate(JMSG[locale].m9, { p0: c }));
    }
  }

  if (!approxEqual(costCheck, totalTravel, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m10, {
        p0: roundNice(costCheck),
        p1: roundNice(totalTravel),
      })
    );
  }

  const preview = `${output.itineraries.length} itineraries | totalCost=${roundNice(totalTravel)}`;

  if (totalTravel > expectedOptimal + 1e-2) {
    return suboptimal(
      totalTravel,
      expectedOptimal,
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(totalTravel),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m12, { p0: expectedOptimal }),
    preview
  );
}
