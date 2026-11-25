# #049. SMT-LIRA 模式选择与时间窗调度

<!-- section:scenario -->
物流枢纽需要在单个卸货泊位上为多批到港货物决定配送模式及连续卸货时段 `[start, end]`，满足以下规则：

- **模式选择与时间窗**：每批货物在标准模式（无加急费）与加急模式（支付 `expFee`，启用 `expWindow` 与 `expDuration`）之间二选一；其完整卸货区间 `[start, end]`（满足 `end = start + duration`）必须完全落在所选模式的时间窗 `[earliestStart, latestEnd]` 内。
- **加急配额上限**：采用加急模式的货物总数不得超过整数上限 `maxExpress`。
- **避开禁停时段**：每批货物必须避开泊位检修禁停时段 `[bStart, bEnd]`，即在 `bStart` 或之前完工，或在 `bEnd` 或之后开始。
- **单泊位互不重叠**：任意两批货物在泊位上不得重叠（其中一批必须在另一批开始之前或同时完工）。
- **延误惩罚**：若完工时间超过交期 `dueTime`，则按超出时长乘以 `tardinessPenalty` 计收连续线性延误惩罚。

请同时决策各批货物的配送模式与连续起止时间，使加急总费用与延误总惩罚之和最小。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `shipments` | `ShipmentSpec[]` | 各批货物规格（标准/加急时间窗 `stdWindow`・`expWindow`、作业时长 `stdDuration`・`expDuration`、加急费 `expFee`、交期 `dueTime` 与延误惩罚率 `tardinessPenalty`） |
| `blackout` | `[number, number]` | 泊位检修禁停时段 `[bStart, bEnd]` |
| `maxExpress` | `number` | 允许选用加急模式的货物整数上限 |

每个 `ShipmentSpec` 对象为 `{ stdWindow: [number, number], expWindow: [number, number], stdDuration: number, expDuration: number, expFee: number, dueTime: number, tardinessPenalty: number }`，其中 `stdWindow` 与 `expWindow` 为包含该批货物整个卸货区间的 `[earliestStart, latestEnd]` 边界。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `express` | `boolean[]` | 各批货物是否采用加急模式 |
| `startTimes` | `number[]` | 各批货物的连续开始作业时间 |
| `endTimes` | `number[]` | 各批货物的连续完工时间 |
| `totalCost` | `number` | 最小化的加急费与延误惩罚总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "shipments": [
    {
      "stdWindow": [0, 6],
      "expWindow": [0, 6],
      "stdDuration": 2.5,
      "expDuration": 1.5,
      "expFee": 20,
      "dueTime": 3,
      "tardinessPenalty": 10
    },
    {
      "stdWindow": [0, 5],
      "expWindow": [0, 5],
      "stdDuration": 2,
      "expDuration": 1,
      "expFee": 15,
      "dueTime": 3,
      "tardinessPenalty": 12
    }
  ],
  "blackout": [3, 4],
  "maxExpress": 1
}
```

**输出示例**

```json
{
  "express": [false, true],
  "startTimes": [0, 4],
  "endTimes": [2.5, 5],
  "totalCost": 39
}
```

货物 0 在禁停时段 [3, 4] 前按标准模式于 [0, 2.5] 完工（延误为 0），货物 1 切换加急模式于 [4, 5] 完工，加急费 15 加延误惩罚 12 × (5 - 3) = 24，总成本为 39。


<!-- section:hint1 -->
为每批货物建立一个布尔模式选择变量（加急模式或标准模式），以及连续的开始时间、完工时间和非负延误变量。选择加急模式可缩短作业时长并启用其专属时间窗，同时所有货物都必须避开禁停时段且在单一泊位上互不重叠。

<!-- section:hint2 -->
将每个 `m.bool(...)` 模式变量与一个 `m.binary(...)` 标志配对，以便在算术求和与目标项中使用（如 `sum(expFlag).le(input.maxExpress)` 与加急费用）。使用 `implies(...)` 与 `not(...)` 约束不同模式下的时间窗与时长，使用 `or(...)` 配合 `expr` 不等式直接表达避开禁停时段（$\text{end}_i \le b_{\text{start}}$ 或 $\text{start}_i \ge b_{\text{end}}$）与两两互不重叠（$\text{end}_i \le \text{start}_j$ 或 $\text{end}_j \le \text{start}_i$），最后调用 `await m.solve({ solver: "z3" })` 求解。
