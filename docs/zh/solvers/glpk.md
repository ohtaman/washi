# GLPK 求解器引擎

**GNU Linear Programming Kit（GLPK）** 是一款开源单纯形法与分支切割法求解器，用于求解线性规划（LP）和混合整数规划（MIP）问题。

---

## 何时选择 GLPK 与 HiGHS

| 场景 | 推荐求解器 | 原因 |
| :--- | :--- | :--- |
| **常规 LP 或 MIP 优化** | **[HiGHS](./highs.md)**（默认） | MIT 许可内置，MIP 更快，支持 Web Worker、热启动及完整 LP 对偶值/松弛量/缩减成本。 |
| **学术基准测试或交叉验证 GLPK 模型** | **GLPK**（`@ohtaman/washi/solvers/glpk`） | 适合复现 GNU GLPK 5.0 行为或在不同求解器之间交叉核对既有模型。 |

---

## 安装

GLPK 通过 `glpk.js` 作为可选的 peer dependency 提供：

```bash
npm install glpk.js
```

---

## 许可证注意事项 (GPL-3.0)

GLPK 采用 **GNU 通用公共许可证 v3.0（GPL-3.0）** 授权：

- 由于 WaSHI 本体采用 MIT 许可证，`glpk.js` **不会静态打包**在核心包中。
- 仅在显式导入 `@ohtaman/washi/solvers/glpk` 时才会动态加载。
- 若在分发的产品中包含 GLPK，请确认项目的分发方式符合 GPL-3.0 许可要求。

---

## 基本用法

导入一次 `@ohtaman/washi/solvers/glpk` 即可注册 `"glpk"` 求解器，随后即可使用标准 `Model` API 构建并求解 LP 或 MIP 模型：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);      // Optimal
console.log("Objective:", model.objectiveValue); // 40
console.log("Shadow price:", cap.dual);          // 2
```

---

## 求解器选项与执行模型

GLPK 不支持 WaSHI 的 `useWorker: true` 选项，传入时会直接抛出 `Error`（在浏览器中 `glpk.js` 会自动使用其内置的 Web Worker，而在 Node.js 中则在主线程同步执行）。在所有环境中，`signal` 仅在求解开始前检查，无法中断正在运行的求解。

### 支持的选项

| 选项 | 类型 | 说明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大求解时间（秒，`tmlim`）。 |
| `relativeGap` | `number` | 相对 MIP 最优间隙容差（`mipgap`）。 |
| `presolve` | `"on" \| "off" \| "choose"` | 控制 GLPK 预处理（`"off"` 关闭，`"on"` 和 `"choose"` 开启）。 |
| `verbose` | `boolean` | 开启 GLPK 控制台日志输出（默认 `false`）。 |
| `relax` | `boolean` | 求解 MIP 模型的连续 LP 松弛问题。 |
| `signal` | `AbortSignal` | 仅在求解开始前检查取消状态（无法中断运行中的同步求解）。 |
| `onProgress` | `(ev) => void` | 在 MIP 分支切割回调中触发，或在求解结束时回调一次。 |

### 不支持的选项与特性（运行时抛出异常）

- **`outputFlag`**：抛出 `Error`，请改用 `verbose: true`。
- **其他不支持的选项**：`absoluteGap`、`threads`、`useWorker: true` 及未知选项键都会抛出 `Error`。
- **不支持的模型特性**：设置 `initialValue` 热启动或 `QuadExpr` 二次目标函数会抛出 `Error`。

---

## 结果语义与状态映射

### 求解器状态

GLPK 返回码严格映射为 WaSHI 的 `SolverStatus`：

| GLPK 状态码 | WaSHI 状态 | 含义 |
| :--- | :--- | :--- |
| `GLP_OPT` (5) | `"Optimal"` | 找到已证明的最优解。 |
| `GLP_FEAS` (2) | `"Feasible"` | 找到可行解（尚未证明最优性）。 |
| `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) | `"Infeasible"` | 模型无可行解。 |
| `GLP_UNBND` (6) | `"Unbounded"` | 目标函数无界。 |
| `GLP_UNDEF` (1) / 其他 | `"Unknown"` | 未定义或未识别（绝不映射为 `"Optimal"`）。 |

### 解的可用性

- 仅当状态为 `"Optimal"` 或 `"Feasible"` 时，才会填充 `model.values`、`var.value` 与 `model.objectiveValue`。
- 当状态为 `"Infeasible"`、`"Unbounded"`、`"Unknown"` 或 `"Error"` 时，`model.objectiveValue` 与各变量取值保持为 `null`。

### LP 与 MIP 的区别

- **线性规划（LP）**：使用单纯形法求解。最优解的灵敏度信息仅填充约束对偶值（`c.dual`）；`c.slack` 与 `v.reducedCost` 始终为 `null`。
- **混合整数规划（MIP）**：使用分支切割法求解。MIP 不产生 LP 对偶值，且 `glpk.js` 不暴露 MIP 的对偶界或最优间隙，因此 `objectiveBound`、`relativeGap` 与 `absoluteGap` 保持为 `undefined`。
