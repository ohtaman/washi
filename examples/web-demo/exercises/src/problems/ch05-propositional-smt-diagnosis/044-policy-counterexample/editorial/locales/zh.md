## 解题思路

用 `m.bool()` 与带上下界的 `m.integer()` 声明布尔及整数属性，把 `input.rules` 与安全不变量的否定 `not(safeInvariant)` 一并加入模型并调用 `await m.check({ solver: "z3" })`：若返回 `"Sat"` 则得到具体反例，若返回 `"Unsat"` 则证明策略严格安全。

## 数学模型

$$
\begin{aligned}
\text{find} \quad & (b, z) \in \{\text{false}, \text{true}\}^{|B|} \times \prod_j [\text{lb}_j, \text{ub}_j] \\
\text{s.t.} \quad & \bigwedge_{r \in \text{rules}} \phi_r(b, z) \;\land\; \neg\,\psi_{\text{safe}}(b, z)
\end{aligned}
$$

## 核心要点

- **反驳证明法**：直接验证 `rules && safeInvariant` 可满足只能找到一个合规样例；只有验证 `rules && not(safeInvariant)` 为 `"Unsat"`，才能严格证明全局状态空间不存在漏洞。
- **布尔与算术混合推理**：Z3 原生支持将整数比较约束放在 `implies` 前件或 `not` 内部，无需手动引入大 M 线性化。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
input.rules.forEach((rule, i) => {
  m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
});
m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { hasViolation: false, counterexample: null };
```
