# #050. Conflict Diagnosis & Minimum-Cost Repair Synthesis

<!-- section:scenario -->
An enterprise policy governance system enforces mandatory hard rules alongside weighted soft preferences over Boolean and bounded-integer state attributes.

Diagnose and repair the rule set as follows:
- **Consistency check**: First check whether all hard and soft rules are jointly satisfiable.
- **If consistent**: Return a valid assignment with empty cores, empty relaxed rules, and zero repair cost.
- **If inconsistent**: Extract a minimal unsatisfiable core (MUS) across all rules, and find a minimum-weight soft-rule relaxation together with a repaired variable assignment satisfying every hard rule and every remaining soft rule.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean attribute names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer variable definitions |
| `hardRules` | `Array<{ id: string; expr: SmtFormula }>` | Mandatory hard rules that cannot be relaxed |
| `softRules` | `Array<{ id: string; weight: number; expr: SmtFormula }>` | Weighted soft rules that can be relaxed at cost `weight` |

`SmtFormula` is a recursive union over boolean variables (`string`), linear integer comparisons (`SmtCmp`), and boolean connectives:
```ts
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

### Output

| Field | Type | Description |
| --- | --- | --- |
| `consistent` | `boolean` | `true` if `hardRules` and `softRules` are jointly satisfiable |
| `minimalCore` | `string[]` | Sorted MUS rule IDs when inconsistent, or `[]` when consistent |
| `relaxedRules` | `string[]` | Sorted relaxed soft rule IDs, or `[]` when consistent |
| `repairCost` | `number` | Minimized total weight of relaxed soft rules |
| `repairedAssignment` | `Record<string, boolean / number>` | Assignment satisfying all hard rules and unrelaxed soft rules |

<!-- section:example -->
**Input**

```json
{
  "boolVars": ["prod", "mfa", "legacy", "audit"],
  "intVars": [{ "name": "tier", "lb": 1, "ub": 3 }],
  "hardRules": [
    { "id": "H1", "expr": { "implies": ["prod", "mfa"] } },
    { "id": "H2", "expr": { "not": { "and": ["mfa", "legacy"] } } },
    { "id": "H3", "expr": { "implies": ["prod", { "terms": { "tier": 1 }, "sense": ">=", "rhs": 2 }] } }
  ],
  "softRules": [
    { "id": "S1", "weight": 6, "expr": "prod" },
    { "id": "S2", "weight": 2, "expr": "legacy" },
    { "id": "S3", "weight": 4, "expr": "audit" }
  ]
}
```

**Output**

```json
{
  "consistent": false,
  "minimalCore": ["H1", "H2", "S1", "S2"],
  "relaxedRules": ["S2"],
  "repairCost": 2,
  "repairedAssignment": {
    "prod": true,
    "mfa": true,
    "legacy": false,
    "audit": true,
    "tier": 2
  }
}
```

`{ H1, H2, S1, S2 }` forms the irreducible conflict (`prod => mfa`, `not(mfa && legacy)`, `prod`, `legacy`); relaxing `S2` (weight 2) restores full feasibility with `prod = mfa = audit = true, legacy = false, tier = 2`.


<!-- section:hint1 -->
Structure the workflow in two stages over the same Boolean and bounded integer state variables: first check joint satisfiability of all hard and soft rules together; if unsatisfiable, extract an irreducible minimal core over all named rules and separately solve a weighted soft-rule relaxation problem.

<!-- section:hint2 -->
For consistency and MUS extraction, register every hard and soft rule with its `id` as the constraint name and use `await m.check({ solver: "z3" })` plus `res.unsatCore` with deletion-based contraction. For minimum-weight repair, keep hard rules unconditional, pair each soft rule with a binary relaxation indicator `viol[k]` via `or(softExpr, expr\`${viol[k]} == 1\`)`, and minimize `dot(weights, viol)` with `await m.solve({ solver: "z3" })`.
