import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #011
import p011Meta from "./011-semi-continuous-production/meta.json";
import p011Cases from "./011-semi-continuous-production/cases.json";
import p011En from "./011-semi-continuous-production/locales/en.json";
import p011Ja from "./011-semi-continuous-production/locales/ja.json";
import p011Zh from "./011-semi-continuous-production/locales/zh.json";
import p011WashiStarter from "./011-semi-continuous-production/washi/starter.ts?raw";
import p011WashiSolution from "./011-semi-continuous-production/washi/solution.ts?raw";
import p011HighspyStarter from "./011-semi-continuous-production/highspy/starter.py?raw";
import p011HighspySolution from "./011-semi-continuous-production/highspy/solution.py?raw";
import { judge as p011Judge } from "./011-semi-continuous-production/judge.js";

// #012
import p012Meta from "./012-fixed-charge-network/meta.json";
import p012Cases from "./012-fixed-charge-network/cases.json";
import p012En from "./012-fixed-charge-network/locales/en.json";
import p012Ja from "./012-fixed-charge-network/locales/ja.json";
import p012Zh from "./012-fixed-charge-network/locales/zh.json";
import p012WashiStarter from "./012-fixed-charge-network/washi/starter.ts?raw";
import p012WashiSolution from "./012-fixed-charge-network/washi/solution.ts?raw";
import p012HighspyStarter from "./012-fixed-charge-network/highspy/starter.py?raw";
import p012HighspySolution from "./012-fixed-charge-network/highspy/solution.py?raw";
import { judge as p012Judge } from "./012-fixed-charge-network/judge.js";

// #013
import p013Meta from "./013-cardinality-selection/meta.json";
import p013Cases from "./013-cardinality-selection/cases.json";
import p013En from "./013-cardinality-selection/locales/en.json";
import p013Ja from "./013-cardinality-selection/locales/ja.json";
import p013Zh from "./013-cardinality-selection/locales/zh.json";
import p013WashiStarter from "./013-cardinality-selection/washi/starter.ts?raw";
import p013WashiSolution from "./013-cardinality-selection/washi/solution.ts?raw";
import p013HighspyStarter from "./013-cardinality-selection/highspy/starter.py?raw";
import p013HighspySolution from "./013-cardinality-selection/highspy/solution.py?raw";
import { judge as p013Judge } from "./013-cardinality-selection/judge.js";

// #014
import p014Meta from "./014-conditional-logic-big-m/meta.json";
import p014Cases from "./014-conditional-logic-big-m/cases.json";
import p014En from "./014-conditional-logic-big-m/locales/en.json";
import p014Ja from "./014-conditional-logic-big-m/locales/ja.json";
import p014Zh from "./014-conditional-logic-big-m/locales/zh.json";
import p014WashiStarter from "./014-conditional-logic-big-m/washi/starter.ts?raw";
import p014WashiSolution from "./014-conditional-logic-big-m/washi/solution.ts?raw";
import p014HighspyStarter from "./014-conditional-logic-big-m/highspy/starter.py?raw";
import p014HighspySolution from "./014-conditional-logic-big-m/highspy/solution.py?raw";
import { judge as p014Judge } from "./014-conditional-logic-big-m/judge.js";

// #015
import p015Meta from "./015-set-covering/meta.json";
import p015Cases from "./015-set-covering/cases.json";
import p015En from "./015-set-covering/locales/en.json";
import p015Ja from "./015-set-covering/locales/ja.json";
import p015Zh from "./015-set-covering/locales/zh.json";
import p015WashiStarter from "./015-set-covering/washi/starter.ts?raw";
import p015WashiSolution from "./015-set-covering/washi/solution.ts?raw";
import p015HighspyStarter from "./015-set-covering/highspy/starter.py?raw";
import p015HighspySolution from "./015-set-covering/highspy/solution.py?raw";
import { judge as p015Judge } from "./015-set-covering/judge.js";

// #016
import p016Meta from "./016-set-partitioning/meta.json";
import p016Cases from "./016-set-partitioning/cases.json";
import p016En from "./016-set-partitioning/locales/en.json";
import p016Ja from "./016-set-partitioning/locales/ja.json";
import p016Zh from "./016-set-partitioning/locales/zh.json";
import p016WashiStarter from "./016-set-partitioning/washi/starter.ts?raw";
import p016WashiSolution from "./016-set-partitioning/washi/solution.ts?raw";
import p016HighspyStarter from "./016-set-partitioning/highspy/starter.py?raw";
import p016HighspySolution from "./016-set-partitioning/highspy/solution.py?raw";
import { judge as p016Judge } from "./016-set-partitioning/judge.js";

