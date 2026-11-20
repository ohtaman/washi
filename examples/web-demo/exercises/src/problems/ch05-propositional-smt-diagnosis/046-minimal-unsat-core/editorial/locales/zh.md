## 解题思路

首先将所有命名规则注册到模型并执行 `await m.check({ solver: "z3" })`，以返回的 `res.unsatCore` 作为候选集；随后逐一尝试删除候选集中的每条规则并重新检验，若剩余子集仍为 `"Unsat"` 则将其剔除，最终收敛到极小不可满足子集 (MUS)。

## 数学模型

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## 核心要点

- **为何原始 `unsatCore` 未必极小**：基于假设跟踪的 SMT 冲突核能够迅速排除无关约束，但当存在多条重叠推导路径时仍可能包含冗余成员；删除收缩确保任意规则均不可省略。
- **可满足性的单调性**：一旦验证 $C \setminus \{r\}$ 为 `"Sat"`，后续即使继续缩小集合 $C' \subseteq C$，子集 $C' \setminus \{r\}$ 依然保持 `"Sat"`，因此单轮扫描即可保证极小性。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const ruleId of [...core]) {
  if (!core.includes(ruleId)) continue;
  const candidate = core.filter((id) => id !== ruleId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
