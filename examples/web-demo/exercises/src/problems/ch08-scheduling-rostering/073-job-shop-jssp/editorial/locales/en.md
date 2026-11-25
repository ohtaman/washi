## Approach

Create a bounded integer start-time variable $S_{j,o} \in \{0, \dots, H - d_{j,o}\}$ for every operation, enforce intra-job routing precedences $S_{j,o} + d_{j,o} \le S_{j,o+1}$, group operations sharing each machine $r \in \{0, \dots, M-1\}$ into a single Pumpkin `disjoint(...)` global constraint, and minimize `max(...)` completion time.

## Mathematical Model

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{j,o} (S_{j,o} + d_{j,o}) \\
\text{s.t.} \quad & S_{j,o} + d_{j,o} \le S_{j,o+1} && \forall j, \; o < K_j - 1 \\
& \text{disjoint}\!\left(\left\{(S_{j,o}, d_{j,o}) \mid m_{j,o} = r\right\}\right) && \forall r \in \{0, \dots, M-1\} \\
& S_{j,o} \in \{0, \dots, H - d_{j,o}\} && \forall j, o
\end{aligned}
$$

where $H = \sum_{j,o} d_{j,o}$ is the horizon, $m_{j,o}$ is the machine assigned to operation $o$ of job $j$, $K_j$ is the number of operations in job $j$, and $M$ is the number of machines.

## Key Points

- **CP `disjoint` vs. Big-M MIP**: A Big-M MIP formulation of JSSP introduces a binary variable $y_{ab}$ and two weak Big-M inequalities for every pair of operations on the same machine, producing loose LP relaxations where $S_{j,o}$ fractions allow overlapping jobs. By contrast, Pumpkin's native `disjoint` propagator performs Vilím edge-finding directly over integer time windows without quadratic pairwise Big-M rows per machine.
- **Tight horizon bounds**: Setting `ub: horizon - d` with `horizon = sum(durations)` keeps finite integer domains compact, speeding up Lazy Clause Generation (LCG) conflict learning.
- **WaSHI-only CP capability**: Because `disjoint` and `max` compile natively to Pumpkin's LCG engine, this problem uses `{ solver: "pumpkin" }` in WaSHI (TypeScript).
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Declare integer start-time variables in a model configured with the Pumpkin solver, and register non-overlap constraints in bulk by passing the list of operations assigned to each machine to `disjoint()`. Finally, minimize the `max()` of all operation completion times as the objective.

**WaSHI (TypeScript)**

```ts
const m = new Model("JobShopCP", { solver: "pumpkin" });
const starts = input.durations.map((jobDurs, j) =>
  jobDurs.map((d, o) => m.integer(`s_${j}_${o}`, { lb: 0, ub: horizon - d }))
);
Array.from({ length: numMachines }, (_, mach) => mach).forEach((mach) => {
  const ops = input.machines.flatMap((jobMachs, j) =>
    jobMachs
      .map((opMach, o) =>
        opMach === mach ? { start: starts[j][o], duration: input.durations[j][o] } : null
      )
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );
  if (ops.length >= 2) m.constraint(disjoint(ops), `machine_${mach}`);
});
const completions = starts.flatMap((jobStarts, j) =>
  jobStarts.map((s, o) => expr`${s} + ${input.durations[j][o]}`)
);
m.objective(minimize(max(completions)));
```
