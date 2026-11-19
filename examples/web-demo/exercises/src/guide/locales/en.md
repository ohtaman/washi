# Optimization Guide & Glossary

A concise reference for reading problem statements, building optimization models, and interpreting judge verdicts across **Optimization 100**.

## 1. How Judging Works (`solve(input)`) {#solve-contract}

- Every exercise asks you to implement a single function: `solve(input)` in **WaSHI (TypeScript)** or `solve(input_data)` in **Python (highspy)**.
- WaSHI itself is a TypeScript / JavaScript library (not a Python package); **Python (highspy)** runs the official HiGHS Python bindings inside Pyodide so Python users can practice in the browser and compare idioms side by side.
- Pressing **Run & Judge** calls your function once per test case with a JSON input object and checks the object (or Python `dict`) you return.
- Solving an exercise in **either** runtime marks it solved (`✓`). Console logs are shown for debugging, while grading always inspects the return value.

## 2. Core Building Blocks {#building-blocks}

| Term | Meaning | WaSHI (TS) | highspy (Python) |
| --- | --- | --- | --- |
| **Decision Variable** | An unknown quantity chosen by the solver to maximize or minimize the objective. | `m.continuous(...)` / `m.integer(...)` / `m.binary(...)` | `h.addVariable(...)` / `h.addIntegral(...)` / `h.addBinary(...)` |
| **Bounds** | Lower (`lb`) and upper (`ub`) limits on a single variable (for example $x \ge 0$). | `{ lb: 0, ub: cap }` | `lb=0.0, ub=cap` |
| **Linear Expression** | A weighted sum of variables plus an optional constant, such as $2x + 3y$. | ``expr`2 * ${x} + 3 * ${y}` `` or `dot(...)` | `2 * x + 3 * y` or `h.qsum(...)` |
| **Constraint** | A rule (`<=`, `>=`, `==`) every valid solution must satisfy. | ``m.constraint(expr`... <= ...`)`` | `h.addConstr(...)` |
| **Objective** | The scalar quantity to minimize or maximize. | `m.objective(maximize(...))` / `minimize(...)` | `h.maximize(...)` / `h.minimize(...)` |

### Variable Types {#variable-types}

- **Continuous (`continuous`)**: Any real number within its bounds (e.g., `12.5` liters). Used in Linear Programming (**LP**).
- **Integer (`integer`)**: Whole numbers only (`0, 1, 2, ...`). Introduces branching (**MIP**).
- **Binary (`binary`)**: Only `0` or `1` (yes/no decisions). A special case of an integer variable with `0 <= x <= 1`.

## 3. Judge Verdicts & Solver Statuses {#verdicts}

| Verdict | Meaning | Typical Cause |
| --- | --- | --- |
| **AC** | Accepted — feasible and optimal on all test cases. | All constraints satisfied and objective matches optimal within tolerance. |
| **SUBOPTIMAL** | Feasible solution, but objective is worse than optimal. | Wrong optimization sense (`minimize` vs `maximize`), wrong objective coefficient, or extra overly tight constraint. |
| **VIOLATION** | Returned solution breaks a problem rule. | A constraint or bound is missing, reversed (`<=` vs `>=`), or integer rounding changed feasibility. |
| **INFEASIBLE** | No assignment satisfies all constraints simultaneously. | Contradictory constraints (`x >= 10` and `x <= 5`), or missing solution feasibility. |
| **ERROR** | Code failed to run, forgot to solve, or returned missing/invalid fields. | Missing `await m.solve()`, runtime exception, `Unbounded` model, or wrong output key name. |

### Solver Status Glossary {#solver-status}

- **Optimal**: The solver proved no better feasible solution exists.
- **Feasible**: A valid solution satisfies all constraints (used when checking feasibility or before optimality proof completes).
- **Infeasible**: Constraints contradict each other; the feasible region is empty.
- **Unbounded**: The objective can improve infinitely (`+Inf` or `-Inf`), usually because a capacity constraint or `lb`/`ub` is missing.
- **NotSolved**: `solve()` was never called before reading `.value` / `objectiveValue`.

## 4. Problem Families {#paradigms}

- **LP (Linear Programming)**: Linear objective and linear constraints over continuous variables. Solved directly at a corner point (vertex) of the feasible polytope without integer branching.
- **MIP (Mixed-Integer Programming)**: LP extended with `integer` or `binary` variables to model indivisible units, yes/no selection, or fixed-charge activation (**Big-M**).
- **CP / SMT**: Constraint Programming and Satisfiability Modulo Theories for combinatorial scheduling, logical rules, and conflict diagnosis (covered in later chapters).
