# 安装与入门

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）为 TypeScript / JavaScript 带来了类似于 Python **PuLP** 的代数建模方式。通过标签模板字面量（`expr`）直观地编写代数公式，并借助 WebAssembly 求解器（**HiGHS**, **Z3**, **GLPK**）直接在 **Node.js 与浏览器** 中求解数理优化问题。

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
  const report = m.validateSolution();
  console.log(status, report.valid); // "Optimal", true
  console.log(`利润: ${m.objectiveValue} (书桌=${desks.value}, 椅子=${chairs.value})`); // 1100 (书桌=20, 椅子=10)
}
```

---

## 📦 安装

默认的 **HiGHS** 求解器（LP / MIP / 凸QP）已内置随包提供，开箱即用：

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

仅在需要使用 **Z3**（SMT 逻辑约束与 Unsat Core 冲突诊断）、**GLPK** 或 AI 编程助手技能时按需安装：

```bash
npm install z3-solver   # SMT 逻辑约束及 Unsat Core 冲突诊断
npm install glpk.js     # GLPK 求解器 (GPL-3.0)

# 可选：为 AI 编程助手（Claude Code, Cursor, Codex 等）安装建模技能
npx skills add ohtaman/washi
```

---

## 🔍 基本工作流要点

开篇代码涵盖了 WaSHI 建模的三个核心要点：

1. **为变量提供合理的有限上下界（`lb`, `ub`）**：使用 `m.continuous` / `m.integer` / `m.binary` 定义变量时，指定有限上下界有助于强化 MIP 预处理（Presolve）并为逻辑约束自动推导紧凑的 Big-M。
2. **用 `expr` 编写目标函数与约束**：使用 `` m.objective(maximize(expr`...`)) `` 与 `` m.constraint(expr`... <= ...`, "名称") ``。为约束命名可在模型不可行（Infeasible）时直接定位冲突规则。
3. **检查 `hasPrimalSolution` 并调用 `validateSolution()`**：在 `await m.solve()` 之后，先通过 `m.hasPrimalSolution` 确认存在可行解再读取变量的 `.value`；调用 `m.validateSolution()` 可在容差范围内独立校验边界、整数性与约束满足情况。

---

## 🧭 下一步

- **[建模指南](/zh/guide/variables)**：数组/字典变量定义、聚合函数（`sum`, `dot`）、逻辑约束与不可行冲突诊断（Unsat Core）
- **[实际案例与 API 索引](/zh/examples/)**：排班优化、投资组合 QP、车辆路径规划等 11 个可在页面内直接运行的建模示例
- **[求解器概览与对比](/zh/solvers/)**：内置 HiGHS 与可选 Z3、GLPK 求解器的特性对比与切换方式
- **[运行时环境配置](/zh/getting-started/runtimes)**：Node.js、Vite / Next.js 打包工具、CDN 与静态托管配置说明
