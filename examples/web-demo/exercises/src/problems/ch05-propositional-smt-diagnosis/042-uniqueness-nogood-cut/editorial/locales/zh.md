## 解题思路

为每个变量 $i \in \text{vars}$ 引入布尔变量 $x_i \in \{\text{false}, \text{true}\}$，并分两阶段检查可满足性。第一阶段求解所有规则的合取以寻找一组可行赋值 $x^*$；若存在解，则在原规则上加入一条排除 $x^*$ 的阻塞子句（No-Good 割）并进行第二阶段求解——当且仅当第二阶段不可满足时，解唯一。在 WaSHI 中，两阶段分别调用 `await m.check({ solver: "z3" })`，以第二次返回 `"Unsat"` 判定唯一性。

## 数学模型

$$
\begin{aligned}
\text{变量:} \quad & x_i \in \{\text{false}, \text{true}\} && \forall i \in \text{vars} \\
\text{初次求解:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good 割:} \quad & \psi_{\text{cut}}(x) \equiv \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i \\
\text{二次求解:} \quad & \biggl(\bigwedge_{r \in \text{rules}} \phi_r(x)\biggr) \land \psi_{\text{cut}}(x)
\end{aligned}
$$

## 核心要点

- **基于德摩根律的阻塞子句**：要求新解至少在一个变量上不同于 $x^*$，即 $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$，化简后恰为单个析取式（原值为真取否定，原值为假取正文字；对于示例赋值 `{ a: true, b: true, c: false, d: true }`，即 `or(not(a), not(b), c, not(d))`）。
- **反驳即证明**：第二次 `m.check()` 返回 `"Unsat"` 直接构成了唯一性的形式化证明（`unique: true`）。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

通过 `Object.fromEntries` 提取首次 `m.check({ solver: "z3" })` 得到的赋值，添加仅否定该赋值的 `nogood_cut` 约束并再次调用 `m.check`；若第二次返回 `"Unsat"`，则解唯一。

**WaSHI (TypeScript)**

```ts
const first = await m.check({ solver: "z3" });
if (first.status !== "Sat") return { satisfiable: false, assignment: null, unique: false };

const assignment = Object.fromEntries(input.vars.map((v) => [v, Boolean(bools[v].value)]));
m.constraint(
  or(...input.vars.map((v) => (assignment[v] ? not(bools[v]) : bools[v]))),
  "nogood_cut"
);
const second = await m.check({ solver: "z3" });
return { satisfiable: true, assignment, unique: second.status === "Unsat" };
```
