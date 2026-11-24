# 目标函数与求解 (`m.solve` & `m.check`)

目标函数定义了数理优化的方向与目标，例如最大化利润、最小化成本或最小化二次风险方差。
如果只需验证约束可行性或求解纯逻辑规则，可以不设置目标函数，直接调用 `m.check()`。

---

## 设置目标函数

使用 `m.objective(maximize(...))` 或 `m.objective(minimize(...))` 声明式地设置优化方向和公式：

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0, ub: 40 });
const y = m.integer("y", { lb: 0, ub: 40 });

// 在资源容量约束下最大化营收：50*x + 40*y
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));
m.constraint(expr`2 * ${x} + 3 * ${y} <= 100`, "resource_limit");

// 或者最小化成本：
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

无参数调用 `m.objective()` 可读取当前目标函数表达式（`LinExpr | QuadExpr`）。
若未设置目标函数，模型默认最小化常数 `0`。

> [!TIP]
> 有关 Min-Max / Max-Min 负载均衡、多目标优化以及 MIP 停止间隙容差（`relativeGap` / `absoluteGap`）设计，请参见 [建模模式与优化技巧](./formulation-tips.md#multi-objective)。

---

## 求解模型 (`m.solve()` vs. `m.check()`)

WaSHI 提供两个异步执行入口：

| 方法 | 返回值 | 用途 |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | 在满足全部约束的前提下优化目标函数。自动填充变量的原问题解、目标值、MIP 边界与间隙，以及 LP 约束的对偶值与松弛量。 |
| **`await m.check(options?)`** | `Promise<CheckResult>` | 不带目标函数检查约束是否可满足。返回 `{ status, values, conflicts?, unsatCore?, runTime? }`，用于 CP/SMT 判定和冲突诊断。 |

```typescript
const status = await m.solve({
  timeLimit: 10.0,     // 超时时间（秒）
  relativeGap: 0.01,   // 距离全局最优解在 1% 以内时停止
  outputFlag: false,   // 启用/禁用求解器控制台日志输出（HiGHS: outputFlag, GLPK: verbose）
});
```

### 求解选项 (`SolveOptions`)

| 选项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `solver` | `string` \| `Solver` | 模型的求解器 (`"highs"`) | 本次运行使用的已注册求解器名称（`"highs"`、`"pumpkin"`、`"z3"`、`"glpk"` 或自定义名称）或 `Solver` 实例。 |
| `timeLimit` | `number` | `undefined` | 最大求解时间上限（秒）。 |
| `relativeGap` | `number` | `undefined` | 相对 MIP 最优性间隙容差（例如 `0.01` 表示 1%）。 |
| `absoluteGap` | `number` | `undefined` | 绝对 MIP 最优性间隙容差（HiGHS `mip_abs_gap`）。 |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | 控制优化前的求解器预处理（Presolve）化简策略。 |
| `outputFlag` / `verbose` | `boolean` | `false` | 输出求解器内部迭代日志（HiGHS 使用 `outputFlag`，GLPK 使用 `verbose`）。 |
| `useWorker` | `boolean` | `true`（仅浏览器） | 在浏览器中将 HiGHS 与 Pumpkin 卸载到 Web Worker 运行（Node.js 中忽略）。设为 `false` 则在浏览器主线程执行。 |
| `wasmUrl` | `string` | 自动解析 | 浏览器部署时加载 `highs.wasm` 或 `pumpkin.wasm` 的自定义 URL。 |
| `signal` | `AbortSignal` | `undefined` | 取消信号（`AbortController.signal`）；具体限制见下文。 |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | 接收实时求解进度快照的回调函数。 |

也可以将求解器名称直接作为第一个参数传入：`await m.solve("glpk", { timeLimit: 5 })`。

---

## 读取结果、边界与求解器状态

求解完成后，可在 `Model` 实例上读取状态、最优值以及 MIP 边界指标：

```typescript
const status = await m.solve();

console.log("Status:", m.status);                         // 例如 "Optimal" 或 "Feasible"
console.log("Termination Reason:", m.terminationStatus);  // 例如 "Optimal", "TimeLimit", "Interrupted"
console.log("Has Primal Solution:", m.hasPrimalSolution); // 当 x.value / m.objectiveValue 可用时为 true

// 目标函数与 MIP 间隙指标
console.log("Objective Value:", m.objectiveValue);        // 最佳原问题目标值 (或 null)
console.log("Objective Bound:", m.objectiveBound);        // 最佳对偶界 (或 undefined)
console.log("Relative Gap:", m.relativeGap);              // 相对 MIP 间隙
console.log("Absolute Gap:", m.absoluteGap);              // |objectiveValue - objectiveBound|

// 读取变量值（通过 .value 或按名称索引的 m.values ReadonlyMap）
console.log("x =", x.value, "y =", y.value);
console.log("x by name:", m.values.get("x"));
```

> [!TIP]
> 如需在容差范围内独立校验返回解是否满足所有变量边界、整数性与约束，请调用 `m.verify()`。
> 详见 [冲突诊断、验证与调试（`m.verify()`）](./unsat-core.md#verifying-solutions-m-verify)。

### 理解 `m.status` 与 `m.terminationStatus` 的区别

当 MIP 求解器因 `timeLimit`、迭代次数上限或 `AbortSignal` 提前停止时，需要区分两个问题：

1. **是否存在可用的可行解？** 检查 `m.hasPrimalSolution` 或 `m.status`。
2. **求解器为什么停止？** 检查 `m.terminationStatus`。

如果在停止前已找到有效解（即**暂定解 / Incumbent**），WaSHI 会将 `m.status` 设为 `"Feasible"`。
此时 `x.value` 与 `m.objectiveValue` 保存该可行解，而 `m.terminationStatus` 记录 `"TimeLimit"` 或 `"Interrupted"`。
若未找到任何解即停止，则 `m.hasPrimalSolution` 为 `false`，`m.status` 为 `"TimeLimit"`、`"IterationLimit"` 或 `"Unknown"`。

### 所有 `SolverStatus` 状态值一览

| 状态 | `hasPrimalSolution` | 含义 |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | 已在容差范围内证明找到全局最优解。 |
| `"Feasible"` | `true` | 已找到有效解，但在证明全局最优前停止（原因见 `terminationStatus`）。 |
| `"Sat"` | `true` | 约束集合可满足（`m.check()`）。 |
| `"Infeasible"` | `false` | 数学上已证明模型不可行；不存在同时满足所有约束的解。 |
| `"Unsat"` | `false` | 逻辑或算术约束集合不可满足（`m.check()`）。 |
| `"Unbounded"` | `false` | 在不违反任何约束的前提下，目标函数值可以无限优化（无界）。 |
| `"TimeLimit"` | `false` | 在找到任何原问题可行解之前已达到时间上限。 |
| `"IterationLimit"` | `false` | 在找到任何原问题可行解之前已达到迭代次数上限。 |
| `"Unknown"` | `false` | 未找到有效解即停止（例如在找到解前被 `AbortSignal` 取消）。 |
| `"Error"` | `false` | 求解器遇到内部执行错误。 |
| `"NotSolved"` | `false` | 求解前的初始状态，或模型被修改后已重置解状态。 |

---

## 实时进度回调 (`onProgress`) 与取消执行 (`AbortSignal`)

在交互式应用中运行耗时较长的 MIP 优化时，可通过 `onProgress` 接收分支定界法的实时进度，并通过 `AbortController` 取消求解：

```typescript
const controller = new AbortController();

// 示例：当用户点击“停止”按钮或满足自定义条件时取消求解
const status = await m.solve({
  signal: controller.signal,
  onProgress: (event) => {
    console.log(
      `[${event.elapsedTime.toFixed(1)}s] ` +
      `Best: ${event.objectiveValue ?? "—"}, ` +
      `Bound: ${event.objectiveBound ?? "—"}, ` +
      `Gap: ${event.relativeGap !== undefined ? (event.relativeGap * 100).toFixed(2) + "%" : "—"}`
    );

    // 可选：一旦找到足够好的可行解（Incumbent）即提前终止
    if (event.objectiveValue !== undefined && event.objectiveValue >= 1000) {
      controller.abort();
    }
  },
});

console.log("Status:", m.status);                   // 若中断前已找到可行解则为 "Feasible"，否则为 "Unknown"
console.log("Termination:", m.terminationStatus);   // "Interrupted"
console.log("Has incumbent:", m.hasPrimalSolution); // 若存在可用可行解则为 true
```

> [!NOTE]
> **各求解器后端的 `AbortSignal` 限制**：
> - **求解中途抢占式取消**：仅当在浏览器 Web Worker（`useWorker: true`）中运行 HiGHS 或 Pumpkin 时，触发取消会立即终止 Worker。
> - **仅支持求解前或调用边界检查**：在 Node.js、浏览器中指定 `useWorker: false` 时，以及 GLPK 与 Z3 中，`AbortSignal` 仅在原生求解调用前或调用间隙检查。

### `SolveProgressEvent` 字段说明

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | 自求解开始经过的时间（秒；可选别名：`elapsedSeconds`）。 |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | 当前求解器阶段（已知时提供）。 |
| `objectiveValue` | `number \| undefined` | 当前找到的最佳可行解（Incumbent）的目标函数值（MIP）。 |
| `objectiveBound` | `number \| undefined` | 当前已证明的最佳对偶界（Objective Bound，MIP）。 |
| `relativeGap` | `number \| undefined` | 当前相对最优性间隙（`0.05` = 5%）。 |
| `absoluteGap` | `number \| undefined` | 当前绝对最优性间隙 `\|objectiveValue - objectiveBound\|`。 |
| `nodes` | `number \| undefined` | 截至目前已探索的分支定界节点数。 |
| `iterations` | `number \| undefined` | 求解器迭代次数（单纯形法、内点法或 MIP LP 迭代）。 |
| `message` | `string \| undefined` | 求解器输出的原始进度日志行。 |

---

## 模型修改与解状态同步

当通过 `Model` 方法以及 `Model`、`Var`、`Constraint` 的属性设置器修改模型时，`Model` 会自动保持解状态同步。

### 求解后修改自动重置状态

添加变量或约束，或通过 `m.objective()` 与 `m.sense` 更新目标函数，都会立即将 `m.status` 重置为 `"NotSolved"`。
修改变量属性（`v.lb`、`v.ub`、`v.type`）或约束属性（`c.lhs`、`c.sense`、`c.rhs`）时也是如此。
同时会清空 `m.solution` 与 `m.objectiveValue`，将变量的 `value` 与 `reducedCost` 重置为 `null`，并将约束的 `dual` 与 `slack` 重置为 `null`。

### 求解中途修改与并发调用保护

- **求解中途修改**：若在异步 `m.solve()` 或 `m.check()` 执行期间修改模型，过期的求解结果会被丢弃，`m.status` 保持为 `"NotSolved"`，且进行中的 Promise 会以错误 reject。
- **并发调用保护**：在同一模型上发起新的 `m.solve()` 或 `m.check()` 会取代先前仍在运行的调用，防止乱序完成的旧结果覆盖最新状态。
- **原子化批量编辑**：若 `m.constraint([...])` 等批量操作包含无效项，模型会整体回滚，不会残留部分修改，也不会清空已有有效解。

> [!NOTE]
> 不支持重命名已注册的变量或约束，也不支持直接修改内部底层映射或 AST（如 `c.lhs.terms`、`BoolOp.children`）。
> 此类修改会在下一次调用求解、检查或导出时被模型完整性校验拒绝。
