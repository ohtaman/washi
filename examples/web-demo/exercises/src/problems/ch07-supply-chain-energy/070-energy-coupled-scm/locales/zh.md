# #070. 生产批量与储能电价耦合综合调度

<!-- section:scenario -->
某制造厂需要将多周期单品目批量生产计划与厂区能源管理深度耦合，协同响应分时电价、最大需量电费及厂内储能电池调度。产品从零期初库存出发，在任一周期启动生产都需支付固定开机成本并产生固定空载电力负荷，随后可在产能上限内连续生产（每件额外消耗单位加工电力），结转至下期的余量需支付单位持有成本。

厂区总用电需求等于基础负荷加上开机空载电力和生产加工电力。自带初始电量的电池可在功率上限内选择充电或放电（不能同时充放），按充放电效率更新荷电状态（保持在零至电池容量之间并在末期至少恢复到初始电量），且净电网购电量保持非负（无余电上网）。请协同决策生产开关、产量、产品库存与电池充放电，**最小化生产、库存、电度及需量总成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 第 $t$ 期产品需求 $d_t$ |
| `setupCost` | `number` | 每次开机生产的固定成本 $F$ |
| `holdCost` | `number` | 产品库存每单位每期持有成本 $h$ |
| `prodCap` | `number` | 单期最大生产产能上限 $C_{\text{prod}}$ |
| `setupPower` | `number` | 产线开机时的固定待机功耗 $p_{\text{idle}}$ |
| `unitPower` | `number` | 每生产 1 单位产品的单位耗电量 $p_{\text{unit}}$ |
| `baseLoads` | `number[]` | 厂区非生产基础电力负荷 $L_t$ |
| `prices` | `number[]` | 第 $t$ 期电网分时购电单价 $\pi_t$ |
| `demandCharge` | `number` | 全周期最大电网购电峰值 $\max_t g_t$ 对应的需量单价 $\gamma$ |
| `batteryCap` | `number` | 电池储能容量上限 $E_{\max}$（下限为 0） |
| `initSoc` | `number` | 电池初始荷电状态 $E_{\text{init}}$（同时作为末期下限） |
| `maxPower` | `number` | 电池最大充放电功率上限 $P_{\max}$ |
| `etaCharge` | `number` | 充电效率 $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | 放电效率 $\eta_d \in (0, 1]$ |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `setups` | `number[]` | 各周期开机决策（0 或 1） |
| `production` | `number[]` | 各周期非负连续产量 |
| `inventory` | `number[]` | 各周期非负期末产品库存 |
| `charge` | `number[]` | 各周期电池充电功率 |
| `discharge` | `number[]` | 各周期电池放电功率 |
| `soc` | `number[]` | 各周期末电池荷电状态（`soc[T-1] >= initSoc`） |
| `peakLoad` | `number` | 电网最大净购电峰值 $\max_t g_t$ |
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

在低电价的第 0、2 期提前大批量生产（`production = [55, 0, 55, 0]`）并利用多余功率给电池充电，随后在高峰电价的第 1、3 期停产并由电池放电，将四期电网负荷精确拉平至 83.597561，总成本为 $240 + 97.5 + 443.067073 + 668.780488 \approx$ **1,449.35**。


<!-- section:hint1 -->
在同一计划周期上，将单品目批量生产变量（二元开机、连续产量、产品库存）与储能电池调度变量（充电、放电、二元充放电模式、电池 SOC、电网净负荷及峰值负荷标量）组合在一起建模。

<!-- section:hint2 -->
两个子系统通过分时电力平衡耦合：`gridLoad[t] = baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0`。利用二元模式变量强制充放电互斥，用 $\eta_c$ 与 $1 / \eta_d$ 缩放 SOC 变化，要求末期满足 `soc[T - 1] >= initSoc`，并通过 `peakLoad >= gridLoad[t]` 刻画需量峰值。
