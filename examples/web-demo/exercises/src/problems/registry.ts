/// <reference path="../raw.d.ts" />
import type {
  JudgeResult,
  Locale,
  ProblemCase,
  ProblemDefinition,
  ProblemMeta,
} from "../types.js";
export { CHAPTERS } from "./chapters.js";

// #001
import p001Meta from "./ch01-modeling-basics/001-bakery-first-run/meta.json";
import p001Cases from "./ch01-modeling-basics/001-bakery-first-run/cases.json";
import p001En from "./ch01-modeling-basics/001-bakery-first-run/locales/en.json";
import p001Ja from "./ch01-modeling-basics/001-bakery-first-run/locales/ja.json";
import p001Zh from "./ch01-modeling-basics/001-bakery-first-run/locales/zh.json";
import p001WashiStarter from "./ch01-modeling-basics/001-bakery-first-run/washi/starter.ts?raw";
import p001WashiSolution from "./ch01-modeling-basics/001-bakery-first-run/washi/solution.ts?raw";
import p001HighspyStarter from "./ch01-modeling-basics/001-bakery-first-run/highspy/starter.py?raw";
import p001HighspySolution from "./ch01-modeling-basics/001-bakery-first-run/highspy/solution.py?raw";
import { judge as p001Judge } from "./ch01-modeling-basics/001-bakery-first-run/judge.js";

// #002
import p002Meta from "./ch01-modeling-basics/002-ice-cream-two-flavors/meta.json";
import p002Cases from "./ch01-modeling-basics/002-ice-cream-two-flavors/cases.json";
import p002En from "./ch01-modeling-basics/002-ice-cream-two-flavors/locales/en.json";
import p002Ja from "./ch01-modeling-basics/002-ice-cream-two-flavors/locales/ja.json";
import p002Zh from "./ch01-modeling-basics/002-ice-cream-two-flavors/locales/zh.json";
import p002WashiStarter from "./ch01-modeling-basics/002-ice-cream-two-flavors/washi/starter.ts?raw";
import p002WashiSolution from "./ch01-modeling-basics/002-ice-cream-two-flavors/washi/solution.ts?raw";
import p002HighspyStarter from "./ch01-modeling-basics/002-ice-cream-two-flavors/highspy/starter.py?raw";
import p002HighspySolution from "./ch01-modeling-basics/002-ice-cream-two-flavors/highspy/solution.py?raw";
import { judge as p002Judge } from "./ch01-modeling-basics/002-ice-cream-two-flavors/judge.js";

// #003
import p003Meta from "./ch01-modeling-basics/003-carry-on-integers/meta.json";
import p003Cases from "./ch01-modeling-basics/003-carry-on-integers/cases.json";
import p003En from "./ch01-modeling-basics/003-carry-on-integers/locales/en.json";
import p003Ja from "./ch01-modeling-basics/003-carry-on-integers/locales/ja.json";
import p003Zh from "./ch01-modeling-basics/003-carry-on-integers/locales/zh.json";
import p003WashiStarter from "./ch01-modeling-basics/003-carry-on-integers/washi/starter.ts?raw";
import p003WashiSolution from "./ch01-modeling-basics/003-carry-on-integers/washi/solution.ts?raw";
import p003HighspyStarter from "./ch01-modeling-basics/003-carry-on-integers/highspy/starter.py?raw";
import p003HighspySolution from "./ch01-modeling-basics/003-carry-on-integers/highspy/solution.py?raw";
import { judge as p003Judge } from "./ch01-modeling-basics/003-carry-on-integers/judge.js";

// #004
import p004Meta from "./ch01-modeling-basics/004-general-product-mix/meta.json";
import p004Cases from "./ch01-modeling-basics/004-general-product-mix/cases.json";
import p004En from "./ch01-modeling-basics/004-general-product-mix/locales/en.json";
import p004Ja from "./ch01-modeling-basics/004-general-product-mix/locales/ja.json";
import p004Zh from "./ch01-modeling-basics/004-general-product-mix/locales/zh.json";
import p004WashiStarter from "./ch01-modeling-basics/004-general-product-mix/washi/starter.ts?raw";
import p004WashiSolution from "./ch01-modeling-basics/004-general-product-mix/washi/solution.ts?raw";
import p004HighspyStarter from "./ch01-modeling-basics/004-general-product-mix/highspy/starter.py?raw";
import p004HighspySolution from "./ch01-modeling-basics/004-general-product-mix/highspy/solution.py?raw";
import { judge as p004Judge } from "./ch01-modeling-basics/004-general-product-mix/judge.js";

