# #002. Two-Flavor Creamery (Adding a Constraint)

<!-- section:scenario -->
An ice cream shop makes **vanilla** and **chocolate** ice cream (in non-negative continuous liters) using limited daily supplies of **milk** and **sugar**.

In the starter code, the decision variables, the milk capacity constraint, and the profit-maximization objective are already in place, while the **sugar capacity constraint is intentionally missing**.

1. Run the starter right away to observe the **VIOLATION** verdict indicating that sugar consumption exceeds capacity.
2. Add the linear sugar capacity constraint to keep total sugar used within budget, then run again for **AC**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `milkCap` | `number` | Available milk capacity |
| `sugarCap` | `number` | Available sugar capacity |
| `vanillaProfit` | `number` | Profit per liter of vanilla |
| `chocoProfit` | `number` | Profit per liter of chocolate |
| `vanillaMilk` | `number` | Milk required per liter of vanilla |
| `vanillaSugar` | `number` | Sugar required per liter of vanilla |
| `chocoMilk` | `number` | Milk required per liter of chocolate |
| `chocoSugar` | `number` | Sugar required per liter of chocolate |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `vanilla` | `number` | Vanilla quantity (liters) |
| `chocolate` | `number` | Chocolate quantity (liters) |
| `totalProfit` | `number` | Maximized total profit |

<!-- section:example -->
**Input**

```json
{
  "milkCap": 90,
  "sugarCap": 80,
  "vanillaProfit": 500,
  "chocoProfit": 300,
  "vanillaMilk": 3,
  "vanillaSugar": 1,
  "chocoMilk": 1,
  "chocoSugar": 2
}
```

**Output**

```json
{
  "vanilla": 20,
  "chocolate": 30,
  "totalProfit": 19000
}
```

Making only vanilla (the higher-margin flavor) hits the milk limit at 30 L and 15,000 profit. Blending 20 L vanilla and 30 L chocolate uses all 90 milk and 80 sugar for **19,000** profit.

<!-- section:hint1 -->
Copy the pattern of the `milk` constraint right above the `TODO` comment, changing `milk` to `sugar` and using `input.vanillaSugar`, `input.chocoSugar`, and `input.sugarCap`.

<!-- section:hint2 -->
Notice why `chocolate = 90` was picked before you added the sugar limit: `chocolate` returns `300 / 1 = 300` profit per unit of milk (vs `500 / 3 = 166.7` for vanilla), so without the sugar constraint the solver pours all milk into chocolate — exceeding sugar (`180 > 80`).

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_v v + p_c c \\
\text{s.t.} \quad & m_v v + m_c c \le M_{\text{cap}} \\
& s_v v + s_c c \le S_{\text{cap}} \\
& v, c \ge 0
\end{aligned}
$$
