import type { ProblemDefinition } from "../../types.js";
import { hydrateProblem, type RawProblemCase } from "../hydrate.js";

// #041
import p041Meta from "./041-zebra-logic-puzzle/meta.json";
import p041Cases from "./041-zebra-logic-puzzle/cases.json";
import p041En from "./041-zebra-logic-puzzle/locales/en.json";
import p041Ja from "./041-zebra-logic-puzzle/locales/ja.json";
import p041Zh from "./041-zebra-logic-puzzle/locales/zh.json";
import p041WashiStarter from "./041-zebra-logic-puzzle/washi/starter.ts?raw";
import p041WashiSolution from "./041-zebra-logic-puzzle/washi/solution.ts?raw";
import { judge as p041Judge, type P041Input } from "./041-zebra-logic-puzzle/judge.js";

// #042
import p042Meta from "./042-uniqueness-nogood-cut/meta.json";
import p042Cases from "./042-uniqueness-nogood-cut/cases.json";
import p042En from "./042-uniqueness-nogood-cut/locales/en.json";
import p042Ja from "./042-uniqueness-nogood-cut/locales/ja.json";
import p042Zh from "./042-uniqueness-nogood-cut/locales/zh.json";
import p042WashiStarter from "./042-uniqueness-nogood-cut/washi/starter.ts?raw";
import p042WashiSolution from "./042-uniqueness-nogood-cut/washi/solution.ts?raw";
import { judge as p042Judge, type P042Input } from "./042-uniqueness-nogood-cut/judge.js";

// #043
import p043Meta from "./043-package-dependency-sat/meta.json";
import p043Cases from "./043-package-dependency-sat/cases.json";
import p043En from "./043-package-dependency-sat/locales/en.json";
import p043Ja from "./043-package-dependency-sat/locales/ja.json";
import p043Zh from "./043-package-dependency-sat/locales/zh.json";
import p043WashiStarter from "./043-package-dependency-sat/washi/starter.ts?raw";
import p043WashiSolution from "./043-package-dependency-sat/washi/solution.ts?raw";
import { judge as p043Judge, type P043Input } from "./043-package-dependency-sat/judge.js";

// #044
import p044Meta from "./044-policy-counterexample/meta.json";
import p044Cases from "./044-policy-counterexample/cases.json";
import p044En from "./044-policy-counterexample/locales/en.json";
import p044Ja from "./044-policy-counterexample/locales/ja.json";
import p044Zh from "./044-policy-counterexample/locales/zh.json";
import p044WashiStarter from "./044-policy-counterexample/washi/starter.ts?raw";
import p044WashiSolution from "./044-policy-counterexample/washi/solution.ts?raw";
import { judge as p044Judge, type P044Input } from "./044-policy-counterexample/judge.js";

// #045
import p045Meta from "./045-dead-redundant-rules/meta.json";
import p045Cases from "./045-dead-redundant-rules/cases.json";
import p045En from "./045-dead-redundant-rules/locales/en.json";
import p045Ja from "./045-dead-redundant-rules/locales/ja.json";
import p045Zh from "./045-dead-redundant-rules/locales/zh.json";
import p045WashiStarter from "./045-dead-redundant-rules/washi/starter.ts?raw";
import p045WashiSolution from "./045-dead-redundant-rules/washi/solution.ts?raw";
import { judge as p045Judge, type P045Input } from "./045-dead-redundant-rules/judge.js";

// #046
import p046Meta from "./046-puzzle-clue-diagnosis/meta.json";
import p046Cases from "./046-puzzle-clue-diagnosis/cases.json";
import p046En from "./046-puzzle-clue-diagnosis/locales/en.json";
import p046Ja from "./046-puzzle-clue-diagnosis/locales/ja.json";
import p046Zh from "./046-puzzle-clue-diagnosis/locales/zh.json";
import p046WashiStarter from "./046-puzzle-clue-diagnosis/washi/starter.ts?raw";
import p046WashiSolution from "./046-puzzle-clue-diagnosis/washi/solution.ts?raw";
import { judge as p046Judge, type P046Input } from "./046-puzzle-clue-diagnosis/judge.js";

