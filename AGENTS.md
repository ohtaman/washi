# Code Review & Repository Guidelines (`AGENTS.md`)

This document defines the standards and instructions for automated and human code reviews on Pull Requests (PRs) in **WaSHI** (`@ohtaman/washi`), triggered on initial submission and on every subsequent push (`synchronize`).

> **Looking for the consumer modeling API quick-reference?** If you are an AI coding agent or developer using `@ohtaman/washi` to formulate and solve optimization or SMT models, see the [AI Coding Agent Quick-Reference Guide](docs/getting-started/ai-agents.md).

---

## 1. Communication & Language Policy

- **English Only**: All PR titles, descriptions, review summaries, inline comments, and commit messages MUST be written in clear, professional **English**.
- **Constructive & Objective Tone**: Critique the code, not the author. Explain *why* something is an issue and provide concrete, actionable code suggestions where possible.
- **Severity Prefixes**: Prefix every inline review comment to make expectations clear:
  - `[Blocker]` / `[Bug]`: Must be fixed before merging (e.g., correctness bugs, mathematical formulation errors, regressions, broken builds/exports, security issues, missing critical tests).
  - `[Scope]` / `[Design]`: Architectural concerns, over-engineering, or out-of-scope changes that should be simplified or extracted into a separate PR.
  - `[Suggestion]`: Recommended improvements for readability, edge-case coverage, or performance, though open to discussion.
  - `[Nit]`: Minor stylistic, naming, or documentation polish. Non-blocking.

---

## 2. Core Philosophy: Scope Discipline & Anti-Over-Engineering

Preventing unnecessary complexity and scope creep is a top priority during review:

1. **Single-Responsibility PRs (Scope Creep Check)**:
   - Compare the changed files and logic against the stated goal of the PR (and linked Issue, if any).
   - **Action**: If the PR includes unrelated features, opportunistic wide-scale refactorings, or tangential changes that depart from the original objective, **explicitly ask the author to revert those changes and extract them into a separate PR**.
2. **Guard Against Over-Engineering (YAGNI & KISS)**:
   - Reject premature abstractions, speculative configuration options, or complex class hierarchies built for hypothetical future requirements.
   - Prefer simple, direct, and readable TypeScript over clever or overly generic patterns.
   - Check if a new helper, wrapper, or abstraction is only used once; if so, prefer inlining unless it significantly improves clarity.
3. **Favor Incremental Code Health**:
   - Follow Google's Engineering Practices standard: approve once the PR demonstrably improves the overall code health of the system, even if it isn't "perfect." Do not block merges over subjective `[Nit]` items.

---

## 3. Incremental / Per-Push Review Strategy

Because reviews run on **every push** to an open PR:

- **Focus on New Changes**: On follow-up pushes, focus primarily on the newly pushed commits and whether previously raised `[Blocker]` or `[Scope]` issues have been resolved.
- **Avoid Repetitive Noise**: Do not re-post identical comments on unchanged lines that were already flagged in earlier review rounds.
- **Verify Fixes Holistically**: When a push addresses an earlier review comment, verify that the fix actually resolves the root cause without introducing new edge-case bugs or breaking adjacent logic.

---

## 4. What to Look For (Review Dimensions)

### A. Correctness & Domain Logic
Pay special attention to mathematical and logical soundness:
- **Mathematical Soundness**: Sign flips, operator inversions (`<=`, `>=`, `==`), objective sense (`minimize` vs. `maximize`), constant term offsets, and coefficient scaling conventions.
- **Transformations & Reformulations**: When expressions or constraints are normalized, linearized, or reformulated, verify that equivalence and boundary conditions hold across all valid variable domains.
- **Numerical & Boundary Edge Cases**: Handling of `0`, `-0`, `NaN`, `Infinity`, `-Infinity`, floating-point tolerances, unbounded variables, and empty expressions or constraints.
- **Backend / Interface Parity**: Ensure behavior and status mapping remain consistent across supported backends, or fail clearly with a descriptive error when a backend does not support a capability.