// #017
import p017Meta from "./017-maximal-covering-location/meta.json";
import p017Cases from "./017-maximal-covering-location/cases.json";
import p017En from "./017-maximal-covering-location/locales/en.json";
import p017Ja from "./017-maximal-covering-location/locales/ja.json";
import p017Zh from "./017-maximal-covering-location/locales/zh.json";
import p017WashiStarter from "./017-maximal-covering-location/washi/starter.ts?raw";
import p017WashiSolution from "./017-maximal-covering-location/washi/solution.ts?raw";
import p017HighspyStarter from "./017-maximal-covering-location/highspy/starter.py?raw";
import p017HighspySolution from "./017-maximal-covering-location/highspy/solution.py?raw";
import { judge as p017Judge } from "./017-maximal-covering-location/judge.js";

// #018
import p018Meta from "./018-multidim-knapsack-deps/meta.json";
import p018Cases from "./018-multidim-knapsack-deps/cases.json";
import p018En from "./018-multidim-knapsack-deps/locales/en.json";
import p018Ja from "./018-multidim-knapsack-deps/locales/ja.json";
import p018Zh from "./018-multidim-knapsack-deps/locales/zh.json";
import p018WashiStarter from "./018-multidim-knapsack-deps/washi/starter.ts?raw";
import p018WashiSolution from "./018-multidim-knapsack-deps/washi/solution.ts?raw";
import p018HighspyStarter from "./018-multidim-knapsack-deps/highspy/starter.py?raw";
import p018HighspySolution from "./018-multidim-knapsack-deps/highspy/solution.py?raw";
import { judge as p018Judge } from "./018-multidim-knapsack-deps/judge.js";

// #019
import p019Meta from "./019-piecewise-volume-discount/meta.json";
import p019Cases from "./019-piecewise-volume-discount/cases.json";
import p019En from "./019-piecewise-volume-discount/locales/en.json";
import p019Ja from "./019-piecewise-volume-discount/locales/ja.json";
import p019Zh from "./019-piecewise-volume-discount/locales/zh.json";
import p019WashiStarter from "./019-piecewise-volume-discount/washi/starter.ts?raw";
import p019WashiSolution from "./019-piecewise-volume-discount/washi/solution.ts?raw";
import p019HighspyStarter from "./019-piecewise-volume-discount/highspy/starter.py?raw";
import p019HighspySolution from "./019-piecewise-volume-discount/highspy/solution.py?raw";
import { judge as p019Judge } from "./019-piecewise-volume-discount/judge.js";

// #020
import p020Meta from "./020-capacitated-facility-location/meta.json";
import p020Cases from "./020-capacitated-facility-location/cases.json";
import p020En from "./020-capacitated-facility-location/locales/en.json";
import p020Ja from "./020-capacitated-facility-location/locales/ja.json";
import p020Zh from "./020-capacitated-facility-location/locales/zh.json";
import p020WashiStarter from "./020-capacitated-facility-location/washi/starter.ts?raw";
import p020WashiSolution from "./020-capacitated-facility-location/washi/solution.ts?raw";
import p020HighspyStarter from "./020-capacitated-facility-location/highspy/starter.py?raw";
import p020HighspySolution from "./020-capacitated-facility-location/highspy/solution.py?raw";
import { judge as p020Judge } from "./020-capacitated-facility-location/judge.js";

