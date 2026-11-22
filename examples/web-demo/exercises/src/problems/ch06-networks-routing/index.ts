import type { ProblemDefinition } from "../../types.js";
import { hydrateProblem } from "../hydrate.js";

// #051
import p051Meta from "./051-min-cost-flow-tu/meta.json";
import p051Cases from "./051-min-cost-flow-tu/cases.json";
import p051En from "./051-min-cost-flow-tu/locales/en.json";
import p051Ja from "./051-min-cost-flow-tu/locales/ja.json";
import p051Zh from "./051-min-cost-flow-tu/locales/zh.json";
import p051WashiStarter from "./051-min-cost-flow-tu/washi/starter.ts?raw";
import p051WashiSolution from "./051-min-cost-flow-tu/washi/solution.ts?raw";
import p051HighspyStarter from "./051-min-cost-flow-tu/highspy/starter.py?raw";
import p051HighspySolution from "./051-min-cost-flow-tu/highspy/solution.py?raw";
import { judge as p051Judge } from "./051-min-cost-flow-tu/judge.js";

// #052
import p052Meta from "./052-max-flow-min-cut/meta.json";
import p052Cases from "./052-max-flow-min-cut/cases.json";
import p052En from "./052-max-flow-min-cut/locales/en.json";
import p052Ja from "./052-max-flow-min-cut/locales/ja.json";
import p052Zh from "./052-max-flow-min-cut/locales/zh.json";
import p052WashiStarter from "./052-max-flow-min-cut/washi/starter.ts?raw";
import p052WashiSolution from "./052-max-flow-min-cut/washi/solution.ts?raw";
import p052HighspyStarter from "./052-max-flow-min-cut/highspy/starter.py?raw";
import p052HighspySolution from "./052-max-flow-min-cut/highspy/solution.py?raw";
import { judge as p052Judge } from "./052-max-flow-min-cut/judge.js";

// #053
import p053Meta from "./053-rcsp-shortest-path/meta.json";
import p053Cases from "./053-rcsp-shortest-path/cases.json";
import p053En from "./053-rcsp-shortest-path/locales/en.json";
import p053Ja from "./053-rcsp-shortest-path/locales/ja.json";
import p053Zh from "./053-rcsp-shortest-path/locales/zh.json";
import p053WashiStarter from "./053-rcsp-shortest-path/washi/starter.ts?raw";
import p053WashiSolution from "./053-rcsp-shortest-path/washi/solution.ts?raw";
import p053HighspyStarter from "./053-rcsp-shortest-path/highspy/starter.py?raw";
import p053HighspySolution from "./053-rcsp-shortest-path/highspy/solution.py?raw";
import { judge as p053Judge } from "./053-rcsp-shortest-path/judge.js";

// #054
import p054Meta from "./054-dj-setlist-tour/meta.json";
import p054Cases from "./054-dj-setlist-tour/cases.json";
import p054En from "./054-dj-setlist-tour/locales/en.json";
import p054Ja from "./054-dj-setlist-tour/locales/ja.json";
import p054Zh from "./054-dj-setlist-tour/locales/zh.json";
import p054WashiStarter from "./054-dj-setlist-tour/washi/starter.ts?raw";
import p054WashiSolution from "./054-dj-setlist-tour/washi/solution.ts?raw";
import p054HighspyStarter from "./054-dj-setlist-tour/highspy/starter.py?raw";
import p054HighspySolution from "./054-dj-setlist-tour/highspy/solution.py?raw";
import { judge as p054Judge } from "./054-dj-setlist-tour/judge.js";

// #055
import p055Meta from "./055-flow-graph-connectivity/meta.json";
import p055Cases from "./055-flow-graph-connectivity/cases.json";
import p055En from "./055-flow-graph-connectivity/locales/en.json";
import p055Ja from "./055-flow-graph-connectivity/locales/ja.json";
import p055Zh from "./055-flow-graph-connectivity/locales/zh.json";
import p055WashiStarter from "./055-flow-graph-connectivity/washi/starter.ts?raw";
import p055WashiSolution from "./055-flow-graph-connectivity/washi/solution.ts?raw";
import p055HighspyStarter from "./055-flow-graph-connectivity/highspy/starter.py?raw";
import p055HighspySolution from "./055-flow-graph-connectivity/highspy/solution.py?raw";
import { judge as p055Judge } from "./055-flow-graph-connectivity/judge.js";

// #056
import p056Meta from "./056-cvrp-routing/meta.json";
import p056Cases from "./056-cvrp-routing/cases.json";
import p056En from "./056-cvrp-routing/locales/en.json";
import p056Ja from "./056-cvrp-routing/locales/ja.json";
import p056Zh from "./056-cvrp-routing/locales/zh.json";
import p056WashiStarter from "./056-cvrp-routing/washi/starter.ts?raw";
import p056WashiSolution from "./056-cvrp-routing/washi/solution.ts?raw";
import p056HighspyStarter from "./056-cvrp-routing/highspy/starter.py?raw";
import p056HighspySolution from "./056-cvrp-routing/highspy/solution.py?raw";
import { judge as p056Judge } from "./056-cvrp-routing/judge.js";

