# WaSHI examples

[English README](../README.md) · [日本語 README](../README.ja.md) · [中文 README](../README.zh-CN.md)

These examples show how to construct models with WaSHI and inspect results from
HiGHS, Z3, or GLPK. The solver performs the optimization or satisfiability check.

## Browser demo

[Open the interactive demo](https://ohtaman.github.io/washi/demo/) to select a
preset, edit the model, choose a compatible solver, and inspect its results.
The [demo source](web-demo/) is included in this repository.

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

| Example source | Model construction and results | Solver |
| --- | --- | --- |
| [Production planning](node/01-production-planning.ts) | Integer production quantities, a profit objective, resource limits, and the resulting plan | HiGHS |
| [Knapsack](node/02-knapsack-problem.ts) | Binary selection variables, a capacity constraint, and selected items | HiGHS |
| [Portfolio allocation](node/03-portfolio-qp.ts) | Continuous weights, a quadratic variance objective, and budget / return constraints | HiGHS |
| [Security rules](node/04-smt-security-rules.ts) | Boolean and arithmetic constraints, implications, and a satisfying assignment | Z3 |
| [Conflict diagnosis](node/05-unsat-core-diagnosis.ts) | Inconsistent staffing / budget rules and a conflicting constraint subset | Z3 |
| [PuLP-style helpers](node/06-pulp-compatibility.ts) | `LpProblem`, `LpVariable`, `lpSum`, and result access | HiGHS |
| [SMT / MIP workflow](node/07-hybrid-smt-mip.ts) | Separate policy and allocation models, Boolean rules, and indicator constraints | Z3 + HiGHS |
| [GLPK adapter](node/08-glpk-solver-plugin.ts) | A diet model, plugin selection, an objective value, and row duals | GLPK |

For example:

```sh
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
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

## Directions for future examples

These are proposed additions to the gallery, rather than currently available examples:

- **Shift scheduling**: Staff availability, required skills, coverage, and preferences;
  show both a feasible schedule and an explanation of conflicting requirements.
- **Transportation and allocation**: Supply, demand, capacity, and cost inputs;
  show how changing an input changes the resulting flows.
- **A Vite application**: Editable inputs, model construction, Worker execution, and
  result display; include the build and deployment settings for the selected solver.

Each new example should link to runnable source, explain the variables / objective /
constraints, and include inputs with expected results. State the solver requirements
and distinguish model construction time from solve time when reporting performance.
