# Optimization Guide & Glossary

A concise reference for reading problem statements, building optimization models, and interpreting judge verdicts across **Optimization 100**.

## 1. How Judging Works (`solve(input)`) {#solve-contract}

- Every exercise asks you to implement a single function: `solve(input)` in **WaSHI (TypeScript)** or `solve(input_data)` in **PuLP (Python)**.
- WaSHI itself is a TypeScript / JavaScript library (not a Python package); **PuLP (Python)** runs PuLP backed by HiGHS inside Pyodide so Python users can practice in the browser and compare idioms side by side.
- Pressing **Run & Judge** calls your function once per test case with a JSON input object and checks the object (or Python `dict`) you return.
- Solving an exercise in **either** runtime marks it solved (`✓`). Console logs are shown for debugging, while grading always inspects the return value.

## 2. Core Building Blocks {#building-blocks}

| Term | Meaning | WaSHI (TS) | PuLP (Python) |
| --- | --- | --- | --- |
| **Decision Variable** | An unknown quantity chosen by the solver to maximize or minimize the objective. | `m.continuous(...)` / `m.integer(...)` / `m.binary(...)` | `pulp.LpVariable(..., cat=pulp.LpContinuous / LpInteger / LpBinary)` |
| **Bounds** | Lower (`lb`) and upper (`ub`) limits on a single variable (for example $x \ge 0$). | `{ lb: 0, ub: cap }` | `lowBound=0, upBound=cap` |
| **Linear Expression** | A weighted sum of variables plus an optional constant, such as $2x + 3y$. | ``expr`2 * ${x} + 3 * ${y}` `` or `dot(...)` | `2 * x + 3 * y` or `pulp.lpSum(...)` |
| **Constraint** | A rule (`<=`, `>=`, `==`) every valid solution must satisfy. | ``m.constraint(expr`... <= ...`)`` | `prob += ... <= ...` |
| **Objective** | The scalar quantity to minimize or maximize. | `m.objective(maximize(...))` / `minimize(...)` | `LpProblem(..., LpMaximize / LpMinimize)` + `prob += ...` |

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

## 5. Related Documentation & Learning Resources {#resources}

Useful documentation, modeling cookbooks, open textbooks, and problem collections for going deeper beyond these exercises:

### Modeling Libraries & Solvers

- [WaSHI Getting Started](/getting-started/) & [Modeling Guide](/guide/formulation-tips) — Full TypeScript API, solver backends, and formulation tips for WaSHI.
- [Optimization with PuLP](https://coin-or.github.io/pulp/) — Official documentation for the Python algebraic modeler used in the `PuLP (Python)` tab.
- [HiGHS](https://highs.dev/) ([Docs](https://ergo-code.github.io/HiGHS/)) — Open-source LP/MIP/QP solver powering both WaSHI's default backend and `PuLP` here.
- [SciPy Optimization (`scipy.optimize`)](https://docs.scipy.org/doc/scipy/reference/optimize.html) — Reference for linear (`linprog`), MILP (`milp`), and nonlinear optimization in Python.
- [Google OR-Tools](https://developers.google.com/optimization) — Guides and examples for LP, MIP, vehicle routing, and the CP-SAT solver.
- [JuMP Documentation](https://jump.dev/JuMP.jl/stable/) — Modeling language documentation in Julia with rich LP/MIP/nonlinear formulation examples.
- [The MiniZinc Handbook](https://docs.minizinc.dev/en/stable/) — Comprehensive guide to constraint programming (CP) modeling and global constraints.
- [Pumpkin](https://github.com/ConSol-Lab/Pumpkin) — Lazy clause generation constraint programming solver used as WaSHI's CP backend.
- [Online Z3 Guide](https://microsoft.github.io/z3guide/) — Interactive tutorial and reference for SMT and constraint solving with Z3.

### Textbooks, Formulation Guides & Problem Libraries

- [MOSEK Modeling Cookbook](https://docs.mosek.com/modeling-cookbook/index.html) — Standard reference on linear, Big-M, quadratic, and conic optimization formulations.
- [Hands-On Mathematical Optimization with Python (`MO-book`)](https://mobook.github.io/MO-book/) — Open textbook with interactive Jupyter notebooks covering LP, network flows, convex optimization, and MIP.
- [Convex Optimization — Boyd & Vandenberghe](https://web.stanford.edu/~boyd/cvxbook/) — Classic Stanford textbook on convex optimization and convex QP (free PDF).
- [Cornell Computational Optimization Open Textbook](https://optimization.cbe.cornell.edu/index.php?title=Main_Page) — Open wiki textbook covering LP, MIP, integer formulations, and solution methods.
- [NEOS Guide](https://neos-guide.org/) — Overview and taxonomy of linear, integer, network, and nonlinear optimization.
- [SCMOPT `opt100` (Python Applied Optimization 100+)](https://scmopt.github.io/opt100/) — Companion online textbook and formulation guide for *Python Applied Optimization 100+*, covering graphs, logistics, and scheduling (in Japanese).
- [CSPLib](https://www.csplib.org/) — Benchmark library of classic constraint programming and combinatorial optimization problems.
