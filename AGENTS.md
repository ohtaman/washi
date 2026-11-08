# Code Review & Repository Guidelines (`AGENTS.md`)

This document defines the standards and instructions for automated and human code reviews on Pull Requests (PRs) in **WaSHI** (`@ohtaman/washi`), triggered on initial submission and on every subsequent push (`synchronize`).

> **Looking for the consumer modeling API quick-reference or Agent Skill?** If you are an AI coding agent or developer using `@ohtaman/washi` to formulate and solve optimization or SMT models, see the [AI Coding Agent Quick-Reference Guide](docs/getting-started/ai-agents.md) and the portable [WaSHI Agent Skill (`skills/washi/SKILL.md`)](skills/washi/SKILL.md).

---

## 1. Communication & Language Policy

- **English Only**: All PR titles, descriptions, review summaries, inline comments, and commit messages MUST be written in clear, professional **English**.
- **Constructive & Objective Tone**: Critique the code, not the author. Explain *why* something is an issue, show a concrete reproduction or counterexample where applicable, and provide actionable fix guidance.
- **Severity Prefixes**: Prefix every inline review comment to make expectations clear:
  - `[Blocker]` / `[Bug]`: Must be fixed before merging. Use for verifiable regressions against `main`, functional correctness or boundary defects in new/modified code, broken builds/types/tests, mathematical solver or domain formulation errors, ad-hoc / test-tailored hacks introduced to bypass failures, missing behavioral tests for new/changed logic, stale or broken documentation/examples, or security vulnerabilities introduced by the diff.
    - Do not classify purely stylistic preferences, synthetic DOM/browser mock structures in unit tests (when behavioral assertions already verify the logic), or unrelated out-of-scope feature requests as `[Blocker]` or `[Bug]`.
  - `[Scope]` / `[Design]`: Architectural concerns, inappropriate approach or wrong abstraction layer for the stated problem, over-engineering / gratuitous complexity, unjustified type escapes (`any`, `as unknown as ...`), or out-of-scope changes that should be simplified or extracted into a separate PR.
  - `[Suggestion]`: Optional improvements for readability or minor performance. Non-blocking; author may decline or defer.
  - `[Nit]`: Minor stylistic, naming, or prose polish. Strictly non-blocking.

---

## 2. Core Philosophy: Scope Discipline, Simplicity & Anti-Over-Engineering

Preventing unnecessary complexity, inappropriate design, and scope creep—while rigorously catching functional, mathematical, and architectural defects—is a top priority during review:

1. **Appropriate Approach & Design First (Problem-Solution Fit)**:
   - Before evaluating line-by-line syntax, evaluate whether the architectural approach and design are fundamentally appropriate for the problem being solved.
   - Check whether the solution addresses the root requirement at the correct layer (e.g., modeler, solver backend, decomposition orchestrator, expression tree, or UI wrapper), or whether it takes a misdirected, convoluted, or symptomatic route. Challenge ill-fitting approaches under `[Scope]` / `[Design]`.
2. **Implementation Simplicity (KISS & Anti-Over-Engineering)**:
   - The implementation must be sufficiently simple and direct. Reject premature abstractions, speculative configuration options, or complex class hierarchies built for hypothetical future requirements.
   - Prefer simple, direct, and readable TypeScript over clever or overly generic patterns.
   - Check if a new helper, wrapper, or abstraction is only used once; if so, prefer inlining unless it significantly improves clarity.
   - Always ask: *"Can this same outcome be achieved with a simpler, cleaner, and more direct implementation?"*
3. **Zero Tolerance for Ad-Hoc / Quick-Fix Code**:
   - Strictly detect and reject ad-hoc, superficial, or test-specific code introduced purely to make tests pass or appease review comments without resolving root causes (`[Blocker]`).
   - Prohibit test-case-tailored conditional branching, hardcoded literals matching specific test fixtures, implicit argument coercion/flipping, unapproved fallback heuristics, and silent mutation of unrelated state slices.
   - Require genuine, principled fixes at the root cause rather than cosmetic band-aids.
4. **Single-Responsibility PRs (Author Scope Creep Check)**:
   - Compare the changed files and logic against the stated goal of the PR (and linked Issue, if any).
   - **Action**: If the PR includes unrelated features, opportunistic wide-scale refactorings, or tangential changes that depart from the original objective, **explicitly ask the author to revert those changes and extract them into a separate PR** (`[Scope]`).
