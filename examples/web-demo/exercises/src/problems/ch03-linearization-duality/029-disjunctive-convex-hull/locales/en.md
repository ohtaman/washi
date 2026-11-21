# #029. Disjunctive Operating Bands (Convex Hull)

<!-- section:scenario -->
A plant dispatches several production units to cover at least a given total demand. Each unit must operate in exactly one mutually exclusive operating band—for instance idle at zero output, a low-load eco band, or a high-load turbo band—with forbidden output gaps between adjacent bands.

Each operating band has its own fixed startup cost and marginal unit cost per unit of output. Choose an operating band and continuous output level for every unit to meet demand at **minimum total fixed plus variable cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demand` | `number` | Required minimum total output across all units |
| `bandLbs` | `number[][]` | Lower bound $L_{ik}$ of unit $i$ in band $k$ |
| `bandUbs` | `number[][]` | Upper bound $U_{ik}$ of unit $i$ in band $k$ |
| `fixedCosts` | `number[][]` | Fixed cost $F_{ik}$ incurred when unit $i$ selects band $k$ |
| `unitCosts` | `number[][]` | Marginal variable cost $c_{ik}$ in band $k$ of unit $i$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `modes` | `number[]` | Selected operating band index $k \in \{0, \dots, K-1\}$ for each unit |
| `outputs` | `number[]` | Continuous output level $x_i \in [L_{ik}, U_{ik}]$ for each unit |
| `totalCost` | `number` | Minimized total cost |

<!-- section:example -->
**Input**

```json
{
  "demand": 42,
  "bandLbs": [
    [0, 10, 30],
    [0, 8, 25]
  ],
  "bandUbs": [
    [0, 20, 45],
    [0, 18, 40]
  ],
  "fixedCosts": [
    [0, 120, 260],
    [0, 90, 220]
  ],
  "unitCosts": [
    [0, 18, 12],
    [0, 20, 14]
  ]
}
```

**Output**

```json
{
  "modes": [2, 0],
  "outputs": [42, 0],
  "totalCost": 764
}
```

Running Unit 0 in band 2 (`[30, 45]`) at output `42` and keeping Unit 1 idle in band 0 (`[0, 0]`) meets total demand $42 + 0 = 42 \ge 42$ at cost $260 + 12 \times 42 =$ **764**.


<!-- section:hint1 -->
Use a disaggregated convex-hull formulation indexed by both unit and operating band: for each unit-band pair, declare a binary variable indicating whether that band is active and a non-negative continuous variable representing the unit's output in that band.

<!-- section:hint2 -->
Constrain each unit to select exactly one band ($\sum_k y_{ik} = 1$), and scale each band's interval by its indicator: $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$. This forces $x_{ik} = 0$ on every inactive band while confining the active band's output to $[L_{ik}, U_{ik}]$—avoiding weak Big-M relaxations and forbidding outputs in the gaps between bands. Sum $x_{ik}$ across all units and bands to satisfy `demand`, and recover each unit's selected band index and total output $\sum_k x_{ik}$.