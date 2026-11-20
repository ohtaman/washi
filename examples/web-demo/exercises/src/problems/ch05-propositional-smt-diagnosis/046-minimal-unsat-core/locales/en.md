# #046. Minimal Unsatisfiable Core Extraction (MUS)

<!-- section:scenario -->
When a collection of named Boolean and bounded-integer rules is unsatisfiable, a raw solver core may still contain extra rules that are not strictly needed for the contradiction.

Extract an irreducible minimal unsatisfiable subset (MUS) by starting from Z3's unsatisfiable core and applying deletion-based contraction: keep only rules whose removal makes the remaining subset satisfiable.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean variable names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer variable declarations |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | Named inconsistent rule set |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `coreRules` | `string[]` | Irreducible minimal unsatisfiable subset of rule IDs (sorted) |

<!-- section:example -->
**Input**

```json
{
  "boolVars": ["a", "b", "c", "d"],
  "intVars": [],
  "rules": [
    { "id": "R1", "expr": "a" },
    { "id": "R2", "expr": { "implies": ["a", "b"] } },
    { "id": "R3", "expr": { "implies": ["a", "c"] } },
    { "id": "R4", "expr": { "not": "b" } },
    { "id": "R5", "expr": { "or": ["c", "d"] } },
    { "id": "R6", "expr": { "implies": ["c", "d"] } }
  ]
}
```

**Output**

```json
{
  "coreRules": ["R1", "R2", "R4"]
}
```

`{ R1, R2, R4 }` is unsatisfiable (`a = true`, `a => b`, `not(b)`), and removing any one of those three rules leaves a satisfiable subset.
