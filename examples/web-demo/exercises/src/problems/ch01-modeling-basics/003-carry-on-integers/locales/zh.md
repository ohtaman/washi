# #003. 行李打包与整数变量

<!-- section:scenario -->
向有总承重上限的行李包中装入若干类物品。每类物品都有单位重量、单位价值和最多可携带的件数上限。请为每类物品选择 **整数件数**，在不超过各自件数上限和行李总承重上限的前提下，**最大化装入物品的总价值**。

初始代码中故意留有两处缺失：变量仍声明为连续实数，并且缺少总重量上限约束。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `maxWeight` | `number` | 行李最大承重上限 |
| `weights` | `number[]` | 各类物品的单件重量 |
| `values` | `number[]` | 各类物品的单件价值 |
| `maxCounts` | `number[]` | 各类物品最多可装入的件数 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `counts` | `number[]` | 各类物品的装入件数（全部为整数） |
| `totalValue` | `number` | 最大化后的总价值 |

<!-- section:example -->
**输入示例**

```json
{
  "maxWeight": 10,
  "weights": [3, 4, 2],
  "values": [40, 55, 22],
  "maxCounts": [2, 2, 3]
}
```

**输出示例**

```json
{
  "counts": [2, 1, 0],
  "totalValue": 135
}
```

装入 2 件物品 0 与 1 件物品 1 时，总重量恰好为 $2 \times 3 + 1 \times 4 = 10$，取得整数规划最大总价值 **135**。

<!-- section:hint1 -->
- **WaSHI**：使用 `m.integer(...)` 声明整数变量，并使用 `` m.constraint(expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`) `` 添加重量上限。
- **highspy**：使用 `h.addIntegral(lb=0, ub=cap, name=f"item_{i}")` 声明整数变量，并添加 `h.addConstr(h.qsum(...) <= input_data["maxWeight"])`。

<!-- section:hint2 -->
即使声明为整数变量，求解器内部的浮点精度也可能返回类似 `1.999999999` 的值，构造返回值时用 `Math.round(...)` / `round(...)` 取整是良好习惯。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} \quad \forall i
\end{aligned}
$$
