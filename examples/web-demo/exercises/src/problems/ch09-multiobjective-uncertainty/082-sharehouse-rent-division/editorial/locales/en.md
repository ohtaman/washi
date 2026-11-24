## Approach

Solve two sequential models: Stage 1 solves a binary assignment MIP to find a room assignment $\sigma$ maximizing total roommate valuation $\sum_i v_{i,\sigma(i)}$, and Stage 2 solves an LP over continuous non-negative rents $p_r \ge 0$ summing to $R_{\text{total}}$ to enforce envy-freeness and maximize the minimum roommate surplus $z$.

## Mathematical Model

$$
\begin{aligned}
\text{Stage 1:} \quad \max_{x \in \{0,1\}^{n \times n}} \quad & \sum_{i=0}^{n-1} \sum_{r=0}^{n-1} v_{i,r} x_{i,r} \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} x_{i,r} = 1 \quad \forall i, \qquad \sum_{i=0}^{n-1} x_{i,r} = 1 \quad \forall r \\[6pt]
\text{Stage 2:} \quad \max_{p \in \mathbb{R}_{\ge 0}^n,\, z \in \mathbb{R}} \quad & z \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} p_r = R_{\text{total}}, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge z \quad \forall i, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge v_{i,r} - p_r \quad \forall i, r
\end{aligned}
$$

## Key Points

- **Why Stage 1 must precede Stage 2**: By LP duality (cycle monotonicity), an assignment $\sigma$ admits an unrestricted (signed) envy-free rent vector if and only if $\sigma$ maximizes $\sum_i v_{i,\sigma(i)}$—any suboptimal assignment makes Stage-2 envy-freeness infeasible. Under the additional requirement $p_r \ge 0$ and $\sum_r p_r = R_{\text{total}}$, welfare maximization remains necessary (though not sufficient if one room's valuation gap exceeds $R_{\text{total}}$); all problem instances here satisfy feasibility for non-negative rents.
- **Why envy-freeness can limit equal surplus**: Although the average surplus $(V^* - R_{\text{total}}) / n$ is fixed, envy-freeness can force a popular room's rent high enough that the max-min surplus $z^*$ is strictly below the average surplus.
- **Unbounded `minSurplus` variable**: Declare `minSurplus` with `lb: -Infinity` (`lowBound=None` in PuLP) so the formulation remains valid even when `totalRent` exceeds total valuation and surpluses are negative.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Verdicts](?view=guide&lang=en#verdicts).

## Key Implementation

After solving the Stage 1 assignment model `m1` to fix the room assignment $\sigma$, construct a fresh Stage 2 model `m2` with `rents` bounded below by 0 and `minSurplus` declared as an unrestricted free variable.

**WaSHI (TypeScript)**

```ts
// Stage 1: assignment MIP
m1.constraint(x.map((row) => expr`${sum(row)} == 1`));
m1.constraint(Array.from({ length: n }, (_, r) => expr`${sum(x.map((row) => row[r]))} == 1`));
m1.objective(maximize(sum(x.flatMap((row, i) => row.map((v, r) => expr`${input.valuations[i][r]} * ${v}`)))));
await m1.solve();

// Stage 2: envy-free max-min surplus LP
const rents = m2.continuous(n, { lb: 0, prefix: "rent" });
const minSurplus = m2.continuous("minSurplus", { lb: -Infinity, ub: Infinity });
m2.constraint(expr`${sum(rents)} == ${input.totalRent}`, "total_rent");
```

**PuLP (Python)**

```python
# Stage 1: assignment MIP
for i in range(n):
    prob1 += pulp.lpSum(x[i]) == 1
for r in range(n):
    prob1 += pulp.lpSum(x[i][r] for i in range(n)) == 1
prob1 += pulp.lpSum(valuations[i][r] * x[i][r] for i in range(n) for r in range(n))
prob1.solve(pulp.HiGHS(msg=False))

# Stage 2: envy-free max-min surplus LP
rents = [pulp.LpVariable(f"rent_{r}", lowBound=0) for r in range(n)]
min_surplus = pulp.LpVariable("min_surplus", lowBound=None)
prob2 += pulp.lpSum(rents) == total_rent
```
