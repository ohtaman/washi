## 解题思路

将问题分解为集合覆盖受限主问题（RMP）LP 与二元排班定价子问题：主问题决定各已有班次模式的在岗人数 $\lambda_p$ 以满足每日最低需求 $r_d$，定价子问题则在 $D$ 天的二元变量上施加总工作天数限制（$1 \le \sum_d a_d \le M_{\text{work}}$）与滑动窗口连班上限，以寻找检验数为负的合规班次。在 WaSHI 中，为 `master` 注册每日命名需求约束并通过 `master.column(...)` 注入单日初始列，随后调用 `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` 迭代生成改进列并在收敛后求解整数方案。

## 数学模型

$$
\begin{aligned}
\text{(RMP LP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \left(F + \sum_{d=0}^{D-1} c_d a_{dp}\right) \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{dp} \lambda_p \ge r_d && \forall d \in \{0, \dots, D-1\} \quad (\text{对偶变量 } \pi_d) \\
& \lambda_p \ge 0 && \forall p \in \mathcal{P}
\end{aligned}
$$

列生成收敛后，在最终 MIP 求解阶段施加整数约束 $\lambda_p \in \mathbb{Z}_{\ge 0}$（`finalizeAsMIP: true`）。

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

在定价子问题中，使用 `input.shiftCosts.map(...)` 计算各天的净收益系数并用 `dot` 构建目标函数，同时借助 `Array.from` 与 `a.slice(...)` 将连续工作上限作为滑动窗口约束一次性批量注册。

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("ShiftPricing");
    const a = sub.binary(D, { prefix: "a" });
    const netGains = input.shiftCosts.map((c, d) => getDual(`demand_${d}`) - c);
    sub.objective(maximize(expr`dot(${netGains}, ${a})`));
    sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
    sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");
    const windowSize = input.maxConsecutive + 1;
    if (D >= windowSize) {
      sub.constraint(
        Array.from({ length: D - windowSize + 1 }, (_, t) =>
          expr`sum(${a.slice(t, t + windowSize)}) <= ${input.maxConsecutive}`
        )
      );
    }
    if ((await sub.solve()) !== "Optimal") return null;
    const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
    if (reducedCost >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    const cost =
      input.baseCost + pat.reduce((acc, v, d) => acc + v * input.shiftCosts[d], 0);
    const coefficients = Object.fromEntries(
      pat.flatMap((v, d) => (v > 0 ? [[`demand_${d}`, 1]] : []))
    );
    return { type: "Integer", cost, coefficients, reducedCost, meta: pat };
  },
});
```
