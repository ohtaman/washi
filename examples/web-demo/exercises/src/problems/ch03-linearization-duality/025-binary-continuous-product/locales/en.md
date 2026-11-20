# #025. Binary-Continuous Product (Glover Linearization)

<!-- section:scenario -->
A procurement team must order continuous quantities from several qualified suppliers to satisfy a total demand target. Every supplier enforces a strictly positive minimum order commitment and a maximum supply limit regardless of discount status, charging a standard base cost per unit.

For each supplier, the team can optionally sign an annual discount contract for a one-time fixed fee, earning a per-unit rebate on every unit purchased from that supplier. Choose which discount contracts to sign, the order quantities, and the linearized discounted volume terms to **minimize total net procurement cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `minOrders` | `number[]` | Minimum order quantity $L_i$ from supplier $i$ |
| `maxOrders` | `number[]` | Maximum supply limit $U_i$ from supplier $i$ |
| `baseCosts` | `number[]` | Standard unit price $c_i$ |
| `discounts` | `number[]` | Per-unit rebate $d_i$ when contract $b_i = 1$ |
| `contractFees` | `number[]` | Fixed fee $F_i$ to activate contract $b_i = 1$ |
| `totalDemand` | `number` | Minimum total quantity $\sum_i x_i$ required |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `b` | `number[]` | Binary (`0` or `1`) discount contract selections |
| `x` | `number[]` | Order quantities $x_i \in [L_i, U_i]$ |
| `z` | `number[]` | Linearized bilinear products $z_i = b_i x_i$ |
| `totalCost` | `number` | Minimized net procurement cost |

<!-- section:example -->
**Input**

```json
{
  "minOrders": [10, 15, 10],
  "maxOrders": [50, 60, 40],
  "baseCosts": [20, 22, 18],
  "discounts": [5, 6, 3],
  "contractFees": [160, 220, 150],
  "totalDemand": 95
}
```

**Output**

```json
{
  "b": [1, 0, 0],
  "x": [50, 15, 30],
  "z": [50, 0, 0],
  "totalCost": 1780
}
```

Ordering `[50, 15, 30]` totals $95 \ge 95$ within bounds, activates only contract 0 (`z = [50, 0, 0]`), and costs $(20 \times 50 + 22 \times 15 + 18 \times 30) + 160 - 5 \times 50 =$ **1,780**.
