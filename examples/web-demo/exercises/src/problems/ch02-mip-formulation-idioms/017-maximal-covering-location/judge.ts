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

export interface P017Input {
  demands: number[];
  distances: number[][];
  coverageRadius: number;
  maxFacilities: number;
}

export interface P017Output {
  open: number[];
  covered: number[];
  totalCoveredDemand: number;
}

export function judge(
  input: P017Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.demands.length;
  const mSites = input.distances[0]?.length ?? 0;

  const openRaw = expectNumericArray(
    output.open,
    mSites,
    { en: "open", ja: "open", zh: "open" },
    locale
  );
  if (typeof openRaw === "string") return runtimeError(openRaw);

  const covRaw = expectNumericArray(
    output.covered,
    n,
    { en: "covered", ja: "covered", zh: "covered" },
    locale
  );
  if (typeof covRaw === "string") return runtimeError(covRaw);

  const demandCheck = expectFiniteNumber(
    output.totalCoveredDemand,
    { en: "totalCoveredDemand", ja: "totalCoveredDemand", zh: "totalCoveredDemand" },
    locale
  );
  if (typeof demandCheck === "string") return runtimeError(demandCheck);

  const openClean: number[] = [];
  let openedCount = 0;
  for (let j = 0; j < mSites; j++) {
    const o = openRaw[j];
    if (!checkIntegrality(o)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(o) }));
    }
    const oInt = Math.round(o);
    if (oInt !== 0 && oInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: oInt }));
    }
    openClean.push(oInt);
    openedCount += oInt;
  }

  if (openedCount > input.maxFacilities) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: openedCount, p1: input.maxFacilities })
    );
  }

  const covClean: number[] = [];
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const c = covRaw[i];
    if (!checkIntegrality(c)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: roundNice(c) }));
    }
    const cInt = Math.round(c);
    if (cInt !== 0 && cInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: cInt }));
    }
    covClean.push(cInt);

    const openWithinRadius = openClean.reduce(
      (acc, oVal, j) => acc + (input.distances[i][j] <= input.coverageRadius + 1e-9 ? oVal : 0),
      0
    );
    if (cInt > openWithinRadius) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: i }));
    }

    recomputed += input.demands[i] * cInt;
  }

  if (!approxEqual(demandCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(demandCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `open=[${openClean.join(", ")}] | covered=[${covClean.join(", ")}]`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
