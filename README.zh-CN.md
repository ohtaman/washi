<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - 面向 TypeScript 与 JavaScript 的数理优化代数建模器 (Modeler)" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>面向 TypeScript 与 JavaScript 的代数建模器</strong></p>
  <p>
    <em>线性规划 (LP) • 混合整数规划 (MIP) • 凸二次规划 (QP) • SMT逻辑约束与冲突诊断</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://github.com/ohtaman/washi/actions/workflows/distribution.yml"><img src="https://github.com/ohtaman/washi/actions/workflows/distribution.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://ohtaman.github.io/washi/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) 是面向 TypeScript / JavaScript 的代数建模器，受到 Python **PuLP** 和 Julia **JuMP** 的启发。你可以在应用代码中定义变量、目标函数、算术约束和逻辑约束。WaSHI 负责构建模型、转换为求解器输入，并将结果映射回变量；优化与可满足性检查由 **HiGHS**、**Z3** 和 **GLPK** 完成。

HiGHS 是默认求解器；Z3 和 GLPK 是可选插件。软件包提供 Node.js 和浏览器分发版本，并包含 WebAssembly 资源。部署要求请参阅[浏览器使用说明](#-浏览器与-web-worker-使用指南)。

[试用浏览器演示](https://ohtaman.github.io/washi/demo/) · [AI 编程助手快速参考](docs/getting-started/ai-agents.md) · [示例源码与运行方法](https://github.com/ohtaman/washi/blob/main/examples/README.md) · [ESM / script / CodePen 示例](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("木工产品利润最大化");
const x = m.integer("桌子", { lb: 0 });
const y = m.integer("椅子", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`生产计划: x=${x.value}, y=${y.value} (最大利润: $${m.objectiveValue})`);
```

---

## 🎯 WaSHI 提供的功能

1. **代数模型构建**：使用领域变量构造函数（`m.binary`、`m.integer`、`m.continuous`）、标签模板字面量（`expr`）、向量聚合函数（`dot`、`sum`）以及声明式的 `m.constraint()` 约束方法，精确且优雅地描述数学模型。
2. **求解器适配器**：通过共同的建模 API 使用 HiGHS、Z3 或 GLPK，也可以[注册自己的适配器](https://github.com/ohtaman/washi/blob/main/docs/custom-solver-guide.md)。需要选择支持相应问题类型的求解器；不同求解器的能力并不相同。
3. **本地执行与 WebAssembly 分发**：使用本地求解器适配器时，可在应用内求解，无需单独的 Python 服务或本地 C/C++ 编译。浏览器部署需要包含生成的 JS、Worker 和 WASM 资源。离线使用还需要这些资源可在本地访问或已缓存。Z3 有额外的浏览器隔离要求。
4. **命名约束与 SMT 结果**：显式使用 Z3 检查可满足性，并通过冲突约束（`conflicts` / `unsatCore`）调查冲突约束。返回的是一个冲突约束子集，不一定是最小子集。

模型构建与转换由 WaSHI 负责。支持的问题类型、数值行为和求解时间取决于所选求解器、配置及具体问题。建模开销与求解器执行时间应分别测量；某个模型上的结果并不构成通用性能保证。

---

## ⚙️ 求解器适配器与支持范围

| 适配器 | 引擎许可证 | 支持的问题类型 | 引擎作用 | 集成方式 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 数值优化 | 默认内置 |
| **Z3** | **MIT** | **SMT, SAT, 逻辑, MIP** | 可满足性检查、Unsat Core、优化 | 可选插件 (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 线性与混合整数优化 | 可选插件 (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | — | 为集成测试提供模拟响应 | 内置；不实际求解模型 |

---

## 📦 安装

```bash
# npm
npm install @ohtaman/washi

# pnpm
pnpm add @ohtaman/washi

# yarn
yarn add @ohtaman/washi

# bun
bun add @ohtaman/washi
```

*(可选)* 若需使用 Z3 或 GLPK 求解器，可按需安装对应依赖包：

```bash
npm install z3-solver    # 用于 SMT 与冲突诊断
npm install glpk.js      # 用于 GLPK 求解器 (GPL-3.0)
```

---

## 🚀 快速上手指南

### 1. 混合整数线性规划 (MIP: 生产计划问题)

在有限资源约束下实现利润最大化：

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("FactoryPlanning");

// 决策变量（非负整数）
const chairs = m.integer("chairs", { lb: 0 });
const tables = m.integer("tables", { lb: 0 });

// 借助标签模板字面量自然表达目标函数与约束
m.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
m.constraint(expr`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.constraint(expr`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// 使用默认的 HiGHS WASM 引擎求解
const status = await m.solve();

console.log(`求解状态: ${status}`); // "Optimal"
console.log(`最大利润: $${m.objectiveValue}`); // 1100
console.log(`生产量: 椅子=${chairs.value}, 桌子=${tables.value}`); // 椅子 20, 桌子 10
```

#### 🗂 多维变量网格

一行代码声明变量字典或多维变量矩阵：

```ts
// 1D 字典形式的布尔变量
const openCity = m.binary(["Tokyo", "Osaka", "Nagoya"]);

// 2D 运输量矩阵: [工厂] x [门店]
const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2D 网格坐标 (例如 8x8 棋盘)
const board = m.binary(8, 8, { prefix: "queen" });
```

#### 🔀 Big-M 条件指示约束 (`m.indicator`)

轻松建模条件触发规则与固定成本启动，无需繁琐的手工 Big-M 代数推导：

```ts
// "若工厂关闭 (openCity['Tokyo'] == 0)，则产量 flow 必须为 0"
m.indicator(openCity["Tokyo"], expr`${flow["F1"]["StoreA"]} <= 0`, {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. 投资组合风险最小化 (凸二次规划: QP)

在满足预期收益与预算约束的前提下，基于协方差矩阵最小化投资组合风险：

```ts
import { Model, QuadExpr, sum, dot, minimize, expr } from "@ohtaman/washi";

const m = new Model("MarkowitzPortfolio");
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// 决策变量: 各资产投资权重 (0.0 ~ 1.0)
const w = m.continuous(assets, { lb: 0, ub: 1 });

// 1. 预算约束: 资金分配总额 100%
m.constraint(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget");

// 2. 目标回报率: 组合最低回报率 >= 8.5%
const retMap = Object.fromEntries(assets.map((a, i) => [a, returns[i]]));
m.constraint(expr`${dot(retMap, w)} >= 0.085`, "min_return");

// 3. 资产协方差矩阵 (风险与相关性)
const cov = [
  [0.040, 0.002, 0.015],
  [0.002, 0.005, 0.002],
  [0.015, 0.002, 0.025],
];

// 二次目标函数: w^T * Cov * w
let risk = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
  }
}
m.objective(minimize(risk));

await m.solve();
console.log(`最小方差: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name) => {
  console.log(`  ${name}: ${((w[name].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT 逻辑与规则引擎 (集成 Z3)

原生支持布尔命题变量（`BoolVar`）、逻辑连接词（`and`, `or`, `implies`, `not`, `xor`）与数值算术约束的混合表达：

```ts
import { Model, not, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.bool("isNight");
const motion = m.bool("motion");
const alarm = m.bool("alarm");
const siren = m.bool("siren");
const lux = m.integer("lux", { lb: 0 });

// 规则定义
m.constraint(lux.le(50).implies(isNight), "dark_implies_night");
m.constraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// 传感器当前输入数据
m.constraint(expr`${lux} <= 10`, "sensor_dark");
m.constraint(motion, "sensor_motion");
m.constraint(alarm, "alarm_on");

// 无目标函数直接判定可满足性 (SAT)
const res = await m.check({ solver: "z3" });

console.log(`系统状态满足？ ${res.status === "Sat"}`); // true
console.log(`警报响起？ ${m.values.get("siren")}`); // true
```

---

### 4. 约束冲突根因诊断 (`conflicts` / `unsatCore`)

当规则或约束之间存在矛盾时，Z3 能够提取引发冲突的**矛盾约束子集**（Unsat Core / Conflicts，不保证最小性；需使用 Z3）：

```ts
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rushDelivery = m.bool("rushDelivery");

// 规则 1: 每位工程师成本 $8,000
m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

// 规则 2: 客户要求加急交付
m.constraint(rushDelivery, "rush_required");

// 规则 3: 加急交付需至少配备 8 名工程师
m.constraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// 规则 4: 董事会严格预算上限 $50,000 (冲突点: 8人 * $8,000 = $64,000 > $50,000!)
m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

// 规则 5: 最低 1 名员工用工底线（无关规则）
m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`求解状态: ${res.status}`); // "Unsat"
console.log("冲突约束子集:", res.conflicts);
// 输出: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// 注：无关的 "minimum_one_employee" 被准确排除在外！
```

---

### 5. 使用 GLPK 求解器 (GPL-3.0)

使用 GNU Linear Programming Kit (GLPK) 求解器插件：

```ts
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ solver: "glpk" });
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.solve();
console.log(`求解状态: ${status}`); // "Optimal"
console.log(`目标函数值: ${m.objectiveValue}`); // 1100
```

---

### 6. 向量运算与高效点积 (`dot`)

无需嵌套循环，一行代码完成一维和二维变量的线性组合：

```ts
import { Model, dot, minimize } from "@ohtaman/washi";

const m = new Model();
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// 一行代码最小化总运输成本:
m.objective(minimize(dot(costs, ship)));
await m.solve();

// 获取所有变量的最优取值结构
const solution = m.getValues(ship);
console.log(solution);
```

---

## 🌐 浏览器与 Web Worker 使用指南

HiGHS 默认使用包内的 WASM，**不会自动回退到 CDN**。Node.js 使用已安装的 HiGHS；Vite / webpack 5 可以根据包内的 WASM 和 Worker 引用生成部署文件。

### npm 与构建工具

```typescript
import { Model } from "@ohtaman/washi";
const model = new Model();
// 定义变量、目标函数和约束
await model.solve();
```

在验证的 Vite / webpack 构建中，不需要手动复制 WASM 或配置 URL。其他构建工具及 SSR 需要单独验证；浏览器求解应在客户端执行。浏览器默认使用 Worker。简单演示可以使用 `model.solve({ useWorker: false })`，但较长的计算会阻塞 UI。

### 浏览器原生 ESM（无需应用构建）

通过 HTTP 提供整个 `dist/browser` 目录，包括 JS 分块、`highs.wasm` 和 Worker。不需要 Import Maps。

```html
<script type="module">
  import { Model } from "./washi/washi.js";
  const model = new Model();
  // 定义变量、目标函数和约束
  await model.solve({ useWorker: false });
</script>
```

### 普通 script / CodePen

`dist/browser/washi.min.js` 导出全局 API `Washi`。将其 URL 添加到 CodePen 的 External Scripts，或使用：

```html
<script src="./washi/washi.min.js"></script>
<script>
  const model = new Washi.Model();
  // 定义变量、目标函数和约束
  model.solve({ useWorker: false }).then(status => console.log(status));
</script>
```

若通过 CDN 加载，可使用 `https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.1.2/dist/browser/washi.min.js`（请固定 `0.1.2` 及以上版本号）。ESM 使用同版本的 `dist/browser/washi.js`。选择 CDN URL 就是显式使用 CDN；本地部署不会自动改用外部 CDN。

### 浏览器环境中的求解器插件（GLPK & Z3）

浏览器发布包在 `dist/browser/solvers/` 下提供了开箱即用的独立求解器插件（通过 CDN 引入时适用于 `>= 0.2.0` 或 `@latest`）：
- **GLPK**: `dist/browser/solvers/glpk.js` (ESM) 与 `dist/browser/solvers/glpk.min.js` (IIFE，挂载全局 `WashiGLPK`)
- **Z3**: `dist/browser/solvers/z3.js` (ESM) 与 `dist/browser/solvers/z3.min.js` (IIFE，挂载全局 `WashiZ3`)，附带 `z3-built.js` 和 `z3-built.wasm`

#### 浏览器 ESM 使用 GLPK
```html
<script type="module">
  import { Model, maximize } from "./washi/washi.js";
  import "./washi/solvers/glpk.js";

  const model = new Model({ solver: "glpk" });
  const x = model.continuous("x", { lb: 0, ub: 10 });
  model.objective(maximize(x));
  await model.solve();
  console.log("GLPK 求解状态:", model.status);
</script>
```

#### 原生脚本标签使用 GLPK
```html
<script src="./washi/washi.min.js"></script>
<script src="./washi/solvers/glpk.min.js"></script>
<script>
  const model = new Washi.Model({ solver: "glpk" });
  const x = model.continuous("x", { lb: 0, ub: 10 });
  model.objective(Washi.maximize(x));
  model.solve().then(status => console.log("GLPK 求解状态:", status));
</script>
```

> [!NOTE]
> **浏览器环境中使用 Z3 的配置要求与跨源隔离**：
> 由于 Z3 的 WebAssembly 引擎依托多线程 (`SharedArrayBuffer`)，现代浏览器强制要求 Cross-Origin Isolation。文档响应头必须包含：
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> 并且跨源资源必须包含 `Cross-Origin-Resource-Policy: cross-origin` 标头。
> 
> 无法自定义响应标头的常见静态托管（如标准 GitHub Pages 或 CodePen 等 iframe 预览环境）在缺少额外配置时无法直接满足条件。引入 `@ohtaman/washi` 核心库绝不会自动向用户项目中注入或注册 Service Worker。
> 
> 在 GitHub Pages 部署的 WaSHI 官方 Web Demo 中，通过在同源独立部署作用域严格限定为 `/washi/` 的 `coi-serviceworker.js`，在首次访问时安全自动重载一次以建立 `window.crossOriginIsolated === true` 环境。在不支持 Service Worker 或隔离失败的环境中，Z3 会清晰展示诊断原因并中止执行，防止无限重载或无响应挂起。

完整独立的 ESM、Script 标签与 CodePen 示例请参阅 `examples/distribution/`。

### 工厂内网、离线部署、Worker 与自定义 URL

将应用构建产物或整个 `dist/browser` 目录部署到本地 HTTP / 内网服务器。所有资源可在本地访问时，即使浏览器缓存为空也不需要外部网络。仅保存 HTML 或第一个 JS 文件是不够的。不保证 `file://` 执行，也不自动提供 PWA 缓存。

ESM 根据模块 URL 解析资源；script 构建在加载时保存自身的 URL。CDN Worker 使用 Blob 模块启动，需要服务端的跨域资源许可及相应 CSP。CDN Worker 还需允许 `worker-src blob:`。不支持时可使用 `useWorker: false`。Worker 加载或消息处理失败会拒绝求解 Promise。

自定义地址仍可通过 `setHighsWasmUrl(url)` 或 `options.wasmUrl` 指定：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";
setHighsWasmUrl("https://cdn.jsdelivr.net/npm/@ohtaman/washi@latest/dist/browser/highs.wasm");
```

初始化失败会返回包含请求地址的错误，不会尝试其他主机。依赖旧的域名根目录 / CDN 自动回退的应用需部署生成资源或显式配置 URL。

### 验证发布产物

`npm run test:distribution` 安装实际 npm tarball，在没有可选依赖时构建 Vite / webpack 应用，并通过 VM 执行生成的 JS 和真实 WASM。这不等同于浏览器 / CORS 验证。安装 `npx playwright install chromium` 后，运行 `RUN_DISTRIBUTION_BROWSER=1 npm run test:distribution` 以验证 Chromium。CI 使用该模式，验证跨域部署及外部网络请求阻断。

---

## 🛠️ 自定义求解器开发与架构扩展

WaSHI 采用完全解耦的插件式求解器架构。你可以轻松编写并注册自定义求解器适配器（如云端 REST 求解服务、定制 WebAssembly 引擎或商业求解器）：

- 完整开发指南、接口契约（`Solver`, `LpModelData`, `SolverResult`）与测试实践详见 [Custom Solver Developer Guide](docs/custom-solver-guide.md)。

---

## 💻 示例与浏览器演示

[示例目录](https://github.com/ohtaman/washi/blob/main/examples/README.md)与[在线案例与 API 索引](https://ohtaman.github.io/washi/zh/examples/)按问题类别和 WaSHI API 功能汇总了源码链接及本地运行方法。

| 类别 | 示例 | 展示内容 | 求解器 |
| :--- | :--- | :--- | :--- |
| **基础模型** | [生产计划](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) | 整数变量、利润目标与资源约束 (`expr`) | HiGHS |
| **基础模型** | [运输与分配网络](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) | 二维矩阵变量 (`continuous(rows, cols)`) 与供需平衡 | HiGHS |
| **基础模型** | [营养问题与灵敏度分析](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) | 影子价格 (`constr.dual`)、松弛量 (`constr.slack`) 与缩减成本 (`var.reducedCost`) | HiGHS |
| **实战应用** | [员工排班与冲突诊断](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) | 周排班优化与周六休假冲突诊断 | HiGHS + Z3 |
| **实战应用** | [购物车优惠券最优组合](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) | 满减门槛条件约束 (`indicator`)、互斥规则与凑单推荐 | HiGHS |
| **实战应用** | [投资组合分配](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) | 凸二次目标函数 (`QuadExpr`) 与分配约束 | HiGHS |
| **逻辑 / SMT** | [业务规则检查](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) | 算术与逻辑约束 (`bool`, `implies`) 的可满足性检查 | Z3 |
| **逻辑 / SMT** | [冲突诊断](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) | 命名约束与 Unsat Core (`unsatCore`) | Z3 |

在[在线浏览器演示](https://ohtaman.github.io/washi/demo/)中可以编辑并运行模型。浏览器 ESM、script 标签和 CodePen 的用法请参阅[分发示例](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)。Z3 需要跨源隔离；具体要求见上方浏览器说明。

本地运行前，请克隆仓库并安装开发依赖：

```bash
git clone https://github.com/ohtaman/washi.git
cd washi
npm ci
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts

# 本地浏览器演示: http://localhost:5173/demo/
npm run dev
```

示例导入仓库的 `src/` 模块。使用已发布软件包的应用应改为导入 `@ohtaman/washi` 及所需的求解器插件。

---

## 🧪 自动化测试

运行仓库的单元测试与集成测试，并构建分发版本：

```bash
# 运行全部单元与集成测试
npm test

# 构建生产级依赖包与 TypeScript 类型定义
npm run build
```

---

## 📄 许可证

- **`@ohtaman/washi`**: [MIT 许可证](./LICENSE)
- **HiGHS**（默认求解器）: MIT 许可证
- **Z3**（可选插件）: MIT 许可证
- **GLPK**（可选插件）: GPL-3.0 许可证
