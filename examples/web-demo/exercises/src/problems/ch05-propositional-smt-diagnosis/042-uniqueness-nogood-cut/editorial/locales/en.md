## Approach

Introduce a Boolean variable $x_i \in \{\text{false}, \text{true}\}$ for each $i \in \text{vars}$ and solve in two satisfiability stages. First check whether the conjunction of all rules has a satisfying truth vector $x^*$; if it does, conjoin a single blocking clause (no-good cut) that forbids $x^*$ and check satisfiability again—the solution is unique if and only if the second stage is unsatisfiable. In WaSHI, run `await m.check({ solver: "z3" })` for each stage and test `second.status === "Unsat"`.

## Mathematical Model

$$
\begin{aligned}
\text{Variables:} \quad & x_i \in \{\text{false}, \text{true}\} && \forall i \in \text{vars} \\
\text{Check 1:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good Cut:} \quad & \psi_{\text{cut}}(x) \equiv \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i \\
\text{Check 2:} \quad & \biggl(\bigwedge_{r \in \text{rules}} \phi_r(x)\biggr) \land \psi_{\text{cut}}(x)
\end{aligned}
$$

## Key Points

- **Exact blocking clause (De Morgan)**: Requiring the new assignment to differ from $x^*$ in at least one variable is $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$, which equals a single disjunction where true variables appear negated and false variables appear positive (for the sample `{ a: true, b: true, c: false, d: true }`, this is `or(not(a), not(b), c, not(d))`).
- **Refutation as a uniqueness proof**: When the second `m.check()` returns `"Unsat"`, that solver status is the mathematical proof of uniqueness (`unique: true`), not a modeling error.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

Extract the assignment from the first `m.check({ solver: "z3" })` using `Object.fromEntries`, add a `nogood_cut` constraint that negates only that assignment, and call `m.check` again—if the second check returns `"Unsat"`, the solution is unique.

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
