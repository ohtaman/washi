import type { ProblemDefinition } from "../../types.js";
import { hydrateProblem } from "../hydrate.js";

// #021
import p021Meta from "./021-minimax-load-balancing/meta.json";
import p021Cases from "./021-minimax-load-balancing/cases.json";
import p021En from "./021-minimax-load-balancing/locales/en.json";
import p021Ja from "./021-minimax-load-balancing/locales/ja.json";
import p021Zh from "./021-minimax-load-balancing/locales/zh.json";
import p021WashiStarter from "./021-minimax-load-balancing/washi/starter.ts?raw";
import p021WashiSolution from "./021-minimax-load-balancing/washi/solution.ts?raw";
import p021HighspyStarter from "./021-minimax-load-balancing/highspy/starter.py?raw";
import p021HighspySolution from "./021-minimax-load-balancing/highspy/solution.py?raw";
import { judge as p021Judge } from "./021-minimax-load-balancing/judge.js";

// #022
import p022Meta from "./022-l1-deviation-linearization/meta.json";
import p022Cases from "./022-l1-deviation-linearization/cases.json";
import p022En from "./022-l1-deviation-linearization/locales/en.json";
import p022Ja from "./022-l1-deviation-linearization/locales/ja.json";
import p022Zh from "./022-l1-deviation-linearization/locales/zh.json";
import p022WashiStarter from "./022-l1-deviation-linearization/washi/starter.ts?raw";
import p022WashiSolution from "./022-l1-deviation-linearization/washi/solution.ts?raw";
import p022HighspyStarter from "./022-l1-deviation-linearization/highspy/starter.py?raw";
import p022HighspySolution from "./022-l1-deviation-linearization/highspy/solution.py?raw";
import { judge as p022Judge } from "./022-l1-deviation-linearization/judge.js";

// #023
import p023Meta from "./023-positive-part-overtime/meta.json";
import p023Cases from "./023-positive-part-overtime/cases.json";
import p023En from "./023-positive-part-overtime/locales/en.json";
import p023Ja from "./023-positive-part-overtime/locales/ja.json";
import p023Zh from "./023-positive-part-overtime/locales/zh.json";
import p023WashiStarter from "./023-positive-part-overtime/washi/starter.ts?raw";
import p023WashiSolution from "./023-positive-part-overtime/washi/solution.ts?raw";
import p023HighspyStarter from "./023-positive-part-overtime/highspy/starter.py?raw";
import p023HighspySolution from "./023-positive-part-overtime/highspy/solution.py?raw";
import { judge as p023Judge } from "./023-positive-part-overtime/judge.js";

// #024
import p024Meta from "./024-charnes-cooper-ratio/meta.json";
import p024Cases from "./024-charnes-cooper-ratio/cases.json";
import p024En from "./024-charnes-cooper-ratio/locales/en.json";
import p024Ja from "./024-charnes-cooper-ratio/locales/ja.json";
import p024Zh from "./024-charnes-cooper-ratio/locales/zh.json";
import p024WashiStarter from "./024-charnes-cooper-ratio/washi/starter.ts?raw";
import p024WashiSolution from "./024-charnes-cooper-ratio/washi/solution.ts?raw";
import p024HighspyStarter from "./024-charnes-cooper-ratio/highspy/starter.py?raw";
import p024HighspySolution from "./024-charnes-cooper-ratio/highspy/solution.py?raw";
import { judge as p024Judge } from "./024-charnes-cooper-ratio/judge.js";

// #025
import p025Meta from "./025-binary-continuous-product/meta.json";
import p025Cases from "./025-binary-continuous-product/cases.json";
import p025En from "./025-binary-continuous-product/locales/en.json";
import p025Ja from "./025-binary-continuous-product/locales/ja.json";
import p025Zh from "./025-binary-continuous-product/locales/zh.json";
import p025WashiStarter from "./025-binary-continuous-product/washi/starter.ts?raw";
import p025WashiSolution from "./025-binary-continuous-product/washi/solution.ts?raw";
import p025HighspyStarter from "./025-binary-continuous-product/highspy/starter.py?raw";
import p025HighspySolution from "./025-binary-continuous-product/highspy/solution.py?raw";
import { judge as p025Judge } from "./025-binary-continuous-product/judge.js";

// #026
import p026Meta from "./026-rpg-party-synergy/meta.json";
import p026Cases from "./026-rpg-party-synergy/cases.json";
import p026En from "./026-rpg-party-synergy/locales/en.json";
import p026Ja from "./026-rpg-party-synergy/locales/ja.json";
import p026Zh from "./026-rpg-party-synergy/locales/zh.json";
import p026WashiStarter from "./026-rpg-party-synergy/washi/starter.ts?raw";
import p026WashiSolution from "./026-rpg-party-synergy/washi/solution.ts?raw";
import p026HighspyStarter from "./026-rpg-party-synergy/highspy/starter.py?raw";
import p026HighspySolution from "./026-rpg-party-synergy/highspy/solution.py?raw";
import { judge as p026Judge } from "./026-rpg-party-synergy/judge.js";

