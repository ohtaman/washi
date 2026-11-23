## Approach

Maintain the accumulated policy formula $P$ initialized to `baseRules`. For each rule $R_i = (c_i \implies e_i)$ in order, run two Z3 checks: if $P \land c_i$ is `"Unsat"`, classify $R_i$ as **dead**; otherwise check $P \land c_i \land \neg e_i$, and if `"Unsat"`, classify $R_i$ as **redundant**, then append $c_i \implies e_i$ to $P$.

## Mathematical Model

$$
\begin{aligned}
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## Key Points

- **Separating dead vs. redundant rules**: Because $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$, any dead rule ($P \land c_i$ is Unsat) also makes $P \land c_i \land \neg e_i$ Unsat by vacuity; checking deadness first ensures dead rules are not mislabeled as redundant.
- **Sequential policy accumulation**: Checking each rule against `baseRules` plus preceding rules detects triggers blocked by earlier implications and transitive redundancies cleanly.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

While maintaining the accumulated constraints `prior`, check each rule in order: test satisfiability of its condition to detect dead rules, and test satisfiability with the negated effect to detect redundant rules, then append it to `prior` in `implies` form for subsequent rules.

**WaSHI (TypeScript)**

```ts
for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