5. **Independent Verification Within the PR's Scope**:
   - Do not treat the PR description or a passing test suite as proof that the implementation is correct. Independently verify that the code, mathematical formulation, and tests genuinely satisfy the claimed problem and contract across realistic inputs and boundary conditions.
   - **Do NOT expand the scope of the PR** by requesting unrelated new features or fixes for pre-existing issues in untouched surrounding code. If you notice a pre-existing bug outside the diff's impact, note it briefly as an optional follow-up rather than a blocker.
6. **Favor Incremental Code Health**:
   - Follow Google's Engineering Practices standard: approve once the PR demonstrably improves the overall code health of the system within its intended scope and is free of `[Blocker]` / `[Bug]` and `[Scope]` / `[Design]` issues.
7. **High-Signal Reviews (No Trivial Nitpicking)**:
   - Focus review comments on substantive issues: correctness bugs, boundary defects, mathematical/domain inaccuracies, inappropriate design, over-engineering, ad-hoc workarounds, type safety violations, and missing behavioral test coverage.
   - Do not nitpick synthetic DOM or browser API fakes in unit tests as long as the tests deterministically verify the intended behavioral and state invariants.

---

## 3. Incremental / Per-Push Review Strategy

Because reviews run on **every push** to an open PR:

- **Verify New Changes & Fixes Holistically**: On follow-up pushes (`synchronize`), inspect the newly pushed commits and verify that previously raised `[Blocker]`, `[Bug]`, or `[Scope]` / `[Design]` issues are genuinely resolved at the root cause—without introducing new edge-case bugs, breaking adjacent logic, or adding ad-hoc band-aids tailored solely to pass a test.
- **Avoid Repetitive Noise**: Do not re-post identical comments on unchanged lines that were already flagged in earlier review rounds.
- **Consolidate Pattern Findings Up Front (No Drip-Feed Reviews)**: When flagging a pattern-level issue (e.g., missing localization, accessibility attributes, validation, or error handling), enumerate all affected instances within the PR's diff in a single comment on the initial pass rather than surfacing one new instance per push.
- **Report Any Remaining Bugs in the PR Diff**: On follow-up pushes (`synchronize`), do not introduce late stylistic `[Nit]` comments or scope-expanding requests on unchanged lines. However, if a verifiable `[Blocker]` / `[Bug]` or `[Scope]` / `[Design]` defect remains anywhere in the PR's diff against the base branch—even if introduced in an earlier commit of the PR and missed on the first pass—you MUST report it so defects are never merged into `main`.

---

## 4. What to Look For (Review Dimensions)

### A. Approach & Architectural Design (Problem-Solution Fit)
Evaluate whether the foundational design strategy fits the problem:
- **Core Appropriateness**: Is the chosen design fundamentally appropriate for the problem being solved? Does it tackle the requirement at the correct layer (e.g., modeler, solver backend, expression tree, or UI wrapper)?
- **Root-Cause Resolution**: Does the solution resolve the root cause of the issue/requirement, or does it merely paper over symptoms?
- **Domain & Modeling Alignment**: Does the design adhere naturally to the mathematical and modeling paradigms of WaSHI? In examples, tutorials, and showcase apps, does the mathematical formulation genuinely model the claimed operations research problem (e.g., CVRP with actual routing/coordinates vs. 1D knapsack, proven global optimum vs. heuristic solution)?

### B. Implementation Simplicity & Cleanliness (KISS)
- **Direct & Minimal**: Is the implementation as simple and direct as possible without unnecessary layers of indirection?
- **No Premature Abstraction**: Are new types, interfaces, helper functions, or classes strictly necessary, or do they introduce unnecessary abstraction overhead?
- **Clarity & Maintainability**: Is the logic straightforward to read, understand, and maintain without navigating convoluted indirection?

