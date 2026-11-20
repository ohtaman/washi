# #042. Solution Uniqueness via No-Good Cuts

<!-- section:scenario -->
Finding one satisfying assignment proves that a rule system is consistent, but configuration and puzzle verification often requires knowing whether that solution is unique.

Given Boolean variables and propositional rules, first check whether a satisfying assignment exists; when one exists, also determine whether it is unique among all truth assignments.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `rules` | `PropFormula[]` | Propositional rules |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `satisfiable` | `boolean` | `true` if at least one satisfying assignment exists |
| `assignment` | `Record<string, boolean>` or `null` | A satisfying assignment, or `null` if unsatisfiable |
| `unique` | `boolean` | `true` iff exactly one satisfying assignment exists |

<!-- section:example -->
**Input**

```json
{
  "vars": ["a", "b", "c", "d"],
  "rules": [
    "a",
    { "implies": ["a", "b"] },
    { "xor": ["b", "c"] },
    { "implies": [{ "and": ["a", { "not": "c" }] }, "d"] }
  ]
}
```

**Output**

```json
{
  "satisfiable": true,
  "assignment": {
    "a": true,
    "b": true,
    "c": false,
    "d": true
  },
  "unique": true
}
```

Evaluating each rule under `{ a: true, b: true, c: false, d: true }` confirms that `"a"`, `implies(a, b)`, `xor(b, c)`, and `implies(and(a, not(c)), d)` all hold, and no other truth vector over `["a", "b", "c", "d"]` satisfies all four rules, so both `satisfiable` and `unique` are `true`.
