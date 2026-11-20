## Approach

Create a Boolean decision variable `pick[p][v]` (`m.bool`) and a `0`-`1` indicator `used[p][v]` (`m.binary`) for every package-version pair. Enforce at-most-one version per package, exact-one for required roots, implication clauses for `requires`, exclusion clauses for `conflicts`, and minimize total installed packages via `await m.solve({ solver: "z3" })`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && u_{p,v} \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **At-most-one & exact-one in SAT**: Pairwise `not(and(a, b))` forbids installing two versions of the same package, while adding `or(...versions)` turns at-most-one into exact-one for root packages.
- **Handling infeasible dependency graphs**: When conflicting requirements form an unresolvable diamond conflict, `m.solve({ solver: "z3" })` returns `"Infeasible"`, which maps directly to `{ feasible: false, selected: null, installedCount: null }`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  m.constraint(implies(pick[req.pkg][req.ver], deps.length === 1 ? deps[0] : or(...deps)), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
