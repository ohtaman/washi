## Approach

Introduce binary match-assignment variables $x_{m,v,s} \in \{0, 1\}$ (forced zero for incompatible venues) and continuous bounded overtime variables $o_{v,s} \in [0, O_{\max}]$. Allow each match to be scheduled at most once, cap every venue-slot block's broadcast load by $B + o_{v,s}$, and maximize total viewership score minus overtime penalty.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{m=0}^{M-1} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} p_m x_{m,v,s} - c_{\text{ot}} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} o_{v,s} \\
\text{s.t.} \quad & \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} x_{m,v,s} \le 1 && \forall m \\
& \sum_{s=0}^{S-1} x_{m,v,s} = 0 && \forall m, v : \text{compat}_{m,v} = 0 \\
& \sum_{m=0}^{M-1} d_m x_{m,v,s} \le B + o_{v,s} && \forall v, s \\
& 0 \le o_{v,s} \le O_{\max} && \forall v, s \\
& x_{m,v,s} \in \{0, 1\} && \forall m, v, s
\end{aligned}
$$

## Key Points

- **Optional scheduling (`<= 1`) turns overtime into a cost-benefit trade-off**: Because not all matches must be broadcast, a match is added into overtime only when its viewership gain $p_m$ outweighs the overtime charge $c_{\text{ot}} \cdot \Delta o$—which is why match 4 ($p_4 = 18$) is left unscheduled in the example when overtime costs $25$ per unit.
- **Elastic block length via continuous slack $o_{v,s}$**: Replacing a hard length $B$ with $B + o_{v,s}$ ($0 \le o_{v,s} \le O_{\max}$) models piecewise-linear slot expansion without extra binary variables.
- **Venue compatibility masks prevent stage/rig conflicts**: Zeroing out incompatible `(m, v)` entries shrinks the branch-and-bound tree and enforces arena equipment rules.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
x.forEach((matchVenues, m) => {
  model.constraint(expr`${sum(matchVenues.flat())} <= 1`);
  matchVenues.forEach((venueSlots, v) => {
    if (input.compatible[m][v] === 0) model.constraint(expr`${sum(venueSlots)} == 0`);
  });
});
for (let v = 0; v < V; v++) {
  for (let s = 0; s < S; s++) {
    const load = sum(x.map((matchVenues, m) => expr`${input.durations[m]} * ${matchVenues[v][s]}`));
    model.constraint(expr`${load} <= ${input.regularLength} + ${overtime[v][s]}`);
  }
}
```

**PuLP (Python)**

```python
for m in range(num_matches):
    prob += pulp.lpSum(x[m][v][s] for v in range(num_venues) for s in range(num_slots)) <= 1
    for v in range(num_venues):
        if compatible[m][v] == 0:
            prob += pulp.lpSum(x[m][v]) == 0
for v in range(num_venues):
    for s in range(num_slots):
        prob += pulp.lpSum(durations[m] * x[m][v][s] for m in range(num_matches)) <= reg_len + overtime[v][s]
```
