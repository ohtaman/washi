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

export interface P035Input {
  durations: number[];
  releaseTimes: number[];
  machines: number[];
  precedences: number[][];
}

export interface P035Output {
  starts: number[];
  makespan: number;
}

export function judge(
  input: P035Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.durations.length;
  const rawStarts = expectNumericArray(
    output.starts,
    n,
    { en: "starts", ja: "starts", zh: "starts" },
    locale
  );
  if (typeof rawStarts === "string") return runtimeError(rawStarts);

  const msCheck = expectFiniteNumber(
    output.makespan,
    { en: "makespan", ja: "makespan", zh: "makespan" },
    locale
  );
  if (typeof msCheck === "string") return runtimeError(msCheck);

  const clean: number[] = [];
  let maxFinish = 0;

  for (let i = 0; i < n; i++) {
    const raw = rawStarts[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const st = Math.round(raw);
    if (st < input.releaseTimes[i]) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: st,
          p2: input.releaseTimes[i],
        })
      );
    }
    clean.push(st);
    const fin = st + input.durations[i];
    if (fin > maxFinish) maxFinish = fin;
  }

  for (const [u, v] of input.precedences) {
    const endU = clean[u] + input.durations[u];
    if (endU > clean[v]) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: u, p1: endU, p2: v, p3: clean[v] })
      );
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (input.machines[i] !== input.machines[j]) continue;
      const endI = clean[i] + input.durations[i];
      const endJ = clean[j] + input.durations[j];
      if (clean[i] < endJ && clean[j] < endI) {
        return violation(
          formatTemplate(JMSG[locale].m4, {
            p0: input.machines[i],
            p1: i,
            p2: j,
            p3: `[${clean[i]}, ${endI})`,
            p4: `[${clean[j]}, ${endJ})`,
          })
        );
      }
    }
  }

  if (!approxEqual(msCheck, maxFinish, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(msCheck), p1: maxFinish })
    );
  }

  const preview = `starts=[${clean.join(", ")}] | makespan=${maxFinish}`;

  if (maxFinish > expectedOptimal + 1e-2) {
    return suboptimal(
      maxFinish,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: maxFinish, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
