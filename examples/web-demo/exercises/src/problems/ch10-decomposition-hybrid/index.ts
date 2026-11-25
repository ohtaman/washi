import type { ProblemDefinition } from "../../types.js";
import { hydrateProblem } from "../hydrate.js";

// #091
import p091Meta from "./091-tight-big-m-scaling/meta.json";
import p091Cases from "./091-tight-big-m-scaling/cases.json";
import p091En from "./091-tight-big-m-scaling/locales/en.json";
import p091Ja from "./091-tight-big-m-scaling/locales/ja.json";
import p091Zh from "./091-tight-big-m-scaling/locales/zh.json";
import p091WashiStarter from "./091-tight-big-m-scaling/washi/starter.ts?raw";
import p091WashiSolution from "./091-tight-big-m-scaling/washi/solution.ts?raw";
import p091PulpStarter from "./091-tight-big-m-scaling/pulp/starter.py?raw";
import p091PulpSolution from "./091-tight-big-m-scaling/pulp/solution.py?raw";
import { judge as p091Judge } from "./091-tight-big-m-scaling/judge.js";

// #092
import p092Meta from "./092-symmetry-cover-cuts/meta.json";
import p092Cases from "./092-symmetry-cover-cuts/cases.json";
import p092En from "./092-symmetry-cover-cuts/locales/en.json";
import p092Ja from "./092-symmetry-cover-cuts/locales/ja.json";
import p092Zh from "./092-symmetry-cover-cuts/locales/zh.json";
import p092WashiStarter from "./092-symmetry-cover-cuts/washi/starter.ts?raw";
import p092WashiSolution from "./092-symmetry-cover-cuts/washi/solution.ts?raw";
import p092PulpStarter from "./092-symmetry-cover-cuts/pulp/starter.py?raw";
import p092PulpSolution from "./092-symmetry-cover-cuts/pulp/solution.py?raw";
import { judge as p092Judge } from "./092-symmetry-cover-cuts/judge.js";

// #093
import p093Meta from "./093-iterative-subtour-cuts/meta.json";
import p093Cases from "./093-iterative-subtour-cuts/cases.json";
import p093En from "./093-iterative-subtour-cuts/locales/en.json";
import p093Ja from "./093-iterative-subtour-cuts/locales/ja.json";
import p093Zh from "./093-iterative-subtour-cuts/locales/zh.json";
import p093WashiStarter from "./093-iterative-subtour-cuts/washi/starter.ts?raw";
import p093WashiSolution from "./093-iterative-subtour-cuts/washi/solution.ts?raw";
import p093PulpStarter from "./093-iterative-subtour-cuts/pulp/starter.py?raw";
import p093PulpSolution from "./093-iterative-subtour-cuts/pulp/solution.py?raw";
import { judge as p093Judge } from "./093-iterative-subtour-cuts/judge.js";

// #094
import p094Meta from "./094-colgen-cutting-stock/meta.json";
import p094Cases from "./094-colgen-cutting-stock/cases.json";
import p094En from "./094-colgen-cutting-stock/locales/en.json";
import p094Ja from "./094-colgen-cutting-stock/locales/ja.json";
import p094Zh from "./094-colgen-cutting-stock/locales/zh.json";
import p094WashiStarter from "./094-colgen-cutting-stock/washi/starter.ts?raw";
import p094WashiSolution from "./094-colgen-cutting-stock/washi/solution.ts?raw";
import { judge as p094Judge } from "./094-colgen-cutting-stock/judge.js";

// #095
import p095Meta from "./095-colgen-shift-routing/meta.json";
import p095Cases from "./095-colgen-shift-routing/cases.json";
import p095En from "./095-colgen-shift-routing/locales/en.json";
import p095Ja from "./095-colgen-shift-routing/locales/ja.json";
import p095Zh from "./095-colgen-shift-routing/locales/zh.json";
import p095WashiStarter from "./095-colgen-shift-routing/washi/starter.ts?raw";
import p095WashiSolution from "./095-colgen-shift-routing/washi/solution.ts?raw";
import { judge as p095Judge } from "./095-colgen-shift-routing/judge.js";

// #096
import p096Meta from "./096-dantzig-wolfe-decomp/meta.json";
import p096Cases from "./096-dantzig-wolfe-decomp/cases.json";
import p096En from "./096-dantzig-wolfe-decomp/locales/en.json";
import p096Ja from "./096-dantzig-wolfe-decomp/locales/ja.json";
import p096Zh from "./096-dantzig-wolfe-decomp/locales/zh.json";
import p096WashiStarter from "./096-dantzig-wolfe-decomp/washi/starter.ts?raw";
import p096WashiSolution from "./096-dantzig-wolfe-decomp/washi/solution.ts?raw";
import { judge as p096Judge } from "./096-dantzig-wolfe-decomp/judge.js";

