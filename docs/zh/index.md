---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "适用于 TypeScript 与 JavaScript 的代数建模器"
  tagline: 基于 WebAssembly 的数理优化与 SMT 建模接口（LP, MIP, 凸QP, SMT）。在 TypeScript 中构建代数模型，并通过 HiGHS、Z3 与 GLPK 在本地求解。
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/getting-started/
    - theme: alt
      text: 文档指南
      link: /zh/guide/variables
    - theme: alt
      text: 在线演练场 ↗
      link: https://ohtaman.github.io/washi/demo/

features:
  - icon: ✍️
    title: 代数模型构建 (expr)
    details: 使用标签模板（expr`30 * ${x} + 50 * ${y} <= 40`）、向量点积（dot）与求和（sum），将 ${...} 直接绑定为强类型的变量对象引用。
    link: /zh/guide/expressions
    linkText: 表达式指南
  - icon: ⚙️
    title: 可插拔求解器适配器
    details: 通过统一的建模 API 调用内置默认的 HiGHS（LP/MIP/凸QP）以及可选的 Z3（SMT 逻辑与冲突诊断）和 GLPK 插件。
    link: /zh/solvers/
    linkText: 求解器矩阵
  - icon: 🌐
    title: WebAssembly 本地执行
    details: 无需单独的 Python 服务或 C/C++ 本地编译即可在 Node.js 或浏览器 Web Worker 中求解，支持作为静态资源部署并与浏览器端 LLM 协同。
    link: /zh/getting-started/runtimes
    linkText: 运行时环境
  - icon: 🔍
    title: 冲突约束诊断 (unsatCore)
    details: 借助命名约束与 Z3 适配器提取不可行模型的冲突约束子集（unsatCore），定位相互矛盾的约束条件。
    link: /zh/guide/unsat-core
    linkText: Unsat Core 诊断
---

<div style="max-width: 800px; margin: 40px auto;">

## 快速示例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

// 1. 创建模型
const m = new Model("木工产品利润最大化");

// 2. 定义整数决策变量
const desks = m.integer("桌子", { lb: 0 });
const chairs = m.integer("椅子", { lb: 0 });

// 3. 设置目标函数（桌子利润 $30，椅子利润 $50）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 添加约束条件（木材与工时上限）
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_limit");

// 5. 调用 WebAssembly (HiGHS) 求解
await m.solve();

console.log(`生产方案: 桌子=${desks.value}, 椅子=${chairs.value}`);
console.log(`最大利润: $${m.objectiveValue}`);
```

</div>
