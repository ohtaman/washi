## 解题思路

为每个格子 $c$ 引入二元变量 $x_c \in \{0, 1\}$（表示有雷或安全），并将线索集合 $R$ 中的每条线索编码为命名约束。目标是找出一个极小不可满足子集（MUS）$C \subseteq R$，使其整体不可满足而移除任意一条线索后均可满足。先对全部线索调用 `await m.check({ solver: "z3" })`，以 `res.unsatCore` 作为初始候选集合，再执行删减收缩——依次移除每条线索 ID，若剩余子集仍为 `"Unsat"` 则永久剔除——从而得到不可再约的 MUS。

## 数学模型

$$
\begin{aligned}
& x \in \{0, 1\}^{|\text{cells}|}, \quad R = \text{clues} \\
C \subseteq R \text{ 为 MUS} &\iff \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## 核心要点

- **为何原始 `unsatCore` 不一定是极小的**：WaSHI 基于命名约束提取的 SMT 冲突核能快速过滤无关线索，但在重叠冲突中仍可能保留多余线索，需要通过删减收缩来保证子集极小性。
- **可满足性的单调性**：一旦确认 $C \setminus \{r\}$ 为 `"Sat"`，后续收缩得到的任何更小子集 $C' \setminus \{r\}$ 也必然为 `"Sat"`，因此只需对候选列表单轮遍历即可。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

编写 `checkSubset` 辅助函数，用 `m.binary(input.cells)` 声明二元变量，以 `clue.id` 为约束名添加当前启用的线索，并调用 Z3 检查可满足性。随后以初始 `unsatCore` 作为候选集合 `core`，依次移除单个线索 ID 并重新检查，若仍为 `"Unsat"` 则剔除并继续收缩。

**WaSHI (TypeScript)**

```ts
async function checkSubset(input: P046Input, activeIds: string[]): Promise<CheckResult> {
  const m = new Model("PuzzleClueDiagnosis");
  const x = m.binary(input.cells);
  const active = new Set(activeIds);
  for (const clue of input.clues) {
    if (active.has(clue.id)) addClueConstraint(m, clue, x); // m.constraint(..., clue.id)
  }
  return m.check({ solver: "z3" });
}

const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    const nextCore = res.unsatCore?.length ? new Set(res.unsatCore) : null;
    core = nextCore ? candidate.filter((id) => nextCore.has(id)) : candidate;
  }
}
```
