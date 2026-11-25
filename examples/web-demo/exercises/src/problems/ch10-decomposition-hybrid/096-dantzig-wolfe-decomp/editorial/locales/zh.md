## 解题思路

将每个工厂满足本地约束的产量向量表示为极点的凸组合 $\sum_p \lambda_{kp} x_{kp}$（$\sum_p \lambda_{kp} = 1, \lambda_{kp} \ge 0$），并在最大化受限主问题（RMP）中统一协调全公司共享钢材上限。在 WaSHI 中，为 `master` 添加命名耦合约束 `shared_cap`、各工厂的凸组合约束 `conv_${k}` 及零产量初始列 `init_${k}`，以 `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })` 对各工厂独立求解局部 LP 子问题并注入改进极点，最后按权重 $\lambda_{kp}$ 的凸组合 $\sum_p \lambda_{kp} x_{kpj}$ 还原 `allocations[k][j]`。

## 数学模型

$$
\begin{aligned}
\text{(RMP)} \quad \max \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j c_{kj} x_{kpj}\right) \lambda_{kp} \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j s_{kj} x_{kpj}\right) \lambda_{kp} \le S && (\text{对偶变量 } \pi) \\
& \sum_{p \in \mathcal{P}_k} \lambda_{kp} = 1 && \forall k \quad (\text{对偶变量 } \mu_k) \\
& \lambda_{kp} \ge 0 && \forall k, p
\end{aligned}
$$

$$
\begin{aligned}
\text{(Block } k\text{)} \quad \max \quad & \sum_j (c_{kj} - \pi s_{kj}) x_{kj} \\
\text{s.t.} \quad & \sum_j \ell_{kj} x_{kj} \le L_k, \quad 0 \le x_{kj} \le u_{kj}
\end{aligned}
$$

## 核心要点

- **最大化检验数符号**：在最大化主问题下，`solveColumnGeneration` 计算 `rc = cost - dualContrib` 并接纳满足 `rc > reducedCostTolerance` 的新列。子问题已最大化 $\sum_j (c_{kj} - \pi s_{kj}) x_{kj}$，因此精确检验数即为 `sub.objectiveValue - getDual("conv_" + k)`。
- **零点初始列保障**：因资源消耗系数均非负，零向量 $x = 0$ 必然满足各工厂约束，可保证第 1 轮迭代的凸组合约束严格可行。
- **凸组合还原原变量**：由于本题为连续 LP 分解，设置 `finalizeAsMIP: false` 并将生成列的极点按权重 $\lambda_{kp}$ 线性组合，即可精确恢复原紧凑 LP 的全局最优解。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 `pricing` 回调中获取共享约束的对偶价格 `piShared`，通过 `input.productCaps.entries()` 构建并求解各工厂的区块 LP，并将检验数为正的极点作为 `proposals` 返回。

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<DwColumnMeta>({
  master,
  finalizeAsMIP: false,
  pricing: async ({ getDual }) => {
    const piShared = getDual("shared_cap");
    const proposals: Array<ColumnProposal<DwColumnMeta>> = [];
    for (const [k, caps] of input.productCaps.entries()) {
      const muK = getDual(`conv_${k}`);
      const sub = new Model(`BlockPricing_${k}`);
      const x = caps.map((cap, j) => sub.continuous(`x_${k}_${j}`, { lb: 0, ub: cap }));
      const reducedUnits = input.profits[k].map((p, j) => p - piShared * input.sharedUsages[k][j]);
      sub.objective(maximize(expr`dot(${reducedUnits}, ${x})`));
      sub.constraint(expr`dot(${input.localUsages[k]}, ${x}) <= ${input.localCaps[k]}`);
      if ((await sub.solve()) !== "Optimal") continue;
      const rc = (sub.objectiveValue ?? 0) - muK;
      if (rc <= 1e-6) continue;
      const xVals = x.map((v) => Math.max(0, v.value ?? 0));
      const cost = xVals.reduce((acc, v, j) => acc + input.profits[k][j] * v, 0);
      const shared = xVals.reduce((acc, v, j) => acc + input.sharedUsages[k][j] * v, 0);
      proposals.push({
        type: "Continuous",
        lb: 0,
        cost,
        coefficients: { shared_cap: shared, [`conv_${k}`]: 1 },
        reducedCost: rc,
        meta: { k, x: xVals },
      });
    }
    return proposals.length > 0 ? proposals : null;
  },
});
```
