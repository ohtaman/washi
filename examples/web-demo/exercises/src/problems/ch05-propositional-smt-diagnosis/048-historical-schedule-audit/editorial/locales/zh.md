## 解题思路

将已记录的历史赋值 $\hat{v}$ 直接代入每条命名规则进行求值，收集所有求值为假的规则 ID。在 WaSHI 中，用 `m.bool`、`m.integer` 与带规则 ID 的 `m.constraint(..., r.id)` 构建模型后，无需启动求解器，直接调用 `m.verify({ values: input.candidateValues })` 对历史记录进行同步检验，再将所有报告的违规规则名去重并按字典序返回。

## 数学模型

$$
\begin{aligned}
\text{Violated} &= \bigl\{\, r.\text{id} \;\big|\; r \in R,\; \text{eval}\bigl(r.\text{expr},\, \hat{v}\bigr) = \text{false} \,\bigr\} \\
\text{valid} &\iff \text{Violated} = \emptyset
\end{aligned}
$$

## 核心要点

- **零求解器开销的确定性验证 (`m.verify`)**：`m.verify({ values })` 在纯 TypeScript 层直接校验变量界、整数性、线性约束与完整的布尔/SMT 逻辑树（`and`、`or`、`not`、`implies`、`xor`）。
- **命名约束直接定位违规项**：用 `r.id` 为每条规则命名后，`report.violations` 中的 `.name` 即对应具体的违规规则 ID。
- 概念参考：[指南与术语表 — 判题结果与求解状态](?view=guide&lang=zh#verdicts)

## 实现要点

将每条合规规则以规则 ID `r.id` 作为名称注册到 `m.constraint`，调用 `m.verify({ values: input.candidateValues })`，并对返回的 `report.violations` 中的违规规则 ID 去重后排序。

**WaSHI (TypeScript)**

```ts
for (const r of input.rules) {
  m.constraint(compileSmt(r.expr, bools, ints), r.id);
}
const report = m.verify({ values: input.candidateValues });
return {
  valid: report.valid,
  violatedRules: Array.from(new Set(report.violations.map((v) => v.name))).sort(),
};
```
