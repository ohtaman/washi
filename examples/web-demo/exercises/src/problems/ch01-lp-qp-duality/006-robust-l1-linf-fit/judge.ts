import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  formatTemplate,
  approxEqual,
  expectFiniteNumber,
  isRecord,
  roundNice,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P006Input {
  x: number[];
  y: number[];
  linfWeight: number;
}

export interface P006Output {
  slope: number;
  intercept: number;
  objective: number;
}

export function judge(
  input: P006Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const a = expectFiniteNumber(output.slope, { en: "slope", ja: "slope", zh: "slope" }, locale);
  if (typeof a === "string") return violation(a);

  const b = expectFiniteNumber(
    output.intercept,
    { en: "intercept", ja: "intercept", zh: "intercept" },
    locale
  );
  if (typeof b === "string") return violation(b);

  const objCheck = expectFiniteNumber(
    output.objective,
    { en: "objective", ja: "objective", zh: "objective" },
    locale
  );
  if (typeof objCheck === "string") return violation(objCheck);

  let l1 = 0;
  let linf = 0;
  for (let i = 0; i < input.x.length; i++) {
    const err = Math.abs(a * input.x[i] + b - input.y[i]);
    l1 += err;
    if (err > linf) linf = err;
  }

  const trueObj = l1 + input.linfWeight * linf;
  if (!approxEqual(objCheck, trueObj, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: roundNice(objCheck, 4), p1: input.linfWeight, p2: roundNice(trueObj, 4) })
    );
  }

  const preview = `slope=${roundNice(a, 3)}, intercept=${roundNice(b, 3)}`;

  if (trueObj > expectedOptimal + 1e-2) {
    return suboptimal(
      trueObj,
      expectedOptimal,
      formatTemplate(JMSG[locale].m2, { p0: roundNice(trueObj, 4), p1: roundNice(expectedOptimal, 4) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m3, { p0: roundNice(expectedOptimal, 4) }),
    preview
  );
}
