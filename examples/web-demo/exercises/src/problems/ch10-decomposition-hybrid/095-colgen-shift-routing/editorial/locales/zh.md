## 解题思路

建立集合覆盖受限主问题（`master`），包含每日需求约束 `0 >= demands[d]` 并通过 `master.column(...)` 注入单日初始排班列。调用 `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`，在 `pricing` 子问题中建立包含总天数限制 `1 <= sum(a) <= maxWorkDays` 与滑动窗口连班限制的 0-1 MIP，动态提取负检验数班次直至 LP 收敛后求解整数解。

## 数学模型

$$
\begin{aligned}
\text{(RMP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \left(F + \sum_{d=0}^{D-1} c_d a_{dp}\right) \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{dp} \lambda_p \ge r_d && \forall d \in \{0, \dots, D-1\} \quad (\text{对偶变量 } \pi_d) \\
& \lambda_p \in \mathbb{Z}_{\ge 0} && \forall p \in \mathcal{P}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{d=0}^{D-1} (\pi_d - c_d) a_d \\
\text{s.t.} \quad & 1 \le \sum_{d=0}^{D-1} a_d \le M_{\text{work}} \\
& \sum_{d=t}^{t + M_{\text{consec}}} a_d \le M_{\text{consec}} && \forall t \in \{0, \dots, D - M_{\text{consec}} - 1\} \\
& a_d \in \{0, 1\} && \forall d \in \{0, \dots, D-1\}
\end{aligned}
$$

## 核心要点

- **检验数表达式**：将日工资 `shiftCosts[d]` 移入定价目标函数后，检验数化为 $\bar{c}(a) = F - \sum_d (\pi_d - c_d) a_d$。只要子问题最大值高于 `baseCost`，即得 $\bar{c} < -10^{-5}$ 的可改进排班模式。
- **滑动窗口连班约束**：对所有长度为 `maxConsecutive + 1` 的连续窗口约束总工作天数不超过 `maxConsecutive`，即可严格避免超长连续出勤。
- **单日初始列保障**：对每个需求为正的日期注入仅出勤一天的初始列，可在任何排班规则强度下保证主问题初始可行。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("ShiftPricing");
    const a = sub.binary(D, { prefix: "a" });
    let netGain = expr`0`;
    for (let d = 0; d < D; d++) {
      netGain = netGain.add(a[d].mul(getDual(`demand_${d}`) - input.shiftCosts[d]));
    }
    sub.objective(maximize(netGain));
    sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
    sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");
    for (let t = 0; t <= D - (input.maxConsecutive + 1); t++) {
      sub.constraint(
        expr`sum(${a.slice(t, t + input.maxConsecutive + 1)}) <= ${input.maxConsecutive}`
      );
    }
    if ((await sub.solve()) !== "Optimal") return null;
    const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
    if (reducedCost >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    return { type: "Integer", cost: patCost(pat), coefficients: toCoeffs(pat), reducedCost, meta: pat };
  },
});
```
