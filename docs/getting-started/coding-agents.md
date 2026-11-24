# Coding with AI Agents

This guide shows how to configure AI coding agents (Claude Code, Cursor, Codex, Antigravity, Gemini CLI, Windsurf) to formulate, solve, verify, and package optimization and constraint models with `@ohtaman/washi`.

---

## 1. Setup

Setting up WaSHI with a coding agent has two separate parts: installing the runtime library in your project, and giving your agent WaSHI's current API and verification workflow.

### Install the Runtime Library

Bundled **HiGHS** (LP / MIP / Convex QP) and **Pumpkin** (`@ohtaman/washi/solvers/pumpkin`, CP / LCG) require zero external dependencies:

```bash
npm install @ohtaman/washi

# Optional peer dependencies if your model requires SMT continuous logic or GLPK:
# npm install z3-solver
# npm install glpk.js
```

### Connect Your Coding Agent

Choose the setup method that matches your tool:

- **Agent Skill (Recommended — Claude Code, Cursor, Codex, Antigravity, Gemini CLI)**:
  ```bash
  npx skills add ohtaman/washi
  ```
  This installs `skills/washi/SKILL.md` (also included in `node_modules/@ohtaman/washi/skills/washi/SKILL.md`). It teaches the agent solver selection, `expr` modeling, and debugging with `m.toLpString()`, `m.verify()`, and `m.check()`.
- **IDE Documentation Indexing (`@Docs` in Cursor, Windsurf, etc.)**:
  - Documentation index: `https://washi.ohtaman.dev/llms.txt`
  - Complete single-file API & example reference: `https://washi.ohtaman.dev/llms-full.txt`
- **Context7 MCP**:
  - Reference library ID: `/ohtaman/washi`

---

## 2. Your First End-to-End Run

Copy and paste the starter prompt below into your coding agent inside a Node.js / TypeScript project where `@ohtaman/washi` is installed:

```text
Using @ohtaman/washi, write and run a TypeScript script that schedules 8 internal tech-talk sessions across 2 rooms (Room A, Room B) and 4 time slots.
Input data: create a sample array of talks with speaker, topic ("infra", "frontend", "data", "security"), and unavailable slots.
Requirements:
1. Assign every talk to exactly one room and one time slot, with at most one talk per room-slot.
2. Respect speaker unavailability and prevent any speaker from giving two talks in the same time slot.
3. Minimize the number of parallel talks sharing the same topic in the same time slot.
4. Give every constraint an explicit descriptive name, solve with bundled HiGHS, check m.hasPrimalSolution, and assert m.verify().valid === true before printing the timetable.
```

When you run this prompt, the agent executes three steps locally:

1. **Formulates the model**: Creates bounded binary variables (`m.binary`), linear expressions (`` expr`...` ``, `sum`), named constraints (`m.constraint(..., "name")`), and an objective (`m.objective(minimize(...))`).
2. **Solves in Node.js via WebAssembly**: Executes the script (for example with `npx tsx schedule.ts`) using the bundled HiGHS WebAssembly binary—no Python runtime or native solver installation is needed.
3. **Independently verifies the solution**: Checks `m.hasPrimalSolution` and calls `m.verify()` so variable bounds, integrality, and constraint residuals are verified before displaying the output.

---

## 3. Problem Classes & Ready-to-Use Prompts

Each prompt below targets a specific mathematical problem class supported by WaSHI. Adjust the input schema and rules to match your data.

### Event Timetable & Reviewer Assignment (MILP — Bundled HiGHS)

```text
Using @ohtaman/washi (bundled HiGHS), assign 24 pull-request / RFC submissions to 6 engineers so each submission gets 2 distinct reviewers.
Rules:
- Authors cannot review their own submissions, and reviewers must match at least one required domain tag on the submission.
- Respect each engineer's maximum review cap, and minimize the maximum workload assigned to any single engineer (min-max load balancing).
- Name every constraint, run the script, and verify m.hasPrimalSolution and m.verify().valid === true.
```

### Budget & Project Portfolio Selection (0-1 MIP — Bundled HiGHS)

```text
Using @ohtaman/washi (bundled HiGHS), select a subset of candidate engineering projects from a JSON list to maximize total expected annual savings.
Each project has cost, backend_engineers, frontend_engineers, and savings.
Rules:
- Stay within a total quarterly budget of 120 and headcount caps of 14 backend and 10 frontend engineers.
- Dependency: if "billing_v2" is selected, "auth_token_service" must also be selected.
- Mutual exclusion: select at most one of "legacy_search_tuning" and "vector_search_migration".
- Give every constraint a clear name and confirm m.verify().valid === true.
```

### Task Scheduling with Precedence & Shared Resources (CP/LCG — Bundled Pumpkin)

```text
Using @ohtaman/washi and its bundled CP solver (@ohtaman/washi/solvers/pumpkin), schedule 10 release-pipeline tasks with integer start times (lb: 0, ub: 120) and fixed durations to minimize total makespan.
Rules:
- Enforce finish-to-start precedence edges between dependent tasks.
- Tasks using the staging benchmark cluster cannot overlap (use disjoint).
- All running tasks share at most 4 concurrent CI runners at any time (use cumulative).
- Solve with { solver: "pumpkin" }, verify m.hasPrimalSolution and m.verify().valid === true, and print start/end times for each task.
```

