## Approach

Declare a continuous allocation variable $x_i \in [l_i, u_i]$ for each team, enforce the exact total demand $\sum_i x_i = D$, and minimize the convex quadratic objective $\sum_i c_i x_i + \lambda \sum_i (x_i - \bar{x})^2$ natively via HiGHS QP (where $\bar{x} = D / n$ is the fixed equal-share mean).

## Mathematical Model

$$
\begin{aligned}
\min_{x} \quad & \sum_{i=0}^{n-1} c_i x_i + \lambda \sum_{i=0}^{n-1} \left(x_i - \bar{x}\right)^2 \qquad \left(\bar{x} = \frac{D}{n}\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = D \\
& l_i \le x_i \le u_i && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Comparing fairness metrics**: Pure linear cost ($\lambda = 0$) pushes cheap teams to $u_i$ and expensive teams to $l_i$ (extreme inequality). LP-expressible maximin ($\max \min_i x_i$) and range ($\max_i x_i - \min_i x_i$) only constrain the extremes and leave intermediate allocations unsmoothed. By contrast, the L2 variance penalty ($\lambda \sum_i (x_i - \bar{x})^2$) is strictly convex for $\lambda > 0$, smoothly balancing *all* teams toward $\bar{x}$ with a unique optimal allocation.
- **Native `QuadExpr` support in WaSHI**: Expanding $(x_i - \bar{x})^2 = x_i^2 - 2\bar{x}x_i + \bar{x}^2$ yields a positive semi-definite diagonal Hessian $2\lambda I \succeq 0$. WaSHI's `expr` template literal builds the squared deviation sum directly into a `QuadExpr` that HiGHS solves exactly, including the constant offset $\lambda n \bar{x}^2$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Precompute the target `mean` as an input constant, create bounded continuous variables with `minAlloc.map(...)`, and pass the squared deviation $(x_i - \bar{x})^2$ directly as a convex quadratic objective in `expr`.

**WaSHI (TypeScript)**

```ts
const mean = input.totalDemand / n;
const x = input.minAlloc.map((lb, i) =>
  m.continuous({ lb, ub: input.maxAlloc[i], name: `x_${i}` })
);
m.constraint(expr`sum(${x}) == ${input.totalDemand}`, "total_demand");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${x}) + ${input.fairnessWeight} * sum((${x} - ${mean})^2)`
  )
);
await m.solve();
```