// #097
import p097Meta from "./097-classical-benders/meta.json";
import p097Cases from "./097-classical-benders/cases.json";
import p097En from "./097-classical-benders/locales/en.json";
import p097Ja from "./097-classical-benders/locales/ja.json";
import p097Zh from "./097-classical-benders/locales/zh.json";
import p097WashiStarter from "./097-classical-benders/washi/starter.ts?raw";
import p097WashiSolution from "./097-classical-benders/washi/solution.ts?raw";
import { judge as p097Judge } from "./097-classical-benders/judge.js";

// #098
import p098Meta from "./098-logic-based-benders/meta.json";
import p098Cases from "./098-logic-based-benders/cases.json";
import p098En from "./098-logic-based-benders/locales/en.json";
import p098Ja from "./098-logic-based-benders/locales/ja.json";
import p098Zh from "./098-logic-based-benders/locales/zh.json";
import p098WashiStarter from "./098-logic-based-benders/washi/starter.ts?raw";
import p098WashiSolution from "./098-logic-based-benders/washi/solution.ts?raw";
import { judge as p098Judge } from "./098-logic-based-benders/judge.js";

// #099
import p099Meta from "./099-lns-fix-and-optimize/meta.json";
import p099Cases from "./099-lns-fix-and-optimize/cases.json";
import p099En from "./099-lns-fix-and-optimize/locales/en.json";
import p099Ja from "./099-lns-fix-and-optimize/locales/ja.json";
import p099Zh from "./099-lns-fix-and-optimize/locales/zh.json";
import p099WashiStarter from "./099-lns-fix-and-optimize/washi/starter.ts?raw";
import p099WashiSolution from "./099-lns-fix-and-optimize/washi/solution.ts?raw";
import p099PulpStarter from "./099-lns-fix-and-optimize/pulp/starter.py?raw";
import p099PulpSolution from "./099-lns-fix-and-optimize/pulp/solution.py?raw";
import { judge as p099Judge } from "./099-lns-fix-and-optimize/judge.js";

// #100
import p100Meta from "./100-integrated-sop-capstone/meta.json";
import p100Cases from "./100-integrated-sop-capstone/cases.json";
import p100En from "./100-integrated-sop-capstone/locales/en.json";
import p100Ja from "./100-integrated-sop-capstone/locales/ja.json";
import p100Zh from "./100-integrated-sop-capstone/locales/zh.json";
import p100WashiStarter from "./100-integrated-sop-capstone/washi/starter.ts?raw";
import p100WashiSolution from "./100-integrated-sop-capstone/washi/solution.ts?raw";
import { judge as p100Judge } from "./100-integrated-sop-capstone/judge.js";

