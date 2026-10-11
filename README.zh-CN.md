<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - 面向 TypeScript 与 JavaScript 的数学规划与代数建模库" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>面向 TypeScript 与 JavaScript 的直观数学规划与代数建模库</strong></p>
  <p>
    <em>线性规划 (LP) • 混合整数规划 (MIP) • 凸二次规划 (QP) • SMT逻辑约束与冲突诊断</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://ohtaman.github.io/washi/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://bundlephobia.com/package/@ohtaman/washi"><img src="https://img.shields.io/badge/bundle%20size-7.2%20kB%20(gzip)-blue" alt="bundle size" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
    <img src="https://img.shields.io/badge/types-TypeScript-blue" alt="TypeScript types" />
    <img src="https://img.shields.io/badge/tests-120%2B%20passing-brightgreen" alt="tests" />
  </p>
</div>

---

**WaSHI** 是一个高层代数建模库，将 Python **PuLP** 与 Julia **JuMP** 的优雅表现力引入现代 TypeScript / JavaScript 生态系统。你可以直接使用符合数学直觉的代数公式编写数学模型，并在 Node.js、现代浏览器、Bun、Deno 及 Next.js 中秒级求解——完全依托 WebAssembly 求解器（**HiGHS**、**Z3**、**GLPK**），无需任何本地 C++ 编译环境。

```ts
import { Model, expr, c } from "@ohtaman/washi";

const m = new Model({ sense: "Maximize" });
const x = m.addVar({ type: "Integer", lb: 0 });
const y = m.addVar({ type: "Integer", lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`生产计划: x=${x.value}, y=${y.value} (最大利润: $${m.objectiveValue})`);
```

---

## 🎯 为什么选择 WaSHI？

1. 🌐 **100% 客户端运行与零服务器成本**：直接在用户的浏览器、边缘节点（Edge Worker）或 Electron 桌面端运行工业级优化。后端服务器运维成本为零，支持离线运行，且机密业务数据（如排班表、成本数据）永不离开客户端。
2. 📦 **零依赖・单一包分发**：告别 Python 环境配置与繁重的跨平台 C/C++ 原生求解器编译绑定。只需 `npm install @ohtaman/washi`，包括 WebAssembly 求解器在内的所有组件即可开箱即用。
3. ✍️ **极简现代代数建模 DX（兼容 PuLP / python-mip）**：无需编写晦涩低级的矩阵索引。使用直观的模板字面量（`c`${x} + 2 * ${y} <= 40``）或熟悉的 Python 风格抽象（`LpProblem`, `lpSum`），像在草稿纸上写公式一样自然。
4. 🔄 **统一多求解器接口（HiGHS / Z3 / GLPK）**：模型代码一次编写，即可通过统一 API 自由切换：擅长工业级 MIP/QP 的 **HiGHS**、擅长逻辑求解与冲突分析的 **Z3**，以及经典学术求解器 **GLPK**。
5. 🔍 **不可行模型（Infeasible）冲突根因诊断**：当业务规则出现矛盾导致无解时，可通过 Z3 引擎快速定位并提取冲突约束的最小子集（Unsat Core）。
6. ⚡ **WebAssembly 原生工业级大规模性能**：搭载 $O(N)$ 线性时间高速表达式构建器，仅需约 100ms 即可构建 20,000+ 变量的大规模 MIP，并在浏览器 WebAssembly 中由 HiGHS 在约 15 秒内高效求解。

---

## ⚡ 求解器矩阵

