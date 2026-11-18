# Pumpkin 约束规划求解器

**Pumpkin** 是由代尔夫特理工大学（TU Delft）ConSol Lab 使用纯 Rust 开发的惰性子句生成（Lazy Clause Generation, LCG）约束规划（CP）求解器。WaSHI 将 Pumpkin（`v0.5.0`）直接编译为 WebAssembly 并作为零外部依赖的可选插件（`@ohtaman/washi/solvers/pumpkin`）随包分发。

与依赖多线程 WASM 的求解器不同，Pumpkin 以单线程 WebAssembly 实例在 Web Worker（或 Node.js）中运行，因此**无需在浏览器中配置跨源隔离（`COOP` / `COEP`）响应头**。

---

## 何时选择 Pumpkin？

1. **析取调度与组合整数规划问题**：
   包含作业顺序互斥（`implies(y, ...)`）、整数域传播与子句学习的车间调度、排班及整数可行性模型。
2. **无需 COOP / COEP 的 Unsat Core 冲突诊断**：
   在不支持 `SharedArrayBuffer` 的普通静态托管环境或第三方 iframe 中，使用 `await model.check({ solver: "pumpkin" })` 提取冲突的命名约束子集（`unsatCore` / `conflicts`）。
3. **零额外依赖集成**：
   `pumpkin.wasm`（约 906 kB）已内置打包，无需额外执行 `npm install` 安装 peer dependencies。

> [!TIP]
> **HiGHS、Z3 与 Pumpkin 的选型建议**：
> - **HiGHS**（`{ solver: "highs" }`）：适合连续线性规划（LP）、凸二次规划（QP）以及以线性松弛为主导的大规模 MILP。
> - **Pumpkin**（`{ solver: "pumpkin" }`）：适合有界整数与命题逻辑组合模型，以及免 `COOP`/`COEP` 的 `unsatCore` 提取。
> - **Z3**（`{ solver: "z3" }`）：适合包含连续变量或非整数系数的逻辑蕴含约束与精确有理数 SMT 判定。

---

## 基本用法

```typescript
import { Model, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
```

---

## 可满足性检验与冲突核心提取 (`model.check()`)

使用 `await model.check()` 可以判断整数线性约束与嵌套命题逻辑（`and`, `or`, `not`, `implies`, `xor`）的可满足性，并在不可满足（`"Unsat"`）时返回互相冲突的命名约束子集（`conflicts` / `unsatCore`）：

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

## 域约束与前置条件

Pumpkin 是**严格的有界整数与布尔约束规划求解器**。不支持的建模元素会直接报错，绝不静默取整或回退：

- **仅支持有界整数 / Binary / BoolVar**：所有 `Var` 必须具有有限整数上下界，且 `lb` / `ub` 均处于 `[-(2^30 - 1), 2^30 - 1]` 范围内。无界整数（`-Infinity` / `Infinity`）或 `Continuous` 连续变量会直接报错。
- **整数线性算术**：约束系数、修正右端项（`rhs - lhs.constant`）以及缩放后变量边界必须为整数，且满足有符号 32 位安全范围（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）；目标函数常数项允许小数。
- **支持热启动提示（`initialValue`）**：支持在有界 `Integer` / `Binary` 变量上通过 `solve()` 和 `check()` 使用 `initialValue` 初始解提示（`supportsWarmStart: true`），底层通过 Pumpkin 的 `WarmStart` 分支策略作为非强制搜索提示应用（`Var.initialValue` 与求解后的 `Var.value` 保持独立）。
- **暂不支持的特性**：`QuadExpr` 二次表达式和 LP 松弛（`relax: true`）会明确抛出错误。全局 CP 约束（如 `distinct`、`noOverlap`）将在后续独立特性中提供。

---

## 浏览器部署与自定义 WASM URL

默认情况下，`@ohtaman/washi/solvers/pumpkin` 会自动解析内置的 `pumpkin.wasm`，并在常规 HTTP(S) 源下自动使用 `pumpkin-worker.js` 在后台 Web Worker 中运行（在 `file://` 或沙盒隔离 iframe 中则自动在主线程运行）。

如需将 `pumpkin.wasm` 托管至自定义路径或 CDN，可显式配置 URL：

```typescript
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

若目标 URL 缺失或错误地返回了 HTML 回退页面，加载器会立即报错并指明实际请求的 URL，绝不会暗中切换回公共 CDN。

### WebAssembly 资源管理与按需构建

Pumpkin 的 WebAssembly 二进制（`public/pumpkin.wasm`）与 JS/TS 运行时（`runtime.js` / `runtime.d.ts`）通过 `pumpkin.config.json` 结合 SHA-256 校验和进行版本控制：
- **高效一致性验证**：构建和分发测试流程会自动运行 `node scripts/ensure-pumpkin-wasm.mjs`，在打包前于毫秒内验证本地资源。
- **按需 Release 下载**：当资源缺失或版本升级时，`ensure-pumpkin-wasm.mjs` 会自动从 WaSHI 的 `pumpkin-v<version>` GitHub Release 资产（`pumpkin.config.json` 中的 `downloadUrl`）下载已验证的二进制包。
- **从源码编译**：升级 Pumpkin 或修改 `wasm/pumpkin` 时，在安装了 Rust 及 `wasm32-unknown-unknown` 目标的环境下（如需更新版本，可先执行 `node scripts/ensure-pumpkin-wasm.mjs --set-version <version>`）运行 `npm run build:pumpkin-wasm` 重新构建，合并后通过 `gh release upload pumpkin-v0.5.0 public/pumpkin.wasm src/modeler/solvers/pumpkin/runtime.js src/modeler/solvers/pumpkin/runtime.d.ts --clobber`（首次发布使用 `gh release create`）同步 Release 资产，或触发 `.github/workflows/build-pumpkin-wasm.yml` 并将 `pumpkin-wasm-assets` 产物中的更新提交到仓库。
