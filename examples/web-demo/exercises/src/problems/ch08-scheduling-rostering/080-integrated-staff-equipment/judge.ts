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

export interface P080Input {
  certified: number[][];
  equipNeeds: number[];
  equipCap: number;
  slotPenalties: number[][];
  staffCosts: number[];
  regularLimits: number[];
  maxLimits: number[];
  overtimeCosts: number[];
}

export interface P080Output {
  assignedStaff: number[];
  assignedSlot: number[];
  overtime: number[];
  totalCost: number;
}

export function judge(
  input: P080Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const N = input.certified.length;
  const J = input.equipNeeds.length;
  const T = input.slotPenalties[0].length;

  const staffRaw = expectNumericArray(
    output.assignedStaff,
    J,
    { en: "assignedStaff", ja: "assignedStaff", zh: "assignedStaff" },
    locale
  );
  if (typeof staffRaw === "string") return runtimeError(staffRaw);

  const slotRaw = expectNumericArray(
    output.assignedSlot,
    J,
    { en: "assignedSlot", ja: "assignedSlot", zh: "assignedSlot" },
    locale
  );
  if (typeof slotRaw === "string") return runtimeError(slotRaw);

  const overtimeRaw = expectNumericArray(
    output.overtime,
    N,
    { en: "overtime", ja: "overtime", zh: "overtime" },
    locale
  );
  if (typeof overtimeRaw === "string") return runtimeError(overtimeRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const assignedStaff: number[] = [];
  const assignedSlot: number[] = [];
  const workCount = new Array(N).fill(0);
  const slotEquipUsed = new Array(T).fill(0);
  const staffSlotUsed = new Set<string>();
  let recomputed = 0;

  for (let j = 0; j < J; j++) {
    if (!checkIntegrality(staffRaw[j])) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(staffRaw[j]), p2: N - 1 })
      );
    }
    const i = Math.round(staffRaw[j]);
    if (i < 0 || i >= N) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: i, p2: N - 1 }));
    }

    if (!checkIntegrality(slotRaw[j])) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: j, p1: roundNice(slotRaw[j]), p2: T - 1 })
      );
    }
    const t = Math.round(slotRaw[j]);
    if (t < 0 || t >= T) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: j, p1: t, p2: T - 1 }));
    }

    if (input.certified[i][j] !== 1) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: j }));
    }

    const key = `${i}:${t}`;
    if (staffSlotUsed.has(key)) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: i, p1: t }));
    }
    staffSlotUsed.add(key);

    workCount[i]++;
    slotEquipUsed[t] += input.equipNeeds[j];
    assignedStaff.push(i);
    assignedSlot.push(t);
    recomputed += input.slotPenalties[j][t];
  }

  for (let t = 0; t < T; t++) {
    if (slotEquipUsed[t] > input.equipCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: t,
          p1: roundNice(slotEquipUsed[t]),
          p2: input.equipCap,
        })
      );
    }
  }

  for (let i = 0; i < N; i++) {
    if (workCount[i] > input.maxLimits[i]) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: i,
          p1: workCount[i],
          p2: input.maxLimits[i],
        })
      );
    }
    const minOt = Math.max(0, workCount[i] - input.regularLimits[i]);
    const ot = overtimeRaw[i];
    if (ot < -1e-4 || ot < minOt - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: i,
          p1: roundNice(ot),
          p2: minOt,
        })
      );
    }
    recomputed += input.staffCosts[i] * workCount[i] + input.overtimeCosts[i] * Math.max(0, ot);
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `staff=[${assignedStaff.join(", ")}] | slots=[${assignedSlot.join(", ")}] | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: expectedOptimal }),
    preview
  );
}
