/// <reference path="../raw.d.ts" />
import type {
  JudgeResult,
  Locale,
  ProblemCase,
  ProblemDefinition,
  ProblemMeta,
} from "../types.js";

export interface ProblemLocaleBundle {
  title: string;
  subtitle: string;
  tags: string[];
  caseNames: string[];
}

export type RawProblemMeta = Omit<ProblemMeta, "title" | "subtitle" | "tags">;

export interface RawProblemCase<TInput> {
  input: TInput;
  expectedOptimal: number;
}

export function createCachedMarkdownLoader(
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

export function hydrateProblem<TInput, TOutput>(params: {
  rawMeta: unknown;
  rawCases: ReadonlyArray<RawProblemCase<TInput>>;
  locales: Record<Locale, ProblemLocaleBundle>;
  markdownLoaders: Record<Locale, () => Promise<string>>;
  editorialLoaders?: Record<Locale, () => Promise<string>>;
  washiStarter: string;
  washiSolution: string;
  highspyStarter?: string;
  highspySolution?: string;
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
    ...(params.editorialLoaders
      ? { loadEditorial: createCachedMarkdownLoader(params.editorialLoaders) }
      : {}),
    cases,
    washiStarter: params.washiStarter,
    washiSolution: params.washiSolution,
    highspyStarter: params.highspyStarter ?? "",
    highspySolution: params.highspySolution ?? "",
    judge: params.judge,
  };
}
