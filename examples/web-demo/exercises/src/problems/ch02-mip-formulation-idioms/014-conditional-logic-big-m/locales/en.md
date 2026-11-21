# #014. Conditional Logic & Tight Big-M Activation

<!-- section:scenario -->
An infrastructure team decides which candidate facilities to activate and what continuous operating scale to allocate to each active unit under a total capacity budget. Activating a facility incurs a fixed setup cost and requires its continuous operating level to fall between its minimum and maximum bounds, whereas inactive facilities stay at zero.

Operational policy imposes three logical dependencies: prerequisite pairs where activating the first unit requires activating the second, conjunction triggers where activating both of the first two units forces a third support unit to activate, and conflict pairs that cannot both be active. Choose activation decisions and operating levels to **maximize net profit** (total return minus fixed setup costs).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `budget` | `number` | Maximum total continuous level across all facilities |
| `unitReturns` | `number[]` | Return earned per unit of operating level for each facility |
| `fixedCosts` | `number[]` | Fixed setup cost incurred when each facility is active |
| `minLevels` | `number[]` | Minimum continuous operating level when active |
| `maxLevels` | `number[]` | Maximum continuous operating level when active |
| `prerequisites` | `number[][]` | Pairs `[a, b]` requiring facility `b` active whenever `a` is active |
| `conjunctions` | `number[][]` | Triples `[a, b, c]` requiring `c` active whenever both `a` and `b` are active |
| `conflicts` | `number[][]` | Pairs `[u, v]` that cannot both be active simultaneously |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `active` | `number[]` | Binary (`0` or `1`) activation flags per facility |
| `levels` | `number[]` | Continuous operating level per facility |
| `netProfit` | `number` | Maximized net profit (returns minus fixed costs) |

<!-- section:example -->
**Input**

```json
{
  "budget": 55,
  "unitReturns": [6, 22, 24, 10, 20],
  "fixedCosts": [90, 80, 75, 110, 95],
  "minLevels": [10, 15, 14, 12, 16],
  "maxLevels": [18, 22, 20, 14, 24],
  "prerequisites": [[1, 0]],
  "conjunctions": [[1, 2, 3]],
  "conflicts": [[2, 4]]
}
```

**Output**

```json
{
  "active": [1, 1, 0, 0, 1],
  "levels": [10, 22, 0, 0, 23],
  "netProfit": 739
}
```

Activating facilities `{0, 1, 4}` with `levels = [10, 22, 0, 0, 23]` satisfies prerequisite `1 -> 0`, avoids the `[2, 4]` conflict and conjunction trigger, uses $10 + 22 + 23 = 55 \le 55$ budget, and earns net profit $(60 + 484 + 460) - (90 + 80 + 95) =$ **739**.

<!-- section:hint1 -->
Each facility combines a binary activation variable with a continuous operating level. The model couples each pair's operating range, caps total operating levels by the budget, and expresses the three logical rules (prerequisites, conjunctions, and conflicts) as linear inequalities over the binary variables.

<!-- section:hint2 -->
Use tight instance bounds (`minLevels[i]` and `maxLevels[i]`) to link `levels[i]` to `active[i]`. For logical rules, an implication $a \implies b$ becomes $y_a \le y_b$, a conflict becomes $y_u + y_v \le 1$, and a conjunction $(a \land b) \implies c$ becomes $y_a + y_b - 1 \le y_c$ (active only when both $a$ and $b$ are $1$).
