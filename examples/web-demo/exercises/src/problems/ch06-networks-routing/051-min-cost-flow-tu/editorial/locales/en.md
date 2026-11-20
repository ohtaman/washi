## Approach

Create one non-negative continuous variable `flows[e]` bounded above by `edges[e].cap` for each directed arc, enforce flow conservation (`outflow - inflow == supplies[v]`) at every node, and minimize the linear sum of arc costs.

## Mathematical Model

$$
\begin{aligned}
\min_{f} \quad & \sum_{e \in E} c_e f_e \\
\text{s.t.} \quad & \sum_{e=(v, w) \in E} f_e - \sum_{e=(u, v) \in E} f_e = b_v && \forall v \in V \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## Key Points

- **Total Unimodularity (TU)**: Every column of the directed node-arc incidence matrix $A$ contains exactly one $+1$ and one $-1$. Thus every square submatrix of $A$ has determinant $0, +1,$ or $-1$. With integer supplies $b_v$ and capacities $u_e$, every basic feasible extreme point of the LP polytope is automatically integral—zero integer variables or branch-and-bound needed.
- **No rounding needed**: Outputting continuous `f.value!` directly (without `Math.round`) demonstrates that simplex finds exact integer vertex flows natively.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const flows = input.edges.map((e, i) =>
  m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
);
m.constraint(
  input.supplies.map((supply, v) => {
    const outFlows = flows.filter((_, i) => input.edges[i].from === v);
    const inFlows = flows.filter((_, i) => input.edges[i].to === v);
    return expr`${sum(outFlows)} - ${sum(inFlows)} == ${supply}`;
  })
);
```

**PuLP (Python)**

```python
flows = [
    pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
    for i, e in enumerate(edges)
]
for v in range(n):
    out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
    in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_flow - in_flow == supplies[v]
```
