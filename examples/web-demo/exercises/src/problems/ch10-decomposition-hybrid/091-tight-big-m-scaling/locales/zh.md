# #091. 紧致 Big-M 与模型尺度优化

<!-- section:scenario -->
某制造企业需要决定开启哪些工厂并安排各厂产量，在满足总需求的前提下最小化固定启用成本与变动生产成本之和。当部分工厂的物理产能远大于总需求时，若直接采用极大的任意常数甚至未裁剪的原始产能作为 Big-M，将导致连续 LP 松弛下界严重偏弱。

请根据实例参数为每座工厂推导最紧致的 Big-M 常数来建立启用与产能关联约束，并同时返回整数最优解以及该紧致模型的 LP 松弛目标值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fixedCosts` | `number[]` | 开启工厂 $i$ 所需的固定成本 |
| `unitCosts` | `number[]` | 工厂 $i$ 的单位生产成本 |
| `capacities` | `number[]` | 工厂 $i$ 的物理最大产能 |
| `demand` | `number` | 必须满足的总需求量 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `open` | `number[]` | 各工厂开启状态（`0` 或 `1`） |
| `quantities` | `number[]` | 各工厂的非负连续产量 |
| `totalCost` | `number` | 最小化总成本（固定成本加单位成本） |
| `lpBound` | `number` | 紧致 Big-M 模型的连续 LP 松弛目标值 |

<!-- section:example -->
**输入示例**

```json
{
  "fixedCosts": [1000, 200, 450],
  "unitCosts": [10, 12, 11],
  "capacities": [500, 40, 80],
  "demand": 60
}
```

**输出示例**

```json
{
  "open": [0, 0, 1],
  "quantities": [0, 0, 60],
  "totalCost": 1110,
  "lpBound": 1050
}
```

仅开启工厂 2 并生产 $60 \le 80$ 单位满足总需求 $60$，总成本为 $450 + 11 \times 60 =$ **1,110**，紧致 Big-M 的 LP 松弛下界为 **1,050**。

<!-- section:hint1 -->
为每座工厂建立二元开启决策变量和非负连续产量变量。在满足总需求并将每座工厂产量与其开启指示变量关联的约束下，最小化固定启用成本与变动生产成本之和。

<!-- section:hint2 -->
任何单座工厂都不需要生产超过总需求的数量，因此工厂 $i$ 最紧致的 Big-M 应取 $M_i = \min(\text{capacities}[i], \text{demand})$，而非原始产能或任意大常数。在 WaSHI 中构建一次 MIP 并在 `await m.solve()` 之前调用 `await m.relax()` 读取 `lpBound`；在 PuLP 中则分别求解连续松弛（二元变量松弛至 $[0, 1]$）和 MIP。
