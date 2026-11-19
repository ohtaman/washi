# #005. Precision Alloy Blending

<!-- section:scenario -->
A metallurgy plant must blend several raw ingot lots into an exact target total weight of specialty alloy. Each raw metal has a unit cost per kilogram, an available warehouse stock limit, and a known mass fraction for each chemical element.

Quality standards require that in the final batch, every chemical element stays within its specified minimum and maximum percentage by weight. Choose how many kilograms of each raw metal to melt so the exact batch weight and all quality bounds are satisfied at **minimum total material cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `targetBatch` | `number` | Required exact total batch weight (kg) |
| `costs` | `number[]` | Unit cost per kg of raw metal $i$ |
| `availabilities` | `number[]` | Available warehouse stock (kg) of raw metal $i$ |
| `compositions` | `number[][]` | `compositions[i][k]` is the mass fraction of element $k$ in metal $i$ |
| `minRatios` | `number[]` | Minimum required mass fraction of element $k$ |
| `maxRatios` | `number[]` | Maximum allowed mass fraction of element $k$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `amounts` | `number[]` | Kilograms used of each raw metal |
| `totalCost` | `number` | Minimized total material cost |

<!-- section:example -->
**Input**

```json
{
  "targetBatch": 100,
  "costs": [300, 500, 400],
  "availabilities": [80, 60, 70],
  "compositions": [
    [0.2, 0.5, 0.1],
    [0.6, 0.2, 0.4],
    [0.4, 0.4, 0.2]
  ],
  "minRatios": [0.35, 0.3, 0],
  "maxRatios": [1, 1, 0.25]
}
```

**Output**

```json
{
  "amounts": [62.5, 37.5, 0],
  "totalCost": 37500
}
```

Metal 0 alone is cheapest but gives only 20% of element 0 (below 35%). Blending 62.5 kg of Metal 0 and 37.5 kg of Metal 1 reaches 35% element 0, 38.75% element 1, and 21.25% element 2 for the minimum cost of **37,500**.

<!-- section:hint1 -->
Writing `elemWeight / sum(amounts) >= minRatio` looks nonlinear at first glance. Why is it actually a pure linear constraint in this problem? Because total weight `sum(amounts)` is constrained to equal the constant `targetBatch`! Multiply both sides by `targetBatch`.

<!-- section:hint2 -->
The `amounts` variables (already bounded by `[0, availabilities[i]]`) are declared in the starter code. Enforce `sum(amounts) == targetBatch` and for each element $k$ enforce:
- `sum_i compositions[i][k] * amounts[i] >= minRatios[k] * targetBatch`
- `sum_i compositions[i][k] * amounts[i] <= maxRatios[k] * targetBatch`

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

Whenever the denominator of a percentage specification is a fixed batch size $B$, clearing the denominator keeps the entire problem in clean LP form. (Chapter 2 covers the variable-denominator fractional case!)
