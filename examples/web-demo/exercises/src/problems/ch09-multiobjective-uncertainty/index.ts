import type { ProblemDefinition } from "../types.js";
import { hydrateProblem } from "../hydrate.js";

// #081
import p081Meta from "./081-elastic-soft-penalties/meta.json";
import p081Cases from "./081-elastic-soft-penalties/cases.json";
import p081En from "./081-elastic-soft-penalties/locales/en.json";
import p081Ja from "./081-elastic-soft-penalties/locales/ja.json";
import p081Zh from "./081-elastic-soft-penalties/locales/zh.json";
import p081WashiStarter from "./081-elastic-soft-penalties/washi/starter.ts?raw";
import p081WashiSolution from "./081-elastic-soft-penalties/washi/solution.ts?raw";
import p081PulpStarter from "./081-elastic-soft-penalties/pulp/starter.py?raw";
import p081PulpSolution from "./081-elastic-soft-penalties/pulp/solution.py?raw";
import { judge as p081Judge } from "./081-elastic-soft-penalties/judge.js";

// #082
import p082Meta from "./082-sharehouse-rent-division/meta.json";
import p082Cases from "./082-sharehouse-rent-division/cases.json";
import p082En from "./082-sharehouse-rent-division/locales/en.json";
import p082Ja from "./082-sharehouse-rent-division/locales/ja.json";
import p082Zh from "./082-sharehouse-rent-division/locales/zh.json";
import p082WashiStarter from "./082-sharehouse-rent-division/washi/starter.ts?raw";
import p082WashiSolution from "./082-sharehouse-rent-division/washi/solution.ts?raw";
import p082PulpStarter from "./082-sharehouse-rent-division/pulp/starter.py?raw";
import p082PulpSolution from "./082-sharehouse-rent-division/pulp/solution.py?raw";
import { judge as p082Judge } from "./082-sharehouse-rent-division/judge.js";

// #083
import p083Meta from "./083-epsilon-constraint-pareto/meta.json";
import p083Cases from "./083-epsilon-constraint-pareto/cases.json";
import p083En from "./083-epsilon-constraint-pareto/locales/en.json";
import p083Ja from "./083-epsilon-constraint-pareto/locales/ja.json";
import p083Zh from "./083-epsilon-constraint-pareto/locales/zh.json";
import p083WashiStarter from "./083-epsilon-constraint-pareto/washi/starter.ts?raw";
import p083WashiSolution from "./083-epsilon-constraint-pareto/washi/solution.ts?raw";
import p083PulpStarter from "./083-epsilon-constraint-pareto/pulp/starter.py?raw";
import p083PulpSolution from "./083-epsilon-constraint-pareto/pulp/solution.py?raw";
import { judge as p083Judge } from "./083-epsilon-constraint-pareto/judge.js";

// #084 (WaSHI-only Convex QP)
import p084Meta from "./084-fairness-metrics-qp/meta.json";
import p084Cases from "./084-fairness-metrics-qp/cases.json";
import p084En from "./084-fairness-metrics-qp/locales/en.json";
import p084Ja from "./084-fairness-metrics-qp/locales/ja.json";
import p084Zh from "./084-fairness-metrics-qp/locales/zh.json";
import p084WashiStarter from "./084-fairness-metrics-qp/washi/starter.ts?raw";
import p084WashiSolution from "./084-fairness-metrics-qp/washi/solution.ts?raw";
import { judge as p084Judge } from "./084-fairness-metrics-qp/judge.js";

// #085
import p085Meta from "./085-min-disruption-rescheduling/meta.json";
import p085Cases from "./085-min-disruption-rescheduling/cases.json";
import p085En from "./085-min-disruption-rescheduling/locales/en.json";
import p085Ja from "./085-min-disruption-rescheduling/locales/ja.json";
import p085Zh from "./085-min-disruption-rescheduling/locales/zh.json";
import p085WashiStarter from "./085-min-disruption-rescheduling/washi/starter.ts?raw";
import p085WashiSolution from "./085-min-disruption-rescheduling/washi/solution.ts?raw";
import p085PulpStarter from "./085-min-disruption-rescheduling/pulp/starter.py?raw";
import p085PulpSolution from "./085-min-disruption-rescheduling/pulp/solution.py?raw";
import { judge as p085Judge } from "./085-min-disruption-rescheduling/judge.js";

// #086
import p086Meta from "./086-rolling-horizon-planning/meta.json";
import p086Cases from "./086-rolling-horizon-planning/cases.json";
import p086En from "./086-rolling-horizon-planning/locales/en.json";
import p086Ja from "./086-rolling-horizon-planning/locales/ja.json";
import p086Zh from "./086-rolling-horizon-planning/locales/zh.json";
import p086WashiStarter from "./086-rolling-horizon-planning/washi/starter.ts?raw";
import p086WashiSolution from "./086-rolling-horizon-planning/washi/solution.ts?raw";
import p086PulpStarter from "./086-rolling-horizon-planning/pulp/starter.py?raw";
import p086PulpSolution from "./086-rolling-horizon-planning/pulp/solution.py?raw";
import { judge as p086Judge } from "./086-rolling-horizon-planning/judge.js";