| 求解器 | 核心许可证 | 支持的问题类型 | 最佳应用场景 | 在 WaSHI 中的提供方式 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 工业级生产排程、运筹规划、金融组合优化 | **内置默认**（零配置） |
| **Z3** | **MIT** | **SMT, SAT, 命题逻辑, MIP** | 业务规则验证、约束冲突诊断 (`unsatCore`)、规则引擎 | 可选插件 (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 学术基准测试、存量 GLPK 模型迁移 | 可选插件 (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | *任意* | CI/CD 环境下无需加载 WASM 的极速单元测试 | 内置 |

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
import { Model, c, expr } from "@ohtaman/washi";

const m = new Model({ name: "FactoryPlanning", sense: "Maximize" });

// 决策变量（非负整数）
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// 借助标签模板字面量自然表达目标函数与约束
m.maximize(expr`30 * ${chairs} + 50 * ${tables}`);
m.addConstraint(c`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// 使用默认的 HiGHS WASM 引擎求解
const status = await m.solve();

console.log(`求解状态: ${status}`); // "Optimal"
console.log(`最大利润: $${m.objectiveValue}`); // 1100
console.log(`生产量: 椅子=${chairs.value}, 桌子=${tables.value}`); // 椅子 20, 桌子 10
```

#### 🗂 多维变量网格 (`addVars`)

一行代码声明变量字典或多维变量矩阵（类似于 PuLP 的 `LpVariable.dicts`）：

```ts
// 1D 字典形式的布尔变量
const openCity = m.addVars(["Tokyo", "Osaka", "Nagoya"], { type: "Binary" });

// 2D 运输量矩阵: [工厂] x [门店]
const flow = m.addVars(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2D 网格坐标 (例如 8x8 棋盘)
const board = m.addVars(8, 8, { type: "Binary", prefix: "queen" });
```

#### 🔀 Big-M 指示约束 (`addIndicator`)

直接表达条件激活与固定成本逻辑，无需手动进行繁琐的 Big-M 代数推导：

```ts
// "若工厂关闭 (openCity['Tokyo'] == 0)，则产量 flow 必须为 0"
m.addIndicator(openCity["Tokyo"], flow["F1"]["StoreA"].le(0), {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. 投资组合风险最小化 (凸二次规划: QP)

在满足预期收益与预算约束的前提下，基于协方差矩阵最小化投资组合风险：

```ts
import { Model, QuadExpr, sum } from "@ohtaman/washi";

const m = new Model({ name: "MarkowitzPortfolio", sense: "Minimize" });
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// 决策变量: 各资产投资权重 (0.0 ~ 1.0)
const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

// 1. 预算约束: 资金分配总额 100%
m.addConstraint(sum(w).eq(1.0), "budget");

// 2. 目标回报率: 组合最低回报率 >= 8.5%
m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

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
    risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
  }
}
m.minimize(risk);

await m.solve();
console.log(`最小方差: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name, i) => {
  console.log(`  ${name}: ${((w[i].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT 逻辑与规则引擎 (集成 Z3)

原生支持布尔命题变量（`BoolVar`）、逻辑连接词（`and`, `or`, `implies`, `not`, `xor`）与数值算术约束的混合表达：

```ts
import { Model, not } from "@ohtaman/washi";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.addBoolVar("isNight");
const motion = m.addBoolVar("motion");
const alarm = m.addBoolVar("alarm");
const siren = m.addBoolVar("siren");
const lux = m.addVar({ name: "lux", type: "Integer", lb: 0 });

// 规则定义
m.addConstraint(lux.le(50).implies(isNight), "dark_implies_night");
m.addConstraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// 传感器当前输入数据
m.addConstraint(lux.le(10), "sensor_dark");
m.addConstraint(motion, "sensor_motion");
m.addConstraint(alarm, "alarm_on");

// 无目标函数直接判定可满足性 (SAT)
const res = await m.check({ solver: "z3" });

console.log(`系统状态满足？ ${res.status === "Sat"}`); // true
console.log(`警报响起？ ${m.values.get("siren")}`); // true
```

---

### 4. 约束冲突根因诊断 (`unsatCore`)

当规则或约束之间存在矛盾时，Z3 能够精准指出引发冲突的**最小冲突约束子集**（需使用 Z3）：

```ts
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
const rushDelivery = m.addBoolVar("rushDelivery");

// 规则 1: 每位工程师成本 $8,000
m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

// 规则 2: 客户要求加急交付
m.addConstraint(rushDelivery, "rush_required");

// 规则 3: 加急交付需至少配备 8 名工程师
m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// 规则 4: 董事会严格预算上限 $50,000 (冲突点: 8人 * $8,000 = $64,000 > $50,000!)
m.addConstraint(budget.le(50000), "strict_board_budget_cap");

// 规则 5: 最低 1 名员工用工底线（无关规则）
m.addConstraint(engineers.ge(1), "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`求解状态: ${res.status}`); // "Unsat"
console.log("冲突约束子集:", res.unsatCore);
// 输出: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// 注：无关的 "minimum_one_employee" 被准确排除在外！
```

---

### 5. Python PuLP 兼容层

若你已有 Python PuLP 代码资产，可零摩擦迁移：

```ts
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  HiGHS,
  value,
} from "@ohtaman/washi";

const prob = new LpProblem("PuLPDemo", LpMaximize);

const x = new LpVariable("x", 0, undefined, LpInteger);
const y = new LpVariable("y", 0, undefined, LpInteger);

// 等同于 PuLP 中的 += 语法
prob.add(x.mul(30).add(y.mul(50)));
prob.add(x.add(y.mul(2)).le(40));
prob.add(x.mul(2).add(y).le(50));

await prob.solve(new HiGHS());

console.log(`状态: ${prob.status}`);
console.log(`目标函数值: ${value(prob.objective)}`);
console.log(`x = ${value(x)}, y = ${value(y)}`);
```

---

## 🌐 浏览器与 Web Worker 使用指南

WaSHI 原生支持在现代网页浏览器、前端主流框架（Vite、Next.js、React、Vue、Svelte）以及 Web Worker 中运行。

### 1. 零配置模式（官方 CDN 智能回退）
在浏览器环境下，若当前域名根路径未部署 `highs.wasm`，WaSHI 会自动从官方 jsDelivr 高速 CDN 安全拉取二进制文件。您无需任何额外配置或文件复制：

```typescript
import { Model } from "@ohtaman/washi";

const model = new Model();
// ... 定义变量与约束
await model.solve(); // 零配置即可直接运行！
```

### 2. 现代打包工具自托管（Vite / Webpack / Rollup）
如果您希望将 `highs.wasm` 作为项目打包产物的一部分进行自托管与版本哈希管理：

```typescript
import wasmUrl from "@ohtaman/washi/highs.wasm?url";
import { setHighsWasmUrl } from "@ohtaman/washi";

// 在应用入口处配置一次
setHighsWasmUrl(wasmUrl);
```

### 3. 企业内网与完全离线（Air-gapped）环境
针对严禁外部 CDN 请求的企业内网或纯离线环境：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";

// 指定内部静态资源路径（将完全禁用外部 CDN 回退）
setHighsWasmUrl("/static/highs.wasm");
```

---

## 💻 本地脚本与交互式 Web 演示

在 `examples/node/` 中提供了即开即用的独立脚本：

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
```

启动浏览器端交互式可视化演示 (`examples/web-demo`)：

```bash
npm run dev
# 文档主页: http://localhost:5173/
# 交互式 Demo: http://localhost:5173/demo/
```

---

## 🧪 自动化测试

项目全面贯彻测试驱动开发 (TDD)，涵盖 120+ 单元测试、集成测试与大规模基准测试：

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
