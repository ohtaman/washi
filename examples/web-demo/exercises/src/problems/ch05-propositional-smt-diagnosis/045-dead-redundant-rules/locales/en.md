# #045. Dead & Redundant Rule Detection

<!-- section:scenario -->
When maintaining or auditing rulebases for access control or business approvals, you need to identify dead rules whose trigger conditions can never be satisfied and redundant rules whose effects are already guaranteed by earlier rules.

Evaluate the ordered list of trigger rules sequentially on top of the base rules and all preceding rules. Classify each rule as dead if its trigger condition is unsatisfiable alongside the accumulated policy, or otherwise as redundant if its implication already holds in every state allowed by the accumulated policy, and return both rule ID lists sorted lexicographically.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `baseRules` | `PropFormula[]` | Background domain invariants |
| `rules` | `Array<{ id: string; condition: PropFormula; effect: PropFormula }>` | Ordered trigger-effect implication rules |

`PropFormula` is a recursive union:
```ts
type PropFormula =
  | string
  | { not: PropFormula }
  | { and: PropFormula[] }
  | { or: PropFormula[] }
  | { implies: [PropFormula, PropFormula] }
  | { xor: PropFormula[] };
```

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


<!-- section:hint1 -->
Process `input.rules` in order, maintaining the accumulated policy built from `baseRules` and all earlier trigger rules as implications. For each rule, first test whether its trigger condition is ever reachable under the accumulated policy, and if it is reachable, test whether its effect can ever fail when the trigger fires.

<!-- section:hint2 -->
Create a fresh `Model` with `m.bool(input.vars)` for each Z3 check (`await m.check({ solver: "z3" })`). A rule is dead if `prior` plus `r.condition` is `"Unsat"`; otherwise it is redundant if `prior` plus `r.condition` plus `not(r.effect)` is `"Unsat"`. Always append `implies(r.condition, r.effect)` to `prior` before moving to the next rule, and sort both output arrays lexicographically.
