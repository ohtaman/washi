import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #031
import p031Meta from "./031-distinct-assignment/meta.json";
import p031Cases from "./031-distinct-assignment/cases.json";
import p031En from "./031-distinct-assignment/locales/en.json";
import p031Ja from "./031-distinct-assignment/locales/ja.json";
import p031Zh from "./031-distinct-assignment/locales/zh.json";
import p031WashiStarter from "./031-distinct-assignment/washi/starter.ts?raw";
import p031WashiSolution from "./031-distinct-assignment/washi/solution.ts?raw";
import { judge as p031Judge } from "./031-distinct-assignment/judge.js";

// #032
import p032Meta from "./032-element-indexing/meta.json";
import p032Cases from "./032-element-indexing/cases.json";
import p032En from "./032-element-indexing/locales/en.json";
import p032Ja from "./032-element-indexing/locales/ja.json";
import p032Zh from "./032-element-indexing/locales/zh.json";
import p032WashiStarter from "./032-element-indexing/washi/starter.ts?raw";
import p032WashiSolution from "./032-element-indexing/washi/solution.ts?raw";
import { judge as p032Judge } from "./032-element-indexing/judge.js";

// #033
import p033Meta from "./033-table-allowed-configs/meta.json";
import p033Cases from "./033-table-allowed-configs/cases.json";
import p033En from "./033-table-allowed-configs/locales/en.json";
import p033Ja from "./033-table-allowed-configs/locales/ja.json";
import p033Zh from "./033-table-allowed-configs/locales/zh.json";
import p033WashiStarter from "./033-table-allowed-configs/washi/starter.ts?raw";
import p033WashiSolution from "./033-table-allowed-configs/washi/solution.ts?raw";
import { judge as p033Judge } from "./033-table-allowed-configs/judge.js";

// #034
import p034Meta from "./034-successor-tour/meta.json";
import p034Cases from "./034-successor-tour/cases.json";
import p034En from "./034-successor-tour/locales/en.json";
import p034Ja from "./034-successor-tour/locales/ja.json";
import p034Zh from "./034-successor-tour/locales/zh.json";
import p034WashiStarter from "./034-successor-tour/washi/starter.ts?raw";
import p034WashiSolution from "./034-successor-tour/washi/solution.ts?raw";
import { judge as p034Judge } from "./034-successor-tour/judge.js";

// #035
import p035Meta from "./035-disjoint-scheduling/meta.json";
import p035Cases from "./035-disjoint-scheduling/cases.json";
import p035En from "./035-disjoint-scheduling/locales/en.json";
import p035Ja from "./035-disjoint-scheduling/locales/ja.json";
import p035Zh from "./035-disjoint-scheduling/locales/zh.json";
import p035WashiStarter from "./035-disjoint-scheduling/washi/starter.ts?raw";
import p035WashiSolution from "./035-disjoint-scheduling/washi/solution.ts?raw";
import { judge as p035Judge } from "./035-disjoint-scheduling/judge.js";

// #036
import p036Meta from "./036-cumulative-resources/meta.json";
import p036Cases from "./036-cumulative-resources/cases.json";
import p036En from "./036-cumulative-resources/locales/en.json";
import p036Ja from "./036-cumulative-resources/locales/ja.json";
import p036Zh from "./036-cumulative-resources/locales/zh.json";
import p036WashiStarter from "./036-cumulative-resources/washi/starter.ts?raw";
import p036WashiSolution from "./036-cumulative-resources/washi/solution.ts?raw";
import { judge as p036Judge } from "./036-cumulative-resources/judge.js";

// #037
import p037Meta from "./037-2d-rectangle-packing/meta.json";
import p037Cases from "./037-2d-rectangle-packing/cases.json";
import p037En from "./037-2d-rectangle-packing/locales/en.json";
import p037Ja from "./037-2d-rectangle-packing/locales/ja.json";
import p037Zh from "./037-2d-rectangle-packing/locales/zh.json";
import p037WashiStarter from "./037-2d-rectangle-packing/washi/starter.ts?raw";
import p037WashiSolution from "./037-2d-rectangle-packing/washi/solution.ts?raw";
import { judge as p037Judge } from "./037-2d-rectangle-packing/judge.js";

// #038
import p038Meta from "./038-symmetry-breaking/meta.json";
import p038Cases from "./038-symmetry-breaking/cases.json";
import p038En from "./038-symmetry-breaking/locales/en.json";
import p038Ja from "./038-symmetry-breaking/locales/ja.json";
import p038Zh from "./038-symmetry-breaking/locales/zh.json";
import p038WashiStarter from "./038-symmetry-breaking/washi/starter.ts?raw";
import p038WashiSolution from "./038-symmetry-breaking/washi/solution.ts?raw";
import { judge as p038Judge } from "./038-symmetry-breaking/judge.js";

// #039
import p039Meta from "./039-combinatorial-grid-puzzle/meta.json";
import p039Cases from "./039-combinatorial-grid-puzzle/cases.json";
import p039En from "./039-combinatorial-grid-puzzle/locales/en.json";
import p039Ja from "./039-combinatorial-grid-puzzle/locales/ja.json";
import p039Zh from "./039-combinatorial-grid-puzzle/locales/zh.json";
import p039WashiStarter from "./039-combinatorial-grid-puzzle/washi/starter.ts?raw";
import p039WashiSolution from "./039-combinatorial-grid-puzzle/washi/solution.ts?raw";
import { judge as p039Judge } from "./039-combinatorial-grid-puzzle/judge.js";

