# #028. LP Reduced Costs & Entry Thresholds

<!-- section:scenario -->
A chemical plant runs a continuous cost-minimization blending problem across several non-negative input processes to meet minimum output requirements. Because some candidate processes are too expensive at current prices, they stay at zero in the minimum-cost plan.

Engineering teams ask how much each unused process's unit cost would need to drop before it becomes economical to introduce into the blend, and what the marginal cost increase would be per unit forced above zero. Solve the minimization LP and return the optimal process levels, every variable's reduced cost, and the minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[]` | Unit cost $c_j$ of process $j$ |
| `yields` | `number[][]` | Output matrix $A$ where $A_{kj}$ is yield per unit of process $j$ |
| `minRequirements` | `number[]` | Minimum requirement targets $r_k$ ($\sum_j A_{kj} x_j \ge r_k$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Non-negative process levels $x_j$ |
| `reducedCosts` | `number[]` | Reduced cost $\bar{c}_j$ for each variable $x_j$ |
| `optimalCost` | `number` | Minimized total cost $z^*$ |

<!-- section:example -->
**Input**

```json
{
  "costs": [10, 14, 24, 30],
  "yields": [
    [1, 2, 2, 3],
    [2, 1, 3, 1]
  ],
  "minRequirements": [17, 16]
}
```

**Output**

```json
{
  "quantities": [5, 6, 0, 0],
  "reducedCosts": [0, 0, 6, 10],
  "optimalCost": 134
}
```

Using `quantities = [5, 6, 0, 0]` meets `[17, 16]` at cost $10 \times 5 + 14 \times 6 =$ **134**, while the dual values `[6, 2]` yield reduced costs `24 - (6*2 + 2*3) = 6` and `30 - (6*3 + 2*1) = 10` for the two unused processes.


<!-- section:hint1 -->
Introduce one non-negative continuous decision variable per process representing how much of that process to run.

<!-- section:hint2 -->
After solving the LP, read each variable's reduced cost via `v.reducedCost!` in WaSHI (or `v.dj` in PuLP). Do not compute or negate raw costs manually: in a minimization LP with non-negative variables, active basic variables have reduced cost `0` while unused variables have non-negative reduced costs that measure the cost improvement needed to enter the basis. Return the solver's exact values without artificial rounding.