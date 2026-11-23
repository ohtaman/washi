## 解题思路

将第七章的生产批量模型与储能调度模型融为单一混合整数规划：以电网平衡方程 $g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t$ 将开机与生产功耗接入能源网络，同时利用成品库存 $I_t$ 与电池电量 $E_t$ 两种储能手段协同平滑成本与峰值。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left( F y_t + h I_t + \pi_t g_t \right) + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & I_{t-1} + x_t - I_t = D_t, \quad 0 \le x_t \le C_{\text{prod}} y_t && \forall t \;\; (I_{-1} = 0) \\
& E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}},\; E_{T-1} \ge E_{\text{init}}) \\
& g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& y_t, z_t \in \{0, 1\}, \quad I_t \ge 0, \quad 0 \le E_t \le E_{\max}
\end{aligned}
$$

其中 $D_t$（`demands[t]`）表示给定的产品需求量，$d_t$（`discharge[t]`）表示可控的电池放电功率。

## 核心要点

- **成品库存与电池的双重“虚拟储能”协同**：在低谷电价期提前生产并持有库存 $I_t$，本质上是以仓库保管费 $h$ 为代价把廉价谷电“凝固”进产品中，与承受电池往返效率损耗 $1 - \eta_c \eta_d$ 形成互补。
- **一条功率耦合等式打通两个子系统**：把待机功耗 $p_{\text{idle}} y_t$ 与加工功耗 $p_{\text{unit}} x_t$ 直接并入电网购电平衡 $g_t$，使求解器能够全局权衡合并批次、错峰生产、峰谷套利与需量削峰。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

为每个周期定义生产与库存约束以及电池 SOC 约束，再将待机功耗和加工功耗并入电网购电平衡方程从而耦合两个子系统。在 WaSHI 中使用 `expr` 字面量写出各条约束，在 PuLP 中则同样逐期添加等式与不等式约束。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${production[t]} <= ${input.prodCap} * ${setups[t]}`);
m.constraint(expr`${prevInv} + ${production[t]} - ${inventory[t]} == ${demand}`);
m.constraint(
  expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
);
m.constraint(
  expr`${gridLoad[t]} - ${input.setupPower} * ${setups[t]} - ${input.unitPower} * ${production[t]} - ${charge[t]} + ${discharge[t]} == ${input.baseLoads[t]}`
);
m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
```

**PuLP (Python)**

```python
prob += production[t] <= prod_cap * setups[t]
prob += prev_inv + production[t] - inventory[t] == demands[t]
prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
prob += grid_load[t] == base_loads[t] + setup_power * setups[t] + unit_power * production[t] + charge[t] - discharge[t]
prob += peak_load >= grid_load[t]
```
