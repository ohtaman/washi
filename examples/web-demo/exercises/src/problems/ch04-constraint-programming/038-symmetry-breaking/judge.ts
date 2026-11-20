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
  numHosts: number;
  capacity: number;
  sizes: number[];
  conflicts: number[][];
}

export interface P038Output {
  hosts: number[];
  usedHosts: number;
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

  const n = input.sizes.length;
  const rawHosts = expectNumericArray(
    output.hosts,
    n,
    { en: "hosts", ja: "hosts", zh: "hosts" },
    locale
  );
  if (typeof rawHosts === "string") return runtimeError(rawHosts);

  const usedCheck = expectFiniteNumber(
    output.usedHosts,
    { en: "usedHosts", ja: "usedHosts", zh: "usedHosts" },
    locale
  );
  if (typeof usedCheck === "string") return runtimeError(usedCheck);

  const hostLoads = Array.from({ length: input.numHosts }, () => 0);
  const clean: number[] = [];

  for (let i = 0; i < n; i++) {
    const raw = rawHosts[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const h = Math.round(raw);
    if (h < 0 || h >= input.numHosts) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: h, p2: input.numHosts - 1 })
      );
    }
    clean.push(h);
    hostLoads[h] += input.sizes[i];
  }

  for (let k = 0; k < input.numHosts; k++) {
    if (hostLoads[k] > input.capacity) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: hostLoads[k],
          p2: input.capacity,
        })
      );
    }
  }

  for (const [u, v] of input.conflicts) {
    if (clean[u] === clean[v]) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: u, p1: v, p2: clean[u] })
      );
    }
  }

  const activeCount = hostLoads.filter((ld) => ld > 0).length;
  if (!approxEqual(usedCheck, activeCount, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(usedCheck), p1: activeCount })
    );
  }

  const preview = `hosts=[${clean.join(", ")}] | loads=[${hostLoads.join(", ")}] | usedHosts=${activeCount}`;

  if (activeCount > expectedOptimal + 1e-2) {
    return suboptimal(
      activeCount,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: activeCount, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
