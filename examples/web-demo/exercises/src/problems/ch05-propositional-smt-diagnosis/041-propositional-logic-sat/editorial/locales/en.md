## Approach

Declare a propositional Boolean variable `m.bool(name)` for each flag in `input.vars`, translate each rule recursively into WaSHI logical combinators (`not`, `and`, `or`, `implies`, `xor`), and run `await m.check({ solver: "z3" })`.

## Mathematical Model

$$
\begin{aligned}
\text{find} \quad & x_v \in \{\text{false}, \text{true}\} && \forall v \in V \\
\text{s.t.} \quad & \phi_r(x) = \text{true} && \forall r \in \text{rules}
\end{aligned}
$$

## Key Points

- **`m.bool()` vs. `m.binary()`**: Propositional `BoolVar` variables represent native Boolean logic values (`true` / `false`) rather than `0`-`1` numeric variables, allowing direct composition with `implies()`, `xor()`, `and()`, `or()`, and `not()`.
- **Pure feasibility with `m.check()`**: When no numeric objective is needed, `m.check({ solver: "z3" })` returns `"Sat"` with a satisfying model or `"Unsat"` (with `unsatCore`) instead of `"Optimal"` / `"Infeasible"`.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const m = new Model("PropositionalSAT");
const bools = m.bool(input.vars);

input.rules.forEach((rule, i) => {
  m.constraint(compileFormula(rule, bools), `rule_${i}`);
});

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
