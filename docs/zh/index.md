---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "适用于数理优化与约束编程的代数建模器"
  tagline: "Python PuLP 与 Julia JuMP 的 TypeScript 替代方案。使用直观的中缀数学表达式构建 LP、MIP、凸 QP 与 SMT 模型，基于 WebAssembly（HiGHS、Z3、GLPK）在客户端高效求解，无需 Python 服务或本地 C++ 依赖。"
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/getting-started/
    - theme: alt
      text: 案例展示
      link: /zh/showcase/

features:
  - icon: ✍️
    title: 代数模型构建 (expr)
    details: 使用标签模板（expr`30 * ${x} + 50 * ${y} <= 40`）、向量点积（dot）与求和（sum），将 ${...} 直接绑定为强类型的变量对象引用。
    link: /zh/guide/expressions
    linkText: 数学表达式
  - icon: ⚙️
    title: 可插拔求解器适配器
    details: 通过统一的建模 API 调用内置默认的 HiGHS（LP/MIP/凸QP）以及可选的 Z3（SMT 逻辑与冲突诊断）和 GLPK 插件。
    link: /zh/solvers/
    linkText: 求解器
  - icon: 🌐
    title: WebAssembly 本地执行
    details: 无需单独的 Python 服务或 C/C++ 本地编译即可在 Node.js 或浏览器 Web Worker 中求解，支持作为静态资源部署并与浏览器端 LLM 协同。
    link: /zh/getting-started/runtimes
    linkText: 运行时环境配置
  - icon: 🔍
    title: 冲突约束诊断 (unsatCore)
    details: 借助命名约束与 Z3 适配器提取不可行模型的冲突约束子集（unsatCore），定位相互矛盾的约束条件。
    link: /zh/guide/unsat-core
    linkText: 不可行冲突诊断 (Unsat Core)
---

<div style="max-width: 800px; margin: 40px auto;">

## 快速示例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

// 1. 创建模型
const m = new Model("木工产品利润最大化");

// 2. 定义带合理上下界的整数决策变量
const desks = m.integer("桌子", { lb: 0, ub: 100 });
const chairs = m.integer("椅子", { lb: 0, ub: 100 });

// 3. 设置目标函数（桌子利润 $30，椅子利润 $50）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 添加约束条件（木材与工时上限）
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_limit");

// 5. 调用 WebAssembly (HiGHS) 求解
await m.solve();

if (m.hasPrimalSolution) {
  console.log(`生产方案: 桌子=${desks.value}, 椅子=${chairs.value}`);
  console.log(`最大利润: $${m.objectiveValue}`);
}
```

## 文档导航

<div class="tip custom-block" style="padding-top: 8px;">

- **快速上手**: [简介与安装](./getting-started/) · [AI 编程助手快速参考](./getting-started/ai-agents) · [运行环境](./getting-started/runtimes) · [Cross-Origin 隔离配置](./getting-started/cross-origin)
- **建模指南**: [变量与上下界](./guide/variables) · [表达式 (expr, dot, sum)](./guide/expressions) · [目标函数](./guide/objectives) · [约束条件](./guide/constraints) · [不可行冲突诊断 (Unsat Core)](./guide/unsat-core)
- **求解器适配**: [HiGHS (内置)](./solvers/highs) · [Z3 (SMT)](./solvers/z3) · [GLPK (LP/MIP)](./solvers/glpk) · [自定义求解器适配器](./solvers/custom-solver)
- **实战范例**: [饮食配方与敏感度分析](./examples/diet-sensitivity) · [生产规划](./examples/production) · [背包问题](./examples/knapsack) · [投资组合二次规划 (QP)](./examples/portfolio-qp) · [排班调度](./examples/shift-scheduling) · [SMT 安全策略验证](./examples/smt-security)
- **交互式演示**: [应用与游戏展厅](./showcase/)

</div>

</div>
