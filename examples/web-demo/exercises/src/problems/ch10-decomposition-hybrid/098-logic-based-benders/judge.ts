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

export interface P098Input {
  costs: number[][];
  durations: number[];
  releaseTimes: number[];
  deadlines: number[];
  horizon: number;
}

export interface P098Output {
  assignments: number[];
  starts: number[];
  totalCost: number;
}

export function judge(
  input: P098Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const N = input.costs.length;
  const M = N > 0 ? input.costs[0].length : 0;

  const assignRaw = expectNumericArray(
    output.assignments,
    N,
    { en: "assignments", ja: "assignments", zh: "assignments" },
    locale
  );
  if (typeof assignRaw === "string") return runtimeError(assignRaw);

  const startsRaw = expectNumericArray(
    output.starts,
    N,
    { en: "starts", ja: "starts", zh: "starts" },
    locale
  );
  if (typeof startsRaw === "string") return runtimeError(startsRaw);

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const assignments: number[] = [];
  const starts: number[] = [];
  const perMachine: number[][] = Array.from({ length: M }, () => []);
  let recomputedCost = 0;

  for (let j = 0; j < N; j++) {
    const mRaw = assignRaw[j];
    if (!checkIntegrality(mRaw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(mRaw) }));
    }
    const m = Math.round(mRaw);
    if (m < 0 || m >= M) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: j, p1: m, p2: M - 1 })
      );
    }

    const sRaw = startsRaw[j];
    if (!checkIntegrality(sRaw)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: j, p1: roundNice(sRaw) }));
    }
    const s = Math.round(sRaw);
    const finish = s + input.durations[j];

    if (s < input.releaseTimes[j]) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: j,
          p1: s,
          p2: input.releaseTimes[j],
        })
      );
    }
    if (finish > input.deadlines[j]) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: j,
          p1: finish,
          p2: input.deadlines[j],
        })
      );
    }
    if (finish > input.horizon) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: j,
          p1: finish,
          p2: input.horizon,
        })
      );
    }

    assignments.push(m);
    starts.push(s);
    perMachine[m].push(j);
    recomputedCost += input.costs[j][m];
  }

  for (let m = 0; m < M; m++) {
    const jobs = perMachine[m].slice().sort((a, b) => starts[a] - starts[b]);
    for (let idx = 1; idx < jobs.length; idx++) {
      const prev = jobs[idx - 1];
      const curr = jobs[idx];
      const prevEnd = starts[prev] + input.durations[prev];
      if (prevEnd > starts[curr]) {
        return violation(
          formatTemplate(JMSG[locale].m7, {
            p0: m,
            p1: prev,
            p2: prevEnd,
            p3: curr,
            p4: starts[curr],
          })
        );
      }
    }
  }

  if (!approxEqual(totalCostCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `assignments=[${assignments.join(",")}] | starts=[${starts.join(",")}] | totalCost=${recomputedCost}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, {
        p0: recomputedCost,
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
