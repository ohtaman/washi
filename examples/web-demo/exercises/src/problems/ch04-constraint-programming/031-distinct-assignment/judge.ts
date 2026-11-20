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

export interface P031Input {
  numChannels: number;
  weights: number[];
  adjacentConflicts: number[][];
}

export interface P031Output {
  channels: number[];
  totalCost: number;
}

export function judge(
  input: P031Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.weights.length;
  const chRaw = expectNumericArray(
    output.channels,
    n,
    { en: "channels", ja: "channels", zh: "channels" },
    locale
  );
  if (typeof chRaw === "string") return runtimeError(chRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const used = new Set<number>();
  const clean: number[] = [];
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const raw = chRaw[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const ch = Math.round(raw);
    if (ch < 0 || ch >= input.numChannels) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: input.numChannels - 1, p2: ch })
      );
    }
    if (used.has(ch)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: ch }));
    }
    used.add(ch);
    clean.push(ch);
    recomputed += input.weights[i] * ch;
  }

  for (const [u, v] of input.adjacentConflicts) {
    if (Math.abs(clean[u] - clean[v]) < 2) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: u,
          p1: v,
          p2: clean[u],
          p3: clean[v],
        })
      );
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(costCheck), p1: recomputed })
    );
  }

  const preview = `channels=[${clean.join(", ")}] | totalCost=${recomputed}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: recomputed, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
