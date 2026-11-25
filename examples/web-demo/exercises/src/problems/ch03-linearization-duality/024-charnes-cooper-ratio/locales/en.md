# #024. Linear-Fractional Efficiency Ratio (Charnes-Cooper)

<!-- section:scenario -->
A production planner at a precision parts factory is deciding non-negative continuous production quantities (in units; fractional amounts allowed) for multiple precision parts, subject to shared resource capacities (such as raw materials and machining hours) and per-part production upper bounds. Rather than maximizing raw profit, the planner wants to **maximize the investment efficiency ratio**—total net return (including a signed fixed offset in 10k JPY: positive for fixed income, negative for fixed overhead) divided by total input cost (including a positive base maintenance cost in 10k JPY).

Using the Charnes-Cooper transformation, find the production quantities and maximum efficiency ratio that satisfy all resource limits and per-part production upper bounds.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numCoeffs` | `number[]` | Net return per unit $c_j$ for each part $j$ (10k JPY/unit) |
| `numConst` | `number` | Signed fixed net-return offset $c_0$ (10k JPY; positive for fixed income, negative for fixed overhead) |
| `denCoeffs` | `number[]` | Non-negative input cost per unit $d_j$ for each part $j$ (10k JPY/unit) |
| `denConst` | `number` | Strictly positive base maintenance cost $d_0 > 0$ (10k JPY) |
| `usages` | `number[][]` | Resource consumption matrix $A$, where `usages[k][j]` is the consumption of resource $k$ per unit of part $j$ |
| `capacities` | `number[]` | Capacity limit $b_k$ for each shared resource $k$ |
| `upperBounds` | `number[]` | Production upper bound $u_j$ for each part $j$ (units) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `x` | `number[]` | Production quantity for each part (units) |
| `maxRatio` | `number` | Maximized efficiency ratio $(c^\top x + c_0) / (d^\top x + d_0)$ |

<!-- section:example -->
**Input**

```json
{
  "numCoeffs": [12, 9],
  "numConst": 10,
  "denCoeffs": [4, 2],
  "denConst": 8,
  "usages": [
    [1, 1]
  ],
  "capacities": [8],
  "upperBounds": [5, 6]
}
```

**Output**

```json
{
  "x": [0, 6],
  "maxRatio": 3.2
}
```

When `x` is [0, 6], resource consumption $0 + 6 \le 8$ and individual upper bounds [5, 6] are satisfied, giving numerator $9 \times 6 + 10 = 64$, denominator $2 \times 6 + 8 = 20$, and efficiency ratio $64 / 20 =$ **3.2**.


<!-- section:hint1 -->
Instead of solving directly in the original part production variables, apply the Charnes-Cooper transformation: introduce a non-negative scalar scaling variable representing the reciprocal of the denominator, together with non-negative scaled production variables representing each part's quantity multiplied by that scalar.

<!-- section:hint2 -->
The main pitfall is forgetting to scale the per-part upper bounds: in the transformed model, both the shared resource capacities and every per-part upper bound must be multiplied by the scaling variable $t$ rather than kept constant, alongside normalizing the denominator to 1. Because the original domain is bounded ($0 \le x \le u$) and the denominator stays strictly positive ($d \ge 0, d_0 > 0$), every feasible transformed solution satisfies $t > 0$, allowing exact recovery via $x = y / t$.