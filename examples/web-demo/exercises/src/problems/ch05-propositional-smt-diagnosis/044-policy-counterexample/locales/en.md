# #044. Security Policy Counterexample Search

<!-- section:scenario -->
A security policy engine defines operational rules over Boolean request flags and bounded integer attributes, alongside a required safety invariant that every admissible state is expected to guarantee.

To formally verify the policy by refutation, assert all policy rules together with the logical negation of the safety invariant. If the combined SMT formula is satisfiable, return a concrete counterexample state; if unsatisfiable, confirm that no violation exists.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean attribute names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer attribute declarations |
| `rules` | `SmtFormula[]` | Active firewall/security policy rules |
| `safeInvariant` | `SmtFormula` | Safety property to prove or refute |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `hasViolation` | `boolean` | `true` if a counterexample state exists, `false` if proven safe |
| `counterexample` | `Record<string, boolean / number>` or `null` | Concrete violating attribute values, or `null` when proven safe |

<!-- section:example -->
**Input**

```json
{
  "boolVars": ["isAdmin", "mfaVerified", "external", "allowSsh"],
  "intVars": [{ "name": "portTier", "lb": 1, "ub": 4 }],
  "rules": [
    { "implies": ["allowSsh", { "terms": { "portTier": 1 }, "sense": "==", "rhs": 1 }] },
    { "implies": [{ "and": ["external", { "terms": { "portTier": 1 }, "sense": "==", "rhs": 1 }] }, "allowSsh"] },
    { "implies": [{ "and": ["isAdmin", "mfaVerified"] }, "allowSsh"] }
  ],
  "safeInvariant": { "implies": [{ "and": ["allowSsh", "external"] }, "mfaVerified"] }
}
```

**Output**

```json
{
  "hasViolation": true,
  "counterexample": {
    "isAdmin": false,
    "mfaVerified": false,
    "external": true,
    "allowSsh": true,
    "portTier": 1
  }
}
```

This packet satisfies every policy rule (`portTier = 1` with `external = true` triggers `allowSsh = true`) yet violates `safeInvariant` because `mfaVerified = false`.
