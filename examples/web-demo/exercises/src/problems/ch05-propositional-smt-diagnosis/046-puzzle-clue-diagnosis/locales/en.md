# #046. Contradictory-Clue Minesweeper Diagnosis (MUS)

<!-- section:scenario -->
A Minesweeper-style puzzle board has a set of named cells, each either safe or containing a mine, together with a list of named clues that cannot all be satisfied at once. A raw contradiction report from a solver may still include extra clues that are not strictly needed to create the conflict.

Find an irreducible minimal unsatisfiable subset of clue IDs—a subset that is jointly contradictory, such that removing any single clue makes the remaining clues satisfiable—and return those IDs sorted lexicographically.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `cells` | `string[]` | Named puzzle cells (each is either safe `0` or a mine `1`) |
| `clues` | `PuzzleClue[]` | Named clues (`mineCount`, `atLeast`, `atMost`, `safe`, `mine`, `impliesMine`, `same`, `different`) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `coreRules` | `string[]` | Irreducible minimal unsatisfiable subset of clue IDs (sorted) |

<!-- section:example -->
**Input**

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

**Output**

```json
{
  "coreRules": ["C1", "C2", "C3", "C4"]
}
```

`{ C1, C2, C3, C4 }` is contradictory (`A1 = 0`, `A2 = 0`, `B1 + B2 = 1` implies `A1 + A2 + B1 + B2 = 1 != 2`), and dropping any one of those four clues leaves a valid mine board.


<!-- section:hint1 -->
Start from an initial contradictory subset of clues (such as the raw unsatisfiable core returned by the solver) and test each clue in turn to see whether it is essential. Whenever removing a clue leaves the remaining clues contradictory, drop that clue permanently.

<!-- section:hint2 -->
Model each cell with `m.integer(cell, { lb: 0, ub: 1 })` and pass each clue's `id` as the constraint name (`m.constraint(..., clue.id)`) so `await m.check({ solver: "z3" })` populates `res.unsatCore` when `"Unsat"`. For deletion-based contraction, build a fresh `Model` for each candidate subset without `clueId`; if `"Unsat"`, shrink `core` to `res.unsatCore` (or the candidate), then sort `coreRules`.