// #087
import p087Meta from "./087-two-stage-stochastic/meta.json";
import p087Cases from "./087-two-stage-stochastic/cases.json";
import p087En from "./087-two-stage-stochastic/locales/en.json";
import p087Ja from "./087-two-stage-stochastic/locales/ja.json";
import p087Zh from "./087-two-stage-stochastic/locales/zh.json";
import p087WashiStarter from "./087-two-stage-stochastic/washi/starter.ts?raw";
import p087WashiSolution from "./087-two-stage-stochastic/washi/solution.ts?raw";
import p087PulpStarter from "./087-two-stage-stochastic/pulp/starter.py?raw";
import p087PulpSolution from "./087-two-stage-stochastic/pulp/solution.py?raw";
import { judge as p087Judge } from "./087-two-stage-stochastic/judge.js";

// #088
import p088Meta from "./088-linearized-cvar/meta.json";
import p088Cases from "./088-linearized-cvar/cases.json";
import p088En from "./088-linearized-cvar/locales/en.json";
import p088Ja from "./088-linearized-cvar/locales/ja.json";
import p088Zh from "./088-linearized-cvar/locales/zh.json";
import p088WashiStarter from "./088-linearized-cvar/washi/starter.ts?raw";
import p088WashiSolution from "./088-linearized-cvar/washi/solution.ts?raw";
import p088PulpStarter from "./088-linearized-cvar/pulp/starter.py?raw";
import p088PulpSolution from "./088-linearized-cvar/pulp/solution.py?raw";
import { judge as p088Judge } from "./088-linearized-cvar/judge.js";

// #089
import p089Meta from "./089-bertsimas-sim-robust/meta.json";
import p089Cases from "./089-bertsimas-sim-robust/cases.json";
import p089En from "./089-bertsimas-sim-robust/locales/en.json";
import p089Ja from "./089-bertsimas-sim-robust/locales/ja.json";
import p089Zh from "./089-bertsimas-sim-robust/locales/zh.json";
import p089WashiStarter from "./089-bertsimas-sim-robust/washi/starter.ts?raw";
import p089WashiSolution from "./089-bertsimas-sim-robust/washi/solution.ts?raw";
import p089PulpStarter from "./089-bertsimas-sim-robust/pulp/starter.py?raw";
import p089PulpSolution from "./089-bertsimas-sim-robust/pulp/solution.py?raw";
import { judge as p089Judge } from "./089-bertsimas-sim-robust/judge.js";

// #090
import p090Meta from "./090-resilient-planning-synthesis/meta.json";
import p090Cases from "./090-resilient-planning-synthesis/cases.json";
import p090En from "./090-resilient-planning-synthesis/locales/en.json";
import p090Ja from "./090-resilient-planning-synthesis/locales/ja.json";
import p090Zh from "./090-resilient-planning-synthesis/locales/zh.json";
import p090WashiStarter from "./090-resilient-planning-synthesis/washi/starter.ts?raw";
import p090WashiSolution from "./090-resilient-planning-synthesis/washi/solution.ts?raw";
import p090PulpStarter from "./090-resilient-planning-synthesis/pulp/starter.py?raw";
import p090PulpSolution from "./090-resilient-planning-synthesis/pulp/solution.py?raw";
import { judge as p090Judge } from "./090-resilient-planning-synthesis/judge.js";

