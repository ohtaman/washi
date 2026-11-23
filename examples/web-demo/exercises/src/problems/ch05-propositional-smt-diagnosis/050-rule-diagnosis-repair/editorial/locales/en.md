## Approach

Run a three-stage SMT pipeline with Z3: (1) check joint satisfiability of `hardRules` and `softRules` via `m.check({ solver: "z3" })`; (2) if `"Unsat"`, shrink `res.unsatCore` to a Minimal Unsatisfiable Subset (MUS) by deletion contraction; (3) optimize soft-rule relaxation indicators `violated[k]` (`or(softExpr, viol[k] == 1)`) via `m.solve({ solver: "z3" })` to synthesize the minimum-cost repair.

## Mathematical Model

$$
\begin{aligned}
\text{Stage 1:} \quad & \text{Check } \Bigl(\bigwedge_j H_j\Bigr) \land \Bigl(\bigwedge_k S_k\Bigr) \\
\text{Stage 2 (MUS):} \quad & C \subseteq H \cup S,\quad \text{Unsat}(C) \;\land\; \forall r \in C,\, \text{Sat}(C \setminus \{r\}) \\
\text{Stage 3 (Repair):} \quad & \min \sum_{k} w_k v_k \quad \text{s.t.} \quad H_j,\; S_k \lor (v_k = 1),\; v_k \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **MUS–MCS hitting-set duality**: Every minimal unsatisfiable core $C$ must intersect any valid soft-rule repair set $R$ in at least one soft rule ($C \cap R \ne \emptyset$), explaining why minimum-weight repair naturally resolves multiple overlapping cores simultaneously.
- **Combining diagnosis (`check()`) and synthesis (`solve()`)**: `m.check({ solver: "z3" })` pinpoints the exact irreducible contradiction, whereas `m.solve({ solver: "z3" })` selects the globally cheapest soft relaxations respecting all hard invariants.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

First run `checkRulesSubset` across all rules to check consistency; if `"Sat"`, return immediately with no repair needed, and only proceed to Stage 2 MUS extraction and Stage 3 minimum-cost repair when `"Unsat"`.

**WaSHI (TypeScript)**

```ts
const initial = await checkRulesSubset(input, new Set(allIds));
if (initial.res.status === "Sat") {
  return { consistent: true, minimalCore: [], relaxedRules: [], repairCost: 0, repairedAssignment: initial.assignment };
}
// Stage 2: deletion-based contraction -> minimalCore
// Stage 3: Weighted MaxSAT via m.solve({ solver: "z3" }) -> relaxedRules & repairCost
```
