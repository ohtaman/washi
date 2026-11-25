# #064. Multi-Level BOM & Lead-Time MRP

<!-- section:scenario -->
A factory coordinates Material Requirements Planning (MRP) across multiple items linked by a Bill of Materials (BOM)—such as complete e-bikes, drive units, and battery cells—over a discrete planning horizon:

- Releasing an integer production batch of an item in a period immediately consumes its required child components in that same period according to the BOM ratios.
- Each released batch completes and enters usable inventory after that item's production lead time (with no prior in-transit orders arriving before period 0's releases complete).
- Releasing a positive batch requires activating a setup (incurring a fixed setup cost) and cannot exceed the item's per-period capacity; unit production cost is charged on released quantities.
- Starting from each item's initial inventory, ending inventory must stay non-negative (all external and dependent demands met without backorders) and incurs a per-period holding cost.

Choose setups, integer production releases, and ending inventories for every item and period to **minimize total setup, production, and holding cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `externalDemands` | `number[][]` | External customer demand per item and period ($N \times T$) |
| `bom` | `number[][]` | Child-parent BOM matrix ($N \times N$): `bom[i][j]` units of child $i$ consumed per unit of parent $j$ released |
| `leadTimes` | `number[]` | Integer production lead time $L_i \ge 0$ per item (length $N$; releases in period $t$ arrive in period $t + L_i$) |
| `initialInventory` | `number[]` | Opening inventory per item before period 0 (length $N$) |
| `setupCosts` | `number[]` | Fixed setup cost per item when active in a period (length $N$) |
| `prodCosts` | `number[]` | Unit production cost per item (length $N$) |
| `holdCosts` | `number[]` | Unit per-period holding cost on ending inventory per item (length $N$) |
| `capacities` | `number[]` | Maximum batch size per period per item when active (length $N$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[][]` | Binary (0 or 1) setup decisions ($N \times T$) |
| `production` | `number[][]` | Non-negative integer production releases ($N \times T$) |
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

Releasing 27 units of item 0 at period 2 ($L_0 = 1$) supplies periods 3 and 4 while pulling 54 units of item 1 at period 2 (released at period 1 with $L_1 = 1$) and 162 units of item 2 at period 1 ($L_2 = 0$), giving total cost $580 + 1332 + 24 =$ **1,936** (setup 580, production 1332, holding 24).


<!-- section:hint1 -->
Model binary setup indicators, non-negative integer production releases, and non-negative ending inventories for every item and period. Each item's inventory balance couples its own delayed order arrivals with both external demand and dependent demand triggered by parent item releases.

<!-- section:hint2 -->
Units of item $i$ released at period $t - L_i$ arrive in period $t$ (so arrivals are zero when $t < L_i$), whereas releasing a parent item $j$ in period $t$ consumes `bom[i][j]` units of child $i$ immediately in period $t$. Because `production` must be integer (`m.integer` in WaSHI or `cat=pulp.LpInteger` in PuLP), link it to the binary setup using the per-item period capacity.
