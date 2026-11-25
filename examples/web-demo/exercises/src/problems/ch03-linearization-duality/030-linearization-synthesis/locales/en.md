# #030. Linearization Synthesis — Service Fleet & Load Balancing

<!-- section:scenario -->
A platform infrastructure team is selecting a subset of candidate microservices to deploy.

The deployment plan is governed by the following rules and cost terms:
- **Minimum value**: Total delivered value of deployed services must meet at least the minimum requirement.
- **Base costs and zone loads**: Each service has a base cost and adds load to each zone.
- **Pairwise interactions**: Deploying certain pairs simultaneously triggers either synergistic cost savings (negative coefficient) or interference cost (positive coefficient).
- **Total operational cost**: The sum of four terms—base costs, pairwise interaction costs, a weighted cost on the peak load across all zones, and weighted absolute (L1) deviations from each zone's target load.

Decide which services to deploy, the pairwise simultaneous-deployment indicators, and the peak load to **minimize total operational cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseCosts` | `number[]` | Base deployment cost of each service |
| `values` | `number[]` | Delivered value of each service |
| `minValue` | `number` | Minimum required total delivered value of deployed services |
| `loads` | `number[][]` | `loads[r][i]` is the load added to zone `r` when service `i` is deployed |
| `targets` | `number[]` | Target load for each zone |
| `devWeights` | `number[]` | Penalty weight per unit of absolute (L1) load deviation in each zone |
| `peakWeight` | `number` | Cost weight on the peak load across all zones |
| `pairs` | `number[][]` | Interaction entries `[i, j, s]`; cost `s` is added when both services `i` and `j` are deployed (negative for savings, positive for overhead) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) deployment indicator for each service |
| `pairProducts` | `number[]` | Binary (0 or 1) simultaneous-deployment indicator for each entry in `pairs` |
| `peakLoad` | `number` | Maximum load across all zones |
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

Deploying services 0 and 3 ([1, 0, 0, 1]) delivers value $30 + 30 = 60 \ge 60$, activates no listed pairs (pair products [0, 0, 0]), produces zone loads [18, 18] (peak 18, deviations 2 and 2 from target 16), and totals $(40 + 45) + 6 \times 18 + 4(2 + 2) =$ **209**.


<!-- section:hint1 -->
Combine three linearization patterns in one MIP: binary variables for service selection, continuous $[0, 1]$ variables for pairwise interaction products, a scalar continuous epigraph variable for the peak zone load, and non-negative positive/negative deviation variable pairs for each zone's L1 target tracking.

<!-- section:hint2 -->
Let $x_i \in \{0, 1\}$ denote whether service $i$ is deployed and $w_k \in [0, 1]$ denote the product $x_i x_j$ for the $k$-th entry `[i, j, s]` in `pairs`. Each zone's load $L_r = \sum_i \text{loads}_{r,i} x_i$ feeds into both the epigraph cap ($L_r \le \text{peakLoad}$) and the L1 split ($L_r - \text{targets}_r = d_r^+ - d_r^-$ with $d_r^+, d_r^- \ge 0$). For every pair `[i, j, s]`, enforce all three McCormick inequalities ($w_k \le x_i$, $w_k \le x_j$, $w_k \ge x_i + x_j - 1$) because interaction costs $s$ can be either negative (synergy savings, needing the upper bounds) or positive (interference overhead, needing the lower bound). Remember the minimum delivered value constraint, and round `selected` and `pairProducts` cleanly in the output.