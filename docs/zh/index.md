---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "适用于 TypeScript 的现代数理优化与代数建模系统"
  tagline: WebAssembly 代数建模系统（LP, MIP, QP, SMT）。在 Node.js、浏览器、Bun、Deno 和 Next.js 中原生高速求解。
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/getting-started/
    - theme: alt
      text: 在线演练场 ↗
      link: https://ohtaman.github.io/washi/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/ohtaman/washi

features:
  - icon: 🌐
    title: 100% 纯客户端运行 & 零后端服务器成本
    details: 完全在 WebAssembly 中求解工业级混合整数优化问题。离线可用、数据绝对私密（敏感商业数据无需上传至云端）。
  - icon: ✍️
    title: 直观优雅的代数建模体验
    details: 直观的领域变量（m.binary, m.integer, m.continuous）、公式模板（expr`...`, c`...`）、向量聚合（dot, sum）与声明式约束语法（m.constraint）。
  - icon: ⚡
    title: 工业级多求解器架构
    details: 内置默认 HiGHS（LP/MIP/QP），并无缝支持插件化接入 Z3（SMT 逻辑与约束冲突诊断）及 GLPK。
  - icon: 🔍
    title: 自动化约束冲突诊断 (Unsat Core)
    details: 当业务规则矛盾导致不可行（Infeasible）时，利用 Z3 引擎精准提取导致冲突的极小约束子集。
---

<div style="max-width: 800px; margin: 40px auto;">

## 快速示例

```typescript
import { Model, expr, c, maximize } from "@ohtaman/washi";

// 1. 创建模型
const m = new Model("木工产品利润最大化");

// 2. 定义整数决策变量
const desks = m.integer("桌子", { lb: 0 });
const chairs = m.integer("椅子", { lb: 0 });

// 3. 设置目标函数（桌子利润 $30，椅子利润 $50）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 添加约束条件（木材与工时上限）
m.constraint(c`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
m.constraint(c`2 * ${desks} + ${chairs} <= 50`, "labor_limit");

// 5. 调用 WebAssembly (HiGHS) 求解
await m.solve();

console.log(`生产方案: 桌子=${desks.value}, 椅子=${chairs.value}`);
console.log(`最大利润: $${m.objectiveValue}`);
```

</div>
