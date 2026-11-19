# #007. 一对一任务指派问题

<!-- section:scenario -->
人数相同的员工与任务两两对应，每名员工完成不同任务都有各自对应的指派成本。

请构造一个 **一对一指派方案**，确保每位员工恰好承担 **1 项任务** 且每项任务恰好由 **1 名员工** 完成，从而 **最小化总指派成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[][]` | $n \times n$ 成本方阵，`costs[i][j]` 表示员工 $i$ 执行任务 $j$ 的成本 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignment` | `number[]` | 长度为 $n$ 的数组，`assignment[i]` 为分给员工 $i$ 的任务编号 |
| `totalCost` | `number` | 最小化后的总指派成本 |

<!-- section:example -->
**输入示例**

```json
{
  "costs": [
    [9, 2, 7],
    [6, 4, 3],
    [5, 8, 1]
  ]
}
```

**输出示例**

```json
{
  "assignment": [1, 0, 2],
  "totalCost": 9
}
```

逐行贪心选取最小成本会得到 $2 + 3 + 5 = 10$；全局最优匹配 `[1, 0, 2]` 的总成本为 $2 + 6 + 1 =$ **9**。

<!-- section:hint1 -->
初始代码中已声明二维 0-1 变量矩阵 `x[i][j]`：
- **行约束**（每位员工恰好做 1 件事）：`sum(x[i]) == 1`
- **列约束**（每项任务恰好由 1 人做）：`sum(x.map((row) => row[j])) == 1`

<!-- section:hint2 -->
求解后遍历每一行 `i`，找出满足 `Math.round(x[i][j].value!) === 1`（Python 中 `round(h.val(x[i][j])) == 1`）的列下标 `j` 即可还原 `assignment[i]`。

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$
