# #047. Weighted MaxSAT Policy Repair

<!-- section:scenario -->
In production server configuration management (such as TLS encryption, legacy APIs, fast mode, and audit logging), mandatory security invariants (hard rules) can conflict with operational or usability preferences (soft rules).

Given Boolean configuration variables, mandatory hard rules, and soft rules with violation penalty weights, find a configuration assignment that satisfies all hard rules while minimizing the total penalty weight of violated soft rules.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `hardRules` | `PropFormula[]` | Mandatory propositional rules that must all hold |
| `softRules` | `Array<{ id: string; weight: number; expr: PropFormula }>` | Optional preference rules with violation penalty weights |

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
| `assignment` | `Record<string, boolean>` | Truth assignment satisfying all hard rules |
| `violatedRules` | `string[]` | Sorted IDs of soft rules violated under `assignment` |
| `totalPenalty` | `number` | Minimized sum of weights of violated soft rules |

<!-- section:example -->
**Input**

```json
{
  "vars": ["tls", "legacyApi", "fastMode", "audit"],
  "hardRules": [
    { "implies": ["fastMode", "legacyApi"] },
    { "not": { "and": ["tls", "legacyApi"] } }
  ],
  "softRules": [
    { "id": "S1", "weight": 5, "expr": "tls" },
    { "id": "S2", "weight": 2, "expr": "fastMode" },
    { "id": "S3", "weight": 4, "expr": { "implies": ["tls", "audit"] } }
  ]
}
```

**Output**

```json
{
  "assignment": {
    "tls": true,
    "legacyApi": false,
    "fastMode": false,
    "audit": true
  },
  "violatedRules": ["S2"],
  "totalPenalty": 2
}
```

Setting `tls = true, legacyApi = false, fastMode = false, audit = true` satisfies both hard rules and violates only `S2` for a total penalty of 2 (compared to violating `S1` at cost 5).


<!-- section:hint1 -->
Model the system state with Boolean variables for `vars`, and pair each soft rule with a binary relaxation indicator that is 1 when that soft rule is allowed to be violated. Enforce every hard rule unconditionally, and minimize the weighted sum of the relaxation indicators.

<!-- section:hint2 -->
Declare `m.bool(input.vars)` and `m.binary(...)` indicators `viol[k]` for each soft rule `k`. Guard each soft rule with `or(softExpr, expr\`${viol[k]} == 1\`)`—minimizing `dot(weights, viol)` with positive weights naturally keeps `viol[k] = 0` whenever the soft rule can hold—and solve via `minimize(dot(weights, viol))` and `await m.solve({ solver: "z3" })`.
