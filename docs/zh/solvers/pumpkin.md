# Pumpkin 约束规划求解器

**Pumpkin** 是由代尔夫特理工大学（TU Delft）ConSol Lab 使用纯 Rust 开发的惰性子句生成（Lazy Clause Generation, LCG）约束规划（CP）求解器（[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [docs.rs/pumpkin-core](https://docs.rs/pumpkin-core)）。WaSHI 将 Pumpkin（`v0.5.0`）直接编译为 WebAssembly，并作为零外部依赖的内置插件（`@ohtaman/washi/solvers/pumpkin`）随包分发。

与依赖多线程 WASM 的求解器不同，Pumpkin 以单线程 WebAssembly 实例在 Web Worker（或 Node.js）中运行，因此**无需在浏览器中配置跨源隔离（`COOP` / `COEP`）响应头**。

---

## WaSHI 中的核心特性

- **内置打包・零外部依赖**：`pumpkin.wasm`（约 1.4 MB）随 `@ohtaman/washi` 一起分发并按需摇树打包到 `@ohtaman/washi/solvers/pumpkin`，无需额外执行 `npm install` 安装 peer dependencies 或配置 Rust 工具链。
- **商用友好的 MIT 许可证**：所有传递 Rust WASM 依赖均采用宽松许可（`MIT`、`Apache-2.0`、`Unicode-3.0`）。
- **后台 Web Worker 与免 `COOP` / `COEP`**：在常规 HTTP(S) 源下自动在专用 Web Worker 中运行，不依赖 `SharedArrayBuffer` 或跨源隔离响应头，既不会阻塞主线程渲染，也适用于普通静态托管及第三方 iframe。
- **原生 CP 全局约束与传播器**：将 `distinct()`（Pumpkin `v0.5.0` 的 `all_different`，内部按两两 `binary_not_equals` 分解）、`disjoint()`（`disjunctive_strict` Vilím 边缘推导）、`cumulative()`（时间表滤波）、`allowed()` / `not(allowed())`（`table` / `negative_table`）、`at()`（`element`）、`max()` / `min()` / `abs()`（`maximum` / `minimum` / `absolute`）、离散 `!=`（`not_equals`）以及省略 `M` 时的 `m.indicator()`（`implied_by`）直接下沉为原生 Pumpkin 约束。
- **免 `COOP` / `COEP` 的 Unsat Core 冲突诊断**：通过 `await model.check({ solver: "pumpkin" })`，无需跨源隔离即可对有界整数与布尔约束提取冲突约束子集（`unsatCore` / `conflicts`）。
- **支持热启动提示（`initialValue`）**：在 `solve()` 与 `check()` 中均支持为有界 `Integer` / `Binary` 变量提供 `initialValue` 非强制初始解提示（`supportsWarmStart: true`），通过 Pumpkin 的 `WarmStart` 分支策略应用（`Var.initialValue` 与求解后的 `Var.value` 保持独立）。

---

## 支持的问题类型

> [!TIP]
> **HiGHS、Pumpkin 与 Z3 的选型建议**：
> - **HiGHS**（`{ solver: "highs" }`）：适合包含连续变量的线性规划（LP）、凸二次规划（QP）以及以线性松弛为主导的大规模 MILP。
> - **Pumpkin**（`{ solver: "pumpkin" }`）：适合析取调度、CP 全局约束、有界整数与命题逻辑组合模型，以及免 `COOP`/`COEP` 的 `unsatCore` 提取。
> - **Z3**（`{ solver: "z3" }`）：适合包含连续变量或非整数系数的逻辑蕴含约束与精确有理数 SMT 判定。

### 1. 析取调度与全局 CP 约束 (`model.solve()`)

在有界整数域上直接建模单机/累积资源调度、前置顺序逻辑（`implies`、`not`）以及全局约束谓词（`disjoint`、`distinct`、`cumulative`、`allowed`、`at`、`max`、`min`、`abs`）：

```typescript
import { Model, disjoint, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(
  disjoint([
    { start: s1, duration: 6 },
    { start: s2, duration: 4 },
  ]),
  "single_machine"
);
model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
```

### 2. 可满足性检验与冲突核心提取 (`model.check()`)

使用 `await model.check()` 可以判断整数线性约束、CP 全局约束与嵌套命题逻辑（`and`, `or`, `not`, `implies`, `xor`）的可满足性，并在不可满足（`"Unsat"`）时返回互相冲突的命名约束子集（`conflicts` / `unsatCore`）：

```typescript
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("PolicyConflict", { solver: "pumpkin" });
const vip = model.bool("vip");
const seats = model.integer("seats", { lb: 0, ub: 20 });

model.constraint(vip, "vip_active");
model.constraint(implies(vip, expr`${seats} >= 8`), "vip_seats");
model.constraint(expr`${seats} <= 5`, "room_cap");

const result = await model.check();
if (result.status === "Unsat") {
  console.log("冲突约束集:", result.conflicts); // 同 result.unsatCore / model.unsatCore
}
```

---

## 求解器选项

通过 `model.solve()` 或 `model.check()` 传入控制选项：

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,       // 最大求解时间（秒）
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`已耗时: ${ev.elapsedTime.toFixed(1)}s, 当前最优值: ${ev.objectiveValue}`);
  },
});