// #047
import p047Meta from "./047-weighted-maxsat-repair/meta.json";
import p047Cases from "./047-weighted-maxsat-repair/cases.json";
import p047En from "./047-weighted-maxsat-repair/locales/en.json";
import p047Ja from "./047-weighted-maxsat-repair/locales/ja.json";
import p047Zh from "./047-weighted-maxsat-repair/locales/zh.json";
import p047WashiStarter from "./047-weighted-maxsat-repair/washi/starter.ts?raw";
import p047WashiSolution from "./047-weighted-maxsat-repair/washi/solution.ts?raw";
import { judge as p047Judge, type P047Input } from "./047-weighted-maxsat-repair/judge.js";

// #048
import p048Meta from "./048-historical-schedule-audit/meta.json";
import p048Cases from "./048-historical-schedule-audit/cases.json";
import p048En from "./048-historical-schedule-audit/locales/en.json";
import p048Ja from "./048-historical-schedule-audit/locales/ja.json";
import p048Zh from "./048-historical-schedule-audit/locales/zh.json";
import p048WashiStarter from "./048-historical-schedule-audit/washi/starter.ts?raw";
import p048WashiSolution from "./048-historical-schedule-audit/washi/solution.ts?raw";
import { judge as p048Judge, type P048Input } from "./048-historical-schedule-audit/judge.js";

// #049
import p049Meta from "./049-smt-lira-time-windows/meta.json";
import p049Cases from "./049-smt-lira-time-windows/cases.json";
import p049En from "./049-smt-lira-time-windows/locales/en.json";
import p049Ja from "./049-smt-lira-time-windows/locales/ja.json";
import p049Zh from "./049-smt-lira-time-windows/locales/zh.json";
import p049WashiStarter from "./049-smt-lira-time-windows/washi/starter.ts?raw";
import p049WashiSolution from "./049-smt-lira-time-windows/washi/solution.ts?raw";
import { judge as p049Judge, type P049Input } from "./049-smt-lira-time-windows/judge.js";

// #050
import p050Meta from "./050-rule-diagnosis-repair/meta.json";
import p050Cases from "./050-rule-diagnosis-repair/cases.json";
import p050En from "./050-rule-diagnosis-repair/locales/en.json";
import p050Ja from "./050-rule-diagnosis-repair/locales/ja.json";
import p050Zh from "./050-rule-diagnosis-repair/locales/zh.json";
import p050WashiStarter from "./050-rule-diagnosis-repair/washi/starter.ts?raw";
import p050WashiSolution from "./050-rule-diagnosis-repair/washi/solution.ts?raw";
import { judge as p050Judge, type P050Input } from "./050-rule-diagnosis-repair/judge.js";

