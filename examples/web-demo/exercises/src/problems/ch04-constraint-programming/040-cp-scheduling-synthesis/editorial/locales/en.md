## Approach

Model each job with just two finite-domain integer variables (`starts[i]` and `modes[i]`), use Element lookup `at(...)` for mode-dependent setup and post-processing offsets, group machines with `disjoint(...)`, bound concurrent power with `cumulative(..., powerCap)`, enforce mode tables via `allowed(...)`, and minimize `max(...)` makespan.

## Mathematical Model

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} \big(s_i + d_i + \text{post}_{i, m_i}\big) \\
\text{s.t.} \quad & s_i \ge \text{setup}_{i, m_i} && \forall i \\
& s_u + d_u + \text{post}_{u, m_u} \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid \text{mach}_i = k\}\big) && \forall k \\
& \sum_{i:\, s_i \le t < s_i + d_i} p_i \le P_{\text{cap}} && \forall t \\
& (m_u, m_v) \in T_r && \forall r = (u, v, T_r) \in \mathcal{R}_{\text{mode}}
\end{aligned}
$$

## Key Points

- **CP vs. MIP comparison**: Formulating this problem in MIP requires $O(n \cdot H)$ time-indexed binary pulse variables $x_{i,t}$, mode selection binaries $z_{i,m}$, pairwise tuple indicators for every `modeRule`, and $O(H)$ capacity rows. In WaSHI + Pumpkin, the entire model stays $O(n)$ integer variables while leveraging native `disjoint` edge-finding, `cumulative` time-table filtering, `allowed` tuple tables, and `at` element propagators simultaneously.
- **Hidden idle-time synergy**: When machine contention or power limits force a job to wait before starting (`starts[i] >= 4`), choosing a slower off-machine pre-staging mode (`setup = 2` or `3`) eliminates post-processing delay (`post = 0`) for free.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.jobs.map((j, i) => expr`${starts[i]} >= at(${j.setupTimes}, ${modes[i]})`)
);
m.constraint(
  input.precedences.map(
    ([u, v]) =>
      expr`${starts[u]} + ${input.jobs[u].duration} + at(${input.jobs[u].postTimes}, ${modes[u]}) <= ${starts[v]}`
  )
);
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      input.jobs
        .map((j, i) => ({ start: starts[i], duration: j.duration, machine: j.machine }))
        .filter((t) => t.machine === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.constraint(
  cumulative(
    input.jobs.map((j, i) => ({ start: starts[i], duration: j.duration, demand: j.power })),
    input.powerCap
  )
);
m.constraint(
  input.modeRules.map((r) => allowed([modes[r.jobs[0]], modes[r.jobs[1]]], r.allowedPairs))
);
```
