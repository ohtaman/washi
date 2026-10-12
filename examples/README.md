# WaSHI examples

[English README](../README.md) · [日本語 README](../README.ja.md) · [中文 README](../README.zh-CN.md) · [Online Example Docs](https://ohtaman.github.io/washi/examples/)

These examples show how to construct models with WaSHI and inspect results from
HiGHS, Z3, or GLPK. The solver performs the optimization or satisfiability check.

## Browser demo

[Open the interactive demo](https://ohtaman.github.io/washi/demo/) to select a
preset, edit the model, choose a compatible solver, and inspect its results
(including 2D flow matrices, weekly shift rosters, coupon breakdowns, and
constraint shadow prices). The [demo source](web-demo/) is included in this repository.

For a local development server:

```sh
git clone https://github.com/ohtaman/washi.git
cd washi
npm ci
npm run dev
# Open http://localhost:5173/demo/
```

Z3 in a browser requires a secure context, SharedArrayBuffer, and
cross-origin isolation. See the [browser requirements](../README.md#-browser--web-worker-usage).
The GitHub Pages demo uses a service worker scoped to the project's path to
establish isolation; it may reload once on the first visit.

## Node.js source examples

Run these from a repository checkout after `npm ci`. They import the repository's
`src/` modules, rather than the published npm entry point. In your application,
use `@ohtaman/washi` and import the required solver plugin.

### 1. Fundamentals (Core Modeling APIs)

| Example source | Model construction and results | Featured APIs | Solver |
| --- | --- | --- | --- |
| [Production planning](node/01-production-planning.ts) | Integer production quantities, a profit objective, resource limits, and the resulting plan | `addVar()`, `expr`, `c` | HiGHS |
| [Knapsack](node/02-knapsack-problem.ts) | Binary selection variables, a capacity constraint, and selected items | `addVars(keys)`, `sum()` | HiGHS |
| [Transportation network](node/09-transportation-problem.ts) | 2D origin-destination flows (`ship[factory][store]`), supply/demand balance, and flow changes when capacity shifts | `addVars(rows, cols)`, `sum()` | HiGHS |
| [Diet & sensitivity analysis](node/10-diet-sensitivity.ts) | Nutritional LP with shadow prices (bottlenecks), constraint surpluses, and variable reduced costs | `constr.dual`, `constr.slack`, `var.reducedCost` | HiGHS |

### 2. Practical Applications & Hybrid Workflows

| Example source | Model construction and results | Featured APIs | Solver |
| --- | --- | --- | --- |
| [Staff shift scheduling](node/11-shift-scheduling.ts) | Weekly roster optimization (coverage, senior duty, max shifts, day-off requests) + diagnosing clashing Saturday vacation requests | `addVars(staff, days)`, `check()`, `unsatCore` | HiGHS + Z3 |
| [E-commerce coupon optimizer](node/12-ecommerce-coupon-optimizer.ts) | Conditional spend thresholds, exclusive vs. stackable coupon rules, and filler add-on recommendations | `addIndicator()`, `type: "Binary"` | HiGHS |
| [Portfolio allocation](node/03-portfolio-qp.ts) | Continuous weights, a quadratic variance objective, and budget / return constraints | `new QuadExpr()`, `v1.mul(v2)` | HiGHS |
| [SMT / MIP workflow](node/07-hybrid-smt-mip.ts) | Separate policy verification and capacity allocation models | `addBoolVar()`, `addIndicator()` | Z3 + HiGHS |

### 3. SMT Logic & Solver Adapters

| Example source | Model construction and results | Featured APIs | Solver |
| --- | --- | --- | --- |
| [Security rules](node/04-smt-security-rules.ts) | Boolean and arithmetic constraints, implications, and a satisfying assignment | `addBoolVar()`, `.implies()`, `check()` | Z3 |
| [Conflict diagnosis](node/05-unsat-core-diagnosis.ts) | Inconsistent staffing / budget rules and a conflicting constraint subset | `check()`, `unsatCore` | Z3 |
| [GLPK adapter](node/08-glpk-solver-plugin.ts) | A diet model, plugin selection, an objective value, and row duals | `solver: "glpk"` | GLPK |

For example:

```sh
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
```

Repository development dependencies include the optional engines. Applications
using the npm package install `z3-solver` or `glpk.js` when they use those plugins.
GLPK / glpk.js uses GPL-3.0; see the [third-party notices](../THIRD_PARTY_LICENSES.md).

## Browser distribution examples

The [distribution guide](distribution/README.md) explains how to build and serve
the complete browser distribution and how to use CDN scripts in CodePen.

| Source | Distribution | Solver |
| --- | --- | --- |
| [esm.html](distribution/esm.html) | Browser ESM | HiGHS |
| [script.html](distribution/script.html) | Classic script tag | HiGHS |
| [glpk-esm.html](distribution/glpk-esm.html) | Browser ESM plugin | GLPK |
| [glpk-script.html](distribution/glpk-script.html) | Classic script plugin | GLPK |
| [z3-esm.html](distribution/z3-esm.html) | Browser ESM plugin; requires cross-origin isolation | Z3 |
