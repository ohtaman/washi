# #049. SMT-LIRA 模式选择与时间窗调度

<!-- section:scenario -->
物流枢纽需要在单个卸货泊位上安排多批到港货物的作业调度。每批货物可在标准模式与加急模式之间二选一：加急模式需支付额外费用并启用对应的连续时间窗与更短的小数作业时长，且选择加急模式的总批次数受整数配额上限约束。

所有货物的作业时段都必须避开泊位检修禁停窗口，任意两批货物在泊位上不能重叠；若完工时间超过承诺交期，则按单位时间计收连续延误惩罚。请同时决策各货物的配送模式与连续起止时间，使加急总费用与延误总惩罚之和最小。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `shipments` | `ShipmentSpec[]` | 各批货物的标准/加急时间窗、作业时长、加急费、交期与延误惩罚率 |
| `blackout` | `[number, number]` | 泊位检修禁停时段 `[bStart, bEnd]` |
| `maxExpress` | `number` | 允许选用加急模式的货物整数上限 |

每个 `ShipmentSpec` 对象为 `{ stdWindow: [number, number], expWindow: [number, number], stdDuration: number, expDuration: number, expFee: number, dueTime: number, tardinessPenalty: number }`。

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

货物 0 在检修窗口 `[3, 4]` 前按标准模式于 `[0, 2.5]` 完工（延误为 0），货物 1 切换加急模式于 `[4, 5]` 完工，加急费 15 加延误惩罚 `12 * (5 - 3) = 24`，总成本为 39。


<!-- section:hint1 -->
为每批货物建立一个布尔模式选择变量（加急 Express 或标准 Standard），以及连续的开始时间、结束时间和非负延迟时间变量。选择 Express 模式可缩短处理时长并启用其专属时间窗，同时所有货物都必须避开维护停机时段且在单一泊位上互不重叠。

<!-- section:hint2 -->
将每个 `m.bool(...)` 模式变量与一个 `m.binary(...)` 标志配对，以便在算术求和与目标项中使用（如 `sum(expFlag) <= maxExpress` 与加急费用）。使用 `implies(...)` 与 `not(...)` 约束不同模式下的时间窗与时长，使用 `or(...)` 直接表达避开停机时段（`end[i] <= blackout[0]` 或 `start[i] >= blackout[1]`）与两两互不重叠（`end[i] <= start[j]` 或 `end[j] <= start[i]`），最后调用 `await m.solve({ solver: "z3" })` 求解。
