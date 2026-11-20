## 解题思路

先运行 `await m.check({ solver: "z3" })` 求得第一组满足赋值 $x^*$；若存在解，则添加排除 $x^*$ 的 No-Good 阻塞子句后再次调用 `m.check({ solver: "z3" })`，当且仅当第二次返回 `"Unsat"` 时解唯一。

## 数学模型

$$
\begin{aligned}
\text{初次求解:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good 割:} \quad & \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i
\end{aligned}
$$

## 核心要点

- **基于德摩根律的阻塞子句**：要求新解至少在一个变量上不同于 $x^*$，即 $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$，化简后恰为单个析取式（原值为真取否定，原值为假取正文字；对于示例赋值 `{ a: true, b: true, c: false, d: true }`，即 `or(not(a), not(b), c, not(d))`）。
- **反驳即证明**：第二次 `m.check()` 返回 `"Unsat"` 直接构成了唯一性的形式化证明（`unique: true`）。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

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
