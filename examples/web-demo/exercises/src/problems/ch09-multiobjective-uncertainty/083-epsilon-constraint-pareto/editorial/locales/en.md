## Approach

Iterate through each threshold $\varepsilon_k$ in `epsilons`, build an MIP maximizing total profit under both the shared budget cap and the secondary metric inequality $\sum e_j x_j \le \varepsilon_k$, and record each optimal selection and profit.

## Mathematical Model

$$
\begin{aligned}
\forall k \in \{0, \dots, K-1\}: \quad z(\varepsilon_k) = \max_{x \in \{0,1\}^n} \quad & \sum_{j=0}^{n-1} p_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} b_j x_j \le B_{\text{cap}} \\
& \sum_{j=0}^{n-1} e_j x_j \le \varepsilon_k
\end{aligned}
$$

## Key Points

- **Capturing unsupported MIP Pareto points**: Discrete MIP Pareto frontiers can be non-convex, so linear weighted sums ($\max p^\top x - w\, e^\top x$) only reach points on the upper convex hull and skip interior "unsupported" solutions—for example, in the visible Example, $(e=6, p=45)$ lies strictly below the line segment joining $(0, 0)$ and $(11, 85)$. Sweeping $\varepsilon_k$ recovers the exact maximum profit $z(\varepsilon_k)$ at every threshold regardless of convexity (when strict non-dominance is needed under profit ties, add a small emission tie-breaker as in the augmented $\varepsilon$-constraint method).
- **No scaling calibration needed**: Moving emissions into an explicit physical constraint eliminates arbitrary trade-off weights and directly answers operational cap questions ("what is the maximum profit under emission cap $\varepsilon_k$?").
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Create an independent `Model` for each emission threshold in `input.epsilons`, express the budget cap, emission cap, and profit maximization with `dot(...)`, and call `await m.solve()` sequentially.

**WaSHI (TypeScript)**

```ts
for (const [k, eps] of input.epsilons.entries()) {
  const m = new Model(`EpsilonPareto_${k}`);
  const x = m.binary(n, { prefix: "x" });
  m.constraint(expr`dot(${input.budgets}, ${x}) <= ${input.budgetCap}`);
  m.constraint(expr`dot(${input.emissions}, ${x}) <= ${eps}`);
  m.objective(maximize(expr`dot(${input.profits}, ${x})`));
  await m.solve();
  selections.push(x.map((v) => Math.round(v.value!) || 0));
  frontierProfits.push(m.objectiveValue!);
}
```

**PuLP (Python)**

```python
for k, eps in enumerate(epsilons):
    prob = pulp.LpProblem(f"epsilon_pareto_{k}", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{j}", cat=pulp.LpBinary) for j in range(n)]
    prob += pulp.lpDot(budgets, x) <= budget_cap
    prob += pulp.lpDot(emissions, x) <= eps
    prob += pulp.lpDot(profits, x)
    prob.solve(pulp.HiGHS(msg=False))
    selections.append([round(pulp.value(v)) for v in x])
    frontier_profits.append(float(pulp.value(prob.objective)))
```
