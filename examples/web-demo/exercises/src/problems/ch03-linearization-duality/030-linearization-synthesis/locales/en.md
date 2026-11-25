# #030. Linearization Synthesis — Service Fleet & Load Balancing

<!-- section:scenario -->
A platform infrastructure team is selecting a subset of candidate microservices to deploy.

The deployment plan is governed by the following rules and cost terms:
- **Minimum value**: Total delivered value of deployed services must meet at least the minimum requirement.
- **Base costs and zone loads**: Each service has a base cost and adds load to each zone.
- **Pairwise interactions**: Deploying certain pairs simultaneously triggers either synergistic cost savings (negative coefficient) or interference cost (positive coefficient).
- **Total operational cost**: The sum of four terms—base costs, pairwise interaction costs, a weighted cost on the peak load across all zones, and weighted L1 deviations from each zone's target load.

Decide which services to deploy, the pairwise simultaneous-deployment indicators, and the peak load to **minimize total operational cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseCosts` | `number[]` | Base deployment cost $c_i$ of service $i$ |
| `values` | `number[]` | Capability value $v_i$ of service $i$ |
| `minValue` | `number` | Lower bound required on total delivered value ($\sum_i v_i x_i$, where $x_i \in \{0, 1\}$) |
| `loads` | `number[][]` | Non-negative load `loads[r][i]` added to zone $r$ when service $i$ runs; zone $r$'s total load is $L_r = \sum_i \text{loads}[r][i]\, x_i$ |
| `targets` | `number[]` | Target load $\tau_r$ for zone $r$ |
| `devWeights` | `number[]` | Non-negative penalty weight $\beta_r$ per unit L1 deviation $\lvert L_r - \tau_r \rvert$ in zone $r$ |
| `peakWeight` | `number` | Positive cost weight $\alpha > 0$ on peak zone load $\max_r L_r$ |
| `pairs` | `number[][]` | Interaction list `[i, j, s]` (0-based service indices `i, j`) added to cost when both $i$ and $j$ deploy |

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

Deploying services 0 and 3 ([1, 0, 0, 1]) delivers value $30 + 30 = 60 \ge 60$, activates no listed pairs (pair products [0, 0, 0]), produces zone loads [18, 18] (peak 18, deviations 2 and 2 from target 16), and totals $(40 + 45) + 6 \times 18 + 4(2 + 2) =$ **209**.


<!-- section:hint1 -->
Combine three linearization patterns in one MIP: binary variables for service selection, continuous $[0, 1]$ variables for pairwise interaction products, a scalar continuous epigraph variable for the peak zone load, and non-negative positive/negative deviation variable pairs for each zone's L1 target tracking.

<!-- section:hint2 -->
Each zone's load $L_r = \sum_i \text{loads}_{r,i} x_i$ feeds into both the epigraph cap ($L_r \le \text{peakLoad}$) and the L1 split ($L_r - \tau_r = d_r^+ - d_r^-$). For every pair `[i, j, s]`, enforce all three McCormick inequalities ($w_k \le x_i$, $w_k \le x_j$, $w_k \ge x_i + x_j - 1$) because interaction costs $s$ can be either negative (synergistic cost savings, needing the upper bounds) or positive (interference cost, needing the lower bound). Remember the minimum delivered capability constraint, and round `selected` and `pairProducts` cleanly in the output.