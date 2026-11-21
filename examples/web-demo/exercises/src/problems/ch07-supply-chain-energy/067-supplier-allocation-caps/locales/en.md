# #067. Supplier Allocation with Semi-Continuous & Share Caps

<!-- section:scenario -->
A multi-plant manufacturer sources raw materials from a pool of candidate suppliers. Engaging a supplier incurs a fixed contract cost and enforces a semi-continuous total order requirement: an inactive supplier ships zero units, whereas an active supplier must receive a combined order across all plants between its minimum and maximum order bounds.

To prevent single-vendor concentration risk, no single supplier may fulfill more than a fixed maximum share of any plant's demand, and the total number of active suppliers must lie within specified lower and upper bounds. Select active suppliers and allocate plant orders to meet all demands at **minimum total fixed plus procurement cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Demand $D_p$ at each plant $p$ |
| `unitCosts` | `number[][]` | Unit price plus freight $c_{s,p}$ from supplier $s$ to plant $p$ |
| `fixedCosts` | `number[]` | Fixed contract fee $F_s$ if supplier $s$ is active |
| `minOrders` | `number[]` | Minimum total order $L_s$ if supplier $s$ is active |
| `maxOrders` | `number[]` | Maximum total capacity $U_s$ if supplier $s$ is active |
| `maxShare` | `number` | Max fraction $\alpha \in (0, 1]$ of any plant's demand from one supplier |
| `minSuppliers` | `number` | Minimum total number of active suppliers |
| `maxSuppliers` | `number` | Maximum total number of active suppliers |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `active` | `number[]` | Binary (`0` or `1`) supplier selection vector |
| `allocations` | `number[][]` | Continuous order quantities $q_{s,p} \ge 0$ ($S \times P$) |
| `totalCost` | `number` | Minimized fixed contract plus unit procurement cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [100, 80, 120],
  "unitCosts": [
    [12, 15, 18],
    [14, 11, 16],
    [16, 14, 12],
    [13, 13, 14]
  ],
  "fixedCosts": [300, 260, 320, 280],
  "minOrders": [60, 50, 70, 50],
  "maxOrders": [160, 140, 170, 130],
  "maxShare": 0.6,
  "minSuppliers": 2,
  "maxSuppliers": 3
}
```

**Output**

```json
{
  "active": [0, 0, 1, 1],
  "allocations": [
    [0, 0, 0],
    [0, 0, 0],
    [50, 48, 72],
    [50, 32, 48]
  ],
  "totalCost": 4674
}
```

Activating suppliers 2 and 3 (2 active in `[2, 3]`) satisfies per-plant 60% caps (`[60, 48, 72]`) and supplier order intervals (`170 in [70, 170]`, `130 in [50, 130]`), yielding total cost $(320 + 280) + 4074 =$ **4,674**.


<!-- section:hint1 -->
Model a binary activation variable for each supplier and a continuous $S \times P$ matrix of order quantities from each supplier to each plant. The model enforces supplier-level semi-continuous volume rules alongside plant-level diversification limits.

<!-- section:hint2 -->
You can encode the single-supplier share cap directly as a variable upper bound `maxShare * demands[p]` on each allocation $q_{s,p}$. Link each supplier's total order across all plants to its binary `active[s]` variable with both lower (`minOrders[s] * active[s]`) and upper (`maxOrders[s] * active[s]`) bounds, and constrain the sum of `active` between `minSuppliers` and `maxSuppliers`.
