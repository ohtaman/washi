## Approach

Compute `input.a + input.b` directly and return `{ sum }` without building a solver model.

## Mathematical Model

$$
\text{sum} = a + b
$$

## Key Points

- In every exercise, the judge calls the `solve` function in the editor once per test case and checks the **returned** object rather than console output.
- Running the untouched starter returns `0`, which produces **VIOLATION**; updating it to return `a + b` passes all cases with **AC**.
- Before moving on to **#001**, you can review decision variables, constraints, and verdicts in the [Guide & Glossary](?view=guide&lang=en#solve-contract).

## Key Implementation

**WaSHI (TypeScript)**

```ts
return { sum: input.a + input.b };
```

**Python (highspy)**

```python
return {"sum": input_data["a"] + input_data["b"]}
```
