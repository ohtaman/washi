# Formulation Patterns & Optimization Tips

While the preceding Modeling Guide pages cover WaSHI's APIs (`Model`, `expr`, `m.constraint`, `m.solve`, etc.), this page collects standard mathematical optimization formulation patterns and solver tuning techniques frequently used in linear and mixed-integer programming (LP/MIP).

---

## 1. Variables & Domain Modeling

### Semi-Continuous Decisions ($\{0\} \cup [L, U]$)

A semi-continuous quantity must be either `0` (inactive) or within a positive interval `[L, U]` (e.g., a production batch with a minimum run size $L = 10$ and capacity $U = 100$).

Combine a continuous variable `x` with a binary activation variable `isActive` and linking constraints $L \cdot b \le x \le U \cdot b$:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SemiContinuousBatch");
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// If isActive === 0, batch is forced to 0; if isActive === 1, batch lies in [10, 100]
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

### Minimal-Perturbation Rescheduling vs. Warm Starting

When re-optimizing an existing schedule after a disruption, passing yesterday's assignment via [`initialValue`](./variables.md#primal-initial-values-warm-start-hints) only gives the MIP solver a starting search point—it does **not** prevent the solver from changing every assignment for a tiny objective gain.

To keep a revised binary plan $x_i \in \{0, 1\}$ close to a baseline assignment $x_i^{\text{prev}} \in \{0, 1\}$, penalize the **Hamming distance** (number of flipped decisions) in the objective:

$$\text{Changes} = \sum_{i:\, x_i^{\text{prev}} = 0} x_i + \sum_{i:\, x_i^{\text{prev}} = 1} (1 - x_i)$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("StableReschedule");
const prevPlan = [1, 0, 1, 0];
const x = prevPlan.map((prev, i) =>
  m.binary(`slot_${i}`, { initialValue: prev })
);

// Linear terms counting how many 0/1 decisions differ from prevPlan
const flipTerms = x.map((v, i) => (prevPlan[i] === 1 ? expr`1 - ${v}` : v));

// Require at least 3 active slots while penalizing changes from prevPlan
m.constraint(expr`sum(${x}) >= 3`, "min_active_slots");
m.objective(minimize(expr`5 * sum(${flipTerms})`));
```

---

## 2. Linearizing Non-Linear Expressions

### Product of Two Binary Variables ($x_A \cdot x_B$)

In integer programming, if an interaction cost or synergy bonus applies only when two binary decisions $x_A, x_B \in \{0, 1\}$ are **both** equal to `1`, avoid introducing a quadratic term. Instead, introduce an auxiliary variable $z_{AB} \in [0, 1]$ and add the three standard McCormick / Fortet linear inequalities so the model remains a pure MILP:

$$z_{AB} \le x_A, \quad z_{AB} \le x_B, \quad z_{AB} \ge x_A + x_B - 1$$

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("BinaryProductLinearization");
const xA = m.binary("xA");
const xB = m.binary("xB");
// When xA and xB are binary, continuous [0, 1] bounds suffice to force bothAB into {0, 1}
const bothAB = m.continuous("both_AB", { lb: 0, ub: 1 });

m.constraint(expr`${bothAB} <= ${xA}`, "and_upper_A");
m.constraint(expr`${bothAB} <= ${xB}`, "and_upper_B");
m.constraint(expr`${bothAB} >= ${xA} + ${xB} - 1`, "and_lower_AB");

m.objective(maximize(expr`10 * ${xA} + 10 * ${xB} + 5 * ${bothAB}`));
```

### Min-Max & Max-Min Objectives (Load Balancing)

Linear and quadratic objectives cannot call `Math.max(...)` directly. To minimize a bottleneck or peak workload $\min \max_i (\text{load}_i)$, introduce an auxiliary ceiling variable $z$, constrain every individual load by $\text{load}_i \le z$, and minimize $z$:

$$\min z \quad \text{subject to} \quad \text{load}_i \le z \quad \forall i$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("MinMaxLoadBalancing");
const workers = ["Alice", "Bob", "Carol"] as const;
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

// Bound every worker's hours by the shared ceiling maxHours
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));
m.constraint(expr`sum(${hours}) >= 60`, "total_required_work");

// Minimizing maxHours distributes the 60 hours evenly (20 hours each)
m.objective(minimize(maxHours));
```

*(Symmetrically, to **maximize the minimum** level $\max \min_i u_i$, impose $u_i \ge z$ for all $i$ and set `m.objective(maximize(z))`.)*

---

## 3. Constraint Design & Numerical Conditioning

### Hard vs. Soft Constraints (Elastic Slack Variables)

Treating every business target as a strict **hard constraint** makes a model `"Infeasible"` as soon as demand exceeds capacity. Keep physical and legal invariants as hard constraints, and model non-rigid targets as **soft constraints** by adding non-negative slack variables ($s \ge 0$) with penalty weights $W$ in the objective:

| Target Type | Hard Constraint | Soft Constraint ($s \ge 0$) | Objective Penalty Term (Minimize) |
| :--- | :--- | :--- | :--- |
| **Lower bound** | $\text{lhs} \ge b$ | $\text{lhs} + s_{\text{short}} \ge b$ | $+ W \cdot s_{\text{short}}$ |
| **Upper bound** | $\text{lhs} \le b$ | $\text{lhs} - s_{\text{excess}} \le b$ | $+ W \cdot s_{\text{excess}}$ |
| **Target equality** | $\text{lhs} = b$ | $\text{lhs} + s_{\text{short}} - s_{\text{excess}} = b$ | $+ W_1 \cdot s_{\text{short}} + W_2 \cdot s_{\text{excess}}$ |

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("SoftConstraintCoverage");
const assignedStaff = m.integer("assigned_staff", { lb: 0, ub: 4 }); // Max 4 staff available
const shortage = m.continuous("shortage", { lb: 0 });                // Non-negative slack (s >= 0)

// Soft target: aim for 5 staff, allowing shortage > 0 if unavailable
m.constraint(expr`${assignedStaff} + ${shortage} >= 5`, "target_5_staff");

// Penalize unmet shortage ($1,000) above regular wage ($100)
m.objective(minimize(expr`100 * ${assignedStaff} + 1000 * ${shortage}`));

await m.solve();
// assignedStaff.value === 4, shortage.value === 1 (returns best compromise instead of Infeasible)
```

