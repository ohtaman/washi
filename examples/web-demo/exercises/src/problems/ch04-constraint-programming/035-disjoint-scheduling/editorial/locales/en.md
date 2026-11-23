## Approach

Give each task a bounded integer variable `starts[i]` in `[releaseTimes[i], horizon - durations[i]]`, add precedence inequalities, group tasks by machine into `disjoint(tasks)` constraints, and minimize `max(starts[i] + durations[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid m_i = k\}\big) && \forall k \in \{0, \dots, M-1\} \\
& r_i \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Edge-finding vs. Big-M pairwise binaries**: Instead of $\binom{n_k}{2}$ Big-M binary disjunctions per machine, `disjoint(tasks)` maps to Pumpkin's `disjunctive_strict` propagator (Vilím edge-finding), tightening earliest/latest start windows across all tasks on a machine simultaneously.
- **Tight finite horizon**: Setting `horizon = max(releaseTimes) + sum(durations)` gives a provably valid finite upper bound for Pumpkin's integer domain without arbitrary large constants.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Extract the `{ start, duration }` task list assigned to each tool, register `disjoint(...)` constraints across all tools in bulk, and minimize the maximum completion time across all steps.

**WaSHI (TypeScript)**

```ts
const numMachines = Math.max(...input.machines) + 1;
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      starts
        .map((s, i) => ({ start: s, duration: input.durations[i], mach: input.machines[i] }))
        .filter((t) => t.mach === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
