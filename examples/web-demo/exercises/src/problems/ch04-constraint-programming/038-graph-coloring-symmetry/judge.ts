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

export interface P038Input {
  numNodes: number;
  maxColors: number;
  edges: number[][];
}

export interface P038Output {
  colors: number[];
  usedColors: number;
}

export function judge(
  input: P038Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.numNodes;
  const rawColors = expectNumericArray(
    output.colors,
    n,
    { en: "colors", ja: "colors", zh: "colors" },
    locale
  );
  if (typeof rawColors === "string") return runtimeError(rawColors);

  const usedCheck = expectFiniteNumber(
    output.usedColors,
    { en: "usedColors", ja: "usedColors", zh: "usedColors" },
    locale
  );
  if (typeof usedCheck === "string") return runtimeError(usedCheck);

  const usedSet = new Set<number>();
  const clean: number[] = [];

  for (let i = 0; i < n; i++) {
    const raw = rawColors[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const c = Math.round(raw);
    if (c < 0 || c >= input.maxColors) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: c, p2: input.maxColors - 1 })
      );
    }
    clean.push(c);
    usedSet.add(c);
  }

  for (const [u, v] of input.edges) {
    if (clean[u] === clean[v]) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: u, p1: v, p2: clean[u] })
      );
    }
  }

  const actualUsed = usedSet.size;
  if (!approxEqual(usedCheck, actualUsed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(usedCheck), p1: actualUsed })
    );
  }

  const preview = `colors=[${clean.join(", ")}] | usedColors=${actualUsed}`;

  if (actualUsed > expectedOptimal + 1e-2) {
    return suboptimal(
      actualUsed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: actualUsed, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
