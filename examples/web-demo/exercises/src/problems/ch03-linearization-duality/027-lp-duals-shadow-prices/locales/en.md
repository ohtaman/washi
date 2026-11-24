# #027. LP Shadow Prices (Dual Variables)

<!-- section:scenario -->
An operations analyst at an electric power utility is solving a generation dispatch problem to minimize total generation cost (in 10k JPY) across multiple generators, each with a non-negative continuous output up to its rated capacity (in MW). Each generator has a unit generation cost (10k JPY/MW) and a maximum output limit, and the combined output must meet each region's minimum electricity demand (MW) while staying within fuel consumption and emissions allowance caps.

Beyond finding the minimum-cost generation quantities, the utility also needs the shadow price (marginal cost change per unit increase in the right-hand side) for every minimum demand constraint and every fuel/emissions cap constraint. Solve the minimization LP and return each generator's output, the shadow prices ordered as minimum demand constraints followed by resource cap constraints, and the minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[]` | Unit generation cost $c_i$ for generator $i$ (10k JPY/MW) |
| `capacities` | `number[]` | Output upper bound $u_i$ for generator $i$ ($0 \le x_i \le u_i$, MW) |
| `yields` | `number[][]` | Contribution coefficient matrix $A$ for minimum demand constraints |
| `minRequirements` | `number[]` | Minimum electricity demand $r_k$ for each region ($\sum_i A_{ki} x_i \ge r_k$, MW) |
| `resourceUsages` | `number[][]` | Consumption coefficient matrix $E$ for fuel/emissions cap constraints |
| `maxResources` | `number[]` | Fuel/emissions cap $b_l$ ($\sum_i E_{li} x_i \le b_l$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Optimal generation output $x_i$ for each generator (MW) |
| `duals` | `number[]` | Shadow prices $\partial z^* / \partial \text{rhs}$ (`minRequirements` then `maxResources`) |
| `optimalCost` | `number` | Minimized total generation cost $z^*$ (10k JPY) |

<!-- section:example -->
**Input**

```json
{
  "costs": [10, 14, 25],
  "capacities": [12, 20, 25],
  "yields": [
    [1, 2, 3],
    [2, 1, 2]
  ],
  "minRequirements": [30, 22],
  "resourceUsages": [
    [2, 1, 1]
  ],
  "maxResources": [20]
}
```

**Output**

```json
{
  "quantities": [4, 10, 2],
  "duals": [6, 5, -3],
  "optimalCost": 230
}
```

Generation outputs [4, 10, 2] satisfy all minimum demands [30, 22] and the cap 20, achieving a total cost of $10 \times 4 + 14 \times 10 + 25 \times 2 =$ **230** (10k JPY), which matches the dual evaluation $30(6) + 22(5) + 20(-3) = 230$ from shadow prices [6, 5, -3].


<!-- section:hint1 -->
Declare one continuous variable per generator bounded between 0 and its output capacity. Keep references to the minimum demand constraints and fuel/emissions cap constraints when adding them to the model so you can query their dual values after solving.

<!-- section:hint2 -->
After solving the minimization LP, read `c.dual!` in WaSHI (or `c.pi` in PuLP) for each demand constraint followed by each cap constraint. Both WaSHI and PuLP follow the sensitivity convention $\partial z^* / \partial \text{rhs}$: raising a $\ge$ demand cannot lower minimum cost (so its dual is $\ge 0$), whereas relaxing a $\le$ cap cannot raise minimum cost (so its dual is $\le 0$), and any constraint with positive slack has dual 0. Do not negate the duals—return the solver's signed shadow prices directly.