### B. Public API, Types & Distribution Integrity
- **Type Safety**: Flag any use of `any`, unsafe type assertions (`as unknown as ...`), or weakened public types unless accompanied by a clear justification.
- **Exports & Bundles**: If public APIs or package entrypoints are modified, verify compatibility across all target environments (ESM, TypeScript declarations, and browser builds).
- **Documentation Sync**: If user-facing APIs or behavior change, check whether docstrings, documentation, or README examples need corresponding updates or have become stale.

### C. Tests & Verification
- **Behavior-Driven Tests**: Every bug fix or new feature MUST include automated tests that would fail without the change.
- **Edge-Case Coverage**: Check that tests cover boundary inputs, invalid inputs (error throwing), and non-trivial execution paths—not just the happy path.
- **Independent Expected Values**: Ensure test assertions verify independent expected values rather than merely mirroring the implementation's internal calculation.

### D. Security & Dependencies
- **Minimal Dependencies**: Flag any new runtime dependencies unless strictly necessary and discussed.
- **Safe Parsing & Input Handling**: Guard against injection, prototype pollution, or catastrophic regular expression backtracking (ReDoS) when parsing user or external inputs.

---

## 5. Verification

Before approving or concluding a review, verify that the changes pass the repository's standard verification suite (refer to `package.json` `scripts` and `.github/workflows/` for the current test, build, and distribution check commands).

---

## 6. Expected Review Output Structure

Structure each PR review response concisely in English using the following format:

1. **Summary & Scope Assessment**:
   - 1–3 sentences summarizing the intent of the PR/push and whether the changes stay strictly within scope.
   - Explicitly call out any over-engineering or out-of-scope changes that should be split into a separate PR.
2. **Key Findings (Inline or Grouped by Severity)**:
   - List `[Blocker]`, `[Scope]`, `[Suggestion]`, and `[Nit]` items with file paths and line references.
   - Omit sections that have no findings (do not pad with filler text).
3. **Verdict**:
   - Clear recommendation: **Approve**, **Approve with minor nits**, or **Request Changes** (listing the exact blockers required to resolve).

---

## 7. Review Response & Fix Verification Rules (For Coding Agents)

When addressing review comments, simplifying a PR, or reporting that a PR is "merge-ready", coding agents MUST follow these verification rules:

1. **Never Equate "Zero New Bot Findings on Latest Push" with "All Threads Resolved"**:
   - Automated reviewers (e.g., Codex) only inspect the latest push and may stop re-reporting older unresolved threads.
   - Before claiming a PR is ready, enumerate **all** review comments across the PR timeline and explicitly classify each one as:
     - **Fixed** (cite the exact file/line and the regression test on the current `HEAD`), or
     - **Intentionally Deferred / Won't Fix** (cite the reason, scope boundary, or follow-up Issue, and leave a clear reply on the PR).
2. **Audit Against Historical Review Comments After Any Reset, Rebase, or Simplification**:
   - Whenever a branch is reset, rebased, or simplified to remove over-engineering, previously applied fixes can easily be dropped.
   - After any branch rewrite, re-verify every historical review finding against the **current `HEAD` code and the diff from the target base ref or merge-base (e.g., `git diff <base-ref>...HEAD`, resolving `<base-ref>` dynamically to `main`, `origin/main`, or the PR base commit available in the checkout)**—never rely on memory of what was fixed in an earlier, discarded commit.
3. **Check Symmetric Entrypoints & Execution Paths**:
   - When fixing a bug in one method or solver backend, systematically check symmetric entrypoints and branches (e.g., `solve()` vs. `check()`, `sat` vs. `unsat`, `<=` vs. `>=`, `HiGHS` vs. `GLPK` vs. `Z3`) so fixes are never applied to only half of a parallel code path.
4. **Reproduce Every Reported Bug with a Test on `HEAD`**:
   - Never claim a review finding is fixed without an automated test in the current branch that reproduces the exact scenario from the review comment and passes on `HEAD`.

