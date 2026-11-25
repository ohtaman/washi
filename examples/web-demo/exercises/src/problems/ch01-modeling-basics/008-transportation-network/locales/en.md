# #008. Bipartite Transportation Planning

<!-- section:scenario -->
Consider a logistics network shipping coffee beans (kg) from multiple roasting plants to multiple café stores. Each roasting plant has an available supply stock, each café store has a required demand, and every plant-to-store route has a unit shipping cost per kg.

Determine non-negative continuous shipment quantities (kg) along every route to **minimize total shipping cost** without exceeding any plant's supply limit while fulfilling every store's demand.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[]` | Available supply (kg) at roasting plant $i$ |
| `demands` | `number[]` | Required demand (kg) at café store $j$ |
| `unitCosts` | `number[][]` | Shipping cost per kg from plant $i$ to store $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `shipments` | `number[][]` | Non-negative shipment quantity (kg) from plant $i$ to store $j$ (same shape as `unitCosts`) |
| `totalCost` | `number` | Minimized total shipping cost |

<!-- section:example -->
**Input**

```json
{
  "supplies": [60, 80],
  "demands": [40, 50, 40],
  "unitCosts": [
    [4, 6, 8],
    [5, 3, 2]
  ]
}
```

**Output**

```json
{
  "shipments": [
    [40, 10, 0],
    [0, 40, 40]
  ],
  "totalCost": 420
}
```

Plant shipments are $40 + 10 = 50 \le 60$ and $40 + 40 = 80 \le 80$, café store receipts `[40, 50, 40]` meet all demands, and total shipping cost is $4 \times 40 + 6 \times 10 + 3 \times 40 + 2 \times 40 =$ **420**.
