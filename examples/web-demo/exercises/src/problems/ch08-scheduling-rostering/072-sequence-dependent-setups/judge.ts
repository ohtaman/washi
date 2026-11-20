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

export interface P072Input {
  processingTimes: number[];
  setupMatrix: number[][];
  dueDates: number[];
}

export interface P072Output {
  order: number[];
  completions: number[];
  totalTardiness: number;
}

export function judge(
  input: P072Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.processingTimes.length;
  const orderRaw = expectNumericArray(
    output.order,
    n,
    { en: "order", ja: "order", zh: "order" },
    locale
  );
  if (typeof orderRaw === "string") return runtimeError(orderRaw);

  const completions = expectNumericArray(
    output.completions,
    n,
    { en: "completions", ja: "completions", zh: "completions" },
    locale
  );
  if (typeof completions === "string") return runtimeError(completions);

  const objCheck = expectFiniteNumber(
    output.totalTardiness,
    { en: "totalTardiness", ja: "totalTardiness", zh: "totalTardiness" },
    locale
  );
  if (typeof objCheck === "string") return runtimeError(objCheck);

  const seen = new Set<number>();
  const order: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!checkIntegrality(orderRaw[k])) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: k, p1: roundNice(orderRaw[k]) }));
    }
    const job = Math.round(orderRaw[k]);
    if (job < 0 || job >= n || seen.has(job)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: k, p1: job }));
    }
    seen.add(job);
    order.push(job);
  }

  if (n > 0) {
    const first = order[0];
    if (completions[first] < input.processingTimes[first] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: first,
          p1: roundNice(completions[first]),
          p2: input.processingTimes[first],
        })
      );
    }
    for (let k = 1; k < n; k++) {
      const prev = order[k - 1];
      const curr = order[k];
      const minComp = completions[prev] + input.setupMatrix[prev][curr] + input.processingTimes[curr];
      if (completions[curr] < minComp - 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: prev,
            p1: curr,
            p2: roundNice(completions[curr]),
            p3: roundNice(minComp),
          })
        );
      }
    }
  }

  let recomputed = 0;
  for (let j = 0; j < n; j++) {
    recomputed += Math.max(0, completions[j] - input.dueDates[j]);
  }

  if (!approxEqual(objCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(objCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `order=[${order.join("->")}] | C=[${completions.map((v) => roundNice(v)).join(", ")}] | TT=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(recomputed),
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
