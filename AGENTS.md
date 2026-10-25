# Code Review & Repository Guidelines (`AGENTS.md`)

This document defines the standards and instructions for automated and human code reviews on Pull Requests (PRs) in **WaSHI** (`@ohtaman/washi`), triggered on initial submission and on every subsequent push (`synchronize`).

> **Looking for the consumer modeling API quick-reference or Agent Skill?** If you are an AI coding agent or developer using `@ohtaman/washi` to formulate and solve optimization or SMT models, see the [AI Coding Agent Quick-Reference Guide](docs/getting-started/ai-agents.md) and the portable [WaSHI Agent Skill (`skills/washi/SKILL.md`)](skills/washi/SKILL.md).

---

## 1. Communication & Language Policy

- **English Only**: All PR titles, descriptions, review summaries, inline comments, and commit messages MUST be written in clear, professional **English**.
- **Constructive & Objective Tone**: Critique the code, not the author. Explain *why* something is an issue and provide concrete, actionable code suggestions where possible.
- **Severity Prefixes**: Prefix every inline review comment to make expectations clear:
  - `[Blocker]` / `[Bug]`: Must be fixed before merging. **Strict Threshold**: ONLY use for verifiable regressions against `main`, functional correctness defects introduced by new code, broken builds/types/tests, mathematical solver errors, or security vulnerabilities introduced by the diff.
    - **Never** classify the following as `[Blocker]` or `[Bug]`: speculative "what-if" edge cases outside the PR's stated intent, test mock fidelity or fake object structure (as long as tests reliably pass), stylistic preferences, or non-critical enhancements.
  - `[Scope]` / `[Design]`: Architectural concerns, over-engineering, or out-of-scope changes that should be simplified or extracted into a separate PR.
  - `[Suggestion]`: Optional improvements for readability, minor edge-case handling, or performance. Non-blocking; author may decline or defer.
  - `[Nit]`: Minor stylistic, naming, or documentation polish. Strictly non-blocking.

---

## 2. Core Philosophy: Scope Discipline & Anti-Over-Engineering

Preventing unnecessary complexity and scope creep is a top priority during review—both for the PR author and for the reviewer:

1. **Single-Responsibility PRs (Author Scope Creep Check)**:
   - Compare the changed files and logic against the stated goal of the PR (and linked Issue, if any).
   - **Action**: If the PR includes unrelated features, opportunistic wide-scale refactorings, or tangential changes that depart from the original objective, **explicitly ask the author to revert those changes and extract them into a separate PR**.
2. **Review Strictly Within the PR's Stated Intent (No Reviewer-Induced Scope Creep)**:
   - Evaluate the PR strictly against its stated objective, linked Issue, and the code actually modified or directly impacted by the diff.
   - **Do NOT expand the scope of the PR** during review by requesting new features, broader architectural redesigns, fixes for pre-existing unrelated issues in surrounding code, or handling of hypothetical edge cases that lie outside the PR's stated goal.
   - If you notice a valid pre-existing bug or a worthwhile follow-up enhancement outside the PR's scope, do **not** flag it as a `[Blocker]` or require it to be fixed in the current PR; at most, note it briefly as an optional follow-up Issue.
3. **Guard Against Over-Engineering (YAGNI & KISS)**:
   - Reject premature abstractions, speculative configuration options, or complex class hierarchies built for hypothetical future requirements.
   - Prefer simple, direct, and readable TypeScript over clever or overly generic patterns.
   - Check if a new helper, wrapper, or abstraction is only used once; if so, prefer inlining unless it significantly improves clarity.
4. **Favor Incremental Code Health**:
   - Follow Google's Engineering Practices standard: approve once the PR demonstrably improves the overall code health of the system within its intended scope, even if it isn't "perfect." Do not block merges over subjective `[Nit]` items or out-of-scope follow-ups.
5. **High Bar for Review Comments (Anti-Nitpicking & Pragmatism)**:
   - Automated and human reviewers must NOT comment merely to have something to say.
   - Do NOT demand extra defensive layers, state machines, or fallbacks for low-probability hypothetical edge cases ("what if the user does X and then Y before Z?"). Simple, robust code covering the intended workflow is vastly superior to complex defensive code.
   - Do NOT nitpick test harness fidelity or fake objects (e.g., DOM or browser API mocks) in demo apps or auxiliary code as long as tests are deterministic, green, and test the intended behavior.
   - If the PR fulfills its stated goal, passes all tests, and introduces no regressions on `main`, the default verdict MUST be **Approve**.

---

## 3. Incremental / Per-Push Review Strategy

Because reviews run on **every push** to an open PR:

