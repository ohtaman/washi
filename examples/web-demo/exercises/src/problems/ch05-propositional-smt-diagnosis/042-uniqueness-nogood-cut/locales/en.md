# #042. Solution Uniqueness via No-Good Cuts

<!-- section:scenario -->
Operational rules for security configurations and feature flags (such as authentication methods, encryption, and audit logging) often require verifying both that a valid configuration exists and that no alternative valid configuration remains.

Given a list of Boolean variable names and a list of propositional rules, determine whether a satisfying assignment exists and, if so, return one satisfying assignment together with whether it is the unique solution.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `vars` | `string[]` | Boolean variable names |
| `rules` | `PropFormula[]` | Propositional rules |

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

A bare `string` references a variable name in `vars`, `{ implies: [p, q] }` denotes $p \to q$, and `{ xor: [...] }` holds if and only if an odd number of its subformulas evaluate to `true`.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `satisfiable` | `boolean` | `true` if at least one satisfying assignment exists |
| `assignment` | `Record<string, boolean>` or `null` | A satisfying assignment, or `null` if unsatisfiable |
| `unique` | `boolean` | `true` iff exactly one satisfying assignment exists |

<!-- section:example -->
**Input**

```json
{
  "vars": ["a", "b", "c", "d"],
  "rules": [
    "a",
    { "implies": ["a", "b"] },
    { "xor": ["b", "c"] },
    { "implies": [{ "and": ["a", { "not": "c" }] }, "d"] }
  ]
}
```

**Output**

```json
{
  "satisfiable": true,
  "assignment": {
    "a": true,
    "b": true,
    "c": false,
    "d": true
  },
  "unique": true
}
```

Evaluating each rule under `{ a: true, b: true, c: false, d: true }` confirms that `"a"`, `implies(a, b)`, `xor(b, c)`, and `implies(and(a, not(c)), d)` all hold, and no other truth vector over `["a", "b", "c", "d"]` satisfies all four rules, so both `satisfiable` and `unique` are `true`.


<!-- section:hint1 -->
Declare one Boolean variable per entry in `vars` and add every rule to the model. Solve once to find an initial satisfying assignment; if one exists, exclude that exact truth vector and check whether a second satisfying assignment remains.

<!-- section:hint2 -->
Use `m.bool(input.vars)` and `await m.check({ solver: "z3" })` for the first satisfiability check. To block the found assignment `a`, add a no-good clause `or(...)` over all variables where each literal is `not(bools[v])` if `a[v]` is true and `bools[v]` otherwise, then re-run `m.check({ solver: "z3" })`—the solution is unique iff the second check returns `"Unsat"`.
