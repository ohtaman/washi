## Approach

Track battery state of charge with an efficiency-adjusted flow-conservation equation, introduce an epigraph variable $P_{\text{peak}}$ satisfying $P_{\text{peak}} \ge g_t$ to linearize $\max_t g_t$, and pair $c_t, d_t$ with a binary mode switch $z_t$ to guarantee mutual exclusion across arbitrary price schedules.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \pi_t g_t + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}}) \\
& g_t = L_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& E_{\min} \le E_t \le E_{\max}, \quad E_{T-1} \ge E_{\text{end}}, \quad z_t \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **Epigraph peak-demand ratchet**: Replacing the nonlinear term $\gamma \max_t g_t$ with $\gamma P_{\text{peak}}$ plus $P_{\text{peak}} \ge g_t$ for all $t$ keeps the model purely linear while capturing monthly utility ratchet tariffs.
- **When LP suffices vs. why the MIP switch matters**: Whenever prices are strictly positive ($\pi_t > 0$) and $\eta_c \eta_d < 1$, simultaneous charging and discharging strictly wastes energy and never appears at an LP optimum; adding binary $z_t \in \{0,1\}$ enforces mutual exclusion cleanly even if prices turn zero/negative or $\eta_c = \eta_d = 1$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const invEtaD = 1 / input.etaDischarge;
input.baseLoads.forEach((base, t) => {
  const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
  m.constraint(
    expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
  );
  m.constraint(expr`${gridLoad[t]} - ${charge[t]} + ${discharge[t]} == ${base}`);
  m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
  m.constraint(expr`${charge[t]} <= ${input.maxPower} * ${mode[t]}`);
  m.constraint(expr`${discharge[t]} <= ${input.maxPower} * (1 - ${mode[t]})`);
});
```

**PuLP (Python)**

```python
for t in range(T):
    prev_soc = init_soc if t == 0 else soc[t - 1]
    prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
    prob += grid_load[t] == base_loads[t] + charge[t] - discharge[t]
    prob += peak_load >= grid_load[t]
    prob += charge[t] <= p_max * mode[t]
    prob += discharge[t] <= p_max * (1 - mode[t])
```
