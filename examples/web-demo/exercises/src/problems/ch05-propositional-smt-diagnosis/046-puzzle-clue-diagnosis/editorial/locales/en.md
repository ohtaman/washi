## Approach

Represent each cell $c$ by a binary indicator $x_c \in \{0, 1\}$ (mine vs. safe) and encode each clue in $R$ as a named constraint. We seek a subset-minimal conflicting subset $C \subseteq R$ that is unsatisfiable while every proper subset $C \setminus \{r\}$ is satisfiable. First check all clues with `await m.check({ solver: "z3" })` to seed the candidate set from `res.unsatCore`, then run deletion-based contraction—testing each clue ID in turn and dropping it whenever the remaining subset stays `"Unsat"`—to isolate an irreducible Minimal Unsatisfiable Subset (MUS).

## Mathematical Model

$$
\begin{aligned}
& x \in \{0, 1\}^{|\text{cells}|}, \quad R = \text{clues} \\
C \subseteq R \text{ is a MUS} &\iff \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## Key Points

- **Why raw `unsatCore` is not always minimal**: Assumption-tracked SMT cores (populated by WaSHI from named constraints) prune unrelated clues quickly but may retain redundant clues inside overlapping conflicts; deletion-based contraction guarantees subset-minimality.
- **Monotonicity of satisfiability**: Once $C \setminus \{r\}$ is shown `"Sat"`, any smaller subset $C' \setminus \{r\}$ obtained in later contractions remains `"Sat"`, so a single pass over the candidate list suffices.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Build a `checkSubset` helper that declares binary variables with `m.binary(input.cells)`, registers each active clue as a named constraint (`clue.id`), and checks satisfiability with Z3. Initialize `core` from the initial `unsatCore`, then remove one clue ID at a time and shrink `core` whenever the subset remains `"Unsat"`.

**WaSHI (TypeScript)**

```ts
async function checkSubset(input: P046Input, activeIds: string[]): Promise<CheckResult> {
  const m = new Model("PuzzleClueDiagnosis");
  const x = m.binary(input.cells);
  const active = new Set(activeIds);
  for (const clue of input.clues) {
    if (active.has(clue.id)) addClueConstraint(m, clue, x); // m.constraint(..., clue.id)
  }
  return m.check({ solver: "z3" });
}

const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    const nextCore = res.unsatCore?.length ? new Set(res.unsatCore) : null;
    core = nextCore ? candidate.filter((id) => nextCore.has(id)) : candidate;
  }
}
```
