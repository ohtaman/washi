## Approach

We search for an assignment to the Boolean flags and bounded integer attributes that satisfies every policy rule while falsifying the safety invariant. Representing the flags with `m.bool()` and the attributes with bounded `m.integer({ lb, ub })`, we assert all `input.rules` together with `not(safeInvariant)` and call `await m.check({ solver: "z3" })`, yielding `"Sat"` with a concrete counterexample if a loophole exists or `"Unsat"` when the safety property holds universally.

## Mathematical Model

$$
\begin{aligned}
\text{find} \quad & (b, z) \in \{\text{false}, \text{true}\}^{|\text{boolVars}|} \times \prod_{j \in \text{intVars}} \bigl([\text{lb}_j, \text{ub}_j] \cap \mathbb{Z}\bigr) \\
\text{s.t.} \quad & \bigwedge_{r \in \text{rules}} \phi_r(b, z) \;\land\; \neg\,\psi_{\text{safe}}(b, z)
\end{aligned}
$$

## Key Points

- **Proof by refutation**: Checking satisfiability of `rules && safeInvariant` only shows *one* safe case; asserting `rules && not(safeInvariant)` exhaustively searches all combinations for a counterexample, so `"Unsat"` proves safety across the entire state space.
- **Mixed Boolean-arithmetic predicates**: Z3 natively combines Boolean connectives with linear integer comparisons (`<=`, `>=`, `==`, `!=`) inside antecedents and negations without manual big-M linearization.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Add every policy rule to the model via `compileSmt`, then assert the negation of `safeInvariant` with `not(...)`. If `m.check({ solver: "z3" })` does not return `"Sat"`, no counterexample exists.

**WaSHI (TypeScript)**

```ts
input.rules.forEach((rule, i) => {
  m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
});
m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { hasViolation: false, counterexample: null };
```
