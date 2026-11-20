## Approach

Check the full named rule set with `await m.check({ solver: "z3" })` to obtain an initial unsatisfiable core `res.unsatCore`, then iterate through each rule in the candidate core, checking whether removing it leaves the remaining subset `"Unsat"`. Dropping any unnecessary rule produces an irreducible Minimal Unsatisfiable Subset (MUS).

## Mathematical Model

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## Key Points

- **Why raw `unsatCore` is not always minimal**: Assumption-tracked SMT cores (`assertAndTrack`) prune unrelated constraints quickly but may retain extra redundant constraints inside an overlapping conflict; deletion contraction guarantees subset-minimality.
- **Monotonicity of satisfiability**: Once $C \setminus \{r\}$ is shown `"Sat"`, any smaller subset $C' \setminus \{r\}$ obtained in later contractions remains `"Sat"`, so one pass over the candidate list suffices.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const ruleId of [...core]) {
  if (!core.includes(ruleId)) continue;
  const candidate = core.filter((id) => id !== ruleId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
