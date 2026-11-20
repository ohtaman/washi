# #033. Compatible System Configuration (Table Constraints)

<!-- section:scenario -->
An engineer is configuring a hardware system consisting of several discrete components. Each component c has an array of candidate options with prices in componentCosts[c].

Positive compatibility tables in allowedRules require the selected options of the listed components to match one of the approved tuples, while negative rules in forbiddenRules forbid any tuple in their conflict table. Select one option per component to satisfy every table rule at minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `componentCosts` | `number[][]` | Cost of each option `opt` for component `c` (`componentCosts[c][opt]`) |
| `allowedRules` | `TableRule[]` | Positive table rules `{ vars, tuples }` requiring `(choices[v])` in `tuples` |
| `forbiddenRules` | `TableRule[]` | Negative table rules `{ vars, tuples }` forbidding `(choices[v])` in `tuples` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `choices` | `number[]` | Selected option index (`0` to `componentCosts[c].length - 1`) per component |
| `totalCost` | `number` | Minimized total configuration cost |

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

Choices `[0, 1, 1]` satisfy `(choices[0], choices[1]) = (0, 1)` in `allowedRules[0]`, avoid `(1, 0)` and `(0, 0)` on components `(1, 2)`, and cost $10 + 18 + 14 =$ **42**.
