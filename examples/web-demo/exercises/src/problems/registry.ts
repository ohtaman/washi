/// <reference path="../raw.d.ts" />
import type {
  JudgeResult,
  Locale,
  ProblemCase,
  ProblemDefinition,
  ProblemMeta,
} from "../types.js";
export { CHAPTERS } from "./chapters.js";

// T1
import t1Meta from "./tutorial/t1-first-run/meta.json";
import t1Cases from "./tutorial/t1-first-run/cases.json";
import t1En from "./tutorial/t1-first-run/locales/en.json";
import t1Ja from "./tutorial/t1-first-run/locales/ja.json";
import t1Zh from "./tutorial/t1-first-run/locales/zh.json";
import t1WashiStarter from "./tutorial/t1-first-run/washi/starter.ts?raw";
import t1WashiSolution from "./tutorial/t1-first-run/washi/solution.ts?raw";
import t1HighspyStarter from "./tutorial/t1-first-run/highspy/starter.py?raw";
import t1HighspySolution from "./tutorial/t1-first-run/highspy/solution.py?raw";
import { judge as t1Judge } from "./tutorial/t1-first-run/judge.js";

// T2
import t2Meta from "./tutorial/t2-constraints-and-integers/meta.json";
import t2Cases from "./tutorial/t2-constraints-and-integers/cases.json";
import t2En from "./tutorial/t2-constraints-and-integers/locales/en.json";
import t2Ja from "./tutorial/t2-constraints-and-integers/locales/ja.json";
import t2Zh from "./tutorial/t2-constraints-and-integers/locales/zh.json";
import t2WashiStarter from "./tutorial/t2-constraints-and-integers/washi/starter.ts?raw";
import t2WashiSolution from "./tutorial/t2-constraints-and-integers/washi/solution.ts?raw";
import t2HighspyStarter from "./tutorial/t2-constraints-and-integers/highspy/starter.py?raw";
import t2HighspySolution from "./tutorial/t2-constraints-and-integers/highspy/solution.py?raw";
import { judge as t2Judge } from "./tutorial/t2-constraints-and-integers/judge.js";

// #001
import p001Meta from "./ch01-lp-qp-duality/001-ice-cream-production/meta.json";
import p001Cases from "./ch01-lp-qp-duality/001-ice-cream-production/cases.json";
import p001En from "./ch01-lp-qp-duality/001-ice-cream-production/locales/en.json";
import p001Ja from "./ch01-lp-qp-duality/001-ice-cream-production/locales/ja.json";
import p001Zh from "./ch01-lp-qp-duality/001-ice-cream-production/locales/zh.json";
import p001WashiStarter from "./ch01-lp-qp-duality/001-ice-cream-production/washi/starter.ts?raw";
import p001WashiSolution from "./ch01-lp-qp-duality/001-ice-cream-production/washi/solution.ts?raw";
import p001HighspyStarter from "./ch01-lp-qp-duality/001-ice-cream-production/highspy/starter.py?raw";
import p001HighspySolution from "./ch01-lp-qp-duality/001-ice-cream-production/highspy/solution.py?raw";
import { judge as p001Judge } from "./ch01-lp-qp-duality/001-ice-cream-production/judge.js";

// #002
import p002Meta from "./ch01-lp-qp-duality/002-blending-nutrition/meta.json";
import p002Cases from "./ch01-lp-qp-duality/002-blending-nutrition/cases.json";
import p002En from "./ch01-lp-qp-duality/002-blending-nutrition/locales/en.json";
import p002Ja from "./ch01-lp-qp-duality/002-blending-nutrition/locales/ja.json";
import p002Zh from "./ch01-lp-qp-duality/002-blending-nutrition/locales/zh.json";
import p002WashiStarter from "./ch01-lp-qp-duality/002-blending-nutrition/washi/starter.ts?raw";
import p002WashiSolution from "./ch01-lp-qp-duality/002-blending-nutrition/washi/solution.ts?raw";
import p002HighspyStarter from "./ch01-lp-qp-duality/002-blending-nutrition/highspy/starter.py?raw";
import p002HighspySolution from "./ch01-lp-qp-duality/002-blending-nutrition/highspy/solution.py?raw";
import { judge as p002Judge } from "./ch01-lp-qp-duality/002-blending-nutrition/judge.js";

// #003
import p003Meta from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/meta.json";
import p003Cases from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/cases.json";
import p003En from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/locales/en.json";
import p003Ja from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/locales/ja.json";
import p003Zh from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/locales/zh.json";
import p003WashiStarter from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/washi/starter.ts?raw";
import p003WashiSolution from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/washi/solution.ts?raw";
import p003HighspyStarter from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/highspy/starter.py?raw";
import p003HighspySolution from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/highspy/solution.py?raw";
import { judge as p003Judge } from "./ch01-lp-qp-duality/003-fractional-charnes-cooper/judge.js";

