# #014. Party Invitation & Logic Puzzle

<!-- section:scenario -->
You are organizing a dinner party and deciding which candidate guests to invite and how much gift budget to allocate to each invited guest. Inviting a guest brings a base enjoyment score plus an extra enjoyment bonus per dollar spent on their gift.

Your invitation plan must satisfy all of the following rules:
- **Gift budget bounds**: Each invited guest must receive a gift budget between their minimum and maximum spending limits (uninvited guests receive `0`).
- **Total budget cap**: The sum of gift budgets across all guests cannot exceed the total party budget.
- **Pairing requirements**: Certain pairs require inviting the second guest whenever the first guest is invited.
- **Conflicts**: Certain pairs of guests cannot both be invited.
- **Group minimums**: Specified groups of guests require inviting at least a minimum number of people from that group.

Choose who to invite and how much to spend on each guest to **maximize total enjoyment**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `budget` | `number` | Maximum total gift budget across all guests |
| `baseEnjoyment` | `number[]` | Base enjoyment gained by inviting each guest |
| `bonusRates` | `number[]` | Additional enjoyment per unit of gift budget spent on each guest |
| `minSpend` | `number[]` | Minimum gift budget required when a guest is invited |
| `maxSpend` | `number[]` | Maximum gift budget allowed when a guest is invited |
| `implications` | `number[][]` | Pairs `[a, b]` requiring guest `b` to be invited whenever guest `a` is invited |
| `conflicts` | `number[][]` | Pairs `[u, v]` of guests who cannot both be invited |
| `groupRules` | `{ guests: number[]; minCount: number }[]` | Group quotas requiring at least `minCount` guests invited from `guests` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `invite` | `number[]` | Binary (`0` or `1`) invitation decision per guest |
| `giftBudget` | `number[]` | Continuous gift budget allocated to each guest |
| `totalEnjoyment` | `number` | Maximized total enjoyment |

<!-- section:example -->
**Input**

```json
{
  "budget": 55,
  "baseEnjoyment": [10, 25, 30, 15, 22],
  "bonusRates": [2, 5, 6, 3, 4],
  "minSpend": [8, 12, 10, 10, 14],
  "maxSpend": [15, 20, 18, 14, 22],
  "implications": [[1, 0]],
  "conflicts": [[2, 4]],
  "groupRules": [
    { "guests": [0, 2, 3], "minCount": 1 }
  ]
}
```

**Output**

```json
{
  "invite": [1, 1, 1, 1, 0],
  "giftBudget": [8, 19, 18, 10, 0],
  "totalEnjoyment": 329
}
```

Inviting guests `{0, 1, 2, 3}` with `giftBudget = [8, 19, 18, 10, 0]` satisfies implication `1 -> 0`, avoids the `[2, 4]` conflict, includes 3 guests (at least 1) from `{0, 2, 3}`, spends $8 + 19 + 18 + 10 = 55 \le 55$, and achieves enjoyment $(10 + 25 + 30 + 15) + (16 + 95 + 108 + 30) =$ **329**.

<!-- section:hint1 -->
Each guest combines a binary invitation decision with a continuous gift budget variable. The model couples each guest's gift range to their invitation flag, caps total gift spending by the party budget, and expresses the three social rules (implications, conflicts, and group quotas) as linear inequalities over the binary variables.

<!-- section:hint2 -->
Use tight instance bounds (`minSpend[i]` and `maxSpend[i]`) to link `giftBudget[i]` to `invite[i]`. For logical rules, an implication $a \implies b$ becomes $y_a \le y_b$, a conflict becomes $y_u + y_v \le 1$, and an at-least-$k$ group rule sums the binary variables in `rule.guests` to be at least `rule.minCount`.
