# #094. 基于列生成的一维下料问题

<!-- section:scenario -->
某造纸厂需要将固定宽度的标准母卷切割成多种尺寸的子卷以满足客户需求，同时最小化母卷消耗总数。随着规格种类增多，可行切割模式数量呈组合爆炸增长，预先枚举全部模式难以扩展。

使用 WaSHI 列生成从受限主问题中动态发现有利可图的切割模式，并最终求解整数规划以最小化消耗的母卷总数。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rollWidth` | `number` | 每根标准母卷的总宽度 |
| `widths` | `number[]` | 每种需求规格 $i$ 的宽度 |
| `demands` | `number[]` | 每种规格 $i$ 的最小需求数量 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `patterns` | `number[][]` | 选用的整数切割模式列表（每个向量长度为 `widths.length`） |
| `counts` | `number[]` | 各选中模式的非负整数母卷数量 |
| `totalRolls` | `number` | 消耗的母卷总数（`sum(counts)`） |

<!-- section:example -->
**输入示例**

```json
{
  "rollWidth": 100,
  "widths": [45, 36, 16],
  "demands": [10, 14, 20]
}
```

**输出示例**

```json
{
  "patterns": [
    [0, 2, 1],
    [1, 1, 1],
    [0, 1, 4]
  ],
  "counts": [1, 10, 3],
  "totalRolls": 14
}
```

三个模式的用宽分别为 `88, 97, 100 <= 100`，总产量 `[10, 15, 23] >= [10, 14, 20]`，共消耗 `1 + 10 + 3 =` **14** 根母卷。

<!-- section:hint1 -->
将问题分解为选择各已有模式使用根数以满足需求的受限主问题（RMP），以及在 `rollWidth` 限制内寻找能降低主问题目标值的新模式的有界背包定价子问题。先用单一规格的简单可行模式初始化主问题，确保初始 LP 始终可行。

<!-- section:hint2 -->
在主问题中建立命名约束 `demand_${i}` 和单位成本为 `1` 的 `master.column(...)` 变量，随后调用 `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`。在 `pricing({ getDual })` 中于 $\sum_i w_i a_i \le W$（整数 $a_i \in [0, \lfloor W / w_i \rfloor]$）约束下最大化 $\sum_i \pi_i a_i$，当检验数 $1 - \sum_i \pi_i a_i < -10^{-5}$ 时返回新列提案。
