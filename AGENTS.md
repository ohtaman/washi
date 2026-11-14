# Repository Development & Code Review Guidelines (`AGENTS.md`)

Guidelines for coding agents and reviewers contributing to **WaSHI** (`@ohtaman/washi`).

> **Modeling with `@ohtaman/washi`?** See the [AI Coding Agent Quick-Reference Guide](docs/getting-started/ai-agents.md) and [WaSHI Agent Skill (`skills/washi/SKILL.md`)](skills/washi/SKILL.md).

---

## 1. Architectural & Repository Invariants

- **Backend-Agnostic Modeler**: Keep core modeling primitives (variables, expressions, constraints, indicators, decomposition) independent of specific solver backends (`HiGHS`, `GLPK`, `Z3`) and symmetric across `solve()` and `check()`.
- **Zero Runtime Dependencies**: Keep `dependencies` empty in `package.json` (`glpk.js` and `z3-solver` remain optional `peerDependencies`). Do not add dependencies without prior discussion.
- **ESM & Multi-Runtime**: Use explicit `.js` extensions in relative TypeScript imports within library/Node ESM code and preserve compatibility across Node ESM, browser/WASM bundles, and `.d.ts` declarations.
- **Strict Type Safety**: Avoid `any` and `as unknown as ...` except at untyped external boundaries (WASM/FFI) with clear justification.
- **Docs & Locale Sync**: Keep user-facing APIs, guides, and examples synchronized across `en`, `ja`, and `zh` docs as well as `llms.txt` / `llms-full.txt`.

---

## 2. Development Workflow & Verification

Follow **Test-Driven Development (Red → Green → Refactor)** in the terminal for features, bug fixes, and runnable examples *(prose/config-only edits may verify via build and existing tests)*:

1. **Red**: Inspect affected code and symmetric paths (`solve()` / `check()`, `HiGHS` / `GLPK` / `Z3`), add a behavioral/invariant test before changing production code, and run `npx vitest run <file>` to confirm it fails for the expected reason.
2. **Green & Refactor**: Implement the simplest root-cause fix, confirm tests pass, and remove duplication while staying Green.
3. **Pre-Push Verification**:
   - `npm test` — Full Vitest suite
   - `npm run build` — Type declarations (`build:types`), library, browser, and demo builds
   - `npm run docs:build` — Required when changing documentation or `llms.txt` sources
   - `npm run test:distribution` / `npm run test:demo` — Required when changing package exports/bundles or web demos

---

## 3. Engineering & Quality Standards

- **Right Layer & KISS**: Solve root causes at the appropriate layer without premature abstractions, speculative options, or single-use wrappers.
- **Honest Behavior (No Ad-Hoc Workarounds)**: Never add test-specific branches/literals, silently coerce invalid inputs, or mutate unrelated state to force feasibility. Validate inputs and report errors or `Infeasible` / `Unsat` states honestly.
- **Mathematical & Solver Rigor**: Verify signs, sense (`minimize` / `maximize`), operators (`<=` / `>=` / `==`), duals/reduced costs, cuts/columns, constant offsets, reformulation equivalence, boundary inputs (`0`, `-0`, `NaN`, `±Infinity`, tolerances, unbounded variables, empty expressions), and backend parity (or fail with a clear unsupported error). Examples and demos must genuinely formulate the claimed OR/SMT problem.
- **Behavioral Tests**: Assert domain and mathematical invariants against independently derived expected values—not exit codes or source-code substrings (lightweight mocks are fine for UI wiring).
- **Scope Discipline**: Keep each PR focused on a single goal (`1 Issue = 1 PR`). Revert/extract unrelated edits; do not expand scope during review to untouched pre-existing code.

---

## 4. Pull Request & Code Review Policy

- **English Only & Constructive Tone**: Write all PR titles, descriptions, commits, and review comments in objective English with concrete reproductions/counterexamples and actionable fixes.
- **Severity Prefixes**:
  - `[Blocker]` / `[Bug]`: Regressions, functional/math/boundary defects, broken builds/types/tests, ad-hoc hacks, missing or superficial (e.g., source-substring-only) behavioral tests, broken/out-of-sync docs, or security issues.
  - `[Scope]` / `[Design]`: Wrong layer/approach, over-engineering, unjustified type escapes, or out-of-scope changes.
  - `[Suggestion]` / `[Nit]`: Non-blocking readability or style improvements.
- **Full-Diff Verification (`base...HEAD`)**:
  - On every push, evaluate the entire cumulative diff (`base...HEAD`) independently—trace code paths and math invariants rather than relying solely on PR descriptions or passing tests, and report **every** unresolved blocking issue across **all** affected locations in `base...HEAD` (whether newly introduced, missed earlier, or still unfixed from a prior round).
  - Avoid repeating non-blocking `[Nit]` / `[Suggestion]` comments on unchanged lines or re-litigating agreed out-of-scope deferrals.
  - Before claiming merge-readiness (including after rebases/rewrites), authors must verify that every review thread is resolved with tests on `HEAD` or explicitly agreed as out-of-scope.
  - Approve only when `base...HEAD` improves code health within scope with zero unresolved `[Blocker]` / `[Bug]` / `[Scope]` / `[Design]` issues.
