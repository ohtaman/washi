# #041. Zebra Logic Grid Puzzle

<!-- section:scenario -->
A row of houses or seats indexed from left to right must each be assigned exactly one attribute value from every category, with each value appearing at most once across all positions. A list of structured clues restricts where values sit, which pairs share a position, which pairs are forbidden together, and which values lie to the left of or next to another.

Given the number of positions, the category value lists, and the clue list, decide whether a valid assignment exists and, when satisfiable, return one complete grid assignment.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `n` | `number` | Number of positions (`0` through `n - 1` from left to right) |
| `categories` | `Record<string, string[]>` | Map from each category name to its `n` distinct attribute values |
| `clues` | `ZebraClue[]` | Structured clues (`at`, `same`, `implies`, `notTogether`, `leftOf`, `nextTo`) |

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

House `0` is red with cat and tea, house `1` is green with bird and water, and house `2` is blue with dog and coffee, satisfying every exact-one and positional clue.


<!-- section:hint1 -->
Represent each possible assignment of a category value to a position as a Boolean decision variable. Enforce two groups of exact-one rules: every position gets one value per category, and every value appears at one position. Then translate each clue type into logical relationships over those position-indexed Booleans.

<!-- section:hint2 -->
Create Boolean variables with `m.bool(...)`, and write a helper that enforces exact-one using `or(...)` for at-least-one and pairwise `not(and(...))` for at-most-one. Use `implies(...)` for `same`, `implies`, `leftOf`, and `nextTo` clues, and call `await m.check({ solver: "z3" })` to check `"Sat"`.
