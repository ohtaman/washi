export type Locale = "en" | "ja" | "zh";

export type RuntimeId = "washi" | "highspy";

export type ParadigmId = "LP" | "QP" | "MIP" | "CP" | "SMT";

export type ProblemRole = "tutorial" | "intro" | "core" | "applied" | "capstone";

export type ScaffoldLevel = "fix-one-line" | "fill-in" | "scratch";

export type VerdictStatus =
  | "AC"
  | "SUBOPTIMAL"
  | "VIOLATION"
  | "INFEASIBLE"
  | "RUNTIME_ERROR";

export type LocalizedString = Record<Locale, string>;

export interface ProblemCase<TInput = Record<string, unknown>> {
  name: LocalizedString;
  input: TInput;
  expectedOptimal: number;
}

export interface JudgeResult {
  status: Exclude<VerdictStatus, "RUNTIME_ERROR">;
  ok: boolean;
  message: string;
  yourObjective?: number;
  optimalObjective?: number;
  preview?: string;
}

export interface ProvenanceMeta {
  generatedBy: string;
  autoVerified: boolean;
  reviewedBy: string[];
}

export interface ProblemMeta {
  id: string;
  slug: string;
  chapter: number;
  order: number;
  role: ProblemRole;
  scaffold: ScaffoldLevel;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  paradigms: ParadigmId[];
  runtimes: RuntimeId[];
  solvers: string[];
  title: LocalizedString;
  subtitle: LocalizedString;
  tags: Record<Locale, string[]>;
  provenance: ProvenanceMeta;
}

export interface ChapterInfo {
  chapter: number;
  idRange: string;
  available: boolean;
  title: LocalizedString;
  description: LocalizedString;
  paradigms: ParadigmId[];
}

export interface ProblemDefinition<TInput = any, TOutput = any> {
  meta: ProblemMeta;
  markdown: Record<Locale, string>;
  cases: ProblemCase<TInput>[];
  washiStarter: string;
  washiSolution: string;
  highspyStarter: string;
  highspySolution: string;
  judge: (
    input: TInput,
    output: TOutput,
    expectedOptimal: number,
    locale: Locale
  ) => JudgeResult;
}