// #057
import p057Meta from "./057-theme-park-itinerary/meta.json";
import p057Cases from "./057-theme-park-itinerary/cases.json";
import p057En from "./057-theme-park-itinerary/locales/en.json";
import p057Ja from "./057-theme-park-itinerary/locales/ja.json";
import p057Zh from "./057-theme-park-itinerary/locales/zh.json";
import p057WashiStarter from "./057-theme-park-itinerary/washi/starter.ts?raw";
import p057WashiSolution from "./057-theme-park-itinerary/washi/solution.ts?raw";
import p057HighspyStarter from "./057-theme-park-itinerary/highspy/starter.py?raw";
import p057HighspySolution from "./057-theme-park-itinerary/highspy/solution.py?raw";
import { judge as p057Judge } from "./057-theme-park-itinerary/judge.js";

// #058
import p058Meta from "./058-pickup-delivery/meta.json";
import p058Cases from "./058-pickup-delivery/cases.json";
import p058En from "./058-pickup-delivery/locales/en.json";
import p058Ja from "./058-pickup-delivery/locales/ja.json";
import p058Zh from "./058-pickup-delivery/locales/zh.json";
import p058WashiStarter from "./058-pickup-delivery/washi/starter.ts?raw";
import p058WashiSolution from "./058-pickup-delivery/washi/solution.ts?raw";
import p058HighspyStarter from "./058-pickup-delivery/highspy/starter.py?raw";
import p058HighspySolution from "./058-pickup-delivery/highspy/solution.py?raw";
import { judge as p058Judge } from "./058-pickup-delivery/judge.js";

// #059
import p059Meta from "./059-multi-depot-vrp/meta.json";
import p059Cases from "./059-multi-depot-vrp/cases.json";
import p059En from "./059-multi-depot-vrp/locales/en.json";
import p059Ja from "./059-multi-depot-vrp/locales/ja.json";
import p059Zh from "./059-multi-depot-vrp/locales/zh.json";
import p059WashiStarter from "./059-multi-depot-vrp/washi/starter.ts?raw";
import p059WashiSolution from "./059-multi-depot-vrp/washi/solution.ts?raw";
import p059HighspyStarter from "./059-multi-depot-vrp/highspy/starter.py?raw";
import p059HighspySolution from "./059-multi-depot-vrp/highspy/solution.py?raw";
import { judge as p059Judge } from "./059-multi-depot-vrp/judge.js";

// #060
import p060Meta from "./060-connected-territory-routing/meta.json";
import p060Cases from "./060-connected-territory-routing/cases.json";
import p060En from "./060-connected-territory-routing/locales/en.json";
import p060Ja from "./060-connected-territory-routing/locales/ja.json";
import p060Zh from "./060-connected-territory-routing/locales/zh.json";
import p060WashiStarter from "./060-connected-territory-routing/washi/starter.ts?raw";
import p060WashiSolution from "./060-connected-territory-routing/washi/solution.ts?raw";
import p060HighspyStarter from "./060-connected-territory-routing/highspy/starter.py?raw";
import p060HighspySolution from "./060-connected-territory-routing/highspy/solution.py?raw";
import { judge as p060Judge } from "./060-connected-territory-routing/judge.js";

