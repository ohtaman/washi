## Approach

Run a three-stage SMT pipeline with Z3: (1) check joint satisfiability of `hardRules` and `softRules` via `m.check({ solver: "z3" })`; (2) if `"Unsat"`, shrink `res.unsatCore` to a Minimal Unsatisfiable Subset (MUS) by deletion contraction; (3) optimize soft-rule relaxation indicators `violated[k]` ($S_k \lor (v_k = 1)$ and $S_k \implies (v_k = 0)$) via `optModel.solve({ solver: "z3" })` to synthesize the minimum-cost repair.

## Mathematical Model

$$
\begin{aligned}
\text{Stage 1:} \quad & \text{Check } \Bigl(\bigwedge_j H_j\Bigr) \land \Bigl(\bigwedge_k S_k\Bigr) \\
\text{Stage 2 (MUS):} \quad & C \subseteq H \cup S,\quad \text{Unsat}(C) \;\land\; \forall r \in C,\, \text{Sat}(C \setminus \{r\}) \\
\text{Stage 3 (Repair):} \quad & \min \sum_{k} w_k v_k \quad \text{s.t.} \quad H_j,\; S_k \lor (v_k = 1),\; S_k \implies (v_k = 0),\; v_k \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **MUS–MCS hitting-set duality**: Every minimal unsatisfiable core $C$ must intersect any valid soft-rule repair set $R$ in at least one soft rule ($C \cap R \ne \emptyset$), explaining why minimum-weight repair naturally resolves multiple overlapping cores simultaneously.
- **Combining diagnosis (`check()`) and synthesis (`solve()`)**: `m.check({ solver: "z3" })` pinpoints the exact irreducible contradiction, whereas `optModel.solve({ solver: "z3" })` selects the globally cheapest soft relaxations respecting all hard invariants.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Run `checkRulesSubset` across all rules first (Stage 1); when `"Unsat"`, contract `initial.res.unsatCore` by deletion to obtain `core` (Stage 2), then build a Weighted MaxSAT model `optModel` pairing each soft rule with `violated[k]` via `or`/`implies` and minimize `dot(weights, violated)` with Z3 (Stage 3).

**WaSHI (TypeScript)**

```ts
const initial = await checkRulesSubset(input, new Set(allIds));
if (initial.res.status === "Sat") {
  return { consistent: true, minimalCore: [], relaxedRules: [], repairCost: 0, repairedAssignment: initial.assignment };
}

// Stage 2: deletion-based MUS contraction starting from Z3's unsatCore
let core = Array.from(new Set(initial.res.unsatCore ?? allIds));
for (const ruleId of [...core]) {
  if (!core.includes(ruleId)) continue;
  const candidate = core.filter((id) => id !== ruleId);
  const sub = await checkRulesSubset(input, new Set(candidate));
  if (sub.res.status === "Unsat") {
    const subCore = sub.res.unsatCore;
    core = subCore?.length ? candidate.filter((id) => new Set(subCore).has(id)) : candidate;
  }
}

// Stage 3: Weighted MaxSAT repair via optModel.solve({ solver: "z3" })
const optModel = new Model("PolicyRepair");
const bools = optModel.bool(input.boolVars);
const ints: Record<string, Var> = {};
for (const spec of input.intVars) {
  ints[spec.name] = optModel.integer(spec.name, { lb: spec.lb, ub: spec.ub });
}
for (const h of input.hardRules) {
  optModel.constraint(compileSmt(h.expr, bools, ints), h.id);
}
const violated = optModel.binary(input.softRules.length, { prefix: "viol" });
const weights = input.softRules.map((s) => s.weight);
input.softRules.forEach((s, k) => {
  const cond = compileSmt(s.expr, bools, ints);
  optModel.constraint(or(cond, expr`${violated[k]} == 1`), `relax_${s.id}`);
  optModel.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
});
if (violated.length > 0) {
  optModel.objective(minimize(dot(weights, violated)));
}
await optModel.solve({ solver: "z3" });
```
