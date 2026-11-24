# #025. Binary-Continuous Product (Glover Linearization)

<!-- section:scenario -->
A procurement specialist is planning raw material orders (continuous quantities in kg) from multiple suppliers to meet a total demand requirement. Regardless of whether a discount contract is signed, each supplier has a minimum order quantity (kg) and a maximum supply limit (kg), with a standard base unit price (JPY/kg).

By paying a fixed contract fee (JPY) for a supplier, you can sign a discount contract that grants a per-kg discount on every kilogram ordered from that supplier. Decide whether to sign each contract, the order quantity for each supplier, and the discounted volume representing their product, so as to **minimize total procurement cost (JPY)**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `minOrders` | `number[]` | Minimum order quantity $L_i$ for supplier $i$ (kg) |
| `maxOrders` | `number[]` | Maximum supply limit $U_i$ for supplier $i$ (kg) |
| `baseCosts` | `number[]` | Base unit price $c_i$ for supplier $i$ (JPY/kg) |
| `discounts` | `number[]` | Unit discount $d_i$ when contracted ($b_i = 1$) (JPY/kg) |
| `contractFees` | `number[]` | Fixed contract fee $F_i$ when contracted (JPY) |
| `totalDemand` | `number` | Required lower bound on total order quantity $\sum_i x_i$ (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `b` | `number[]` | Discount contract selection (0 or 1) |
| `x` | `number[]` | Order quantity $x_i \in [L_i, U_i]$ for each supplier (kg) |
| `z` | `number[]` | Discounted volume representing the product $z_i = b_i x_i$ (kg) |
| `totalCost` | `number` | Minimized total procurement cost (JPY) |

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

Order quantities [50, 15, 30] total $95 \ge 95$ kg and satisfy all bounds; signing only with supplier 0 (`z` is [50, 0, 0]) yields a total cost of $(20 \times 50 + 22 \times 15 + 18 \times 30) + 160 - 5 \times 50 =$ **1,780** JPY.


<!-- section:hint1 -->
For each supplier, model three linked quantities: a binary variable for whether the discount contract is signed, a continuous order quantity bounded by the supplier's minimum and maximum order limits, and a continuous auxiliary variable representing their bilinear product.

<!-- section:hint2 -->
Use Glover's four-inequality exact linearization over $x_i \in [L_i, U_i]$ to enforce $z_i = b_i x_i$: two bounds driven by $b_i$ ($L_i b_i \le z_i \le U_i b_i$) force $z_i = 0$ when $b_i = 0$, while two shifted bounds driven by $(1 - b_i)$ ($x_i - U_i(1 - b_i) \le z_i \le x_i - L_i(1 - b_i)$) force $z_i = x_i$ when $b_i = 1$. Notice that since $z_i$ enters the minimization objective with a negative coefficient $-d_i$, omitting the upper bounds would let $z_i$ inflate artificially! Also enforce that total orders meet `totalDemand`.