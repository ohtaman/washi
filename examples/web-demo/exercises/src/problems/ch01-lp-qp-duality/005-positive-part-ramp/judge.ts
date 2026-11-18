import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  formatTemplate,
  approxEqual,
  expectFiniteNumber,
  expectNumericArray,
  isRecord,
  roundNice,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P005Input {
  demands: number[];
  maxOutput: number;
  initialOutput: number;
  runCost: number;
  rampCost: number;
}

export interface P005Output {
  outputs: number[];
  totalCost: number;
}

export function judge(
  input: P005Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const T = input.demands.length;
  const outputs = expectNumericArray(
    output.outputs,
    T,
    { en: "outputs", ja: "outputs", zh: "outputs" },
    locale
  );
  if (typeof outputs === "string") return violation(outputs);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return violation(costCheck);

  let prev = input.initialOutput;
  let trueCost = 0;

  for (let t = 0; t < T; t++) {
    if (outputs[t] < input.demands[t] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: t, p1: roundNice(outputs[t]), p2: input.demands[t] })
      );
    }
    if (outputs[t] > input.maxOutput + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: t, p1: roundNice(outputs[t]), p2: input.maxOutput })
      );
    }

    const rampUp = Math.max(0, outputs[t] - prev);
    trueCost += input.runCost * outputs[t] + input.rampCost * rampUp;
    prev = outputs[t];
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(costCheck), p1: roundNice(trueCost) })
    );
  }

  const preview = `outputs=[${outputs.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, { p0: roundNice(trueCost), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
