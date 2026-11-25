## Approach

Introduce binary door assignments $x_{i,r}$ and $y_{j,s}$, binary truck-pair transfer indicators $z_{i,j}$, continuous commodity flows $f_{i,j,k}$, disaggregated door-pair flows $w_{i,j,r,s}$, and continuous outbound departure times $t_j$ and tardiness $T_j$. Disaggregating each truck pair's total flow into $w_{i,j,r,s}$ linearizes the trilinear coupling between door binaries and freight flows without quadratic terms, while door capacity, supply/demand, Big-M departure synchronization, and tardiness constraints enforce all operational rules. Minimize total door-pair handling costs plus outbound tardiness penalties.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i,j,r,s} c_{r,s} w_{i,j,r,s} + \gamma_{\text{delay}} \sum_{j} T_j \\
\text{s.t.} \quad & \sum_{r} x_{i,r} = 1 && \forall i \\
& \sum_{i} x_{i,r} \le C^{\text{in}}_r && \forall r \\
& \sum_{s} y_{j,s} = 1 && \forall j \\
& \sum_{j} y_{j,s} \le C^{\text{out}}_s && \forall s \\
& \sum_{j} f_{i,j,k} \le A_{i,k} && \forall i, k \\
& \sum_{i} f_{i,j,k} = B_{j,k} && \forall j, k \\
& \sum_{r,s} w_{i,j,r,s} = \sum_{k} f_{i,j,k} \le M_{i,j} z_{i,j} && \forall i, j \\
& \sum_{s} w_{i,j,r,s} \le M_{i,j} x_{i,r} && \forall i, j, r \\
& \sum_{r} w_{i,j,r,s} \le M_{i,j} y_{j,s} && \forall i, j, s \\
& t_j \ge a_i + \tau_{r,s} - M_T (3 - x_{i,r} - y_{j,s} - z_{i,j}) && \forall i, j, r, s \\
& T_j \ge t_j - d_j && \forall j \\
& x_{i,r}, y_{j,s}, z_{i,j} \in \{0, 1\}, \quad f_{i,j,k}, w_{i,j,r,s}, t_j, T_j \ge 0
\end{aligned}
$$

Here $A_{i,k} = \text{supplies}[i][k]$, $B_{j,k} = \text{demands}[j][k]$, $C^{\text{in}}_r = \text{inDoorCaps}[r]$, $C^{\text{out}}_s = \text{outDoorCaps}[s]$, $c_{r,s} = \text{handlingCosts}[r][s]$, $\tau_{r,s} = \text{transferTimes}[r][s]$, $a_i = \text{arrivalTimes}[i]$, $d_j = \text{dueTimes}[j]$, and $\gamma_{\text{delay}} = \text{delayCost}$, with tight bounds $M_{i,j} = \sum_k \min(A_{i,k}, B_{j,k})$ and $M_T = \max_i a_i + \max_{r,s} \tau_{r,s}$.

## Key Points

- **Linearizing door-pair cost without quadratic products**: Because $\sum_r x_{i,r} = 1$ and $\sum_s y_{j,s} = 1$, forcing $\sum_s w_{i,j,r,s} \le M_{i,j} x_{i,r}$ and $\sum_r w_{i,j,r,s} \le M_{i,j} y_{j,s}$ isolates the unique active pair $(r, s)$ with $x_{i,r} = y_{j,s} = 1$ using purely continuous $w_{i,j,r,s} \ge 0$.
- **Tight pair-flow Big-M and time Big-M**: Capping $M_{i,j}$ at the pairwise commodity overlap $\sum_k \min(A_{i,k}, B_{j,k})$ and setting $M_T = \max_i a_i + \max_{r,s} \tau_{r,s}$ eliminates weak arbitrary constants while keeping time sync exact whenever $z_{i,j} = 1$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each truck pair, disaggregate total transfer flow into door-pair variables $w_{i,j,r,s}$ and impose both door-assignment linking and time-synchronization Big-M constraints. In WaSHI, generate the door-pair constraint arrays in bulk with `map` and `flatMap`; in PuLP, add each $(r, s)$ constraint inside nested loops.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);
m.constraint(
  w[i][j].map((row, r) => expr`${sum(row)} <= ${maxPairFlow} * ${x[i][r]}`)
);
m.constraint(
  input.outDoorCaps.map((_, s) =>
    expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`
  )
);
m.constraint(
  input.transferTimes.flatMap((row, r) =>
    row.map((tau, s) => {
      const rhs = input.arrivalTimes[i] + tau - 3 * bigMT;
      return expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`;
    })
  )
);
```

**PuLP (Python)**

```python
prob += pair_flow <= m_ij * z[i][j]
prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
for r in range(R):
    prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
for s in range(S):
    prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
for r in range(R):
    for s in range(S):
        prob += dep[j] >= arrival_times[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])
```
