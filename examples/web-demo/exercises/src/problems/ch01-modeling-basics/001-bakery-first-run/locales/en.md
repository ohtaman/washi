# #001. Bakery First Optimization

<!-- section:scenario -->
Welcome to your first exercise. Run the solver in your preferred runtime (**WaSHI (TypeScript)** or **Python (highspy)**) and see how the automated judge reports feedback.

A bakery makes croissants and loaves (non-negative quantities) within daily flour and butter supplies. Almost the entire model is already written in the starter code, except for one deliberate mistake: it minimizes profit instead of maximizing it.

1. Click **Run & Judge** right away to observe the **SUBOPTIMAL** verdict (making zero of each item satisfies all resource limits, so it is feasible with zero profit).
2. Change that single objective word from minimize to maximize and re-run to pass with **AC**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `flourCap` | `number` | Available flour supply |
| `butterCap` | `number` | Available butter supply |
| `croissantProfit` | `number` | Profit per croissant |
| `loafProfit` | `number` | Profit per loaf |
| `croissantFlour` | `number` | Flour required per croissant |
| `croissantButter` | `number` | Butter required per croissant |
| `loafFlour` | `number` | Flour required per loaf |
| `loafButter` | `number` | Butter required per loaf |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `croissants` | `number` | Optimal croissant quantity |
| `loaves` | `number` | Optimal loaf quantity |
| `totalProfit` | `number` | Maximized total profit |

<!-- section:example -->
**Input**

```json
{
  "flourCap": 120,
  "butterCap": 70,
  "croissantProfit": 40,
  "loafProfit": 70,
  "croissantFlour": 2,
  "croissantButter": 1,
  "loafFlour": 3,
  "loafButter": 2
}
```

**Output**

```json
{
  "croissants": 30,
  "loaves": 20,
  "totalProfit": 2600
}
```

Baking 30 croissants and 20 loaves uses all 120 flour and 70 butter, achieving the maximum profit of **2,600**.

<!-- section:hint1 -->
Look for `m.objective(minimize(...))` in **WaSHI (TypeScript)** or `h.minimize(...)` in **Python (highspy)**. Both libraries expose `maximize` as well.

<!-- section:hint2 -->
Why did the broken code say **SUBOPTIMAL** instead of **VIOLATION**? Because producing `(0, 0)` violates no capacity limits — it is feasible, just far from the maximum profit! Distinguishing **feasible-but-suboptimal** from **infeasible/violated** is your most useful debugging signal in mathematical optimization.

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_c c + p_l \ell \\
\text{s.t.} \quad & f_c c + f_l \ell \le F_{\text{cap}} \\
& b_c c + b_l \ell \le B_{\text{cap}} \\
& c, \ell \ge 0
\end{aligned}
$$
