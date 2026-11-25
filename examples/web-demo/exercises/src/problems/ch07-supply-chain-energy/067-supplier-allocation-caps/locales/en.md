# #067. Supplier Allocation with Semi-Continuous & Share Caps

<!-- section:scenario -->
A coffee roaster plans green coffee bean procurement across multiple roasting plants from a pool of candidate suppliers (bean importers).

- **Demand satisfaction**: Total deliveries to each plant must at least meet its demand.
- **Semi-continuous supplier orders**: Engaging a supplier incurs a fixed contract cost and requires its combined order across all plants to lie between its minimum order and maximum capacity; an inactive supplier ships zero units.
- **Per-plant share cap**: No single supplier may fulfill more than a fixed maximum fraction of any plant's demand.
- **Active supplier count**: The total number of active suppliers must stay within the specified lower and upper bounds.

Select active suppliers and allocate plant orders to **minimize total fixed contract plus unit procurement cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Green coffee bean demand at each plant (units) |
| `unitCosts` | `number[][]` | Unit price plus freight per unit from supplier to plant (suppliers × plants, `[s][p]`) |
| `fixedCosts` | `number[]` | Fixed contract fee incurred if each supplier is active |
| `minOrders` | `number[]` | Minimum total order across all plants if each supplier is active (units) |
| `maxOrders` | `number[]` | Maximum total supply capacity if each supplier is active (units) |
| `maxShare` | `number` | Maximum fraction in (0, 1] of any plant's demand supplied by a single supplier |
| `minSuppliers` | `number` | Minimum total number of active suppliers |
| `maxSuppliers` | `number` | Maximum total number of active suppliers |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `active` | `number[]` | Binary (0 or 1) supplier selection vector |
| `allocations` | `number[][]` | Non-negative continuous order quantities in units (suppliers × plants, `[s][p]`) |
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

Activating suppliers 2 and 3 (2 active in [2, 3]) satisfies per-plant 60% caps ([60, 48, 72]) and supplier order intervals (170 in [70, 170], 130 in [50, 130]), yielding total cost $(320 + 280) + 4074 =$ **4,674**.


<!-- section:hint1 -->
Model a binary activation variable for each supplier and a continuous supplier-by-plant matrix of order quantities. The model enforces supplier-level semi-continuous volume rules alongside plant-level diversification limits.

<!-- section:hint2 -->
You can encode the single-supplier share cap directly as a variable upper bound `maxShare * demands[p]` on each `allocations[s][p]`. Link each supplier's total order across all plants to its binary `active[s]` variable with both lower (`minOrders[s] * active[s]`) and upper (`maxOrders[s] * active[s]`) bounds, and constrain the sum of `active` between `minSuppliers` and `maxSuppliers`.
