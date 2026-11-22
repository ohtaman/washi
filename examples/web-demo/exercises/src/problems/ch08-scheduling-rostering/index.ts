import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #071
import p071Meta from "./071-machine-tardiness/meta.json";
import p071Cases from "./071-machine-tardiness/cases.json";
import p071En from "./071-machine-tardiness/locales/en.json";
import p071Ja from "./071-machine-tardiness/locales/ja.json";
import p071Zh from "./071-machine-tardiness/locales/zh.json";
import p071WashiStarter from "./071-machine-tardiness/washi/starter.ts?raw";
import p071WashiSolution from "./071-machine-tardiness/washi/solution.ts?raw";
import p071HighspyStarter from "./071-machine-tardiness/highspy/starter.py?raw";
import p071HighspySolution from "./071-machine-tardiness/highspy/solution.py?raw";
import { judge as p071Judge } from "./071-machine-tardiness/judge.js";

// #072
import p072Meta from "./072-sequence-dependent-setups/meta.json";
import p072Cases from "./072-sequence-dependent-setups/cases.json";
import p072En from "./072-sequence-dependent-setups/locales/en.json";
import p072Ja from "./072-sequence-dependent-setups/locales/ja.json";
import p072Zh from "./072-sequence-dependent-setups/locales/zh.json";
import p072WashiStarter from "./072-sequence-dependent-setups/washi/starter.ts?raw";
import p072WashiSolution from "./072-sequence-dependent-setups/washi/solution.ts?raw";
import p072HighspyStarter from "./072-sequence-dependent-setups/highspy/starter.py?raw";
import p072HighspySolution from "./072-sequence-dependent-setups/highspy/solution.py?raw";
import { judge as p072Judge } from "./072-sequence-dependent-setups/judge.js";

// #073 (WaSHI-only CP)
import p073Meta from "./073-job-shop-jssp/meta.json";
import p073Cases from "./073-job-shop-jssp/cases.json";
import p073En from "./073-job-shop-jssp/locales/en.json";
import p073Ja from "./073-job-shop-jssp/locales/ja.json";
import p073Zh from "./073-job-shop-jssp/locales/zh.json";
import p073WashiStarter from "./073-job-shop-jssp/washi/starter.ts?raw";
import p073WashiSolution from "./073-job-shop-jssp/washi/solution.ts?raw";
import { judge as p073Judge } from "./073-job-shop-jssp/judge.js";

// #074 (WaSHI-only CP)
import p074Meta from "./074-rcpsp-project/meta.json";
import p074Cases from "./074-rcpsp-project/cases.json";
import p074En from "./074-rcpsp-project/locales/en.json";
import p074Ja from "./074-rcpsp-project/locales/ja.json";
import p074Zh from "./074-rcpsp-project/locales/zh.json";
import p074WashiStarter from "./074-rcpsp-project/washi/starter.ts?raw";
import p074WashiSolution from "./074-rcpsp-project/washi/solution.ts?raw";
import { judge as p074Judge } from "./074-rcpsp-project/judge.js";

// #075
import p075Meta from "./075-shift-coverage-days-off/meta.json";
import p075Cases from "./075-shift-coverage-days-off/cases.json";
import p075En from "./075-shift-coverage-days-off/locales/en.json";
import p075Ja from "./075-shift-coverage-days-off/locales/ja.json";
import p075Zh from "./075-shift-coverage-days-off/locales/zh.json";
import p075WashiStarter from "./075-shift-coverage-days-off/washi/starter.ts?raw";
import p075WashiSolution from "./075-shift-coverage-days-off/washi/solution.ts?raw";
import p075HighspyStarter from "./075-shift-coverage-days-off/highspy/starter.py?raw";
import p075HighspySolution from "./075-shift-coverage-days-off/highspy/solution.py?raw";
import { judge as p075Judge } from "./075-shift-coverage-days-off/judge.js";

// #076
import p076Meta from "./076-consecutive-night-rest/meta.json";
import p076Cases from "./076-consecutive-night-rest/cases.json";
import p076En from "./076-consecutive-night-rest/locales/en.json";
import p076Ja from "./076-consecutive-night-rest/locales/ja.json";
import p076Zh from "./076-consecutive-night-rest/locales/zh.json";
import p076WashiStarter from "./076-consecutive-night-rest/washi/starter.ts?raw";
import p076WashiSolution from "./076-consecutive-night-rest/washi/solution.ts?raw";
import p076HighspyStarter from "./076-consecutive-night-rest/highspy/starter.py?raw";
import p076HighspySolution from "./076-consecutive-night-rest/highspy/solution.py?raw";
import { judge as p076Judge } from "./076-consecutive-night-rest/judge.js";

