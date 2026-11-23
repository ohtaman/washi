# #026. RPG Party Synergy Maximization

<!-- section:scenario -->
An adventurer is recruiting a dungeon party from a roster of candidate heroes. Each hero has a base power rating and a gold recruitment cost, and the party must stay within both a total gold budget and a maximum party slot limit. Certain hero pairs also interact when recruited together: synergistic combos grant a positive bonus, whereas rival pairs impose a negative penalty.

Choose which heroes to recruit and report the exact pairwise activation indicators so that total cost stays within the budget, party size stays within the slot cap, and **total party power (individual power plus pairwise bonuses and penalties) is maximized**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `power` | `number[]` | Base power $p_i$ of hero $i$ |
| `costs` | `number[]` | Gold recruitment cost $c_i$ of hero $i$ |
| `budget` | `number` | Available gold budget $B$ |
| `maxPartySize` | `number` | Maximum number of heroes $K$ allowed in the party |
| `pairs` | `number[][]` | Interaction list `[i, j, s]` where `s > 0` is a synergy bonus and `s < 0` is a rivalry penalty |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) hero recruitment choices $x_i$ |
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

Recruiting heroes 0 and 1 (`[1, 1, 0, 0]`) uses $2 \le 2$ slots, spends $25 + 25 = 50 \le 60$ gold, activates only pair `(0, 1)` (`pairProducts = [1, 0, 0, 0]`), and yields $40 + 35 + 25 =$ **100**.

<!-- section:hint1 -->
Declare one binary decision variable per candidate hero and one continuous auxiliary variable in $[0, 1]$ per listed hero pair. Because the hero choices are binary, the McCormick inequalities force the pair variables to take exact integer values `0` or `1` without needing extra binary declarations.

<!-- section:hint2 -->
Enforce the budget and party-size caps, then apply the exact McCormick envelope for $w_k = x_i x_j$: two upper bounds ($w_k \le x_i$ and $w_k \le x_j$) prevent $w_k$ from turning on unless both heroes are recruited, and one lower bound ($w_k \ge x_i + x_j - 1$) forces $w_k$ to `1` whenever both are recruited. Both directions are essential here because pair weights $s$ can be positive (synergy, where the solver would otherwise overstate $w_k$) or negative (rivalry, where the solver would otherwise understate $w_k$). Round `pairProducts` cleanly when returning integer outputs.
