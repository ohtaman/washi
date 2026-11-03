# HiGHS 求解器引擎

**HiGHS** 是由爱丁堡大学研发的高性能数理优化软件（[ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)），公认为线性规划（LP）、混合整数规划（MIP）和凸二次规划（QP）领域的顶尖开源求解器。

在 `@ohtaman/washi` 中，HiGHS 通过官方 [`highs`](https://www.npmjs.com/package/highs) 软件包（[lovasoa/highs-js](https://github.com/lovasoa/highs-js)）完全运行在 WebAssembly 环境中，在 Node.js、Web Worker 和浏览器环境中提供零配置执行能力。

---

## 在 WaSHI 中的核心特性

- **内置且零配置**：直接打包上游 [`highs`](https://www.npmjs.com/package/highs) WASM 发行版本，无需安装额外依赖或进行 C++ 本地编译。
- **宽松的 MIT 许可证**：核心包 100% 满足商业友好授权要求。
- **Web Worker 后台多线程**：在浏览器环境中自动将高强度计算卸载至专用后台 Web Worker，避免阻塞 UI 渲染主线程。
- **支持热启动（`initialValue`）**：支持将变量的初始值提示（`initialValue`）传递给 HiGHS 的 `setSolution` 进行热启动。
- **高速 WASM 执行**：基于 Emscripten 编译的 32 位 WebAssembly，运行速度接近原生代码。

---

## 架构与 WebAssembly 运行时

WaSHI 并非在代码仓库内直接从 C++ 源码编译 HiGHS。而是从上游官方 [`highs`](https://www.npmjs.com/package/highs) npm 软件包（[lovasoa/highs-js](https://github.com/lovasoa/highs-js)）中提取并打包 WebAssembly 二进制文件（`highs.wasm`）及其 JS 运行时，结合 WaSHI 的代数建模层、Web Worker 自动调度和标准求解器抽象接口进行分发。

### 回调与求解器交互控制

- **进度监控与中途取消（已支持）**：
  通过 HiGHS 内部的日志与中断钩子，WaSHI 提供实时进度回调（`onProgress`），并支持通过标准 `AbortSignal` 进行协作式中途取消。
- **动态割平面 / 惰性约束（受 WASM 包装层限制暂不支持）**：
  上游 WebAssembly 包装层出于 WASM ↔ JS 边界同步内存安全考虑，未公开底层原生回调类型 8（MIP lazy constraints）。对于旅行商问题（TSP）的子回路消除或 Benders 分解等场景，请采用**迭代求解循环（求解 $\to$ 检测违规 $\to$ `model.constraint(...)` $\to$ 重新求解）**的割平面法模式。

---

## 支持的问题类型

### 1. 线性规划 (LP)
通过原始与对偶单纯形法（Primal / Dual Simplex）或内点法（IPM）求解连续变量优化问题。求解完成后可读取约束的影子价格（`c.dual`）、松弛量（`c.slack`）以及变量的缩减成本（`v.reducedCost`）：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");
await model.solve();
```

### 2. 混合整数线性规划 (MIP)
利用分支定界法（Branch-and-Bound）和割平面法（Cutting Planes）求解离散整数及 0-1 二元变量问题：

```typescript
const count = model.integer("count", { lb: 0, ub: 50 });
const open = model.binary("open");
```

### 3. 凸二次规划 (Convex QP)
在线性约束条件下最小化或最大化二次目标函数：

```typescript
// 使用 expr 模板统一最小化风险/方差：
model.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

// 或使用 .mul() 以编程方式构造：
// const quadObj = x.mul(x).mul(0.5).add(y.mul(y).mul(0.5));
// model.objective(minimize(quadObj));
```

---

## 求解器选项

向 `model.solve()` 传入求解器配置选项：

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,       // 最大求解时间（秒）
  mipGap: 0.001,         // 当相对 MIP 间隙达到 0.1% 以内时终止（别名：relGap）
  absGap: 1.0,           // 绝对 MIP 最优间隙容差
  presolve: "on",        // 预处理控制（"on" | "off" | "choose"）
  outputFlag: true,      // 输出内部单纯形法 / 分支定界法日志 (output_flag)
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`已用时: ${ev.elapsedTime.toFixed(1)}s, 当前最优值: ${ev.objectiveValue}`);
  },
});
```

---

## 浏览器中的 Web Worker 与 WASM 配置

在浏览器环境中，WaSHI 默认启动专用的 Web Worker 在后台运行 HiGHS，以保持 UI 响应流畅，并使 `onProgress` 和 `AbortSignal` 能够实时工作。

如果需要在主线程同步运行（或在禁止使用 Web Worker 的受限环境中运行），可以向 `model.solve()` 传入 `useWorker: false`，或在实例化 `HighsSolver` 时进行配置：

```typescript
import { Model, HighsSolver } from "@ohtaman/washi";

// 方式 1：在单次 solve 调用时指定
await model.solve({ useWorker: false });

// 方式 2：在实例化求解器时指定
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```
