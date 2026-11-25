## 解题思路

将 **Z3 SMT** 策略冲突诊断与 **HiGHS MIP** 最小扰动重排产串联成混合优化流水线：

1. **第一阶段（IHS 加权 MaxSAT 修复）**：在 Z3 模型中以规则 ID 命名各硬约束与软方针并加入产能覆盖 $\sum_i C_i u_i \ge D$。若 `smt.check({ solver: "z3" })` 返回 `"Unsat"`，提取 `res.unsatCore` 中的软方针构成击中集割，交由 HiGHS 求解最小总权重的放弃集合并迭代，直至 Z3 返回 `"Sat"`。
2. **第二阶段（最小扰动生产重排 MIP）**：在修复后的一贯约束与方针下求解 0-1 开机 $y_i$、连续产量 $q_i$ 与变更指标 $\delta_i \ge |y_i - b_i|$，最小化总运行成本与变更惩罚。

## 数学模型

$$
\begin{aligned}
\text{(Phase 1 IHS)} \quad \min \quad & \sum_{r \in \mathcal{S}} w_r z_r \\
\text{s.t.} \quad & \sum_{r \in \mathcal{C} \cap \mathcal{S}} z_r \ge 1 && \forall \text{ Z3 core } \mathcal{C}, \quad z_r \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Phase 2 MIP)} \quad \min \quad & \sum_{i} \big(F_i y_i + c_i q_i + P_{\text{disrupt}} \delta_i\big) \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i, \quad \sum_i q_i \ge D, \quad \delta_i \ge y_i - b_i, \quad \delta_i \ge b_i - y_i \\
& \text{保留规则 } \mathcal{H} \cup \{r \in \mathcal{S} : z_r = 0\}, \quad y_i \in \{0, 1\}
\end{aligned}
$$

## 核心要点

- **隐式击中集（IHS）全局最优性**：若仅在单个核内贪心删除最便宜规则，面对多重或交叉冲突时可能偏离最小总权重；维护历史所有 Z3 核并重解击中集 MIP 可严格保证修复权重最小。
- **蕴含逻辑的线性化**：在第二阶段 MIP 中，`ifLine => thenLine` 对应 $y_{\text{if}} - y_{\text{then}} \le 0$，而互斥 `ifLine => !thenLine` 对应 $y_{\text{if}} + y_{\text{then}} \le 1$。
- **无常数项偏置的绝对差线性化**：通过辅助线性约束 $\delta_i \ge y_i - b_i$ 与 $\delta_i \ge b_i - y_i$ 对离散偏离量建模，可避免在目标表达式中引入常数偏置。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [求解器状态](?view=guide&lang=zh#solver-status)

## 实现要点

在第一阶段的隐式击中集（Implicit Hitting Set）循环中，从 `checkPolicyWithZ3` 返回的 UNSAT 核中仅提取软方针加入 `hittingSets`（若核中不含软方针，则回退调用返回当前全部有效软方针 ID 的 `activeSoftIds(droppedSet)`），并通过 `solveHittingSetMip` 更新最小权重的放弃集合 `droppedSet`，持续迭代直至达到 `"Sat"`。

**WaSHI (TypeScript)**

```ts
for (let iter = 0; iter <= 1 << input.softRules.length; iter++) {
  const audit = await checkPolicyWithZ3(input, droppedSet);
  if (audit.sat) break;
  const coreSoft = audit.core.filter((id) => softById.has(id));
  hittingSets.push(coreSoft.length > 0 ? coreSoft : activeSoftIds(droppedSet));
  droppedSet = await solveHittingSetMip(input.softRules, hittingSets);
}
```
