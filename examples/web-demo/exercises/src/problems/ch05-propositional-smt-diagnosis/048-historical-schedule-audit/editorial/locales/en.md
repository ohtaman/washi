## Approach

Construct the WaSHI `Model` with every Boolean variable (`m.bool`), bounded integer variable (`m.integer`), and named rule (`m.constraint(..., rule.id)`), then call `m.verify({ values: input.candidateValues })` directly in JavaScript—no solver invocation required—and collect every reported violation name sorted lexicographically.

## Mathematical Model

$$
\begin{aligned}
\text{Violated} &= \bigl\{\, r.\text{id} \in R \;\big|\; \text{eval}\bigl(r.\text{expr},\, \hat{v}\bigr) = \text{false} \,\bigr\} \\
\text{valid} &\iff \text{Violated} = \emptyset
\end{aligned}
$$

## Key Points

- **Zero-WASM verification (`m.verify`)**: `m.verify({ values })` independently evaluates variable bounds, integrality, linear constraints, and full Boolean/SMT AST trees (`and`, `or`, `not`, `implies`, `xor`) synchronously in TypeScript.
- **Named rules for pinpointed audits**: Naming each constraint with `rule.id` lets `report.violations` return exact rule identifiers directly (`v.name`), avoiding manual rule-by-rule re-implementation.
- Related definitions: [Guide & Glossary — Judge Verdicts](?view=guide&lang=en#verdicts).

## Key Implementation

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
