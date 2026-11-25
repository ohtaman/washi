# WaSHI Documentation — Review Rubric

Evaluation rubric for authoring and reviewing WaSHI documentation (`docs/`).
Each item evaluates **a single criterion** with a discrete weight (`-10`, `-5`, `-1`, `+1`, `+5`, `+10`).

The rubric has two tiers:
1. **Part I (Common Rubric — 4 Axes)**: Applied to every page. Each axis operates at its own level of abstraction and is scored separately so strengths in one axis do not mask defects in another.
2. **Part II (Page-Type Rubric — 3 Types)**: Apply the single section matching the page's role (`Type A`, `Type B`, or `Type C`).

Prioritize improvements by **negative (defect) score first** (especially in Readability, Comprehension, Anti-AI-Slop, and Accuracy), then by **total score within the same page type**.

---

## Part I. Common Rubric (All Pages — 4 Axes)

### Axis 1. Readability & Scannability
*Abstraction level: **Low (concrete, mechanically observable prose & visual craft)***

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Effective visual hierarchy | Headings, tables, lists, and callouts (`[!TIP]`, `[!IMPORTANT]`) organize distinct information rather than repeating prose. |
| **+5** | Concise, scannable sentences | Sentences stay short (guide: <= ~100 Japanese chars / <= ~35 English words) with at most 1 parenthetical per sentence, readable without re-parsing. |
| **+5** | Natural target-language prose | Phrasing and word order read naturally in the target language (`en`, `ja`, `zh`). |
| **+1** | Backticks for identifiers | API names, option keys, variable/type names, and status strings are consistently and validly wrapped in inline backticks (`` `...` ``). |
| **-1** | Over-bolding or heavy compound-noun walls | Uses 3+ bold spans inside a single sentence, or stacks heavy abstract compound nouns back-to-back. |
| **-1** | Terminology inconsistency or non-standard naming | Mixes multiple terms for the same concept or deviates from established domain naming conventions (e.g., non-standard okurigana for assignment problems or mistranslated binary variables in Japanese OR). |
| **-5** | Overloaded sentence | Any prose sentence exceeds ~100 Japanese chars (~35 English words), or packs 2+ parentheticals or 3+ chained clauses that force re-reading. *(Disqualifies `+5 Concise, scannable sentences`.)* |
| **-5** | Wall-of-text bullet | Any single bullet item spans multiple dense sentences or exceeds ~120 Japanese chars (~45 English words); should be broken into paragraphs or subheadings. |

---

### Axis 2. Comprehension & Pedagogy
*Abstraction level: **High (first-time reader understanding & causal clarity)***

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Logical flow on first read | A first-time reader can follow why each rule or API works as described without unstated causal leaps. |
| **+5** | Standard domain terms defined & used | Keeps established OR/CP/SMT terminology (e.g., global constraints, Restricted Master Problem, dual/shadow price) and briefly defines it on first use instead of avoiding it. |
| **-5** | Omitted explanation or avoided domain terms | Strips standard domain terminology or necessary conceptual/API contract explanations in the name of brevity, leaving readers unable to grasp the general mechanism or API usage. |
| **-5** | Undefined abbreviations or compressed shortcuts | Uses undefined acronyms/terms (e.g., `HIL`, `LCG`, open-world assumption) or telegraphic compressed math derivations that force the reader to do mental arithmetic to parse a bullet. |
| **-10** | Logical leap or non-actionable prose | Skips a causal bridge so a reader cannot understand *why* something happens or *what action to take next* without already knowing WaSHI internals. *(Disqualifies `+10 Logical flow on first read`.)* |

---

### Axis 3. Anti-AI-Slop
*Abstraction level: **Mid-to-Low (penalty-only detection of AI-generated writing anti-patterns)***

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **-1** | Formulaic AI filler | Includes empty motivational intros ("In real-world practice...") or hollow buzzwords ("seamlessly", "robust"). |
| **-5** | Off-topic feature-pitch noise | Injects unrelated infrastructure or cross-solver sales pitches (e.g., repeatedly advertising zero-`COOP`/`COEP` inside a scheduling or security modeling walkthrough) that interrupt the topic's flow. |
| **-5** | Unexplained solver-internal jargon in main reading path | Leaks internal solver implementation terms (e.g., `assertAndTrack`, `Vilim edge-finding`, `time-table filtering`, `L1 elastic slack`) into the intro, core usage, or key callouts without plain-language explanation. *(Optional Architecture sections at the end of solver references are exempt.)* |
| **-5** | Literal translationese or redundant bloat | Contains stiff literal calques (e.g., "assumption-tracked", "background domain declarations", "register transactionally") or repeats the same comparison/caveat across prose, tables, and callouts. |

---

### Axis 4. Accuracy & Contract Integrity
*Abstraction level: **Strict (objective verification against code, math, and solver execution)***

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+5** | Verified, runnable code & accurate numbers | Code snippets match the current API with required imports, and stated outputs/math match actual solver runs. |
| **-5** | Missing preconditions, failure behavior, or sync drift | Omits throwing options, finite-bound requirements, `Secure Context` / `COOP`/`COEP` preconditions, or diverges semantically across `en` / `ja` / `zh` / `llms.txt`. |
| **-10** | API, code, or mathematical inaccuracy | Documents wrong optimal values or reduced costs, broken syntax/missing imports, misattributed API properties (e.g., variable `dual`/`slack`), or logically false prose explanations (e.g., attributing sequential dependency to a crew cap). *(Disqualifies `+5 Verified, runnable code & accurate numbers`.)* |

---

## Part II. Page-Type Rubrics (Apply Matching Type Only)

### Type A. Guides & Solver References
*Applies to `guide/`, `getting-started/`, and `solvers/` (excluding `solvers/index.md`). Max bonus: `+15`.*

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | General principle before concrete examples | Explains the general concept, model structure, or API contract first, then illustrates it with a concrete example. |
| **+5** | Explicit decision criteria | When multiple options exist (e.g., solvers or APIs), makes it clear at a glance which to choose under what condition. |
| **-5** | Sudden example replacing general theory | Jumps straight into a narrow domain example (e.g., time-indexed task or cutting stock) to explain a general concept without stating the general rule first. *(Disqualifies `+10 General principle before concrete examples`.)* |

### Type B. Runnable Examples
*Applies to `examples/` (excluding `examples/index.md`). Max bonus: `+15`.*

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Clear scenario -> model -> code mapping | Clearly connects the concrete problem scenario, mathematical formulation (or rule list), and WaSHI implementation. |
| **+5** | Result interpretation & practical takeaways | Concisely explains how to interpret the resulting solution and highlights key modeling takeaways. |
| **-5** | Code dump without explanation | Presents code without explaining why those APIs/formulations were chosen or how to interpret the result. *(Disqualifies `+5 Result interpretation & practical takeaways`.)* |

### Type C. Index, Landing & Showcase Pages
*Applies to `index.md` and `*/index.md`. Max bonus: `+10`.*

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Goal-oriented navigation | Makes it obvious at a glance where to go next based on what the reader wants to build or learn. |
| **-5** | Missing or inconsistent index metadata | Omits critical preconditions in overview comparison tables (e.g., browser `COOP`/`COEP` requirements) or uses conflicting link labels for the same target page. |
