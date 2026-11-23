# #069. 储能电池分时电价套利与削峰调度

<!-- section:scenario -->
某园区配置了一套并网储能电池系统，需要在分时电价（TOU）和全周期最大电网购电功率需量费用的机制下降低用电总账单。每个周期电池只能在额定功率范围内选择充电或放电（不能同时充放），且电网净购电量为基础负荷加上充电功率减去放电功率（不允许向电网反送电，须保持非负）。

充电按充电效率转化为电池荷电状态（SOC）增量，放电按放电效率倒数扣减 SOC；全周期每一期均须处于电池安全 SOC 区间，并在末期满足终端荷电下限。请联合规划充放电功率、SOC 轨迹与最大需量峰值以 **最小化总电费**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `baseLoads` | `number[]` | 第 $t$ 期设施基础电力负荷 $L_t$ |
| `prices` | `number[]` | 第 $t$ 期电网分时购电单价 $\pi_t$ |
| `demandCharge` | `number` | 最大需量峰值 $\max_t g_t$ 对应的单位需量费 $\gamma$ |
| `capacity` | `number` | 电池最大储能容量上限 $E_{\max}$ |
| `minSoc` | `number` | 电池允许的最低荷电状态 $E_{\min}$ |
| `initSoc` | `number` | 第 0 期之前的初始荷电状态 $E_{\text{init}}$ |
| `minFinalSoc` | `number` | 最后一期结束时的最低荷电要求 $E_{\text{end}}$ |
| `maxPower` | `number` | 电池每期最大充放电功率上限 $P_{\max}$ |
| `etaCharge` | `number` | 充电效率 $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | 放电效率 $\eta_d \in (0, 1]$ |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `charge` | `number[]` | 各周期充电功率（$0 \dots P_{\max}$） |
| `discharge` | `number[]` | 各周期放电功率（$0 \dots P_{\max}$） |
| `soc` | `number[]` | 各周期末电池荷电状态（$E_{\min} \dots E_{\max}$） |
| `peakLoad` | `number` | 最大净电网购电功率 $\max_t (L_t + c_t - d_t)$ |
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

谷时段充电至 `soc = 78`，并在第 3–4 高负荷时段放电削峰，将全周期电网负荷压平至 [70, 80, 80, 80, 70.6, 80]（`peakLoad = 80`）同时末期保持 SOC 30，总电费为 $93.968 + 8 \times 80 =$ **733.968**。


<!-- section:hint1 -->
为每一期定义充电功率、放电功率、期末荷电状态（SOC）及电网净购电功率的连续变量，每期再定义一个防止同时充放电的二元模式指示变量，并定义一个表示峰值电网负荷的标量变量。

<!-- section:hint2 -->
在 SOC 状态转移方程中，充电增加 $\eta_c c_t$ 而放电减少 $d_t / \eta_d$，电网净购电满足 `baseLoads[t] + charge[t] - discharge[t] >= 0`。使用二元模式变量对充放电进行互斥关联（`charge[t] <= maxPower * mode[t]` 与 `discharge[t] <= maxPower * (1 - mode[t])`），将末期 SOC 下界设为 $\max(\text{minSoc}, \text{minFinalSoc})$，并对所有时段约束 `peakLoad >= gridLoad[t]` 以线性化需量电费。