export const CH09_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p081Meta,
    rawCases: p081Cases,
    locales: { en: p081En, ja: p081Ja, zh: p081Zh },
    markdownLoaders: {
      en: () => import("./081-elastic-soft-penalties/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./081-elastic-soft-penalties/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./081-elastic-soft-penalties/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./081-elastic-soft-penalties/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./081-elastic-soft-penalties/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./081-elastic-soft-penalties/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p081WashiStarter,
    washiSolution: p081WashiSolution,
    pulpStarter: p081PulpStarter,
    pulpSolution: p081PulpSolution,
    judge: p081Judge,
  }),
  hydrateProblem({
    rawMeta: p082Meta,
    rawCases: p082Cases,
    locales: { en: p082En, ja: p082Ja, zh: p082Zh },
    markdownLoaders: {
      en: () => import("./082-sharehouse-rent-division/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./082-sharehouse-rent-division/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./082-sharehouse-rent-division/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./082-sharehouse-rent-division/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./082-sharehouse-rent-division/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./082-sharehouse-rent-division/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p082WashiStarter,
    washiSolution: p082WashiSolution,
    pulpStarter: p082PulpStarter,
    pulpSolution: p082PulpSolution,
    judge: p082Judge,
  }),
  hydrateProblem({
    rawMeta: p083Meta,
    rawCases: p083Cases,
    locales: { en: p083En, ja: p083Ja, zh: p083Zh },
    markdownLoaders: {
      en: () => import("./083-epsilon-constraint-pareto/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./083-epsilon-constraint-pareto/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./083-epsilon-constraint-pareto/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./083-epsilon-constraint-pareto/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./083-epsilon-constraint-pareto/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./083-epsilon-constraint-pareto/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p083WashiStarter,
    washiSolution: p083WashiSolution,
    pulpStarter: p083PulpStarter,
    pulpSolution: p083PulpSolution,
    judge: p083Judge,
  }),
  hydrateProblem({
    rawMeta: p084Meta,
    rawCases: p084Cases,
    locales: { en: p084En, ja: p084Ja, zh: p084Zh },
    markdownLoaders: {
      en: () => import("./084-fairness-metrics-qp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./084-fairness-metrics-qp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./084-fairness-metrics-qp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./084-fairness-metrics-qp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./084-fairness-metrics-qp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./084-fairness-metrics-qp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p084WashiStarter,
    washiSolution: p084WashiSolution,
    judge: p084Judge,
  }),
  hydrateProblem({
    rawMeta: p085Meta,
    rawCases: p085Cases,
    locales: { en: p085En, ja: p085Ja, zh: p085Zh },
    markdownLoaders: {
      en: () => import("./085-min-disruption-rescheduling/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./085-min-disruption-rescheduling/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./085-min-disruption-rescheduling/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./085-min-disruption-rescheduling/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./085-min-disruption-rescheduling/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./085-min-disruption-rescheduling/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p085WashiStarter,
    washiSolution: p085WashiSolution,
    pulpStarter: p085PulpStarter,
    pulpSolution: p085PulpSolution,
    judge: p085Judge,
  }),
  hydrateProblem({
    rawMeta: p086Meta,
    rawCases: p086Cases,
    locales: { en: p086En, ja: p086Ja, zh: p086Zh },
    markdownLoaders: {
      en: () => import("./086-rolling-horizon-planning/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./086-rolling-horizon-planning/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./086-rolling-horizon-planning/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./086-rolling-horizon-planning/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./086-rolling-horizon-planning/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./086-rolling-horizon-planning/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p086WashiStarter,
    washiSolution: p086WashiSolution,
    pulpStarter: p086PulpStarter,
    pulpSolution: p086PulpSolution,
    judge: p086Judge,
  }),
  hydrateProblem({
    rawMeta: p087Meta,
    rawCases: p087Cases,
    locales: { en: p087En, ja: p087Ja, zh: p087Zh },
    markdownLoaders: {
      en: () => import("./087-two-stage-stochastic/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./087-two-stage-stochastic/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./087-two-stage-stochastic/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./087-two-stage-stochastic/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./087-two-stage-stochastic/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./087-two-stage-stochastic/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p087WashiStarter,
    washiSolution: p087WashiSolution,
    pulpStarter: p087PulpStarter,
    pulpSolution: p087PulpSolution,
    judge: p087Judge,
  }),
  hydrateProblem({
    rawMeta: p088Meta,
    rawCases: p088Cases,
    locales: { en: p088En, ja: p088Ja, zh: p088Zh },
    markdownLoaders: {
      en: () => import("./088-linearized-cvar/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./088-linearized-cvar/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./088-linearized-cvar/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./088-linearized-cvar/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./088-linearized-cvar/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./088-linearized-cvar/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p088WashiStarter,
    washiSolution: p088WashiSolution,
    pulpStarter: p088PulpStarter,
    pulpSolution: p088PulpSolution,
    judge: p088Judge,
  }),
  hydrateProblem({
    rawMeta: p089Meta,
    rawCases: p089Cases,
    locales: { en: p089En, ja: p089Ja, zh: p089Zh },
    markdownLoaders: {
      en: () => import("./089-bertsimas-sim-robust/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./089-bertsimas-sim-robust/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./089-bertsimas-sim-robust/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./089-bertsimas-sim-robust/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./089-bertsimas-sim-robust/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./089-bertsimas-sim-robust/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p089WashiStarter,
    washiSolution: p089WashiSolution,
    pulpStarter: p089PulpStarter,
    pulpSolution: p089PulpSolution,
    judge: p089Judge,
  }),
  hydrateProblem({
    rawMeta: p090Meta,
    rawCases: p090Cases,
    locales: { en: p090En, ja: p090Ja, zh: p090Zh },
    markdownLoaders: {
      en: () => import("./090-resilient-planning-synthesis/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./090-resilient-planning-synthesis/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./090-resilient-planning-synthesis/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./090-resilient-planning-synthesis/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./090-resilient-planning-synthesis/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./090-resilient-planning-synthesis/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p090WashiStarter,
    washiSolution: p090WashiSolution,
    pulpStarter: p090PulpStarter,
    pulpSolution: p090PulpSolution,
    judge: p090Judge,
  }),
];
