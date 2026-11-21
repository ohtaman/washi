# #041. Propositional Logic & Access Interlock SAT

<!-- section:scenario -->
An automated security gate controls Boolean system flags such as badge presence, multi-factor authentication, VPN tunnels, and manual override switches. Each rule expresses a logical requirement combining negation, conjunction, disjunction, implication, and exclusive-or.

Given the list of Boolean variable names and propositional rules, decide whether any truth assignment satisfies all rules simultaneously and, when satisfiable, return one valid assignment.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names in the system |
| `rules` | `PropFormula[]` | Propositional formulas built from variable names, `not`, `and`, `or`, `implies`, and `xor` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `satisfiable` | `boolean` | `true` if a satisfying truth assignment exists, else `false` |
| `assignment` | `Record<string, boolean>` or `null` | Valid Boolean assignment for every variable, or `null` when unsatisfiable |

<!-- section:example -->
**Input**

```json
{
  "vars": ["badge", "mfa", "vpn", "override"],
  "rules": [
    { "implies": ["badge", "mfa"] },
    { "xor": ["vpn", "override"] },
    { "or": ["badge", "vpn"] },
    { "not": "override" }
  ]
}
```

**Output**

```json
{
  "satisfiable": true,
  "assignment": {
    "badge": true,
    "mfa": true,
    "vpn": true,
    "override": false
  }
}
```

With `override = false` and `vpn = true`, both `not(override)` and `xor(vpn, override)` hold, `or(badge, vpn)` is true, and `badge = true` implies `mfa = true`.


<!-- section:hint1 -->
Create one Boolean decision variable per entry in `vars`, and complete `compileFormula` so every propositional connective maps to its WaSHI logic primitive. Each item in `rules` becomes a constraint on the model.

<!-- section:hint2 -->
Use `m.bool(input.vars)` to declare the Boolean variables, `implies(...)` and `xor(...)` in `compileFormula`, and `await m.check({ solver: "z3" })` to test satisfiability without an objective. When the status is `"Sat"`, read each variable's truth value from `bools[name].value`; otherwise return `satisfiable: false` and `assignment: null`.
