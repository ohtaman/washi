# #047. Weighted MaxSAT Policy Repair

<!-- section:scenario -->
When operational preferences conflict with mandatory invariants, an organization must satisfy every hard rule while relaxing only the least costly subset of soft rules.

Given Boolean variables, mandatory hard rules, and weighted soft rules, find a truth assignment that satisfies all hard rules and minimizes the total penalty weight of violated soft rules.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `hardRules` | `PropFormula[]` | Mandatory propositional rules that must all hold |
| `softRules` | `Array<{ id: string; weight: number; expr: PropFormula }>` | Optional preference rules with violation penalty weights |

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

Setting `tls = true, legacyApi = false, fastMode = false, audit = true` satisfies both hard rules and violates only `S2` for a total penalty of `2` (compared to violating `S1` at cost `5`).
