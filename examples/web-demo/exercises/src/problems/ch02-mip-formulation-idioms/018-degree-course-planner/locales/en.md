# #018. University Degree & Prerequisite Course Planner

<!-- section:scenario -->
A university student is planning which courses to take next semester. Each candidate course offers an interest score and consumes amounts of two or more limited workload categories, such as weekly study hours, lab slots, and credit limits.

Degree rules also impose prerequisite pairs where taking an advanced course requires taking its prerequisite course, as well as time-conflict pairs whose schedules overlap and cannot be taken together. Choose a subset of courses to **maximize total interest** while respecting every category cap, prerequisite, and schedule conflict.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `interest` | `number[]` | Interest score of each candidate course |
| `requirements` | `number[][]` | Workload matrix where `requirements[k][j]` is category $k$ load of course $j$ |
| `caps` | `number[]` | Maximum allowed total for each workload category $k$ |
| `prerequisites` | `number[][]` | Pairs `[prereq, course]` requiring `prereq` whenever `course` is taken |
| `timeConflicts` | `number[][]` | Pairs `[a, b]` of courses that cannot both be taken due to overlapping schedules |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `take` | `number[]` | Binary (`0` or `1`) enrollment choices per course |
| `totalInterest` | `number` | Maximized total interest score |

<!-- section:example -->
**Input**

```json
{
  "interest": [8, 24, 22, 19, 15],
  "requirements": [
    [5, 6, 4, 5, 3],
    [3, 6, 5, 4, 6]
  ],
  "caps": [13, 13],
  "prerequisites": [[0, 3]],
  "timeConflicts": [[1, 2]]
}
```

**Output**

```json
{
  "take": [1, 0, 0, 1, 1],
  "totalInterest": 42
}
```

Taking courses `{0, 3, 4}` uses `5 + 5 + 3 = 13 <= 13` in category 0 and `3 + 4 + 6 = 13 <= 13` in category 1, satisfies prerequisite `0 -> 3` and avoids time conflict `[1, 2]`, and yields total interest $8 + 19 + 15 =$ **42**.

<!-- section:hint1 -->
Each candidate course is a binary selection variable. The model combines one capacity constraint per workload category with pairwise logical constraints for prerequisites and schedule conflicts.

<!-- section:hint2 -->
Each row `requirements[k]` corresponds to a separate knapsack capacity constraint against `caps[k]`. A prerequisite `[prereq, course]` linearizes as $x_{\text{course}} \le x_{\text{prereq}}$, and a time conflict `[a, b]` linearizes as $x_a + x_b \le 1$.
