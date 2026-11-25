# #044. Security Policy Counterexample Search

<!-- section:scenario -->
A security policy engine defines operational rules over Boolean request flags and bounded integer attributes, alongside a required safety invariant that every admissible state is expected to guarantee.

Determine whether any state satisfies all policy rules while violating the safety invariant. If such a state exists, return a concrete counterexample; otherwise confirm that no violation exists.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `boolVars` | `string[]` | Boolean attribute names |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | Bounded integer attribute declarations |
| `rules` | `SmtFormula[]` | Active firewall/security policy rules |
| `safeInvariant` | `SmtFormula` | Safety property to prove or refute |

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


<!-- section:hint1 -->
Declare one Boolean variable per entry in `boolVars` and one bounded integer variable per entry in `intVars`, then compile the policy rules using `compileSmt`. To search for a counterexample, ask the solver for a state that satisfies all policy rules while falsifying the safety invariant.

<!-- section:hint2 -->
Use `m.bool(input.boolVars)` and `m.integer(spec.name, { lb: spec.lb, ub: spec.ub })`, add every rule in `input.rules`, and assert `not(compileSmt(input.safeInvariant, bools, ints))`. Call `await m.check({ solver: "z3" })`: `"Sat"` yields a concrete counterexample via `.value` (round integer values with `Math.round`), while `"Unsat"` proves the invariant holds.
