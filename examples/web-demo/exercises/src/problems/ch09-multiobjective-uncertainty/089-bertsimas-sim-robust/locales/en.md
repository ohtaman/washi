# #089. Budgeted Robust Optimization (Bertsimas-Sim)

<!-- section:scenario -->
A chemical plant must decide continuous non-negative production quantities (in tons) across multiple products—such as resin pellets, solvents, and additives—each capped by an individual production limit (in tons), to maximize total profit. Normally each ton of product consumes a nominal number of shared equipment hours (hours/ton), but due to raw-material variability, actual usage per ton can spike by up to a known maximum deviation.

You are given an uncertainty budget `gamma` (which may be fractional): each product can incur any fraction in $[0, 1]$ of its maximum deviation, as long as the sum of these fractions across all products is at most `gamma`. Find production quantities that **maximize total profit** while keeping total equipment hours within `capacityCap` under the worst-case realization within that budget.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `profits` | `number[]` | Profit per ton of each product |
| `nominalUsages` | `number[]` | Nominal equipment hours per ton of each product |
| `deviations` | `number[]` | Maximum equipment-hour spike per ton of each product |
| `maxUnits` | `number[]` | Upper bound on production quantity of each product (tons) |
| `capacityCap` | `number` | Shared equipment-hour limit that must hold even in the worst case |
| `gamma` | `number` | Uncertainty budget (from 0 to the number of products; may be fractional) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Production quantities satisfying the robust constraint (tons) |
| `totalProfit` | `number` | Maximized total profit |

<!-- section:example -->
**Input**

```json
{
  "profits": [12, 16, 10],
  "nominalUsages": [2, 3, 2],
  "deviations": [1, 1, 0.5],
  "maxUnits": [8, 6, 8],
  "capacityCap": 30,
  "gamma": 1
}
```

**Output**

```json
{
  "quantities": [3, 3, 6],
  "totalProfit": 144
}
```

Producing `[3, 3, 6]` uses $2(3) + 3(3) + 2(6) = 27$ nominal equipment hours plus worst-case $\Gamma = 1$ deviation $\max(1 \cdot 3, 1 \cdot 3, 0.5 \cdot 6) = 3$, totaling $30 \le 30$ with profit $12(3) + 16(3) + 10(6) =$ **144**.


<!-- section:hint1 -->
Alongside the bounded continuous production quantities, dualize the inner worst-case protection subproblem over the uncertainty budget `gamma` by introducing one scalar non-negative dual variable and one non-negative per-product dual variable. Together they form the exact linear robust counterpart of the capacity constraint.

<!-- section:hint2 -->
The key idea is LP duality on the inner worst-case protection problem: dualizing the $\Gamma$-budgeted adversary produces one scalar non-negative threshold dual and per-product non-negative excess duals so that the threshold plus each product's excess bounds that product's worst-case deviation. Substituting the dual objective directly into the capacity constraint eliminates the inner maximization without any quadratic or enumerative terms.