// #077
import p077Meta from "./077-skill-tiers-leads-ng-pairs/meta.json";
import p077Cases from "./077-skill-tiers-leads-ng-pairs/cases.json";
import p077En from "./077-skill-tiers-leads-ng-pairs/locales/en.json";
import p077Ja from "./077-skill-tiers-leads-ng-pairs/locales/ja.json";
import p077Zh from "./077-skill-tiers-leads-ng-pairs/locales/zh.json";
import p077WashiStarter from "./077-skill-tiers-leads-ng-pairs/washi/starter.ts?raw";
import p077WashiSolution from "./077-skill-tiers-leads-ng-pairs/washi/solution.ts?raw";
import p077HighspyStarter from "./077-skill-tiers-leads-ng-pairs/highspy/starter.py?raw";
import p077HighspySolution from "./077-skill-tiers-leads-ng-pairs/highspy/solution.py?raw";
import { judge as p077Judge } from "./077-skill-tiers-leads-ng-pairs/judge.js";

// #078
import p078Meta from "./078-university-timetabling/meta.json";
import p078Cases from "./078-university-timetabling/cases.json";
import p078En from "./078-university-timetabling/locales/en.json";
import p078Ja from "./078-university-timetabling/locales/ja.json";
import p078Zh from "./078-university-timetabling/locales/zh.json";
import p078WashiStarter from "./078-university-timetabling/washi/starter.ts?raw";
import p078WashiSolution from "./078-university-timetabling/washi/solution.ts?raw";
import p078HighspyStarter from "./078-university-timetabling/highspy/starter.py?raw";
import p078HighspySolution from "./078-university-timetabling/highspy/solution.py?raw";
import { judge as p078Judge } from "./078-university-timetabling/judge.js";

// #079
import p079Meta from "./079-esports-venue-scheduling/meta.json";
import p079Cases from "./079-esports-venue-scheduling/cases.json";
import p079En from "./079-esports-venue-scheduling/locales/en.json";
import p079Ja from "./079-esports-venue-scheduling/locales/ja.json";
import p079Zh from "./079-esports-venue-scheduling/locales/zh.json";
import p079WashiStarter from "./079-esports-venue-scheduling/washi/starter.ts?raw";
import p079WashiSolution from "./079-esports-venue-scheduling/washi/solution.ts?raw";
import p079HighspyStarter from "./079-esports-venue-scheduling/highspy/starter.py?raw";
import p079HighspySolution from "./079-esports-venue-scheduling/highspy/solution.py?raw";
import { judge as p079Judge } from "./079-esports-venue-scheduling/judge.js";

// #080
import p080Meta from "./080-integrated-staff-equipment/meta.json";
import p080Cases from "./080-integrated-staff-equipment/cases.json";
import p080En from "./080-integrated-staff-equipment/locales/en.json";
import p080Ja from "./080-integrated-staff-equipment/locales/ja.json";
import p080Zh from "./080-integrated-staff-equipment/locales/zh.json";
import p080WashiStarter from "./080-integrated-staff-equipment/washi/starter.ts?raw";
import p080WashiSolution from "./080-integrated-staff-equipment/washi/solution.ts?raw";
import p080HighspyStarter from "./080-integrated-staff-equipment/highspy/starter.py?raw";
import p080HighspySolution from "./080-integrated-staff-equipment/highspy/solution.py?raw";
import { judge as p080Judge } from "./080-integrated-staff-equipment/judge.js";

