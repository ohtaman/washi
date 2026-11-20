## 解题思路

为每个布尔变量创建 `m.bool(name)` 命题变量，递归地将规则树转换为 WaSHI 逻辑组合子（`not`、`and`、`or`、`implies`、`xor`）加入模型，然后调用 `await m.check({ solver: "z3" })` 判定可满足性。

## 数学模型

$$
\begin{aligned}
\text{find} \quad & x_v \in \{\text{false}, \text{true}\} && \forall v \in V \\
\text{s.t.} \quad & \phi_r(x) = \text{true} && \forall r \in \text{rules}
\end{aligned}
$$

## 核心要点

- **`m.bool()` 与 `m.binary()` 的区别**：`BoolVar` 原生表达布尔真假值而非数值 `0`-`1`，可直接用于 `implies()`、`xor()`、`and()`、`or()` 与 `not()`。
- **使用 `m.check()` 进行纯可满足性检验**：当模型没有优化目标时，调用 `m.check({ solver: "z3" })` 返回 `"Sat"` 或 `"Unsat"`。
- 概念参考：[指南与术语表 — 常见模型分类](?view=guide&lang=zh#paradigms) / [求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

**WaSHI (TypeScript)**

```ts
const m = new Model("PropositionalSAT");
const bools = m.bool(input.vars);

input.rules.forEach((rule, i) => {
  m.constraint(compileFormula(rule, bools), `rule_${i}`);
});

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
