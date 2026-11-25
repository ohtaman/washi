# #011. Semi-Continuous Minimum-Lot Brewing

<!-- section:scenario -->
A craft beer brewery brews multiple candidate beer styles (such as IPA, pale ale, and stout) in continuous quantities (liters) while sharing a common malt stock (kg). For each style, the brewery must either skip brewing it (zero output) or brew it at a quantity between its minimum batch size and maximum tank capacity.

Each beer style has a known gross profit margin per liter and malt consumption per liter. Staying within the shared malt stock limit, decide which styles to brew and how many liters of each to produce so as to **maximize total gross margin**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Gross profit margin per liter for each beer style |
| `minBatches` | `number[]` | Minimum batch size when brewing each style (liters) |
| `maxBatches` | `number[]` | Maximum tank capacity for each style (liters) |
| `resourceUsages` | `number[]` | Malt consumed per liter of each style (kg) |
| `resourceCap` | `number` | Total available shared malt stock (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `active` | `number[]` | Binary (0 or 1) choice of whether to brew each style |
| `quantities` | `number[]` | Continuous brewing quantities (liters): 0 or in `[minBatches[i], maxBatches[i]]` |
| `totalMargin` | `number` | Maximized total gross margin |

<!-- section:example -->
**Input**

```json
{
  "margins": [30, 24, 18],
  "minBatches": [8, 15, 5],
  "maxBatches": [20, 30, 15],
  "resourceUsages": [1, 1, 1],
  "resourceCap": 30
}
```

**Output**

```json
{
  "active": [1, 1, 0],
  "quantities": [15, 15, 0],
  "totalMargin": 810
}
```

Brewing styles 0 and 1 with `quantities = [15, 15, 0]` satisfies the `[8, 20]` and `[15, 30]` brewing ranges (with style 2 at 0) and the malt limit $15 + 15 = 30 \le 30$, giving total gross margin $30 \times 15 + 24 \times 15 =$ **810**.

<!-- section:hint1 -->
Each style has a binary brewing variable and a continuous brewing quantity variable. Couple each pair so that unbrewed styles produce zero while brewed styles stay within their batch range, alongside the shared malt limit.

<!-- section:hint2 -->
Sandwich the quantity variable from both sides with the binary variable: multiplying `minBatches[i]` and `maxBatches[i]` by `active[i]` forces the quantity to 0 when inactive (0) and enables `[minBatches[i], maxBatches[i]]` only when active (1). Also add the shared malt cap and maximize total gross margin.
