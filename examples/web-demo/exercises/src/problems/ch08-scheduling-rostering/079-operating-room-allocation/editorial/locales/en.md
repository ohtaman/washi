## Approach

Introduce binary case-assignment variables $x_{c,r,s} \in \{0, 1\}$ (forced zero for incompatible rooms) and continuous bounded overtime variables $o_{r,s} \in [0, O_{\max}]$. Allow each case to be scheduled at most once, cap every block's surgical load by $B + o_{r,s}$, and maximize total priority reward minus overtime penalty.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} p_c x_{c,r,s} - c_{\text{ot}} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} o_{r,s} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} x_{c,r,s} \le 1 && \forall c \\
& \sum_{s=0}^{S-1} x_{c,r,s} = 0 && \forall c, r : \text{compat}_{c,r} = 0 \\
& \sum_{c=0}^{C-1} d_c x_{c,r,s} \le B + o_{r,s} && \forall r, s \\
& 0 \le o_{r,s} \le O_{\max} && \forall r, s \\
& x_{c,r,s} \in \{0, 1\} && \forall c, r, s
\end{aligned}
$$

## Key Points

- **Optional admission (`<= 1`) turns overtime into a cost-benefit trade-off**: Because not all cases must be scheduled, a surgery is admitted into overtime only when its priority gain $p_c$ outweighs the overtime charge $c_{\text{ot}} \cdot \Delta o$—which is why case 4 ($p_4 = 20$) is deferred in the example when overtime costs $25$ per unit.
- **Elastic capacity via continuous slack $o_{r,s}$**: Replacing a hard capacity $B$ with $B + o_{r,s}$ ($0 \le o_{r,s} \le O_{\max}$) models piecewise-linear block expansion without extra binary variables.
- **Room compatibility masks prevent cross-specialty conflicts**: Zeroing out incompatible `(c, r)` entries shrinks the branch-and-bound tree and enforces specialized equipment rules.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
x.forEach((caseRooms, c) => {
  m.constraint(expr`${sum(caseRooms.flat())} <= 1`);
  caseRooms.forEach((roomSessions, r) => {
    if (input.compatible[c][r] === 0) m.constraint(expr`${sum(roomSessions)} == 0`);
  });
});
for (let r = 0; r < R; r++) {
  for (let s = 0; s < S; s++) {
    const load = sum(x.map((caseRooms, c) => expr`${input.durations[c]} * ${caseRooms[r][s]}`));
    m.constraint(expr`${load} <= ${input.regularCapacity} + ${overtime[r][s]}`);
  }
}
```

**PuLP (Python)**

```python
for c in range(num_cases):
    prob += pulp.lpSum(x[c][r][s] for r in range(num_rooms) for s in range(num_sessions)) <= 1
    for r in range(num_rooms):
        if compatible[c][r] == 0:
            prob += pulp.lpSum(x[c][r]) == 0
for r in range(num_rooms):
    for s in range(num_sessions):
        prob += pulp.lpSum(durations[c] * x[c][r][s] for c in range(num_cases)) <= reg_cap + overtime[r][s]
```
