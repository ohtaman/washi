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

export interface GroupRule {
  guests: number[];
  minCount: number;
}

export interface P014Input {
  budget: number;
  baseEnjoyment: number[];
  bonusRates: number[];
  minSpend: number[];
  maxSpend: number[];
  implications: number[][];
  conflicts: number[][];
  groupRules: GroupRule[];
}

export interface P014Output {
  invite: number[];
  giftBudget: number[];
  totalEnjoyment: number;
}

export function judge(
  input: P014Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.baseEnjoyment.length;
  const inviteRaw = expectNumericArray(
    output.invite,
    n,
    { en: "invite", ja: "invite", zh: "invite" },
    locale
  );
  if (typeof inviteRaw === "string") return runtimeError(inviteRaw);

  const giftBudget = expectNumericArray(
    output.giftBudget,
    n,
    { en: "giftBudget", ja: "giftBudget", zh: "giftBudget" },
    locale
  );
  if (typeof giftBudget === "string") return runtimeError(giftBudget);

  const enjoymentCheck = expectFiniteNumber(
    output.totalEnjoyment,
    { en: "totalEnjoyment", ja: "totalEnjoyment", zh: "totalEnjoyment" },
    locale
  );
  if (typeof enjoymentCheck === "string") return runtimeError(enjoymentCheck);

  const inviteClean: number[] = [];
  let totalSpent = 0;
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const inv = inviteRaw[i];
    if (!checkIntegrality(inv)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(inv) }));
    }
    const invInt = Math.round(inv);
    if (invInt !== 0 && invInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: invInt }));
    }
    inviteClean.push(invInt);

    const g = giftBudget[i];
    if (g < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(g) }));
    }
    const minReq = input.minSpend[i] * invInt;
    const maxAllowed = input.maxSpend[i] * invInt;
    if (g < minReq - 1e-4 || g > maxAllowed + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(g),
          p2: invInt,
          p3: minReq,
          p4: maxAllowed,
        })
      );
    }

    totalSpent += g;
    recomputed += input.baseEnjoyment[i] * invInt + input.bonusRates[i] * g;
  }

  if (totalSpent > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(totalSpent),
        p1: input.budget,
      })
    );
  }

  for (const [a, b] of input.implications) {
    if (inviteClean[a] > inviteClean[b]) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: a, p1: b }));
    }
  }

  for (const [u, v] of input.conflicts) {
    if (inviteClean[u] + inviteClean[v] > 1) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: u, p1: v }));
    }
  }

  for (let r = 0; r < input.groupRules.length; r++) {
    const rule = input.groupRules[r];
    const count = rule.guests.reduce((acc, idx) => acc + inviteClean[idx], 0);
    if (count < rule.minCount) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: r,
          p1: count,
          p2: rule.minCount,
        })
      );
    }
  }

  if (!approxEqual(enjoymentCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(enjoymentCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `invite=[${inviteClean.join(", ")}] | giftBudget=[${giftBudget.map((v) => roundNice(v)).join(", ")}]`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
