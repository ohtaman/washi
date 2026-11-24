# #081. Elastic Programming & Tiered Soft Penalties

<!-- section:scenario -->
A confectionery factory decides the continuous production quantities (in kg, $\ge 0$) of several baked and confectionery items such as chocolate, cookies, and madeleines. Total machine hours consumed across the factory must not exceed the available machine capacity, and total output across all products must meet or exceed a required minimum (in kg).

Each product also has a target production quantity (in kg). Falling below target incurs a priority-tiered shortfall penalty per kg, while exceeding target incurs an excess penalty per kg. While strictly satisfying the hard constraints, minimize the sum of production costs and target deviation penalties.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `unitCosts` | `number[]` | Production cost per kg of each product |
| `hours` | `number[]` | Machine hours consumed per kg of each product (hours) |
| `targets` | `number[]` | Soft production target for each product (kg) |
| `shortfallPenalties` | `number[]` | Tiered penalty per kg below target |
| `excessPenalties` | `number[]` | Penalty per kg above target |
| `machineCap` | `number` | Hard upper limit on total machine hours (hours) |
| `minTotal` | `number` | Hard lower limit on total produced quantity (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Production quantities of each product (non-negative real values, kg) |
| `shortfalls` | `number[]` | Shortfall below each target (kg) |
| `excesses` | `number[]` | Excess above each target (kg) |
| `totalCost` | `number` | Minimized sum of production costs and deviation penalties |

<!-- section:example -->
**Input**

```json
{
  "unitCosts": [4, 5, 3],
  "hours": [2, 2, 2],
  "targets": [10, 10, 10],
  "shortfallPenalties": [100, 50, 15],
  "excessPenalties": [20, 20, 20],
  "machineCap": 46,
  "minTotal": 0
}
```

**Output**

```json
{
  "quantities": [10, 10, 3],
  "shortfalls": [0, 0, 7],
  "excesses": [0, 0, 0],
  "totalCost": 204
}
```

With `quantities = [10, 10, 3]`, machine hours are $2(10) + 2(10) + 2(3) = 46 \le 46$, target deviations are `shortfalls = [0, 0, 7]` and `excesses = [0, 0, 0]`, and total cost is $(4 \times 10 + 5 \times 10 + 3 \times 3) + 15 \times 7 =$ **204**.


<!-- section:hint1 -->
Model three non-negative continuous decision vectors indexed by product: the production quantities, the shortfall below each target, and the excess above each target. Keep the machine-hour limit and minimum total output as hard constraints on the production quantities, while treating each product's target as a soft goal.

<!-- section:hint2 -->
The key property of elastic target tracking is that when both shortfall and excess penalties are non-negative, expressing a soft target as an equality with non-negative shortfall and excess slacks prevents artificial infeasibility while guaranteeing at least one slack vanishes at an optimum—no binary indicators are needed. Use `m.continuous(...)` in WaSHI or `pulp.LpVariable(..., lowBound=0)` in PuLP.