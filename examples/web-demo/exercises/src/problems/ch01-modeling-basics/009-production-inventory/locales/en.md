# #009. Multi-Period Production & Inventory

<!-- section:scenario -->
An electric bicycle assembly plant plans regular production, overtime production, and end-of-period inventory across multiple consecutive periods (months), starting from a known initial inventory (units).

- In every period, regular production, overtime production, and ending inventory are non-negative continuous quantities that cannot exceed their respective period capacities and warehouse holding cap.
- In every period, beginning inventory plus regular and overtime output minus demand must equal ending inventory.
- Ending inventory after the final period must meet or exceed the required safety stock threshold.

Schedule regular production, overtime production, and inventory levels to **minimize total production and holding cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Bicycle demand in each period $t$ (units) |
| `regCap` | `number[]` | Maximum regular production capacity in each period $t$ (units) |
| `otCap` | `number[]` | Maximum overtime production capacity in each period $t$ (units) |
| `invCap` | `number` | Warehouse storage capacity in every period (units) |
| `initialInventory` | `number` | Opening stock before period 0 (units) |
| `minFinalInventory` | `number` | Minimum required safety stock after the last period (units) |
| `regCost` | `number` | Unit regular production cost |
| `otCost` | `number` | Unit overtime production cost |
| `holdCost` | `number` | Unit holding cost per period |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `regular` | `number[]` | Regular production schedule across periods (units) |
| `overtime` | `number[]` | Overtime production schedule across periods (units) |
| `inventory` | `number[]` | End-of-period inventory schedule across periods (units) |
| `totalCost` | `number` | Minimized total production and holding cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [80, 140, 120, 70],
  "regCap": [100, 100, 100, 100],
  "otCap": [40, 40, 40, 40],
  "invCap": 60,
  "initialInventory": 10,
  "minFinalInventory": 10,
  "regCost": 20,
  "otCost": 32,
  "holdCost": 3
}
```

**Output**

```json
{
  "regular": [100, 100, 100, 80],
  "overtime": [0, 10, 20, 0],
  "inventory": [30, 0, 0, 10],
  "totalCost": 8680
}
```

Starting from initial inventory 10, the schedule satisfies balance equations and inventory limits (`[30, 0, 0, 10]` ≤ 60, final 10 ≥ 10) for total cost $380 \times 20 + 30 \times 32 + 40 \times 3 =$ **8,680**.
