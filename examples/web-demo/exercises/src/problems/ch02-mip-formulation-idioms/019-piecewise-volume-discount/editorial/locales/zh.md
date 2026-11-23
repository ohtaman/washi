## 解题思路

为每家供应商的每个报价档位引入 0-1 变量 `tierSelected[s][k]` 与连续订货量 `tierQuantities[s][k]`，约束每家供应商至多启用一个档位（`<= 1`）并满足各档位的半连续区间上下限，在采购总量不低于 `demand` 的前提下最小化总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{s} \sum_{k} p_{s,k} q_{s,k} \\
\text{s.t.} \quad & \sum_{k} y_{s,k} \le 1 && \forall s \\
& L_{s,k} y_{s,k} \le q_{s,k} \le U_{s,k} y_{s,k} && \forall s, k \\
& \sum_{s} \sum_{k} q_{s,k} \ge D \\
& q_{s,k} \ge 0,\; y_{s,k} \in \{0, 1\} && \forall s, k
\end{aligned}
$$

## 核心要点

- **为何阶梯降价与全量折扣均属非凸问题（必须使用 MIP）**：在成本最小化中，仅靠纯 LP 能建模的只有边际单价*递增*的**凸**分段线性函数（如梯度加班费）。边际单价递减的“增量折扣”形成凹成本函数，而跨过阈值 $L_{s,k}$ 即对全部采购量降价的“全量折扣”更会在阈值处产生向下跳变——两者皆非凸，都需要 0-1 变量来确保按阶梯正确计费。
- **跨档位“多买更省”与起订量兼容**：总需求写成 `>= demand` 允许在跨档降价划算时主动多买以拉低总费用（例如用例 1 买 50 个单价 7.0 总价 350 低于买 45 个）；同时档位求和 `<= 1` 让存在最低起订量 `minQty > 0` 的供应商也能被完整跳过。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将每家供应商的选定档位之和限制在 1 以下，同时用 `minQty` 和 `maxQty` 乘以选择变量 `tierSelected[s][k]` 从上下两侧夹住各档位的订货量 `tierQuantities[s][k]`。

**WaSHI (TypeScript)**

```ts
m.constraint(tierSelected.map((row) => expr`${sum(row)} <= 1`));
m.constraint(
  input.suppliers.flatMap((tiers, s) =>
    tiers.flatMap((tier, k) => [
      expr`${tier.minQty} * ${tierSelected[s][k]} <= ${tierQuantities[s][k]}`,
      expr`${tierQuantities[s][k]} <= ${tier.maxQty} * ${tierSelected[s][k]}`,
    ])
  )
);
m.constraint(expr`${sum(tierQuantities.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for s, tiers in enumerate(suppliers):
    prob += pulp.lpSum(tier_sel[s]) <= 1
    for k, tier in enumerate(tiers):
        prob += tier["minQty"] * tier_sel[s][k] <= tier_qty[s][k]
        prob += tier_qty[s][k] <= tier["maxQty"] * tier_sel[s][k]
prob += pulp.lpSum(q for row in tier_qty for q in row) >= demand
```
