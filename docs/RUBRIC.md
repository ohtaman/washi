# WaSHI Documentation — Review Rubric

Evaluation rubric for authoring and reviewing WaSHI documentation (`docs/`).
Each item evaluates **a single criterion** with a discrete weight (`-10`, `-5`, `-1`, `+1`, `+5`, `+10`).

---

## 1. User-Goal & Clarity

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Task / goal-first explanation | Starts from what the user wants to accomplish or troubleshoot—and which API to use—rather than internal solver mechanics or theory. |
| **+10** | Clear "why" behind rules | Explains rules (e.g., naming constraints, choosing a method) in terms of user-visible behavior and benefits rather than internal terminology. |
| **+5** | Concrete example & output | Pairs abstract concepts with a minimal runnable code snippet and what it actually outputs. |
| **+5** | Explicit decision criteria | When multiple options exist (e.g., `highs` / `pumpkin` / `z3`, `binary` / `bool`), makes it clear at a glance which to choose under what condition. |
| **+1** | Brief gloss for new jargon | Briefly defines a domain or solver term in plain language (at most one sentence) on first use. |
| **-5** | Unexplained internal jargon | Uses solver-internal or academic terms (e.g., "assumption-tracked", "background domain declarations", "LCG propagator", "$L_1$ elastic slack") without plain-language explanation. |
| **-5** | Implementation-centric dump | Organizes prose around internal code or solver architecture instead of the user's modeling or debugging workflow. |
| **-10** | Non-actionable prose | Leaves the reader unable to tell what the problem is, which API to call, or what concrete action to take next. |

---

## 2. Structure & Conciseness

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Effective visual hierarchy | Uses headings, bullet lists, tables, and callouts (`[!TIP]`, `[!IMPORTANT]`) to organize distinct information rather than repeating prose. |
| **+5** | One message per sentence | Keeps sentences short with clear subject/predicate, avoiding overloaded parentheticals and nested clauses. |
| **+5** | Failure & edge-case coverage | Covers non-happy-path behavior such as `Infeasible` / `Unsat`, unsupported features, and unit-scaling pitfalls. |
| **-1** | Formulaic AI filler | Includes empty motivational intros or hollow buzzwords (e.g., "In real-world practice...", "seamlessly", "robust"). |
| **-1** | Overstuffed tables or bullets | Packs long sentences, formulas, or exception clauses into single table cells or list items, hurting scannability. |
| **-5** | Redundant repetition (bloat) | Repeats the same comparison, caveat, or explanation across prose, code comments, tables, and callouts. |

---

## 3. Prose & Localization

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+5** | Natural target-language prose | Reads naturally in the target language (`en`, `ja`, `zh`) with idiomatic phrasing and word order rather than literal translation. |
| **+1** | Backticks for identifiers | Wraps API names, option keys, variable/type names, and status strings in inline backticks (`` `...` ``). |
| **-1** | Terminology inconsistency | Uses inconsistent translations or terms for the same concept within a page or across the docs (e.g., mixing multiple terms for `unsatCore`). |
| **-5** | Awkward literal translationese | Contains stiff, unnatural, or incomprehensible literal translations (e.g., 「仮定追跡付きの競合抽出」「前提ドメインとして扱われます」「トランザクション的に一括登録」). |

---

## 4. Accuracy, Edge Cases & Consistency

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+5** | Runnable code snippets | Code examples match the current API and include all required `import` statements. |
| **-5** | Missing preconditions | States a capability or recommendation without its required preconditions (e.g., bounded integers only, `COOP`/`COEP` headers required). |
| **-5** | Locale / `llms.txt` sync drift | Semantic content or API details diverge across `en`, `ja`, `zh`, or `llms.txt` / `llms-full.txt`. |
| **-10** | API hallucination or inaccuracy | Documents non-existent methods, options, return fields, or incorrect solver behavior as fact. |
