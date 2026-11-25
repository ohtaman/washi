## 解题思路

在布尔变量 `m.bool(input.vars)` 上直接施加全部硬规则 `hardRules`，同时为每条权重为 $w_k$ 的软规则 $S_k$ 引入 0-1 松弛指示变量 `violated[k]`（`m.binary`），加入析取约束 $S_k \lor (v_k = 1)$，并通过 `await m.solve({ solver: "z3" })` 最小化总惩罚 $\sum_k w_k v_k$。

## 数学模型

令 $m = |\text{softRules}|$ 表示软规则的数量：

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{m-1} w_k v_k \\
\text{s.t.} \quad & H_j(x) = \text{true} && \forall j \\
& S_k(x) \lor (v_k = 1) && \forall k \in \{0, \dots, m-1\} \\
& S_k(x) \implies (v_k = 0) && \forall k \in \{0, \dots, m-1\} \\
& x_i \in \{\text{false}, \text{true}\}, \quad v_k \in \{0, 1\}
\end{aligned}
$$

## 核心要点

- **软约束析取松弛**：约束 $S_k \lor (v_k = 1)$ 表示若 $v_k = 0$ 则 $S_k$ 必须满足，若 $v_k = 1$ 则以权重 $w_k$ 放弃 $S_k$。
- **双向指示紧致化**：补充蕴含 $S_k \implies (v_k = 0)$ 可确保即使存在零权重规则，`violated[k]` 也严格对应实际违背情况。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

为每条软规则分配松弛标志 `violated[k]`，通过 `or(cond, ...)` 允许在违背时松弛，并通过 `implies(cond, ...)` 强制在满足时取 0；最后使用 `minimize` 最小化 `dot(weights, violated)`。

**WaSHI (TypeScript)**

```ts
const violated = m.binary(input.softRules.length, { prefix: "viol" });
const weights = input.softRules.map((s) => s.weight);

input.softRules.forEach((s, k) => {
  const cond = compileFormula(s.expr, bools);
  m.constraint(or(cond, expr`${violated[k]} == 1`), `soft_${s.id}`);
  m.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
});
m.objective(minimize(dot(weights, violated)));
await m.solve({ solver: "z3" });
```
