# Pumpkin 约束规划求解器

**Pumpkin** 是使用 Rust 开发的开源约束规划（CP）求解器（[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)）。WaSHI 将 Pumpkin（`v0.5.0`）编译为 WebAssembly 并内置在 `@ohtaman/washi/solvers/pumpkin` 中，无需额外安装任何依赖。

由于采用单线程运行，在浏览器中使用时**无需配置 `COOP` / `COEP` 响应头**。

---

## 主要特性

- **内置且零依赖**：`pumpkin.wasm`（约 1.4 MB）随 `@ohtaman/washi` 一同发布，采用 MIT 兼容许可。
- **Web Worker 后台执行**：不依赖 `SharedArrayBuffer`，在常规静态托管或 iframe 中也能流畅运行而不阻塞页面。
- **原生 CP 约束支持**：直接支持 `disjoint()`、`cumulative()`、`distinct()`、`allowed()` / `not(allowed())`、`at()`、`max()`、`min()`、`abs()`、离散 `!=` 以及 `m.indicator()`。
- **冲突诊断（`unsatCore`）**：调用 `await model.check({ solver: "pumpkin" })` 可定位有界整数和布尔模型中的冲突命名约束。
- **热启动（`initialValue`）**：支持为 `m.integer()` 和 `m.binary()` 变量提供初始搜索提示。

> [!TIP]
> 排班调度、资源上限、互不相同分配以及免 `COOP`/`COEP` 的 `unsatCore` 请用 **Pumpkin**；连续变量 LP / MIP / QP 优化请用 **HiGHS**；含连续变量的逻辑规则请用 **Z3**。

---

## 使用示例

### 1. 排程与全局约束 (`model.solve()`)

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
// Status: Optimal, s1=0, s2=6 (或 s1=4, s2=0)
```

### 2. 冲突诊断 (`model.check()`)

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
  console.log("冲突约束:", result.conflicts); // 也可通过 result.unsatCore / model.unsatCore 读取
  // ["vip_active", "vip_seats", "room_cap"]
}
```

---

## 求解选项 (`timeLimit`, `signal`, `onProgress`)

可以将运行选项传入 `model.solve()` 或 `model.check()`。Pumpkin 支持进度回调与 `AbortSignal` 取消：

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0, // 最大求解时间（秒）
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`已耗时: ${ev.elapsedTime.toFixed(1)}s, 当前最优: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `求解结果 (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## 使用要求与限制 {#domain-api-preconditions}

Pumpkin 仅支持**有界整数和布尔**模型，遇到不支持的输入会直接抛出明确错误：

- **仅限有界整数**：所有 `Integer` 或 `Binary` 变量的上下界必须在 $[-(2^{30} - 1),\, 2^{30} - 1]$ 范围内，不支持 `Continuous` 变量和 `-Infinity` / `Infinity`。
- **整数系数与范围限制**：约束系数、调整后的右端项（`rhs - lhs.constant`）以及缩放后的上下界必须为有符号 32 位安全整数（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）。目标函数常数项允许为小数。
- **不支持的功能**：不支持 `QuadExpr` 二次式和 `relax: true`；由于 Pumpkin 是精确整数 CP 求解器，不使用 `relativeGap`、`absoluteGap`、`presolve` 等 LP 容差参数。

---

## 浏览器 Worker 与 WASM 部署

在浏览器中，Pumpkin 默认在专用 Web Worker 中加载内置 `pumpkin.wasm`（在 `file:` 协议或受限 iframe 中会退回主线程执行）。如需在主线程运行或从自定义路径托管 `pumpkin.wasm`：

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 按次或按求解器实例指定主线程运行
await model.solve({ useWorker: false });
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });

// 自定义 WASM 地址（也可在 solve/check 中传入 { wasmUrl }）
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

如果 `pumpkin.wasm` 加载失败或返回了 HTML 回退页面，WaSHI 会直接抛出包含请求 URL 的错误，不会静默回退到外部 CDN。

---

## 参考链接

- [约束规划 (CP) 建模](../guide/constraint-programming.md) · [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md`（重新构建 WASM）](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
