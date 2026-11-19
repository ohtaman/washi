# Optimization 100 Exercises — Authoring & Style Guidelines (`AGENTS.md`)

Conventions that every exercise (`#000`–`#100`) in `examples/web-demo/exercises/` must follow for uniform clarity, low cognitive noise, and idiomatic WaSHI / `highspy` code.

---

## 1. Problem Design & Low-Noise Statements

- **1 Problem = 1 Core Concept**: Each exercise should isolate one clear modeling idea or idiom rather than repeating nearly identical scenarios or introducing unrelated boilerplate.
- **Minimal Input Schema**: Avoid splitting constants into excessive scalar fields (e.g., do not expose 8 separate camelCase coefficients for a 2-variable LP). Keep inputs to the essential dimensions (`2`–`4` clean fields, concise vectors, or a single matrix).
- **Concise Problem Tab (`locales/{en,ja,zh}.md`)**:
  - Header `# #NNN. <Title>` followed by:
    - `<!-- section:scenario -->`: 2–4 crisp sentences stating decision quantities, rules, and objective. No backticks (enforced by tests) and no repetitive UI/terminology tutorials.
    - `<!-- section:io -->`: `### Input` and `### Output` using clean GFM tables (`Field | Type | Description`).
    - `<!-- section:example -->`: Minimal `json` Input and Output blocks matching `cases.json[0]`, plus a 1-sentence justification.
  - Keep `#000` as the sole onboarding exercise explaining the workbook `solve()` submission contract (`P000Input` / `P000Output` in TS, `dict` in Python); keep `#001`–`#100` purely focused on optimization modeling.
  - Keep cross-exercise definitions (decision variables, bounds, verdicts, LP vs. MIP, solver statuses) in `src/guide/locales/{en,ja,zh}.md` rather than repeating them in every problem.

---

## 2. Editorial Format (`editorial/locales/{en,ja,zh}.md`)

Every exercise uses a consistent 4-section editorial loaded lazily into the `Editorial` tab (`editorial/locales/{en,ja,zh}.md`):

1. **Approach**: 2–3 sentences stating the decision variables, constraints, and objective up front.
2. **Mathematical Model**: One clean `$$ ... $$` KaTeX block whose symbol names align naturally with the input/output names.
3. **Key Points**: 2–3 bullets explaining *why* the formulation works, common pitfalls, and any newly introduced modeling terms, with anchor link(s) to the built-in Guide (`?view=guide&lang=<locale>#<anchor>`).
4. **Key Implementation**: Short core snippet only (never paste the full boilerplate). **Always** precede each fenced block with explicit bold labels:
   - `**WaSHI (TypeScript)**` above the `` ```ts `` block
   - `**Python (highspy)**` above the `` ```python `` block

---

## 3. Code & TypeScript / Python Idioms

- **Strict `solve()` Module Contract**:
  - TypeScript (`washi/{starter,solution}.ts`): declare `export interface PNNNInput`, `export interface PNNNOutput`, and `export async function solve(input: PNNNInput): Promise<PNNNOutput>`.
  - Python (`highspy/{starter,solution}.py`): declare `def solve(input_data: dict) -> dict:` with a concise `"""Return {...}."""` schema docstring matching `PNNNOutput`.
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
- **Idiomatic Python (`highspy`)**:
  - Always call `h.silent()`.
  - Use clear comprehensions, `h.qsum(...)`, `h.addConstr(...)` / `h.addConstrs(...)`, `float(h.val(v))` for continuous variables, `int(round(h.val(v)))` for integer/binary variables, and `float(h.getObjectiveValue())`.

---

## 4. Judging & Localization Invariants

- **Honest Verdict Classification (`judge.ts`)**: Never return `VIOLATION` for missing/non-finite fields or malformed output shapes — use `runtimeError(...)` (`RUNTIME_ERROR`). Reserve `VIOLATION` for broken constraints/bounds and `SUBOPTIMAL` for feasible non-optimal objectives (`sense`-aware).
- **Source Language Purity**: Keep all `.ts`, `.py`, `cases.json`, `meta.json`, and root/docs English `.md` files free of Japanese Kana; localized content belongs exclusively under `/locales/{en,ja,zh}.{json,md}` (including `editorial/locales/` and `src/guide/locales/`).
- **Pre-PR Verification**:
  - `REQUIRE_HIGHSPY_PYTHON=1 npx vitest run test/exercises-ch1.test.ts test/exercises-platform.test.ts test/source-language-purity.test.ts`
  - `npm test`
  - `npm run build && npm run test:site && node scripts/check-exercises-browser.mjs`
