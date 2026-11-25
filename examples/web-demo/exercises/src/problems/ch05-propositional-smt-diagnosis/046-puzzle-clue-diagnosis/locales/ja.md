# #046. 矛盾ヒント診断（マインスイーパ MUS）

<!-- section:scenario -->
マインスイーパ風のパズル盤面において、各マスは安全または地雷のいずれかであり、互いに矛盾して同時に満たせない名前付きヒントの集合が与えられます。ソルバーが最初に返す矛盾コアには、矛盾の成立に必須ではない余分なヒントが含まれていることがあります。

全体として矛盾しており、かつどの1つのヒントを取り除いても残りが充足可能になる極小なヒント ID の部分集合（MUS）を抽出し、辞書順で返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `cells` | `string[]` | 名前付きマス一覧（各マスは安全 0 または地雷 1） |
| `clues` | `PuzzleClue[]` | 名前付きヒント集合（`mineCount`, `atLeast`, `atMost`, `safe`, `mine`, `impliesMine`, `same`, `different`） |

各 `PuzzleClue` は `id: string` と以下のいずれかの `type` バリアントを持ちます:
- `"mineCount"`: `{ id, type: "mineCount", cells: string[], count: number }` — `cells` のうちちょうど `count` 個が地雷
- `"atLeast"`: `{ id, type: "atLeast", cells: string[], count: number }` — `cells` のうち少なくとも `count` 個が地雷
- `"atMost"`: `{ id, type: "atMost", cells: string[], count: number }` — `cells` のうち最大 `count` 個が地雷
- `"safe"`: `{ id, type: "safe", cell: string }` — `cell` は安全（地雷なし）
- `"mine"`: `{ id, type: "mine", cell: string }` — `cell` は地雷
- `"impliesMine"`: `{ id, type: "impliesMine", ifMine: string, thenMine: string }` — `ifMine` が地雷ならば `thenMine` も必ず地雷
- `"same"`: `{ id, type: "same", a: string, b: string }` — `a` と `b` は両方とも地雷、または両方とも安全
- `"different"`: `{ id, type: "different", a: string, b: string }` — `a` と `b` のうちちょうど一方が地雷

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `coreRules` | `string[]` | 極小充足不能部分集合となるヒント ID の配列（辞書順） |

<!-- section:example -->
**入力例**

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

**出力例**

```json
{
  "coreRules": ["C1", "C2", "C3", "C4"]
}
```

`{ C1, C2, C3, C4 }` は矛盾しており（`A1` = 0, `A2` = 0, `B1` + `B2` = 1 より合計は 1 ≠ 2）、この4つのうちどれか1つを除くと有効な盤面が存在します。


<!-- section:hint1 -->
まずソルバーが返す初期の矛盾コアなどの充足不能なヒント部分集合から始め、各ヒントを1つずつ仮に除いて矛盾が残るかどうかを調べます。除いても矛盾が解消しないヒントは不要なので、候補集合から取り除きます。

<!-- section:hint2 -->
各マスを `m.integer(cell, { lb: 0, ub: 1 })` で表し、`m.constraint(..., clue.id)` のように制約名へヒント ID を付けると、`await m.check({ solver: "z3" })` が `"Unsat"` のときに `res.unsatCore` が得られます。削除縮小では、`clueId` を除いた各候補部分集合ごとに新しい `Model` を作って `"Unsat"` なら `res.unsatCore`（または候補集合）へ縮小し、最後に `coreRules` をソートしてください。
