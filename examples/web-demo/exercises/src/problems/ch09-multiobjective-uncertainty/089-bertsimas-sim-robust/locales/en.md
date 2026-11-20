# #089. Budgeted Robust Optimization (Bertsimas-Sim)

<!-- section:scenario -->
A factory chooses continuous non-negative production quantities across several products, each capped by an individual upper bound and earning a unit profit. Under nominal conditions each unit consumes its nominal resource usage, but actual resource usage per unit can spike by up to a known deviation.

Rather than protecting against every product spiking simultaneously, management specifies a protection budget parameter Gamma limiting how much total scaled uncertainty can occur at once. Choose production quantities so total resource usage remains within the capacity limit against the worst-case realization allowed by Gamma, and **maximize total profit**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `profits` | `number[]` | Unit profit earned per unit of each product |
| `nominalUsages` | `number[]` | Nominal resource consumption per unit |
| `deviations` | `number[]` | Maximum possible extra resource spike per unit |
| `maxUnits` | `number[]` | Upper bound on production quantity of each product |
| `capacityCap` | `number` | Shared capacity limit that must hold in the worst case |
| `gamma` | `number` | Uncertainty budget $\Gamma \in [0, n]$ (may be fractional) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Robustly feasible production quantities |
| `totalProfit` | `number` | Maximized total profit under budgeted protection |

<!-- section:example -->
**Input**

```json
{
  "profits": [12, 16, 10],
  "nominalUsages": [2, 3, 2],
  "deviations": [1, 1, 0.5],
  "maxUnits": [8, 6, 8],
  "capacityCap": 30,
  "gamma": 1
}
```

**Output**

```json
{
  "quantities": [3, 3, 6],
  "totalProfit": 144
}
```

Producing `[3, 3, 6]` uses $2(3) + 3(3) + 2(6) = 27$ nominal capacity plus worst-case $\Gamma = 1$ deviation $\max(1 \cdot 3, 1 \cdot 3, 0.5 \cdot 6) = 3$, totaling $30 \le 30$ with profit $12(3) + 16(3) + 10(6) =$ **144**.
