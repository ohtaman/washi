## Approach

Start from the feasible `initialPlan` and run rolling overlapping window passes of width `windowSize`. In each subproblem `[start, start + windowSize)`, fix `y_t` outside the window to its incumbent binary value while leaving `y_t` binary inside the window and keeping continuous `p_t` and `inv_t` unfixed everywhere so inventory flows rebalance globally across window boundaries.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \big(K_t y_t + c_t p_t + h I_t\big) \\
\text{s.t.} \quad & I_{t-1} + p_t - I_t = d_t && \forall t \quad (I_{-1} = 0) \\
& 0 \le p_t \le C_t y_t, \quad I_t \ge 0 && \forall t \\
& y_t \in \{0, 1\} && \forall t \in [s, s + W) \\
& y_t = \bar{y}_t && \forall t \notin [s, s + W)
\end{aligned}
$$

## Key Points

- **Keep continuous flows free globally**: Fixing binary setups outside `[s, s+W)` while allowing all continuous `p_t` and `inv_t` variables to move ensures every subproblem remains feasible and enables lot merging across window boundaries.
- **Overlapping step-1 sweeps**: Stepping by `1` overlaps consecutive windows by `windowSize - 1` periods, letting freed setup decisions propagate smoothly from earlier periods into later periods across a single sweep.
- **Exact fixed-integer bounds**: Fixing an outside variable via an integer domain `[v, v]` (rather than setting `.lb` / `.ub` on a `Binary` variable) ensures solvers treat fixed outside variables cleanly as constants.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let pass = 0; pass < 10; pass++) {
  let improved = false;
  for (let start = 0; start <= T - win; start++) {
    const candidate = await solveWindow(input, best.setups, start, start + win);
    if (candidate && candidate.totalCost < best.totalCost - 1e-6) {
      best = candidate;
      improved = true;
    }
  }
  if (!improved) break;
}
```

**PuLP (Python)**

```python
for _ in range(10):
    improved = False
    for start in range(0, n_periods - win + 1):
        candidate = _solve_window(
            demands, setup_costs, prod_costs, hold_cost, capacities, best["setups"], start, start + win
        )
        if candidate is not None and candidate["total_cost"] < best["total_cost"] - 1e-6:
            best = candidate
            improved = True
    if not improved:
        break
```
