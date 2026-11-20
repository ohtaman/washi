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

export interface P068Input {
  demands: number[];
  pMin: number[];
  pMax: number[];
  rampLimit: number[];
  minUp: number[];
  minDown: number[];
  startupCosts: number[];
  fuelCosts: number[];
}

export interface P068Output {
  commitment: number[][];
  generation: number[][];
  totalCost: number;
}

export function judge(
  input: P068Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const G = input.pMin.length;
  const T = input.demands.length;

  if (!Array.isArray(output.commitment) || output.commitment.length !== G) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "commitment", p1: G }));
  }
  if (!Array.isArray(output.generation) || output.generation.length !== G) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "generation", p1: G }));
  }

  const uRaw: number[][] = [];
  const pClean: number[][] = [];

  for (let g = 0; g < G; g++) {
    const uRow = expectNumericArray(
      output.commitment[g],
      T,
      { en: `commitment[${g}]`, ja: `commitment[${g}]`, zh: `commitment[${g}]` },
      locale
    );
    if (typeof uRow === "string") return runtimeError(uRow);

    const pRow = expectNumericArray(
      output.generation[g],
      T,
      { en: `generation[${g}]`, ja: `generation[${g}]`, zh: `generation[${g}]` },
      locale
    );
    if (typeof pRow === "string") return runtimeError(pRow);

    uRaw.push(uRow);
    pClean.push(pRow);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const uClean: number[][] = [];
  for (let g = 0; g < G; g++) {
    const uRow = uRaw[g];
    const pRow = pClean[g];
    const cleanU: number[] = [];
    for (let t = 0; t < T; t++) {
      if (!checkIntegrality(uRow[t])) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: g, p1: t, p2: roundNice(uRow[t]) })
        );
      }
      const uInt = Math.round(uRow[t]);
      if (uInt !== 0 && uInt !== 1) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: g, p1: t, p2: uInt }));
      }
      cleanU.push(uInt);

      const minBound = input.pMin[g] * uInt;
      const maxBound = input.pMax[g] * uInt;
      if (pRow[t] < minBound - 1e-4 || pRow[t] > maxBound + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: g,
            p1: t,
            p2: roundNice(pRow[t]),
            p3: minBound,
            p4: maxBound,
          })
        );
      }
    }

    uClean.push(cleanU);
  }

  for (let t = 0; t < T; t++) {
    let totalGen = 0;
    for (let g = 0; g < G; g++) totalGen += pClean[g][t];
    if (!approxEqual(totalGen, input.demands[t], 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: t,
          p1: roundNice(totalGen),
          p2: input.demands[t],
        })
      );
    }
  }

  let recomputed = 0;
  let totalStartups = 0;

  for (let g = 0; g < G; g++) {
    const startCap = Math.max(input.pMin[g], input.rampLimit[g]);
    for (let t = 0; t < T; t++) {
      const uCur = uClean[g][t];
      const uPrev = t === 0 ? 0 : uClean[g][t - 1];
      const pCur = pClean[g][t];
      const pPrev = t === 0 ? 0 : pClean[g][t - 1];

      // Ramp checks
      if (uPrev === 1 && uCur === 1) {
        if (Math.abs(pCur - pPrev) > input.rampLimit[g] + 1e-4) {
          return violation(
            formatTemplate(JMSG[locale].m5, {
              p0: g,
              p1: t,
              p2: roundNice(Math.abs(pCur - pPrev)),
              p3: input.rampLimit[g],
            })
          );
        }
      } else if (uPrev === 0 && uCur === 1) {
        if (pCur > startCap + 1e-4) {
          return violation(
            formatTemplate(JMSG[locale].m6, {
              p0: g,
              p1: t,
              p2: roundNice(pCur),
              p3: startCap,
            })
          );
        }
      } else if (uPrev === 1 && uCur === 0) {
        if (pPrev > startCap + 1e-4) {
          return violation(
            formatTemplate(JMSG[locale].m7, {
              p0: g,
              p1: t,
              p2: roundNice(pPrev),
              p3: startCap,
            })
          );
        }
      }

      // Min up time
      if (uCur === 1 && uPrev === 0) {
        totalStartups++;
        recomputed += input.startupCosts[g];
        const endUp = Math.min(T, t + input.minUp[g]);
        for (let k = t; k < endUp; k++) {
          if (uClean[g][k] !== 1) {
            return violation(
              formatTemplate(JMSG[locale].m8, {
                p0: g,
                p1: t,
                p2: input.minUp[g],
                p3: k,
              })
            );
          }
        }
      }

      // Min down time
      if (t >= 1 && uPrev === 1 && uCur === 0) {
        const endDown = Math.min(T, t + input.minDown[g]);
        for (let k = t; k < endDown; k++) {
          if (uClean[g][k] !== 0) {
            return violation(
              formatTemplate(JMSG[locale].m9, {
                p0: g,
                p1: t,
                p2: input.minDown[g],
                p3: k,
              })
            );
          }
        }
      }

      recomputed += input.fuelCosts[g] * pCur;
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m10, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `startups=${totalStartups} | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m12, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
