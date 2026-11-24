import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #001
import p001Meta from "./001-bakery-first-run/meta.json";
import p001Cases from "./001-bakery-first-run/cases.json";
import p001En from "./001-bakery-first-run/locales/en.json";
import p001Ja from "./001-bakery-first-run/locales/ja.json";
import p001Zh from "./001-bakery-first-run/locales/zh.json";
import p001WashiStarter from "./001-bakery-first-run/washi/starter.ts?raw";
import p001WashiSolution from "./001-bakery-first-run/washi/solution.ts?raw";
import p001PulpStarter from "./001-bakery-first-run/pulp/starter.py?raw";
import p001PulpSolution from "./001-bakery-first-run/pulp/solution.py?raw";
import { judge as p001Judge } from "./001-bakery-first-run/judge.js";

// #002
import p002Meta from "./002-diet-min-cost/meta.json";
import p002Cases from "./002-diet-min-cost/cases.json";
import p002En from "./002-diet-min-cost/locales/en.json";
import p002Ja from "./002-diet-min-cost/locales/ja.json";
import p002Zh from "./002-diet-min-cost/locales/zh.json";
import p002WashiStarter from "./002-diet-min-cost/washi/starter.ts?raw";
import p002WashiSolution from "./002-diet-min-cost/washi/solution.ts?raw";
import p002PulpStarter from "./002-diet-min-cost/pulp/starter.py?raw";
import p002PulpSolution from "./002-diet-min-cost/pulp/solution.py?raw";
import { judge as p002Judge } from "./002-diet-min-cost/judge.js";

// #003
import p003Meta from "./003-coin-change-puzzle/meta.json";
import p003Cases from "./003-coin-change-puzzle/cases.json";
import p003En from "./003-coin-change-puzzle/locales/en.json";
import p003Ja from "./003-coin-change-puzzle/locales/ja.json";
import p003Zh from "./003-coin-change-puzzle/locales/zh.json";
import p003WashiStarter from "./003-coin-change-puzzle/washi/starter.ts?raw";
import p003WashiSolution from "./003-coin-change-puzzle/washi/solution.ts?raw";
import p003PulpStarter from "./003-coin-change-puzzle/pulp/starter.py?raw";
import p003PulpSolution from "./003-coin-change-puzzle/pulp/solution.py?raw";
import { judge as p003Judge } from "./003-coin-change-puzzle/judge.js";

// #004
import p004Meta from "./004-general-product-mix/meta.json";
import p004Cases from "./004-general-product-mix/cases.json";
import p004En from "./004-general-product-mix/locales/en.json";
import p004Ja from "./004-general-product-mix/locales/ja.json";
import p004Zh from "./004-general-product-mix/locales/zh.json";
import p004WashiStarter from "./004-general-product-mix/washi/starter.ts?raw";
import p004WashiSolution from "./004-general-product-mix/washi/solution.ts?raw";
import p004PulpStarter from "./004-general-product-mix/pulp/starter.py?raw";
import p004PulpSolution from "./004-general-product-mix/pulp/solution.py?raw";
import { judge as p004Judge } from "./004-general-product-mix/judge.js";

// #005
import p005Meta from "./005-blending-nutrition/meta.json";
import p005Cases from "./005-blending-nutrition/cases.json";
import p005En from "./005-blending-nutrition/locales/en.json";
import p005Ja from "./005-blending-nutrition/locales/ja.json";
import p005Zh from "./005-blending-nutrition/locales/zh.json";
import p005WashiStarter from "./005-blending-nutrition/washi/starter.ts?raw";
import p005WashiSolution from "./005-blending-nutrition/washi/solution.ts?raw";
import p005PulpStarter from "./005-blending-nutrition/pulp/starter.py?raw";
import p005PulpSolution from "./005-blending-nutrition/pulp/solution.py?raw";
import { judge as p005Judge } from "./005-blending-nutrition/judge.js";

// #006
import p006Meta from "./006-project-knapsack-binary/meta.json";
import p006Cases from "./006-project-knapsack-binary/cases.json";
import p006En from "./006-project-knapsack-binary/locales/en.json";
import p006Ja from "./006-project-knapsack-binary/locales/ja.json";
import p006Zh from "./006-project-knapsack-binary/locales/zh.json";
import p006WashiStarter from "./006-project-knapsack-binary/washi/starter.ts?raw";
import p006WashiSolution from "./006-project-knapsack-binary/washi/solution.ts?raw";
import p006PulpStarter from "./006-project-knapsack-binary/pulp/starter.py?raw";
import p006PulpSolution from "./006-project-knapsack-binary/pulp/solution.py?raw";
import { judge as p006Judge } from "./006-project-knapsack-binary/judge.js";

