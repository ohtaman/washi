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

- **Why the starter fails (`VIOLATION`)**: Because the starter code omits the butter stock constraint, the computed production exceeds the butter limit, resulting in `VIOLATION`.
- **LP (Linear Programming)**: A model whose variables are continuous (`continuous`) and whose constraints and objective are all linear expressions is called an **LP**.
- Related definitions: [Guide & Glossary — LP & Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Constraint expressions can be written intuitively using template literals `expr` (WaSHI) or `prob += ...` (PuLP). Passing a constraint name such as `"butter"` as the second argument makes it easier to trace constraints when diagnosing or verifying the model later.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**PuLP (Python)**

```python
prob += c + 2 * l <= butter_cap, "butter"
```
