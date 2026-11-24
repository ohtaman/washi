# 目标函数与求解 (`m.solve` & `m.check`)

目标函数定义了数理优化的目标——例如最大化利润、最小化成本或最小化二次风险方差。如果只需要验证约束条件的可行性或求解纯 SMT 逻辑问题，也可以不设置目标函数，直接调用 `m.check()`。

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

无参数调用 `m.objective()` 可读取当前的目标函数表达式（`LinExpr | QuadExpr`）。如果未设置目标函数，模型默认最小化常数 `0`。

> [!TIP]
> 关于 **Min-Max / Max-Min 负载均衡**、**多目标优化（加权求和与词典序两阶段求解）** 以及 **MIP 停止间隙容差（`relativeGap` / `absoluteGap`）设计**等建模技巧，请参见 [建模模式与优化技巧](./formulation-tips.md#multi-objective)。

---

## 求解模型 (`m.solve()` vs. `m.check()`)

WaSHI 提供两个异步执行入口：

| 方法 | 返回值 | 用途 |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | 在满足所有约束的前提下优化目标函数（`Minimize` 或 `Maximize`）。自动填充变量的原问题解、目标函数值、MIP 边界/间隙以及 LP 的对偶值（`dual`）与松弛量（`slack`）。 |
| **`await m.check(options?)`** | `Promise<CheckResult>` | 不带目标函数检查约束是否可满足。返回 `{ status, values, conflicts?, unsatCore?, runTime? }`，用于 CP/SMT 判定和 `unsatCore` 冲突诊断。 |

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
| `solver` | `string` \| `Solver` | 模型的求解器 (`"highs"`) | 本次运行使用的已注册求解器名称（例如 `"highs"`、`"pumpkin"`、`"z3"`、`"glpk"` 或自定义名称）或 `Solver` 实例。 |
| `timeLimit` | `number` | `undefined` | 最大求解时间上限（秒）。 |
| `relativeGap` | `number` | `undefined` | 相对 MIP 最优性间隙容差（例如 `0.01` 表示 1%）。 |
| `absoluteGap` | `number` | `undefined` | 绝对 MIP 最优性间隙容差（HiGHS `mip_abs_gap`）。 |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | 控制优化前的求解器预处理（Presolve）化简策略。 |
| `outputFlag` / `verbose` | `boolean` | `false` | 输出求解器内部迭代日志（HiGHS 使用 `outputFlag`，GLPK 使用 `verbose`）。 |
| `useWorker` | `boolean` | `true` (浏览器) | 在浏览器中将 **HiGHS** 与 **Pumpkin** 卸载到专用 Web Worker 中执行。设为 `false` 则在主线程执行。 |
| `wasmUrl` | `string` | 自动解析 | 浏览器部署时用于加载 `highs.wasm` 或 `pumpkin.wasm` 的自定义 URL。 |
| `signal` | `AbortSignal` | `undefined` | 协作式取消信号（`AbortController.signal`）。 |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | 接收实时求解进度快照的回调函数。 |

您也可以将求解器名称直接作为第一个参数传入：`await m.solve("glpk", { timeLimit: 5 })`。

---

## 读取结果、边界与求解器状态

求解完成后，可在 `Model` 实例上读取状态、最优值以及 MIP 最优性边界指标：

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
> 如需在容差范围内独立校验返回解是否满足所有变量边界、整数性与约束，请调用 `m.verify()`——详见[冲突诊断、验证与调试](./unsat-core.md)。

### 理解 `m.status` 与 `m.terminationStatus` 的区别

当 MIP 求解器因时间上限（`timeLimit`）、迭代次数上限或 `AbortSignal` 而提前停止时，需要区分两个核心问题：
1. **是否存在可用的可行解？**（`m.hasPrimalSolution` / `m.status`）
2. **求解器为什么停止？**（`m.terminationStatus`）

如果在触发 `timeLimit` 或 `signal.abort()` 前已经找到有效解（即**当前最优可行解**），WaSHI 会将 `m.status` 设为 `"Feasible"`（此时 `x.value` 和 `m.objectiveValue` 中已有可用解），并在 `m.terminationStatus` 中记录停止原因（`"TimeLimit"` 或 `"Interrupted"`）。若未找到任何解即停止，则 `m.hasPrimalSolution` 为 `false`，`m.status` 为 `"TimeLimit"`、`"IterationLimit"` 或 `"Unknown"`。

### 所有 `SolverStatus` 状态值一览

| 状态 | `hasPrimalSolution` | 含义 |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | 已证明找到全局最优解（在容差范围内）。 |
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

在交互式 UI 中运行耗时较长的 MIP 优化时，您可以通过 `onProgress` 实时获取分支定界法的进度流（`SolveProgressEvent`），并借助 `AbortController` 让用户随时安全地中断求解：

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

### `SolveProgressEvent` 字段说明

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | 自求解开始以来经过的求解时间（秒；可选别名：`elapsedSeconds`）。 |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | 当前求解器阶段（已知时提供）。 |
| `objectiveValue` | `number \| undefined` | 当前找到的最佳可行整数解（Incumbent）的目标函数值（MIP）。 |
| `objectiveBound` | `number \| undefined` | 当前已证明的目标函数最佳对偶界（Objective Bound，MIP）。 |
| `relativeGap` | `number \| undefined` | 当前相对最优性间隙（`0.05` = 5%）。 |
| `absoluteGap` | `number \| undefined` | 当前绝对最优性间隙 `\|objectiveValue - objectiveBound\|`。 |
| `nodes` | `number \| undefined` | 截至目前已探索的分支定界节点数。 |
| `iterations` | `number \| undefined` | 求解器迭代次数（单纯形法、内点法或 MIP LP 迭代）。 |
| `message` | `string \| undefined` | 求解器输出的原始进度日志行。 |

---

## 模型修改与解状态同步

当通过 `Model` 方法以及 `Model` / `Var` / `Constraint` 的属性设置器修改模型时，`Model` 实例会自动同步并维护其解状态的一致性：

1. **求解后修改自动重置解状态**：添加变量或约束、更新目标函数（`m.objective(...)`、`m.sense = ...`），或修改变量的边界/类型（`v.lb`、`v.ub`、`v.type`）与约束属性（`c.lhs`、`c.sense`、`c.rhs`），都会立即将 `m.status` 重置为 `"NotSolved"`，清空 `m.solution` 与 `m.objectiveValue`，并将变量和约束的原问题解与对偶值重置为 `null`。
2. **求解中途修改自动丢弃过期结果**：如果在异步 `m.solve()` 或 `m.check()` 执行期间通过上述 API 修改了模型，正在运行的过期求解结果将被丢弃，模型保持 `"NotSolved"` 状态，且该进行中的 Promise 会以明确的错误 reject。
3. **并发调用保护**：在同一模型上发起新的 `m.solve()` 或 `m.check()` 调用会取代先前仍在运行中的调用，防止乱序完成的旧任务覆盖最新运行的状态。
4. **全有或全无的批量编辑**：如果 `m.constraint([...])` 等批量修改中包含无效项，模型会整体回滚，不会残留部分约束，也不会破坏已有有效解。

> [!NOTE]
> 不支持重命名已注册的变量或约束（例如在注册后重新赋值 `c.name`），也不支持直接篡改内部底层映射或 AST（例如 `c.lhs.terms` 或 `BoolOp.children`）；此类操作会在下一次调用求解、检查或导出时被内部模型完整性校验拒绝。
