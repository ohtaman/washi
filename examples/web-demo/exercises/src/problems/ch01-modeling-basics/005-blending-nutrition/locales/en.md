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

Blending 62.5 kg of Metal 0 and 37.5 kg of Metal 1 totals 100 kg, yields 35% element 0, 38.75% element 1, and 21.25% element 2 (within all bounds), and costs $300 \times 62.5 + 500 \times 37.5 =$ **37,500**.
