## Approach

For $k$ components ($c \in \{0, \dots, k - 1\}$), create one bounded integer variable $x_c = \text{choices}[c]$ per component, enforce every positive rule via `allowed(vars, tuples)` and every negative rule via `not(allowed(vars, tuples))`, and minimize total cost via `at(componentCosts[c], choices[c])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{c=0}^{k-1} \text{cost}_{c,\, x_c} \\
\text{s.t.} \quad & (x_{v_1}, \dots, x_{v_r}) \in T^+ && \forall (V, T^+) \in \mathcal{R}_{\text{allowed}}, \; V = (v_1, \dots, v_r) \\
& (x_{v_1}, \dots, x_{v_r}) \notin T^- && \forall (V, T^-) \in \mathcal{R}_{\text{forbidden}}, \; V = (v_1, \dots, v_r) \\
& x_c \in \{0, \dots, |\text{cost}_c| - 1\} && \forall c \in \{0, \dots, k - 1\}
\end{aligned}
$$

## Key Points

- **Extensional table constraints vs. algebraic linearization**: Arbitrary non-linear compatibility matrices (binary, ternary, or higher-arity) would require awkward indicator polynomials or tuple-selector binaries in MIP. In CP, `allowed(vars, tuples)` and `not(allowed(vars, tuples))` directly target Pumpkin's native `table` and `negative_table` propagators.
- **Composing globals with `not(...)`**: Wrapping `allowed(...)` inside `not(...)` cleanly expresses sparse exclusions without enumerating the full Cartesian complement.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Declare a bounded integer variable `choices[c]` for each component's option range, register `allowed(...)` for `allowedRules` and `not(allowed(...))` for `forbiddenRules` in bulk via `m.constraint([...])`, minimize the sum of `at(costs, choices[c])`, and solve on Pumpkin.

**WaSHI (TypeScript)**

```ts
const choices = input.componentCosts.map((costs, c) =>
  m.integer(`comp_${c}`, { lb: 0, ub: costs.length - 1 })
);
m.constraint(
  input.allowedRules.map((r) => allowed(r.vars.map((c) => choices[c]), r.tuples))
);
m.constraint(
  input.forbiddenRules.map((r) => not(allowed(r.vars.map((c) => choices[c]), r.tuples)))
);
m.objective(minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c])))));
await m.solve({ solver: "pumpkin" });
```