// #004
import p004Meta from "./ch01-lp-qp-duality/004-minimax-workload/meta.json";
import p004Cases from "./ch01-lp-qp-duality/004-minimax-workload/cases.json";
import p004En from "./ch01-lp-qp-duality/004-minimax-workload/locales/en.json";
import p004Ja from "./ch01-lp-qp-duality/004-minimax-workload/locales/ja.json";
import p004Zh from "./ch01-lp-qp-duality/004-minimax-workload/locales/zh.json";
import p004WashiStarter from "./ch01-lp-qp-duality/004-minimax-workload/washi/starter.ts?raw";
import p004WashiSolution from "./ch01-lp-qp-duality/004-minimax-workload/washi/solution.ts?raw";
import p004HighspyStarter from "./ch01-lp-qp-duality/004-minimax-workload/highspy/starter.py?raw";
import p004HighspySolution from "./ch01-lp-qp-duality/004-minimax-workload/highspy/solution.py?raw";
import { judge as p004Judge } from "./ch01-lp-qp-duality/004-minimax-workload/judge.js";

// #005
import p005Meta from "./ch01-lp-qp-duality/005-positive-part-ramp/meta.json";
import p005Cases from "./ch01-lp-qp-duality/005-positive-part-ramp/cases.json";
import p005En from "./ch01-lp-qp-duality/005-positive-part-ramp/locales/en.json";
import p005Ja from "./ch01-lp-qp-duality/005-positive-part-ramp/locales/ja.json";
import p005Zh from "./ch01-lp-qp-duality/005-positive-part-ramp/locales/zh.json";
import p005WashiStarter from "./ch01-lp-qp-duality/005-positive-part-ramp/washi/starter.ts?raw";
import p005WashiSolution from "./ch01-lp-qp-duality/005-positive-part-ramp/washi/solution.ts?raw";
import p005HighspyStarter from "./ch01-lp-qp-duality/005-positive-part-ramp/highspy/starter.py?raw";
import p005HighspySolution from "./ch01-lp-qp-duality/005-positive-part-ramp/highspy/solution.py?raw";
import { judge as p005Judge } from "./ch01-lp-qp-duality/005-positive-part-ramp/judge.js";

// #006
import p006Meta from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/meta.json";
import p006Cases from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/cases.json";
import p006En from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/locales/en.json";
import p006Ja from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/locales/ja.json";
import p006Zh from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/locales/zh.json";
import p006WashiStarter from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/washi/starter.ts?raw";
import p006WashiSolution from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/washi/solution.ts?raw";
import p006HighspyStarter from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/highspy/starter.py?raw";
import p006HighspySolution from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/highspy/solution.py?raw";
import { judge as p006Judge } from "./ch01-lp-qp-duality/006-robust-l1-linf-fit/judge.js";

// #007
import p007Meta from "./ch01-lp-qp-duality/007-markowitz-portfolio/meta.json";
import p007Cases from "./ch01-lp-qp-duality/007-markowitz-portfolio/cases.json";
import p007En from "./ch01-lp-qp-duality/007-markowitz-portfolio/locales/en.json";
import p007Ja from "./ch01-lp-qp-duality/007-markowitz-portfolio/locales/ja.json";
import p007Zh from "./ch01-lp-qp-duality/007-markowitz-portfolio/locales/zh.json";
import p007WashiStarter from "./ch01-lp-qp-duality/007-markowitz-portfolio/washi/starter.ts?raw";
import p007WashiSolution from "./ch01-lp-qp-duality/007-markowitz-portfolio/washi/solution.ts?raw";
import p007HighspyStarter from "./ch01-lp-qp-duality/007-markowitz-portfolio/highspy/starter.py?raw";
import p007HighspySolution from "./ch01-lp-qp-duality/007-markowitz-portfolio/highspy/solution.py?raw";
import { judge as p007Judge } from "./ch01-lp-qp-duality/007-markowitz-portfolio/judge.js";

