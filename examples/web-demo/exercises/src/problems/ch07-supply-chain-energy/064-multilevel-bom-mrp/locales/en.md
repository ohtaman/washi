# #064. Multi-Level BOM & Lead-Time MRP

<!-- section:scenario -->
A factory coordinates Material Requirements Planning (MRP) for multiple items linked through a Bill of Materials (BOM) over a discrete planning horizon. Releasing an integer production batch of parent item $j$ in period $t$ immediately consumes child component $i$ according to the BOM explosion ratio, while the finished units of item $i$ enter inventory after its production lead time.

Each item starts with a given initial inventory, incurs a fixed setup cost whenever an integer batch is released up to its per-period capacity, and pays unit production and holding costs. Schedule setups, integer order releases, and ending inventories to satisfy all external and BOM-dependent demands at **minimum total cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `externalDemands` | `number[][]` | External customer demand $D_{i,t}$ for item $i$ in period $t$ |
| `bom` | `number[][]` | Child-parent explosion matrix where `bom[i][j]` units of child $i$ are consumed per unit of parent $j$ released |
| `leadTimes` | `number[]` | Integer production lead time $L_i \ge 0$ (units released at $t$ arrive at $t + L_i$) |
| `initialInventory` | `number[]` | Opening inventory $I_{i,-1}$ of item $i$ before period 0 |
| `setupCosts` | `number[]` | Fixed setup cost $F_i$ per active production release period |
| `prodCosts` | `number[]` | Unit production/order cost $c_i$ for item $i$ |
| `holdCosts` | `number[]` | Unit holding cost $h_i$ per period for item $i$ |
| `capacities` | `number[]` | Maximum batch size $C_i$ per period when item $i$ is released |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[][]` | Binary (`0` or `1`) setup decisions ($N \times T$) |
| `production` | `number[][]` | Non-negative integer order releases ($N \times T$) |
| `inventory` | `number[][]` | Non-negative ending inventory levels ($N \times T$) |
| `totalCost` | `number` | Minimized sum of setup, production, and holding costs |

<!-- section:example -->
**Input**

```json
{
  "externalDemands": [
    [0, 0, 10, 15, 12],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ],
  "bom": [
    [0, 0, 0],
    [2, 0, 0],
    [0, 3, 0]
  ],
  "leadTimes": [1, 1, 0],
  "initialInventory": [0, 0, 0],
  "setupCosts": [150, 90, 50],
  "prodCosts": [12, 6, 2],
  "holdCosts": [2, 1, 0.5],
  "capacities": [30, 60, 180]
}
```

**Output**

```json
{
  "setups": [
    [0, 1, 1, 0, 0],
    [1, 1, 0, 0, 0],
    [1, 1, 0, 0, 0]
  ],
  "production": [
    [0, 10, 27, 0, 0],
    [20, 54, 0, 0, 0],
    [60, 162, 0, 0, 0]
  ],
  "inventory": [
    [0, 0, 0, 12, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ],
  "totalCost": 1936
}
```

Releasing 27 units of item 0 at period 2 ($L_0 = 1$) supplies periods 3 and 4 while pulling 54 units of item 1 at period 2 (released at period 1 with $L_1 = 1$) and 162 units of item 2 at period 1 ($L_2 = 0$), giving total cost $580 + 1332 + 24 =$ **1,936**.


<!-- section:hint1 -->
Model $N \times T$ matrices for binary setup indicators, non-negative integer order releases, and non-negative ending inventories for every item and period. Each item's inventory balance couples its own delayed order arrivals with both external demand and dependent demand triggered by parent item releases.

<!-- section:hint2 -->
Units of item $i$ released at period $t - L_i$ arrive in period $t$ (so arrivals are zero when $t < L_i$), whereas releasing a parent item $j$ in period $t$ consumes `bom[i][j]` units of child $i$ immediately in period $t$. Because `production` must be integer (`m.integer` in WaSHI or `cat="Integer"` in PuLP), link it to the binary setup using the per-item period capacity.