// #007
import p007Meta from "./007-task-assignment/meta.json";
import p007Cases from "./007-task-assignment/cases.json";
import p007En from "./007-task-assignment/locales/en.json";
import p007Ja from "./007-task-assignment/locales/ja.json";
import p007Zh from "./007-task-assignment/locales/zh.json";
import p007WashiStarter from "./007-task-assignment/washi/starter.ts?raw";
import p007WashiSolution from "./007-task-assignment/washi/solution.ts?raw";
import p007PulpStarter from "./007-task-assignment/pulp/starter.py?raw";
import p007PulpSolution from "./007-task-assignment/pulp/solution.py?raw";
import { judge as p007Judge } from "./007-task-assignment/judge.js";

// #008
import p008Meta from "./008-transportation-network/meta.json";
import p008Cases from "./008-transportation-network/cases.json";
import p008En from "./008-transportation-network/locales/en.json";
import p008Ja from "./008-transportation-network/locales/ja.json";
import p008Zh from "./008-transportation-network/locales/zh.json";
import p008WashiStarter from "./008-transportation-network/washi/starter.ts?raw";
import p008WashiSolution from "./008-transportation-network/washi/solution.ts?raw";
import p008PulpStarter from "./008-transportation-network/pulp/starter.py?raw";
import p008PulpSolution from "./008-transportation-network/pulp/solution.py?raw";
import { judge as p008Judge } from "./008-transportation-network/judge.js";

// #009
import p009Meta from "./009-production-inventory/meta.json";
import p009Cases from "./009-production-inventory/cases.json";
import p009En from "./009-production-inventory/locales/en.json";
import p009Ja from "./009-production-inventory/locales/ja.json";
import p009Zh from "./009-production-inventory/locales/zh.json";
import p009WashiStarter from "./009-production-inventory/washi/starter.ts?raw";
import p009WashiSolution from "./009-production-inventory/washi/solution.ts?raw";
import p009PulpStarter from "./009-production-inventory/pulp/starter.py?raw";
import p009PulpSolution from "./009-production-inventory/pulp/solution.py?raw";
import { judge as p009Judge } from "./009-production-inventory/judge.js";

// #010
import p010Meta from "./010-production-line-activation/meta.json";
import p010Cases from "./010-production-line-activation/cases.json";
import p010En from "./010-production-line-activation/locales/en.json";
import p010Ja from "./010-production-line-activation/locales/ja.json";
import p010Zh from "./010-production-line-activation/locales/zh.json";
import p010WashiStarter from "./010-production-line-activation/washi/starter.ts?raw";
import p010WashiSolution from "./010-production-line-activation/washi/solution.ts?raw";
import p010PulpStarter from "./010-production-line-activation/pulp/starter.py?raw";
import p010PulpSolution from "./010-production-line-activation/pulp/solution.py?raw";
import { judge as p010Judge } from "./010-production-line-activation/judge.js";

