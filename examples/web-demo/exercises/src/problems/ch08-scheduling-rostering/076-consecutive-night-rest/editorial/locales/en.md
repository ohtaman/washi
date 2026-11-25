## Approach

Define binary shift variables $x_{i,d,s} \in \{0, 1\}$ ($s \in \{0, 1, 2\}$) and daily work indicators $w_{i,d} = \sum_s x_{i,d,s} \le 1$. Enforce rolling-window consecutive-day limits over every $(K+1)$-day slice, forbid Night-to-Day adjacency $x_{i,d,2} + x_{i,d+1,0} \le 1$, cover daily demands, and minimize total shift cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{2} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & w_{i,d} = \sum_{s=0}^{2} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge r_{d,s} && \forall d, s \\
& \sum_{\tau=t}^{t+K} w_{i,\tau} \le K && \forall i, \; t \in \{0, \dots, D - K - 1\} \\
& x_{i,d,2} + x_{i,d+1,0} \le 1 && \forall i, \; d \in \{0, \dots, D - 2\} \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## Key Points

- **Rolling-window sum caps consecutive streaks cleanly**: Requiring at most $K$ workdays in every contiguous window of length $K + 1$ forbids any streak of $K + 1$ or more consecutive workdays without introducing streak-counter state variables.
- **Pairwise conflict linearizes forbidden transitions**: The constraint $x_{i,d,2} + x_{i,d+1,0} \le 1$ is tight (both variables are binary) and immediately rules out Night (2) followed by Day (0), while allowing Night $\to$ Night, Night $\to$ Evening, or Night $\to$ Off.
- **Rest-day spacing across the horizon**: Because every $(K+1)$-day sliding window requires at least one off-day, even low-cost staff must rest periodically rather than working uninterrupted stretches, forcing the optimizer to balance cost against rest placement.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

For each staff member's daily work indicators `work`, build the one-shift-per-day cap, the rolling consecutive-workday windows of length $K + 1$, and the forbidden Night-to-Day transitions. In WaSHI, generate the constraint arrays for each window and adjacent-day pair with `slice` and `map`; in PuLP, express them with loops and `pulp.lpSum`.

**WaSHI (TypeScript)**

```ts
x.forEach((staffDays) => {
  const work = staffDays.map((dayVars) => sum(dayVars));
  m.constraint(work.map((w) => expr`${w} <= 1`));
  m.constraint(
    Array.from({ length: D - K }, (_, t) => expr`${sum(work.slice(t, t + K + 1))} <= ${K}`)
  );
  m.constraint(
    staffDays.slice(0, -1).map((dayVars, d) => expr`${dayVars[2]} + ${staffDays[d + 1][0]} <= 1`)
  );
});
```

**PuLP (Python)**

```python
for i in range(num_staff):
    for d in range(num_days):
        prob += pulp.lpSum(x[i][d]) <= 1
    for t in range(num_days - max_consecutive_days):
        prob += pulp.lpSum(x[i][tau][s] for tau in range(t, t + max_consecutive_days + 1) for s in range(3)) <= max_consecutive_days
    for d in range(num_days - 1):
        prob += x[i][d][2] + x[i][d + 1][0] <= 1
```
