# #029. Disjunctive Operating Bands (Convex Hull)

<!-- section:scenario -->
A plant operations manager is planning how to run multiple production units to supply at least a target demand (in t/h).

The operating plan must satisfy all of the following conditions:
- **Exclusive operating modes (bands)**: Each unit must run in exactly one band—such as idle (0 output), a low-load eco band, or a high-load turbo band.
- **Output ranges with gaps**: Each band has its own output interval, with forbidden output gaps between adjacent bands.
- **Total demand**: Total output across all units must be at least the target demand.

Each band has its own fixed cost (in 10k JPY) and unit variable cost (in 10k JPY/(t/h)). Using a disjunctive convex-hull formulation to model choosing one band among mutually exclusive alternatives, find the band selection and output levels that meet demand while **minimizing total fixed plus variable cost (in 10k JPY)**.

<!-- section:io -->
### Input

All units share the same number of operating bands, and every 2D array is indexed as `[unit][band]`.

| Field | Type | Description |
| --- | --- | --- |
| `demand` | `number` | Required minimum total output across all units (t/h) |
| `bandLbs` | `number[][]` | Output lower bound for each `[unit][band]` (t/h) |
| `bandUbs` | `number[][]` | Output upper bound for each `[unit][band]` (t/h) |
| `fixedCosts` | `number[][]` | Fixed cost when a unit selects each `[unit][band]` (10k JPY) |
| `unitCosts` | `number[][]` | Unit variable cost for each `[unit][band]` (10k JPY/(t/h)) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `modes` | `number[]` | Selected band index for each unit (0-based) |
| `outputs` | `number[]` | Output of each unit within its selected band's range (t/h) |
| `totalCost` | `number` | Minimized total cost (10k JPY) |

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

Running Unit 0 in band 2 ([30, 45]) at output 42 t/h and keeping Unit 1 idle in band 0 ([0, 0]) at output 0 t/h meets total demand $42 + 0 \ge 42$ t/h at a total cost of $260 + 12 \times 42 =$ **764** (10k JPY).


<!-- section:hint1 -->
Use a disaggregated convex-hull formulation indexed by both unit and operating band: for each unit-band pair, declare a binary variable indicating whether that band is active and a non-negative continuous variable representing the unit's output in that band.

<!-- section:hint2 -->
Constrain each unit to select exactly one band ($\sum_k y_{ik} = 1$), and scale each band's output bounds $[L_{ik}, U_{ik}]$ by its binary indicator $y_{ik}$: $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$. This forces $x_{ik} = 0$ on every inactive band while confining the active band's output to $[L_{ik}, U_{ik}]$—avoiding weak Big-M relaxations and forbidding outputs in the gaps between bands. Sum $x_{ik}$ across all units and bands to satisfy `demand`, and recover each unit's selected band index and total output $\sum_k x_{ik}$.