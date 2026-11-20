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

export interface P078Input {
  courseSizes: number[];
  roomCapacities: number[];
  teachers: number[];
  cohorts: number[][];
  slotScores: number[][];
}

export interface P078Output {
  rooms: number[];
  slots: number[];
  totalScore: number;
}

export function judge(
  input: P078Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const C = input.courseSizes.length;
  const R = input.roomCapacities.length;
  const T = input.slotScores[0].length;

  const roomsRaw = expectNumericArray(
    output.rooms,
    C,
    { en: "rooms", ja: "rooms", zh: "rooms" },
    locale
  );
  if (typeof roomsRaw === "string") return runtimeError(roomsRaw);

  const slotsRaw = expectNumericArray(
    output.slots,
    C,
    { en: "slots", ja: "slots", zh: "slots" },
    locale
  );
  if (typeof slotsRaw === "string") return runtimeError(slotsRaw);

  const scoreCheck = expectFiniteNumber(
    output.totalScore,
    { en: "totalScore", ja: "totalScore", zh: "totalScore" },
    locale
  );
  if (typeof scoreCheck === "string") return runtimeError(scoreCheck);

  const rooms: number[] = [];
  const slots: number[] = [];
  let recomputed = 0;

  for (let c = 0; c < C; c++) {
    if (!checkIntegrality(roomsRaw[c])) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: c, p1: roundNice(roomsRaw[c]), p2: R - 1 })
      );
    }
    const r = Math.round(roomsRaw[c]);
    if (r < 0 || r >= R) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: c, p1: r, p2: R - 1 }));
    }

    if (!checkIntegrality(slotsRaw[c])) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: c, p1: roundNice(slotsRaw[c]), p2: T - 1 })
      );
    }
    const t = Math.round(slotsRaw[c]);
    if (t < 0 || t >= T) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: c, p1: t, p2: T - 1 }));
    }

    if (input.courseSizes[c] > input.roomCapacities[r]) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: c,
          p1: input.courseSizes[c],
          p2: r,
          p3: input.roomCapacities[r],
        })
      );
    }

    rooms.push(r);
    slots.push(t);
    recomputed += input.slotScores[c][t];
  }

  for (let a = 0; a < C; a++) {
    for (let b = a + 1; b < C; b++) {
      if (slots[a] !== slots[b]) continue;
      const slot = slots[a];
      if (rooms[a] === rooms[b]) {
        return violation(
          formatTemplate(JMSG[locale].m4, { p0: a, p1: b, p2: rooms[a], p3: slot })
        );
      }
      if (input.teachers[a] === input.teachers[b]) {
        return violation(
          formatTemplate(JMSG[locale].m5, { p0: a, p1: b, p2: input.teachers[a], p3: slot })
        );
      }
      const cohortSetA = new Set(input.cohorts[a]);
      const sharedCohort = input.cohorts[b].find((g) => cohortSetA.has(g));
      if (sharedCohort !== undefined) {
        return violation(
          formatTemplate(JMSG[locale].m6, { p0: a, p1: b, p2: sharedCohort, p3: slot })
        );
      }
    }
  }

  if (!approxEqual(scoreCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(scoreCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `rooms=[${rooms.join(", ")}] | slots=[${slots.join(", ")}] | score=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, { p0: expectedOptimal }),
    preview
  );
}
