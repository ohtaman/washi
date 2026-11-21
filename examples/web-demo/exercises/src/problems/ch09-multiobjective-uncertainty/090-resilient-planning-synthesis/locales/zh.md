# #090. 韧性规划与震后最小扰动恢复综合设计

<!-- section:scenario -->
电网规划师在第一阶段预先签订一组候选供电单元的二进制启用承诺，并支付对应的固定预留成本。正常情况下每个单元提供其名义容量，但在最多 Gamma 个已承诺单元同时发生容量衰减的最坏情况下，留存总容量仍须不低于设定的鲁棒底线。

随后系统按既定概率进入若干突发冲击情景之一，每个情景对应实际需求量并强制部分单元停机。请在各情景中选择避开停机单元的二进制恢复调度方案，最小化第一阶段固定成本加上期望恢复切换惩罚（与初始承诺间的汉明变化量）与弹性需求缺口罚金之和。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fixedCosts` | `number[]` | 第一阶段各单元的固定预留成本 |
| `capacities` | `number[]` | 各单元的名义供应容量 |
| `dropAmounts` | `number[]` | 第一阶段鲁棒校验中各单元可能出现的容量跌落量 |
| `gamma` | `number` | 第一阶段容量跌落的不确定性预算 $\Gamma \in [0, n]$ |
| `robustMinCap` | `number` | 承受 $\Gamma$ 次衰减后仍需满足的第一阶段最小留存容量 |
| `probs` | `number[]` | 各冲击情景 $s$ 的概率权重 $p_s$ |
| `demands` | `number[]` | 各情景 $s$ 下的实际需求量 |
| `offline` | `number[][]` | 各情景停机掩码矩阵（`1` 表示单元 $j$ 在情景 $s$ 停机） |
| `disruptionCost` | `number` | 相对第一阶段承诺每变更一个单元状态的切换成本 |
| `shortfallPenalty` | `number` | 情景 $s$ 中每单位未满足需求的弹性惩罚 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `committed` | `number[]` | 第一阶段二进制（`0`/`1`）预承诺启用方案 |
| `recovered` | `number[][]` | 各情景 $s$ 下的二进制（`0`/`1`）恢复调度矩阵（$S \times n$） |
| `totalCost` | `number` | 最小化后的固定成本加期望恢复与缺口成本 |

<!-- section:example -->
**输入示例**

```json
{
  "fixedCosts": [120, 150, 90, 110],
  "capacities": [18, 22, 12, 16],
  "dropAmounts": [8, 10, 4, 6],
  "gamma": 1,
  "robustMinCap": 28,
  "probs": [0.6, 0.4],
  "demands": [24, 34],
  "offline": [
    [0, 0, 0, 0],
    [0, 1, 0, 0]
  ],
  "disruptionCost": 45,
  "shortfallPenalty": 30
}
```

**输出示例**

```json
{
  "committed": [0, 1, 0, 1],
  "recovered": [
    [0, 1, 0, 1],
    [1, 0, 0, 1]
  ],
  "totalCost": 296
}
```

预承诺 `[0, 1, 0, 1]` 的固定成本为 $150 + 110 = 260$ 且最坏单单元衰减后剩余容量为 $22 + 16 - 10 = 28 \ge 28$；情景 0 无需切换，情景 1 将单元 1 切换为单元 0（变更 2 处，容量 $34 \ge 34$），期望总成本为 $260 + 0.6(0) + 0.4(45 \times 2) =$ **296**。


<!-- section:hint1 -->
将第一阶段的二元预承诺向量及其 Bertsimas-Sim 对偶保护变量，与按情景索引的第二阶段二元恢复调度变量、连续汉明翻转变量以及非负需求短缺变量结合在一起。第一阶段确保最坏情况下的剩余容量不低于 `robustMinCap`，第二阶段则在各情景停机约束下调整调度并最小化期望切换成本与短缺惩罚之和。

<!-- section:hint2 -->
第一阶段的下界鲁棒约束需减去对偶化的最坏容量损失：$\text{dot}(\text{capacities}, y) - \Gamma z - \sum_j p_j \ge \text{robustMinCap}$ 且满足 $z + p_j \ge \text{dropAmounts}_j \cdot y_j$（$z, p_j \ge 0$）。在每个情景 $s$ 中，当 `offline[s][j] === 1` 时强制 $w_{s,j} = 0$，利用 $d_{s,j} \ge w_{s,j} - y_j$ 与 $d_{s,j} \ge y_j - w_{s,j}$（连续变量 $d_{s,j} \in [0, 1]$ 即可）线性化 $|w_{s,j} - y_j|$，并对二元输出 `committed` 和 `recovered` 取整。