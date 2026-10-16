# Conflict Diagnosis (`unsatCore`)

In mathematical optimization, encountering an **Infeasible** problem is one of the most frustrating experiences: the solver simply reports that no solution exists, giving no indication of *which* constraints are contradictory.

WaSHI solves this by integrating with the **Z3 SMT engine** to automatically compute an **Unsatisfiable Core (Unsat Core)**—a conflicting subset of mutually contradictory constraints.

---

## 🔍 How It Works

When diagnosing an infeasible model, use `m.check()` or `m.solve()` with Z3:

```typescript
import { Model, expr } from "@ohtaman/washi";
// Ensure z3 solver plugin is imported
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });

const x = m.continuous("reserve", { lb: 0 });

// Add contradictory business requirements
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("Contradictory constraints identified:");
  console.log(m.conflicts); // or result.conflicts / m.unsatCore
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
