# HiGHS 求解器引擎

**HiGHS** 是发源于爱丁堡大学的开源数理优化求解器（[highs.dev](https://highs.dev/) · [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)）。它支持求解线性规划（LP）、混合整数规划（MIP）和凸二次规划（QP）问题。

在 `@ohtaman/washi` 中，HiGHS 是内置的默认求解器。它以零外部依赖的 WebAssembly 二进制形式随包分发，可在 Node.js、浏览器和 Web Worker 中直接运行。

---

## 何时选择 HiGHS

| 问题类型 | 推荐求解器 | 原因 |
| :--- | :--- | :--- |
| **LP、MIP 或连续凸 QP** | **HiGHS**（默认） | MIT 许可内置，数值求解快，支持 LP 对偶值/松弛量与 MIP 热启动。 |
| **有界整数约束规划（CP）** | **[Pumpkin](./pumpkin.md)** | 原生支持 `disjoint`、`cumulative`、`distinct` 和 `unsatCore`，无需跨域隔离响应头。 |
| **含连续变量的逻辑规则** | **[Z3](./z3.md)** | 支持逻辑运算符中的精确算术以及连续/整数混合模型的 `unsatCore` 诊断。 |
| **GNU GLPK 兼容或基准对比** | **[GLPK](./glpk.md)** | 可选的 GPL-3.0 依赖，适合与现有 GLPK 模型交叉验证。 |

> [!TIP]
> 大多数数值优化任务都可以直接从 **HiGHS** 开始。只有在需要原生 CP 传播或可满足性模理论（SMT）冲突诊断时，再选用 **Pumpkin** 或 **Z3**。

---

## 在 WaSHI 中的主要特性

- **内置且零配置**：采用 MIT 许可证随 `@ohtaman/washi` 一同打包，无需安装额外依赖。
- **无需 `COOP`/`COEP` 响应头**：以单线程 WebAssembly 运行，无需 `SharedArrayBuffer` 或[跨域隔离](../getting-started/cross-origin.md)响应头。
- **Web Worker 后台执行**：在浏览器中默认使用专用 Web Worker 运行，保持页面 UI 流畅响应。
- **热启动提示（`initialValue`）**：支持为 `model.continuous()`、`model.integer()` 和 `model.binary()` 设置初始值提示。
- **LP 松弛（`relax: true`）**：无需修改变量声明，即可直接求解 MIP 模型的连续松弛问题。

---

## 支持的问题类型

HiGHS 通过统一的 `Model` API 处理连续、离散和二次优化问题。只需根据问题类别选择对应的变量类型与目标函数形式即可。

### 1. 线性规划（LP）

LP 模型由连续变量、线性约束和线性目标函数构成。HiGHS 使用单纯形法或内点法求解，并填充约束对偶值 `c.dual`、松弛量 `c.slack` 和变量缩减成本 `v.reducedCost`：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });

model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 100`, "cap");

await model.solve();
console.log(model.status, model.objectiveValue, cap.dual, cap.slack);
```

### 2. 混合整数规划（MIP）

MIP 模型将连续变量与 `model.integer()` 或 `model.binary()` 离散变量结合。HiGHS 通过分支切割法求解，并返回 `objectiveBound`、`relativeGap` 与 `absoluteGap`：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const mipModel = new Model({ solver: "highs" });
const count = mipModel.integer("count", { lb: 0, ub: 50 });
const open = mipModel.binary("open");

mipModel.objective(maximize(expr`12 * ${count} - 100 * ${open}`));
mipModel.constraint(expr`${count} <= 50 * ${open}`, "link");

await mipModel.solve();
console.log(mipModel.status, count.value, open.value);
```

### 3. 凸二次规划（Convex QP）

QP 模型在线性约束下优化连续变量的凸二次目标函数（最大化时为凹二次目标函数）：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const qpModel = new Model({ solver: "highs" });
const x = qpModel.continuous("x", { lb: 0 });
const y = qpModel.continuous("y", { lb: 0 });

qpModel.constraint(expr`${x} + ${y} >= 10`, "demand");
qpModel.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

await qpModel.solve();
console.log(qpModel.status, qpModel.objectiveValue, x.value, y.value);
// Optimal 25 5 5
```

> [!NOTE]
> **仅支持全连续变量的凸 QP**：QP 模型中的所有变量都必须是连续变量（`model.continuous()`）。最小化时二次项矩阵 $\mathbf{Q}$ 须为半正定，最大化时须为半负定。
>
> 不支持混合整数二次规划或二次约束。如需在 MIP 中线性化二元变量乘积，请参阅[建模模式与优化技巧](../guide/formulation-tips.md)。

---

## 求解器选项

可以将运行选项传入 `model.solve()` 或 `HighsSolver` 构造函数。HiGHS 会严格校验选项键，传入不支持的选项将直接抛出运行时 `Error`。

### 支持的选项

