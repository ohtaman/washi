# #027. LP Shadow Prices (Dual Variables)

<!-- section:scenario -->
An operations analyst solves a continuous cost-minimization dispatch problem over bounded production units. Every unit has a unit cost and a capacity upper bound, while the overall dispatch must satisfy several minimum yield requirements and stay within shared resource caps.

Beyond finding the minimum-cost dispatch quantities, management needs the marginal shadow price of every requirement and shared resource constraint (measuring how much the minimum cost changes per unit increase in each right-hand side). Solve the minimization LP and return the primal quantities, the constraint shadow prices ordered as requirement constraints followed by resource-cap constraints, and the minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[]` | Unit dispatch cost $c_i$ for unit $i$ |
| `capacities` | `number[]` | Variable upper bound $u_i$ ($0 \le x_i \le u_i$) |
| `yields` | `number[][]` | Yield contribution matrix $A$ for minimum requirements |
| `minRequirements` | `number[]` | Minimum targets $r_k$ ($\sum_i A_{ki} x_i \ge r_k$) |
| `resourceUsages` | `number[][]` | Resource consumption matrix $E$ for shared caps |
| `maxResources` | `number[]` | Shared upper limits $b_l$ ($\sum_i E_{li} x_i \le b_l$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Optimal continuous dispatch $x_i$ |
| `duals` | `number[]` | Shadow prices $\partial z^* / \partial \text{rhs}$ (`minRequirements` then `maxResources`) |
| `optimalCost` | `number` | Minimized total cost $z^*$ |

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

Dispatch `[4, 10, 2]` satisfies `[30, 22] >= [30, 22]` and `20 <= 20` at cost $10 \times 4 + 14 \times 10 + 25 \times 2 =$ **230**, while duals `[6, 5, -3]` satisfy $30(6) + 22(5) + 20(-3) = 230$.


<!-- section:hint1 -->
Model the dispatch with one continuous variable per production unit, bounded below by zero and above by its capacity. Keep references to the minimum-requirement constraints and shared resource-cap constraints when adding them to the model so you can query their dual values after solving.

<!-- section:hint2 -->
After solving the minimization LP, read `c.dual!` in WaSHI (or `c.pi` in PuLP) for each requirement constraint followed by each resource-cap constraint. Both WaSHI and PuLP follow the sensitivity convention $\partial z^* / \partial \text{rhs}$: raising a $\ge$ requirement cannot lower minimum cost (so its dual is $\ge 0$), whereas relaxing a $\le$ resource cap cannot raise minimum cost (so its dual is $\le 0$), and any constraint with positive slack has dual `0`. Remember not to negate the duals—keep the solver's signed shadow prices directly.