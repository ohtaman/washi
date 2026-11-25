# #046. 矛盾线索诊断（扫雷 MUS）

<!-- section:scenario -->
在类似扫雷的谜题棋盘中，每个格子要么安全要么有雷，且给出的一组命名线索互相矛盾、无法同时满足。求解器最初返回的冲突核中可能仍包含并非产生矛盾所必需的多余线索。

请提取一个极小不可满足线索 ID 子集（MUS）——该子集整体矛盾，且移除其中任意一条线索后剩余线索均存在可行解——并按字典序返回这些线索 ID。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `cells` | `string[]` | 命名格子列表（每个格子为安全 0 或地雷 1） |
| `clues` | `PuzzleClue[]` | 命名线索列表（`mineCount`, `atLeast`, `atMost`, `safe`, `mine`, `impliesMine`, `same`, `different`） |

每条 `PuzzleClue` 带有 `id: string` 及以下 `type` 变体之一：
- `"mineCount"`: `{ id, type: "mineCount", cells: string[], count: number }` — `cells` 中恰好有 `count` 个格子有雷
- `"atLeast"`: `{ id, type: "atLeast", cells: string[], count: number }` — `cells` 中至少有 `count` 个格子有雷
- `"atMost"`: `{ id, type: "atMost", cells: string[], count: number }` — `cells` 中至多有 `count` 个格子有雷
- `"safe"`: `{ id, type: "safe", cell: string }` — `cell` 安全（无雷）
- `"mine"`: `{ id, type: "mine", cell: string }` — `cell` 有雷
- `"impliesMine"`: `{ id, type: "impliesMine", ifMine: string, thenMine: string }` — 若 `ifMine` 有雷，则 `thenMine` 也必须有雷
- `"same"`: `{ id, type: "same", a: string, b: string }` — `a` 与 `b` 要么都有雷、要么都安全
- `"different"`: `{ id, type: "different", a: string, b: string }` — `a` 与 `b` 中恰好有一个有雷

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coreRules` | `string[]` | 极小不可满足线索 ID 子集（按字典序排列） |

<!-- section:example -->
**输入示例**

```json
{
  "cells": ["A1", "A2", "B1", "B2"],
  "clues": [
    { "id": "C1", "type": "mineCount", "cells": ["A1", "A2", "B1", "B2"], "count": 2 },
    { "id": "C2", "type": "safe", "cell": "A1" },
    { "id": "C3", "type": "safe", "cell": "A2" },
    { "id": "C4", "type": "mineCount", "cells": ["B1", "B2"], "count": 1 },
    { "id": "C5", "type": "atMost", "cells": ["A1", "B1"], "count": 1 },
    { "id": "C6", "type": "impliesMine", "ifMine": "A2", "thenMine": "B2" }
  ]
}
```

**输出示例**

```json
{
  "coreRules": ["C1", "C2", "C3", "C4"]
}
```

`{ C1, C2, C3, C4 }` 互相矛盾（`A1 = 0`、`A2 = 0`、`B1 + B2 = 1` 推出总和为 1 ≠ 2），而去掉这四条中的任意一条后都存在合法雷区配置。


<!-- section:hint1 -->
从求解器返回的初始不可满足核等矛盾子集出发，逐个测试每条线索是否不可或缺。只要移除某条线索后剩余子集依然不可满足，就将该线索永久删去。

<!-- section:hint2 -->
使用 `m.integer(cell, { lb: 0, ub: 1 })` 表示每个格子，并以线索 `id` 作为约束名称（`m.constraint(..., clue.id)`），这样当 `await m.check({ solver: "z3" })` 返回 `"Unsat"` 时就会填充 `res.unsatCore`。在删减收缩过程中，为移除 `clueId` 后的每个候选子集构建新的 `Model`，若仍为 `"Unsat"` 则收缩到 `res.unsatCore`（或候选子集），最后对 `coreRules` 排序。