// #027
import p027Meta from "./027-lp-duals-shadow-prices/meta.json";
import p027Cases from "./027-lp-duals-shadow-prices/cases.json";
import p027En from "./027-lp-duals-shadow-prices/locales/en.json";
import p027Ja from "./027-lp-duals-shadow-prices/locales/ja.json";
import p027Zh from "./027-lp-duals-shadow-prices/locales/zh.json";
import p027WashiStarter from "./027-lp-duals-shadow-prices/washi/starter.ts?raw";
import p027WashiSolution from "./027-lp-duals-shadow-prices/washi/solution.ts?raw";
import p027HighspyStarter from "./027-lp-duals-shadow-prices/highspy/starter.py?raw";
import p027HighspySolution from "./027-lp-duals-shadow-prices/highspy/solution.py?raw";
import { judge as p027Judge } from "./027-lp-duals-shadow-prices/judge.js";

// #028
import p028Meta from "./028-lp-reduced-costs/meta.json";
import p028Cases from "./028-lp-reduced-costs/cases.json";
import p028En from "./028-lp-reduced-costs/locales/en.json";
import p028Ja from "./028-lp-reduced-costs/locales/ja.json";
import p028Zh from "./028-lp-reduced-costs/locales/zh.json";
import p028WashiStarter from "./028-lp-reduced-costs/washi/starter.ts?raw";
import p028WashiSolution from "./028-lp-reduced-costs/washi/solution.ts?raw";
import p028HighspyStarter from "./028-lp-reduced-costs/highspy/starter.py?raw";
import p028HighspySolution from "./028-lp-reduced-costs/highspy/solution.py?raw";
import { judge as p028Judge } from "./028-lp-reduced-costs/judge.js";

// #029
import p029Meta from "./029-disjunctive-convex-hull/meta.json";
import p029Cases from "./029-disjunctive-convex-hull/cases.json";
import p029En from "./029-disjunctive-convex-hull/locales/en.json";
import p029Ja from "./029-disjunctive-convex-hull/locales/ja.json";
import p029Zh from "./029-disjunctive-convex-hull/locales/zh.json";
import p029WashiStarter from "./029-disjunctive-convex-hull/washi/starter.ts?raw";
import p029WashiSolution from "./029-disjunctive-convex-hull/washi/solution.ts?raw";
import p029HighspyStarter from "./029-disjunctive-convex-hull/highspy/starter.py?raw";
import p029HighspySolution from "./029-disjunctive-convex-hull/highspy/solution.py?raw";
import { judge as p029Judge } from "./029-disjunctive-convex-hull/judge.js";

// #030
import p030Meta from "./030-linearization-synthesis/meta.json";
import p030Cases from "./030-linearization-synthesis/cases.json";
import p030En from "./030-linearization-synthesis/locales/en.json";
import p030Ja from "./030-linearization-synthesis/locales/ja.json";
import p030Zh from "./030-linearization-synthesis/locales/zh.json";
import p030WashiStarter from "./030-linearization-synthesis/washi/starter.ts?raw";
import p030WashiSolution from "./030-linearization-synthesis/washi/solution.ts?raw";
import p030HighspyStarter from "./030-linearization-synthesis/highspy/starter.py?raw";
import p030HighspySolution from "./030-linearization-synthesis/highspy/solution.py?raw";
import { judge as p030Judge } from "./030-linearization-synthesis/judge.js";

