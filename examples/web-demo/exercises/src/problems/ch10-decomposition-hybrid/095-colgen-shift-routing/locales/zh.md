# #095. 基于列生成的班表排班问题

<!-- section:scenario -->
运营主管需要在多天计划期内为同质员工安排轮班班表，确保每天出勤人数不低于最低需求。每位员工的班次模式除产生固定基础成本外，还按出勤日产生每日工资；每个班次的总出勤天数至少为一天且不超过上限，且连续工作天数也不得超过连班上限。

借助 WaSHI 列生成接口从受限主问题中动态定价并生成合规的多天班次模式，最终求解整数规划以最小化总用工成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 第 $d$ 天的最低在岗人数需求 |
| `shiftCosts` | `number[]` | 第 $d$ 天每名员工出勤的日工资成本 |
| `baseCost` | `number` | 每名员工班次列的固定基础成本 |
| `maxConsecutive` | `number` | 单一班次模式允许的最大连续工作天数 |
| `maxWorkDays` | `number` | 单一班次模式允许的最大总工作天数 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `selectedColumns` | `number[][]` | 选用的 0/1 班次向量列表（每个向量长度为 `demands.length`） |
| `counts` | `number[]` | 分配给各选中班次模式的非负整数员工人数 |
| `totalCost` | `number` | 总排班成本 $\sum_p \text{counts}[p] \cdot (\text{baseCost} + \sum_d \text{shiftCosts}[d] \cdot a_{pd})$ |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [2, 3, 4, 3, 2],
  "shiftCosts": [12, 10, 11, 10, 13],
  "baseCost": 25,
  "maxConsecutive": 3,
  "maxWorkDays": 4
}
```

**输出示例**

```json
{
  "selectedColumns": [
    [1, 0, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 0, 1]
  ],
  "counts": [1, 2, 1],
  "totalCost": 254
}
```

每个班次总工作天数 `<= 4`、连续工作天数 `<= 3`，每日覆盖人数 `[2, 3, 4, 3, 2]` 满足需求，总成本为 `1 * 71 + 2 * 56 + 1 * 71 =` **254**。

<!-- section:hint1 -->
将问题分解为选择各班次模式人数以满足每日需求的受限主问题（RMP），以及生成单一合规多天班次模式的二元 MIP 定价子问题。为确保初始 LP 可行，先为所有存在正需求的日期添加仅在该日出勤的初始列。

<!-- section:hint2 -->
在包含 `demand_${d}` 约束的主问题上调用 `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`。在 `pricing({ getDual })` 中对二元向量 $a_d \in \{0,1\}$ 施加 $1 \le \sum_d a_d \le \text{maxWorkDays}$ 与长度为 $\text{maxConsecutive}+1$ 的滑动窗口连班上限约束，最大化 $\sum_d (\pi_d - \text{shiftCosts}[d]) a_d$，并在 $\text{baseCost} - \text{sub.objectiveValue!} < -10^{-5}$ 时返回新列提案。
