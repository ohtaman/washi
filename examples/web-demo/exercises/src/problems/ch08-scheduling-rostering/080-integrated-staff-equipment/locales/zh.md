# #080. 资质员工、时段与共享设备一体化集成调度

<!-- section:scenario -->
某医院或制造中心需要将 $J$ 项工序联合分配到 $T$ 个时间片与 $N$ 名员工。每项工序必须指定一个时间片及一名具备该工序认证资质的员工，每位员工在同一时间片至多承担一项工序，且每个时间片内所有并行工序消耗的共享设备总数不能超过设备池上限。

每位员工都有常规工时配额、最大工时上限、基础单班成本以及超出常规配额后的额外加班单价，同时不同工序在不同时间片带有偏好延迟惩罚。请协同决策人员、时段与加班量，最小化总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `certified` | `number[][]` | $N \times J$ 的 `0`/`1` 矩阵，表示员工 $i$ 是否具备工序 $j$ 的操作资质 |
| `equipNeeds` | `number[]` | 工序 $j$ 占用的共享设备数量 |
| `equipCap` | `number` | 每个时间片可用的共享设备总上限 |
| `slotPenalties` | `number[][]` | 将工序 $j$ 安排至时间片 $t$ 的偏好惩罚（$J \times T$） |
| `staffCosts` | `number[]` | 员工 $i$ 每承担一个时间片的基础人力成本 |
| `regularLimits` | `number[]` | 员工 $i$ 计入加班前的常规时段上限 $R_i$ |
| `maxLimits` | `number[]` | 员工 $i$ 允许承担的最大总时段数 $M_i$ |
| `overtimeCosts` | `number[]` | 员工 $i$ 超出常规配额后每单位加班的附加成本 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignedStaff` | `number[]` | 为每项工序 $j$ 分配的员工编号 `0..N-1` |
| `assignedSlot` | `number[]` | 为每项工序 $j$ 分配的时间片编号 `0..T-1` |
| `overtime` | `number[]` | 每位员工 $i$ 的非负加班时段数 |
| `totalCost` | `number` | 最小化的总成本（基础人力 + 加班成本 + 时段惩罚） |

<!-- section:example -->
**输入示例**

```json
{
  "certified": [
    [1, 1, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 1, 1]
  ],
  "equipNeeds": [1, 2, 1, 1],
  "equipCap": 3,
  "slotPenalties": [
    [0, 6],
    [2, 5],
    [0, 4],
    [5, 0]
  ],
  "staffCosts": [20, 22, 18],
  "regularLimits": [1, 1, 1],
  "maxLimits": [2, 2, 2],
  "overtimeCosts": [15, 14, 16]
}
```

**输出示例**

```json
{
  "assignedStaff": [2, 0, 1, 2],
  "assignedSlot": [0, 1, 0, 1],
  "overtime": [0, 0, 1],
  "totalCost": 99
}
```

时段 0 执行工序 0 和 2（设备 $1+1=2 \le 3$），时段 1 执行工序 1 和 3（设备 $2+1=3 \le 3$），员工 2 承担 1 个加班时段，总成本为 $(20 + 22 + 2 \times 18) + 16 \times 1 + (0 + 5 + 0 + 0) =$ **99**。
