# Coding with AI Agents

This guide explains how to configure AI coding agents to build, verify, and package `@ohtaman/washi` optimization and constraint models. It covers tools such as Claude Code, Cursor, Codex, Antigravity, Gemini CLI, and Windsurf.

---

## 1. Setup

Setting up WaSHI with a coding agent has two parts. First, install the runtime library in your project. Second, connect your agent to WaSHI's API reference and verification workflow.

### Install the Runtime Library

Installing `@ohtaman/washi` bundles **HiGHS** for linear, mixed-integer, and convex quadratic programming (`LP`/`MIP`/`QP`), along with **Pumpkin** for Constraint Programming (`CP`), with zero external dependencies:

```bash
npm install @ohtaman/washi

# Optional dependencies for Z3 (SMT / continuous logic) or GLPK:
# npm install z3-solver
# npm install glpk.js
```

### Connect Your Coding Agent

Choose the integration method that matches your tool:

| Method | Best For | Setup |
| --- | --- | --- |
| **Agent Skill** *(Recommended)* | Claude Code, Cursor, Codex, Antigravity, Gemini CLI | Run `npx skills add ohtaman/washi` |
| **IDE `@Docs` Index** | Cursor, Windsurf | Add `https://washi.ohtaman.dev/llms.txt` or `https://washi.ohtaman.dev/llms-full.txt` |
| **Context7 MCP** | MCP-enabled agents | Reference library ID `/ohtaman/washi` |

Installing the Agent Skill places `SKILL.md` into your agent's skills directory. It teaches your agent solver selection, `expr` modeling, and debugging with `m.toLpString()`, `m.verify()`, and `m.check()`.

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

1. **Formulates the model**: Declares 0-1 binary variables with `m.binary()`, linear expressions with `` expr`...` `` and `sum()`, named constraints, and a minimization objective.
2. **Solves in Node.js via WebAssembly**: Runs the script (for example via `npx tsx schedule.ts`) using the bundled HiGHS WebAssembly binary. No Python runtime or native solver installation is needed.
3. **Independently verifies the solution**: Checks `m.hasPrimalSolution` and calls `m.verify()`. This confirms variable bounds, integrality, and constraint satisfaction before printing results.

---

## 3. Problem Classes & Ready-to-Use Prompts

Match your task to the problem class and solver below, then customize the corresponding prompt template:

| Problem Class | Recommended Solver | Key Primitives |
| --- | --- | --- |
| Assignment, timetabling, 0-1 selection (`MILP` / `0-1 MIP`) | Bundled **HiGHS** | `m.binary()`, `sum()`, `dot()` |
| Task scheduling with shared resources (`CP`) | Bundled **Pumpkin** | `disjoint()`, `cumulative()`, `distinct()` |
| Target balancing & variance minimization (Convex `QP`) | Bundled **HiGHS** | `m.continuous()`, `` expr`...^2` `` |
| Rule conflict diagnosis (`unsatCore`) | Bundled **Pumpkin** or optional **Z3** | `m.check()` |

### Reviewer Assignment & Load Balancing (MILP — Bundled HiGHS)

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

### Task Scheduling with Precedence & Shared Resources (CP — Bundled Pumpkin)

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
> `await m.check()` works with default **HiGHS**, which reports conflicting constraint names in `res.conflicts`.
>
> To extract an exact unsatisfiable core (`res.unsatCore`), choose the solver by variable domain:
> - **Bounded integers and booleans**: Import bundled `@ohtaman/washi/solvers/pumpkin` (no browser `COOP`/`COEP` headers required).
> - **Continuous or fractional arithmetic**: Install `z3-solver` and import `@ohtaman/washi/solvers/z3`.

---

## 4. Packaging & Deployment Prompts (Browser, Desktop & Mobile)

Once a CLI script produces verified results, ask your agent to package the same model as a local HTML tool or an offline app.

### Zero-Server Single-File `.html` Tool (Double-Click via `file://`)

```text
Package this @ohtaman/washi optimization model into a standalone .html file with inline HTML, CSS, and JavaScript so team members can open it directly by double-clicking (file://).
- Load WaSHI from https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js (global window.Washi).
- Provide a textarea / CSV file input, a "Solve" button, a table displaying the optimal assignment, and a conflict report using await m.check() if status is "Infeasible".
- Verify every feasible solve with m.verify().
```

**How `file://` execution works**:

| Scenario | Behavior & Requirement |
| --- | --- |
| **CDN scripts** | Loading `washi.min.js` from an HTTPS CDN works directly on `file://` without a local server. On opaque origins (`window.origin === "null"`), WaSHI runs HiGHS and Pumpkin on the main thread automatically. |
| **Self-hosted `.wasm`** | Browsers block `fetch()` against local `.wasm` files on `file://`. Serve self-hosted WebAssembly assets over `http://` or `https://`. |
| **Z3 in browsers** | Requires a Secure Context (`https://` or `http://localhost`, not plain `http://` LAN URLs) plus `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` (`COOP`/`COEP`); see [Cross-Origin Isolation](./cross-origin.md). |

### Offline Desktop & Mobile Apps (Vite + Tauri / Capacitor / PWA)

```text
Wrap this Vite + TypeScript @ohtaman/washi application as an offline desktop/mobile app using bundled HiGHS (or @ohtaman/washi/solvers/pumpkin) with zero backend server and zero native solver compilation.
- Keep all solver execution client-side via @ohtaman/washi.
- Configure Content Security Policy to allow WebAssembly compilation ('wasm-unsafe-eval' in script-src) and Web Workers (worker-src 'self' blob:).
```

**How WebView deployment works**:

Standard Vite builds bundle the solver `.wasm` assets you use (`highs.wasm`, and `pumpkin.wasm` when imported) as static files that run offline in Tauri (`tauri://localhost` or `http://tauri.localhost`), Capacitor WebViews, and Service Worker PWAs. Configure your Content Security Policy (`CSP`) with `'wasm-unsafe-eval'` in `script-src` (and `worker-src 'self' blob:` when using Web Workers); see [Runtime Environments](./runtimes.md) for a `tauri.conf.json` example.

---

## 5. Iterating & Debugging with Your Agent

### Name Every Constraint and Verify Every Solve

Ask your agent to pass a descriptive name to `m.constraint(c, "rule_name")` and `m.indicator(...)`, then assert `m.verify().valid === true`. Unnamed constraints default to 1-indexed IDs (`c_1`, `c_2` for linear constraints; `lc_1`, `lc_2` for logical constraints), which makes conflict reports harder to read.

### Diagnose `"Infeasible"` Models with `m.check()`

When adding a new rule makes `m.solve()` return `"Infeasible"`, send a follow-up prompt like this:

```text
Adding the new constraints made m.solve() return "Infeasible".
Run await m.check() (or await m.check({ solver: "pumpkin" }) for bounded integer/boolean models), print res.conflicts / res.unsatCore, explain in plain terms which named rules and variable bounds contradict each other, and propose which non-rigid constraints should be converted into soft constraints with non-negative slack penalty variables.
```

### Inspect `m.toLpString()` and Variable Bounds Before Production

Have your agent print `m.toLpString()` on a small test fixture before shipping. Confirm three items:

- **Finite bounds (`lb` / `ub`)**: Variables inside `m.indicator()` require finite bounds whenever `M` is omitted.
- **Objective sense**: Check that `Maximize` vs. `Minimize` matches your business goal.
- **Constraint operators**: Verify that every `<=`, `>=`, and `=` operator and direction matches your intent.
