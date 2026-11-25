# #069. 储能电池分时电价套利与削峰调度

<!-- section:scenario -->
某园区配置了一套并网储能电池系统，需要在多个 1 小时周期（每周期功率 kW 数值上等于该小时电量 kWh）内应对分时电价（TOU）与最大需量电费，以降低用电总账单。

- **充放电功率与互斥约束**：每个周期电池只能在额定功率上限内选择充电或放电，不能同时充放。
- **电网净购电**：每周期电网净购电功率等于基础负荷加上充电功率减去放电功率，且须保持非负（不允许向电网反送电）。
- **效率与荷电状态（SOC）**：充电按充电效率转化为 SOC 增量，放电按放电效率的倒数扣减 SOC；每周期末 SOC 须保持在允许的上下限内，并在最后一期满足终端荷电下限。
- **最大需量电费**：全周期的最大电网净购电功率需按单位需量费计费。

请联合规划各周期充放电功率、SOC 轨迹与最大需量峰值，以 **最小化电度电费与需量电费总和**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `baseLoads` | `number[]` | 各 1 小时周期的设施基础电力负荷（kW，每周期等于 kWh） |
| `prices` | `number[]` | 各周期电网分时购电单价（每 kWh） |
| `demandCharge` | `number` | 全周期最大电网净购电功率对应的单位需量费（每 kW） |
| `capacity` | `number` | 电池最大储能容量上限（kWh） |
| `minSoc` | `number` | 电池允许的最低荷电状态（kWh） |
| `initSoc` | `number` | 第 0 期之前的初始荷电状态（kWh） |
| `minFinalSoc` | `number` | 最后一期结束时的最低荷电要求（kWh） |
| `maxPower` | `number` | 电池每期最大充放电额定功率（kW） |
| `etaCharge` | `number` | 充电效率，取值范围为 (0, 1] |
| `etaDischarge` | `number` | 放电效率，取值范围为 (0, 1] |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `charge` | `number[]` | 各周期充电功率（kW，0 至 `maxPower`） |
| `discharge` | `number[]` | 各周期放电功率（kW，0 至 `maxPower`） |
| `soc` | `number[]` | 各周期末电池荷电状态（kWh，`minSoc` 至 `capacity`） |
| `peakLoad` | `number` | 全周期最大电网净购电功率（kW） |
| `totalCost` | `number` | 最小化后的电度电费与需量电费总和 |

<!-- section:example -->
**输入示例**

```json
{
  "baseLoads": [40, 50, 80, 110, 95, 55],
  "prices": [0.1, 0.12, 0.25, 0.35, 0.28, 0.12],
  "demandCharge": 8,
  "capacity": 80,
  "minSoc": 10,
  "initSoc": 30,
  "minFinalSoc": 30,
  "maxPower": 30,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**输出示例**

```json
{
  "charge": [30, 30, 0, 0, 0, 25],
  "discharge": [0, 0, 0, 30, 24.4, 0],
  "soc": [54, 78, 78, 40.5, 10, 30],
  "peakLoad": 80,
  "totalCost": 733.968
}
```

谷时段充电至 `soc = 78`，并在第 3–4 高负荷时段放电削峰，将全周期电网负荷压平至 [70, 80, 80, 80, 70.6, 80]（`peakLoad = 80`）同时末期保持 SOC 30，分时电度电费 93.968 加上需量电费 $8 \times 80$，总电费为 $93.968 + 8 \times 80 =$ **733.968**。


<!-- section:hint1 -->
为每一期定义充电功率、放电功率、期末荷电状态（SOC）及电网净购电功率的连续变量，每期再定义一个防止同时充放电的二元模式指示变量，并定义一个表示峰值电网负荷的标量变量。

<!-- section:hint2 -->
在 SOC 状态转移方程中，充电增加 `etaCharge * charge[t]` 而放电减少 `discharge[t] / etaDischarge`。引入辅助变量表示非负电网净购电 `gridLoad[t]`（`baseLoads[t] + charge[t] - discharge[t]`）及二元模式变量 `mode[t]` 以强制充放电互斥（`charge[t] <= maxPower * mode[t]` 与 `discharge[t] <= maxPower * (1 - mode[t])`），将末期 SOC 下界设为 `max(minSoc, minFinalSoc)`，并对所有周期约束 `peakLoad >= gridLoad[t]` 以线性化需量电费。