export const CH10_PROBLEMS: ProblemDefinition[] = [
  hydrateProblem({
    rawMeta: p091Meta,
    rawCases: p091Cases,
    locales: { en: p091En, ja: p091Ja, zh: p091Zh },
    markdownLoaders: {
      en: () => import("./091-tight-big-m-scaling/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./091-tight-big-m-scaling/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./091-tight-big-m-scaling/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./091-tight-big-m-scaling/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./091-tight-big-m-scaling/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./091-tight-big-m-scaling/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p091WashiStarter,
    washiSolution: p091WashiSolution,
    pulpStarter: p091PulpStarter,
    pulpSolution: p091PulpSolution,
    judge: p091Judge,
  }),
  hydrateProblem({
    rawMeta: p092Meta,
    rawCases: p092Cases,
    locales: { en: p092En, ja: p092Ja, zh: p092Zh },
    markdownLoaders: {
      en: () => import("./092-symmetry-cover-cuts/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./092-symmetry-cover-cuts/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./092-symmetry-cover-cuts/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./092-symmetry-cover-cuts/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./092-symmetry-cover-cuts/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./092-symmetry-cover-cuts/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p092WashiStarter,
    washiSolution: p092WashiSolution,
    pulpStarter: p092PulpStarter,
    pulpSolution: p092PulpSolution,
    judge: p092Judge,
  }),
  hydrateProblem({
    rawMeta: p093Meta,
    rawCases: p093Cases,
    locales: { en: p093En, ja: p093Ja, zh: p093Zh },
    markdownLoaders: {
      en: () => import("./093-iterative-subtour-cuts/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./093-iterative-subtour-cuts/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./093-iterative-subtour-cuts/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./093-iterative-subtour-cuts/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./093-iterative-subtour-cuts/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./093-iterative-subtour-cuts/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p093WashiStarter,
    washiSolution: p093WashiSolution,
    pulpStarter: p093PulpStarter,
    pulpSolution: p093PulpSolution,
    judge: p093Judge,
  }),
  hydrateProblem({
    rawMeta: p094Meta,
    rawCases: p094Cases,
    locales: { en: p094En, ja: p094Ja, zh: p094Zh },
    markdownLoaders: {
      en: () => import("./094-colgen-cutting-stock/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./094-colgen-cutting-stock/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./094-colgen-cutting-stock/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./094-colgen-cutting-stock/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./094-colgen-cutting-stock/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./094-colgen-cutting-stock/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p094WashiStarter,
    washiSolution: p094WashiSolution,
    judge: p094Judge,
  }),
  hydrateProblem({
    rawMeta: p095Meta,
    rawCases: p095Cases,
    locales: { en: p095En, ja: p095Ja, zh: p095Zh },
    markdownLoaders: {
      en: () => import("./095-colgen-shift-routing/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./095-colgen-shift-routing/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./095-colgen-shift-routing/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./095-colgen-shift-routing/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./095-colgen-shift-routing/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./095-colgen-shift-routing/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p095WashiStarter,
    washiSolution: p095WashiSolution,
    judge: p095Judge,
  }),
  hydrateProblem({
    rawMeta: p096Meta,
    rawCases: p096Cases,
    locales: { en: p096En, ja: p096Ja, zh: p096Zh },
    markdownLoaders: {
      en: () => import("./096-dantzig-wolfe-decomp/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./096-dantzig-wolfe-decomp/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./096-dantzig-wolfe-decomp/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./096-dantzig-wolfe-decomp/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./096-dantzig-wolfe-decomp/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./096-dantzig-wolfe-decomp/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p096WashiStarter,
    washiSolution: p096WashiSolution,
    judge: p096Judge,
  }),
  hydrateProblem({
    rawMeta: p097Meta,
    rawCases: p097Cases,
    locales: { en: p097En, ja: p097Ja, zh: p097Zh },
    markdownLoaders: {
      en: () => import("./097-classical-benders/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./097-classical-benders/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./097-classical-benders/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./097-classical-benders/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./097-classical-benders/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./097-classical-benders/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p097WashiStarter,
    washiSolution: p097WashiSolution,
    judge: p097Judge,
  }),
  hydrateProblem({
    rawMeta: p098Meta,
    rawCases: p098Cases,
    locales: { en: p098En, ja: p098Ja, zh: p098Zh },
    markdownLoaders: {
      en: () => import("./098-logic-based-benders/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./098-logic-based-benders/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./098-logic-based-benders/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./098-logic-based-benders/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./098-logic-based-benders/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./098-logic-based-benders/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p098WashiStarter,
    washiSolution: p098WashiSolution,
    judge: p098Judge,
  }),
  hydrateProblem({
    rawMeta: p099Meta,
    rawCases: p099Cases,
    locales: { en: p099En, ja: p099Ja, zh: p099Zh },
    markdownLoaders: {
      en: () => import("./099-lns-fix-and-optimize/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./099-lns-fix-and-optimize/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./099-lns-fix-and-optimize/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./099-lns-fix-and-optimize/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./099-lns-fix-and-optimize/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./099-lns-fix-and-optimize/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p099WashiStarter,
    washiSolution: p099WashiSolution,
    pulpStarter: p099PulpStarter,
    pulpSolution: p099PulpSolution,
    judge: p099Judge,
  }),
  hydrateProblem({
    rawMeta: p100Meta,
    rawCases: p100Cases,
    locales: { en: p100En, ja: p100Ja, zh: p100Zh },
    markdownLoaders: {
      en: () => import("./100-integrated-sop-capstone/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./100-integrated-sop-capstone/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./100-integrated-sop-capstone/locales/zh.md?raw").then((m) => m.default),
    },
    editorialLoaders: {
      en: () => import("./100-integrated-sop-capstone/editorial/locales/en.md?raw").then((m) => m.default),
      ja: () => import("./100-integrated-sop-capstone/editorial/locales/ja.md?raw").then((m) => m.default),
      zh: () => import("./100-integrated-sop-capstone/editorial/locales/zh.md?raw").then((m) => m.default),
    },
    washiStarter: p100WashiStarter,
    washiSolution: p100WashiSolution,
    judge: p100Judge,
  }),
];
