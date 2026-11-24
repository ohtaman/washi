import type { ProblemDefinition } from "../../types.js";
import { hydrateProblem } from "../hydrate.js";

// #061
import p061Meta from "./061-single-item-lot-sizing/meta.json";
import p061Cases from "./061-single-item-lot-sizing/cases.json";
import p061En from "./061-single-item-lot-sizing/locales/en.json";
import p061Ja from "./061-single-item-lot-sizing/locales/ja.json";
import p061Zh from "./061-single-item-lot-sizing/locales/zh.json";
import p061WashiStarter from "./061-single-item-lot-sizing/washi/starter.ts?raw";
import p061WashiSolution from "./061-single-item-lot-sizing/washi/solution.ts?raw";
import p061PulpStarter from "./061-single-item-lot-sizing/pulp/starter.py?raw";
import p061PulpSolution from "./061-single-item-lot-sizing/pulp/solution.py?raw";
import { judge as p061Judge } from "./061-single-item-lot-sizing/judge.js";

// #062
import p062Meta from "./062-multi-item-clsp/meta.json";
import p062Cases from "./062-multi-item-clsp/cases.json";
import p062En from "./062-multi-item-clsp/locales/en.json";
import p062Ja from "./062-multi-item-clsp/locales/ja.json";
import p062Zh from "./062-multi-item-clsp/locales/zh.json";
import p062WashiStarter from "./062-multi-item-clsp/washi/starter.ts?raw";
import p062WashiSolution from "./062-multi-item-clsp/washi/solution.ts?raw";
import p062PulpStarter from "./062-multi-item-clsp/pulp/starter.py?raw";
import p062PulpSolution from "./062-multi-item-clsp/pulp/solution.py?raw";
import { judge as p062Judge } from "./062-multi-item-clsp/judge.js";

// #063
import p063Meta from "./063-backorders-lost-sales/meta.json";
import p063Cases from "./063-backorders-lost-sales/cases.json";
import p063En from "./063-backorders-lost-sales/locales/en.json";
import p063Ja from "./063-backorders-lost-sales/locales/ja.json";
import p063Zh from "./063-backorders-lost-sales/locales/zh.json";
import p063WashiStarter from "./063-backorders-lost-sales/washi/starter.ts?raw";
import p063WashiSolution from "./063-backorders-lost-sales/washi/solution.ts?raw";
import p063PulpStarter from "./063-backorders-lost-sales/pulp/starter.py?raw";
import p063PulpSolution from "./063-backorders-lost-sales/pulp/solution.py?raw";
import { judge as p063Judge } from "./063-backorders-lost-sales/judge.js";

// #064
import p064Meta from "./064-multilevel-bom-mrp/meta.json";
import p064Cases from "./064-multilevel-bom-mrp/cases.json";
import p064En from "./064-multilevel-bom-mrp/locales/en.json";
import p064Ja from "./064-multilevel-bom-mrp/locales/ja.json";
import p064Zh from "./064-multilevel-bom-mrp/locales/zh.json";
import p064WashiStarter from "./064-multilevel-bom-mrp/washi/starter.ts?raw";
import p064WashiSolution from "./064-multilevel-bom-mrp/washi/solution.ts?raw";
import p064PulpStarter from "./064-multilevel-bom-mrp/pulp/starter.py?raw";
import p064PulpSolution from "./064-multilevel-bom-mrp/pulp/solution.py?raw";
import { judge as p064Judge } from "./064-multilevel-bom-mrp/judge.js";

// #065
import p065Meta from "./065-multi-echelon-scm/meta.json";
import p065Cases from "./065-multi-echelon-scm/cases.json";
import p065En from "./065-multi-echelon-scm/locales/en.json";
import p065Ja from "./065-multi-echelon-scm/locales/ja.json";
import p065Zh from "./065-multi-echelon-scm/locales/zh.json";
import p065WashiStarter from "./065-multi-echelon-scm/washi/starter.ts?raw";
import p065WashiSolution from "./065-multi-echelon-scm/washi/solution.ts?raw";
import p065PulpStarter from "./065-multi-echelon-scm/pulp/starter.py?raw";
import p065PulpSolution from "./065-multi-echelon-scm/pulp/solution.py?raw";
import { judge as p065Judge } from "./065-multi-echelon-scm/judge.js";

// #066
import p066Meta from "./066-cross-docking-sync/meta.json";
import p066Cases from "./066-cross-docking-sync/cases.json";
import p066En from "./066-cross-docking-sync/locales/en.json";
import p066Ja from "./066-cross-docking-sync/locales/ja.json";
import p066Zh from "./066-cross-docking-sync/locales/zh.json";
import p066WashiStarter from "./066-cross-docking-sync/washi/starter.ts?raw";
import p066WashiSolution from "./066-cross-docking-sync/washi/solution.ts?raw";
import p066PulpStarter from "./066-cross-docking-sync/pulp/starter.py?raw";
import p066PulpSolution from "./066-cross-docking-sync/pulp/solution.py?raw";
import { judge as p066Judge } from "./066-cross-docking-sync/judge.js";

