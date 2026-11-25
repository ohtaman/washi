# #004. Gelato Creamery Production Mix (m × n Matrix)

<!-- section:scenario -->
An artisan creamery manufactures multiple flavors of gelato. Each liter of a flavor earns a fixed profit margin and consumes set amounts of shared ingredients (such as milk and cream) and equipment capacity (such as freezer time).

The number of flavors and shared resources varies with the input. Without exceeding any ingredient or equipment capacity, determine the production volume of each flavor (in liters, as a non-negative continuous quantity) to **maximize total profit**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Profit margin per liter of flavor $j$ |
| `usages` | `number[][]` | Resource usage matrix where `usages[k][j]` is the amount of ingredient/resource $k$ used per liter of flavor $j$ |
| `capacities` | `number[]` | Available capacity of ingredient/resource $k$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Non-negative continuous production volume (in liters) for each flavor |
| `totalProfit` | `number` | Maximized total profit |

<!-- section:example -->
**Input**

```json
{
  "margins": [500, 300],
  "usages": [
    [3, 1],
    [1, 2]
  ],
  "capacities": [90, 80]
}
```

**Output**

```json
{
  "quantities": [20, 30],
  "totalProfit": 19000
}
```

Producing `[20, 30]` liters uses $3 \times 20 + 1 \times 30 = 90$ of ingredient/resource 0 and $1 \times 20 + 2 \times 30 = 80$ of ingredient/resource 1 (within both capacities), giving total profit $500 \times 20 + 300 \times 30 =$ **19,000**.
