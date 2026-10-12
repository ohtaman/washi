# GLPK Solver Engine

The **GNU Linear Programming Kit (GLPK)** is a long-standing, robust simplex and interior-point solver package intended for solving large-scale linear programming (LP) and mixed integer programming (MIP).

---

## Installation

GLPK is provided as an optional peer dependency via `glpk.js`:

```bash
npm install glpk.js
```

---

## Licensing Consideration (GPL-3.0)

GLPK is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

- Because WaSHI is MIT-licensed, `glpk.js` is **never bundled statically** in the core package.
- It is dynamically imported only if you explicitly register or invoke `@ohtaman/washi/solvers/glpk`.
- Ensure your project's distribution requirements comply with the GPL-3.0 license when shipping products that bundle GLPK.

---

## Basic Usage

```typescript
import { Model, expr, c } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.maximize(expr`3 * ${x} + 2 * ${y}`);
model.constrain(c`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);
console.log("Objective:", model.objectiveValue);
```