export const CH02_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p011Meta,
    rawCases: p011Cases,
    locales: { en: p011En, ja: p011Ja, zh: p011Zh },
    markdownLoaders: {
      en: () => import("./011-semi-continuous-production/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./011-semi-continuous-production/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./011-semi-continuous-production/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./011-semi-continuous-production/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./011-semi-continuous-production/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./011-semi-continuous-production/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p011WashiStarter,
    washiSolution: p011WashiSolution,
    highspyStarter: p011HighspyStarter,
    highspySolution: p011HighspySolution,
    judge: p011Judge,
  }),
  hydrateProblem({
    rawMeta: p012Meta,
    rawCases: p012Cases,
    locales: { en: p012En, ja: p012Ja, zh: p012Zh },
    markdownLoaders: {
      en: () => import("./012-fixed-charge-network/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./012-fixed-charge-network/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./012-fixed-charge-network/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./012-fixed-charge-network/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./012-fixed-charge-network/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./012-fixed-charge-network/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p012WashiStarter,
    washiSolution: p012WashiSolution,
    highspyStarter: p012HighspyStarter,
    highspySolution: p012HighspySolution,
    judge: p012Judge,
  }),
  hydrateProblem({
    rawMeta: p013Meta,
    rawCases: p013Cases,
    locales: { en: p013En, ja: p013Ja, zh: p013Zh },
    markdownLoaders: {
      en: () => import("./013-cardinality-selection/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./013-cardinality-selection/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./013-cardinality-selection/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./013-cardinality-selection/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./013-cardinality-selection/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./013-cardinality-selection/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p013WashiStarter,
    washiSolution: p013WashiSolution,
    highspyStarter: p013HighspyStarter,
    highspySolution: p013HighspySolution,
    judge: p013Judge,
  }),
  hydrateProblem({
    rawMeta: p014Meta,
    rawCases: p014Cases,
    locales: { en: p014En, ja: p014Ja, zh: p014Zh },
    markdownLoaders: {
      en: () => import("./014-conditional-logic-big-m/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./014-conditional-logic-big-m/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./014-conditional-logic-big-m/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./014-conditional-logic-big-m/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./014-conditional-logic-big-m/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./014-conditional-logic-big-m/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p014WashiStarter,
    washiSolution: p014WashiSolution,
    highspyStarter: p014HighspyStarter,
    highspySolution: p014HighspySolution,
    judge: p014Judge,
  }),
  hydrateProblem({
    rawMeta: p015Meta,
    rawCases: p015Cases,
    locales: { en: p015En, ja: p015Ja, zh: p015Zh },
    markdownLoaders: {
      en: () => import("./015-set-covering/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./015-set-covering/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./015-set-covering/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./015-set-covering/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./015-set-covering/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./015-set-covering/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p015WashiStarter,
    washiSolution: p015WashiSolution,
    highspyStarter: p015HighspyStarter,
    highspySolution: p015HighspySolution,
    judge: p015Judge,
  }),
  hydrateProblem({
    rawMeta: p016Meta,
    rawCases: p016Cases,
    locales: { en: p016En, ja: p016Ja, zh: p016Zh },
    markdownLoaders: {
      en: () => import("./016-set-partitioning/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./016-set-partitioning/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./016-set-partitioning/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./016-set-partitioning/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./016-set-partitioning/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./016-set-partitioning/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p016WashiStarter,
    washiSolution: p016WashiSolution,
    highspyStarter: p016HighspyStarter,
    highspySolution: p016HighspySolution,
    judge: p016Judge,
  }),
  hydrateProblem({
    rawMeta: p017Meta,
    rawCases: p017Cases,
    locales: { en: p017En, ja: p017Ja, zh: p017Zh },
    markdownLoaders: {
      en: () => import("./017-maximal-covering-location/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./017-maximal-covering-location/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./017-maximal-covering-location/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./017-maximal-covering-location/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./017-maximal-covering-location/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./017-maximal-covering-location/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p017WashiStarter,
    washiSolution: p017WashiSolution,
    highspyStarter: p017HighspyStarter,
    highspySolution: p017HighspySolution,
    judge: p017Judge,
  }),
  hydrateProblem({
    rawMeta: p018Meta,
    rawCases: p018Cases,
    locales: { en: p018En, ja: p018Ja, zh: p018Zh },
    markdownLoaders: {
      en: () => import("./018-multidim-knapsack-deps/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./018-multidim-knapsack-deps/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./018-multidim-knapsack-deps/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./018-multidim-knapsack-deps/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./018-multidim-knapsack-deps/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./018-multidim-knapsack-deps/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p018WashiStarter,
    washiSolution: p018WashiSolution,
    highspyStarter: p018HighspyStarter,
    highspySolution: p018HighspySolution,
    judge: p018Judge,
  }),
  hydrateProblem({
    rawMeta: p019Meta,
    rawCases: p019Cases,
    locales: { en: p019En, ja: p019Ja, zh: p019Zh },
    markdownLoaders: {
      en: () => import("./019-piecewise-volume-discount/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./019-piecewise-volume-discount/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./019-piecewise-volume-discount/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./019-piecewise-volume-discount/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./019-piecewise-volume-discount/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./019-piecewise-volume-discount/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p019WashiStarter,
    washiSolution: p019WashiSolution,
    highspyStarter: p019HighspyStarter,
    highspySolution: p019HighspySolution,
    judge: p019Judge,
  }),
  hydrateProblem({
    rawMeta: p020Meta,
    rawCases: p020Cases,
    locales: { en: p020En, ja: p020Ja, zh: p020Zh },
    markdownLoaders: {
      en: () => import("./020-capacitated-facility-location/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./020-capacitated-facility-location/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./020-capacitated-facility-location/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./020-capacitated-facility-location/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./020-capacitated-facility-location/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./020-capacitated-facility-location/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p020WashiStarter,
    washiSolution: p020WashiSolution,
    highspyStarter: p020HighspyStarter,
    highspySolution: p020HighspySolution,
    judge: p020Judge,
  }),
];