export const CH03_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p021Meta,
    rawCases: p021Cases,
    locales: { en: p021En, ja: p021Ja, zh: p021Zh },
    markdownLoaders: {
      en: () => import("./021-minimax-load-balancing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./021-minimax-load-balancing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./021-minimax-load-balancing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./021-minimax-load-balancing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./021-minimax-load-balancing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./021-minimax-load-balancing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p021WashiStarter,
    washiSolution: p021WashiSolution,
    highspyStarter: p021HighspyStarter,
    highspySolution: p021HighspySolution,
    judge: p021Judge,
  }),
  hydrateProblem({
    rawMeta: p022Meta,
    rawCases: p022Cases,
    locales: { en: p022En, ja: p022Ja, zh: p022Zh },
    markdownLoaders: {
      en: () => import("./022-l1-deviation-linearization/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./022-l1-deviation-linearization/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./022-l1-deviation-linearization/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./022-l1-deviation-linearization/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./022-l1-deviation-linearization/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./022-l1-deviation-linearization/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p022WashiStarter,
    washiSolution: p022WashiSolution,
    highspyStarter: p022HighspyStarter,
    highspySolution: p022HighspySolution,
    judge: p022Judge,
  }),
  hydrateProblem({
    rawMeta: p023Meta,
    rawCases: p023Cases,
    locales: { en: p023En, ja: p023Ja, zh: p023Zh },
    markdownLoaders: {
      en: () => import("./023-positive-part-overtime/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./023-positive-part-overtime/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./023-positive-part-overtime/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./023-positive-part-overtime/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./023-positive-part-overtime/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./023-positive-part-overtime/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p023WashiStarter,
    washiSolution: p023WashiSolution,
    highspyStarter: p023HighspyStarter,
    highspySolution: p023HighspySolution,
    judge: p023Judge,
  }),
  hydrateProblem({
    rawMeta: p024Meta,
    rawCases: p024Cases,
    locales: { en: p024En, ja: p024Ja, zh: p024Zh },
    markdownLoaders: {
      en: () => import("./024-charnes-cooper-ratio/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./024-charnes-cooper-ratio/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./024-charnes-cooper-ratio/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./024-charnes-cooper-ratio/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./024-charnes-cooper-ratio/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./024-charnes-cooper-ratio/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p024WashiStarter,
    washiSolution: p024WashiSolution,
    highspyStarter: p024HighspyStarter,
    highspySolution: p024HighspySolution,
    judge: p024Judge,
  }),
  hydrateProblem({
    rawMeta: p025Meta,
    rawCases: p025Cases,
    locales: { en: p025En, ja: p025Ja, zh: p025Zh },
    markdownLoaders: {
      en: () => import("./025-binary-continuous-product/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./025-binary-continuous-product/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./025-binary-continuous-product/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./025-binary-continuous-product/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./025-binary-continuous-product/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./025-binary-continuous-product/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p025WashiStarter,
    washiSolution: p025WashiSolution,
    highspyStarter: p025HighspyStarter,
    highspySolution: p025HighspySolution,
    judge: p025Judge,
  }),
  hydrateProblem({
    rawMeta: p026Meta,
    rawCases: p026Cases,
    locales: { en: p026En, ja: p026Ja, zh: p026Zh },
    markdownLoaders: {
      en: () => import("./026-rpg-party-synergy/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./026-rpg-party-synergy/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./026-rpg-party-synergy/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./026-rpg-party-synergy/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./026-rpg-party-synergy/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./026-rpg-party-synergy/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p026WashiStarter,
    washiSolution: p026WashiSolution,
    highspyStarter: p026HighspyStarter,
    highspySolution: p026HighspySolution,
    judge: p026Judge,
  }),
  hydrateProblem({
    rawMeta: p027Meta,
    rawCases: p027Cases,
    locales: { en: p027En, ja: p027Ja, zh: p027Zh },
    markdownLoaders: {
      en: () => import("./027-lp-duals-shadow-prices/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./027-lp-duals-shadow-prices/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./027-lp-duals-shadow-prices/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./027-lp-duals-shadow-prices/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./027-lp-duals-shadow-prices/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./027-lp-duals-shadow-prices/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p027WashiStarter,
    washiSolution: p027WashiSolution,
    highspyStarter: p027HighspyStarter,
    highspySolution: p027HighspySolution,
    judge: p027Judge,
  }),
  hydrateProblem({
    rawMeta: p028Meta,
    rawCases: p028Cases,
    locales: { en: p028En, ja: p028Ja, zh: p028Zh },
    markdownLoaders: {
      en: () => import("./028-lp-reduced-costs/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./028-lp-reduced-costs/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./028-lp-reduced-costs/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./028-lp-reduced-costs/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./028-lp-reduced-costs/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./028-lp-reduced-costs/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p028WashiStarter,
    washiSolution: p028WashiSolution,
    highspyStarter: p028HighspyStarter,
    highspySolution: p028HighspySolution,
    judge: p028Judge,
  }),
  hydrateProblem({
    rawMeta: p029Meta,
    rawCases: p029Cases,
    locales: { en: p029En, ja: p029Ja, zh: p029Zh },
    markdownLoaders: {
      en: () => import("./029-disjunctive-convex-hull/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./029-disjunctive-convex-hull/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./029-disjunctive-convex-hull/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./029-disjunctive-convex-hull/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./029-disjunctive-convex-hull/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./029-disjunctive-convex-hull/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p029WashiStarter,
    washiSolution: p029WashiSolution,
    highspyStarter: p029HighspyStarter,
    highspySolution: p029HighspySolution,
    judge: p029Judge,
  }),
  hydrateProblem({
    rawMeta: p030Meta,
    rawCases: p030Cases,
    locales: { en: p030En, ja: p030Ja, zh: p030Zh },
    markdownLoaders: {
      en: () => import("./030-linearization-synthesis/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./030-linearization-synthesis/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./030-linearization-synthesis/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./030-linearization-synthesis/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./030-linearization-synthesis/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./030-linearization-synthesis/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p030WashiStarter,
    washiSolution: p030WashiSolution,
    highspyStarter: p030HighspyStarter,
    highspySolution: p030HighspySolution,
    judge: p030Judge,
  }),
];
