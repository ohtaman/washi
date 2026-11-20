## 解题思路

用纳入充放电效率的状态守恒等式追踪电池 SOC，引入上镜图变量 $P_{\text{peak}} \ge g_t$ 线性化最大需量峰值，并通过 0-1 充放电互斥开关 $z_t$ 保证在任意电价结构下都不会发生同时充放。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \pi_t g_t + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}}) \\
& g_t = L_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& E_{\min} \le E_t \le E_{\max}, \quad E_{T-1} \ge E_{\text{end}}, \quad z_t \in \{0, 1\}
\end{aligned}
$$

## 核心要点

- **上镜图法（Epigraph）处理需量棘轮费**：将目标中的非线性极大值 $\gamma \max_t g_t$ 改写为最小化 $\gamma P_{\text{peak}}$ 辅以线性不等式 $P_{\text{peak}} \ge g_t$，即可直接纳入 LP/MIP 求解。
- **LP 自动互斥与 MIP 显式开关**：当电价严格为正且 $\eta_c \eta_d < 1$ 时，同时充放电只会白白损耗能量而无法改善目标，纯 LP 即可给出合法解；引入 $z_t \in \{0,1\}$ 则可在零/负电价或理想无损情形下依然严格保证充放互斥。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const invEtaD = 1 / input.etaDischarge;
input.baseLoads.forEach((base, t) => {
  const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
  m.constraint(
    expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
  );
  m.constraint(expr`${gridLoad[t]} - ${charge[t]} + ${discharge[t]} == ${base}`);
  m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
  m.constraint(expr`${charge[t]} <= ${input.maxPower} * ${mode[t]}`);
  m.constraint(expr`${discharge[t]} <= ${input.maxPower} * (1 - ${mode[t]})`);
});
```

**PuLP (Python)**

```python
for t in range(T):
    prev_soc = init_soc if t == 0 else soc[t - 1]
    prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
    prob += grid_load[t] == base_loads[t] + charge[t] - discharge[t]
    prob += peak_load >= grid_load[t]
    prob += charge[t] <= p_max * mode[t]
    prob += discharge[t] <= p_max * (1 - mode[t])
```
