## Approach

Evaluate each named rule directly against the recorded assignment $\hat{v}$ and collect every rule ID whose formula evaluates to false. In WaSHI, construct a `Model` with every Boolean variable (`m.bool`), bounded integer variable (`m.integer`), and named rule (`m.constraint(..., r.id)`), then call `m.verify({ values: input.candidateValues })` directly in JavaScript—no solver invocation required—and sort every reported violation name lexicographically.

## Mathematical Model

$$
\begin{aligned}
\text{Violated} &= \bigl\{\, r.\text{id} \;\big|\; r \in R,\; \text{eval}\bigl(r.\text{expr},\, \hat{v}\bigr) = \text{false} \,\bigr\} \\
\text{valid} &\iff \text{Violated} = \emptyset
\end{aligned}
$$

## Key Points

- **Zero-WASM verification (`m.verify`)**: `m.verify({ values })` independently evaluates variable bounds, integrality, linear constraints, and full Boolean/SMT AST trees (`and`, `or`, `not`, `implies`, `xor`) synchronously in TypeScript.
- **Named rules for pinpointed audits**: Naming each constraint with `rule.id` lets `report.violations` return exact rule identifiers directly (`v.name`), avoiding manual rule-by-rule re-implementation.
- Related definitions: [Guide & Glossary — Judge Verdicts](?view=guide&lang=en#verdicts).

## Key Implementation

Register each compliance rule with `m.constraint` named by its rule ID `r.id`, call `m.verify({ values: input.candidateValues })`, and deduplicate and sort the violated rule IDs from `report.violations`.

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
