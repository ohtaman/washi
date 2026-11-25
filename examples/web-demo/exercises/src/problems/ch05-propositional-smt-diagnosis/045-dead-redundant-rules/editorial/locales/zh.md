## 解题思路

维护由 `baseRules` 与先前规则 $R_0, \dots, R_{i-1}$ 构成的累积公式 $P_{<i}$，按顺序检查每条规则 $R_i = (c_i \implies e_i)$：若 $P_{<i} \land c_i$ 为 `"Unsat"` 则判为**死规则**；否则若 $P_{<i} \land c_i \land \neg e_i$ 为 `"Unsat"` 则判为**冗余规则**；随后将 $c_i \implies e_i$ 并入得到 $P_{<i+1}$。

## 数学模型

$$
\begin{aligned}
P_{<i} &= \biggl(\bigwedge_{b \in \text{baseRules}} b\biggr) \;\land\; \biggl(\bigwedge_{j < i} (c_j \implies e_j)\biggr) \\
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## 核心要点

- **区分死规则与冗余规则**：因为 $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$，死规则（$P_{<i} \land c_i$ 为 Unsat）由于前件永假也会令 $P_{<i} \land c_i \land \neg e_i$ 不可满足；先判死规则再判冗余可以避免重复归类。
- **顺序累积检查**：将先前规则逐条并入 $P_{<i}$，可同时捕获被前置规则阻塞的触发条件以及由传递蕴含导致的冗余规则。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

编写简洁的 `isSat` 辅助函数，将 `PropFormula` 列表编译进全新的 WaSHI `Model` 并调用 Z3 判定。维护累积约束 `prior`，按顺序对每条规则判定死规则与冗余规则，判定结束后再以 `{ implies: [r.condition, r.effect] }` 形式追加到 `prior` 中供后续规则使用。

**WaSHI (TypeScript)**

```ts
async function isSat(vars: string[], formulas: PropFormula[]): Promise<boolean> {
  const m = new Model("RuleAudit");
  const bools = m.bool(vars);
  formulas.forEach((f, i) => m.constraint(compileFormula(f, bools), `f_${i}`));
  return (await m.check({ solver: "z3" })).status === "Sat";
}

for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
