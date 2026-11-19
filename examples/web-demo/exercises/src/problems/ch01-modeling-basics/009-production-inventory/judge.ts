import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  formatTemplate,
  approxEqual,
  expectFiniteNumber,
  expectNumericArray,
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

export interface P009Input {
  demands: number[];
  regCap: number[];
  otCap: number[];
  invCap: number;
  initialInventory: number;
  minFinalInventory: number;
  regCost: number;
  otCost: number;
  holdCost: number;
}

export interface P009Output {
  regular: number[];
  overtime: number[];
  inventory: number[];
  totalCost: number;
}

export function judge(
  input: P009Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(
      JMSG[locale].m0
    );
  }

  const T = input.demands.length;
  const reg = expectNumericArray(
    output.regular,
    T,
    { en: "regular", ja: "regular", zh: "regular" },
    locale
  );
  if (typeof reg === "string") return runtimeError(reg);

  const ot = expectNumericArray(
    output.overtime,
    T,
    { en: "overtime", ja: "overtime", zh: "overtime" },
    locale
  );
  if (typeof ot === "string") return runtimeError(ot);

  const inv = expectNumericArray(
    output.inventory,
    T,
    { en: "inventory", ja: "inventory", zh: "inventory" },
    locale
  );
  if (typeof inv === "string") return runtimeError(inv);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let prevInv = input.initialInventory;
  let trueCost = 0;

  for (let t = 0; t < T; t++) {
    if (reg[t] < -1e-6 || reg[t] > input.regCap[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: t, p1: roundNice(reg[t]), p2: input.regCap[t] })
      );
    }
    if (ot[t] < -1e-6 || ot[t] > input.otCap[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: t, p1: roundNice(ot[t]), p2: input.otCap[t] })
      );
    }
    if (inv[t] < -1e-6 || inv[t] > input.invCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: t, p1: roundNice(inv[t]), p2: input.invCap })
      );
    }

    const expectedInv = prevInv + reg[t] + ot[t] - input.demands[t];
    if (!approxEqual(inv[t], expectedInv, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: t, p1: roundNice(expectedInv), p2: roundNice(inv[t]) })
      );
    }

    trueCost +=
      input.regCost * reg[t] + input.otCost * ot[t] + input.holdCost * inv[t];
    prevInv = inv[t];
  }

  if (inv[T - 1] < input.minFinalInventory - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(inv[T - 1]), p1: input.minFinalInventory })
    );
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(costCheck), p1: roundNice(trueCost) })
    );
  }

  const preview = `inv=[${inv.map((v) => roundNice(v, 1)).join(", ")}]`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, { p0: roundNice(trueCost), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
