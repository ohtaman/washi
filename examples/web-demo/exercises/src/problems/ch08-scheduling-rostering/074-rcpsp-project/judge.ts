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

export interface P074Input {
  durations: number[];
  demands: number[][];
  capacities: number[];
  precedences: number[][];
}

export interface P074Output {
  starts: number[];
  makespan: number;
}

export function judge(
  input: P074Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.durations.length;
  const startsRaw = expectNumericArray(
    output.starts,
    n,
    { en: "starts", ja: "starts", zh: "starts" },
    locale
  );
  if (typeof startsRaw === "string") return runtimeError(startsRaw);

  const makespanCheck = expectFiniteNumber(
    output.makespan,
    { en: "makespan", ja: "makespan", zh: "makespan" },
    locale
  );
  if (typeof makespanCheck === "string") return runtimeError(makespanCheck);

  const starts: number[] = [];
  let recomputedMakespan = 0;
  for (let i = 0; i < n; i++) {
    const sRaw = startsRaw[i];
    if (!checkIntegrality(sRaw) || sRaw < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(sRaw) }));
    }
    const s = Math.round(sRaw);
    if (s < 0) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: s }));
    }
    starts.push(s);
    const end = s + input.durations[i];
    if (end > recomputedMakespan) recomputedMakespan = end;
  }

  for (const [u, v] of input.precedences) {
    const finishU = starts[u] + input.durations[u];
    if (finishU > starts[v]) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: u,
          p1: finishU,
          p2: v,
          p3: starts[v],
        })
      );
    }
  }

  const checkTimes = Array.from(new Set(starts));
  for (let r = 0; r < input.capacities.length; r++) {
    const cap = input.capacities[r];
    for (const t of checkTimes) {
      let load = 0;
      for (let i = 0; i < n; i++) {
        if (starts[i] <= t && t < starts[i] + input.durations[i]) {
          load += input.demands[r][i];
        }
      }
      if (load > cap) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: r,
            p1: t,
            p2: load,
            p3: cap,
          })
        );
      }
    }
  }

  if (!approxEqual(makespanCheck, recomputedMakespan, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(makespanCheck),
        p1: recomputedMakespan,
      })
    );
  }

  const preview = `makespan=${recomputedMakespan} | starts=[${starts.join(", ")}]`;

  if (recomputedMakespan > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedMakespan,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, {
        p0: recomputedMakespan,
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
