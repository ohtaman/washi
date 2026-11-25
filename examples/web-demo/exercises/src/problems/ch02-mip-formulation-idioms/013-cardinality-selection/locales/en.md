# #013. Cardinality-Constrained Portfolio Selection

<!-- section:scenario -->
An investment committee chooses which candidate projects (such as store renovations, rooftop solar, and warehouse automation) to fund from a shared budget. Each project is funded on an all-or-nothing basis and must satisfy four rules:

- **Total budget**: Total spending on selected projects cannot exceed the available budget.
- **Mutually exclusive groups**: At most one project may be funded in each mutually exclusive group.
- **Exact-count groups**: Exactly the specified number of projects must be funded in each exact-count group.
- **Mandatory coverage groups**: At least one project must be funded in each mandatory coverage group.

Select a valid subset of projects that obeys all budget and group rules while **maximizing total strategic value**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `budget` | `number` | Available total investment budget |
| `costs` | `number[]` | Cost of funding each candidate project |
| `values` | `number[]` | Strategic value delivered by each project |
| `mutexGroups` | `number[][]` | Groups of project indices where at most 1 may be selected |
| `exactGroups` | `{ indices: number[]; count: number }[]` | Groups of project `indices` where exactly `count` must be selected |
| `atLeastOneGroups` | `number[][]` | Groups where at least 1 project must be selected |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) selection choice per project |
| `totalValue` | `number` | Maximized total value |

<!-- section:example -->
**Input**

```json
{
  "budget": 16,
  "costs": [5, 6, 4, 3, 7, 4],
  "values": [14, 17, 10, 8, 19, 11],
  "mutexGroups": [[0, 1]],
  "exactGroups": [{ "indices": [2, 3, 4], "count": 2 }],
  "atLeastOneGroups": [[4, 5]]
}
```

**Output**

```json
{
  "selected": [0, 1, 0, 1, 1, 0],
  "totalValue": 44
}
```

Selecting projects `{1, 3, 4}` uses $6 + 3 + 7 = 16 \le 16$ budget, chooses 1 from `[0, 1]`, 2 from `[2, 3, 4]`, and 1 from `[4, 5]`, earning total value $17 + 8 + 19 =$ **44**.

<!-- section:hint1 -->
Model each project with a binary selection variable. The budget limit and each of the three governance group types (mutually exclusive, exact count, and at-least-one) are all linear constraints over subsets of those binary variables.

<!-- section:hint2 -->
Because each binary variable takes value 0 or 1, the number of selected projects in any group is simply the sum of `selected[i]` over that group's indices (via `sum(...)` in WaSHI or `pulp.lpSum(...)` in PuLP); constrain that sum to $\le 1$, $= \text{count}$, or $\ge 1$ accordingly.
