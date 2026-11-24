# #100. 综合 S&OP 策略审计与最小扰动重排产（综合压轴）

<!-- section:scenario -->
在化工与材料制造商的产销协同计划（S&OP）中，排产团队会同时收到产线运行的设备硬性约束以及来自现场和销售部门的带权重软性方针。当方针之间互相冲突，或导致有效产能不足以满足需求时，必须在制定生产计划前，以最小化被放弃方针的总权重来化解矛盾。

请采用 Z3 SMT 冲突分析与 HiGHS 混合整数规划相结合的两阶段混合方法求解：
- **第一阶段（矛盾化解）**：找出总权重最小的待放弃软策略子集，使所有硬规则与总需求产能同时可满足。
- **第二阶段（生产排产）**：在保留的规则下分配各产线启停与产量，最小化固定开机费、单位生产成本及相对基准计划的变更惩罚之和。

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

每个 `PolicyRule` 为带有 `id: string` 及以下 `type` 变体之一的标签对象（`line`、`lines`、`ifLine`、`thenLine` 均为从 0 开始的产线索引）：
- `"must_run"`: `{ id, type: "must_run", line: number }` — 要求 `active[line] === 1`
- `"must_idle"`: `{ id, type: "must_idle", line: number }` — 要求 `active[line] === 0`
- `"min_active"`: `{ id, type: "min_active", lines: number[] }` — 要求 `lines` 中至少有一条产线满足 `active[idx] === 1`
- `"implies"`: `{ id, type: "implies", ifLine: number, thenLine: number, thenActive: boolean }` — 要求若 `active[ifLine] === 1` 则 `active[thenLine] === (thenActive ? 1 : 0)`

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

解除权重最小的 `soft_idle_2`（$10 < 18$）即可消除与 `hard_min_backup` 的矛盾。产线开机 `[1, 1, 1, 0]` 的总产能为 $40 + 50 + 45 = 135 \ge 90$，固定成本为 $120 + 150 + 130 = 400$，生产成本为 $8 \times 50 + 9 \times 40 = 760$，偏离基准 1 条产线的罚金为 $40 \times 1 = 40$，总计 $400 + 760 + 40 =$ **1,200**。

<!-- section:hint1 -->
将求解拆分为两个顺序阶段。第一阶段确定总权重最小的待放弃软规则子集，使剩余规则与总产能能够满足需求；第二阶段固定保留的规则集合，求解包含二元产线启停、连续产量以及偏离 `baselineActive` 指示变量的生产重排产 MIP。

<!-- section:hint2 -->
第一阶段构建隐式击中集（IHS）循环：在 Z3 模型（`await smt.check({ solver: "z3" })`）中将布尔启停变量与用于产能求和的二元整数变量关联，并以 `rule.id` 命名所有硬规则及未放弃的软规则；每当 `status === "Unsat"` 时读取 `res.unsatCore`，将其中软规则的击中集约束（$\sum_{r \in \text{core} \cap \text{soft}} \text{drop}_r \ge 1$）加入最小化 $\sum_r w_r \text{drop}_r$ 的 HiGHS 选删 MIP。第二阶段在 HiGHS MIP 中用 $\delta_i \ge y_i - \text{baseline}_i$ 和 $\delta_i \ge \text{baseline}_i - y_i$ 刻画变更惩罚。
