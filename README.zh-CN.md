<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - TypeScript 数理优化建模器" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>TypeScript 数理优化建模器</strong></p>
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
    <a href="https://ohtaman.github.io/washi/zh/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) 是面向 TypeScript / JavaScript 的数理优化与约束编程代数建模器，受到 Python **PuLP** 的启发。你可以在应用代码中定义变量、目标函数和约束，并在 Node.js 或浏览器本地使用 **HiGHS**（默认）、**Z3** 或 **GLPK** 求解。

## ✨ 核心特性

- **直观的代数语法**：通过 `` expr`30 * ${x} + 50 * ${y} <= 40` `` 与求和、点积（`sum`, `dot`）清晰编写公式与约束。
- **跨 Node.js 与浏览器本地运行**：基于 WebAssembly，无需单独部署 Python 服务或本地编译 C/C++。
- **求解器无关**：内置 **HiGHS**，支持按需加载 **Z3**、**GLPK** 插件或自定义求解器适配器。
- **可满足性判定与冲突诊断**：支持逻辑与算术约束的可满足性判定，并在模型不可行时定位矛盾约束。
- **大规模分解算法**：内置列生成法与 Benders 分解支持。

## 📚 文档与链接

- **[在线文档](https://ohtaman.github.io/washi/zh/)**：建模指南、求解器说明与运行环境配置
- **[案例展示](https://ohtaman.github.io/washi/zh/showcase/) & [浏览器演示](https://ohtaman.github.io/washi/demo/)**：在线体验交互式应用与浏览器建模演练场
- **[示例目录](https://ohtaman.github.io/washi/zh/examples/)**：各类问题的建模示例与可运行源码（[`examples/`](examples/README.md)）
- **[AI 编程助手快速参考](docs/zh/getting-started/ai-agents.md) · [Agent Skill (`SKILL.md`)](skills/washi/SKILL.md) · [`llms.txt`](https://ohtaman.github.io/washi/llms.txt) / [`llms-full.txt`](https://ohtaman.github.io/washi/llms-full.txt)**：面向 AI 编程助手的速查指南、技能定义与机器可读文档

---

## 📦 安装与快速开始

```bash
npm install @ohtaman/washi

# 可选求解器插件
npm install z3-solver   # 用于 SMT 逻辑与冲突诊断
npm install glpk.js     # 用于 GLPK 求解器 (GPL-3.0)

# 可选：为 AI 编程助手（Claude Code, Cursor, Codex 等）安装建模技能
npx skills add ohtaman/washi
```

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

## ⚙️ 求解器概览

| 求解器 | 许可证 | 支持问题类型 | 主要用途 | 引入方式 |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | MIT | LP, MIP, 凸QP | 数值优化与弹性冲突修复诊断 | 默认内置 |
| **[Z3](https://github.com/Z3Prover/z3)** | MIT | SMT, SAT, 逻辑, MIP | 逻辑规则、可满足性判定与精确 `unsatCore` | `import "@ohtaman/washi/solvers/z3"` |
| **[GLPK](https://www.gnu.org/software/glpk/)** | GPL-3.0 | LP, MIP | 线性与混合整数规划 | `import "@ohtaman/washi/solvers/glpk"` |
| **Mock** | MIT | — | 单元与集成测试模拟响应 | 内置 (`MockSolver`) |

导入对应插件后，可在 `new Model(...)`、`m.solve(...)` 或 `m.check(...)` 中传入 `{ solver: "z3" }` 或 `{ solver: "glpk" }`。

---

## 🚀 常用用法示例

### 1. 求和、点积（`sum` / `dot`）与条件约束

使用 `dot` / `sum` 组合线性表达式，并通过 `m.indicator()` 表达条件规则：

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("TransportPlanning");
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];
const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const open = m.binary(factories);
const ship = m.continuous(factories, stores, { lb: 0, ub: 500 });

// 若东京工厂关闭 (open["Tokyo"] == 0)，从东京工厂发出的总运输量必须为 0
m.indicator(open["Tokyo"], expr`sum(${ship["Tokyo"]}) <= 0`, { activeValue: 0 });
m.constraint(expr`${ship["Tokyo"]["StoreA"]} + ${ship["Osaka"]["StoreA"]} >= 100`, "demand_A");

m.objective(minimize(expr`dot(${costs}, ${ship})`));
await m.solve();

console.log("Tokyo -> StoreA:", ship["Tokyo"]["StoreA"].value);
```

### 2. 凸二次规划 (QP)

在线性约束下最小化二次目标函数：

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("PortfolioQP");
const x = m.continuous("tech", { lb: 0, ub: 1 });
const y = m.continuous("bonds", { lb: 0, ub: 1 });

m.constraint(expr`${x} + ${y} == 1`, "budget");
m.constraint(expr`0.14 * ${x} + 0.04 * ${y} >= 0.08`, "min_return");
m.objective(minimize(expr`0.04 * ${x}^2 + 0.005 * ${y}^2`));

await m.solve();
console.log(`Tech: ${x.value?.toFixed(2)}, Bonds: ${y.value?.toFixed(2)}`);
```

### 3. SMT 逻辑规则与冲突诊断 (`m.check`)

表达逻辑蕴含规则并排查不可行原因：
- **HiGHS（默认）**：提取**弹性修复集合**（`res.conflicts`），即松弛后可恢复可行性的约束。
- **Z3**：提取精确的 **SMT 不可满足核心**（`res.unsatCore` / `res.conflicts`），即相互矛盾的约束子集。

```ts
import { Model, implies, expr } from "@ohtaman/washi";
// import "@ohtaman/washi/solvers/z3"; // 可选：使用 Z3 提取精确 SMT unsatCore

const m = new Model("StaffingRules");
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rush = m.bool("rush");

m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");
m.constraint(rush, "rush_required");
m.constraint(implies(rush, expr`${engineers} >= 8`), "rush_staffing");
m.constraint(expr`${budget} <= 50000`, "budget_cap"); // 冲突: 8人 * $8,000 > $50,000
m.constraint(expr`${engineers} >= 1`, "min_staff");   // 无关规则

const res = await m.check(); // 或 await m.check({ solver: "z3" })
console.log(res.status);     // "Unsat"
console.log(res.conflicts);  // HiGHS: ["rush_required"]
```

---

## 🌐 浏览器与 Web Worker 使用指南

- **打包工具 (Vite / webpack 5)**：直接 `import { Model } from "@ohtaman/washi"` 即可。浏览器默认在 Web Worker 中求解；传入 `{ useWorker: false }` 可在主线程执行。
- **原生 ESM / Script 标签 / CDN**：部署 `dist/browser/` 目录（含 `highs.wasm` 与 Worker 资源）或从 CDN 加载。

```html
<!-- 浏览器原生 ESM -->
<script type="module">
  import { Model } from "./washi/washi.js";
  // 可选求解器插件: import "./washi/solvers/glpk.js" 或 "./washi/solvers/z3.js"
  const m = new Model();
  await m.solve();
</script>

<!-- Script 标签 / CodePen (挂载全局变量 Washi) -->
<script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
```

> [!NOTE]
> **浏览器中使用 Z3**：Z3 的 WebAssembly 引擎依赖 `SharedArrayBuffer`，需要配置跨源隔离响应头（`COOP: same-origin` 与 `COEP: require-corp`）。详见[跨源隔离指南](docs/zh/getting-started/cross-origin.md)与 [`examples/distribution/`](examples/distribution/README.md)。

---

## 🤝 参与开发与贡献

关于本地开发、运行测试与基准测试、重新构建 WebAssembly 资源以及发布流程，请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 📄 许可证

- **`@ohtaman/washi`**: [MIT 许可证](./LICENSE)
- **内置与可选引擎**: HiGHS (MIT)、Z3 (MIT)、GLPK (GPL-3.0)。完整许可说明请参阅 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
