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

Warehouse 1 ships all 80 units cheaply to stores 1 and 2, while Warehouse 0 covers store 0 plus the remaining 10 units for store 1 (keeping 10 surplus units), minimizing freight cost to **420**.
