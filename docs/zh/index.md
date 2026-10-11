---
layout: home

hero:
  name: "WaSHI"
  text: "适用于 TypeScript 的现代数理优化与代数建模系统"
  tagline: WebAssembly 代数建模系统（LP, MIP, QP, SMT）。在 Node.js、浏览器、Bun、Deno 和 Next.js 中原生高速求解。
  image:
    src: /washi-header.svg
    alt: WaSHI Logo
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
    details: 将 Python PuLP 与 Julia JuMP 的开发体验带入 TypeScript。通过标签模板字面量（expr`...`, c`...`）自然地编写数学表达式。
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
import { Model, expr, c } from "@ohtaman/washi";

// 1. 创建模型
const m = new Model({ sense: "Maximize" });

// 2. 定义整数决策变量
const x = m.addVar({ type: "Integer", lb: 0, name: "桌子" });
const y = m.addVar({ type: "Integer", lb: 0, name: "椅子" });

// 3. 设置目标函数（桌子利润 $30，椅子利润 $50）
m.maximize(expr`30 * ${x} + 50 * ${y}`);

// 4. 添加约束条件（木材与工时上限）
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

// 5. 调用 WebAssembly (HiGHS) 求解
await m.solve();

console.log(`生产方案: 桌子=${x.value}, 椅子=${y.value}`);
console.log(`最大利润: $${m.objectiveValue}`);
```

</div>
