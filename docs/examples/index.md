# Recipes & Examples

Explore complete, production-ready optimization formulations implemented with WaSHI.

---

## 📚 Problem Catalog

| Example | Problem Class | Solver | Description |
| :--- | :--- | :--- | :--- |
| [01: Production Planning](./production.md) | **LP** | HiGHS | Optimal product mix given material, labor, and machine limits. |
| [02: Knapsack Problem](./knapsack.md) | **MIP / Binary** | HiGHS | Selecting high-value items subject to a weight capacity. |
| [03: Portfolio Optimization](./portfolio-qp.md) | **QP (Quadratic)** | HiGHS | Markowitz mean-variance risk minimization with return constraints. |
| [04: SMT Security Policies](./smt-security.md) | **SMT Logic** | Z3 | Formal verification of firewall and IAM role rules. |
| [05: Conflict Diagnosis](./unsat-core.md) | **Unsat Core** | Z3 | Pinpointing contradictory constraints in infeasible models. |

---

## Running Examples Locally

All example files are located in the repository under `examples/node/`:

```bash
# Run Production Planning
npx tsx examples/node/01-production-planning.ts

# Run Knapsack
npx tsx examples/node/02-knapsack-problem.ts

# Run Portfolio Optimization
npx tsx examples/node/03-portfolio-qp.ts
```
