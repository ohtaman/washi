## Approach

Pair binary node variables $y_v$ ($y_0 = 1$) and undirected link variables $w_e$ with directed tree indicators $z_{e}^{\to}, z_{e}^{\leftarrow}$ and non-negative flow variables $f_{e}^{\to}, f_{e}^{\leftarrow} \le (n-1) z$. Sending one unit of commodity from root 0 to every active node $v \ge 1$ guarantees a single connected subgraph with zero islands.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{v=0}^{n-1} p_v y_v - \sum_{e \in E} c_e w_e \\
\text{s.t.} \quad & y_0 = 1, \quad w_e \le y_u, \quad w_e \le y_v, \quad z_e^{\to} + z_e^{\leftarrow} \le w_e && \forall e=(u,v) \in E \\
& 0 \le f_e^{\to} \le (n-1) z_e^{\to}, \quad 0 \le f_e^{\leftarrow} \le (n-1) z_e^{\leftarrow} && \forall e \in E \\
& \text{outflow}(0) - \text{inflow}(0) = \sum_{v=1}^{n-1} y_v, \quad \text{inflow}(v) - \text{outflow}(v) = y_v && \forall v \ge 1
\end{aligned}
$$

## Key Points

- **Why degree constraints fail for connectivity**: Requiring $w_e \le y_u, y_v$ or degree $\ge y_v$ cannot forbid disconnected components (such as picking an isolated profitable pair `{3, 4}` disconnected from root 0).
- **Single-commodity flow certificate**: Because only root 0 generates flow and flow can traverse an arc only when its link is active ($w_e = 1$), any node $v$ with `inflow(v) - outflow(v) = 1` must lie on a directed path of active links originating at 0.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each undirected edge, `input.edges.forEach` registers the endpoint-coupling constraints, mutual direction-selection exclusion, and capacity-$(n - 1)$ virtual flow upper bounds together.

**WaSHI (TypeScript)**

```ts
input.edges.forEach((e, idx) => {
  m.constraint(expr`${w[idx]} <= ${y[e.u]}`);
  m.constraint(expr`${w[idx]} <= ${y[e.v]}`);
  m.constraint(expr`${zFwd[idx]} + ${zRev[idx]} <= ${w[idx]}`);
  m.constraint(expr`${fFwd[idx]} <= ${n - 1} * ${zFwd[idx]}`);
  m.constraint(expr`${fRev[idx]} <= ${n - 1} * ${zRev[idx]}`);
});
```

**PuLP (Python)**

```python
for i, e in enumerate(edges):
    prob += w[i] <= y[e["u"]]
    prob += w[i] <= y[e["v"]]
    prob += z_fwd[i] + z_rev[i] <= w[i]
    prob += f_fwd[i] <= (n - 1) * z_fwd[i]
    prob += f_rev[i] <= (n - 1) * z_rev[i]
```
