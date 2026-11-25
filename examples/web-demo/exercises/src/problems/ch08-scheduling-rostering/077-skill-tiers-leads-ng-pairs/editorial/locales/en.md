## Approach

Use binary shift-assignment variables $x_{i,d,s} \in \{0, 1\}$, enforce at most one shift per staff-day, add linear covering constraints for total headcount, senior leads, and each certified skill on every active $(d, s)$, forbid co-assignment of incompatible pairs via $x_{a,d,s} + x_{b,d,s} \le 1$, and minimize total shift cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & \sum_{s=0}^{S-1} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge r_{d,s}, \quad \sum_{i=0}^{N-1} L_i x_{i,d,s} \ge 1 && \forall (d, s) : r_{d,s} > 0 \\
& \sum_{i=0}^{N-1} A_{i,k} x_{i,d,s} \ge R_{s,k} && \forall (d, s) : r_{d,s} > 0, \; \forall k \\
& x_{a,d,s} + x_{b,d,s} \le 1 && \forall (a, b) \in \text{NG}, \; \forall d, s \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## Key Points

- **Multi-attribute covering over the same binary decision column**: Once $x_{i,d,s}$ is declared, headcount, senior-lead status ($L_i$), and multi-skill coverage ($A_{i,k}$) are all linear dot products over the exact same column vector `[x[0][d][s], ..., x[N-1][d][s]]`.
- **Cross-skilled staff reduce team size, while NG pairs restrict pairings**: A cross-skilled worker can simultaneously cover multiple skill requirements, unless an incompatible pair constraint blocks them from pairing with the cheapest senior lead.
- **Avoid coupling distinct shift types in NG checks**: $x_{a,d,s} + x_{b,d,s} \le 1$ is indexed per `(d, s)` shift so incompatible staff may still work *different* shifts on the same day.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

For each active `(d, s)` slot's staff assignment column `col`, impose dot-product constraints for total headcount, senior leads, and per-skill requirements, then add same-slot exclusion constraints for all incompatible pairs. In WaSHI, build the constraint arrays with `forEach` and `flatMap`; in PuLP, express them with loops and `pulp.lpDot`.

**WaSHI (TypeScript)**

```ts
input.demands.forEach((dayDemands, d) => {
  dayDemands.forEach((req, s) => {
    if (req <= 0) return;
    const col = x.map((staff) => staff[d][s]);
    m.constraint([
      expr`${sum(col)} >= ${req}`,
      expr`dot(${input.isSenior}, ${col}) >= 1`,
    ]);
    input.skillDemands[s].forEach((skillReq, k) => {
      if (skillReq <= 0) return;
      const coeffs = input.staffSkills.map((sk) => sk[k]);
      m.constraint(expr`dot(${coeffs}, ${col}) >= ${skillReq}`);
    });
  });
});
m.constraint(
  input.ngPairs.flatMap(([a, b]) =>
    input.demands.flatMap((dayDemands, d) =>
      dayDemands.map((_, s) => expr`${x[a][d][s]} + ${x[b][d][s]} <= 1`)
    )
  )
);
```

**PuLP (Python)**

```python
for d in range(num_days):
    for s in range(num_shifts):
        if demands[d][s] <= 0:
            continue
        col = [x[i][d][s] for i in range(num_staff)]
        prob += pulp.lpSum(col) >= demands[d][s]
        prob += pulp.lpDot(is_senior, col) >= 1
        for k in range(num_skills):
            if skill_demands[s][k] > 0:
                prob += pulp.lpSum(staff_skills[i][k] * x[i][d][s] for i in range(num_staff)) >= skill_demands[s][k]
for a, b in ng_pairs:
    for d in range(num_days):
        for s in range(num_shifts):
            prob += x[a][d][s] + x[b][d][s] <= 1
```