export const CH06_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p051Meta,
    rawCases: p051Cases,
    locales: { en: p051En, ja: p051Ja, zh: p051Zh },
    markdownLoaders: {
      en: () => import("./051-min-cost-flow-tu/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./051-min-cost-flow-tu/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./051-min-cost-flow-tu/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./051-min-cost-flow-tu/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./051-min-cost-flow-tu/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./051-min-cost-flow-tu/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p051WashiStarter,
    washiSolution: p051WashiSolution,
    highspyStarter: p051HighspyStarter,
    highspySolution: p051HighspySolution,
    judge: p051Judge,
  }),
  hydrateProblem({
    rawMeta: p052Meta,
    rawCases: p052Cases,
    locales: { en: p052En, ja: p052Ja, zh: p052Zh },
    markdownLoaders: {
      en: () => import("./052-max-flow-min-cut/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./052-max-flow-min-cut/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./052-max-flow-min-cut/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./052-max-flow-min-cut/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./052-max-flow-min-cut/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./052-max-flow-min-cut/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p052WashiStarter,
    washiSolution: p052WashiSolution,
    highspyStarter: p052HighspyStarter,
    highspySolution: p052HighspySolution,
    judge: p052Judge,
  }),
  hydrateProblem({
    rawMeta: p053Meta,
    rawCases: p053Cases,
    locales: { en: p053En, ja: p053Ja, zh: p053Zh },
    markdownLoaders: {
      en: () => import("./053-rcsp-shortest-path/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./053-rcsp-shortest-path/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./053-rcsp-shortest-path/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./053-rcsp-shortest-path/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./053-rcsp-shortest-path/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./053-rcsp-shortest-path/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p053WashiStarter,
    washiSolution: p053WashiSolution,
    highspyStarter: p053HighspyStarter,
    highspySolution: p053HighspySolution,
    judge: p053Judge,
  }),
  hydrateProblem({
    rawMeta: p054Meta,
    rawCases: p054Cases,
    locales: { en: p054En, ja: p054Ja, zh: p054Zh },
    markdownLoaders: {
      en: () => import("./054-dj-setlist-tour/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./054-dj-setlist-tour/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./054-dj-setlist-tour/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./054-dj-setlist-tour/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./054-dj-setlist-tour/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./054-dj-setlist-tour/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p054WashiStarter,
    washiSolution: p054WashiSolution,
    highspyStarter: p054HighspyStarter,
    highspySolution: p054HighspySolution,
    judge: p054Judge,
  }),
  hydrateProblem({
    rawMeta: p055Meta,
    rawCases: p055Cases,
    locales: { en: p055En, ja: p055Ja, zh: p055Zh },
    markdownLoaders: {
      en: () => import("./055-flow-graph-connectivity/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./055-flow-graph-connectivity/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./055-flow-graph-connectivity/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./055-flow-graph-connectivity/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./055-flow-graph-connectivity/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./055-flow-graph-connectivity/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p055WashiStarter,
    washiSolution: p055WashiSolution,
    highspyStarter: p055HighspyStarter,
    highspySolution: p055HighspySolution,
    judge: p055Judge,
  }),
  hydrateProblem({
    rawMeta: p056Meta,
    rawCases: p056Cases,
    locales: { en: p056En, ja: p056Ja, zh: p056Zh },
    markdownLoaders: {
      en: () => import("./056-cvrp-routing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./056-cvrp-routing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./056-cvrp-routing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./056-cvrp-routing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./056-cvrp-routing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./056-cvrp-routing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p056WashiStarter,
    washiSolution: p056WashiSolution,
    highspyStarter: p056HighspyStarter,
    highspySolution: p056HighspySolution,
    judge: p056Judge,
  }),
  hydrateProblem({
    rawMeta: p057Meta,
    rawCases: p057Cases,
    locales: { en: p057En, ja: p057Ja, zh: p057Zh },
    markdownLoaders: {
      en: () => import("./057-theme-park-itinerary/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./057-theme-park-itinerary/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./057-theme-park-itinerary/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./057-theme-park-itinerary/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./057-theme-park-itinerary/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./057-theme-park-itinerary/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p057WashiStarter,
    washiSolution: p057WashiSolution,
    highspyStarter: p057HighspyStarter,
    highspySolution: p057HighspySolution,
    judge: p057Judge,
  }),
  hydrateProblem({
    rawMeta: p058Meta,
    rawCases: p058Cases,
    locales: { en: p058En, ja: p058Ja, zh: p058Zh },
    markdownLoaders: {
      en: () => import("./058-pickup-delivery/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./058-pickup-delivery/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./058-pickup-delivery/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./058-pickup-delivery/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./058-pickup-delivery/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./058-pickup-delivery/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p058WashiStarter,
    washiSolution: p058WashiSolution,
    highspyStarter: p058HighspyStarter,
    highspySolution: p058HighspySolution,
    judge: p058Judge,
  }),
  hydrateProblem({
    rawMeta: p059Meta,
    rawCases: p059Cases,
    locales: { en: p059En, ja: p059Ja, zh: p059Zh },
    markdownLoaders: {
      en: () => import("./059-multi-depot-vrp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./059-multi-depot-vrp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./059-multi-depot-vrp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./059-multi-depot-vrp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./059-multi-depot-vrp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./059-multi-depot-vrp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p059WashiStarter,
    washiSolution: p059WashiSolution,
    highspyStarter: p059HighspyStarter,
    highspySolution: p059HighspySolution,
    judge: p059Judge,
  }),
  hydrateProblem({
    rawMeta: p060Meta,
    rawCases: p060Cases,
    locales: { en: p060En, ja: p060Ja, zh: p060Zh },
    markdownLoaders: {
      en: () => import("./060-connected-territory-routing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./060-connected-territory-routing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./060-connected-territory-routing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./060-connected-territory-routing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./060-connected-territory-routing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./060-connected-territory-routing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p060WashiStarter,
    washiSolution: p060WashiSolution,
    highspyStarter: p060HighspyStarter,
    highspySolution: p060HighspySolution,
    judge: p060Judge,
  }),
];
