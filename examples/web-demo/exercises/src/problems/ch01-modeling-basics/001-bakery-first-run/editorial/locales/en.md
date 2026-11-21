## Approach

Declare two non-negative **continuous decision variables** (`c` for croissants, `l` for loaves), add both `<=` resource constraints, and maximize the linear profit expression.

## Mathematical Model

$$
\begin{aligned}
\max \quad & 40c + 70\ell \\
\text{s.t.} \quad & 2c + 3\ell \le \text{flourCap} \\
& c + 2\ell \le \text{butterCap} \\
& c, \ell \ge 0
\end{aligned}
$$

## Key Points

- **Why the starter fails (`VIOLATION`)**: Without the butter constraint, the solver puts everything into loaves ($c = 0, \ell = 40$), consuming $80 > 70$ butter.
- **First LP concepts**: This is a standard **LP (Linear Programming)** model because every expression is linear and both variables are continuous (`lb: 0`). Notice the optimum sits cleanly at the corner where both `flour` and `butter` limits bind tightly.
- Related definitions: [Guide & Glossary — LP & Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**PuLP (Python)**

```python
prob += c + 2 * l <= butter_cap, "butter"
```