### Target-Balancing & Variance Minimization (Convex QP — Bundled HiGHS)

Built-in HiGHS solves convex quadratic objectives over continuous variables (`m.continuous`):

```text
Using @ohtaman/washi (bundled HiGHS), allocate a continuous total budget of 1.0 across 5 regional compute pools using m.continuous variables (lb: 0.05, ub: 0.50).
Target weights are [0.30, 0.25, 0.20, 0.15, 0.10], plus a policy cap that regions 0 and 1 combined cannot exceed 0.48.
Minimize the sum of squared deviations expr`sum((${w} - ${target})^2)` subject to sum(w) == 1.0 and the regional cap, then verify m.verify().valid === true.
```

### Rule & Configuration Conflict Diagnosis (Infeasibility / Unsat Core)

```text
Using @ohtaman/washi and @ohtaman/washi/solvers/pumpkin, check whether a set of deployment and feature-flag rules over bounded integer and boolean variables is satisfiable via await m.check({ solver: "pumpkin" }).
Include a sample test case with contradictory named rules, print res.status and res.unsatCore (or res.conflicts), and show which named rules conflict with each other.
```

> [!NOTE]
> `await m.check()` works out of the box with default **HiGHS** (reporting conflicting constraint names in `res.conflicts` via elastic slack relaxation). Import bundled `@ohtaman/washi/solvers/pumpkin` when you want `res.unsatCore` on bounded integer/boolean models without `COOP`/`COEP` headers, or install `z3-solver` (`@ohtaman/washi/solvers/z3`) when continuous/fractional constraints require exact SMT `unsatCore` extraction.

---

## 4. Packaging & Deployment Prompts (Browser, Desktop & Mobile)

Once a CLI script produces verified results, you can ask your coding agent to package the same model into a local browser tool or an offline desktop/mobile application.

### Zero-Server Single-File `.html` Tool (`file://` Double-Click)

```text
Package this @ohtaman/washi optimization model into a single standalone .html file with inline HTML, CSS, and JavaScript so team members can open it directly via file:// by double-clicking.
- Load WaSHI from https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js (global window.Washi).
- Provide a textarea / CSV file input, a "Solve" button, a table displaying the optimal assignment, and a conflict report using await m.check() if status is "Infeasible".
- Verify every feasible solve with m.verify().
```

- **Runtime notes for `file://`**:
  - Opening the `.html` file directly via `file://` (no local HTTP server) works out of the box when loading `washi.min.js` (and `solvers/pumpkin.min.js` when using Pumpkin) from an HTTPS CDN, because WaSHI detects opaque origins (`window.origin === "null"`) and automatically runs HiGHS and Pumpkin on the main thread.
  - Self-hosted local `.wasm` files (which browsers block on `file://` under `fetch()` CORS rules) and **Z3** (`SharedArrayBuffer` requiring `COOP`/`COEP` headers) require serving over `http://` or `https://`.

### Offline Desktop & Mobile Apps (Vite + Tauri / Capacitor / PWA)

```text
Wrap this Vite + TypeScript @ohtaman/washi application as an offline desktop/mobile app using bundled HiGHS (or @ohtaman/washi/solvers/pumpkin) with zero backend server and zero native C++ solver compilation.
- Keep all solver execution client-side via @ohtaman/washi.
- Configure Content Security Policy to allow WebAssembly compilation ('wasm-unsafe-eval' in script-src) and Web Workers (worker-src 'self' blob:).
```

- **Runtime notes for WebViews**: Standard Vite builds bundle `highs.wasm` and `pumpkin.wasm` as static assets that run offline inside Tauri (`tauri://localhost` / `http://tauri.localhost`), Capacitor WebViews, and Service Worker PWAs. See [Runtime Environments](./runtimes.md) for `tauri.conf.json` CSP configuration (`'wasm-unsafe-eval'`).

---

## 5. Iterating & Debugging with Your Agent

- **Require named constraints and `m.verify()`**: Always ask your agent to pass a descriptive name as the second argument to `m.constraint(c, "rule_name")` (and `name` in `m.indicator(...)`) and assert `m.verify().valid === true`. Unnamed constraints (`c_0`, `c_1`) make infeasibility reports hard to interpret.
- **Diagnose `"Infeasible"` results with `m.check()`**: When adding new business rules causes `m.solve()` to return `"Infeasible"`, use a follow-up prompt like:
  ```text
  Adding the new constraints made m.solve() return "Infeasible".
  Run await m.check() (or await m.check({ solver: "pumpkin" }) for bounded integer/boolean models), print res.conflicts / res.unsatCore, explain in plain terms which named rules and variable bounds contradict each other, and propose which non-rigid constraints should be converted into soft constraints with non-negative slack penalty variables.
  ```
- **Inspect `m.toLpString()` and variable bounds before production**: Ask your agent to dump `m.toLpString()` on a small fixture and review variable `lb` / `ub` bounds (especially on variables referenced inside `m.indicator()`, which require finite bounds when `M` is omitted), objective sense (`Maximize` vs `Minimize`), and constraint signs (`<=` vs `>=`).
