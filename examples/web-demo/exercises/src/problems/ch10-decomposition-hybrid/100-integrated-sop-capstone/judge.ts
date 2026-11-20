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

export interface PolicyRule {
  id: string;
  type: "must_run" | "must_idle" | "min_active" | "implies" | (string & {});
  line?: number;
  lines?: number[];
  ifLine?: number;
  thenLine?: number;
  thenActive?: boolean;
  weight?: number;
}

export interface P100Input {
  capacities: number[];
  fixedCosts: number[];
  prodCosts: number[];
  demand: number;
  baselineActive: number[];
  disruptionPenalty: number;
  hardRules: PolicyRule[];
  softRules: Array<PolicyRule & { weight: number }>;
}

export interface P100Output {
  droppedPolicies: string[];
  activeAssignments: number[];
  quantities: number[];
  totalCost: number;
}

function ruleSatisfied(rule: PolicyRule, active: number[]): boolean {
  switch (rule.type) {
    case "must_run":
      return active[rule.line!] === 1;
    case "must_idle":
      return active[rule.line!] === 0;
    case "min_active":
      return (rule.lines ?? []).some((idx) => active[idx] === 1);
    case "implies":
      return (
        active[rule.ifLine!] === 0 ||
        active[rule.thenLine!] === (rule.thenActive ? 1 : 0)
      );
    default:
      throw new Error(`Unsupported policy rule type: ${rule.type}`);
  }
}

function isPolicySetConsistent(
  input: P100Input,
  droppedIds: Set<string>
): boolean {
  const N = input.capacities.length;
  const retained: PolicyRule[] = [
    ...input.hardRules,
    ...input.softRules.filter((r) => !droppedIds.has(r.id)),
  ];
  const maskLimit = 1 << N;
  for (let mask = 0; mask < maskLimit; mask++) {
    let capSum = 0;
    const active = Array<number>(N);
    for (let i = 0; i < N; i++) {
      const bit = (mask >> i) & 1;
      active[i] = bit;
      capSum += bit * input.capacities[i];
    }
    if (capSum + 1e-6 < input.demand) continue;
    if (retained.every((rule) => ruleSatisfied(rule, active))) {
      return true;
    }
  }
  return false;
}

function computeMinimumDropWeight(input: P100Input): number {
  const S = input.softRules.length;
  let best = Number.POSITIVE_INFINITY;
  const subsetLimit = 1 << S;
  for (let mask = 0; mask < subsetLimit; mask++) {
    const dropped = new Set<string>();
    let weightSum = 0;
    for (let idx = 0; idx < S; idx++) {
      if ((mask >> idx) & 1) {
        dropped.add(input.softRules[idx].id);
        weightSum += input.softRules[idx].weight;
      }
    }
    if (weightSum < best && isPolicySetConsistent(input, dropped)) {
      best = weightSum;
    }
  }
  return best;
}

export function judge(
  input: P100Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  if (
    !Array.isArray(output.droppedPolicies) ||
    output.droppedPolicies.some((item) => typeof item !== "string")
  ) {
    return runtimeError(JMSG[locale].m1);
  }

  const N = input.capacities.length;
  const activeRaw = expectNumericArray(
    output.activeAssignments,
    N,
    { en: "activeAssignments", ja: "activeAssignments", zh: "activeAssignments" },
    locale
  );
  if (typeof activeRaw === "string") return runtimeError(activeRaw);

  const qtyRaw = expectNumericArray(
    output.quantities,
    N,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof qtyRaw === "string") return runtimeError(qtyRaw);

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const softById = new Map(input.softRules.map((r) => [r.id, r]));
  const droppedSet = new Set<string>();
  let droppedWeight = 0;
  for (const id of output.droppedPolicies as string[]) {
    const rule = softById.get(id);
    if (!rule) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id }));
    }
    if (droppedSet.has(id)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: id }));
    }
    droppedSet.add(id);
    droppedWeight += rule.weight;
  }

  if (!isPolicySetConsistent(input, droppedSet)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: output.droppedPolicies.join(", ") || "none",
      })
    );
  }

  const minDropWeight = computeMinimumDropWeight(input);
  if (droppedWeight > minDropWeight + 1e-6) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(droppedWeight),
        p1: roundNice(minDropWeight),
      })
    );
  }

  const active: number[] = [];
  const quantities: number[] = [];
  let totalSupply = 0;
  let recomputedCost = 0;

  for (let i = 0; i < N; i++) {
    const aRaw = activeRaw[i];
    if (!checkIntegrality(aRaw)) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: i, p1: roundNice(aRaw) }));
    }
    const y = Math.round(aRaw);
    if (y !== 0 && y !== 1) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: i, p1: y }));
    }

    const q = qtyRaw[i];
    const capAllowed = input.capacities[i] * y;
    if (q < -1e-4 || q > capAllowed + 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: i,
          p1: roundNice(q),
          p2: capAllowed,
        })
      );
    }

    const cleanQ = Math.max(0, q);
    const disrupted = y !== input.baselineActive[i] ? 1 : 0;
    active.push(y);
    quantities.push(cleanQ);
    totalSupply += cleanQ;
    recomputedCost +=
      input.fixedCosts[i] * y +
      input.prodCosts[i] * cleanQ +
      input.disruptionPenalty * disrupted;
  }

  const retained = [
    ...input.hardRules,
    ...input.softRules.filter((r) => !droppedSet.has(r.id)),
  ];
  for (const rule of retained) {
    if (!ruleSatisfied(rule, active)) {
      return violation(formatTemplate(JMSG[locale].m8, { p0: rule.id }));
    }
  }

  if (totalSupply < input.demand - 1e-3) {
    return violation(
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(totalSupply),
        p1: input.demand,
      })
    );
  }

  if (!approxEqual(totalCostCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m10, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `dropped=[${Array.from(droppedSet).join(",")}] | active=[${active.join(",")}] | totalCost=${roundNice(recomputedCost)}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(recomputedCost),
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