// #008
import p008Meta from "./ch01-lp-qp-duality/008-production-inventory/meta.json";
import p008Cases from "./ch01-lp-qp-duality/008-production-inventory/cases.json";
import p008En from "./ch01-lp-qp-duality/008-production-inventory/locales/en.json";
import p008Ja from "./ch01-lp-qp-duality/008-production-inventory/locales/ja.json";
import p008Zh from "./ch01-lp-qp-duality/008-production-inventory/locales/zh.json";
import p008WashiStarter from "./ch01-lp-qp-duality/008-production-inventory/washi/starter.ts?raw";
import p008WashiSolution from "./ch01-lp-qp-duality/008-production-inventory/washi/solution.ts?raw";
import p008HighspyStarter from "./ch01-lp-qp-duality/008-production-inventory/highspy/starter.py?raw";
import p008HighspySolution from "./ch01-lp-qp-duality/008-production-inventory/highspy/solution.py?raw";
import { judge as p008Judge } from "./ch01-lp-qp-duality/008-production-inventory/judge.js";

// #009
import p009Meta from "./ch01-lp-qp-duality/009-shadow-prices-duality/meta.json";
import p009Cases from "./ch01-lp-qp-duality/009-shadow-prices-duality/cases.json";
import p009En from "./ch01-lp-qp-duality/009-shadow-prices-duality/locales/en.json";
import p009Ja from "./ch01-lp-qp-duality/009-shadow-prices-duality/locales/ja.json";
import p009Zh from "./ch01-lp-qp-duality/009-shadow-prices-duality/locales/zh.json";
import p009WashiStarter from "./ch01-lp-qp-duality/009-shadow-prices-duality/washi/starter.ts?raw";
import p009WashiSolution from "./ch01-lp-qp-duality/009-shadow-prices-duality/washi/solution.ts?raw";
import p009HighspyStarter from "./ch01-lp-qp-duality/009-shadow-prices-duality/highspy/starter.py?raw";
import p009HighspySolution from "./ch01-lp-qp-duality/009-shadow-prices-duality/highspy/solution.py?raw";
import { judge as p009Judge } from "./ch01-lp-qp-duality/009-shadow-prices-duality/judge.js";

// #010
import p010Meta from "./ch01-lp-qp-duality/010-reduced-cost-pricing/meta.json";
import p010Cases from "./ch01-lp-qp-duality/010-reduced-cost-pricing/cases.json";
import p010En from "./ch01-lp-qp-duality/010-reduced-cost-pricing/locales/en.json";
import p010Ja from "./ch01-lp-qp-duality/010-reduced-cost-pricing/locales/ja.json";
import p010Zh from "./ch01-lp-qp-duality/010-reduced-cost-pricing/locales/zh.json";
import p010WashiStarter from "./ch01-lp-qp-duality/010-reduced-cost-pricing/washi/starter.ts?raw";
import p010WashiSolution from "./ch01-lp-qp-duality/010-reduced-cost-pricing/washi/solution.ts?raw";
import p010HighspyStarter from "./ch01-lp-qp-duality/010-reduced-cost-pricing/highspy/starter.py?raw";
import p010HighspySolution from "./ch01-lp-qp-duality/010-reduced-cost-pricing/highspy/solution.py?raw";
import { judge as p010Judge } from "./ch01-lp-qp-duality/010-reduced-cost-pricing/judge.js";

interface ProblemLocaleBundle {
  title: string;
  subtitle: string;
  tags: string[];
  caseNames: string[];
  markdown: string;
}

type RawProblemMeta = Omit<ProblemMeta, "title" | "subtitle" | "tags">;

interface RawProblemCase<TInput> {
  input: TInput;
  expectedOptimal: number;
}

function hydrateProblem<TInput, TOutput>(params: {
  rawMeta: unknown;
  rawCases: ReadonlyArray<RawProblemCase<TInput>>;
  locales: Record<Locale, ProblemLocaleBundle>;
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
    markdown: {
      en: locales.en.markdown,
      ja: locales.ja.markdown,
      zh: locales.zh.markdown,
    },
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
    rawMeta: t1Meta,
    rawCases: t1Cases,
    locales: { en: t1En, ja: t1Ja, zh: t1Zh },
    washiStarter: t1WashiStarter,
    washiSolution: t1WashiSolution,
    highspyStarter: t1HighspyStarter,
    highspySolution: t1HighspySolution,
    judge: t1Judge,
  }),
  hydrateProblem({
    rawMeta: t2Meta,
    rawCases: t2Cases,
    locales: { en: t2En, ja: t2Ja, zh: t2Zh },
    washiStarter: t2WashiStarter,
    washiSolution: t2WashiSolution,
    highspyStarter: t2HighspyStarter,
    highspySolution: t2HighspySolution,
    judge: t2Judge,
  }),
  hydrateProblem({
    rawMeta: p001Meta,
    rawCases: p001Cases,
    locales: { en: p001En, ja: p001Ja, zh: p001Zh },
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
