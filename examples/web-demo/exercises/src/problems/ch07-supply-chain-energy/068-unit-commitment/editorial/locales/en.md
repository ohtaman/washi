## Approach

Model generator commitments with binary on/off indicators $u_{g,t}$, startup indicators $v_{g,t}$, and continuous shutdown variables $w_{g,t} \in [0, 1]$ linked by state transition $v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1}$, then enforce tight Rajan–Takriti turn-on/turn-off clique inequalities for minimum up/down times together with state-dependent ramp limits.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{g,t} \left( K_g v_{g,t} + c_g p_{g,t} \right) \\
\text{s.t.} \quad & \sum_{g} p_{g,t} = D_t, \quad P^{\min}_g u_{g,t} \le p_{g,t} \le P^{\max}_g u_{g,t} && \forall g, t \\
& v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1} && \forall g, t \;\; (u_{g,-1} = 0) \\
& \sum_{\tau=\max(0, t-U_g+1)}^{t} v_{g,\tau} \le u_{g,t}, \quad \sum_{\tau=\max(0, t-D^{\text{down}}_g+1)}^{t} w_{g,\tau} \le 1 - u_{g,t} && \forall g, t \\
& p_{g,t} - p_{g,t-1} \le R_g u_{g,t-1} + S_g (1 - u_{g,t-1}) && \forall g, t \ge 1 \\
& p_{g,t-1} - p_{g,t} \le R_g u_{g,t} + S_g (1 - u_{g,t}) && \forall g, t \ge 1
\end{aligned}
$$

Here $S_g = \max(P^{\min}_g, R_g)$, $p_{g,0} \le S_g$, $u_{g,t}, v_{g,t} \in \{0, 1\}$, and $w_{g,t} \in [0, 1]$.

## Key Points

- **Facet-defining turn-on/turn-off clique inequalities**: Summing startups over $[t - U_g + 1, t]$ and bounding by $u_{g,t}$ both guarantees generator $g$ stays online for $U_g$ hours and forces at most one startup per $U_g$-hour window; paired with the symmetric $w_{g,t}$ inequality, $v_{g,t}$ and $w_{g,t}$ cannot both be positive simultaneously.
- **State-aware ramp bounds avoid startup/shutdown infeasibility**: Replacing naive $|p_{g,t} - p_{g,t-1}| \le R_g$ with $R_g u + S_g (1 - u)$ lets baseload units whose $P^{\min}_g > R_g$ safely start up to $P^{\min}_g$ and shut down from $P^{\min}_g$ while enforcing $R_g$ during continuous online operation.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const prevU = t === 0 ? 0 : u[g][t - 1];
m.constraint(expr`${v[g][t]} - ${w[g][t]} - ${u[g][t]} + ${prevU} == 0`);
const upStart = Math.max(0, t - input.minUp[g] + 1);
m.constraint(expr`${sum(v[g].slice(upStart, t + 1))} <= ${u[g][t]}`);
const downStart = Math.max(0, t - input.minDown[g] + 1);
m.constraint(expr`${sum(w[g].slice(downStart, t + 1))} + ${u[g][t]} <= 1`);
```

**PuLP (Python)**

```python
prev_u = 0 if t == 0 else u[g][t - 1]
prob += v[g][t] - w[g][t] == u[g][t] - prev_u
prob += pulp.lpSum(v[g][max(0, t - min_up[g] + 1) : t + 1]) <= u[g][t]
prob += pulp.lpSum(w[g][max(0, t - min_down[g] + 1) : t + 1]) <= 1 - u[g][t]
```
