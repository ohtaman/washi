# #069. Battery Storage Arbitrage & Peak Shaving

<!-- section:scenario -->
A facility operates an on-site battery storage system over a horizon of 1-hour periods (so power in kW equals energy in kWh per period) to reduce its electricity bill under time-of-use (TOU) energy prices and a peak-demand charge.

- **Power & mode limits**: In each period, the battery may either charge or discharge—never both simultaneously—up to its rated power limit.
- **Net grid import**: Net grid import equals base load plus charging minus discharging and must remain non-negative (no export to the grid).
- **Efficiency & SOC bounds**: Charging increases the state of charge (SOC) by charging power multiplied by charging efficiency, while discharging reduces SOC by discharging power divided by discharging efficiency; SOC must stay within its lower and upper limits in every period and meet the terminal SOC floor at the end of the horizon.
- **Peak-demand charge**: A demand charge applies to the maximum net grid import across all periods.

Choose hourly charging, discharging, SOC trajectory, and peak grid load to **minimize total energy plus peak-demand cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseLoads` | `number[]` | Facility electricity demand in each 1-hour period (kW, equal to kWh per period) |
| `prices` | `number[]` | TOU grid electricity price per kWh in each period |
| `demandCharge` | `number` | Peak-demand charge per kW of maximum net grid import across the horizon |
| `capacity` | `number` | Maximum battery energy capacity (kWh) |
| `minSoc` | `number` | Minimum allowed state of charge (kWh) |
| `initSoc` | `number` | Initial battery energy before period 0 (kWh) |
| `minFinalSoc` | `number` | Required minimum ending SOC after the final period (kWh) |
| `maxPower` | `number` | Charge and discharge power rating per period (kW) |
| `etaCharge` | `number` | Charging efficiency in (0, 1] |
| `etaDischarge` | `number` | Discharging efficiency in (0, 1] |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `charge` | `number[]` | Power drawn from the grid to charge the battery in each period (kW, 0 to `maxPower`) |
| `discharge` | `number[]` | Power delivered by the battery to the facility in each period (kW, 0 to `maxPower`) |
| `soc` | `number[]` | End-of-period state of charge (kWh, `minSoc` to `capacity`) |
| `peakLoad` | `number` | Peak net grid import across all periods (kW) |
| `totalCost` | `number` | Minimized TOU energy bill plus peak-demand charge |

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

Charging off-peak up to `soc = 78` and discharging during periods 3–4 caps net grid loads at [70, 80, 80, 80, 70.6, 80] (`peakLoad = 80`) while ending at final SOC 30, giving TOU energy cost 93.968 plus demand charge $8 \times 80$ for total cost $93.968 + 8 \times 80 =$ **733.968**.


<!-- section:hint1 -->
Create per-period continuous variables for charging power, discharging power, end-of-period state of charge (SOC), and net grid import, plus a binary mode indicator per period to prevent simultaneous charging and discharging and a single scalar variable for peak grid load.

<!-- section:hint2 -->
In the SOC transition equation, charging adds `etaCharge * charge[t]` while discharging subtracts `discharge[t] / etaDischarge`. Introduce auxiliary variables `gridLoad[t]` for non-negative net grid import (`baseLoads[t] + charge[t] - discharge[t]`) and binary `mode[t]` to exclude simultaneous charging and discharging (`charge[t] <= maxPower * mode[t]` and `discharge[t] <= maxPower * (1 - mode[t])`), bound the final SOC by `max(minSoc, minFinalSoc)`, and linearize the peak-demand charge with `peakLoad >= gridLoad[t]` for every period.
