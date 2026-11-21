# #032. 基于 Element 索引（at）的机器作业指派

<!-- section:scenario -->
某车间需要将 n 项作业指派到 m 台可用机器上（n <= m）。每项作业必须分配一台独立的机器，且任意两项作业不能共用同一台机器。

矩阵元素 costs[i][j] 表示将作业 i 指派给机器 j 时的整数准备成本。请为每项作业选定机器编号 assignment[i]，在保证所选机器互不重复的前提下最小化总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[][]` | `n × m` 整数成本矩阵（`costs[i][j]` 为作业 `i` 分配给机器 `j` 的成本，满足 `n <= m`） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignment` | `number[]` | 每项作业分配到的机器索引（`0` 到 `m - 1`） |
| `totalCost` | `number` | 最小化后的总指派成本 |

<!-- section:example -->
**输入示例**

```json
{
  "costs": [
    [10, 22, 30],
    [12, 25, 18],
    [16, 14, 24]
  ]
}
```

**输出示例**

```json
{
  "assignment": [0, 2, 1],
  "totalCost": 42
}
```

指派 `[0, 2, 1]` 使用了 3 台互不相同的机器，总成本为 `costs[0][0] + costs[1][2] + costs[2][1]` $= 10 + 18 + 14 =$ **42**。

<!-- section:hint1 -->
无需构建 $n \times m$ 的二元指派矩阵，而是为每项作业定义一个取值范围为 `[0, numMachines - 1]` 的整数变量，表示其分配的机器编号，并要求所有作业分配到互不相同的机器。

<!-- section:hint2 -->
使用 `distinct(assignment)` 防止多份作业共用同一台机器。每项作业的成本可通过 Element 约束 `at(row, assignment[i])` 索引读取，然后以 `minimize(sum(input.costs.map((row, i) => at(row, assignment[i]))))` 为目标并用 `solver: "pumpkin"` 求解。
