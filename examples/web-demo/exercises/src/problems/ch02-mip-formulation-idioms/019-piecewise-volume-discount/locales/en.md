# #019. Piecewise All-Units Volume Discounts

<!-- section:scenario -->
A procurement team must source at least a required total quantity of raw material across multiple candidate suppliers. Each supplier offers several volume price tiers: if the company orders from a supplier, it must select **one** price tier, keep its continuous order quantity inside that tier's minimum and maximum quantity bounds, and pay that tier's discounted unit price across **every** unit bought from that supplier.

Alternatively, the company may skip a supplier completely by selecting zero tiers and ordering zero units from it. Choose which tier (if any) and continuous quantity to order from each supplier to **minimize total procurement cost** while meeting at least total demand.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demand` | `number` | Minimum total quantity that must be purchased across all suppliers |
| `suppliers` | `{ minQty: number; maxQty: number; unitPrice: number }[][]` | Available price tiers for each supplier $s$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `tierSelected` | `number[][]` | Binary (`0` or `1`) choice per supplier $s$ and tier $k$ |
| `tierQuantities` | `number[][]` | Continuous quantity ordered in each supplier-tier bracket |
| `totalCost` | `number` | Minimized total procurement cost |

<!-- section:example -->
**Input**

```json
{
  "demand": 60,
  "suppliers": [
    [
      { "minQty": 10, "maxQty": 30, "unitPrice": 11 },
      { "minQty": 35, "maxQty": 50, "unitPrice": 8.5 }
    ],
    [
      { "minQty": 5, "maxQty": 20, "unitPrice": 10 },
      { "minQty": 25, "maxQty": 45, "unitPrice": 8.8 }
    ]
  ]
}
```

**Output**

```json
{
  "tierSelected": [[0, 1], [0, 1]],
  "tierQuantities": [[0, 35], [0, 25]],
  "totalCost": 517.5
}
```

Selecting tier 1 for both suppliers orders `35` in `[35, 50]` from supplier 0 and `25` in `[25, 45]` from supplier 1, meeting $35 + 25 = 60 \ge 60$ for total cost $35 \times 8.5 + 25 \times 8.8 =$ **517.5**.

<!-- section:hint1 -->
Each supplier-tier pair $(s, k)$ has a binary selection indicator and a continuous order quantity. The model allows at most one active tier per supplier, couples each tier's quantity to its indicator, and requires total purchases across all suppliers and tiers to meet demand.

<!-- section:hint2 -->
Treat each tier $(s, k)$ as a semi-continuous segment: bounding `tierQuantities[s][k]` between `minQty` and `maxQty` times `tierSelected[s][k]` forces the quantity to $0$ when unselected and inside the bracket when selected. Because at most one tier per supplier can be active, summing `unitPrice * tierQuantities[s][k]` over all $(s, k)$ gives the exact all-units discount cost linearly.
