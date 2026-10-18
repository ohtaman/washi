# GLPK 求解器引擎

**GNU Linear Programming Kit (GLPK)** 是一套历史悠久、成熟稳健的单纯形法与内点法求解器软件包，专门用于求解大规模线性规划（LP）和混合整数规划（MIP）问题。

---

## 安装

GLPK 通过 `glpk.js` 作为可选的 peer dependency 提供：

```bash
npm install glpk.js
```

---

## 许可证注意事项 (GPL-3.0)

GLPK 采用 **GNU 通用公共许可证 v3.0 (GPL-3.0)** 授权。

- 由于 WaSHI 本体采用 MIT 许可证，`glpk.js` **绝不会静态打包**在核心发布包中。
- 仅当你显式导入或调用 `@ohtaman/washi/solvers/glpk` 时，它才会被动态加载。
- 当你在分发的产品中包含 GLPK 时，请确保项目的分发策略符合 GPL-3.0 许可证的要求。

---

## 基本用法

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);
console.log("Objective:", model.objectiveValue);
```

---

## 结果语义与状态映射

### 求解器状态映射
GLPK 的返回码严格映射为 WaSHI 的 `SolverStatus`：
- `GLP_OPT` (5) $\to$ `"Optimal"`
- `GLP_FEAS` (2) $\to$ `"Feasible"`（已找到可行的 MIP 整数解）
- `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) $\to$ `"Infeasible"`
- `GLP_UNBND` (6) $\to$ `"Unbounded"`
- `GLP_UNDEF` (1) 及未识别/缺失的状态 $\to$ `"Unknown"`（绝不会被误判为 `"Optimal"`）

### 解的可用性
- 仅当存在有效的原始可行解（状态为 `"Optimal"` 或 `"Feasible"`）时，才会暴露变量取值（`model.values`、`var.value`）和目标函数值（`model.objectiveValue`）。
- 对于求解失败或无可行解的情况（`Infeasible`、`Unbounded`、`Unknown`、`Error`），`model.objectiveValue` 为 `null`，且各变量的 `value` 保持为 `null`，不会捏造虚假的全零解。

### LP 与 MIP 的区别
- **线性规划 (LP)**：使用单纯形法求解。对于最优解，会填充约束的对偶值（影子价格，通过 `constraint.dual` 访问）和松弛量（`constraint.slack`）。
- **混合整数规划 (MIP)**：使用分支切割法（branch-and-cut）求解，生成满足整数约束的原始变量解；由于离散优化中对偶值在数学上未定义，因此省略对偶值。
