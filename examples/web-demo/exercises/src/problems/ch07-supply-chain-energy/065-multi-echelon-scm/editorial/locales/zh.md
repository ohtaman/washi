## 解题思路

引入工厂启用 0-1 变量 $u_p$、DC 启用 0-1 变量 $w_d$，以及工厂至 DC 和 DC 至客户的两级非负连续运输量矩阵 $f_{p,d}, g_{d,c}$。对每个工厂与 DC 施加产能门控约束，对每个 DC 施加严格流入等于流出的流量守恒约束，并保证每位客户的需求均被满足，以最小化固定开设成本与两级运输总成本。

## 数学模型

$$
\begin{aligned}
\min_{u, w \in \{0,1\},\; f, g \ge 0} \quad & \sum_{p} F^P_p u_p + \sum_{d} F^D_d w_d + \sum_{p,d} c_{p,d} f_{p,d} + \sum_{d,c} c'_{d,c} g_{d,c} \\
\text{s.t.} \quad & \sum_{d} f_{p,d} \le C^P_p u_p && \forall p \\
& \sum_{p} f_{p,d} \le C^D_d w_d && \forall d \\
& \sum_{p} f_{p,d} = \sum_{c} g_{d,c} && \forall d \\
& \sum_{d} g_{d,c} \ge D_c && \forall c
\end{aligned}
$$

其中 $F^P_p = \text{plantFixedCosts}[p]$、$C^P_p = \text{plantCaps}[p]$、$F^D_d = \text{dcFixedCosts}[d]$、$C^D_d = \text{dcCaps}[d]$、$D_c = \text{demands}[c]$、$c_{p,d} = \text{plantDcCosts}[p][d]$、$c'_{d,c} = \text{dcCustomerCosts}[d][c]$。

## 核心要点

- **DC 吞吐量门控只需写在流入端**：由于中转守恒 $\sum_p f_{p,d} = \sum_c g_{d,c}$ 已使流入与流出相等，限制 $\sum_p f_{p,d} \le C^D_d w_d$ 即可同时约束出库量并禁止未启用 DC 过货。
- **固定开支与跨级运费的全局权衡**：关闭某处 DC 可节省 $F^D_d$ 但会推高下游配送运费 $c'_{d,c}$；当上游工厂受限时需协同启用多组工厂与中转仓。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

除工厂出货产能约束外，还需计算每个 DC 的总流入与总流出，并同时施加产能上限与流量守恒（流入等于流出）约束。在 WaSHI 中用 `sum()` 构建行列求和表达式，在 PuLP 中则用 `pulp.lpSum` 编写相同逻辑。

**WaSHI (TypeScript)**

```ts
m.constraint(
  plantToDc.map((row, p) => expr`${sum(row)} <= ${input.plantCaps[p]} * ${openPlants[p]}`)
);
input.dcCaps.forEach((cap, d) => {
  const dcInflow = sum(plantToDc.map((row) => row[d]));
  const dcOutflow = sum(dcToCustomer[d]);
  m.constraint(expr`${dcInflow} <= ${cap} * ${openDcs[d]}`);
  m.constraint(expr`${dcInflow} - ${dcOutflow} == 0`);
});
```

**PuLP (Python)**

```python
for p in range(n_plants):
    prob += pulp.lpSum(plant_to_dc[p]) <= plant_caps[p] * open_plants[p]
for d in range(n_dcs):
    inflow = pulp.lpSum(plant_to_dc[p][d] for p in range(n_plants))
    outflow = pulp.lpSum(dc_to_customer[d])
    prob += inflow <= dc_caps[d] * open_dcs[d]
    prob += inflow == outflow
```
