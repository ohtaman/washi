## 解题思路

维护由 `baseRules` 初始化的累积规则集 $P$，按顺序检查每条规则 $R_i = (c_i \implies e_i)$：若 $P \land c_i$ 为 `"Unsat"` 则判为**死规则**；否则若 $P \land c_i \land \neg e_i$ 为 `"Unsat"` 则判为**冗余规则**；随后将 $c_i \implies e_i$ 并入 $P$。

## 数学模型

$$
\begin{aligned}
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## 核心要点

- **区分死规则与冗余规则**：因为 $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$，死规则由于前件永假也会令 $P \land c_i \land \neg e_i$ 不可满足；先判死规则再判冗余可以避免重复归类。
- **顺序累积检查**：将先前规则逐条并入上下文，可同时捕获被前置规则阻塞的触发条件以及由传递蕴含导致的冗余规则。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
