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

仅在需要使用 **Z3**（SMT 逻辑约束与 Unsat Core 冲突诊断）或 **GLPK** 时安装可选依赖：

```bash
npm install z3-solver   # SMT 逻辑约束及 Unsat Core 冲突诊断
npm install glpk.js     # GLPK 求解器 (GPL-3.0)
```

---

## 💡 为什么选择 TypeScript 与 WebAssembly？

- **跨 Node.js 与浏览器零原生编译运行**：无需配置跨平台 C/C++ 编译环境，也无需维护独立的 Python 运行时。只需一次 `npm install`，同一套建模代码即可在 **Node.js 后端 API、CLI、脚本** 以及 **浏览器** 中直接运行。
- **轻量嵌入日常 UI 与浏览器标准 API**：不仅限于本地分析脚本，您可以零后端运维成本发布 **打开链接即可使用的 Web 小工具、轻量游戏或 Chrome 扩展**。还能在无需网络往返、数据不出本地的前提下，将数理优化直接接入拖拽交互 UI，或与屏幕/摄像头采集、语音识别（Web Speech API）等 **浏览器标准功能** 即时联动。
- **从应用数据到模型的一致类型安全**：利用 TypeScript 类型系统避免优化建模中常见的下标错位与字典键名拼写错误。通过带类型的变量字典（`Record<K, Var>`）与引用绑定（`` expr`30 * ${qty.desk} <= 40` ``），模型可与应用侧数据结构无缝衔接，保留编译期变量/键检查、IDE 自动补全与符号重命名。
- **AI 辅助开发与 LLM 协同的高契合度**：应用逻辑与优化模型统一在 **单一 TypeScript 代码库** 中，无需跨越 Python 服务边界即可在同一测试环境中完成端到端验证，并轻松部署为静态站点或单一服务。这种易于测试与部署的闭环非常适合 AI 辅助编程；同时在运行时，也能在同一运行环境中将 LLM 的灵活条件提取与求解器的严格约束满足及冲突诊断（Unsat Core）简洁结合。

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
