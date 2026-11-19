# #009. 多周期生产与库存平滑（流守恒）

<!-- section:scenario -->
某工厂需要对连续多个周期的正常班生产、加班生产以及期末库存进行统筹排程。已知期初库存水平，且每个周期的正常产量、加班产量和仓库库容均有各自上限。

每个周期必须满足物料平衡：“期初（或上期期末）库存 + 本期正常产量 + 本期加班产量 - 本期需求 = 本期期末库存”（各项均非负），并在最后一个周期结束时至少保留规定的安全库存。请制定生产与库存计划以 **最小化总生产与库存保管成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 各周期 $t$ 的客户需求量 |
| `regCap` | `number[]` | 各周期 $t$ 的正常产能上限 |
| `otCap` | `number[]` | 各周期 $t$ 的加班产能上限 |
| `invCap` | `number` | 每期仓库最大存储容量 |
| `initialInventory` | `number` | 初始期初库存 |
| `minFinalInventory` | `number` | 最后一期末最低安全库存下限 |
| `regCost` | `number` | 正常生产单位成本 |
| `otCost` | `number` | 加班生产单位成本 |
| `holdCost` | `number` | 每件每期库存保管费 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `regular` | `number[]` | 各周期正常班产量计划 |
| `overtime` | `number[]` | 各周期加班产量计划 |
| `inventory` | `number[]` | 各周期期末库存计划 |
| `totalCost` | `number` | 最小化后的总生产与保管成本 |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [80, 140, 120, 70],
  "regCap": [100, 100, 100, 100],
  "otCap": [40, 40, 40, 40],
  "invCap": 60,
  "initialInventory": 10,
  "minFinalInventory": 10,
  "regCost": 20,
  "otCost": 32,
  "holdCost": 3
}
```

**输出示例**

```json
{
  "regular": [100, 100, 100, 80],
  "overtime": [0, 10, 20, 0],
  "inventory": [30, 0, 0, 10],
  "totalCost": 8680
}
```

利用第 0 期富余的正常产能提前生产 30 单位并转存到第 1 期，仅需支付每单位 3 的保管费，而避免每单位 12 的加班溢价，从而达到最小总成本 **8,680**。

<!-- section:hint1 -->
初始代码已声明 `regular`、`overtime` 与 `inventory`（含期末安全库存下界）。请用线性等式刻画连接相邻周期的**库存流守恒方程**：
$$\text{prevInventory} + \text{regular}[t] + \text{overtime}[t] - \text{inventory}[t] == \text{demands}[t]$$
其中 $t=0$ 时取 `initialInventory`，$t \ge 1$ 时取 `inventory[t - 1]`。

<!-- section:hint2 -->
最小化总成本 `regCost * sum(regular) + otCost * sum(overtime) + holdCost * sum(inventory)`，求解并返回 `{ regular, overtime, inventory, totalCost }`。

<!-- section:formulation -->
$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

“期末状态 = 上期状态 + 流入 - 流出”的跨期流平衡是供应链排产、储能调度与资金流动性管理的核心骨架。
