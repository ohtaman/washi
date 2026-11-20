## Approach

Apply the Charnes-Cooper perspective change of variables $t = 1 / (d^\top x + d_0) > 0$ and $y = t x \ge 0$. Because $d_0 > 0$ and $d \ge 0$ on a bounded domain, $t$ stays strictly positive, turning the linear-fractional ratio maximization into a single LP over $(y, t)$, after which we recover $x = y / t$.

## Mathematical Model

$$
\begin{aligned}
\max \quad & c^\top y + c_0 t \\
\text{s.t.} \quad & d^\top y + d_0 t = 1 \\
& A y \le b t \\
& 0 \le y_j \le u_j t && \forall j \in \{0, \dots, n-1\} \\
& t \ge 0
\end{aligned}
$$

## Key Points

- **Homogenizing right-hand sides**: Every original constraint $a_k^\top x \le b_k$ and upper bound $x_j \le u_j$ must be multiplied by $t$ after substituting $y = t x$ (producing $a_k^\top y \le b_k t$ and $y_j \le u_j t$). Forgetting to multiply $b_k$ or $u_j$ by $t$ mixes unscaled and scaled units!
- **Why maximizing the numerator alone fails**: Because the denominator $d^\top x + d_0$ also depends on $x$, pushing all resources to full capacity often lowers the ratio compared to a leaner mix.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  expr`dot(${input.denCoeffs}, ${y}) + ${input.denConst} * ${t} == 1`,
  "cc_norm"
);
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${y}) <= ${cap} * ${t}`)
);
m.constraint(input.upperBounds.map((ub, j) => expr`${y[j]} <= ${ub} * ${t}`));
m.objective(maximize(expr`dot(${input.numCoeffs}, ${y}) + ${input.numConst} * ${t}`));
```

**PuLP (Python)**

```python
prob += pulp.lpDot(den_c, y) + den_0 * t == 1
for k, cap in enumerate(caps):
    prob += pulp.lpDot(usages[k], y) <= cap * t
for j, ub in enumerate(ubs):
    prob += y[j] <= ub * t
prob += pulp.lpDot(num_c, y) + num_0 * t
```
