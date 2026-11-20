# #069. Battery Storage Arbitrage & Peak Shaving

<!-- section:scenario -->
A facility operates an on-site battery storage system across multiple periods to lower its electricity bill under time-of-use (TOU) energy prices and a peak-demand charge on the maximum net grid import across the horizon. In each period, the battery may either charge or discharge (not both simultaneously) up to its power rating, and net grid import equals base load plus charging minus discharging (required to remain non-negative, without grid export).

Charging adds energy scaled by the charging efficiency while discharging drains energy scaled by the reciprocal of the discharging efficiency, keeping the state of charge (SOC) within its minimum and maximum bounds at every step and meeting a terminal SOC floor at the end of the horizon. Choose charging, discharging, SOC trajectory, and peak grid load to **minimize total electricity plus demand cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseLoads` | `number[]` | Facility electricity demand $L_t$ in each period $t$ |
| `prices` | `number[]` | TOU grid electricity price $\pi_t$ per kWh in period $t$ |
| `demandCharge` | `number` | Ratchet charge $\gamma$ per kW of peak grid import $\max_t g_t$ |
| `capacity` | `number` | Maximum battery energy capacity $E_{\max}$ |
| `minSoc` | `number` | Minimum allowed state of charge $E_{\min}$ |
| `initSoc` | `number` | Initial battery energy $E_{\text{init}}$ before period 0 |
| `minFinalSoc` | `number` | Required minimum ending SOC $E_{\text{end}}$ after period $T-1$ |
| `maxPower` | `number` | Charge and discharge power rating $P_{\max}$ per period |
| `etaCharge` | `number` | Charging efficiency $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | Discharging efficiency $\eta_d \in (0, 1]$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `charge` | `number[]` | Power drawn from grid to charge battery ($0 \dots P_{\max}$) |
| `discharge` | `number[]` | Power delivered by battery to facility ($0 \dots P_{\max}$) |
| `soc` | `number[]` | End-of-period state of charge ($E_{\min} \dots E_{\max}$) |
| `peakLoad` | `number` | Peak net grid import $\max_t (L_t + c_t - d_t)$ |
| `totalCost` | `number` | Minimized TOU energy bill plus peak demand charge |

<!-- section:example -->
**Input**

```json
{
  "baseLoads": [40, 50, 80, 110, 95, 55],
  "prices": [0.1, 0.12, 0.25, 0.35, 0.28, 0.12],
  "demandCharge": 8,
  "capacity": 80,
  "minSoc": 10,
  "initSoc": 30,
  "minFinalSoc": 30,
  "maxPower": 30,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**Output**

```json
{
  "charge": [30, 30, 0, 0, 0, 25],
  "discharge": [0, 0, 0, 30, 24.4, 0],
  "soc": [54, 78, 78, 40.5, 10, 30],
  "peakLoad": 80,
  "totalCost": 733.968
}
```

Charging off-peak up to `soc = 78` and discharging during periods 3–4 caps net grid loads at `[70, 80, 80, 80, 70.6, 80]` (`peakLoad = 80`) while ending at `soc = 30`, giving total cost $93.968 + 8 \times 80 =$ **733.968**.