// #005
import p005Meta from "./ch01-modeling-basics/005-blending-nutrition/meta.json";
import p005Cases from "./ch01-modeling-basics/005-blending-nutrition/cases.json";
import p005En from "./ch01-modeling-basics/005-blending-nutrition/locales/en.json";
import p005Ja from "./ch01-modeling-basics/005-blending-nutrition/locales/ja.json";
import p005Zh from "./ch01-modeling-basics/005-blending-nutrition/locales/zh.json";
import p005WashiStarter from "./ch01-modeling-basics/005-blending-nutrition/washi/starter.ts?raw";
import p005WashiSolution from "./ch01-modeling-basics/005-blending-nutrition/washi/solution.ts?raw";
import p005HighspyStarter from "./ch01-modeling-basics/005-blending-nutrition/highspy/starter.py?raw";
import p005HighspySolution from "./ch01-modeling-basics/005-blending-nutrition/highspy/solution.py?raw";
import { judge as p005Judge } from "./ch01-modeling-basics/005-blending-nutrition/judge.js";

// #006
import p006Meta from "./ch01-modeling-basics/006-project-knapsack-binary/meta.json";
import p006Cases from "./ch01-modeling-basics/006-project-knapsack-binary/cases.json";
import p006En from "./ch01-modeling-basics/006-project-knapsack-binary/locales/en.json";
import p006Ja from "./ch01-modeling-basics/006-project-knapsack-binary/locales/ja.json";
import p006Zh from "./ch01-modeling-basics/006-project-knapsack-binary/locales/zh.json";
import p006WashiStarter from "./ch01-modeling-basics/006-project-knapsack-binary/washi/starter.ts?raw";
import p006WashiSolution from "./ch01-modeling-basics/006-project-knapsack-binary/washi/solution.ts?raw";
import p006HighspyStarter from "./ch01-modeling-basics/006-project-knapsack-binary/highspy/starter.py?raw";
import p006HighspySolution from "./ch01-modeling-basics/006-project-knapsack-binary/highspy/solution.py?raw";
import { judge as p006Judge } from "./ch01-modeling-basics/006-project-knapsack-binary/judge.js";

// #007
import p007Meta from "./ch01-modeling-basics/007-task-assignment/meta.json";
import p007Cases from "./ch01-modeling-basics/007-task-assignment/cases.json";
import p007En from "./ch01-modeling-basics/007-task-assignment/locales/en.json";
import p007Ja from "./ch01-modeling-basics/007-task-assignment/locales/ja.json";
import p007Zh from "./ch01-modeling-basics/007-task-assignment/locales/zh.json";
import p007WashiStarter from "./ch01-modeling-basics/007-task-assignment/washi/starter.ts?raw";
import p007WashiSolution from "./ch01-modeling-basics/007-task-assignment/washi/solution.ts?raw";
import p007HighspyStarter from "./ch01-modeling-basics/007-task-assignment/highspy/starter.py?raw";
import p007HighspySolution from "./ch01-modeling-basics/007-task-assignment/highspy/solution.py?raw";
import { judge as p007Judge } from "./ch01-modeling-basics/007-task-assignment/judge.js";

// #008
import p008Meta from "./ch01-modeling-basics/008-transportation-network/meta.json";
import p008Cases from "./ch01-modeling-basics/008-transportation-network/cases.json";
import p008En from "./ch01-modeling-basics/008-transportation-network/locales/en.json";
import p008Ja from "./ch01-modeling-basics/008-transportation-network/locales/ja.json";
import p008Zh from "./ch01-modeling-basics/008-transportation-network/locales/zh.json";
import p008WashiStarter from "./ch01-modeling-basics/008-transportation-network/washi/starter.ts?raw";
import p008WashiSolution from "./ch01-modeling-basics/008-transportation-network/washi/solution.ts?raw";
import p008HighspyStarter from "./ch01-modeling-basics/008-transportation-network/highspy/starter.py?raw";
import p008HighspySolution from "./ch01-modeling-basics/008-transportation-network/highspy/solution.py?raw";
import { judge as p008Judge } from "./ch01-modeling-basics/008-transportation-network/judge.js";

