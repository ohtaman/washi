## Approach

Introduce a Boolean selection variable $x_{p,v} \in \{\text{false}, \text{true}\}$ and a paired counting indicator $u_{p,v} \in \{0, 1\}$ linked by $x_{p,v} \iff (u_{p,v} = 1)$ for every package-version pair $(p, v)$. Enforce at-most-one version per package, at-least-one (hence exact-one) for required roots, implication clauses for `requires`, and exclusion clauses for `conflicts`, while minimizing $\sum_{p,v} u_{p,v}$. In WaSHI, represent these with `pick[p][v]` (`m.bool`) and `used[p][v]` (`m.binary`) and optimize via `await m.solve({ solver: "z3" })`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && \forall p, \; v \in V_p \\
& x_{p,v} \in \{\text{false}, \text{true}\}, \; u_{p,v} \in \{0, 1\} && \forall p, \; v \in V_p
\end{aligned}
$$

## Key Points

- **At-most-one & exact-one in SAT**: Pairwise `not(and(a, b))` forbids installing two versions of the same package, while adding `or(...versions)` turns at-most-one into exact-one for root packages.
- **Channeling `BoolVar` to `m.binary`**: Because logical combinators act on `BoolVar` while `minimize(sum(...))` sums arithmetic `Var` variables, pair each `m.bool(...)` with an `m.binary(...)` indicator linked in both directions via ``implies(b, expr`${u} == 1`)`` and ``implies(not(b), expr`${u} == 0`)``.
- **Handling infeasible dependency graphs**: Whenever incompatible dependencies or conflicts leave no valid installation, `m.solve({ solver: "z3" })` returns `"Infeasible"`, which maps directly to `{ feasible: false, selected: null, installedCount: null }`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Channel each Boolean decision `b` to its 0-1 indicator `u` with bidirectional `implies`, register the required roots and dependency rules (forbidding `pkg@ver` when `depVersions` is empty), minimize `sum(allUsed)`, and solve via `m.solve({ solver: "z3" })`.

**WaSHI (TypeScript)**

```ts
const b = m.bool(`pick_${pkg}_${ver}`);
const u = m.binary(`used_${pkg}_${ver}`);
m.constraint(implies(b, expr`${u} == 1`), `link_on_${pkg}_${ver}`);
m.constraint(implies(not(b), expr`${u} == 0`), `link_off_${pkg}_${ver}`);

for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  const rhs = deps.length === 0 ? not(pick[req.pkg][req.ver]) : deps.length === 1 ? deps[0] : or(...deps);
  m.constraint(deps.length === 0 ? rhs : implies(pick[req.pkg][req.ver], rhs), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
