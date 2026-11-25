# #033. Compatible System Configuration (Table Constraints)

<!-- section:scenario -->
A system designer is configuring a hardware system made up of multiple components—such as a CPU, motherboard, memory kit, and power supply. Each component offers several candidate options, each with its own integer cost (in 1,000 JPY).

In addition, compatibility rules require specified groups of components to match one of the allowed option combinations, while conflict rules forbid selecting any of the prohibited combinations. Find the lowest-cost configuration that satisfies all rules.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `componentCosts` | `number[][]` | Integer cost `componentCosts[c][opt]` for option `opt` of component `c` (1,000 JPY) |
| `allowedRules` | `TableRule[]` | Compatibility rules requiring the selected options for components `vars` to match one of the entries in `tuples` |
| `forbiddenRules` | `TableRule[]` | Conflict rules prohibiting the selected options for components `vars` from matching any entry in `tuples` |

Each `TableRule` object has `{ vars: number[], tuples: number[][] }`, where `vars` lists 0-based component indices and each entry in `tuples` has length `vars.length` with option indices aligned to `vars`.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `choices` | `number[]` | Selected option index for each component `c` (0 to `componentCosts[c].length - 1`) |
| `totalCost` | `number` | Minimized total configuration cost (1,000 JPY) |

<!-- section:example -->
**Input**

```json
{
  "componentCosts": [
    [10, 25, 45],
    [8, 18, 32],
    [5, 14, 28]
  ],
  "allowedRules": [
    {
      "vars": [0, 1],
      "tuples": [
        [0, 1],
        [1, 0],
        [1, 2],
        [2, 2]
      ]
    }
  ],
  "forbiddenRules": [
    {
      "vars": [1, 2],
      "tuples": [
        [1, 0],
        [0, 0]
      ]
    }
  ]
}
```

**Output**

```json
{
  "choices": [0, 1, 1],
  "totalCost": 42
}
```

Choices [0, 1, 1] pick (0, 1) for components (0, 1) (included in `allowedRules[0]`), pick (1, 1) for components (1, 2) (avoiding the forbidden tuples (1, 0) and (0, 0)), and incur a total cost of $10 + 18 + 14 =$ **42** (1,000 JPY).

<!-- section:hint1 -->
Introduce one integer decision variable per component whose domain covers its available option indices. Express both compatibility tables and conflict tables directly over the corresponding component variable tuples, and sum the selected option costs as the objective.

<!-- section:hint2 -->
Use `allowed(vars, rule.tuples)` for each rule in `input.allowedRules` and `not(allowed(vars, rule.tuples))` for each rule in `input.forbiddenRules`, mapping `rule.vars` to the component choice variables. Look up each component's option cost with `at(costs, choices[c])` and minimize their `sum(...)` using `solver: "pumpkin"`.
