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

export interface P073Input {
  machines: number[][];
  durations: number[][];
}

export interface P073Output {
  starts: number[][];
  makespan: number;
}

export function judge(
  input: P073Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const numJobs = input.durations.length;
  if (!Array.isArray(output.starts) || output.starts.length !== numJobs) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: numJobs }));
  }

  const starts: number[][] = [];
  for (let j = 0; j < numJobs; j++) {
    const row = expectNumericArray(
      output.starts[j],
      input.durations[j].length,
      { en: `starts[${j}]`, ja: `starts[${j}]`, zh: `starts[${j}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    starts.push(row);
  }

  const makespanCheck = expectFiniteNumber(
    output.makespan,
    { en: "makespan", ja: "makespan", zh: "makespan" },
    locale
  );
  if (typeof makespanCheck === "string") return runtimeError(makespanCheck);

  const intStarts: number[][] = [];
  const machineOps = new Map<number, Array<{ job: number; op: number; start: number; end: number }>>();
  let recomputedMakespan = 0;

  for (let j = 0; j < numJobs; j++) {
    const rowInt: number[] = [];
    for (let o = 0; o < input.durations[j].length; o++) {
      const sRaw = starts[j][o];
      if (!checkIntegrality(sRaw) || sRaw < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: j, p1: o, p2: roundNice(sRaw) })
        );
      }
      const s = Math.round(sRaw);
      if (s < 0) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: j, p1: o, p2: s }));
      }
      rowInt.push(s);
      const end = s + input.durations[j][o];
      if (end > recomputedMakespan) recomputedMakespan = end;

      const mach = input.machines[j][o];
      let list = machineOps.get(mach);
      if (!list) {
        list = [];
        machineOps.set(mach, list);
      }
      list.push({ job: j, op: o, start: s, end });
    }
    intStarts.push(rowInt);
  }

  for (let j = 0; j < numJobs; j++) {
    for (let o = 0; o < input.durations[j].length - 1; o++) {
      const finishPrev = intStarts[j][o] + input.durations[j][o];
      const startNext = intStarts[j][o + 1];
      if (finishPrev > startNext) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: j,
            p1: o,
            p2: finishPrev,
            p3: o + 1,
            p4: startNext,
          })
        );
      }
    }
  }

  for (const [mach, ops] of machineOps.entries()) {
    for (let a = 0; a < ops.length; a++) {
      for (let b = a + 1; b < ops.length; b++) {
        const A = ops[a];
        const B = ops[b];
        if (A.start < B.end && B.start < A.end) {
          return violation(
            formatTemplate(JMSG[locale].m4, {
              p0: mach,
              p1: `(${A.job},${A.op}) [${A.start},${A.end})`,
              p2: `(${B.job},${B.op}) [${B.start},${B.end})`,
            })
          );
        }
      }
    }
  }

  if (!approxEqual(makespanCheck, recomputedMakespan, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(makespanCheck),
        p1: recomputedMakespan,
      })
    );
  }

  const preview = `makespan=${recomputedMakespan} | starts=${JSON.stringify(intStarts)}`;

  if (recomputedMakespan > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedMakespan,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: recomputedMakespan,
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
