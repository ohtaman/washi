# #024. Linear-Fractional Efficiency Ratio (Charnes-Cooper)

<!-- section:scenario -->
An operations division must choose continuous activity levels subject to linear resource limits and individual upper bounds. Rather than maximizing raw profit, management wants to **maximize the return-to-resource efficiency ratio** where both numerator (net return plus fixed offset) and denominator (resource usage plus positive base cost) are linear functions of the activity levels.

Choose the non-negative activity vector within all resource and upper limits to **maximize the linear-fractional ratio**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numCoeffs` | `number[]` | Numerator marginal return vector $c$ |
| `numConst` | `number` | Numerator constant offset $c_0$ |
| `denCoeffs` | `number[]` | Non-negative denominator vector $d$ |
| `denConst` | `number` | Strictly positive denominator base constant $d_0 > 0$ |
| `usages` | `number[][]` | Resource consumption matrix $A$ |
| `capacities` | `number[]` | Resource capacity limits $b$ |
| `upperBounds` | `number[]` | Per-activity upper bounds $u$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `x` | `number[]` | Activity levels in original units |
| `maxRatio` | `number` | Maximized ratio $(c^\top x + c_0) / (d^\top x + d_0)$ |

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

Setting `x = [0, 6]` satisfies $0 + 6 \le 8$ and `[0, 6] <= [5, 6]`, giving numerator $9 \times 6 + 10 = 64$, denominator $2 \times 6 + 8 = 20$, and ratio $64 / 20 =$ **3.2**.
