# #048. Historical Assignment Audit (m.verify)

<!-- section:scenario -->
Before deploying updated rules or investigating past incidents, compliance teams audit recorded historical assignments against formal Boolean and integer-arithmetic constraints without invoking a solver search.

Build a model containing the Boolean variables, bounded integer variables, and named compliance rules, run deterministic solution verification against the supplied historical record, and report whether the record is valid along with every violated rule ID sorted lexicographically.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean attribute names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer variable definitions |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | Named compliance rules |
| `candidateValues` | `Record<string, boolean / number>` | Historical variable assignment to audit |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` iff every rule holds under `candidateValues` |
| `violatedRules` | `string[]` | Sorted IDs of all violated rules |

<!-- section:example -->
**Input**

```json
{
  "boolVars": ["nightShift", "seniorOnDuty", "hazardFlag"],
  "intVars": [
    { "name": "crewCount", "lb": 1, "ub": 10 },
    { "name": "overtimeHours", "lb": 0, "ub": 12 }
  ],
  "rules": [
    { "id": "R1", "expr": { "implies": ["nightShift", "seniorOnDuty"] } },
    { "id": "R2", "expr": { "implies": ["hazardFlag", { "terms": { "crewCount": 1 }, "sense": ">=", "rhs": 4 }] } },
    { "id": "R3", "expr": { "terms": { "overtimeHours": 1 }, "sense": "<=", "rhs": 4 } }
  ],
  "candidateValues": {
    "nightShift": true,
    "seniorOnDuty": true,
    "hazardFlag": false,
    "crewCount": 3,
    "overtimeHours": 2
  }
}
```

**Output**

```json
{
  "valid": true,
  "violatedRules": []
}
```

Under `candidateValues`, `R1` holds (`nightShift` and `seniorOnDuty` are both `true`), `R2` holds vacuously (`hazardFlag = false`), and `R3` holds (`overtimeHours = 2 <= 4`).
