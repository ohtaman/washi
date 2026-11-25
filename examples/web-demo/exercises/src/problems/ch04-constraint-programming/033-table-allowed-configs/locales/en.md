# #033. Compatible System Configuration (Table Constraints)

<!-- section:scenario -->
A system designer is configuring a hardware system composed of multiple components by selecting exactly one option for each component. Each component has multiple candidate options, each with an integer component cost (in 1,000 JPY).

In addition, compatibility rules require the selected options for specified groups of components to match one of the allowed option tuples in a table, while conflict rules forbid them from matching any of the prohibited option tuples. Find the lowest-cost component configuration that satisfies all rules.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `componentCosts` | `number[][]` | Integer cost `componentCosts[c][opt]` for option `opt` of component `c` (1,000 JPY) |
| `allowedRules` | `TableRule[]` | Positive table constraints requiring the selected options of components `vars` to match one of `tuples` |
| `forbiddenRules` | `TableRule[]` | Negative table constraints forbidding the selected options of components `vars` from matching any of `tuples` |

Each `TableRule` object has `{ vars: number[], tuples: number[][] }`, where `vars` lists 0-based component indices and each entry in `tuples` has length `vars.length` with option indices aligned to `vars`.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `choices` | `number[]` | Selected option index (`0` to `componentCosts[c].length - 1`) per component |
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

With `choices = [0, 1, 1]`, components (0, 1) select option tuple (0, 1) which is listed in `allowedRules[0]`, components (1, 2) select option tuple (1, 1) avoiding the forbidden tuples (1, 0) and (0, 0), and total cost is $10 + 18 + 14 =$ **42** (1,000 JPY).

<!-- section:hint1 -->
Introduce one integer decision variable per component whose domain covers its available option indices. Express both positive compatibility tables and negative conflict tables directly over the corresponding component variable tuples, and sum the selected option costs as the objective.

<!-- section:hint2 -->
Map each rule's `rule.vars` to the corresponding component choice variables, then apply `allowed(vars, rule.tuples)` for `input.allowedRules` and `not(allowed(vars, rule.tuples))` for `input.forbiddenRules`. Compute each component's cost with `at(input.componentCosts[c], choices[c])` and minimize their `sum(...)` using `solver: "pumpkin"`.
