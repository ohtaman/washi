# #030. Linearization Synthesis — Service Fleet & Load Balancing

<!-- section:scenario -->
A platform architecture team must select a subset of candidate microservices to deploy so their combined delivered capability reaches at least a minimum threshold. Each deployed service incurs a base cost and adds load to several regional clusters, while selected service pairs trigger either synergistic cost savings (negative interaction cost) or interference overhead (positive interaction cost).

Total operational cost combines base service costs, pairwise interaction costs, a penalty proportional to the peak load across all clusters, and weighted L1 deviations from each cluster's target load. Choose which services to deploy, compute exact pairwise indicators, and track the peak cluster load to **minimize total operational cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseCosts` | `number[]` | Base deployment cost $c_i$ of service $i$ |
| `values` | `number[]` | Capability value $v_i$ of service $i$ |
| `minValue` | `number` | Required minimum total capability $\sum_i v_i x_i$ |
| `loads` | `number[][]` | `loads[r][i]` is the load added to zone $r$ when service $i$ runs |
| `targets` | `number[]` | Target load $\tau_r$ for zone $r$ |
| `devWeights` | `number[]` | L1 deviation penalty weight $\beta_r$ per unit in zone $r$ |
| `peakWeight` | `number` | Cost weight $\alpha$ on peak zone load $\max_r L_r$ |
| `pairs` | `number[][]` | Interaction list `[i, j, s]` added to cost when both $i$ and $j$ deploy |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) service choices $x_i$ |
| `pairProducts` | `number[]` | Binary pair products $w_k = x_i x_j$ for each entry in `pairs` |
| `peakLoad` | `number` | Maximum load $\max_r L_r$ across all zones |
| `totalCost` | `number` | Minimized total operational cost |

<!-- section:example -->
**Input**

```json
{
  "baseCosts": [40, 50, 35, 45],
  "values": [30, 35, 25, 30],
  "minValue": 60,
  "loads": [
    [12, 8, 10, 6],
    [6, 14, 8, 12]
  ],
  "targets": [16, 16],
  "devWeights": [4, 4],
  "peakWeight": 6,
  "pairs": [
    [0, 1, -25],
    [1, 3, 30],
    [2, 3, -15]
  ]
}
```

**Output**

```json
{
  "selected": [1, 0, 0, 1],
  "pairProducts": [0, 0, 0],
  "peakLoad": 18,
  "totalCost": 209
}
```

Deploying services 0 and 3 (`[1, 0, 0, 1]`) delivers value $30 + 30 = 60 \ge 60$, activates no listed pairs, produces zone loads `[18, 18]` (peak `18`, deviations `2` and `2`), and totals $(40 + 45) + 6 \times 18 + 4(2 + 2) =$ **209**.


<!-- section:hint1 -->
Combine three linearization patterns in one MIP: binary variables for service selection, continuous $[0, 1]$ variables for pairwise interaction products, a scalar continuous epigraph variable for the peak zone load, and non-negative positive/negative deviation variable pairs for each zone's L1 target tracking.

<!-- section:hint2 -->
Each zone's load $L_r = \sum_i \text{loads}_{r,i} x_i$ feeds into both the epigraph cap ($L_r \le \text{peakLoad}$) and the L1 split ($L_r - \tau_r = d_r^+ - d_r^-$). For every pair `[i, j, s]`, enforce all three McCormick inequalities ($w_k \le x_i$, $w_k \le x_j$, $w_k \ge x_i + x_j - 1$) because interaction costs $s$ can be either negative (synergy savings, needing the upper bounds) or positive (interference overhead, needing the lower bound). Remember the minimum delivered capability constraint, and round `selected` and `pairProducts` cleanly in the output.