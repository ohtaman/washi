## 解题思路

先对全部命名线索调用 `await m.check({ solver: "z3" })` 获取初始不可满足核 `res.unsatCore`，随后依次尝试移除候选核中的每条线索，检查剩余子集是否仍为 `"Unsat"`。剔除所有冗余线索后，即可得到不可再约的极小不可满足子集（MUS）。

## 数学模型

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## 关键点

- **为何原始 `unsatCore` 不一定是极小的**：基于假设追踪的 SMT 核提取能快速过滤无关约束，但在重叠冲突中仍可能保留多余线索，需要通过删减收缩来保证子集极小性。
- **可满足性的单调性**：一旦确认 $C \setminus \{r\}$ 为 `"Sat"`，后续收缩得到的任何更小子集 $C' \setminus \{r\}$ 也必然为 `"Sat"`，因此只需对候选列表单轮遍历即可。
- 相关定义：[指南与术语表 — 求解器状态](?view=guide&lang=zh#solver-status) 与 [问题族](?view=guide&lang=zh#paradigms)。

## 核心实现

将初始 `unsatCore` 作为候选集合 `core`，依次移除单个线索 ID 并重新执行 `checkSubset`，若仍为 `"Unsat"` 则将该线索剔除并继续收缩。

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
