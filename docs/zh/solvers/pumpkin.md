# Pumpkin 约束规划求解器

**Pumpkin** 是由 [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) 使用 Rust 开发的开源约束规划（CP）求解器。WaSHI 与 HiGHS 一同以 MIT 许可证内置了 Pumpkin（`v0.5.0`，`pumpkin.wasm`，约 2.1 MB），无需安装额外依赖或导入插件，直接传入 `{ solver: "pumpkin" }` 即可使用（`PumpkinSolver` 与 `setPumpkinWasmUrl()` 等专属 API 位于 `@ohtaman/washi/solvers/pumpkin`）。

由于单线程运行，在浏览器中无需 `SharedArrayBuffer` 或 `COOP`/`COEP` 响应头（见[跨域隔离指南](../getting-started/cross-origin.md)）。

---

## 何时选择 Pumpkin

| 问题类型 | 推荐求解器 | 原因 |
| :--- | :--- | :--- |
| **排程调度、资源上限与离散全局约束** | **Pumpkin**（`{ solver: "pumpkin" }`） | 原生支持 `disjoint`、`cumulative`、`distinct` 与 `allowed`，零额外配置。 |
| **无需 `COOP`/`COEP` 的浏览器 `unsatCore`** | **Pumpkin**（`m.check({ solver: "pumpkin" })`） | 可在任意静态托管或 iframe 中提取有界整数和布尔模型的冲突约束。 |
| **线性规划、混合整数规划与凸二次规划** | **[HiGHS](./highs.md)**（默认） | 支持连续变量、对偶值与松弛量、凸二次目标函数及连续松弛。 |
| **含 `Continuous` 变量的逻辑规则** | **[Z3](./z3.md)** | 支持逻辑运算符中的实数不等式，以及连续/整数混合模型的 `unsatCore`。 |

---

## 支持的建模原语

- **原生 CP 与全局约束**：`disjoint()`、`cumulative()`、`distinct()`、`allowed()`、`at()`、`max()`、`min()`、`abs()`、离散 `!=` 与 `m.indicator()`。
- **原生命题逻辑**：`model.bool()`、`and()`、`or()`、`not()`、`implies()` 与 `xor()`。
- **热启动（`initialValue`）**：支持为 `model.integer()` 和 `model.binary()` 变量提供初始搜索提示。

---

## 使用示例

Pumpkin 已随 `@ohtaman/washi` 自动注册，无需额外导入，直接在 `new Model()`、`model.solve()` 或 `model.check()` 中传入 `{ solver: "pumpkin" }` 即可使用。对有界整数和布尔模型求目标最优值时调用 `model.solve()`，验证可满足性或排查冲突约束时调用 `model.check()`。

### 1. 排程与全局约束 (`model.solve()`)

```typescript
import { Model, disjoint, expr, implies, minimize, not } from "@ohtaman/washi";

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
// 可选：disjoint 本身已保证不重叠，此处将选定顺序显式记录到 job1First 中
model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
// Status: Optimal, s1=4, s2=0
```

### 2. 冲突诊断 (`model.check()`)

```typescript
import { Model, expr, implies } from "@ohtaman/washi";

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

## 求解选项

可将运行选项传入 `model.solve()`、`model.check()` 或 `new PumpkinSolver(options)`：

| 选项 | 类型 | 说明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大求解或检查时间（秒）。 |
| `useWorker` | `boolean` | 在浏览器中使用 Web Worker 运行（浏览器默认 `true`；在 `file:` 协议或无源环境下回退为 `false`）。在 Node.js 中传入 `useWorker: true` 会抛出 `Error`。 |
| `wasmUrl` | `string \| null` | 覆盖 `pumpkin.wasm` 的资源地址（`null` 表示使用内置二进制；全局设置请调用 `setPumpkinWasmUrl()`）。 |
| `signal` | `AbortSignal` | 取消正在进行的调用。在浏览器 Web Worker 中会抢占式终止并保留最近捕获的暂定解（如有）；在主线程或 Node.js 中则在检查点协作式取消。 |
| `onProgress` | `(ev) => void` | 实时接收耗时与暂定目标值更新（仅 `solve()` 生效，`check()` 忽略）。 |

> [!NOTE]
> Pumpkin 是离散 CP 求解器：LP 灵敏度字段（`c.dual`、`c.slack`、`v.reducedCost`）保持为 `null`，MIP 对偶界与间隙字段（`objectiveBound`、`relativeGap`、`absoluteGap`）保持为 `undefined`。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const model = new Model("TimedSearch", { solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.constraint(expr`${x} + ${y} >= 40`, "min_total");
model.objective(minimize(expr`2 * ${x} + 3 * ${y}`));

const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`已耗时: ${ev.elapsedTime.toFixed(1)}s, 当前最优: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `求解结果 (${model.status}, 终止原因: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## 使用要求与限制 {#domain-api-preconditions}

Pumpkin 仅支持**有界整数和布尔**模型。遇到不支持的变量、数值或选项时，会在运行时直接抛出 `Error`：

- **仅限有界整数**：`Integer` 变量的上下界须为 $[-(2^{30} - 1),\, 2^{30} - 1]$ 内的有限整数（`Binary` 变量范围为 0/1）；`Continuous` 变量以及 `Integer` 变量的无穷界会抛出 `Error`。
- **整数系数与缩放界**：约束系数、调整后的右端项（`rhs - lhs.constant`）以及系数乘以变量上下界的结果均须为 $[-(2^{30} - 1),\, 2^{30} - 1]$ 内的精确整数。
- **单条约束的 32 位总幅值上限**：在每条约束中，调整后右端项的绝对值加上各项最坏情况幅值（$|\text{系数}| \times \max(|\mathrm{lb}|, |\mathrm{ub}|)$）的总和不得超过 $2^{31} - 2$。
- **更严格的目标函数上限**：目标函数系数须为整数，且各项最坏情况缩放幅值之和不得超过 $2^{30} - 1$；目标函数常数项允许为小数。
- **不支持的模型特性**：`QuadExpr` 目标或约束以及 `relax: true` 会抛出运行时 `Error`。
- **不支持的选项**：`relativeGap`、`absoluteGap`、`presolve`、`threads`、`verbose`、`outputFlag` 以及任何未知选项键都会抛出运行时 `Error`。

---

## 浏览器 Worker 与 WASM 部署

在浏览器中，Pumpkin 默认在专用 Web Worker 中加载内置的 `pumpkin.wasm`。在 `file:` 协议或无源沙箱 iframe 中，会自动退回主线程执行。

如需强制主线程运行或从自定义路径托管 `pumpkin.wasm`：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 全局设置自定义 WASM 地址（也可在 solve() / check() 中传入 { wasmUrl }）
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");

const model = new Model({ solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 10 });
model.objective(minimize(expr`${x}`));

// 方式 1：单次调用强制在主线程运行
await model.solve({ useWorker: false });

// 方式 2：在 PumpkinSolver 实例上配置默认值
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });
```

如果 `pumpkin.wasm` 加载失败或返回 HTML 回退页面，WaSHI 会直接抛出包含请求地址的错误，不会静默回退到外部 CDN。

---

## 参考链接

- [约束规划 (CP) 建模](../guide/constraint-programming.md) · [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md`（重新构建 WASM）](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
