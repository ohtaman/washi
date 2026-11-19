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

<!-- section:hint1 -->
The 2D continuous matrix `shipments[i][j] >= 0` is ready in the starter code:
- **Supply limits** (for every warehouse $i$): `sum(shipments[i]) <= supplies[i]`
- **Demand satisfaction** (for every store $j$): `sum(shipments.map((row) => row[j])) >= demands[j]`

<!-- section:hint2 -->
Minimize `sum_{i, j} unitCosts[i][j] * shipments[i][j]`! Notice that when all `supplies` and `demands` are integers, standard transportation LP solutions automatically land on integer vertices without needing integer variables.

<!-- section:formulation -->
$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$
