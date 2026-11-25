# #018. University Degree & Prerequisite Course Planner

<!-- section:scenario -->
A university student is planning which courses to take next semester. Each candidate course offers an interest score and requires a specific amount of multiple limited workload categories (such as weekly study hours, lab slots, and credit limits).

Your course plan must satisfy all of the following rules:
- **Workload caps**: Total usage of each workload category (study hours, lab slots, credits, etc.) cannot exceed its cap.
- **Prerequisites**: Taking a course that has a prerequisite requires taking its prerequisite course as well.
- **Time conflicts**: Courses whose schedules overlap cannot both be taken.

Choose a subset of courses to **maximize total interest** while satisfying all rules.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `interest` | `number[]` | Interest score of each candidate course |
| `requirements` | `number[][]` | Workload matrix where `requirements[k][j]` is the amount of category $k$ workload used by course $j$ |
| `caps` | `number[]` | Maximum allowed total for category $k$ |
| `prerequisites` | `number[][]` | Pairs `[prereq, course]` requiring `prereq` whenever `course` is taken |
| `timeConflicts` | `number[][]` | Pairs `[a, b]` of courses that cannot both be taken due to overlapping schedules |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `take` | `number[]` | Binary (0 or 1) enrollment choices per course |
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

Taking courses 0, 3, and 4 uses $5 + 5 + 3 = 13 \le 13$ in category 0 and $3 + 4 + 6 = 13 \le 13$ in category 1, satisfies prerequisite $0 \to 3$ and avoids time conflict (1, 2), and yields total interest $8 + 19 + 15 =$ **42**.

<!-- section:hint1 -->
Each candidate course is a binary selection variable. The model combines one capacity constraint per workload category with pairwise logical constraints for prerequisites and schedule conflicts.

<!-- section:hint2 -->
Each row `requirements[k]` corresponds to a separate knapsack capacity constraint against `caps[k]`. A prerequisite `[prereq, course]` linearizes as $x_{\text{course}} \le x_{\text{prereq}}$, and a time conflict `[a, b]` linearizes as $x_a + x_b \le 1$.
