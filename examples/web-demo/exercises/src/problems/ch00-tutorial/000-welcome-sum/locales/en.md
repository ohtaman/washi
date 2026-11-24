# #000. Practice: Sum Two Numbers

<!-- section:scenario -->
Given two numbers `a` and `b`, implement a `solve` function that returns their sum.

In every exercise in this workbook, you implement a `solve` function and the judge evaluates its return value (no optimization solver is needed for this practice exercise—just compute and return the sum directly):

- TypeScript: implement `solve(input: P000Input): Promise<P000Output>` that takes `P000Input` and returns a `P000Output` object.
- Python: implement `solve(a: int, b: int) -> dict[str, int]` that receives each input field as a `snake_case` argument and returns a `dict` matching Output below.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `a` | `number` | First integer |
| `b` | `number` | Second integer |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `sum` | `number` | Sum of `a` and `b` |

<!-- section:example -->
**Input**

```json
{
  "a": 2,
  "b": 3
}
```

**Output**

```json
{
  "sum": 5
}
```