export const CH01_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p001Meta,
    rawCases: p001Cases,
    locales: { en: p001En, ja: p001Ja, zh: p001Zh },
    markdownLoaders: {
      en: () => import("./001-bakery-first-run/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./001-bakery-first-run/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./001-bakery-first-run/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./001-bakery-first-run/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./001-bakery-first-run/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./001-bakery-first-run/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p001WashiStarter,
    washiSolution: p001WashiSolution,
    pulpStarter: p001PulpStarter,
    pulpSolution: p001PulpSolution,
    judge: p001Judge,
  }),
  hydrateProblem({
    rawMeta: p002Meta,
    rawCases: p002Cases,
    locales: { en: p002En, ja: p002Ja, zh: p002Zh },
    markdownLoaders: {
      en: () => import("./002-diet-min-cost/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./002-diet-min-cost/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./002-diet-min-cost/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./002-diet-min-cost/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./002-diet-min-cost/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./002-diet-min-cost/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p002WashiStarter,
    washiSolution: p002WashiSolution,
    pulpStarter: p002PulpStarter,
    pulpSolution: p002PulpSolution,
    judge: p002Judge,
  }),
  hydrateProblem({
    rawMeta: p003Meta,
    rawCases: p003Cases,
    locales: { en: p003En, ja: p003Ja, zh: p003Zh },
    markdownLoaders: {
      en: () => import("./003-coin-change-puzzle/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./003-coin-change-puzzle/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./003-coin-change-puzzle/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./003-coin-change-puzzle/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./003-coin-change-puzzle/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./003-coin-change-puzzle/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p003WashiStarter,
    washiSolution: p003WashiSolution,
    pulpStarter: p003PulpStarter,
    pulpSolution: p003PulpSolution,
    judge: p003Judge,
  }),
  hydrateProblem({
    rawMeta: p004Meta,
    rawCases: p004Cases,
    locales: { en: p004En, ja: p004Ja, zh: p004Zh },
    markdownLoaders: {
      en: () => import("./004-general-product-mix/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./004-general-product-mix/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./004-general-product-mix/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./004-general-product-mix/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./004-general-product-mix/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./004-general-product-mix/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p004WashiStarter,
    washiSolution: p004WashiSolution,
    pulpStarter: p004PulpStarter,
    pulpSolution: p004PulpSolution,
    judge: p004Judge,
  }),
  hydrateProblem({
    rawMeta: p005Meta,
    rawCases: p005Cases,
    locales: { en: p005En, ja: p005Ja, zh: p005Zh },
    markdownLoaders: {
      en: () => import("./005-blending-nutrition/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./005-blending-nutrition/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./005-blending-nutrition/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./005-blending-nutrition/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./005-blending-nutrition/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./005-blending-nutrition/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p005WashiStarter,
    washiSolution: p005WashiSolution,
    pulpStarter: p005PulpStarter,
    pulpSolution: p005PulpSolution,
    judge: p005Judge,
  }),
  hydrateProblem({
    rawMeta: p006Meta,
    rawCases: p006Cases,
    locales: { en: p006En, ja: p006Ja, zh: p006Zh },
    markdownLoaders: {
      en: () => import("./006-project-knapsack-binary/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./006-project-knapsack-binary/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./006-project-knapsack-binary/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./006-project-knapsack-binary/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./006-project-knapsack-binary/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./006-project-knapsack-binary/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p006WashiStarter,
    washiSolution: p006WashiSolution,
    pulpStarter: p006PulpStarter,
    pulpSolution: p006PulpSolution,
    judge: p006Judge,
  }),
  hydrateProblem({
    rawMeta: p007Meta,
    rawCases: p007Cases,
    locales: { en: p007En, ja: p007Ja, zh: p007Zh },
    markdownLoaders: {
      en: () => import("./007-task-assignment/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./007-task-assignment/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./007-task-assignment/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./007-task-assignment/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./007-task-assignment/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./007-task-assignment/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p007WashiStarter,
    washiSolution: p007WashiSolution,
    pulpStarter: p007PulpStarter,
    pulpSolution: p007PulpSolution,
    judge: p007Judge,
  }),
  hydrateProblem({
    rawMeta: p008Meta,
    rawCases: p008Cases,
    locales: { en: p008En, ja: p008Ja, zh: p008Zh },
    markdownLoaders: {
      en: () => import("./008-transportation-network/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./008-transportation-network/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./008-transportation-network/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./008-transportation-network/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./008-transportation-network/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./008-transportation-network/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p008WashiStarter,
    washiSolution: p008WashiSolution,
    pulpStarter: p008PulpStarter,
    pulpSolution: p008PulpSolution,
    judge: p008Judge,
  }),
  hydrateProblem({
    rawMeta: p009Meta,
    rawCases: p009Cases,
    locales: { en: p009En, ja: p009Ja, zh: p009Zh },
    markdownLoaders: {
      en: () => import("./009-production-inventory/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./009-production-inventory/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./009-production-inventory/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./009-production-inventory/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./009-production-inventory/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./009-production-inventory/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p009WashiStarter,
    washiSolution: p009WashiSolution,
    pulpStarter: p009PulpStarter,
    pulpSolution: p009PulpSolution,
    judge: p009Judge,
  }),
  hydrateProblem({
    rawMeta: p010Meta,
    rawCases: p010Cases,
    locales: { en: p010En, ja: p010Ja, zh: p010Zh },
    markdownLoaders: {
      en: () => import("./010-production-line-activation/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./010-production-line-activation/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./010-production-line-activation/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./010-production-line-activation/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./010-production-line-activation/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./010-production-line-activation/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p010WashiStarter,
    washiSolution: p010WashiSolution,
    pulpStarter: p010PulpStarter,
    pulpSolution: p010PulpSolution,
    judge: p010Judge,
  }),
];
