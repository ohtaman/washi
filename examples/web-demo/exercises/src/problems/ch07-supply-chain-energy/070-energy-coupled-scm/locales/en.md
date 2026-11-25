# #070. Energy-Coupled Production & Battery Scheduling

<!-- section:scenario -->
A manufacturing plant co-optimizes multi-period single-item production lot sizing and factory electricity management over 1-hour periods (so power in kW equals energy in kWh per period) under time-of-use (TOU) prices, a peak-demand charge, and an on-site battery.

- **Production & inventory**: Starting from zero inventory, activating the production line in a period incurs a fixed setup cost and allows continuous production up to line capacity; surplus product carried to the next period incurs a per-unit holding cost while all period demands must be met.
- **Power coupling & grid import**: Total factory electricity demand equals non-production base load plus fixed setup standby power (when active) plus variable process power per unit produced; net grid import equals factory demand plus battery charging minus battery discharging and must remain non-negative (no grid export), with a peak-demand charge on the maximum net grid import.
- **Battery operation**: Starting from its initial state of charge (SOC), the battery may either charge or discharge (never both simultaneously) up to its power limit subject to charging and discharging efficiencies, keeping SOC between 0 and battery capacity and returning to at least its initial SOC by the end of the horizon.

Co-optimize production setups, batches, inventory, and battery dispatch to **minimize total setup, holding, electricity, and peak-demand cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Product demand in each period (units) |
| `setupCost` | `number` | Fixed setup cost per active production period |
| `holdCost` | `number` | Product inventory holding cost per unit per period |
| `prodCap` | `number` | Maximum production capacity per period (units) |
| `setupPower` | `number` | Fixed standby electrical power draw when the line is active (kW) |
| `unitPower` | `number` | Variable electrical process power per unit produced (kW per unit) |
| `baseLoads` | `number[]` | Non-production facility base electrical load in each 1-hour period (kW) |
| `prices` | `number[]` | Grid TOU electricity price per kWh in each period |
| `demandCharge` | `number` | Peak-demand charge per kW of maximum net grid import across the horizon |
| `batteryCap` | `number` | Maximum battery energy capacity (kWh; minimum SOC is 0) |
| `initSoc` | `number` | Initial battery SOC before period 0 and required lower bound at the final period (kWh) |
| `maxPower` | `number` | Charge and discharge power limit per period (kW) |
| `etaCharge` | `number` | Charging efficiency in (0, 1] |
| `etaDischarge` | `number` | Discharging efficiency in (0, 1] |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[]` | Binary (0 or 1) production setup indicators |
| `production` | `number[]` | Non-negative continuous production quantities (units) |
| `inventory` | `number[]` | Non-negative ending product inventories (units) |
| `charge` | `number[]` | Battery charging power per period (kW) |
| `discharge` | `number[]` | Battery discharging power per period (kW) |
| `soc` | `number[]` | End-of-period battery SOC (kWh, ending at least at `initSoc`) |
| `peakLoad` | `number` | Peak net grid import across all periods (kW) |
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

Producing ahead in off-peak periods 0 and 2 (`production = [55, 0, 55, 0]`) while charging off-peak and discharging on-peak flattens net grid imports across all four periods to 83.597561, yielding setup 240 + holding 97.5 + TOU energy 443.067073 + peak-demand 668.780488 for total cost $240 + 97.5 + 443.067073 + 668.780488 \approx$ **1,449.35**.


<!-- section:hint1 -->
Combine the single-item lot-sizing variables (binary setups, continuous production, and product inventory) with the battery-dispatch variables (charging, discharging, binary charge/discharge mode, battery SOC, net grid load, and scalar peak load) over the same period horizon.

<!-- section:hint2 -->
Couple the two subsystems through an auxiliary non-negative `gridLoad[t]` variable representing hourly net grid import: `gridLoad[t] = baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0`. Introduce an auxiliary binary `mode[t]` variable to enforce `charge` and `discharge` mutual exclusion, scale battery SOC changes by `etaCharge` and `1 / etaDischarge`, require `soc[T - 1] >= initSoc`, and capture the peak-demand charge with `peakLoad >= gridLoad[t]`.
