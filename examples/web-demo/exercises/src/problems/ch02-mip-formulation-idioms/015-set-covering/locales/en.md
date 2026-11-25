# #015. Minimum-Cost Set Covering

<!-- section:scenario -->
A security operations center is deploying monitoring packages to protect a set of critical system components. Each candidate package has a fixed licensing cost and monitors a specified subset of components, and overlapping coverage across chosen packages is permitted.

Select a subset of monitoring packages so that every component is monitored by **at least one** chosen package while **minimizing total licensing cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numElements` | `number` | Number of components indexed 0 through `numElements - 1` |
| `costs` | `number[]` | Licensing cost of selecting each candidate package |
| `sets` | `number[][]` | Components covered by each candidate package |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) choices for each candidate package |
| `totalCost` | `number` | Minimized total licensing cost |

<!-- section:example -->
**Input**

```json
{
  "numElements": 5,
  "costs": [7, 4, 5, 6, 8],
  "sets": [
    [0, 1, 2],
    [0, 3],
    [1, 2, 4],
    [2, 3, 4],
    [0, 1, 3, 4]
  ]
}
```

**Output**

```json
{
  "selected": [0, 1, 1, 0, 0],
  "totalCost": 9
}
```

Selecting packages 1 (`[0, 3]`) and 2 (`[1, 2, 4]`) covers every component `{0, 1, 2, 3, 4}` at least once for total cost $4 + 5 =$ **9**.

<!-- section:hint1 -->
Model each candidate package with a binary selection variable. The model has one coverage constraint per component, ensuring that at least one package covering that component is chosen, while minimizing total licensing cost.

<!-- section:hint2 -->
Transpose the incidence relationship: instead of iterating over `sets[j]`, iterate over each component $i \in \{0, \dots, \text{numElements} - 1\}$ and collect the binary variables `selected[j]` for all packages $j$ that include $i$, constraining their sum to be $\ge 1$.
