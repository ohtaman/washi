## Approach

Assign one finite-domain integer start variable $S_i \in [0, H - d_i]$ to each task, enforce every DAG precedence edge $S_u + d_u \le S_v$, express each renewable resource pool via Pumpkin's `cumulative(tasks, capacity)` global constraint, and minimize `max(...)` completion time.

## Mathematical Model

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (S_i + d_i) \\
\text{s.t.} \quad & S_u + d_u \le S_v && \forall (u, v) \in E \\
& \text{cumulative}\!\left(\left\{(S_i, d_i, q_{r,i}) \mid q_{r,i} > 0\right\},\, C_r\right) && \forall r \\
& S_i \in \{0, \dots, H - d_i\} && \forall i
\end{aligned}
$$

## Key Points

- **Horizon-independent CP `cumulative` vs. time-indexed MIP**: A time-indexed MIP creates $O(n \cdot H)$ binary variables $x_{i,t}$ and capacity rows for every time instant $t \in [0, H)$, which grows linearly with the horizon $H$ (and rapidly as durations or task counts scale). Pumpkin's `cumulative` constraint uses only $n$ integer start variables regardless of $H$ and applies time-table filtering.
- **Resource contention shifts the critical path**: In the example, the unconstrained DAG critical path is only $8$, yet limited resource capacity ($C_0 = 3$) forces task 2 and task 1 to run sequentially, raising makespan to $12$.
- **Filter zero-demand tasks cleanly**: Passing only tasks with `demand > 0` keeps each `cumulative(...)` propagator compact when multiple resource pools are sparse.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Declare integer start-time variables with the Pumpkin solver, then register the DAG precedence constraints and per-resource `cumulative()` constraints. Filtering to only tasks with positive demand keeps each resource constraint concise.

**WaSHI (TypeScript)**

```ts
const m = new Model("RcpspProjectCP", { solver: "pumpkin" });
const starts = input.durations.map((d, i) =>
  m.integer(`s_${i}`, { lb: 0, ub: horizon - d })
);
m.constraint(
  input.precedences.map(([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`)
);
input.capacities.forEach((cap, r) => {
  const tasks = input.durations
    .map((duration, i) => ({ start: starts[i], duration, demand: input.demands[r][i] }))
    .filter((task) => task.demand > 0);
  if (tasks.length > 0) m.constraint(cumulative(tasks, cap), `resource_${r}`);
});
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
