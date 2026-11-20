import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  checkIntegrality,
  expectFiniteNumber,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import { expectBooleanField } from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface DependencyRule {
  pkg: string;
  ver: string;
  depPkg: string;
  depVersions: string[];
}

export interface P043Input {
  packages: Record<string, string[]>;
  roots: string[];
  requires: DependencyRule[];
  conflicts: Array<[[string, string], [string, string]]>;
}

export interface P043Output {
  feasible: boolean;
  selected: Record<string, string | null> | null;
  installedCount: number | null;
}

function isSelectionValid(input: P043Input, sel: Record<string, string | null>): boolean {
  for (const root of input.roots) {
    if (sel[root] === null || sel[root] === undefined) return false;
  }
  for (const req of input.requires) {
    if (sel[req.pkg] === req.ver) {
      const chosenDep = sel[req.depPkg];
      if (chosenDep === null || !req.depVersions.includes(chosenDep)) {
        return false;
      }
    }
  }
  for (const [[p1, v1], [p2, v2]] of input.conflicts) {
    if (sel[p1] === v1 && sel[p2] === v2) {
      return false;
    }
  }
  return true;
}

function findMinimumInstalled(input: P043Input): number | null {
  const pkgNames = Object.keys(input.packages);
  const rootSet = new Set(input.roots);
  const current: Record<string, string | null> = {};
  let best: number | null = null;

  const search = (idx: number, count: number): void => {
    if (best !== null && count >= best) return;
    if (idx === pkgNames.length) {
      if (isSelectionValid(input, current)) {
        best = count;
      }
      return;
    }
    const pkg = pkgNames[idx];
    if (!rootSet.has(pkg)) {
      current[pkg] = null;
      search(idx + 1, count);
    }
    for (const ver of input.packages[pkg]) {
      current[pkg] = ver;
      search(idx + 1, count + 1);
    }
  };

  search(0, 0);
  return best;
}

export function judge(
  input: P043Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const feasCheck = expectBooleanField(output.feasible, "feasible", locale);
  if (typeof feasCheck === "string") return runtimeError(feasCheck);

  if (!feasCheck) {
    if (output.selected !== null || output.installedCount !== null) {
      return runtimeError(JMSG[locale].m1);
    }
    const minCount = findMinimumInstalled(input);
    if (minCount !== null) {
      return violation(JMSG[locale].m2);
    }
    return accepted(-1, JMSG[locale].m10, "feasible=false");
  }

  if (!isRecord(output.selected)) {
    return runtimeError(JMSG[locale].m0);
  }
  const countCheck = expectFiniteNumber(
    output.installedCount,
    { en: "installedCount", ja: "installedCount", zh: "installedCount" },
    locale
  );
  if (typeof countCheck === "string") return runtimeError(countCheck);

  const pkgNames = Object.keys(input.packages);
  const selectedRaw: Record<string, string | null> = {};
  for (const pkg of pkgNames) {
    const raw = Object.prototype.hasOwnProperty.call(output.selected, pkg)
      ? output.selected[pkg]
      : undefined;
    if (raw !== null && typeof raw !== "string") {
      return runtimeError(formatTemplate(JMSG[locale].m3, { p0: pkg, p1: String(raw) }));
    }
    selectedRaw[pkg] = raw;
  }

  const selectedClean: Record<string, string | null> = {};
  let actualCount = 0;

  for (const pkg of pkgNames) {
    const raw = selectedRaw[pkg];
    if (raw !== null && !input.packages[pkg].includes(raw)) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: pkg, p1: raw }));
    }
    selectedClean[pkg] = raw;
    if (raw !== null) actualCount++;
  }

  for (const root of input.roots) {
    if (selectedClean[root] === null) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: root }));
    }
  }

  for (const req of input.requires) {
    if (selectedClean[req.pkg] === req.ver) {
      const chosenDep = selectedClean[req.depPkg];
      if (chosenDep === null || !req.depVersions.includes(chosenDep)) {
        return violation(
          formatTemplate(JMSG[locale].m6, {
            p0: req.pkg,
            p1: req.ver,
            p2: req.depPkg,
            p3: req.depVersions.join(", "),
          })
        );
      }
    }
  }

  for (const [[p1, v1], [p2, v2]] of input.conflicts) {
    if (selectedClean[p1] === v1 && selectedClean[p2] === v2) {
      return violation(
        formatTemplate(JMSG[locale].m7, { p0: p1, p1: v1, p2: p2, p3: v2 })
      );
    }
  }

  if (!checkIntegrality(countCheck) || Math.round(countCheck) !== actualCount) {
    return violation(
      formatTemplate(JMSG[locale].m8, { p0: roundNice(countCheck), p1: actualCount })
    );
  }

  const minCount = findMinimumInstalled(input);
  const preview = pkgNames
    .filter((p) => selectedClean[p] !== null)
    .map((p) => `${p}@${selectedClean[p]}`)
    .join(", ");

  if (minCount !== null && actualCount > minCount) {
    return suboptimal(
      actualCount,
      minCount,
      formatTemplate(JMSG[locale].m9, { p0: actualCount, p1: minCount }),
      preview
    );
  }

  return accepted(actualCount, formatTemplate(JMSG[locale].m11, { p0: actualCount }), preview);
}
