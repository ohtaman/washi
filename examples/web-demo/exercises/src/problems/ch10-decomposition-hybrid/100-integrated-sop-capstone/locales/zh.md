# #100. 综合 S&OP 策略审计与最小扰动重排产（综合压轴）

<!-- section:scenario -->
在企业产销协同计划（S&OP）实践中，排产团队往往同时收到不可违反的工程硬性规定以及带权重的业务软性方针；这些方针之间可能互相矛盾，或共同压低有效产能导致无法覆盖客户总需求。因此，在求解生产排班前必须先精准诊断冲突并做最小代价的规则修复。

请构建两阶段 WaSHI 混合求解流程。第一阶段利用 Z3 SMT 可满足性检测与不可满足核提取构造隐式击中集（IHS）修复循环，放弃总权重最小的软规则子集以恢复全部硬规则和产能覆盖的可行性；第二阶段在修复后的规则下用 HiGHS 求解混整规划，最小化固定开机费、生产费及相对基准排程的变更扰动罚金总和。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `capacities` | `number[]` | 各产线 $i$ 开机后的最大产能 |
| `fixedCosts` | `number[]` | 各产线 $i$ 的固定开机成本 |
| `prodCosts` | `number[]` | 各产线 $i$ 的单位生产成本 |
| `demand` | `number` | 需要满足的总需求量 |
| `baselineActive` | `number[]` | 基准开机计划（0/1 向量） |
| `disruptionPenalty` | `number` | 每条产线偏离基准启停状态一次产生的变更惩罚 |
| `hardRules` | `PolicyRule[]` | 必须严格执行的硬性业务规则 |
| `softRules` | `Array<PolicyRule & { weight: number }>` | 带有松弛惩罚权重的软性策略规则 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `droppedPolicies` | `string[]` | 取得最小放弃总权重的软策略规则 ID 列表 |
| `activeAssignments` | `number[]` | 满足保留规则的最优 0/1 产线开机方案 |
| `quantities` | `number[]` | 各产线的连续生产产量分配 |
| `totalCost` | `number` | 固定成本、生产成本与变更扰动罚金之和 |

<!-- section:example -->
**输入示例**

```json
{
  "capacities": [40, 50, 45, 35],
  "fixedCosts": [120, 150, 130, 100],
  "prodCosts": [10, 8, 9, 12],
  "demand": 90,
  "baselineActive": [1, 1, 0, 0],
  "disruptionPenalty": 40,
  "hardRules": [{ "id": "hard_min_backup", "type": "min_active", "lines": [2, 3] }],
  "softRules": [
    { "id": "soft_run_0", "type": "must_run", "line": 0, "weight": 25 },
    { "id": "soft_idle_2", "type": "must_idle", "line": 2, "weight": 10 },
    { "id": "soft_idle_3", "type": "must_idle", "line": 3, "weight": 18 }
  ]
}
```

**输出示例**

```json
{
  "droppedPolicies": ["soft_idle_2"],
  "activeAssignments": [1, 1, 1, 0],
  "quantities": [0, 50, 40, 0],
  "totalCost": 1200
}
```

放弃权重较低的 `soft_idle_2`（`10 < 18`）即可消解与 `hard_min_backup` 的矛盾。最终开机 `[1, 1, 1, 0]` 的固定成本为 `400`、生产成本为 `760`、单线变更罚金为 `40`，最小总成本为 **1200**。
