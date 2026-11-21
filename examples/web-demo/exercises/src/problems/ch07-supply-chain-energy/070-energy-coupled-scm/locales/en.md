# #070. Energy-Coupled Production & Battery Scheduling

<!-- section:scenario -->
A manufacturing plant couples multi-period single-item production lot sizing with factory electricity management under time-of-use (TOU) prices, a peak-demand charge, and an on-site battery. Starting from zero product inventory, setting up production in a period incurs a fixed setup cost, adds a fixed standby power draw, and unlocks continuous production up to the line capacity, with each unit consuming additional process power and surplus product carried in inventory incurring a holding cost.

Total factory electricity demand equals base load plus setup standby power plus process power. An on-site battery starting at an initial state of charge (SOC) can either charge or discharge (not both simultaneously) within its power limit subject to charging/discharging efficiencies, bounded between zero and battery capacity, and returning to at least its initial SOC by the end of the horizon without exporting power to the grid. Co-optimize production setups, batches, inventory, and battery dispatch to **minimize total setup, holding, electricity, and peak-demand cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Product demand $d_t$ in period $t$ |
| `setupCost` | `number` | Fixed setup cost $F$ per active production period |
| `holdCost` | `number` | Product inventory holding cost $h$ per unit per period |
| `prodCap` | `number` | Maximum production capacity $C_{\text{prod}}$ per period |
| `setupPower` | `number` | Fixed electrical power draw $p_{\text{idle}}$ when line is active |
| `unitPower` | `number` | Variable electrical power $p_{\text{unit}}$ per unit produced |
| `baseLoads` | `number[]` | Non-production facility base electrical load $L_t$ |
| `prices` | `number[]` | Grid TOU electricity price $\pi_t$ in period $t$ |
| `demandCharge` | `number` | Peak-demand ratchet charge $\gamma$ per kW of $\max_t g_t$ |
| `batteryCap` | `number` | Maximum battery SOC $E_{\max}$ (minimum SOC is 0) |
| `initSoc` | `number` | Initial SOC $E_{\text{init}}$ (also required lower bound at $T-1$) |
| `maxPower` | `number` | Charge and discharge power limit $P_{\max}$ |
| `etaCharge` | `number` | Charging efficiency $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | Discharging efficiency $\eta_d \in (0, 1]$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[]` | Binary (`0` or `1`) production setup indicators |
| `production` | `number[]` | Non-negative production quantities |
| `inventory` | `number[]` | Non-negative ending product inventories |
| `charge` | `number[]` | Battery charging power per period |
| `discharge` | `number[]` | Battery discharging power per period |
| `soc` | `number[]` | End-of-period battery SOC (`soc[T-1] >= initSoc`) |
| `peakLoad` | `number` | Peak net grid load $\max_t g_t$ |
| `totalCost` | `number` | Minimized total production and energy cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [20, 35, 25, 30],
  "setupCost": 120,
  "holdCost": 1.5,
  "prodCap": 60,
  "setupPower": 10,
  "unitPower": 1.0,
  "baseLoads": [10, 85, 15, 90],
  "prices": [0.5, 2.0, 0.6, 2.2],
  "demandCharge": 8.0,
  "batteryCap": 80,
  "initSoc": 20,
  "maxPower": 35,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**Output**

```json
{
  "setups": [1, 0, 1, 0],
  "production": [55, 0, 55, 0],
  "inventory": [35, 0, 30, 0],
  "charge": [8.597561, 0, 3.597561, 0],
  "discharge": [0, 1.402439, 0, 6.402439],
  "soc": [26.878049, 25.125, 28.003049, 20],
  "peakLoad": 83.597561,
  "totalCost": 1449.347561
}
```

Producing ahead in off-peak periods 0 and 2 (`production = [55, 0, 55, 0]`) while charging off-peak and discharging on-peak flattens net grid imports across all four periods to `83.597561`, yielding total cost $240 + 97.5 + 443.067073 + 668.780488 \approx$ **1,449.35**.


<!-- section:hint1 -->
Combine the single-item lot-sizing variables (binary setups, continuous production, and product inventory) with the battery-dispatch variables (charging, discharging, binary charge/discharge mode, battery SOC, net grid load, and scalar peak load) over the same period horizon.

<!-- section:hint2 -->
Couple the two subsystems through the hourly grid power balance: `gridLoad[t] = baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0`. Enforce `charge` and `discharge` mutual exclusion via the binary mode variable, scale battery SOC changes by $\eta_c$ and $1 / \eta_d$, require `soc[T - 1] >= initSoc`, and capture the demand ratchet with `peakLoad >= gridLoad[t]`.