// 使用 timeLimit 或 AbortSignal 时，请检查 hasPrimalSolution 确认是否存在可行解：
if (model.hasPrimalSolution) {
  console.log(
    `可用解 (${model.status}, 停止原因: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## 域约束与前置条件

Pumpkin 是**严格的有界整数与布尔约束规划求解器**。不支持的建模元素会直接报错，绝不静默取整或回退：

- **仅支持有界整数 / Binary / BoolVar**：所有 `Var` 必须具有有限整数上下界，且 `lb` / `ub` 均处于 `[-(2^30 - 1), 2^30 - 1]` 范围内。无界整数（`-Infinity` / `Infinity`）或 `Continuous` 连续变量会直接报错。
- **整数线性算术**：约束系数、修正右端项（`rhs - lhs.constant`）以及缩放后变量边界必须为整数，且满足有符号 32 位安全范围（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）；目标函数常数项允许小数。
- **不支持的特性**：`QuadExpr` 二次表达式、`Continuous` 变量、无界变量与 LP 松弛（`relax: true`）会明确抛出错误。

---

## 浏览器中的 Web Worker 与 WASM 配置

默认情况下，在浏览器中 `@ohtaman/washi/solvers/pumpkin` 会自动解析内置的 `pumpkin.wasm`，并在 HTTP(S) 源下自动通过 `pumpkin-worker.js` 在后台 Web Worker 中运行（在 `file://` 或沙盒隔离 iframe 中则自动退回主线程执行）。

如需在主线程同步执行（或在禁用 Web Worker 的环境中运行），请向 `model.solve()` / `model.check()` 传入 `useWorker: false`，或直接实例化 `PumpkinSolver`：

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 方式 1：在 solve / check 调用中指定
await model.solve({ useWorker: false });

// 方式 2：在实例化求解器时指定
const syncModel = new Model({
  solver: new PumpkinSolver({ useWorker: false }),
});

// 将 pumpkin.wasm 托管至自定义路径或 CDN（全局设置，或每次调用传入 { wasmUrl }）：
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

若目标 URL 缺失或错误地返回了 HTML 回退页面，加载器会立即报错并指明实际请求的 URL，**绝不会暗中回退到公共 CDN**。

---

## 架构与 WebAssembly 运行时

WaSHI 通过 Rust WebAssembly 包装箱（`wasm/pumpkin`，链接 `pumpkin-core`、`pumpkin-constraints`、`pumpkin-propagators` 与 `pumpkin-conflict-resolvers` `v0.5.0` 并编译至 `wasm32-unknown-unknown`）直接生成 `pumpkin.wasm` 及 `wasm-bindgen` 绑定。

随包分发的 `pumpkin.wasm` 与 `runtime.js` / `runtime.d.ts` 通过 `pumpkin.config.json` 中的 SHA-256 校验和进行完整性验证。如需从源码重新编译或更新 Release 资产，维护者可参考 [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)。

### 回调与求解器交互控制

- **进度监控与取消控制（已支持）**：
  在 `solve()` 期间，Pumpkin 支持实时最优解进度回调（`onProgress`，传递 `elapsedTime` 与 `objectiveValue`）以及 `AbortSignal` 取消控制：在浏览器 Web Worker 中支持抢占式终止正在运行的 Worker 并取消排队请求，在主线程与 Node.js 中则在分支和终止钩子处轮询协作式 `should_abort` 检查点。
- **离散最优性证明**：
  作为有限整数域上的精确 LCG 求解器，Pumpkin 通过子句学习与目标边界收紧（`LinearSatUnsat`）来严格证明最优性，而非依赖浮点 LP 容差选项（`mipGap`、`relGap`、`absGap` 或 `presolve`）。

---

## 参考链接

- **建模指南与实战示例**：[约束规划 (CP) 建模](../guide/constraint-programming.md) · [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)
- **源码仓库**：[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)（MIT 许可证 — ConSol Lab, TU Delft）
- **Rust Crate 与 API 文档**：[docs.rs/pumpkin-core](https://docs.rs/pumpkin-core) · [crates.io/crates/pumpkin-core](https://crates.io/crates/pumpkin-core)
