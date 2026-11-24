# #024. Linear-Fractional Efficiency Ratio (Charnes-Cooper)

<!-- section:scenario -->
A precision parts factory production planner is deciding non-negative production quantities (in units) for multiple precision parts subject to shared resource capacities (such as raw materials and machining hours) and per-part production upper bounds. Rather than maximizing raw profit, the planner wants to **maximize the investment efficiency ratio**—the ratio of total net return including fixed income (in 10k JPY) to total input cost including base maintenance cost (in 10k JPY).

Using the Charnes-Cooper transformation, which scales the entire problem by the reciprocal of the denominator to linearize it, find the production quantities and maximum ratio that satisfy all resource constraints and production upper bounds while **maximizing the efficiency ratio**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numCoeffs` | `number[]` | Numerator net return per unit vector $c$ (10k JPY/unit) |
| `numConst` | `number` | Numerator fixed income term $c_0$ (10k JPY) |
| `denCoeffs` | `number[]` | Non-negative denominator input cost per unit vector $d$ (10k JPY/unit) |
| `denConst` | `number` | Strictly positive denominator base maintenance cost $d_0 > 0$ (10k JPY) |
| `usages` | `number[][]` | Resource consumption per part matrix $A$ |
| `capacities` | `number[]` | Shared resource capacity limit vector $b$ |
| `upperBounds` | `number[]` | Production upper bound $u$ for each part (units) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `x` | `number[]` | Part production quantities in original scale (units) |
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
Instead of solving directly in the original activity variables, apply the Charnes-Cooper transformation: introduce a non-negative scalar homogenization variable representing the reciprocal of the denominator, together with scaled non-negative activity variables representing their product with that scalar.

<!-- section:hint2 -->
The main pitfall is forgetting to homogenize the original per-activity upper bounds: in the scaled model, every upper bound and resource limit must be multiplied by the scalar denominator variable rather than kept constant. Also check that the denominator's constant offset keeps the scaling factor strictly positive so the original activities can be recovered by division.