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
  priorities: number[];
  compatible: number[][];
  numSessions: number;
  regularCapacity: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedRoom: number[];
  assignedSession: number[];
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

  const C = input.durations.length;
  const R = input.compatible[0].length;
  const S = input.numSessions;

  const roomRaw = expectNumericArray(
    output.assignedRoom,
    C,
    { en: "assignedRoom", ja: "assignedRoom", zh: "assignedRoom" },
    locale
  );
  if (typeof roomRaw === "string") return runtimeError(roomRaw);

  const sessionRaw = expectNumericArray(
    output.assignedSession,
    C,
    { en: "assignedSession", ja: "assignedSession", zh: "assignedSession" },
    locale
  );
  if (typeof sessionRaw === "string") return runtimeError(sessionRaw);

  if (!Array.isArray(output.overtime) || output.overtime.length !== R) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: R, p1: S }));
  }
  const overtime: number[][] = [];
  for (let r = 0; r < R; r++) {
    const row = expectNumericArray(
      output.overtime[r],
      S,
      { en: `overtime[${r}]`, ja: `overtime[${r}]`, zh: `overtime[${r}]` },
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

  const loads = Array.from({ length: R }, () => new Array(S).fill(0));
  const rooms: number[] = [];
  const sessions: number[] = [];
  let totalPriority = 0;

  for (let c = 0; c < C; c++) {
    if (!checkIntegrality(roomRaw[c]) || !checkIntegrality(sessionRaw[c])) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: c,
          p1: roundNice(roomRaw[c]),
          p2: roundNice(sessionRaw[c]),
        })
      );
    }
    const r = Math.round(roomRaw[c]);
    const s = Math.round(sessionRaw[c]);
    if (r === -1 && s === -1) {
      rooms.push(-1);
      sessions.push(-1);
      continue;
    }
    if (r < 0 || r >= R || s < 0 || s >= S) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: c, p1: r, p2: s }));
    }
    if (input.compatible[c][r] !== 1) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: c, p1: r }));
    }
    rooms.push(r);
    sessions.push(s);
    loads[r][s] += input.durations[c];
    totalPriority += input.priorities[c];
  }

  let totalOvertime = 0;
  for (let r = 0; r < R; r++) {
    for (let s = 0; s < S; s++) {
      const ot = overtime[r][s];
      if (ot < -1e-4 || ot > input.maxOvertime + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m4, {
            p0: r,
            p1: s,
            p2: roundNice(ot),
            p3: input.maxOvertime,
          })
        );
      }
      const maxAllowed = input.regularCapacity + ot;
      if (loads[r][s] > maxAllowed + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: r,
            p1: s,
            p2: roundNice(loads[r][s]),
            p3: roundNice(maxAllowed),
          })
        );
      }
      totalOvertime += Math.max(0, ot);
    }
  }

  const recomputed = totalPriority - input.overtimeCost * totalOvertime;
  if (!approxEqual(scoreCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(scoreCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `rooms=[${rooms.join(", ")}] | sessions=[${sessions.join(", ")}] | netScore=${roundNice(recomputed)}`;

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
