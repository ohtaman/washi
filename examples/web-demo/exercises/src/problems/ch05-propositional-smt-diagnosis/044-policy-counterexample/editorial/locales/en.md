## Approach

Declare `m.bool()` for Boolean flags and `m.integer()` with bounds `{ lb, ub }` for integer attributes, assert every rule in `input.rules`, and additionally assert `not(safeInvariant)`. Calling `await m.check({ solver: "z3" })` yields `"Sat"` with a concrete counterexample if a loophole exists, or `"Unsat"` when the safety property is universally valid.

## Mathematical Model

$$
\begin{aligned}
\text{find} \quad & (b, z) \in \{\text{false}, \text{true}\}^{|B|} \times \prod_j [\text{lb}_j, \text{ub}_j] \\
\text{s.t.} \quad & \bigwedge_{r \in \text{rules}} \phi_r(b, z) \;\land\; \neg\,\psi_{\text{safe}}(b, z)
\end{aligned}
$$

## Key Points

- **Proof by refutation**: Checking satisfiability of `rules && safeInvariant` only shows *one* safe case; asserting `rules && not(safeInvariant)` exhaustively searches all combinations for a counterexample, so `"Unsat"` proves safety across the entire state space.
- **Mixed Boolean-arithmetic predicates**: Z3 natively combines Boolean connectives with linear integer comparisons (`<=`, `>=`, `==`, `!=`) inside antecedents and negations.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
input.rules.forEach((rule, i) => {
  m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
});
m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { hasViolation: false, counterexample: null };
```