export const CH08_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p071Meta,
    rawCases: p071Cases,
    locales: { en: p071En, ja: p071Ja, zh: p071Zh },
    markdownLoaders: {
      en: () => import("./071-machine-tardiness/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./071-machine-tardiness/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./071-machine-tardiness/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./071-machine-tardiness/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./071-machine-tardiness/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./071-machine-tardiness/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p071WashiStarter,
    washiSolution: p071WashiSolution,
    highspyStarter: p071HighspyStarter,
    highspySolution: p071HighspySolution,
    judge: p071Judge,
  }),
  hydrateProblem({
    rawMeta: p072Meta,
    rawCases: p072Cases,
    locales: { en: p072En, ja: p072Ja, zh: p072Zh },
    markdownLoaders: {
      en: () => import("./072-sequence-dependent-setups/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./072-sequence-dependent-setups/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./072-sequence-dependent-setups/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./072-sequence-dependent-setups/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./072-sequence-dependent-setups/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./072-sequence-dependent-setups/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p072WashiStarter,
    washiSolution: p072WashiSolution,
    highspyStarter: p072HighspyStarter,
    highspySolution: p072HighspySolution,
    judge: p072Judge,
  }),
  hydrateProblem({
    rawMeta: p073Meta,
    rawCases: p073Cases,
    locales: { en: p073En, ja: p073Ja, zh: p073Zh },
    markdownLoaders: {
      en: () => import("./073-job-shop-jssp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./073-job-shop-jssp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./073-job-shop-jssp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./073-job-shop-jssp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./073-job-shop-jssp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./073-job-shop-jssp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p073WashiStarter,
    washiSolution: p073WashiSolution,
    judge: p073Judge,
  }),
  hydrateProblem({
    rawMeta: p074Meta,
    rawCases: p074Cases,
    locales: { en: p074En, ja: p074Ja, zh: p074Zh },
    markdownLoaders: {
      en: () => import("./074-rcpsp-project/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./074-rcpsp-project/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./074-rcpsp-project/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./074-rcpsp-project/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./074-rcpsp-project/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./074-rcpsp-project/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p074WashiStarter,
    washiSolution: p074WashiSolution,
    judge: p074Judge,
  }),
  hydrateProblem({
    rawMeta: p075Meta,
    rawCases: p075Cases,
    locales: { en: p075En, ja: p075Ja, zh: p075Zh },
    markdownLoaders: {
      en: () => import("./075-shift-coverage-days-off/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./075-shift-coverage-days-off/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./075-shift-coverage-days-off/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./075-shift-coverage-days-off/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./075-shift-coverage-days-off/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./075-shift-coverage-days-off/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p075WashiStarter,
    washiSolution: p075WashiSolution,
    highspyStarter: p075HighspyStarter,
    highspySolution: p075HighspySolution,
    judge: p075Judge,
  }),
  hydrateProblem({
    rawMeta: p076Meta,
    rawCases: p076Cases,
    locales: { en: p076En, ja: p076Ja, zh: p076Zh },
    markdownLoaders: {
      en: () => import("./076-consecutive-night-rest/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./076-consecutive-night-rest/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./076-consecutive-night-rest/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./076-consecutive-night-rest/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./076-consecutive-night-rest/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./076-consecutive-night-rest/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p076WashiStarter,
    washiSolution: p076WashiSolution,
    highspyStarter: p076HighspyStarter,
    highspySolution: p076HighspySolution,
    judge: p076Judge,
  }),
  hydrateProblem({
    rawMeta: p077Meta,
    rawCases: p077Cases,
    locales: { en: p077En, ja: p077Ja, zh: p077Zh },
    markdownLoaders: {
      en: () => import("./077-skill-tiers-leads-ng-pairs/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./077-skill-tiers-leads-ng-pairs/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./077-skill-tiers-leads-ng-pairs/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./077-skill-tiers-leads-ng-pairs/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./077-skill-tiers-leads-ng-pairs/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./077-skill-tiers-leads-ng-pairs/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p077WashiStarter,
    washiSolution: p077WashiSolution,
    highspyStarter: p077HighspyStarter,
    highspySolution: p077HighspySolution,
    judge: p077Judge,
  }),
  hydrateProblem({
    rawMeta: p078Meta,
    rawCases: p078Cases,
    locales: { en: p078En, ja: p078Ja, zh: p078Zh },
    markdownLoaders: {
      en: () => import("./078-university-timetabling/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./078-university-timetabling/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./078-university-timetabling/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./078-university-timetabling/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./078-university-timetabling/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./078-university-timetabling/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p078WashiStarter,
    washiSolution: p078WashiSolution,
    highspyStarter: p078HighspyStarter,
    highspySolution: p078HighspySolution,
    judge: p078Judge,
  }),
  hydrateProblem({
    rawMeta: p079Meta,
    rawCases: p079Cases,
    locales: { en: p079En, ja: p079Ja, zh: p079Zh },
    markdownLoaders: {
      en: () => import("./079-esports-venue-scheduling/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./079-esports-venue-scheduling/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./079-esports-venue-scheduling/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./079-esports-venue-scheduling/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./079-esports-venue-scheduling/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./079-esports-venue-scheduling/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p079WashiStarter,
    washiSolution: p079WashiSolution,
    highspyStarter: p079HighspyStarter,
    highspySolution: p079HighspySolution,
    judge: p079Judge,
  }),
  hydrateProblem({
    rawMeta: p080Meta,
    rawCases: p080Cases,
    locales: { en: p080En, ja: p080Ja, zh: p080Zh },
    markdownLoaders: {
      en: () => import("./080-integrated-staff-equipment/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./080-integrated-staff-equipment/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./080-integrated-staff-equipment/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./080-integrated-staff-equipment/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./080-integrated-staff-equipment/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./080-integrated-staff-equipment/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p080WashiStarter,
    washiSolution: p080WashiSolution,
    highspyStarter: p080HighspyStarter,
    highspySolution: p080HighspySolution,
    judge: p080Judge,
  }),
];
