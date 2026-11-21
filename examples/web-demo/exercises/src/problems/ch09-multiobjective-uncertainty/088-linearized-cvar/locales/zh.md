# #088. 线性化条件风险价值（CVaR）投资组合优化

<!-- section:scenario -->
资产管理者需要在多种资产间分配投资权重，要求各资产权重非负、不超过单资产集中度上限，且总权重之和等于 1。在给定概率的离散收益情景集下，每种情景的投资组合损失等于组合收益率的相反数。

为在不引入非线性项的前提下控制严重尾部亏损，请采用置信水平 α 下的 Rockafellar-Uryasev 条件风险价值（CVaR）线性规划定式化，并返回资产权重、辅助 VaR 阈值和 CVaR。最小化期望损失加上风险权重乘以 CVaR 的总目标。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `returns` | `number[][]` | 情景资产收益率矩阵（$S \times n$） |
| `probs` | `number[]` | 各情景 $s$ 的发生概率 $p_s$ |
| `alpha` | `number` | 定义尾部概率 $1 - \alpha$ 的置信水平 $\alpha \in (0, 1)$ |
| `riskWeight` | `number` | $\text{CVaR}_\alpha$ 风险惩罚权重 $\lambda$ |
| `maxWeight` | `number` | 单个资产允许的最大权重上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `weights` | `number[]` | 权重和为 1 的资产配置向量 |
| `varThreshold` | `number` | 最优辅助 VaR 阈值 $\eta$ |
| `cvar` | `number` | 投资组合损失的 $\text{CVaR}_\alpha$ |
| `totalObjective` | `number` | 最小化后的期望损失加 $\lambda \cdot \text{CVaR}_\alpha$ |

<!-- section:example -->
**输入示例**

```json
{
  "returns": [
    [0.14, 0.04, 0.01],
    [-0.12, 0.05, 0.02],
    [0.18, -0.02, 0.03],
    [-0.18, -0.06, -0.02]
  ],
  "probs": [0.25, 0.25, 0.25, 0.25],
  "alpha": 0.75,
  "riskWeight": 2.0,
  "maxWeight": 0.7
}
```

**输出示例**

```json
{
  "weights": [0, 0.3, 0.7],
  "varThreshold": 0.032,
  "cvar": 0.032,
  "totalObjective": 0.05625
}
```

权重 `[0, 0.3, 0.7]` 在 4 个情景下的组合收益率为 `[0.019, 0.029, 0.015, -0.032]`，对应期望损失 `-0.00775` 与最差 25% 尾部损失 `0.032`，总目标值为 $-0.00775 + 2.0 \times 0.032 =$ **0.05625**。


<!-- section:hint1 -->
引入界于 0 与单资产上限之间且总和为 1 的投资组合权重变量，同时引入一个标量辅助 VaR 阈值变量以及每个情景对应的非负尾部超额变量。每个情景的尾部超额变量表示该情景下组合损失超出 VaR 阈值的部分。

<!-- section:hint2 -->
最常见的陷阱是让 VaR 阈值 $\eta$ 保持默认的非负下界：当所有情景收益率为正时，最优 VaR 阈值为负值，因此必须在 WaSHI 中设为 `{ lb: -Infinity, ub: Infinity }`（或在 PuLP 中设为 `lowBound=None, upBound=None`）。使用非负松弛铰链不等式将各情景的组合损失超出 $\eta$ 的部分计入尾部超额，并以 `riskWeight` 加权 CVaR 与期望损失之和。