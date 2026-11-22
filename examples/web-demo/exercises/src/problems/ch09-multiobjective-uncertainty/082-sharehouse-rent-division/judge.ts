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

export interface P082Input {
  valuations: number[][];
  totalRent: number;
}

export interface P082Output {
  assignment: number[];
  rents: number[];
  totalValuation: number;
  minSurplus: number;
}

function computeBestTotalValuation(valuations: number[][]): number {
  const n = valuations.length;
  const size = 1 << n;
  const dp = new Float64Array(size).fill(-Infinity);
  dp[0] = 0;

  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] === -Infinity) continue;
    let i = 0;
    for (let m = mask; m > 0; m &= m - 1) i++;
    if (i >= n) continue;
    for (let r = 0; r < n; r++) {
      if ((mask & (1 << r)) === 0) {
        const nextMask = mask | (1 << r);
        const val = dp[mask] + valuations[i][r];
        if (val > dp[nextMask]) {
          dp[nextMask] = val;
        }
      }
    }
  }
  return dp[size - 1];
}

export function judge(
  input: P082Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.valuations.length;
  const assignRaw = expectNumericArray(
    output.assignment,
    n,
    { en: "assignment", ja: "assignment", zh: "assignment" },
    locale
  );
  if (typeof assignRaw === "string") return runtimeError(assignRaw);

  const rentsRaw = expectNumericArray(
    output.rents,
    n,
    { en: "rents", ja: "rents", zh: "rents" },
    locale
  );
  if (typeof rentsRaw === "string") return runtimeError(rentsRaw);

  const totalValCheck = expectFiniteNumber(
    output.totalValuation,
    { en: "totalValuation", ja: "totalValuation", zh: "totalValuation" },
    locale
  );
  if (typeof totalValCheck === "string") return runtimeError(totalValCheck);

  const minSurplusCheck = expectFiniteNumber(
    output.minSurplus,
    { en: "minSurplus", ja: "minSurplus", zh: "minSurplus" },
    locale
  );
  if (typeof minSurplusCheck === "string") return runtimeError(minSurplusCheck);

  const cleanAssign: number[] = [];
  const usedRooms = new Set<number>();
  let actualTotalVal = 0;

  for (let i = 0; i < n; i++) {
    const raw = assignRaw[i];
    if (!checkIntegrality(raw)) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: n - 1, p2: roundNice(raw) })
      );
    }
    const r = Math.round(raw);
    if (r < 0 || r >= n) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: n - 1, p2: r }));
    }
    if (usedRooms.has(r)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: r }));
    }
    usedRooms.add(r);
    cleanAssign.push(r);
    actualTotalVal += input.valuations[i][r];
  }

  let rentSum = 0;
  for (let r = 0; r < n; r++) {
    if (rentsRaw[r] < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: r, p1: roundNice(rentsRaw[r]) })
      );
    }
    rentSum += rentsRaw[r];
  }

  if (!approxEqual(rentSum, input.totalRent, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(rentSum),
        p1: input.totalRent,
      })
    );
  }

  if (!approxEqual(totalValCheck, actualTotalVal, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(totalValCheck),
        p1: roundNice(actualTotalVal),
      })
    );
  }

  const bestTotalVal = computeBestTotalValuation(input.valuations);
  if (actualTotalVal < bestTotalVal - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(actualTotalVal),
        p1: roundNice(bestTotalVal),
      })
    );
  }

  let actualMinSurplus = Infinity;
  for (let i = 0; i < n; i++) {
    const ri = cleanAssign[i];
    const ownSurplus = input.valuations[i][ri] - rentsRaw[ri];
    if (ownSurplus < actualMinSurplus) {
      actualMinSurplus = ownSurplus;
    }
    for (let r = 0; r < n; r++) {
      if (r === ri) continue;
      const otherSurplus = input.valuations[i][r] - rentsRaw[r];
      if (ownSurplus + 1e-4 < otherSurplus) {
        return violation(
          formatTemplate(JMSG[locale].m7, {
            p0: i,
            p1: ri,
            p2: roundNice(ownSurplus),
            p3: r,
            p4: roundNice(otherSurplus),
          })
        );
      }
    }
  }

  if (!approxEqual(minSurplusCheck, actualMinSurplus, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(minSurplusCheck),
        p1: roundNice(actualMinSurplus),
      })
    );
  }

  const cleanRents = rentsRaw.map((v) => roundNice(Math.max(0, v), 2));
  const preview = `assignment=[${cleanAssign.join(", ")}] | rents=[${cleanRents.join(", ")}] | totalVal=${roundNice(actualTotalVal)} | minSurplus=${roundNice(actualMinSurplus)}`;

  if (actualMinSurplus < expectedOptimal - 1e-2) {
    return suboptimal(
      actualMinSurplus,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(actualMinSurplus),
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