> [!TIP]
> **Scaling Penalty Weights ($W$)**: Choose $W$ larger than normal operational marginal costs (typically $10\times$ to $1{,}000\times$ unit cost), and avoid extreme constants such as $10^{12}$. Keeping the ratio between the largest and smallest coefficients within $10^5\text{–}10^6$ preserves floating-point numerical stability in LP/MIP solvers.

### Symmetry Breaking for Identical Resources

When a model contains $K$ interchangeable resources—such as identical trucks, bins, or parallel machines—any feasible assignment has up to $K!$ equivalent permutations with the exact same objective value. Without symmetry breaking, a MIP solver explores redundant mirror-image subtrees before proving optimality.

Impose a canonical ordering ($u_0 \ge u_1 \ge \dots \ge u_{K-1}$) so identical resources are activated in index order:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SymmetryBreaking");
const numTrucks = 4;
const truckUsed = m.binary(numTrucks, { prefix: "truck_used" });

// Only allow activating truck k+1 when truck k is also active
for (let k = 0; k < numTrucks - 1; k++) {
  m.constraint(
    expr`${truckUsed[k]} >= ${truckUsed[k + 1]}`,
    `order_truck_${k}`
  );
}
```

---

## 4. Multi-Objective & MIP Stopping Design

### Weighted Sum vs. Lexicographic Two-Stage Optimization

When balancing competing goals—such as minimizing total cost ($f_1$) while also minimizing peak workload ($f_2$)—two approaches are standard:

- **Weighted Sum (Single Solve)**: Combine normalized terms into one objective, e.g., ``minimize(expr`${totalCost} + 50 * ${maxHours}`)``.
- **Lexicographic (Hierarchical) Two-Stage Solve**: When the primary objective has strict priority, solve for $f_1$ first, add a constraint locking $f_1$ within an acceptable tolerance of its optimum $f_1^*$, and re-solve for $f_2$:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("LexicographicTwoStage");
const workers = ["Alice", "Bob"] as const;
const wage = { Alice: 20, Bob: 20 };
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

const totalCost = expr`dot(${wage}, ${hours})`;
m.constraint(expr`sum(${hours}) >= 40`, "required_hours");
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));

// Stage 1: Minimize primary objective (total wage cost)
m.objective(minimize(totalCost));
await m.solve();
const minCost = m.objectiveValue!;

// Stage 2: Keep cost within 1% of minCost and balance workload (minimize maxHours)
m.constraint(expr`${totalCost} <= ${minCost * 1.01}`, "near_optimal_cost");
m.objective(minimize(maxHours));
await m.solve();
```

### MIP Tail-Off & Optimality Gap Tolerances

In combinatorial MIP problems, solvers often find a near-optimal feasible solution within seconds, then spend most of the remaining runtime closing the final fraction of a percent in the branch-and-bound tree (**tail-off**).

In interactive UIs and batch pipelines, combine `timeLimit` with business-meaningful tolerances in [`m.solve(options)`](./objectives.md#solve-options-solveoptions):
- **`relGap: 0.01`**: Stop immediately once the incumbent is proven within **1%** of the theoretical dual bound.
- **`absGap: 100`**: Stop immediately once `|objectiveValue - objectiveBound| <= 100` in the objective's native units.

---

## 5. Decomposition Formulation Tips

When using [`solveColumnGeneration` or `solveBenders`](./decomposition.md):

1. **Set Covering (`>= 1`) vs. Set Partitioning (`== 1`) in Column Generation**:
   Formulating coverage constraints as inequalities (`>= 1`) rather than equalities (`== 1`) restricts dual shadow prices to $\pi_i \ge 0$, reducing dual oscillations and accelerating convergence whenever over-coverage can be pruned at no extra cost (e.g., Euclidean routing under the triangle inequality).
2. **Price-and-Branch (`finalizeAsMIP: true`) vs. Exact Branch-and-Price**:
   Solving the final Restricted Master Problem as a MIP over columns generated at the root LP relaxation (`finalizeAsMIP: true`) implements the **Price-and-Branch** heuristic—avoiding complex branching inside the pricing subproblem while producing high-quality integer solutions in practice.
3. **Multi-Cut Separation in Benders / Lazy Constraints**:
   When a separation callback detects multiple disconnected subtours or violated components in a candidate solution, returning cuts for **all** violated components in one batch reduces the number of master MIP re-solves (see [Traveling Salesperson (`examples/traveling-salesperson`)](../examples/traveling-salesperson.md)).
