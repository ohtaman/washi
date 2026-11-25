## 解题思路

为每道工序创建有限整数开工时间变量 $S_{j,o} \in \{0, \dots, H - d_{j,o}\}$，添加作业内部工序先后约束 $S_{j,o} + d_{j,o} \le S_{j,o+1}$，并将共享同一台机器 $r \in \{0, \dots, M-1\}$ 的全部工序集合交给 Pumpkin 的全局约束 `disjoint(...)`，最小化以 `max(...)` 表达的最大完工时间。

## 数学模型

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{j,o} (S_{j,o} + d_{j,o}) \\
\text{s.t.} \quad & S_{j,o} + d_{j,o} \le S_{j,o+1} && \forall j, \; o < K_j - 1 \\
& \text{disjoint}\!\left(\left\{(S_{j,o}, d_{j,o}) \mid m_{j,o} = r\right\}\right) && \forall r \in \{0, \dots, M-1\} \\
& S_{j,o} \in \{0, \dots, H - d_{j,o}\} && \forall j, o
\end{aligned}
$$

其中 $H = \sum_{j,o} d_{j,o}$ 为总时长上界，$m_{j,o}$ 为作业 $j$ 的工序 $o$ 所需的机器编号，$K_j$ 为作业 $j$ 的工序数，$M$ 为机器总数。

## 核心要点

- **CP `disjoint` 对比 Big-M MIP**：采用 Big-M MIP 建模 JSSP 时，需要对同机每对工序引入二进制顺序变量和两条松弛的 Big-M 不等式，导致线性松弛极弱；而 Pumpkin 的原生 `disjoint` 约束利用边缘发现等区间传播算法直接在有限整数域上剪枝，无需为每台机器引入平方级的两两 Big-M 析取约束。
- **紧致整数上界**：利用工期总和 $H$ 设置上界 `ub: horizon - d` 可缩小整数域并加速延迟子句生成（Lazy Clause Generation, LCG）冲突学习。
- **WaSHI 专属 CP 能力**：本练习直接使用 `{ solver: "pumpkin" }` 求解全局约束 `disjoint` 与 `max`，仅提供 WaSHI (TypeScript) 运行环境。
- 概念参考：[指南与术语表 — 常见模型分类](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在指定 Pumpkin 求解器的模型中声明整数开工时间变量，将分配到同一台机器的工序列表传入 `disjoint()` 批量注册互不重叠约束。最后以全部工序完工时间的 `max()` 作为目标函数进行最小化。

**WaSHI (TypeScript)**

```ts
const m = new Model("JobShopCP", { solver: "pumpkin" });
const starts = input.durations.map((jobDurs, j) =>
  jobDurs.map((d, o) => m.integer(`s_${j}_${o}`, { lb: 0, ub: horizon - d }))
);
Array.from({ length: numMachines }, (_, mach) => mach).forEach((mach) => {
  const ops = input.machines.flatMap((jobMachs, j) =>
    jobMachs
      .map((opMach, o) =>
        opMach === mach ? { start: starts[j][o], duration: input.durations[j][o] } : null
      )
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );
  if (ops.length >= 2) m.constraint(disjoint(ops), `machine_${mach}`);
});
const completions = starts.flatMap((jobStarts, j) =>
  jobStarts.map((s, o) => expr`${s} + ${input.durations[j][o]}`)
);
m.objective(minimize(max(completions)));
```
