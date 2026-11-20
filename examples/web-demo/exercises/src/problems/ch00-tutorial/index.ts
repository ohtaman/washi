import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #000
import p000Meta from "./000-welcome-sum/meta.json";
import p000Cases from "./000-welcome-sum/cases.json";
import p000En from "./000-welcome-sum/locales/en.json";
import p000Ja from "./000-welcome-sum/locales/ja.json";
import p000Zh from "./000-welcome-sum/locales/zh.json";
import p000WashiStarter from "./000-welcome-sum/washi/starter.ts?raw";
import p000WashiSolution from "./000-welcome-sum/washi/solution.ts?raw";
import p000HighspyStarter from "./000-welcome-sum/highspy/starter.py?raw";
import p000HighspySolution from "./000-welcome-sum/highspy/solution.py?raw";
import { judge as p000Judge } from "./000-welcome-sum/judge.js";

export const CH00_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p000Meta,
    rawCases: p000Cases,
    locales: { en: p000En, ja: p000Ja, zh: p000Zh },
    markdownLoaders: {
      en: () => import("./000-welcome-sum/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./000-welcome-sum/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./000-welcome-sum/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./000-welcome-sum/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./000-welcome-sum/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./000-welcome-sum/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p000WashiStarter,
    washiSolution: p000WashiSolution,
    highspyStarter: p000HighspyStarter,
    highspySolution: p000HighspySolution,
    judge: p000Judge,
  }),
];
