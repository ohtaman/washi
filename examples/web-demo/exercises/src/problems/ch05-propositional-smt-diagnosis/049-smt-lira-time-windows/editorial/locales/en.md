## Approach

Combine Boolean mode switches `express[i]` (`m.bool`), 0-1 quota indicators `expFlag[i]` (`m.binary`), and continuous real timing variables `start[i]`, `end[i]`, `tardy[i]` (`m.continuous`). Use `implies(...)` to select each mode's time window and fractional duration, `or(...)` for blackout avoidance and pairwise dock non-overlap, and `await m.solve({ solver: "z3" })` to minimize express fees plus tardiness penalties.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i^{\text{exp}}\, e_i + p_i\, \tau_i \right) \\
\text{s.t.} \quad & x_i \iff (e_i = 1) && \forall i \\
& \neg x_i \implies \bigl(w^{\text{std}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{std}},\; c_i \le w^{\text{std}}_{i,1}\bigr) && \forall i \\
& x_i \implies \bigl(w^{\text{exp}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{exp}},\; c_i \le w^{\text{exp}}_{i,1}\bigr) && \forall i \\
& (c_i \le b_0) \lor (s_i \ge b_1) && \forall i \\
& (c_i \le s_j) \lor (c_j \le s_i) && \forall i < j \\
& \sum_{i=0}^{n-1} e_i \le K_{\max} \\
& \tau_i \ge c_i - D_i && \forall i \\
& x_i \in \{\text{false}, \text{true}\},\quad e_i \in \{0, 1\},\quad s_i, c_i, \tau_i \ge 0 && \forall i
\end{aligned}
$$

## Key Points

- **Big-M-free SMT-LIRA**: Unlike pure MIP formulations that need manually tuned Big-$M$ constants for continuous time windows and disjunctive dock non-overlap, Z3 reasons directly over `Continuous` real inequalities inside `implies` and `or` without numerical looseness.
- **Exact coupling between logic, integers, and reals**: Linking `BoolVar` `express[i]` to `Binary` `expFlag[i]` allows `sum(expFlag).le(input.maxExpress)` and linear objective terms alongside real-valued continuous start/end times.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Use `implies(...)` to switch mode-specific time windows and duration equations, and `or(...)` to express blackout avoidance and pairwise non-overlap directly without Big-M.

**WaSHI (TypeScript)**

```ts
m.constraint(
  implies(express[i], and(expr`${start[i]} >= ${spec.expWindow[0]}`, expr`${end[i]} == ${start[i]} + ${spec.expDuration}`, expr`${end[i]} <= ${spec.expWindow[1]}`)),
  `exp_mode_${i}`
);
m.constraint(or(expr`${end[i]} <= ${input.blackout[0]}`, expr`${start[i]} >= ${input.blackout[1]}`), `blackout_${i}`);
m.constraint(or(expr`${end[i]} <= ${start[j]}`, expr`${end[j]} <= ${start[i]}`), `dock_${i}_${j}`);
```
