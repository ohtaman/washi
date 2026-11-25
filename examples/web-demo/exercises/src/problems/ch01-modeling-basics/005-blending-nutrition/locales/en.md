# #005. Precision Alloy Blending

<!-- section:scenario -->
A metallurgy plant melts and blends several types of alloy ingots to produce a specialty alloy. Each alloy ingot is itself an alloy composed of multiple chemical elements (such as iron, chromium, and nickel), with a known unit cost per kg, warehouse stock limit (kg), and mass fraction for each element.

Determine how many kilograms of each alloy ingot to melt to **minimize total material cost**, subject to the following conditions:

- **Warehouse stock limits**: The amount (kg) used of each alloy ingot cannot exceed its available stock.
- **Exact target batch weight**: The total weight (kg) of all melted alloy ingots must equal the specified target batch weight.
- **Element composition bounds**: In the final batch, the mass fraction of every chemical element must stay within its specified minimum and maximum bounds.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `targetBatch` | `number` | Required exact total batch weight (kg) |
| `costs` | `number[]` | Unit cost per kg of alloy ingot $i$ |
| `availabilities` | `number[]` | Available warehouse stock (kg) of alloy ingot $i$ |
| `compositions` | `number[][]` | `compositions[i][k]` is the mass fraction (0 to 1) of element $k$ in alloy ingot $i$ |
| `minRatios` | `number[]` | Minimum required mass fraction (0 to 1) of element $k$ |
| `maxRatios` | `number[]` | Maximum allowed mass fraction (0 to 1) of element $k$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `amounts` | `number[]` | Amount used of each alloy ingot (kg) |
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

Blending 62.5 kg of Alloy Ingot 0 and 37.5 kg of Alloy Ingot 1 totals 100 kg, yields 35% element 0, 38.75% element 1, and 21.25% element 2 (within all bounds), and costs $300 \times 62.5 + 500 \times 37.5 =$ **37,500**.