// #040
import p040Meta from "./040-cp-scheduling-synthesis/meta.json";
import p040Cases from "./040-cp-scheduling-synthesis/cases.json";
import p040En from "./040-cp-scheduling-synthesis/locales/en.json";
import p040Ja from "./040-cp-scheduling-synthesis/locales/ja.json";
import p040Zh from "./040-cp-scheduling-synthesis/locales/zh.json";
import p040WashiStarter from "./040-cp-scheduling-synthesis/washi/starter.ts?raw";
import p040WashiSolution from "./040-cp-scheduling-synthesis/washi/solution.ts?raw";
import { judge as p040Judge } from "./040-cp-scheduling-synthesis/judge.js";

export const CH04_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p031Meta,
    rawCases: p031Cases,
    locales: { en: p031En, ja: p031Ja, zh: p031Zh },
    markdownLoaders: {
      en: () => import("./031-distinct-assignment/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./031-distinct-assignment/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./031-distinct-assignment/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./031-distinct-assignment/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./031-distinct-assignment/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./031-distinct-assignment/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p031WashiStarter,
    washiSolution: p031WashiSolution,
    judge: p031Judge,
  }),
  hydrateProblem({
    rawMeta: p032Meta,
    rawCases: p032Cases,
    locales: { en: p032En, ja: p032Ja, zh: p032Zh },
    markdownLoaders: {
      en: () => import("./032-element-indexing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./032-element-indexing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./032-element-indexing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./032-element-indexing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./032-element-indexing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./032-element-indexing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p032WashiStarter,
    washiSolution: p032WashiSolution,
    judge: p032Judge,
  }),
  hydrateProblem({
    rawMeta: p033Meta,
    rawCases: p033Cases,
    locales: { en: p033En, ja: p033Ja, zh: p033Zh },
    markdownLoaders: {
      en: () => import("./033-table-allowed-configs/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./033-table-allowed-configs/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./033-table-allowed-configs/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./033-table-allowed-configs/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./033-table-allowed-configs/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./033-table-allowed-configs/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p033WashiStarter,
    washiSolution: p033WashiSolution,
    judge: p033Judge,
  }),
  hydrateProblem({
    rawMeta: p034Meta,
    rawCases: p034Cases,
    locales: { en: p034En, ja: p034Ja, zh: p034Zh },
    markdownLoaders: {
      en: () => import("./034-successor-tour/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./034-successor-tour/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./034-successor-tour/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./034-successor-tour/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./034-successor-tour/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./034-successor-tour/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p034WashiStarter,
    washiSolution: p034WashiSolution,
    judge: p034Judge,
  }),
  hydrateProblem({
    rawMeta: p035Meta,
    rawCases: p035Cases,
    locales: { en: p035En, ja: p035Ja, zh: p035Zh },
    markdownLoaders: {
      en: () => import("./035-disjoint-scheduling/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./035-disjoint-scheduling/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./035-disjoint-scheduling/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./035-disjoint-scheduling/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./035-disjoint-scheduling/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./035-disjoint-scheduling/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p035WashiStarter,
    washiSolution: p035WashiSolution,
    judge: p035Judge,
  }),
  hydrateProblem({
    rawMeta: p036Meta,
    rawCases: p036Cases,
    locales: { en: p036En, ja: p036Ja, zh: p036Zh },
    markdownLoaders: {
      en: () => import("./036-cumulative-resources/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./036-cumulative-resources/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./036-cumulative-resources/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./036-cumulative-resources/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./036-cumulative-resources/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./036-cumulative-resources/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p036WashiStarter,
    washiSolution: p036WashiSolution,
    judge: p036Judge,
  }),
  hydrateProblem({
    rawMeta: p037Meta,
    rawCases: p037Cases,
    locales: { en: p037En, ja: p037Ja, zh: p037Zh },
    markdownLoaders: {
      en: () => import("./037-2d-rectangle-packing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./037-2d-rectangle-packing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./037-2d-rectangle-packing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./037-2d-rectangle-packing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./037-2d-rectangle-packing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./037-2d-rectangle-packing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p037WashiStarter,
    washiSolution: p037WashiSolution,
    judge: p037Judge,
  }),
  hydrateProblem({
    rawMeta: p038Meta,
    rawCases: p038Cases,
    locales: { en: p038En, ja: p038Ja, zh: p038Zh },
    markdownLoaders: {
      en: () => import("./038-symmetry-breaking/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./038-symmetry-breaking/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./038-symmetry-breaking/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./038-symmetry-breaking/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./038-symmetry-breaking/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./038-symmetry-breaking/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p038WashiStarter,
    washiSolution: p038WashiSolution,
    judge: p038Judge,
  }),
  hydrateProblem({
    rawMeta: p039Meta,
    rawCases: p039Cases,
    locales: { en: p039En, ja: p039Ja, zh: p039Zh },
    markdownLoaders: {
      en: () => import("./039-combinatorial-grid-puzzle/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./039-combinatorial-grid-puzzle/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./039-combinatorial-grid-puzzle/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./039-combinatorial-grid-puzzle/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./039-combinatorial-grid-puzzle/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./039-combinatorial-grid-puzzle/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p039WashiStarter,
    washiSolution: p039WashiSolution,
    judge: p039Judge,
  }),
  hydrateProblem({
    rawMeta: p040Meta,
    rawCases: p040Cases,
    locales: { en: p040En, ja: p040Ja, zh: p040Zh },
    markdownLoaders: {
      en: () => import("./040-cp-scheduling-synthesis/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./040-cp-scheduling-synthesis/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./040-cp-scheduling-synthesis/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./040-cp-scheduling-synthesis/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./040-cp-scheduling-synthesis/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./040-cp-scheduling-synthesis/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p040WashiStarter,
    washiSolution: p040WashiSolution,
    judge: p040Judge,
  }),
];