// #067
import p067Meta from "./067-supplier-allocation-caps/meta.json";
import p067Cases from "./067-supplier-allocation-caps/cases.json";
import p067En from "./067-supplier-allocation-caps/locales/en.json";
import p067Ja from "./067-supplier-allocation-caps/locales/ja.json";
import p067Zh from "./067-supplier-allocation-caps/locales/zh.json";
import p067WashiStarter from "./067-supplier-allocation-caps/washi/starter.ts?raw";
import p067WashiSolution from "./067-supplier-allocation-caps/washi/solution.ts?raw";
import p067PulpStarter from "./067-supplier-allocation-caps/pulp/starter.py?raw";
import p067PulpSolution from "./067-supplier-allocation-caps/pulp/solution.py?raw";
import { judge as p067Judge } from "./067-supplier-allocation-caps/judge.js";

// #068
import p068Meta from "./068-unit-commitment/meta.json";
import p068Cases from "./068-unit-commitment/cases.json";
import p068En from "./068-unit-commitment/locales/en.json";
import p068Ja from "./068-unit-commitment/locales/ja.json";
import p068Zh from "./068-unit-commitment/locales/zh.json";
import p068WashiStarter from "./068-unit-commitment/washi/starter.ts?raw";
import p068WashiSolution from "./068-unit-commitment/washi/solution.ts?raw";
import p068PulpStarter from "./068-unit-commitment/pulp/starter.py?raw";
import p068PulpSolution from "./068-unit-commitment/pulp/solution.py?raw";
import { judge as p068Judge } from "./068-unit-commitment/judge.js";

// #069
import p069Meta from "./069-battery-peak-shaving/meta.json";
import p069Cases from "./069-battery-peak-shaving/cases.json";
import p069En from "./069-battery-peak-shaving/locales/en.json";
import p069Ja from "./069-battery-peak-shaving/locales/ja.json";
import p069Zh from "./069-battery-peak-shaving/locales/zh.json";
import p069WashiStarter from "./069-battery-peak-shaving/washi/starter.ts?raw";
import p069WashiSolution from "./069-battery-peak-shaving/washi/solution.ts?raw";
import p069PulpStarter from "./069-battery-peak-shaving/pulp/starter.py?raw";
import p069PulpSolution from "./069-battery-peak-shaving/pulp/solution.py?raw";
import { judge as p069Judge } from "./069-battery-peak-shaving/judge.js";

// #070
import p070Meta from "./070-energy-coupled-scm/meta.json";
import p070Cases from "./070-energy-coupled-scm/cases.json";
import p070En from "./070-energy-coupled-scm/locales/en.json";
import p070Ja from "./070-energy-coupled-scm/locales/ja.json";
import p070Zh from "./070-energy-coupled-scm/locales/zh.json";
import p070WashiStarter from "./070-energy-coupled-scm/washi/starter.ts?raw";
import p070WashiSolution from "./070-energy-coupled-scm/washi/solution.ts?raw";
import p070PulpStarter from "./070-energy-coupled-scm/pulp/starter.py?raw";
import p070PulpSolution from "./070-energy-coupled-scm/pulp/solution.py?raw";
import { judge as p070Judge } from "./070-energy-coupled-scm/judge.js";

