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

export interface JobSpec {
  duration: number;
  power: number;
  machine: number;
  setupTimes: number[];
  postTimes: number[];
}

export interface ModeRule {
  jobs: [number, number];
  allowedPairs: number[][];
}

export interface P040Input {
  powerCap: number;
  jobs: JobSpec[];
  precedences: number[][];
  modeRules: ModeRule[];
}

export interface P040Output {
  starts: number[];
  modes: number[];
  makespan: number;
}

export function judge(
  input: P040Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.jobs.length;
  const rawStarts = expectNumericArray(
    output.starts,
    n,
    { en: "starts", ja: "starts", zh: "starts" },
    locale
  );
  if (typeof rawStarts === "string") return runtimeError(rawStarts);

  const rawModes = expectNumericArray(
    output.modes,
    n,
    { en: "modes", ja: "modes", zh: "modes" },
    locale
  );
  if (typeof rawModes === "string") return runtimeError(rawModes);

  const msCheck = expectFiniteNumber(
    output.makespan,
    { en: "makespan", ja: "makespan", zh: "makespan" },
    locale
  );
  if (typeof msCheck === "string") return runtimeError(msCheck);

  const cleanStarts: number[] = [];
  const cleanModes: number[] = [];
  let maxFinish = 0;

  for (let i = 0; i < n; i++) {
    const j = input.jobs[i];
    if (!checkIntegrality(rawStarts[i]) || !checkIntegrality(rawModes[i])) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: i,
          p1: roundNice(rawStarts[i]),
          p2: roundNice(rawModes[i]),
        })
      );
    }
    const st = Math.round(rawStarts[i]);
    const md = Math.round(rawModes[i]);
    if (md < 0 || md >= j.setupTimes.length) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: md,
          p2: j.setupTimes.length - 1,
        })
      );
    }
    const reqSetup = j.setupTimes[md];
    if (st < reqSetup) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: i, p1: st, p2: reqSetup, p3: md })
      );
    }
    cleanStarts.push(st);
    cleanModes.push(md);
    const fin = st + j.duration + j.postTimes[md];
    if (fin > maxFinish) maxFinish = fin;
  }

  for (const [u, v] of input.precedences) {
    const endU =
      cleanStarts[u] +
      input.jobs[u].duration +
      input.jobs[u].postTimes[cleanModes[u]];
    if (endU > cleanStarts[v]) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: u,
          p1: endU,
          p2: v,
          p3: cleanStarts[v],
        })
      );
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (input.jobs[i].machine !== input.jobs[j].machine) continue;
      const endI = cleanStarts[i] + input.jobs[i].duration;
      const endJ = cleanStarts[j] + input.jobs[j].duration;
      if (cleanStarts[i] < endJ && cleanStarts[j] < endI) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: input.jobs[i].machine,
            p1: i,
            p2: j,
            p3: `[${cleanStarts[i]}, ${endI})`,
            p4: `[${cleanStarts[j]}, ${endJ})`,
          })
        );
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const t = cleanStarts[i];
    if (input.jobs[i].duration === 0) continue;
    let totalPow = 0;
    for (let j = 0; j < n; j++) {
      if (cleanStarts[j] <= t && t < cleanStarts[j] + input.jobs[j].duration) {
        totalPow += input.jobs[j].power;
      }
    }
    if (totalPow > input.powerCap) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: t,
          p1: totalPow,
          p2: input.powerCap,
        })
      );
    }
  }

  for (let rIdx = 0; rIdx < input.modeRules.length; rIdx++) {
    const rule = input.modeRules[rIdx];
    const [u, v] = rule.jobs;
    const mu = cleanModes[u];
    const mv = cleanModes[v];
    const ok = rule.allowedPairs.some(([a, b]) => a === mu && b === mv);
    if (!ok) {
      return violation(
        formatTemplate(JMSG[locale].m7, { p0: rIdx, p1: u, p2: v, p3: mu, p4: mv })
      );
    }
  }

  if (!approxEqual(msCheck, maxFinish, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, { p0: roundNice(msCheck), p1: maxFinish })
    );
  }

  const preview = `starts=[${cleanStarts.join(", ")}] | modes=[${cleanModes.join(", ")}] | makespan=${maxFinish}`;

  if (maxFinish > expectedOptimal + 1e-2) {
    return suboptimal(
      maxFinish,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, { p0: maxFinish, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: expectedOptimal }),
    preview
  );
}
