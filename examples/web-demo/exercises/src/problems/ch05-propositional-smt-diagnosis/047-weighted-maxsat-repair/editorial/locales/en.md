## Approach

Enforce all `hardRules` directly on Boolean variables `m.bool(input.vars)`. For each soft rule $k$ with weight $w_k$, introduce a 0-1 relaxation indicator $v_k$ (`m.binary`), assert $S_k \lor (v_k = 1)$, and minimize $\sum_k w_k v_k$ using `await m.solve({ solver: "z3" })`.

## Mathematical Model

Let $m = |\text{softRules}|$ be the number of soft rules:

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{m-1} w_k v_k \\
\text{s.t.} \quad & H_j(x) = \text{true} && \forall j \\
& S_k(x) \lor (v_k = 1) && \forall k \in \{0, \dots, m-1\} \\
& S_k(x) \implies (v_k = 0) && \forall k \in \{0, \dots, m-1\} \\
& x_i \in \{\text{false}, \text{true}\}, \quad v_k \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **Relaxation disjunction $S_k \lor (v_k = 1)$**: When $v_k = 0$, the soft rule $S_k$ must hold; when $v_k = 1$, $S_k$ is bypassed and the objective pays weight $w_k$.
- **Tight indicator equivalence**: Adding the converse implication $S_k \implies (v_k = 0)$ guarantees `violated[k]` equals 1 if and only if $S_k$ is violated, even if any rule has weight 0.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Assign a relaxation flag `violated[k]` to each soft rule, using `or(cond, ...)` to allow violation and `implies(cond, ...)` to force the flag to 0 when satisfied. Finally, minimize `dot(weights, violated)` with `minimize`.

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
