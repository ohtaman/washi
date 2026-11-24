# Optimization 100 Exercises — Review Rubric

Evaluation rubric for reviewing and authoring Optimization 100 exercises (`examples/web-demo/exercises/`).
Each item evaluates **a single criterion** with a discrete weight (`-10`, `-5`, `-1`, `+1`, `+5`, `+10`).

---

## 1. Title & Scenario (`locales/*.md`)

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+10** | Concrete domain nouns | Uses concrete, vivid domain nouns or concrete examples (e.g., gelato, milk, power bank, camera) rather than generic placeholders alone (e.g., "product", "resource", "factory", "item"). |
| **+10** | Standalone context | Self-contained without referencing or comparing against other problem numbers (e.g., "In #001..."). |
| **+5** | Clear scenario setting | Clearly states who is making the decision and for what purpose. |
| **+5** | Prerequisites stated | States all prerequisites needed to solve the problem (e.g., variable number of item types or resources determined by input data), regardless of whether the editorial mentions them. |
| **+1** | Explicit units | Explicitly specifies the units of quantities (e.g., pieces, loaves, liters, kg). |
| **+1** | Verbalized title operators | Uses natural words (e.g., "Upper Bounds & Maximization") in titles instead of raw math operators (`<=`, `>=`). |
| **+1** | Natural title phrasing | Uses natural phrasing rather than stiff or literal translations. |
| **+1** | Backticks for identifiers | Wraps I/O field names, function names, and type names in inline backticks. |
| **-1** | Backticks for numbers | Wraps plain numeric constants in inline backticks. |
| **-1** | Unnatural or redundant wording | Contains awkward, redundant, stiff literal translations, or unnecessary modifiers (e.g., "row/column sum" shorthand, "priority tier", "instance-derived", "minimize directly", or awkward parallel clauses like "decide X-ka-to, Y-ka-wo"). |
| **-1** | Over-bolding obvious facts | Boldfaces self-evident domain facts in scenarios (e.g., bolding "nothing can be produced on a closed line") instead of reserving boldface for key objectives or non-obvious constraints. |
| **-1** | Empty AI buzzwords | Uses hollow filler modifiers that add no concrete information (e.g., "predetermined", "seamlessly", "robust", "efficiently"). |
| **-5** | Formulaic framing or contrast | Includes generic motivational intros/outros (e.g., "In real-world practice...") or dramatic "not just X, but Y" contrast clichés. |
| **-5** | Generic placeholders only | Relies solely on abstract nouns ("factory", "product", "resource", "machine", "job") without concrete domain nouns or examples. |
| **-5** | Formulas/code in scenario | Embeds explicit algebraic formulas or code recipes (e.g., `weights[i] * c`, `<=`) inside `section:scenario`. |
| **-5** | Unexplained new jargon | Uses an advanced technical term for the first time in a problem or hint (e.g., "epigraph reformulation" in `#021`) without briefly explaining what it means. |
| **-5** | Misleading false contrast | Uses phrasing that implies a false contrast or non-existent alternative (e.g., "nonlinear `max` operator" implying a linear `max` exists). |
| **-5** | Inverted assignment phrasing | Reverses or obscures what is assigned to what (e.g., "make the upper bound the compatibility flag" instead of "use the compatibility flag as the upper bound"). |
| **-5** | Terminology inconsistency | Uses inconsistent terms for the same entity across scenario, I/O table, and examples (e.g., mixing "soybeans" and "beans", or "product" and "flavor"). |
| **-5** | Unit inconsistency | Mixes different unit notations across the scenario, I/O table, and editorial (e.g., mixing "liter" and "unit"). |
| **-5** | Misplaced variable modifiers | Attaches variable properties (e.g., "non-negative continuous") to physical objects rather than the decision quantities (e.g., "blending amounts"). |
| **-5** | Physical/domain contradiction | Combines concrete objects and attributes in a physically unrealistic way (e.g., assigning alloy composition percentages to pure elemental metals without clarifying they are alloy ingots). |
| **-5** | Algorithm / terminology conflation | Equates or conflates distinct algorithms/concepts in titles, subtitles, tags, or chapter descriptions (e.g., labeling Fix-and-Optimize as "Large Neighborhood Search (Fix-and-Optimize)"), or mistranslates OR terms across locales (e.g., translating "2-matching" as "2次マッチング" instead of "2-マッチング"). |
| **-10** | Defect spoiler | Reveals which variable or constraint is broken in starter-fix exercises (excluding intentional onboarding guidance such as `#001`). |

---

## 2. Input / Output & Example (`section:io`, `section:example`)

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+5** | Objective calculation check | Includes an explicit arithmetic formula showing how the example output yields the objective value. |
| **+1** | Data-first field descriptions | Describes input fields by their real-world data meaning (e.g., "available stock", "maximum count on hand") rather than modeling roles (e.g., "upper-bound constraint"). |
| **-10** | Optimality claims in examples | Claims or explains optimality (e.g., "achieves the minimum/maximum") inside `section:example`. |

---

## 3. Editorial (`editorial/locales/*.md`)

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **+5** | Math-first approach | Describes the mathematical model structure (variables, constraints, objective) first in Approach, optionally followed by how it maps to WaSHI / PuLP. |
| **+5** | Explicit example assumptions | When using concrete numbers to explain behavior or pitfalls, explicitly states which input example they come from (omitted when a simple qualitative reason suffices). |
| **+5** | Generalizable intuition | Explains insights using generalizable ratios or structural properties rather than numbers tied to a single test case. |
| **+5** | Accurate terminology | Defines technical terms (e.g., LP vs. MILP/MIP) accurately without omitting key conditions. |
| **+5** | Explain modeling intent | Explains what mathematical expressions mean conceptually (e.g., noting that summing binary variables to `1` enforces "exactly one is chosen") rather than only stating the algebraic operation. |
| **+5** | Pre-code lead-in | Provides a 1–2 sentence lead-in immediately before the code blocks in Key Implementation explaining the APIs or design intent. |
| **+1** | Bold key concepts | Boldfaces the most important concepts or terms for that specific exercise (rather than uniformly bolding "maximize"/"minimize"). |
| **+1** | Natural approach prose | Uses plain, natural prose rather than stiff formula-reading phrasing. |
| **+1** | Unobtrusive parentheticals | Places secondary notes (e.g., "(no solver is used)") at the end or in parentheses so they do not interrupt the main sentence. |
| **-5** | Non-idiomatic WaSHI loop | Uses imperative C-style `for (let i = 0; ...)` loops in WaSHI editorial snippets where `.map()` / `.flatMap()` applies. |
| **-10** | Misleading generalizations | States sweeping mathematical claims without required preconditions (e.g., claiming optimal LP solutions always occur at a vertex without boundedness/non-degeneracy context). |
| **-10** | Incorrect library behavior | Misstates WaSHI or PuLP behavior (e.g., claiming WaSHI requires `Math.round()` on `Integer`/`Binary` variables when WaSHI normalizes them automatically). |

---

## 4. Code & Consistency

| Weight | Criterion | Evaluation Standard |
| :---: | --- | --- |
| **-5** | Python `snake_case` convention | Uses `camelCase` instead of `snake_case` for Python `solve()` parameters, returned dict keys, or Python snippets in editorials. |
| **-10** | Signature mismatch | Problem statement, `starter`/`solution` code, and editorial snippets disagree on function arguments or return structure. |

*(Note: When synchronizing across locales, add `-5` for **Locale sync omission** when semantic updates are missing in `en.md` or `zh.md`.)*
