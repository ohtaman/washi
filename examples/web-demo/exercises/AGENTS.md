# Optimization 100 Exercises — Authoring & Style Guidelines (`AGENTS.md`)

Conventions that every exercise (`#000`–`#100`) in `examples/web-demo/exercises/` must follow for uniform clarity, low cognitive noise, and idiomatic WaSHI / PuLP (`HiGHS`) code.

---

## 1. Problem Design & Low-Noise Statements

- **1 Problem = 1 Core Concept**: Each exercise should isolate one clear modeling idea or idiom rather than repeating nearly identical scenarios or introducing unrelated boilerplate.
- **Minimal Input Schema**: Avoid splitting constants into excessive scalar fields (e.g., do not expose 8 separate camelCase coefficients for a 2-variable LP). Keep inputs to the essential dimensions (`2`–`4` clean fields, concise vectors, or a single matrix).
- **Concise Problem Tab (`locales/{en,ja,zh}.md`)**:
  - Header `# #NNN. <Title>` followed by:
    - `<!-- section:scenario -->`: 2–4 crisp sentences (or a brief intro plus a concise bulleted list when there are 3 or more distinct conditions) stating decision quantities, rules, and objective. No fenced code blocks or constraint formulas (inline backticks are allowed for identifiers only; enforced by tests) and no repetitive UI/terminology tutorials. State *what* must hold, never *how* to model or compute it: no constraint formulas, variable recipes, or algorithm step lists. When the technique itself is the learning objective (e.g., column generation or Benders in Chapter 10), name the technique and what it must produce, and leave the steps to the hints.
    - `<!-- section:io -->`: `### Input` and `### Output` using clean GFM tables (`Field | Type | Description`).
    - `<!-- section:example -->`: Minimal `json` Input and Output blocks matching `cases.json[0]`, plus a concise 1-sentence arithmetic check confirming constraint satisfaction and objective value calculation (do not reveal modeling intuition, trade-offs, or why greedy/heuristic rules fail; reserve those for the Editorial tab).
  - Keep `caseNames` in `locales/{en,ja,zh}.json` descriptive and neutral—never embed expected optimal values or solution-strategy hints.
  - Target 3–5 test cases per exercise (with 5 cases as the standard for Chapter 1+) covering boundary, binding-constraint, rectangular/dimension-varying, and fractional/zero-activity cases.
  - Keep `#000` as the sole onboarding exercise explaining the workbook `solve()` submission contract (`P000Input` / `P000Output` in TS, unpacked input fields and `dict` output in Python); keep `#001`–`#100` purely focused on optimization modeling.
  - Keep cross-exercise definitions (decision variables, bounds, verdicts, LP vs. MIP, solver statuses) in `src/guide/locales/{en,ja,zh}.md` rather than repeating them in every problem.
  - Keep judge messages (`locales/*.json` → `judge.m*`) diagnostic: report what is wrong with the output, not which cuts, variables, or steps to add.

### Scaffolding & Hint Ladder (Chapter 2+)

Difficulty must come from *deciding* the model, not from transcribing comments. Chapter 1 keeps its onboarding-style starters; from Chapter 2 onward, scaffolding decreases monotonically and guidance lives in collapsible problem-tab hints instead of starter comments (enforced by `test/helpers/exercises-scaffold-policy.ts` via `enforceScaffoldPolicy: true` in each chapter suite):

| Chapter | `meta.scaffold` | Starter may provide |
| --- | --- | --- |
| 2 | `fill-in` | Interfaces, size derivations, `Model` / `LpProblem`, and decision-variable declarations |
| 3–5 | `fill-in` or `scratch` | Interfaces, size derivations, and `Model` / `LpProblem` — **no decision-variable declarations** |
| 6–10 | `scratch` | Imports, interfaces, non-modeling helpers outside `solve()`, and a `solve()` body containing only a TODO comment plus `throw new Error("Not implemented")` / `raise NotImplementedError` |

