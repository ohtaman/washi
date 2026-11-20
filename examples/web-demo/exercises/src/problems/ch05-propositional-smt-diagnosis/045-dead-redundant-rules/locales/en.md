# #045. Dead & Redundant Rule Detection

<!-- section:scenario -->
Large policy rulebases often accumulate unreachable rules whose triggers can never fire and redundant rules whose implications are already guaranteed by earlier rules.

Evaluate the ordered list of trigger rules sequentially on top of the base rules and all preceding rules. Classify each rule as dead if its trigger condition is unsatisfiable alongside the accumulated policy, or otherwise as redundant if its implication already holds in every state allowed by the accumulated policy, and return both rule ID lists sorted lexicographically.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `baseRules` | `PropFormula[]` | Background domain invariants |
| `rules` | `Array<{ id: string; condition: PropFormula; effect: PropFormula }>` | Ordered trigger-effect implication rules |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `deadRules` | `string[]` | Sorted IDs of dead rules whose condition cannot be satisfied |
| `redundantRules` | `string[]` | Sorted IDs of non-dead rules already implied by prior rules |

<!-- section:example -->
**Input**

```json
{
  "vars": ["guest", "admin", "mfa", "audit"],
  "baseRules": [
    { "implies": ["guest", { "not": "admin" }] },
    { "implies": ["admin", "mfa"] }
  ],
  "rules": [
    { "id": "R1", "condition": "admin", "effect": "audit" },
    { "id": "R2", "condition": { "and": ["guest", "admin"] }, "effect": "audit" },
    { "id": "R3", "condition": "admin", "effect": { "and": ["mfa", "audit"] } }
  ]
}
```

**Output**

```json
{
  "deadRules": ["R2"],
  "redundantRules": ["R3"]
}
```

`R2` is dead because `guest` implies `not(admin)` in `baseRules`; `R3` is redundant because `admin => mfa` (base) and `admin => audit` (`R1`) already force `and(mfa, audit)`.
