# #041. Zebra Logic Grid Puzzle

<!-- section:scenario -->
This is a logic grid puzzle where attributes (such as house colors, pets, and drinks) are assigned to positions ordered from left to right.

A valid assignment must satisfy all of the following rules:
- **One value per category at each position**: Every position receives exactly one attribute value from each category.
- **No duplicate values**: Each value within a category appears at exactly one position.
- **Clue satisfaction**: All given clues (fixed positions, matching positions, implications, forbidden pairings, and left-of or adjacent relationships) must hold.

Given the number of positions, the category value lists, and the clue list, decide whether a valid assignment exists and, when satisfiable, return one complete grid assignment.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `n` | `number` | Number of positions (0 through `n - 1` from left to right) |
| `categories` | `Record<string, string[]>` | Map from each category name to its `n` distinct attribute values |
| `clues` | `ZebraClue[]` | Structured clues (`at`, `same`, `implies`, `notTogether`, `leftOf`, `nextTo`) |

Where `CategoryValue` is `[category: string, value: string]`, each `ZebraClue` is one of:
- `{ type: "at", position: number, category: string, value: string }` (`value` of `category` is placed at 0-based `position`)
- `{ type: "same", a: CategoryValue, b: CategoryValue }` (`a` and `b` occupy the same position)
- `{ type: "implies", a: CategoryValue, b: CategoryValue }` (if `a` appears at a position, `b` also appears at that position)
- `{ type: "notTogether", a: CategoryValue, b: CategoryValue }` (`a` and `b` cannot occupy the same position)
- `{ type: "leftOf", left: CategoryValue, right: CategoryValue, immediate?: boolean }` (`immediate: true` means `pos(right) === pos(left) + 1`; otherwise—default `false`—`pos(left) < pos(right)`)
- `{ type: "nextTo", a: CategoryValue, b: CategoryValue }` (`|pos(a) - pos(b)| === 1`)

### Output

| Field | Type | Description |
| --- | --- | --- |
| `satisfiable` | `boolean` | `true` if a valid assignment satisfies all clues, else `false` |
| `assignment` | `Array<Record<string, string>>` or `null` | Length-`n` array mapping each category to its assigned value at each position, or `null` when unsatisfiable |

<!-- section:example -->
**Input**

```json
{
  "n": 3,
  "categories": {
    "color": ["red", "blue", "green"],
    "pet": ["cat", "dog", "bird"],
    "drink": ["tea", "coffee", "water"]
  },
  "clues": [
    { "type": "at", "position": 0, "category": "color", "value": "red" },
    { "type": "same", "a": ["color", "red"], "b": ["drink", "tea"] },
    { "type": "leftOf", "left": ["color", "green"], "right": ["color", "blue"], "immediate": true },
    { "type": "implies", "a": ["color", "blue"], "b": ["pet", "dog"] },
    { "type": "nextTo", "a": ["pet", "cat"], "b": ["drink", "water"] },
    { "type": "notTogether", "a": ["color", "green"], "b": ["drink", "coffee"] }
  ]
}
```

**Output**

```json
{
  "satisfiable": true,
  "assignment": [
    { "color": "red", "pet": "cat", "drink": "tea" },
    { "color": "green", "pet": "bird", "drink": "water" },
    { "color": "blue", "pet": "dog", "drink": "coffee" }
  ]
}
```

Position 0 is red with cat and tea, position 1 is green with bird and water, and position 2 is blue with dog and coffee, satisfying every exact-one rule and all six clues.


<!-- section:hint1 -->
Represent each possible assignment of a category value to a position as a Boolean decision variable. Enforce two groups of exact-one rules: every position gets one value per category, and every value appears at one position. Then translate each clue type into logical relationships over those position-indexed Booleans.

<!-- section:hint2 -->
Create Boolean variables with `m.bool(...)`, and write a helper that enforces exact-one using `or(...)` for at-least-one and pairwise `not(and(...))` for at-most-one. Use `implies(...)` for `same`, `implies`, `leftOf`, and `nextTo` clues, and call `await m.check({ solver: "z3" })` to check `"Sat"`.
