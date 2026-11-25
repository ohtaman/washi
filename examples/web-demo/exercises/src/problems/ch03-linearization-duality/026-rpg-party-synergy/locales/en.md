# #026. RPG Party Synergy Maximization

<!-- section:scenario -->
An adventurer is recruiting a dungeon party from a roster of candidate heroes, each with a base power rating and a gold recruitment cost:

- **Budget cap**: total recruitment cost must stay within the available gold budget.
- **Party size cap**: the number of recruited heroes cannot exceed the maximum party slot limit.
- **Pairwise interactions**: recruiting both heroes of a listed pair triggers a synergy bonus (positive) or a rivalry penalty (negative).

Choose which heroes to recruit and report the pairwise activation indicators so as to **maximize total party power (individual power plus pairwise bonuses and penalties)**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `power` | `number[]` | Base power of each hero |
| `costs` | `number[]` | Recruitment cost of each hero (gold) |
| `budget` | `number` | Available total budget (gold) |
| `maxPartySize` | `number` | Maximum number of heroes allowed in the party |
| `pairs` | `number[][]` | Interaction list `[i, j, s]`, where `i` and `j` are 0-based hero indices, $s > 0$ is a synergy bonus, and $s < 0$ is a rivalry penalty |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) hero recruitment choices $x_i$ |
| `pairProducts` | `number[]` | Binary pair indicators $w_k = x_i x_j$ for each entry in `pairs` |
| `totalValue` | `number` | Maximized total party power (individual plus pair interactions) |

<!-- section:example -->
**Input**

```json
{
  "power": [40, 35, 30, 25],
  "costs": [25, 25, 20, 15],
  "budget": 60,
  "maxPartySize": 2,
  "pairs": [
    [0, 1, 25],
    [1, 2, -20],
    [0, 3, 10],
    [2, 3, 15]
  ]
}
```

**Output**

```json
{
  "selected": [1, 1, 0, 0],
  "pairProducts": [1, 0, 0, 0],
  "totalValue": 100
}
```

Recruiting heroes 0 and 1 ([1, 1, 0, 0]) uses $2 \le 2$ slots, spends $25 + 25 = 50 \le 60$ gold, activates only pair (0, 1) (`pairProducts` is [1, 0, 0, 0]), and yields $40 + 35 + 25 =$ **100**.

<!-- section:hint1 -->
Model one binary choice per candidate hero indicating whether that hero is recruited, and one continuous auxiliary variable bounded between 0 and 1 for each listed hero pair indicating whether both heroes are recruited together. Even though the pair variables are declared continuous, linear coupling constraints with the binary hero choices will force them to take exact 0 or 1 values.

<!-- section:hint2 -->
Enforce the budget and party-size caps, then linearize each pair product $w_k = x_i x_j$ with the three-inequality McCormick (Fortet) envelope: two upper bounds tying $w_k$ to each individual hero prevent claiming an unearned synergy bonus ($s > 0$) when either hero is omitted, while a lower bound forces $w_k = 1$ whenever both heroes are recruited so a rivalry penalty ($s < 0$) cannot be dodged. Both directions are essential when interaction weights have mixed signs. Round `pairProducts` cleanly when returning integer outputs.
