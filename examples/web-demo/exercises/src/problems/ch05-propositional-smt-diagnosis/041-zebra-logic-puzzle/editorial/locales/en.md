## Approach

Declare a Boolean variable $x_{c,v,p} \in \{\text{false}, \text{true}\}$ via `m.bool()` for every category $c$, attribute value $v \in V_c$, and position $p \in \{0, \dots, n-1\}$. Enforce exact-one constraints per `(position, category)` row and per `(category, value)` column using `or(...)` and pairwise `not(and(...))`, translate each structured clue into propositional constraints, and solve with `await m.check({ solver: "z3" })`.

## Mathematical Model

$$
\begin{aligned}
\text{find} \quad & x_{c,v,p} \in \{\text{false}, \text{true}\} && \forall c \in C,\; v \in V_c,\; p \in \{0, \dots, n-1\} \\
\text{s.t.} \quad & \bigvee_{v \in V_c} x_{c,v,p} \;\land\; \bigwedge_{u \neq v} \neg(x_{c,u,p} \land x_{c,v,p}) && \forall c \in C,\; p \in \{0, \dots, n-1\} \\
& \bigvee_{p=0}^{n-1} x_{c,v,p} \;\land\; \bigwedge_{p < q} \neg(x_{c,v,p} \land x_{c,v,q}) && \forall c \in C,\; v \in V_c \\
& \phi_{\text{clue}}(x) = \text{true} && \forall \text{clue} \in \text{clues}
\end{aligned}
$$

## Key Points

- **Pure Boolean exact-one encoding**: Using `or(...)` for at-least-one and pairwise `not(and(...))` for at-most-one keeps the entire Zebra puzzle in propositional SAT without mixing integer arithmetic.
- **Positional & neighbor clues**: Immediate adjacency (`leftOf` with `immediate: true`) maps $x_{c_1,v_1,p} \implies x_{c_2,v_2,p+1}$ (and forbids $p = n - 1$), while general `leftOf` and `nextTo` map each position $p$ to a disjunction over valid target positions.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

**WaSHI (TypeScript)**

```ts
function exactOne(m: Model, vars: BoolVar[], prefix: string): void {
  m.constraint(or(...vars), `${prefix}_at_least_one`);
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      m.constraint(not(and(vars[i], vars[j])), `${prefix}_at_most_one_${i}_${j}`);
    }
  }
}

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
