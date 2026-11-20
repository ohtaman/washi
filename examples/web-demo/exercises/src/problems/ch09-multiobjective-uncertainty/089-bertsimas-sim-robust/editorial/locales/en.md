## Approach

Apply the Bertsimas-Sim (2004) LP dual reformulation of the worst-case budgeted adversary $\max_{0 \le \delta \le 1,\, \sum \delta_j \le \Gamma} \sum_j \hat{a}_j x_j \delta_j$: introduce dual variables $z \ge 0$ and $p_j \ge 0$ with $z + p_j \ge \hat{a}_j x_j$, replace the adversarial term in the capacity row with $\Gamma z + \sum_j p_j$, and maximize profit.

## Mathematical Model

$$
\begin{aligned}
\max_{x, z, p \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} \bar{a}_j x_j + \Gamma z + \sum_{j=0}^{n-1} p_j \le b \\
& z + p_j \ge \hat{a}_j x_j && \forall j \in \{0, \dots, n-1\} \\
& 0 \le x_j \le u_j && \forall j
\end{aligned}
$$

## Key Points

- **Exact linear dualization without enumerating $\binom{n}{\Gamma}$ subsets**: Even when $\Gamma$ is fractional (Case 3, $\Gamma = 2.5$), strong LP duality over the continuous budget polytope $\{0 \le \delta_j \le 1,\; \sum_j \delta_j \le \Gamma\}$ yields an exact compact LP with only $n + 1$ extra variables and $n$ extra rows.
- **Spectrum from Nominal ($\Gamma = 0$) to Soyster ($\Gamma = n$)**: At $\Gamma = 0$ the plan ignores uncertainty (achieving higher nominal profit `237.14` in Case 1 but failing under shocks); at $\Gamma = n$ it becomes overly conservative (`172` in Case 2); intermediate $\Gamma$ smoothly hedges by equalizing the top $\hat{a}_j x_j$ exposures (as in Case 0 where all three equal $3$).
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const z = m.continuous("z", { lb: 0 });
const p = m.continuous(n, { lb: 0, prefix: "p" });
m.constraint(input.deviations.map((dev, j) => expr`${z} + ${p[j]} >= ${dev} * ${x[j]}`));
m.constraint(
  expr`dot(${input.nominalUsages}, ${x}) + ${input.gamma} * ${z} + sum(${p}) <= ${input.capacityCap}`
);
```

**PuLP (Python)**

```python
z = pulp.LpVariable("z", lowBound=0)
p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]
for j in range(n):
    prob += z + p[j] >= deviations[j] * x[j]
prob += pulp.lpDot(nominal, x) + gamma * z + pulp.lpSum(p) <= cap
```
