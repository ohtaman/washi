# #018. Multidimensional Knapsack with Dependencies

<!-- section:scenario -->
An engineering team is choosing which software features to ship in the next release. Each feature delivers a user value and consumes amounts of two or more limited resources, such as engineering hours, compute budget, and QA slots.

Technical architecture also imposes prerequisite pairs where shipping one feature requires shipping its foundation feature, as well as incompatible pairs that cannot be shipped together. Choose a subset of features to **maximize total delivered value** within every resource limit and dependency constraint.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `values` | `number[]` | Delivered value of each candidate feature |
| `weights` | `number[][]` | Resource consumption matrix where `weights[k][j]` is resource $k$ used by feature $j$ |
| `capacities` | `number[]` | Available capacity for each resource $k$ |
| `prerequisites` | `number[][]` | Pairs `[a, b]` requiring feature `b` whenever feature `a` is selected |
| `incompatibles` | `number[][]` | Pairs `[c, d]` that cannot both be selected simultaneously |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) selection choices per feature |
| `totalValue` | `number` | Maximized total value |

<!-- section:example -->
**Input**

```json
{
  "values": [8, 24, 22, 19, 15],
  "weights": [
    [5, 6, 4, 5, 3],
    [3, 6, 5, 4, 6]
  ],
  "capacities": [13, 13],
  "prerequisites": [[3, 0]],
  "incompatibles": [[1, 2]]
}
```

**Output**

```json
{
  "selected": [1, 0, 0, 1, 1],
  "totalValue": 42
}
```

Selecting features `{0, 3, 4}` uses `5 + 5 + 3 = 13 <= 13` of resource 0 and `3 + 4 + 6 = 13 <= 13` of resource 1, respects prerequisite `3 -> 0` and incompatibility `[1, 2]`, and yields total value $8 + 19 + 15 =$ **42**.

<!-- section:hint1 -->
Each candidate feature is a binary selection variable. The model combines one knapsack capacity constraint per resource dimension with pairwise logical constraints for prerequisites and incompatibilities.

<!-- section:hint2 -->
Each row `weights[k]` corresponds to a separate resource capacity constraint against `capacities[k]`. A prerequisite `[a, b]` linearizes as $x_a \le x_b$, and an incompatible pair `[c, d]` linearizes as $x_c + x_d \le 1$.
