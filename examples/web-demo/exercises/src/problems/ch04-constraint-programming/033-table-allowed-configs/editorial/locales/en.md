## Approach

Let $k$ be the number of components (`componentCosts.length`), with option cost arrays $\text{cost}_c$ (`componentCosts[c]`), allowed rule set $\mathcal{R}_{\text{allowed}}$ (`allowedRules`), and forbidden rule set $\mathcal{R}_{\text{forbidden}}$ (`forbiddenRules`). Introduce one bounded integer variable $x_c \in \{0, \dots, |\text{cost}_c| - 1\}$ (`choices[c]`) per component, restrict each rule's component tuple to lie in $T^+$ or outside $T^-$, and minimize the total option cost $\sum_{c=0}^{k-1} \text{cost}_{c,\, x_c}$. In WaSHI on Pumpkin, these map directly to `allowed(vars, tuples)`, `not(allowed(vars, tuples))`, and `at(componentCosts[c], choices[c])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{c=0}^{k-1} \text{cost}_{c,\, x_c} \\
\text{s.t.} \quad & (x_{v_1}, \dots, x_{v_r}) \in T^+ && \forall ((v_1, \dots, v_r), T^+) \in \mathcal{R}_{\text{allowed}} \\
& (x_{v_1}, \dots, x_{v_r}) \notin T^- && \forall ((v_1, \dots, v_r), T^-) \in \mathcal{R}_{\text{forbidden}} \\
& x_c \in \{0, \dots, |\text{cost}_c| - 1\} && \forall c \in \{0, \dots, k - 1\}
\end{aligned}
$$

## Key Points

- **Extensional table constraints vs. algebraic linearization**: Arbitrary discrete compatibility tables (binary, ternary, or higher-arity) would require awkward indicator polynomials or tuple-selector binaries in MIP. In CP, `allowed(vars, tuples)` and `not(allowed(vars, tuples))` directly target Pumpkin's native `table` and `negative_table` propagators.
- **Composing globals with `not(...)`**: Wrapping `allowed(...)` inside `not(...)` cleanly expresses sparse exclusions without enumerating the full Cartesian complement.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Register `allowed(...)` for `allowedRules` and `not(allowed(...))` for `forbiddenRules` in bulk via `m.constraint([...])`, minimize the sum of `at(costs, choices[c])`, and solve on Pumpkin.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.allowedRules.map((r) => allowed(r.vars.map((c) => choices[c]), r.tuples))
);
m.constraint(
  input.forbiddenRules.map((r) => not(allowed(r.vars.map((c) => choices[c]), r.tuples)))
);
m.objective(minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c])))));
await m.solve({ solver: "pumpkin" });
```
