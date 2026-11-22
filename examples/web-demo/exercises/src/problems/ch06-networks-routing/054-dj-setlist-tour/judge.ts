import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
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

export interface P054Input {
  transitions: number[][];
}

export interface P054Output {
  setlist: number[];
  totalCost: number;
}

export function judge(
  input: P054Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.transitions.length;
  const setlist = expectNumericArray(
    output.setlist,
    n,
    { en: "setlist", ja: "setlist", zh: "setlist" },
    locale
  );
  if (typeof setlist === "string") return runtimeError(setlist);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const seen = new Set<number>();
  for (let k = 0; k < n; k++) {
    const track = setlist[k];
    if (!Number.isInteger(track) || track < 0 || track >= n) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: k, p1: String(track), p2: n - 1 }));
    }
    if (seen.has(track)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: track }));
    }
    seen.add(track);
  }

  if (setlist[0] !== 0) {
    return violation(formatTemplate(JMSG[locale].m3, { p0: setlist[0] }));
  }

  let recomputed = 0;
  for (let k = 0; k < n; k++) {
    const u = setlist[k];
    const v = setlist[(k + 1) % n];
    recomputed += input.transitions[u][v];
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `setlist=[${setlist.join(" -> ")} -> 0] | totalCost=${roundNice(recomputed)}`;

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
