## 解题思路

使用 `master.solveBenders` 构建逻辑 Benders 分解（LBBD）：HiGHS 0-1 MIP 主问题负责最小化总指派成本，而子问题按机器分别调用 Pumpkin CP 求解器验证带有 `disjoint` 互斥约束与时间窗边界的调度可行性。一旦某台机器的子问题返回 `Unsat`，通过贪心删减提炼出极小冲突子集 $K_m \subseteq S_m$ 并添加禁止割。

## 数学模型

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{j=0}^{N-1} \sum_{m=0}^{M-1} c_{jm} x_{jm} \\
\text{s.t.} \quad & \sum_{m=0}^{M-1} x_{jm} = 1 && \forall j \\
& \sum_{j \in K} x_{jm} \le |K| - 1 && \forall (K, m) \in \mathcal{N}_{\text{no-good}}, \quad x_{jm} \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(CP Sub}_m(S_m)\text{)} \quad \text{find } & s_j \in [\text{rel}_j,\ \min(\text{dl}_j, H) - p_j] \cap \mathbb{Z} && \forall j \in S_m \\
\text{s.t.} \quad & \text{disjoint}\big(\{(s_j, p_j) : j \in S_m\}\big)
\end{aligned}
$$

## 核心要点

- **无需 `theta` 的纯可行性分解**：全部成本项 $c_{jm} x_{jm}$ 已包含在主问题中，子问题只需检验逻辑可调度性。当所有机器子问题均返回 `"Sat"` 并向 `solveBenders` 返回 `null` 时，即证明全局最优性。
- **极小不可行冲突强化**：对不可行任务集 $S_m$ 逐一尝试剔除任务并调用 `check({ solver: "pumpkin" })`，可将禁割紧缩至极小冲突集 $K_m$，一次切掉大量重复的无效指派组合。
- **边界安全处理**：建立变量前检查 `ub >= lb` 以安全处理单任务时间窗冲突，当机台上至少有 2 个任务时添加 `disjoint` 全局约束。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
const bendersRes = await master.solveBenders({
  maxIterations: 200,
  subproblem: async ({ getMasterValue }) => {
    const cuts: BendersCut[] = [];
    for (let m = 0; m < M; m++) {
      const assigned = jobs.filter((j) => getMasterValue(x[j][m]) > 0.5);
      const check = await checkMachineSchedule(input, assigned);
      if (check.sat) continue;
      let minimal = [...assigned];
      for (const j of assigned) {
        const reduced = minimal.filter((k) => k !== j);
        if (reduced.length > 0 && !(await checkMachineSchedule(input, reduced)).sat) minimal = reduced;
      }
      cuts.push({
        kind: "feasibility",
        constraint: expr`sum(${minimal.map((j) => x[j][m])}) <= ${minimal.length - 1}`,
      });
    }
    return cuts.length > 0 ? cuts : null;
  },
});
```
