## Approach

Maintain the accumulated policy formula $P_{<i}$ formed from `baseRules` and all preceding rules $R_0, \dots, R_{i-1}$. For each rule $R_i = (c_i \implies e_i)$ in order, run two Z3 checks: if $P_{<i} \land c_i$ is `"Unsat"`, classify $R_i$ as **dead**; otherwise check $P_{<i} \land c_i \land \neg e_i$, and if `"Unsat"`, classify $R_i$ as **redundant**, then append $c_i \implies e_i$ to form $P_{<i+1}$.

## Mathematical Model

$$
\begin{aligned}
P_{<i} &= \biggl(\bigwedge_{b \in \text{baseRules}} b\biggr) \;\land\; \biggl(\bigwedge_{j < i} (c_j \implies e_j)\biggr) \\
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## Key Points

- **Separating dead vs. redundant rules**: Because $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$, any dead rule ($P_{<i} \land c_i$ is Unsat) also makes $P_{<i} \land c_i \land \neg e_i$ Unsat by vacuity; checking deadness first ensures dead rules are not mislabeled as redundant.
- **Sequential policy accumulation**: Checking each rule against `baseRules` plus preceding rules in $P_{<i}$ detects triggers blocked by earlier implications and transitive redundancies cleanly.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

Build a small `isSat` helper that compiles a list of `PropFormula` nodes into a fresh WaSHI `Model` and queries Z3. While maintaining the accumulated constraints `prior`, check each rule in order for deadness and redundancy, then append `{ implies: [r.condition, r.effect] }` to `prior` for subsequent rules.

**WaSHI (TypeScript)**

```ts
async function isSat(vars: string[], formulas: PropFormula[]): Promise<boolean> {
  const m = new Model("RuleAudit");
  const bools = m.bool(vars);
  formulas.forEach((f, i) => m.constraint(compileFormula(f, bools), `f_${i}`));
  return (await m.check({ solver: "z3" })).status === "Sat";
}

for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
