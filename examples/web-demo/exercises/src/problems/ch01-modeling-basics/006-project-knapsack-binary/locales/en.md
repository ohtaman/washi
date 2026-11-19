# #006. 0-1 Project Selection (Binary Variables)

<!-- section:scenario -->
A product team is evaluating a list of candidate R&D projects under a fixed total budget. Each project is strictly **all-or-nothing**: either approve it in full (incurring its full cost and gaining its full strategic value) or skip it.

Select a subset of projects to **maximize total value** without exceeding the available budget.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `budget` | `number` | Available total budget |
| `costs` | `number[]` | Cost required by each candidate project |
| `values` | `number[]` | Strategic value delivered by each project |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary choices (`0` or `1`) for each project |
| `totalValue` | `number` | Maximized total value |

<!-- section:example -->
**Input**

```json
{
  "budget": 15,
  "costs": [4, 5, 7, 3, 6],
  "values": [10, 12, 16, 8, 13]
}
```

**Output**

```json
{
  "selected": [0, 1, 1, 1, 0],
  "totalValue": 36
}
```

Greedy selection by value-to-cost ratio leaves 3 units of budget stranded at value 30. Choosing projects 1, 2, and 3 spends $5 + 7 + 3 = 15$ for maximum value **36**.
