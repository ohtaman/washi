## Approach

Check the full named clue set with `await m.check({ solver: "z3" })` to obtain an initial unsatisfiable core `res.unsatCore`, then iterate through each clue ID in the candidate core, checking whether removing it leaves the remaining subset `"Unsat"`. Dropping any unnecessary clue yields an irreducible Minimal Unsatisfiable Subset (MUS).

## Mathematical Model

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## Key Points

- **Why raw `unsatCore` is not always minimal**: Assumption-tracked SMT cores (`assertAndTrack`) prune unrelated clues quickly but may retain redundant clues inside overlapping conflicts; deletion-based contraction guarantees subset-minimality.
- **Monotonicity of satisfiability**: Once $C \setminus \{r\}$ is shown `"Sat"`, any smaller subset $C' \setminus \{r\}$ obtained in later contractions remains `"Sat"`, so a single pass over the candidate list suffices.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Initialize `core` from the initial `unsatCore`, then re-run `checkSubset` after removing one clue ID at a time and shrink `core` whenever the subset remains `"Unsat"`.

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