// #009
import p009Meta from "./ch01-modeling-basics/009-production-inventory/meta.json";
import p009Cases from "./ch01-modeling-basics/009-production-inventory/cases.json";
import p009En from "./ch01-modeling-basics/009-production-inventory/locales/en.json";
import p009Ja from "./ch01-modeling-basics/009-production-inventory/locales/ja.json";
import p009Zh from "./ch01-modeling-basics/009-production-inventory/locales/zh.json";
import p009WashiStarter from "./ch01-modeling-basics/009-production-inventory/washi/starter.ts?raw";
import p009WashiSolution from "./ch01-modeling-basics/009-production-inventory/washi/solution.ts?raw";
import p009HighspyStarter from "./ch01-modeling-basics/009-production-inventory/highspy/starter.py?raw";
import p009HighspySolution from "./ch01-modeling-basics/009-production-inventory/highspy/solution.py?raw";
import { judge as p009Judge } from "./ch01-modeling-basics/009-production-inventory/judge.js";

// #010
import p010Meta from "./ch01-modeling-basics/010-production-line-activation/meta.json";
import p010Cases from "./ch01-modeling-basics/010-production-line-activation/cases.json";
import p010En from "./ch01-modeling-basics/010-production-line-activation/locales/en.json";
import p010Ja from "./ch01-modeling-basics/010-production-line-activation/locales/ja.json";
import p010Zh from "./ch01-modeling-basics/010-production-line-activation/locales/zh.json";
import p010WashiStarter from "./ch01-modeling-basics/010-production-line-activation/washi/starter.ts?raw";
import p010WashiSolution from "./ch01-modeling-basics/010-production-line-activation/washi/solution.ts?raw";
import p010HighspyStarter from "./ch01-modeling-basics/010-production-line-activation/highspy/starter.py?raw";
import p010HighspySolution from "./ch01-modeling-basics/010-production-line-activation/highspy/solution.py?raw";
import { judge as p010Judge } from "./ch01-modeling-basics/010-production-line-activation/judge.js";

interface ProblemLocaleBundle {
  title: string;
  subtitle: string;
  tags: string[];
  caseNames: string[];
}

type RawProblemMeta = Omit<ProblemMeta, "title" | "subtitle" | "tags">;

interface RawProblemCase<TInput> {
  input: TInput;
  expectedOptimal: number;
}

function createCachedMarkdownLoader(
  loaders: Record<Locale, () => Promise<string>>
): (locale: Locale) => Promise<string> {
  const cache = new Map<Locale, Promise<string>>();
  return (locale: Locale) => {
    let pending = cache.get(locale);
    if (!pending) {
      pending = loaders[locale]().catch((err) => {
        cache.delete(locale);
        throw err;
      });
      cache.set(locale, pending);
    }
    return pending;
  };
}

function hydrateProblem<TInput, TOutput>(params: {
  rawMeta: unknown;
  rawCases: ReadonlyArray<RawProblemCase<TInput>>;
  locales: Record<Locale, ProblemLocaleBundle>;
  markdownLoaders: Record<Locale, () => Promise<string>>;
  washiStarter: string;
  washiSolution: string;
  highspyStarter: string;
  highspySolution: string;
  judge: (input: TInput, output: TOutput, expectedOptimal: number, locale: Locale) => JudgeResult;
}): ProblemDefinition<TInput, TOutput> {
  const { rawMeta, rawCases, locales } = params;
  const metaBase = rawMeta as RawProblemMeta;
  const meta: ProblemMeta = {
    ...metaBase,
    title: {
      en: locales.en.title,
      ja: locales.ja.title,
      zh: locales.zh.title,
    },
    subtitle: {
      en: locales.en.subtitle,
      ja: locales.ja.subtitle,
      zh: locales.zh.subtitle,
    },
    tags: {
      en: locales.en.tags,
      ja: locales.ja.tags,
      zh: locales.zh.tags,
    },
  };

  const cases: ProblemCase<TInput>[] = rawCases.map((c, idx) => ({
    name: {
      en: locales.en.caseNames[idx] ?? `Case ${idx + 1}`,
      ja: locales.ja.caseNames[idx] ?? `Case ${idx + 1}`,
      zh: locales.zh.caseNames[idx] ?? `Case ${idx + 1}`,
    },
    input: c.input,
    expectedOptimal: c.expectedOptimal,
  }));

  return {
    meta,
    loadMarkdown: createCachedMarkdownLoader(params.markdownLoaders),
    cases,
    washiStarter: params.washiStarter,
    washiSolution: params.washiSolution,
    highspyStarter: params.highspyStarter,
    highspySolution: params.highspySolution,
    judge: params.judge,
  };
}

