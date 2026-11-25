## Approach

Unify Chapter 7's production lot sizing and energy storage dispatch inside a single MIP by linking binary production setups $y_t$ and batches $x_t$ to electrical power balance $g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t$, while simultaneously buffering material via inventory $I_t$ and electricity via battery SOC $E_t$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left( F y_t + h I_t + \pi_t g_t \right) + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & I_{t-1} + x_t - I_t = D_t, \quad 0 \le x_t \le C_{\text{prod}} y_t && \forall t \;\; (I_{-1} = 0) \\
& E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}},\; E_{T-1} \ge E_{\text{init}}) \\
& g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& y_t, z_t \in \{0, 1\}, \quad I_t \ge 0, \quad 0 \le E_t \le E_{\max} && \forall t
\end{aligned}
$$

Here $D_t$ (`demands[t]`) denotes fixed product demand and $d_t$ (`discharge[t]`) denotes controllable battery discharge; the remaining parameters map to $F$ (`setupCost`), $h$ (`holdCost`), $C_{\text{prod}}$ (`prodCap`), $p_{\text{idle}}$ (`setupPower`), $p_{\text{unit}}$ (`unitPower`), $L_t$ (`baseLoads[t]`), $\pi_t$ (`prices[t]`), $\gamma$ (`demandCharge`), $E_{\max}$ (`batteryCap`), $E_{\text{init}}$ (`initSoc`), $P_{\max}$ (`maxPower`), $\eta_c$ (`etaCharge`), and $\eta_d$ (`etaDischarge`).

## Key Points

- **Two forms of energy storage (electrochemical + embodied inventory)**: Producing ahead during off-peak electricity hours stores energy implicitly as physical product inventory $I_t$ (paying $h$ instead of battery round-trip losses $1 - \eta_c \eta_d$), while the battery smooths base-load spikes and shaves `peakLoad` across all hours.
- **Load-coupling equality links two MIP subproblems cleanly**: Including both $p_{\text{idle}} y_t$ and $p_{\text{unit}} x_t$ inside $g_t$ lets the solver trade off setup consolidation, inventory holding, TOU arbitrage, and peak-demand charges simultaneously rather than sequentially.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each period, define the production/inventory constraints and the battery SOC constraints, then couple them through the grid power balance equation including setup standby power and unit process power. In WaSHI, express each constraint with `expr` literals; in PuLP, add the per-period equalities and inequalities similarly.

**WaSHI (TypeScript)**

```ts
const invEtaD = 1 / input.etaDischarge;
input.demands.forEach((demand, t) => {
  const prevInv = t === 0 ? 0 : inventory[t - 1];
  const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
  m.constraint(expr`${production[t]} <= ${input.prodCap} * ${setups[t]}`);
  m.constraint(expr`${prevInv} + ${production[t]} - ${inventory[t]} == ${demand}`);
  m.constraint(
    expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
  );
  m.constraint(
    expr`${gridLoad[t]} - ${input.setupPower} * ${setups[t]} - ${input.unitPower} * ${production[t]} - ${charge[t]} + ${discharge[t]} == ${input.baseLoads[t]}`
  );
  m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
});
```

**PuLP (Python)**

```python
prob += production[t] <= prod_cap * setups[t]
prob += prev_inv + production[t] - inventory[t] == demands[t]
prob += soc[t] == prev_soc + eta_charge * charge[t] - discharge[t] / eta_discharge
prob += grid_load[t] == base_loads[t] + setup_power * setups[t] + unit_power * production[t] + charge[t] - discharge[t]
prob += peak_load >= grid_load[t]
```