- **Starter comments**: at most 3 comment lines per starter, written as goals in words (e.g., "Build and solve the model, then return the output."). Never include formulas or code-level recipes (`<=`, `>=`, `==`, `!=`, `sum(`, `dot(`, `lpSum(`, `lpDot(`, `` expr` ``), step-by-step algorithms, or variable lists.
- **Hint ladder** in every `locales/{en,ja,zh}.md`, appended after `section:example`:
  - `<!-- section:hint1 -->` (Decision Variables & Structure): which decisions to model and how the model is organized (per item, per period, master vs. subproblem), in words. No formulas.
  - `<!-- section:hint2 -->` (Key Constraints & Pitfalls): the non-obvious modeling idea or trap, plus WaSHI / PuLP API names when the exercise depends on one (e.g., `m.relax()`, `solveColumnGeneration`). Short inline math is acceptable; no fenced code blocks and no complete formulation.
  - Leave `section:formulation` empty: the complete model and implementation belong to the Editorial tab.
- **Calibration**: keep `difficulty` and `estimatedMinutes` consistent with the scaffold level (a `scratch` exercise takes longer than the same model as `fill-in`).

---

## 2. Editorial Format (`editorial/locales/{en,ja,zh}.md`)

Every exercise uses a consistent 4-section editorial loaded lazily into the `Editorial` tab (`editorial/locales/{en,ja,zh}.md`):

1. **Approach**: 2–3 sentences stating the decision variables, constraints, and objective up front.
2. **Mathematical Model**: One clean `$$ ... $$` KaTeX block whose symbol names align naturally with the input/output names.
3. **Key Points**: 2–3 bullets explaining *why* the formulation works, common pitfalls, and any newly introduced modeling terms, with anchor link(s) to the built-in Guide (`?view=guide&lang=<locale>#<anchor>`).
4. **Key Implementation**: Short core snippet only (never paste the full boilerplate). **Always** precede each fenced block with explicit bold labels:
   - `**WaSHI (TypeScript)**` above the `` ```ts `` block
   - `**PuLP (Python)**` above the `` ```python `` block (omit when `meta.runtimes` is `["washi"]` only, such as CP / SMT / QP / Decomposition exercises)

---

## 3. Code & TypeScript / Python Idioms

- **Reference Solution Comments (`washi/solution.ts`, `highspy/solution.py`)**: Unlike starters (which forbid modeling recipes), reference solutions should include concise English comments explaining what decision variables represent, what each constraint/objective block models, and why non-obvious formulations, linearizations, or multi-phase steps are needed.
- **Strict `solve()` Module Contract**:
  - TypeScript (`washi/{starter,solution}.ts`): declare `export interface PNNNInput`, `export interface PNNNOutput`, and `export async function solve(input: PNNNInput): Promise<PNNNOutput>`.
  - Python (`highspy/{starter,solution}.py`): declare `def solve(<snake_case_input_fields...>) -> dict:` accepting the problem's camelCase input fields mapped to `snake_case` parameters and returning a `dict` with `snake_case` keys matching `PNNNOutput`, with a concise `"""Return {...}."""` schema docstring.
- **Idiomatic WaSHI (TypeScript)**:
  - **Prefer `.map()` + batch `m.constraint([...])` over C-style `for (let i = 0; ...)` loops**:
    ```ts
    m.constraint(
      input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`)
    );
    ```
    When named constraints are useful (e.g. dual/conflict inspection), prefer `.forEach(...)`:
    ```ts
    input.capacities.forEach((cap, k) =>
      m.constraint(expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`, `resource_${k}`)
    );
    ```
  - **Use vector/matrix helpers (`sum`, `dot`, array `m.continuous(n, ...)`, `.map()`, `.flatMap()`)** rather than imperative accumulator loops.
  - **Clean outputs**: Use `v.value!` directly for continuous LP results, and normalize integer/binary solutions cleanly with `Math.round(v.value!)` (converting `-0` to `0` if needed via `|| 0`).
  - Omit unnecessary `if (status !== "Optimal")` throw scaffolding unless multi-status branching is part of the problem; both the WaSHI runner (`washi-runner.ts`) and the Python runner (`pyodide-worker.ts`) report `solverStatus` (`Infeasible`, `Unbounded`, `NotSolved`) directly to `applySolverStatusToVerdict()`.
- **Idiomatic PuLP (Python) + HiGHS**:
  - Model problems using `pulp.LpProblem(...)`, `pulp.LpVariable(...)`, `pulp.lpSum(...)` / `pulp.lpDot(...)`, and solve silently with `prob.solve(pulp.HiGHS(msg=False))` (the browser Pyodide worker also defaults `prob.solve()` to `pulp.HiGHS(msg=False)`).
  - Read continuous outputs with `float(pulp.value(v))`, integer/binary outputs with `round(pulp.value(v))`, and the objective with `float(pulp.value(prob.objective))`.

---

## 4. Judging & Localization Invariants

- **Honest Verdict Classification (`judge.ts`)**: Never return `VIOLATION` for missing/non-finite fields or malformed output shapes — use `runtimeError(...)` (`RUNTIME_ERROR`). Reserve `VIOLATION` for broken constraints/bounds and `SUBOPTIMAL` for feasible non-optimal objectives (`sense`-aware).
- **Source Language Purity**: Keep all `.ts`, `.py`, `cases.json`, `meta.json`, and root/docs English `.md` files free of Japanese Kana; localized content belongs exclusively under `/locales/{en,ja,zh}.{json,md}` (including `editorial/locales/` and `src/guide/locales/`).
- **Per-Exercise Discussions**: Link finalized exercises in `meta.json` to a dedicated GitHub Discussions thread via `"discussionNumber"` (`#281`+ under `https://github.com/ohtaman/washi/discussions/<number>`). Omit `"discussionNumber"` until the problem is reviewed and finalized (the workspace omits the Discussions footer cleanly when `discussionNumber` is absent).
- **Runtime Selection (`meta.runtimes`)**: Use `["washi", "highspy"]` for LP / MIP exercises expressible in both WaSHI and PuLP. Use `["washi"]` for WaSHI-specific paradigms (CP global constraints, SMT / Unsat Core, convex QP, and decomposition orchestrators); omit the `highspy/` directory when `runtimes` is `["washi"]`, and the workbench UI hides `#tab-highspy` and displays `washiOnlyHint`.
- **Pre-PR Verification**:
  - `REQUIRE_HIGHSPY_PYTHON=1 npx vitest run test/exercises-ch1.test.ts test/exercises-platform.test.ts test/source-language-purity.test.ts`
  - `npm test`
  - `npm run build && npm run test:site && node scripts/check-exercises-browser.mjs`