export const CH05_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p041Meta,
    rawCases: p041Cases as unknown as RawProblemCase<P041Input>[],
    locales: { en: p041En, ja: p041Ja, zh: p041Zh },
    markdownLoaders: {
      en: () => import("./041-zebra-logic-puzzle/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./041-zebra-logic-puzzle/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./041-zebra-logic-puzzle/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./041-zebra-logic-puzzle/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./041-zebra-logic-puzzle/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./041-zebra-logic-puzzle/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p041WashiStarter,
    washiSolution: p041WashiSolution,
    judge: p041Judge,
  }),
  hydrateProblem({
    rawMeta: p042Meta,
    rawCases: p042Cases as unknown as RawProblemCase<P042Input>[],
    locales: { en: p042En, ja: p042Ja, zh: p042Zh },
    markdownLoaders: {
      en: () => import("./042-uniqueness-nogood-cut/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./042-uniqueness-nogood-cut/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./042-uniqueness-nogood-cut/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./042-uniqueness-nogood-cut/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./042-uniqueness-nogood-cut/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./042-uniqueness-nogood-cut/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p042WashiStarter,
    washiSolution: p042WashiSolution,
    judge: p042Judge,
  }),
  hydrateProblem({
    rawMeta: p043Meta,
    rawCases: p043Cases as unknown as RawProblemCase<P043Input>[],
    locales: { en: p043En, ja: p043Ja, zh: p043Zh },
    markdownLoaders: {
      en: () => import("./043-package-dependency-sat/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./043-package-dependency-sat/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./043-package-dependency-sat/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./043-package-dependency-sat/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./043-package-dependency-sat/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./043-package-dependency-sat/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p043WashiStarter,
    washiSolution: p043WashiSolution,
    judge: p043Judge,
  }),
  hydrateProblem({
    rawMeta: p044Meta,
    rawCases: p044Cases as unknown as RawProblemCase<P044Input>[],
    locales: { en: p044En, ja: p044Ja, zh: p044Zh },
    markdownLoaders: {
      en: () => import("./044-policy-counterexample/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./044-policy-counterexample/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./044-policy-counterexample/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./044-policy-counterexample/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./044-policy-counterexample/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./044-policy-counterexample/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p044WashiStarter,
    washiSolution: p044WashiSolution,
    judge: p044Judge,
  }),
  hydrateProblem({
    rawMeta: p045Meta,
    rawCases: p045Cases as unknown as RawProblemCase<P045Input>[],
    locales: { en: p045En, ja: p045Ja, zh: p045Zh },
    markdownLoaders: {
      en: () => import("./045-dead-redundant-rules/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./045-dead-redundant-rules/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./045-dead-redundant-rules/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./045-dead-redundant-rules/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./045-dead-redundant-rules/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./045-dead-redundant-rules/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p045WashiStarter,
    washiSolution: p045WashiSolution,
    judge: p045Judge,
  }),
  hydrateProblem({
    rawMeta: p046Meta,
    rawCases: p046Cases as unknown as RawProblemCase<P046Input>[],
    locales: { en: p046En, ja: p046Ja, zh: p046Zh },
    markdownLoaders: {
      en: () => import("./046-puzzle-clue-diagnosis/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./046-puzzle-clue-diagnosis/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./046-puzzle-clue-diagnosis/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./046-puzzle-clue-diagnosis/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./046-puzzle-clue-diagnosis/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./046-puzzle-clue-diagnosis/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p046WashiStarter,
    washiSolution: p046WashiSolution,
    judge: p046Judge,
  }),
  hydrateProblem({
    rawMeta: p047Meta,
    rawCases: p047Cases as unknown as RawProblemCase<P047Input>[],
    locales: { en: p047En, ja: p047Ja, zh: p047Zh },
    markdownLoaders: {
      en: () => import("./047-weighted-maxsat-repair/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./047-weighted-maxsat-repair/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./047-weighted-maxsat-repair/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./047-weighted-maxsat-repair/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./047-weighted-maxsat-repair/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./047-weighted-maxsat-repair/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p047WashiStarter,
    washiSolution: p047WashiSolution,
    judge: p047Judge,
  }),
  hydrateProblem({
    rawMeta: p048Meta,
    rawCases: p048Cases as unknown as RawProblemCase<P048Input>[],
    locales: { en: p048En, ja: p048Ja, zh: p048Zh },
    markdownLoaders: {
      en: () => import("./048-historical-schedule-audit/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./048-historical-schedule-audit/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./048-historical-schedule-audit/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./048-historical-schedule-audit/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./048-historical-schedule-audit/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./048-historical-schedule-audit/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p048WashiStarter,
    washiSolution: p048WashiSolution,
    judge: p048Judge,
  }),
  hydrateProblem({
    rawMeta: p049Meta,
    rawCases: p049Cases as unknown as RawProblemCase<P049Input>[],
    locales: { en: p049En, ja: p049Ja, zh: p049Zh },
    markdownLoaders: {
      en: () => import("./049-smt-lira-time-windows/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./049-smt-lira-time-windows/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./049-smt-lira-time-windows/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./049-smt-lira-time-windows/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./049-smt-lira-time-windows/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./049-smt-lira-time-windows/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p049WashiStarter,
    washiSolution: p049WashiSolution,
    judge: p049Judge,
  }),
  hydrateProblem({
    rawMeta: p050Meta,
    rawCases: p050Cases as unknown as RawProblemCase<P050Input>[],
    locales: { en: p050En, ja: p050Ja, zh: p050Zh },
    markdownLoaders: {
      en: () => import("./050-rule-diagnosis-repair/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./050-rule-diagnosis-repair/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./050-rule-diagnosis-repair/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./050-rule-diagnosis-repair/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./050-rule-diagnosis-repair/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./050-rule-diagnosis-repair/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p050WashiStarter,
    washiSolution: p050WashiSolution,
    judge: p050Judge,
  }),
];
