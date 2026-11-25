# #048. Historical Assignment Audit (m.verify)

<!-- section:scenario -->
Before deploying updated rules or investigating past incidents, compliance teams audit recorded operational logs—such as night-shift staffing, crew counts, overtime hours, or deployment freeze records—against formal Boolean and integer-arithmetic constraints.

Given the Boolean variables, bounded integer variables, named compliance rules, and a historical variable assignment, deterministically audit the assignment without invoking a solver search and report whether the record is valid along with every violated rule ID sorted lexicographically.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean attribute names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer variable definitions |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | Named compliance rules |
| `candidateValues` | `Record<string, StateValue>` | Historical variable assignment to audit |

`SmtFormula` is a recursive union over boolean variables (`string`), linear integer comparisons (`SmtCmp`), and boolean connectives:
```ts
type StateValue = boolean | number;
type SmtCmp = { terms: Record<string, number>; sense: "<=" | ">=" | "==" | "!="; rhs: number };
type SmtFormula =
  | string
  | { not: SmtFormula }
  | { and: SmtFormula[] }
  | { or: SmtFormula[] }
  | { implies: [SmtFormula, SmtFormula] }
  | { xor: SmtFormula[] }
  | SmtCmp;
```

A bare `string` leaf refers to a Boolean variable in `boolVars`, `SmtCmp` evaluates $\sum_k c_k v_k \mathrel{\text{sense}} \text{rhs}$ over `intVars` (with `terms` mapping variable $v_k$ to coefficient $c_k$), `implies: [a, b]` means $a \implies b$, and `xor` holds iff an odd number of its operands are true.

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


<!-- section:hint1 -->
Declare the Boolean and bounded integer variables on the model and register each compliance rule under its rule ID so any violation can be attributed by name. Then verify the supplied historical assignment directly against the model without running a solver.

<!-- section:hint2 -->
Use `m.bool(input.boolVars)`, `m.integer(spec.name, { lb: spec.lb, ub: spec.ub })`, and `m.constraint(compileSmt(r.expr, bools, ints), r.id)`. Call `m.verify({ values: input.candidateValues })` (synchronous, no Z3 search needed) and collect unique `v.name` entries from `report.violations`, sorted lexicographically.
