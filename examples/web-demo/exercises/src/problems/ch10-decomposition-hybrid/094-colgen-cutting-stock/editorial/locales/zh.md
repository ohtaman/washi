## 解题思路

将问题分解为受限主问题（RMP）LP 与有界背包定价子问题：主问题决定各已有切割模式的使用卷数 $\lambda_p$ 以满足各项需求 $d_i$，定价子问题则在母卷宽度限制内最大化对偶价值 $\sum_i \pi_i a_i$，以寻找检验数 $1 - \sum_i \pi_i a_i < 0$ 的新模式。在 WaSHI 中，为 `master` 添加各规格的命名需求约束并用 `master.column(...)` 注入单规格初始模式，然后调用 `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`，在 `pricing` 中通过 `getDual` 读取对偶价格并在 LP 收敛后求解整数解。

## 数学模型

$$
\begin{aligned}
\text{(RMP LP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{ip} \lambda_p \ge d_i && \forall i \in \{0, \dots, m-1\} \quad (\text{对偶变量 } \pi_i) \\
& \lambda_p \ge 0 && \forall p \in \mathcal{P}
\end{aligned}
$$

列生成收敛后，在最终 MIP 求解阶段施加整数约束 $\lambda_p \in \mathbb{Z}_{\ge 0}$（`finalizeAsMIP: true`）。

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{i=0}^{m-1} \pi_i a_i \\
\text{s.t.} \quad & \sum_{i=0}^{m-1} w_i a_i \le W, \quad a_i \in \mathbb{Z}_{\ge 0}
\end{aligned}
$$

## 核心要点

- **检验数判据**：每根母卷在主目标中的成本为 1，因此新模式检验数为 $\bar{c} = 1 - \sum_i \pi_i a_i$。只要背包最大值大于 1（$\bar{c} < -10^{-5}$），就能改进主问题松弛下界。
- **保证初始可行性**：为每种规格 $i$ 加入纯单规格初始列（每卷切 $\lfloor W / w_i \rfloor$ 件），可确保第 1 轮迭代即获得有效有限的对偶影子价格。
- **定价-分支（`finalizeAsMIP: true`）**：当 LP 松弛收敛、不再有负检验数列时，`solveColumnGeneration` 会对已生成的根节点 LP 列恢复整数要求并求解最终 MIP（与完整的 Branch-and-Price 不同，仅基于根节点 LP 列求解 MIP 在一般情形下属于原始启发式）。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 `solveColumnGeneration` 的 `pricing` 回调中通过 `getDual` 获取各规格的对偶价格，并用整数变量 `a` 求解有界背包子问题，以提出检验数为负的切割模式。

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("KnapsackPricing");
    const a = input.widths.map((w, i) =>
      sub.integer(`a_${i}`, { lb: 0, ub: Math.floor(input.rollWidth / w) })
    );
    const duals = input.widths.map((_, i) => getDual(`demand_${i}`));
    sub.objective(maximize(expr`dot(${duals}, ${a})`));
    sub.constraint(expr`dot(${input.widths}, ${a}) <= ${input.rollWidth}`);
    await sub.solve();
    const rc = 1 - (sub.objectiveValue ?? 0);
    if (rc >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    const coefficients = Object.fromEntries(
      pat.flatMap((c, i) => (c > 0 ? [[`demand_${i}`, c]] : []))
    );
    return { type: "Integer", cost: 1, coefficients, reducedCost: rc, meta: pat };
  },
});
```
