## 解题思路

声明带产能上界与期末安全库存下界的连续变量数组 `regular`、`overtime` 和 `inventory`，用物料平衡等式串联相邻周期，最后最小化总生产与保管成本。

## 数学模型

$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

## 核心要点

- **用流守恒等式连接多周期状态**：每一期均满足“上期库存 + 本期生产 - 本期需求 = 本期期末库存”（第 0 期接入常数 `initialInventory`），这一时间展开结构也是储能调度和资金平衡模型的标准骨架。
- **优先使用变量上下界表达单变量限制**：`regCap[t]`、`otCap[t]`、`invCap` 以及最后一期的 `minFinalInventory` 都直接写在变量的 `lb` / `ub` 上，使约束矩阵保持最小规模。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((demand, t) => {
    const prev = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prev} + ${regular[t]} + ${overtime[t]} - ${inventory[t]} == ${demand}`;
  })
);
m.objective(
  minimize(
    expr`${input.regCost} * ${sum(regular)} + ${input.otCost} * ${sum(overtime)} + ${input.holdCost} * ${sum(inventory)}`
  )
);
```

**PuLP (Python)**

```python
for t in range(T):
    prev = init_inv if t == 0 else inventory[t - 1]
    prob += prev + regular[t] + overtime[t] - inventory[t] == demands[t]

prob += (
    reg_cost * pulp.lpSum(regular)
    + ot_cost * pulp.lpSum(overtime)
    + hold_cost * pulp.lpSum(inventory)
)
prob.solve(pulp.HiGHS(msg=False))
```
