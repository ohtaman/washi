# #003. Carry-On Packing & Integers

<!-- section:scenario -->
You are packing a travel bag with up to a given total weight limit. For each item type, you know its unit weight, value, and maximum allowed count, and you must decide an **integer** quantity of each item (from zero up to its individual cap) to **maximize total value** without exceeding the bag weight limit.

The starter code currently has two deliberate gaps: it uses continuous variables instead of integer variables, and it omits the total weight limit constraint.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `maxWeight` | `number` | Maximum bag weight capacity |
| `weights` | `number[]` | Unit weight of each item type |
| `values` | `number[]` | Value of each item type |
| `maxCounts` | `number[]` | Maximum quantity allowed per item type |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `counts` | `number[]` | Integer quantity packed for each item type |
| `totalValue` | `number` | Maximized total value |

<!-- section:example -->
**Input**

```json
{
  "maxWeight": 10,
  "weights": [3, 4, 2],
  "values": [40, 55, 22],
  "maxCounts": [2, 2, 3]
}
```

**Output**

```json
{
  "counts": [2, 1, 0],
  "totalValue": 135
}
```

Packing 2 units of Item 0 and 1 unit of Item 1 gives weight $2 \times 3 + 1 \times 4 = 10$, achieving the maximum integer total value of **135**.

<!-- section:hint1 -->
- **WaSHI**: Declare integer arrays with `m.integer("item_" + i, { lb: 0, ub: cap })` inside `map`, and add the weight limit using `` expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}` ``.
- **highspy**: Use `h.addIntegral(lb=0, ub=cap, name=f"item_{i}")` and add `h.addConstr(h.qsum(w * x for w, x in zip(weights, counts)) <= input_data["maxWeight"])`.

<!-- section:hint2 -->
Without the integer requirement (`continuous`), packing fractional units can reach higher LP relaxation values that are physically impossible for whole items! Using `Math.round(...)` (`round(...)` in Python) when reading solved integer variables also safely cleans `1.999999999` tolerances.

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} \quad \forall i
\end{aligned}
$$
