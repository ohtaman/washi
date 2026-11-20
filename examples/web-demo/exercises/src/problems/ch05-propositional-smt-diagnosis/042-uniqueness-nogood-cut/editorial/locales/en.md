## Approach

Run `await m.check({ solver: "z3" })` to test initial satisfiability. If `"Sat"`, record the truth vector $x^*$, append a single no-good blocking clause ruling out $x^*$, and call `await m.check({ solver: "z3" })` a second time; the solution is unique if and only if the second check returns `"Unsat"`.

## Mathematical Model

$$
\begin{aligned}
\text{Check 1:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good Cut:} \quad & \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i
\end{aligned}
$$

## Key Points

- **Exact blocking clause (De Morgan)**: Requiring the new assignment to differ from $x^*$ in at least one variable is $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$, which equals a single disjunction where true variables appear negated and false variables appear positive (for the sample `{ a: true, b: true, c: false, d: true }`, this is `or(not(a), not(b), c, not(d))`).
- **Refutation as an `AC` proof**: When the second `m.check()` returns `"Unsat"`, that solver status is the mathematical proof of uniqueness (`unique: true`), not a modeling error.
- Related definitions: [Guide & Glossary — Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

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
