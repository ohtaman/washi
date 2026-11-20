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

export interface P036Input {
  capacity: number;
  durations: number[];
  demands: number[];
  precedences: number[][];
}

export interface P036Output {
  starts: number[];
  makespan: number;
}

export function judge(
  input: P036Input,
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
    if (st < 0) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: st }));
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

  let peakLoad = 0;
  for (let i = 0; i < n; i++) {
    const t = clean[i];
    if (input.durations[i] === 0) continue;
    let load = 0;
    for (let j = 0; j < n; j++) {
      if (clean[j] <= t && t < clean[j] + input.durations[j]) {
        load += input.demands[j];
      }
    }
    if (load > peakLoad) peakLoad = load;
    if (load > input.capacity) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: t,
          p1: load,
          p2: input.capacity,
        })
      );
    }
  }

  if (!approxEqual(msCheck, maxFinish, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(msCheck), p1: maxFinish })
    );
  }

  const preview = `starts=[${clean.join(", ")}] | peak=${peakLoad}/${input.capacity} | makespan=${maxFinish}`;

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
