# #004. General Product Mix (m x n Matrix)

<!-- section:scenario -->
Now let's generalize **#002** from two fixed products to any number of products and shared resource limits.

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

<!-- section:hint1 -->
The decision variables `quantities` are already declared in the starter code. Loop over every resource index `k` from `0` to `capacities.length - 1` and add `dot(usages[k], quantities) <= capacities[k]`.

<!-- section:hint2 -->
Add `` m.objective(maximize(expr`dot(${input.margins}, ${quantities})`)) `` (or `h.maximize(...)` in Python), solve, and return `{ quantities, totalProfit }` without rounding continuous liter volumes to integers (`Case 2` has fractional vertex `[6.666..., 46.666..., 0]`).

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$