### C. Integrity & Absence of Ad-Hoc / Quick-Fix Code
Actively inspect for and reject superficial or cosmetic patches:
- **No Test-Specific Branching**: Strictly ensure no conditional branches (`if (testCase === ...)`, special case handling for single inputs), hardcoded magic literals, or tailored parameters exist solely to make specific test cases pass.
- **No Implicit Argument Coercion or Flipping**: Functions and tools must process arguments faithfully as provided; never silently rewrite, invert, or clamp arguments to bypass errors or LLM extraction flaws.
- **No Hidden Cross-Domain Mutations**: Changes must strictly operate within their own domain slice; never silently mutate unrelated state, contracts, or rules to force feasibility.
- **Honest Diagnostics over Fallbacks**: When inputs are invalid or infeasible, report errors or infeasibility cleanly rather than applying undocumented heuristic fallbacks or unapproved bonus terms.

### D. Correctness & Domain Logic
Pay special attention to mathematical and logical soundness:
- **Mathematical Soundness**: Sign flips, operator inversions (`<=`, `>=`, `==`), objective sense (`minimize` vs. `maximize`), dual/reduced-cost signs, cut/column validity, constant term offsets, and coefficient scaling conventions.
- **Transformations & Reformulations**: When expressions or constraints are normalized, linearized, or reformulated, verify that equivalence and boundary conditions hold across all valid variable domains.
- **Numerical & Boundary Edge Cases**: Handling of `0`, `-0`, `NaN`, `Infinity`, `-Infinity`, floating-point tolerances, integer/binary relaxation options, unbounded variables, iteration budget exhaustion, and empty expressions or constraints.
- **Backend / Interface Parity**: Ensure behavior, option handling, and status mapping remain consistent across supported backends and symmetric entrypoints (`solve()` vs. `check()`, `HiGHS` vs. `GLPK` vs. `Z3`), or fail clearly with a descriptive error when a capability is unsupported.

### E. Public API, Types & Distribution Integrity
- **Type Safety**: Flag any use of `any`, unsafe type assertions (`as unknown as ...`), or weakened public types as `[Design]` / `[Bug]` unless accompanied by a clear justification at an untyped external boundary.
- **Exports & Bundles**: If public APIs, build scripts, or package entrypoints are modified, verify compatibility across all target environments (ESM, TypeScript declarations, VitePress site, and browser/WASM builds).
- **Documentation & Locale Sync**: If user-facing APIs, workflows, or examples change, verify that docstrings, READMEs, guides, and all localized counterparts (`en`, `ja`, `zh`) remain accurate and synchronized.

### F. Tests & Verification
- **Behavior-Driven & Invariant-Checking Tests**: Every bug fix, new feature, or runnable example MUST include automated tests that would fail without the change (`[Bug]` if missing or superficial). Tests must verify core behavioral and mathematical invariants—not merely exit codes, array lengths, or syntax transpilation.
- **Edge-Case Coverage**: Check boundary inputs, configuration combinations, and error paths for core solver, parsing, decomposition, and math algorithms. For UI demos, games, and example integrations, verify both the primary user/modeling workflows and the domain invariants of the generated solutions.
- **Independent Expected Values**: Ensure test assertions verify independently derived expected values and feasibility checks rather than merely mirroring the implementation's internal calculation or locking in unverified heuristic outputs.
- **Pragmatic UI Mocks**: Do not require full browser/DOM rendering engines in unit tests when lightweight synthetic objects or state assertions adequately test the UI wiring.

### G. Security & Dependencies
- **Minimal Dependencies**: Flag any new runtime dependencies unless strictly necessary and discussed.
- **Safe Parsing & Input Handling**: Guard against injection, prototype pollution, broken URL/path resolution, or catastrophic regular expression backtracking (ReDoS) when parsing user or external inputs.

---

## 5. Verification

Before approving or concluding a review, verify that the changes pass the repository's standard verification suite (refer to `package.json` `scripts` and `.github/workflows/` for the current test, build, and distribution check commands).

---

## 6. Expected Review Output Structure

Evaluate every PR against the repository's review dimensions (Section 4), including the three foundational checks:
1. **Approach & Design Appropriateness** (tackles the root problem at the right layer; faithful domain/mathematical modeling).
2. **Implementation Simplicity** (adheres to KISS/YAGNI without gratuitous complexity or premature abstraction).
3. **Absence of Ad-Hoc / Quick-Fix Code** (no test-tailored branches, magic literals, silent argument coercions, or superficial band-aids).

Format review output in English as follows:

