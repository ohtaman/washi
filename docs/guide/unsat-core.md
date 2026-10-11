# Conflict Diagnosis (`unsatCore`)

In mathematical optimization, encountering an **Infeasible** problem is one of the most frustrating experiences: the solver simply reports that no solution exists, giving no indication of *which* constraints are contradictory.

WaSHI solves this by integrating with the **Z3 SMT engine** to automatically compute an **Unsatisfiable Core (Unsat Core)**—the minimal subset of mutually contradictory constraints.

---

## 🔍 How It Works

When a model is solved, you can request an Unsat Core analysis:

```typescript
import { Model, c, expr } from "@ohtaman/washi";
// Ensure z3-solver peer dependency is installed: npm i z3-solver
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });

const x = m.addVar({ lb: 0 });

// Add contradictory business requirements
m.addConstraint(c`${x} >= 100`, "minimum_regulatory_reserve");
m.addConstraint(c`${x} <= 50`, "budget_ceiling");
m.addConstraint(c`${x} >= 10`, "routine_operating_cost");

const result = await m.solve({ computeUnsatCore: true });

if (m.status === "Infeasible") {
  console.log("Contradictory constraints identified:");
  console.log(m.unsatCore);
  // Output: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

Notice that `routine_operating_cost` is **not** in the core, because only `minimum_regulatory_reserve` ($x \ge 100$) and `budget_ceiling` ($x \le 50$) directly contradict each other.

---

## 💼 Real-World Use Cases

1. **Shift / Staff Scheduling**:
   - Nurse A cannot work night shifts, but hospital regulation requires at least 2 staff, while only Nurse A is available.
   - The diagnosis points directly to the conflict rather than crashing the scheduling app.
2. **Access Control & Security Policies**:
   - Finding contradictory IAM firewall rules or conflicting role assignments.
3. **Interactive Configuration Engines**:
   - Product configurators (e.g., custom cars, computers) where customer selections violate manufacturing rules.
