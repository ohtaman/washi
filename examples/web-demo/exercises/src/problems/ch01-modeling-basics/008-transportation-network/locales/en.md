# #008. Bipartite Transportation Planning

<!-- section:scenario -->
A distribution network moves goods from several warehouses to several retail stores. Each warehouse holds a limited supply stock, each store requires at least its demand quantity, and every warehouse-to-store lane has a unit shipping cost.

Determine non-negative continuous shipping quantities along every lane to **minimize total freight cost** without exceeding any warehouse supply while fulfilling every store demand.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[]` | Available supply stock at each warehouse $i$ |
| `demands` | `number[]` | Required demand at each store $j$ |
| `unitCosts` | `number[][]` | Shipping cost per unit from warehouse $i$ to store $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `shipments` | `number[][]` | $S \times D$ matrix of non-negative shipment flows |
| `totalCost` | `number` | Minimized total freight cost |

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

Warehouse shipments total 50 ≤ 60 and 80 ≤ 80, store receipts equal `[40, 50, 40]`, and total freight cost is $4 \times 40 + 6 \times 10 + 3 \times 40 + 2 \times 40 =$ **420**.
