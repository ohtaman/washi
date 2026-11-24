# #006. Disaster-Prevention Equipment Selection (0-1 Binary Variables)

<!-- section:scenario -->
A municipality is selecting disaster-prevention equipment (such as security cameras, backup generators, and AEDs) from a list of candidates within a fixed total budget (in 10,000 yen). Each item is strictly **all-or-nothing**: you cannot install half of a unit—you either install it (incurring its full cost and gaining its expected disaster-prevention score) or skip it.

Select a subset of equipment to **maximize the total score** without exceeding the available budget.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `budget` | `number` | Available total budget (10,000 yen) |
| `costs` | `number[]` | Required cost of each equipment item (10,000 yen) |
| `values` | `number[]` | Expected disaster-prevention score of each item |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary installation flags (`0` or `1`) for each item |
| `totalValue` | `number` | Maximized total score |

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

Selecting items 1, 2, and 3 (`[0, 1, 1, 1, 0]`) gives total cost $5 + 7 + 3 = 15 \le 15$ (within budget) and total score $12 + 16 + 8 =$ **36**.
