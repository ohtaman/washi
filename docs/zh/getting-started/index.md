# 安装与入门

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）是面向 TS/JS 的代数建模库。您可以像 Python PuLP 一样通过标签模板（`expr`）编写数式，并用内置 WebAssembly 求解器在 **Node.js 18+** 与浏览器中直接求解。

---

## 📦 安装

安装 `@ohtaman/washi` 即可开箱获得两个零外部依赖的内置求解器，另外两个求解器可作为可选对等依赖按需安装：

| 求解器 | 安装方式 | 支持的问题类型与能力 |
| --- | --- | --- |
| **HiGHS** *(默认)* | 内置于 `@ohtaman/washi` | 线性规划、混合整数规划与凸二次规划 — 支持 `LP`、`MIP` 与 `QP`。 |
| **Pumpkin** | 内置于 `@ohtaman/washi/solvers/pumpkin` | 约束规划（`CP`），并支持有界整数与布尔模型的 `unsatCore` 冲突诊断。 |
| **Z3** | 可选（`z3-solver`） | 可满足性模理论（`SMT`）、连续变量逻辑约束与精确 `unsatCore` 诊断。 |
| **GLPK** | 可选（`glpk.js`） | 基于 GPL-3.0 协议的备选 LP 与 MIP 求解器。 |

**不可满足核心（`unsatCore`）**是指一组无法同时成立的具名约束子集。Pumpkin 与 Z3 均可通过 `m.check()` 提取 `unsatCore`。

::: code-group

```bash [npm]
npm install @ohtaman/washi
```

```bash [pnpm]
pnpm add @ohtaman/washi
```

```bash [yarn]
yarn add @ohtaman/washi
```

```bash [bun]
bun add @ohtaman/washi
```

:::

需要使用 **Z3** 或 **GLPK** 时，请按需安装可选对等依赖：

```bash
npm install z3-solver   # 可选：SMT 逻辑约束与连续变量 Unsat Core 诊断
npm install glpk.js     # 可选：GLPK 求解器 (GPL-3.0)
```

在浏览器中使用 Z3 需要安全上下文以及跨源隔离响应头，即 `Cross-Origin-Opener-Policy` 与 `Cross-Origin-Embedder-Policy`（简称 `COOP`/`COEP`）。服务器配置方法请参阅[跨源隔离配置](./cross-origin.md)。

如果使用 AI 编程助手，请参阅[使用 AI 编程助手](./coding-agents.md)了解 `npx skills add ohtaman/washi`、`llms.txt` 与现成提示词模板。

---

## 🚀 快速开始

每个 WaSHI 优化模型都遵循三个步骤：先声明带有限上下界的决策变量，再注册目标函数与具名约束，最后求解并校验结果。

下面的生产规划示例在木材与工时限制下最大化书桌和椅子的总利润：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("production");

// 1. 定义决策变量（设置合理的有限上下界 lb / ub）
const desks = m.integer("desks", { lb: 0, ub: 100 });
const chairs = m.integer("chairs", { lb: 0, ub: 100 });

// 2. 设定目标函数与约束条件
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_capacity");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_capacity");

// 3. 求解（默认内置 HiGHS WebAssembly）并验证结果
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.verify();
  console.log(status, report.valid); // "Optimal", true
  console.log(`利润: ${m.objectiveValue} (书桌=${desks.value}, 椅子=${chairs.value})`); // 1100 (书桌=20, 椅子=10)
}
```

1. **定义决策变量**：使用 `m.continuous()`、`m.integer()` 或 `m.binary()` 创建变量。已知范围时请提供有限的 `lb` 与 `ub` 上下界。
2. **编写目标函数与约束**：使用 `` expr`...` `` 书写代数公式。为每条约束传入清晰的名称，便于在模型不可行时定位冲突规则。
3. **求解并校验结果**：调用 `await m.solve()` 运行内置 HiGHS。先检查 `m.hasPrimalSolution` 再读取 `.value`，并用 `m.verify()` 校验约束是否满足。

---

## 🧭 下一步

### 选择开发方式

- **使用 AI 编程助手构建**：[使用 AI 编程助手](./coding-agents.md) — `npx skills add`、`llms.txt` / Context7 配置与现成提示词模板
- **直接使用 TypeScript 编写模型**：[建模指南](../guide/variables.md) — 变量容器、`sum` / `dot` 聚合、逻辑约束与冲突诊断

### 参考文档与示例

- **[实际案例与 API 索引](../examples/)**：涵盖排班优化、投资组合 QP 等 12 个可运行的优化与 SMT 案例
- **[求解器概览与对比](../solvers/)**：内置 HiGHS、Pumpkin 与可选 Z3、GLPK 的横向对比表
- **[运行时环境配置](./runtimes.md)**：Node.js、Vite / Next.js、CDN、单文件 HTML 与桌面/移动 WebView 配置说明