export const PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p001Meta,
    rawCases: p001Cases,
    locales: { en: p001En, ja: p001Ja, zh: p001Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/001-bakery-first-run/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/001-bakery-first-run/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/001-bakery-first-run/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p001WashiStarter,
    washiSolution: p001WashiSolution,
    highspyStarter: p001HighspyStarter,
    highspySolution: p001HighspySolution,
    judge: p001Judge,
  }),
  hydrateProblem({
    rawMeta: p002Meta,
    rawCases: p002Cases,
    locales: { en: p002En, ja: p002Ja, zh: p002Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/002-ice-cream-two-flavors/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/002-ice-cream-two-flavors/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/002-ice-cream-two-flavors/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p002WashiStarter,
    washiSolution: p002WashiSolution,
    highspyStarter: p002HighspyStarter,
    highspySolution: p002HighspySolution,
    judge: p002Judge,
  }),
  hydrateProblem({
    rawMeta: p003Meta,
    rawCases: p003Cases,
    locales: { en: p003En, ja: p003Ja, zh: p003Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/003-carry-on-integers/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/003-carry-on-integers/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/003-carry-on-integers/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p003WashiStarter,
    washiSolution: p003WashiSolution,
    highspyStarter: p003HighspyStarter,
    highspySolution: p003HighspySolution,
    judge: p003Judge,
  }),
  hydrateProblem({
    rawMeta: p004Meta,
    rawCases: p004Cases,
    locales: { en: p004En, ja: p004Ja, zh: p004Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/004-general-product-mix/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/004-general-product-mix/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/004-general-product-mix/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p004WashiStarter,
    washiSolution: p004WashiSolution,
    highspyStarter: p004HighspyStarter,
    highspySolution: p004HighspySolution,
    judge: p004Judge,
  }),
  hydrateProblem({
    rawMeta: p005Meta,
    rawCases: p005Cases,
    locales: { en: p005En, ja: p005Ja, zh: p005Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/005-blending-nutrition/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/005-blending-nutrition/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/005-blending-nutrition/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p005WashiStarter,
    washiSolution: p005WashiSolution,
    highspyStarter: p005HighspyStarter,
    highspySolution: p005HighspySolution,
    judge: p005Judge,
  }),
  hydrateProblem({
    rawMeta: p006Meta,
    rawCases: p006Cases,
    locales: { en: p006En, ja: p006Ja, zh: p006Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/006-project-knapsack-binary/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/006-project-knapsack-binary/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/006-project-knapsack-binary/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p006WashiStarter,
    washiSolution: p006WashiSolution,
    highspyStarter: p006HighspyStarter,
    highspySolution: p006HighspySolution,
    judge: p006Judge,
  }),
  hydrateProblem({
    rawMeta: p007Meta,
    rawCases: p007Cases,
    locales: { en: p007En, ja: p007Ja, zh: p007Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/007-task-assignment/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/007-task-assignment/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/007-task-assignment/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p007WashiStarter,
    washiSolution: p007WashiSolution,
    highspyStarter: p007HighspyStarter,
    highspySolution: p007HighspySolution,
    judge: p007Judge,
  }),
  hydrateProblem({
    rawMeta: p008Meta,
    rawCases: p008Cases,
    locales: { en: p008En, ja: p008Ja, zh: p008Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/008-transportation-network/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/008-transportation-network/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/008-transportation-network/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p008WashiStarter,
    washiSolution: p008WashiSolution,
    highspyStarter: p008HighspyStarter,
    highspySolution: p008HighspySolution,
    judge: p008Judge,
  }),
  hydrateProblem({
    rawMeta: p009Meta,
    rawCases: p009Cases,
    locales: { en: p009En, ja: p009Ja, zh: p009Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/009-production-inventory/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/009-production-inventory/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/009-production-inventory/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p009WashiStarter,
    washiSolution: p009WashiSolution,
    highspyStarter: p009HighspyStarter,
    highspySolution: p009HighspySolution,
    judge: p009Judge,
  }),
  hydrateProblem({
    rawMeta: p010Meta,
    rawCases: p010Cases,
    locales: { en: p010En, ja: p010Ja, zh: p010Zh },
    markdownLoaders: {
      en: () => import("./ch01-modeling-basics/010-production-line-activation/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./ch01-modeling-basics/010-production-line-activation/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./ch01-modeling-basics/010-production-line-activation/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p010WashiStarter,
    washiSolution: p010WashiSolution,
    highspyStarter: p010HighspyStarter,
    highspySolution: p010HighspySolution,
    judge: p010Judge,
  }),
];

export function getProblemById(id: string): ProblemDefinition | undefined {
  return PROBLEMS.find((p) => p.meta.id === id);
}