- **Focus on New Changes**: On follow-up pushes, focus primarily on the newly pushed commits and whether previously raised `[Blocker]` or `[Scope]` issues have been resolved.
- **Avoid Repetitive Noise**: Do not re-post identical comments on unchanged lines that were already flagged in earlier review rounds.
- **Verify Fixes Holistically**: When a push addresses an earlier review comment, verify that the fix actually resolves the root cause without introducing new edge-case bugs or breaking adjacent logic.
- **Consolidate Pattern Findings Up Front (No Drip-Feed Reviews)**: When flagging a pattern-level issue (e.g., missing localization, accessibility attributes, validation, or error handling), enumerate all affected instances within the PR's scope in a single comment on the initial pass rather than surfacing one new instance per push.
- **No Post-Fix Goalpost Shifting**: On follow-up pushes (`synchronize`), restrict new comments to bugs/regressions introduced by the newly pushed commits or incomplete fixes of previously raised threads. Do not open brand-new findings on pre-existing lines or adjacent attributes that were already present in earlier commits.

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
- **Edge-Case Coverage for Core Domain**: Check boundary inputs and error paths for core solver, parsing, and math algorithms. For UI demos, games, or example integrations, lightweight behavioral tests covering the happy path and primary user flows are sufficient.
- **Independent Expected Values**: Ensure test assertions verify independent expected values rather than merely mirroring the implementation's internal calculation.
- **Pragmatic Test Mocks**: Never require full DOM or browser API simulation in unit tests when simple synthetic objects or state asserts adequately verify the logic.

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

1. **Critical Triage of Review Comments (Do NOT Blindly Implement Every Comment)**:
   - Automated reviewers (e.g., Codex) frequently speculate about edge cases or request deeper mock fidelity that strays from the PR's purpose.
   - **Triage before coding**:
     - **Genuine Blocker / Regression**: Fix directly and cleanly with minimal diff.
     - **Speculative Edge Cases / Pedantic Mock Demands / Out-of-Scope Requests**: Do NOT write complex defensive branching, convoluted mock setups, or sprawling helper code to appease the bot. Instead, classify the finding as **Intentionally Deferred / Out of Scope** (e.g., `"Deferred: Speculative edge case outside the PR's stated intent; kept simple per YAGNI (AGENTS.md Section 2)"`) and reply directly on the review thread.
     - `[Suggestion]` and `[Nit]` items are non-blocking. Only address them if the fix is trivial (1–2 lines) and does not increase complexity.
2. **Never Equate "Zero New Bot Findings on Latest Push" with "All Threads Resolved"**:
   - Automated reviewers (e.g., Codex) only inspect the latest push and may stop re-reporting older unresolved threads.
   - Before claiming a PR is ready, enumerate **all** review comments across the PR timeline and explicitly classify each one as:
     - **Fixed** (cite the exact file/line and the regression test on the current `HEAD`), or
     - **Intentionally Deferred / Won't Fix** (cite the reason, scope boundary, or follow-up Issue, and leave a clear reply on the PR).
3. **Audit Against Historical Review Comments After Any Reset, Rebase, or Simplification**:
   - Whenever a branch is reset, rebased, or simplified to remove over-engineering, previously applied fixes can easily be dropped.
   - After any branch rewrite, re-verify every historical review finding against the **current `HEAD` code and the diff from the target base ref or merge-base (e.g., `git diff <base-ref>...HEAD`, resolving `<base-ref>` dynamically to `main`, `origin/main`, or the PR base commit available in the checkout)**—never rely on memory of what was fixed in an earlier, discarded commit.
4. **Check Symmetric Entrypoints & Execution Paths (Core Domain Only)**:
   - When fixing a bug in core solver methods or public model APIs, systematically check symmetric entrypoints and branches (e.g., `solve()` vs. `check()`, `sat` vs. `unsat`, `<=` vs. `>=`, `HiGHS` vs. `GLPK` vs. `Z3`) so fixes are not applied to only half of a parallel code path. Do not force artificial symmetry onto asymmetric utility or demo UI code.
5. **Reproduce Verifiable Bugs with a Test on `HEAD`**:
   - For genuine functional bugs or regressions within the PR's core scope, write an automated regression test on `HEAD`.
   - Do NOT construct elaborate mock frameworks for speculative or non-reproducible reviewer scenarios.
6. **Sweep the Entire Surface Class When Fixing a Pattern Issue (Prevent Review Whack-a-Mole)**:
   - When fixing a category of issue within the PR's scope (e.g., untranslated UI text, `title` / `aria-label` / `alt` attributes, status mappings, or boundary checks), never patch only the single element or line mentioned by the user or reviewer.
   - Audit the entire affected file/surface (e.g., all elements in `index.html` and dynamic renderers) and enforce it with an **exhaustive behavioral/invariant test** (such as scanning all DOM elements for remaining untranslated text or invalid states) rather than brittle source-code substring checks (`expect(src).toContain(...)`).
7. **Pre-Screen Every Commit Against Section 4 Before Pushing**:
   - Review fixes frequently trigger secondary review rounds when test harnesses or helpers take shortcuts. Before pushing any commit, verify that the new diff introduces **zero unjustified** `any` or `as unknown as ...` assertions (Section 4.B), **zero** source-substring-only tests in place of behavioral tests (Section 4.C), and **zero** collateral changes outside the PR scope (Section 2).