export const CH07_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p061Meta,
    rawCases: p061Cases,
    locales: { en: p061En, ja: p061Ja, zh: p061Zh },
    markdownLoaders: {
      en: () => import("./061-single-item-lot-sizing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./061-single-item-lot-sizing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./061-single-item-lot-sizing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./061-single-item-lot-sizing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./061-single-item-lot-sizing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./061-single-item-lot-sizing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p061WashiStarter,
    washiSolution: p061WashiSolution,
    pulpStarter: p061PulpStarter,
    pulpSolution: p061PulpSolution,
    judge: p061Judge,
  }),
  hydrateProblem({
    rawMeta: p062Meta,
    rawCases: p062Cases,
    locales: { en: p062En, ja: p062Ja, zh: p062Zh },
    markdownLoaders: {
      en: () => import("./062-multi-item-clsp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./062-multi-item-clsp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./062-multi-item-clsp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./062-multi-item-clsp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./062-multi-item-clsp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./062-multi-item-clsp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p062WashiStarter,
    washiSolution: p062WashiSolution,
    pulpStarter: p062PulpStarter,
    pulpSolution: p062PulpSolution,
    judge: p062Judge,
  }),
  hydrateProblem({
    rawMeta: p063Meta,
    rawCases: p063Cases,
    locales: { en: p063En, ja: p063Ja, zh: p063Zh },
    markdownLoaders: {
      en: () => import("./063-backorders-lost-sales/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./063-backorders-lost-sales/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./063-backorders-lost-sales/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./063-backorders-lost-sales/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./063-backorders-lost-sales/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./063-backorders-lost-sales/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p063WashiStarter,
    washiSolution: p063WashiSolution,
    pulpStarter: p063PulpStarter,
    pulpSolution: p063PulpSolution,
    judge: p063Judge,
  }),
  hydrateProblem({
    rawMeta: p064Meta,
    rawCases: p064Cases,
    locales: { en: p064En, ja: p064Ja, zh: p064Zh },
    markdownLoaders: {
      en: () => import("./064-multilevel-bom-mrp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./064-multilevel-bom-mrp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./064-multilevel-bom-mrp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./064-multilevel-bom-mrp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./064-multilevel-bom-mrp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./064-multilevel-bom-mrp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p064WashiStarter,
    washiSolution: p064WashiSolution,
    pulpStarter: p064PulpStarter,
    pulpSolution: p064PulpSolution,
    judge: p064Judge,
  }),
  hydrateProblem({
    rawMeta: p065Meta,
    rawCases: p065Cases,
    locales: { en: p065En, ja: p065Ja, zh: p065Zh },
    markdownLoaders: {
      en: () => import("./065-multi-echelon-scm/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./065-multi-echelon-scm/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./065-multi-echelon-scm/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./065-multi-echelon-scm/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./065-multi-echelon-scm/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./065-multi-echelon-scm/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p065WashiStarter,
    washiSolution: p065WashiSolution,
    pulpStarter: p065PulpStarter,
    pulpSolution: p065PulpSolution,
    judge: p065Judge,
  }),
  hydrateProblem({
    rawMeta: p066Meta,
    rawCases: p066Cases,
    locales: { en: p066En, ja: p066Ja, zh: p066Zh },
    markdownLoaders: {
      en: () => import("./066-cross-docking-sync/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./066-cross-docking-sync/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./066-cross-docking-sync/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./066-cross-docking-sync/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./066-cross-docking-sync/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./066-cross-docking-sync/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p066WashiStarter,
    washiSolution: p066WashiSolution,
    pulpStarter: p066PulpStarter,
    pulpSolution: p066PulpSolution,
    judge: p066Judge,
  }),
  hydrateProblem({
    rawMeta: p067Meta,
    rawCases: p067Cases,
    locales: { en: p067En, ja: p067Ja, zh: p067Zh },
    markdownLoaders: {
      en: () => import("./067-supplier-allocation-caps/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./067-supplier-allocation-caps/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./067-supplier-allocation-caps/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./067-supplier-allocation-caps/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./067-supplier-allocation-caps/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./067-supplier-allocation-caps/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p067WashiStarter,
    washiSolution: p067WashiSolution,
    pulpStarter: p067PulpStarter,
    pulpSolution: p067PulpSolution,
    judge: p067Judge,
  }),
  hydrateProblem({
    rawMeta: p068Meta,
    rawCases: p068Cases,
    locales: { en: p068En, ja: p068Ja, zh: p068Zh },
    markdownLoaders: {
      en: () => import("./068-unit-commitment/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./068-unit-commitment/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./068-unit-commitment/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./068-unit-commitment/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./068-unit-commitment/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./068-unit-commitment/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p068WashiStarter,
    washiSolution: p068WashiSolution,
    pulpStarter: p068PulpStarter,
    pulpSolution: p068PulpSolution,
    judge: p068Judge,
  }),
  hydrateProblem({
    rawMeta: p069Meta,
    rawCases: p069Cases,
    locales: { en: p069En, ja: p069Ja, zh: p069Zh },
    markdownLoaders: {
      en: () => import("./069-battery-peak-shaving/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./069-battery-peak-shaving/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./069-battery-peak-shaving/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./069-battery-peak-shaving/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./069-battery-peak-shaving/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./069-battery-peak-shaving/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p069WashiStarter,
    washiSolution: p069WashiSolution,
    pulpStarter: p069PulpStarter,
    pulpSolution: p069PulpSolution,
    judge: p069Judge,
  }),
  hydrateProblem({
    rawMeta: p070Meta,
    rawCases: p070Cases,
    locales: { en: p070En, ja: p070Ja, zh: p070Zh },
    markdownLoaders: {
      en: () => import("./070-energy-coupled-scm/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./070-energy-coupled-scm/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./070-energy-coupled-scm/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./070-energy-coupled-scm/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./070-energy-coupled-scm/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./070-energy-coupled-scm/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p070WashiStarter,
    washiSolution: p070WashiSolution,
    pulpStarter: p070PulpStarter,
    pulpSolution: p070PulpSolution,
    judge: p070Judge,
  }),
];
