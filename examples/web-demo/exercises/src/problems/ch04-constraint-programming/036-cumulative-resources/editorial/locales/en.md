## Approach

Model each task's start time with a bounded integer `starts[i]` in `[0, horizon - durations[i]]`, enforce DAG precedences, apply a single `cumulative(tasks, input.capacity)` constraint for the shared resource pool, and minimize `max(starts[i] + durations[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \sum_{i:\, s_i \le t < s_i + d_i} q_i \le C && \forall t \in \{0, \dots, H - 1\} \\
& 0 \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Horizon-independent CP `cumulative()` vs. time-indexed MIP**: A time-indexed MIP creates $O(n \cdot H)$ binary pulse variables $x_{i,t}$ and $H$ capacity rows, which explodes for fine-grained time grids. In CP, `cumulative(tasks, capacity)` encodes the entire resource profile with just $n$ integer variables via Pumpkin's time-table propagator.
- **`disjoint` is the unit-capacity special case**: When every task has `demand = 1` and `capacity = 1`, `cumulative` reduces to `disjoint`, which additionally unlocks specialized Vilím edge-finding propagation.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  cumulative(
    starts.map((s, i) => ({
      start: s,
      duration: input.durations[i],
      demand: input.demands[i],
    })),
    input.capacity
  ),
  "resource_cap"
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