- **Inline Review Comments (Codex, Automated Bots & Human Reviewers)**:
  - Whenever a defect, regression, boundary bug, missing behavioral test, inappropriate design, over-engineering, unjustified type escape, or ad-hoc workaround is detected, post a specific inline comment prefixed with `[Blocker]` / `[Bug]` or `[Scope]` / `[Design]`, citing the concrete scenario/reproduction and actionable fix.
  - Do **not** pad inline `[Bug]` comments with boilerplate sentences declaring that the rest of the PR's design is simple or free of hacks; keep each inline comment focused directly on the reported issue.
- **Top-Level Review Summary (For Summary-Capable Reviewers)**:
  - Summarize the PR's intent (1–3 sentences), note the assessment of the three foundational checks above, and state a clear verdict (**Approve**, **Approve with minor nits**, or **Request Changes**).

---

## 7. Review Response & Fix Verification Rules (For Coding Agents)

When addressing review comments, simplifying a PR, or reporting that a PR is "merge-ready", coding agents MUST follow these verification rules:

1. **Critical Triage of Review Comments**:
   - **Triage before coding**:
     - **Genuine Bug / Regression / Design Defect**: Fix the root cause directly and cleanly with minimal complexity.
     - **Out-of-Scope Requests / Speculative Unrelated Edge Cases**: Do NOT write convoluted defensive branching or sprawling helper code that degrades simplicity. Instead, classify the finding as **Intentionally Deferred / Out of Scope** (citing the scope boundary or Section 2 simplicity rules) and reply clearly on the review thread.
     - `[Suggestion]` and `[Nit]` items are non-blocking. Address them if the fix is simple and improves clarity without adding complexity.
2. **Never Equate "Zero New Bot Findings on Latest Push" with "All Threads Resolved"**:
   - Automated reviewers may only post new comments on the latest push and stop re-reporting older unresolved threads.
   - Before claiming a PR is ready, enumerate **all** review comments across the PR timeline and explicitly classify each one as:
     - **Fixed** (cite the exact file/line and the regression test on the current `HEAD`), or
     - **Intentionally Deferred / Won't Fix** (cite the reason, scope boundary, or follow-up Issue, and leave a clear reply on the PR).
3. **Audit Against Historical Review Comments After Any Reset, Rebase, or Simplification**:
   - Whenever a branch is reset, rebased, or simplified to remove over-engineering, previously applied fixes can easily be dropped.
   - After any branch rewrite, re-verify every historical review finding against the **current `HEAD` code and the diff from the target base ref or merge-base (e.g., `git diff <base-ref>...HEAD`, resolving `<base-ref>` dynamically to `main`, `origin/main`, or the PR base commit available in the checkout)**—never rely on memory of what was fixed in an earlier, discarded commit.
4. **Check Symmetric Entrypoints & Execution Paths (Core Domain Only)**:
   - When fixing a bug in core solver methods or public model APIs, systematically check symmetric entrypoints and branches (e.g., `solve()` vs. `check()`, `sat` vs. `unsat`, `<=` vs. `>=`, `HiGHS` vs. `GLPK` vs. `Z3`) so fixes are not applied to only half of a parallel code path. Do not force artificial symmetry onto asymmetric utility or demo UI code.
5. **Reproduce Verifiable Bugs with a Test on `HEAD`**:
   - For genuine functional bugs or regressions within the PR's scope, write an automated regression test on `HEAD` that fails without the fix and passes with it.
6. **Sweep the Entire Surface Class for Systemic Pattern Issues (Prevent Review Whack-a-Mole)**:
   - When fixing a systemic category of issue within the PR's scope (e.g., broad localization rollouts, public status mappings), audit the affected surface once rather than patching one line per push. For isolated or single-element fixes, a focused behavioral test is sufficient.
7. **Pre-Screen Every Commit Against Section 4 Before Pushing**:
   - Review fixes frequently trigger secondary review rounds when test harnesses or helpers take shortcuts. Before pushing any commit, verify that the new diff introduces **zero unjustified** `any` or `as unknown as ...` assertions (Section 4.E), **zero** source-substring-only tests in place of behavioral tests (Section 4.F), and **zero** collateral changes outside the PR scope (Section 2).
8. **Maintain Architectural Integrity & Avoid Quick-Fixes**:
   - When resolving review findings or failing tests, never add test-specific conditional branches, ad-hoc fallback heuristics, or superficial workarounds. Fix the root cause with the simplest sound implementation.