| 选项 | 类型 | 说明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大求解时间（秒）。 |
| `relativeGap` | `number` | 当相对 MIP 最优间隙落入此容差内时终止。 |
| `absoluteGap` | `number` | 当绝对 MIP 最优间隙落入此容差内时终止。 |
| `presolve` | `"on" \| "off" \| "choose"` | 控制求解前的模型预处理。 |
| `outputFlag` | `boolean` | 开启单纯形法与分支切割法内部日志输出（默认 `false`）。 |
| `relax` | `boolean` | 求解 MIP 模型的连续 LP 松弛问题。 |
| `useWorker` | `boolean` | 在浏览器中使用 Web Worker 运行（默认 `true`）。 |
| `wasmUrl` | `string \| null` | 为本次求解覆盖 `highs.wasm` 的资源地址。 |
| `signal` | `AbortSignal` | 协作式取消正在进行的求解。 |
| `onProgress` | `(ev) => void` | 实时接收耗时、当前目标值、对偶界与间隙更新。 |

此外还支持以下 HiGHS 透传限制项：`mip_max_nodes`、`mip_max_improving_sols`、`mip_max_leaves`、`simplex_iteration_limit` 和 `ipm_iteration_limit`。

### 不支持的选项（运行时抛出异常）

- `verbose`：会抛出 `Error`，请改用 `outputFlag: true`。
- `threads`：HiGHS WebAssembly 为单线程运行，传入此项会抛出 `Error`。
- 未知选项键：传入任何未识别的选项键都会抛出 `Error`。

### 时间限制、进度回调与取消示例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");

const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,
  relativeGap: 0.001,
  absoluteGap: 1.0,
  presolve: "on",
  outputFlag: true,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`已用时: ${ev.elapsedTime.toFixed(1)}s, 当前最优值: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `可用解 (${model.status}, 终止原因: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}, gap = ${((model.relativeGap ?? 0) * 100).toFixed(2)}%`
  );
}
```

---

## 浏览器中的 Web Worker 与 WASM 配置

在浏览器中，WaSHI 默认在专用 Web Worker 中执行 HiGHS。这样可以保持页面渲染流畅，并使 `onProgress` 和 `AbortSignal` 能够及时响应。

如果需要在主线程运行，或从自定义路径托管 `highs.wasm`，请使用 `useWorker`、`setHighsWasmUrl` 或 `wasmUrl`：

```typescript
import { Model, HighsSolver, expr, maximize, setHighsWasmUrl } from "@ohtaman/washi";

// 全局设置自定义 WASM 地址（传入 null 恢复内置资源）
setHighsWasmUrl("/assets/wasm/highs.wasm");

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0, ub: 10 });
model.objective(maximize(expr`${x}`));

// 方式 1：按单次 solve 调用关闭 Worker 或覆盖 wasmUrl
await model.solve({ useWorker: false, wasmUrl: "/assets/wasm/highs.wasm" });

// 方式 2：在 HighsSolver 实例上配置默认选项
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```

如果 `highs.wasm` 加载失败或返回了 HTML 错误页，WaSHI 会直接抛出包含请求地址的异常，不会静默回退到外部 CDN。

---

## 架构与 WebAssembly 运行时

> [!NOTE]
> 本节为可选参考内容，面向维护者及需要了解底层 WebAssembly 封装细节的开发者。

WaSHI 直接将官方 HiGHS C++ 源码编译为 32 位 WebAssembly（`highs.wasm`），启用 `-fwasm-exceptions` 与单线程选项 `-DHIGHS_NO_DEFAULT_THREADS=ON`。驱动层直接调用 HiGHS 原生 C API（`highs_c_api.h`），通过线性内存上的 TypedArray 视图实现零拷贝解提取，并通过 `setSolution` 传入 MIP 热启动解。

随包发布的 `highs.wasm` 与 `runtime.js` 通过 `highs.config.json` 中的 SHA-256 校验和验证完整性。从源码重新构建的步骤见 [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)。

### 回调与求解器交互控制

- **进度监控与取消**：通过 HiGHS 的日志与中断回调支持 `onProgress` 和 `AbortSignal`。
- **动态割平面与惰性约束**：搜索树内的回调暂未跨 WASM 边界暴露。对于子回路消除或 Benders 分解，请使用 [`await m.solveBenders({ subproblem })`](../guide/decomposition.md) 或外层迭代割平面循环。

---

## 参考链接与学术引用

- **官方网站**：[https://highs.dev/](https://highs.dev/)
- **官方文档**：[https://ergo-code.github.io/HiGHS/](https://ergo-code.github.io/HiGHS/)
- **源码仓库**：[ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)（MIT License）
- **学术引用（Citation）**：在学术论文或技术报告中引用 HiGHS 时，请参考以下基础论文：
  > Q. Huangfu and J. A. J. Hall, *"Parallelizing the dual revised simplex method"*, Mathematical Programming Computation, 10 (1), 119–142, 2018. DOI: [10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)
