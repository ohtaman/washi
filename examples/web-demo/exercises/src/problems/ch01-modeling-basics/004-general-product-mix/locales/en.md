# #004. General Product Mix (m x n Matrix)

<!-- section:scenario -->
Now let's generalize **#001** from two fixed products to any number of products and shared resource limits.

An artisan creamery manufactures bulk gelato across multiple flavors in non-negative continuous quantities. Each batch draws from several shared ingredients and kitchen resources, where every liter of a flavor earns a unit profit margin and consumes a specific amount of each resource. Without exceeding any resource capacity, determine how many liters of each flavor to produce in order to **maximize total profit**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Unit profit margin of each product $j$ |
| `usages` | `number[][]` | Resource usage matrix where `usages[k][j]` is resource $k$ per unit of product $j$ |
| `capacities` | `number[]` | Available capacity of each resource $k$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Non-negative continuous production amounts of length $n$ |
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

Prioritizing only flavor 0 caps production at 30 L (15,000 profit) with 50 units of resource 1 unused. Producing `[20, 30]` uses all 90 of resource 0 and all 80 of resource 1 for **19,000** profit.
