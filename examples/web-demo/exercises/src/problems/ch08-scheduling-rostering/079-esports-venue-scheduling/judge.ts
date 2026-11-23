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

export interface P079Input {
  durations: number[];
  scores: number[];
  compatible: number[][];
  numSlots: number;
  regularLength: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedVenue: number[];
  assignedSlot: number[];
  overtime: number[][];
  netScore: number;
}

export function judge(
  input: P079Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const M = input.durations.length;
  const V = input.compatible[0].length;
  const S = input.numSlots;

  const venueRaw = expectNumericArray(
    output.assignedVenue,
    M,
    { en: "assignedVenue", ja: "assignedVenue", zh: "assignedVenue" },
    locale
  );
  if (typeof venueRaw === "string") return runtimeError(venueRaw);

  const slotRaw = expectNumericArray(
    output.assignedSlot,
    M,
    { en: "assignedSlot", ja: "assignedSlot", zh: "assignedSlot" },
    locale
  );
  if (typeof slotRaw === "string") return runtimeError(slotRaw);

  if (!Array.isArray(output.overtime) || output.overtime.length !== V) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: V, p1: S }));
  }
  const overtime: number[][] = [];
  for (let v = 0; v < V; v++) {
    const row = expectNumericArray(
      output.overtime[v],
      S,
      { en: `overtime[${v}]`, ja: `overtime[${v}]`, zh: `overtime[${v}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    overtime.push(row);
  }

  const scoreCheck = expectFiniteNumber(
    output.netScore,
    { en: "netScore", ja: "netScore", zh: "netScore" },
    locale
  );
  if (typeof scoreCheck === "string") return runtimeError(scoreCheck);

  const loads = Array.from({ length: V }, () => new Array(S).fill(0));
  const venues: number[] = [];
  const slots: number[] = [];
  let totalScore = 0;

  for (let m = 0; m < M; m++) {
    if (!checkIntegrality(venueRaw[m]) || !checkIntegrality(slotRaw[m])) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: m,
          p1: roundNice(venueRaw[m]),
          p2: roundNice(slotRaw[m]),
        })
      );
    }
    const v = Math.round(venueRaw[m]);
    const s = Math.round(slotRaw[m]);
    if (v === -1 && s === -1) {
      venues.push(-1);
      slots.push(-1);
      continue;
    }
    if (v < 0 || v >= V || s < 0 || s >= S) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: m, p1: v, p2: s }));
    }
    if (input.compatible[m][v] !== 1) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: m, p1: v }));
    }
    venues.push(v);
    slots.push(s);
    loads[v][s] += input.durations[m];
    totalScore += input.scores[m];
  }

  let totalOvertime = 0;
  for (let v = 0; v < V; v++) {
    for (let s = 0; s < S; s++) {
      const ot = overtime[v][s];
      if (ot < -1e-4 || ot > input.maxOvertime + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m4, {
            p0: v,
            p1: s,
            p2: roundNice(ot),
            p3: input.maxOvertime,
          })
        );
      }
      const maxAllowed = input.regularLength + ot;
      if (loads[v][s] > maxAllowed + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: v,
            p1: s,
            p2: roundNice(loads[v][s]),
            p3: roundNice(maxAllowed),
          })
        );
      }
      totalOvertime += Math.max(0, ot);
    }
  }

  const recomputed = totalScore - input.overtimeCost * totalOvertime;
  if (!approxEqual(scoreCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(scoreCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `venues=[${venues.join(", ")}] | slots=[${slots.join(", ")}] | netScore=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
