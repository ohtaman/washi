# 安装与入门

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）为 TypeScript / JavaScript 带来了类似于 Python **PuLP** 的代数建模方式。通过标签模板字面量（`expr`）直观地编写代数公式，并借助 WebAssembly 求解器（**HiGHS**, **Pumpkin**, **Z3**, **GLPK**）直接在 **Node.js 与浏览器** 中求解数理优化与约束规划问题。

---

## 📦 安装

默认的 **HiGHS** 求解器（LP / MIP / 凸QP）与 **Pumpkin** CP/LCG 求解器（`@ohtaman/washi/solvers/pumpkin`）均零外部依赖内置随包提供，开箱即用：

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

仅在需要使用 **Z3**（SMT 逻辑约束与 Unsat Core 冲突诊断）或 **GLPK** 时按需安装可选依赖：

```bash
npm install z3-solver   # SMT 逻辑约束及 Unsat Core 冲突诊断
npm install glpk.js     # GLPK 求解器 (GPL-3.0)
```

如果使用 AI 编程助手，请参阅[使用 AI 编程助手](./coding-agents.md)了解 `npx skills add ohtaman/washi`、`llms.txt` 与现成提示词模板。

---

## 🚀 快速开始

以下生产规划问题展示了 WaSHI 建模的基本流程（1. 定义变量 $\to$ 2. 设置目标函数与约束 $\to$ 3. 求解与校验）：

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

1. **定义决策变量（`lb`, `ub`）**：使用 `m.continuous()`、`m.integer()` 或 `m.binary()` 定义变量，并在已知范围时指定有限上下界。
2. **用 `expr` 编写目标函数与约束**：使用 `` expr`...` `` 直观书写代数公式；为约束命名可在模型不可行（`Infeasible`）时快速定位冲突原因。
3. **求解并校验结果（`solve`, `verify`）**：调用 `await m.solve()` 使用内置 HiGHS 求解器求解。先检查 `m.hasPrimalSolution` 再读取变量的 `.value`，并可调用 `m.verify()` 独立校验边界、整数性与约束满足情况。

---

## 🧭 下一步

### 选择开发方式

- **使用 AI 编程助手构建**：[使用 AI 编程助手](./coding-agents.md) — `npx skills add`、`llms.txt` / Context7 配置、各类数学问题与部署形态的现成提示词，以及冲突调试指南
- **直接使用 TypeScript 编写模型**：[建模指南](../guide/variables.md) — 数组/字典变量定义、聚合函数（`sum`, `dot`）、逻辑约束与冲突诊断

### 参考文档与示例

- **[实际案例与 API 索引](../examples/)**：排班优化、投资组合 QP、车辆路径规划等 12 个可参考与运行的建模示例
- **[求解器概览与对比](../solvers/)**：内置 HiGHS 与 Pumpkin，以及可选 Z3、GLPK 求解器的特性对比与切换方式
- **[运行时环境配置](./runtimes.md)**：Node.js、Vite / Next.js 打包工具、CDN、单文件 HTML 与桌面/移动 WebView 配置说明
