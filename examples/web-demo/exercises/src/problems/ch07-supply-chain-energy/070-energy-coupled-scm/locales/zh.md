# #070. 生产批量与储能电价耦合综合调度

<!-- section:scenario -->
某制造厂在多个 1 小时周期（每周期功率 kW 数值上等于该小时电量 kWh）内将单品目批量生产计划与厂区能源管理联合优化，协同应对分时电价（TOU）、最大需量电费及厂内储能电池调度。

- **生产与库存**：产品从零期初库存出发，任一周期开机生产需支付固定开机成本，并可在产能上限内连续生产；在满足各周期产品需求的前提下，结转至下期的余量需支付单位持有成本。
- **电力耦合与电网购电**：厂区总用电负荷等于非生产基础负荷加上开机空载待机功耗与生产加工功耗；电网净购电功率等于厂区总负荷加上电池充电减去电池放电，且须保持非负（无余电上网），全周期最大电网净购电功率需按需量单价计费。
- **电池调度**：自带初始荷电状态（SOC）的电池在额定功率上限内选择充电或放电（不能同时充放），按充放电效率更新 SOC 并保持在 0 至电池容量上限之间，且末期须至少恢复至初始 SOC。

请协同决策生产开关、产量、产品库存与电池充放电，**最小化生产、库存、电度及需量总成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 各周期产品需求量（单位） |
| `setupCost` | `number` | 每次开机生产的固定成本 |
| `holdCost` | `number` | 产品库存每单位每期持有成本 |
| `prodCap` | `number` | 单期最大生产产能上限（单位） |
| `setupPower` | `number` | 产线开机时的固定待机功耗（kW） |
| `unitPower` | `number` | 每生产 1 单位产品的加工功耗（kW/单位） |
| `baseLoads` | `number[]` | 各 1 小时周期的厂区非生产基础电力负荷（kW） |
| `prices` | `number[]` | 各周期电网分时购电单价（每 kWh） |
| `demandCharge` | `number` | 全周期最大电网净购电功率对应的需量单价（每 kW） |
| `batteryCap` | `number` | 电池储能容量上限（kWh，下限为 0） |
| `initSoc` | `number` | 电池初始荷电状态，同时作为末期下限（kWh） |
| `maxPower` | `number` | 电池每期最大充放电功率上限（kW） |
| `etaCharge` | `number` | 充电效率，取值范围为 (0, 1] |
| `etaDischarge` | `number` | 放电效率，取值范围为 (0, 1] |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `setups` | `number[]` | 各周期开机决策（0 或 1） |
| `production` | `number[]` | 各周期非负连续产量（单位） |
| `inventory` | `number[]` | 各周期非负期末产品库存（单位） |
| `charge` | `number[]` | 各周期电池充电功率（kW） |
| `discharge` | `number[]` | 各周期电池放电功率（kW） |
| `soc` | `number[]` | 各周期末电池荷电状态（kWh，末期至少达到 `initSoc`） |
| `peakLoad` | `number` | 全周期最大电网净购电功率（kW） |
| `totalCost` | `number` | 最小化后的生产与能源总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [20, 35, 25, 30],
  "setupCost": 120,
  "holdCost": 1.5,
  "prodCap": 60,
  "setupPower": 10,
  "unitPower": 1.0,
  "baseLoads": [10, 85, 15, 90],
  "prices": [0.5, 2.0, 0.6, 2.2],
  "demandCharge": 8.0,
  "batteryCap": 80,
  "initSoc": 20,
  "maxPower": 35,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**输出示例**

```json
{
  "setups": [1, 0, 1, 0],
  "production": [55, 0, 55, 0],
  "inventory": [35, 0, 30, 0],
  "charge": [8.597561, 0, 3.597561, 0],
  "discharge": [0, 1.402439, 0, 6.402439],
  "soc": [26.878049, 25.125, 28.003049, 20],
  "peakLoad": 83.597561,
  "totalCost": 1449.347561
}
```

在低电价的第 0、2 期提前大批量生产（`production = [55, 0, 55, 0]`）并在低谷期给电池充电，随后在高峰电价的第 1、3 期停产并由电池放电，将四期电网负荷精确拉平至 83.597561；开机费 240、持有费 97.5、分时电度电费 443.067073 与需量电费 668.780488 合计总成本为 $240 + 97.5 + 443.067073 + 668.780488 \approx$ **1,449.35**。


<!-- section:hint1 -->
在同一计划周期上，将单品目批量生产变量（二元开机、连续产量、产品库存）与储能电池调度变量（充电、放电、二元充放电模式、电池 SOC、电网净负荷及峰值负荷标量）组合在一起建模。

<!-- section:hint2 -->
两个子系统通过引入非负辅助变量 `gridLoad[t]` 所表示的分时电力平衡耦合：`gridLoad[t] = baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0`。同时引入二元辅助模式变量 `mode[t]` 强制充放电互斥，用 `etaCharge` 与 `1 / etaDischarge` 缩放 SOC 变化，要求末期满足 `soc[T - 1] >= initSoc`，并通过 `peakLoad >= gridLoad[t]` 刻画需量峰值。
