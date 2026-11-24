---
layout: home

hero:
  text: "TypeScript 数理优化建模器"
  tagline: "Python PuLP 的 TypeScript 替代方案。使用直观中缀表达式构建 LP、MIP、凸 QP、CP 与 SMT 模型，通过内置 HiGHS、Pumpkin 或可选 Z3、GLPK 在浏览器与 Node.js 中本地求解。"
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/getting-started/
    - theme: alt
      text: 百题训练
      link: /exercises/?lang=zh
    - theme: alt
      text: 案例展示
      link: /zh/showcase/

features:
  - icon: 🌐
    title: WebAssembly 零原生依赖运行
    details: 无需 Python 服务或本地 C/C++ 编译，直接在浏览器（Web Worker）与 Node.js 中本地求解优化模型。
    link: /zh/getting-started/runtimes
    linkText: 运行时环境配置
  - icon: ✍️
    title: 直观的代数建模
    details: 无需手动拼接矩阵或 LP 文本，以贴近 PuLP 的中缀数学表达式编写线性、整数、凸二次、约束规划与逻辑模型。
    link: /zh/guide/expressions
    linkText: 代数表达式
  - icon: 🧩
    title: TypeScript 类型安全建模
    details: 将决策变量直接绑定到应用数据结构，在编译期拦截键名拼写错误、索引错位以及数值与布尔类型混用。
    link: /zh/guide/variables
    linkText: 决策变量与定义域
  - icon: 🔍
    title: 定位“无解”的冲突原因
    details: 当约束相互冲突导致无可行解时，可借助内置 HiGHS 或 Pumpkin，以及可选 Z3 定位相互矛盾的规则。
    link: /zh/guide/unsat-core
    linkText: 冲突诊断、解验证与调试
  - icon: ⚙️
    title: 可插拔求解器架构
    details: 编写一次模型，即可在内置 HiGHS 与 Pumpkin、可选 Z3 与 GLPK 插件或自定义求解器之间按需切换。
    link: /zh/solvers/
    linkText: 求解器概览
  - icon: 🔀
    title: 面向大规模问题的分解算法
    details: 内置列生成、Benders 分解以及 LP 松弛与对偶值（影子价格）读取能力，适合大规模组合优化问题。
    link: /zh/guide/decomposition
    linkText: 分解法
---

<div class="washi-home-sections">

<div class="washi-home-showcase">
<div class="washi-home-showcase-head">
<h2>基于 WaSHI 构建的应用</h2>
<a href="/zh/showcase/" class="washi-home-all-link">查看全部案例 →</a>
</div>
<p class="washi-home-showcase-sub">
完全通过浏览器端 WebAssembly 本地运行的排班决策应用与数理优化解谜游戏，无需后端服务器通信。
</p>
<div class="washi-home-showcase-grid">
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-ai-timetable.png" alt="" width="960" height="540" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">🎓</span>
<span class="washi-showcase-badge">Gemini Nano × HiGHS MIP</span>
</div>
<div class="washi-showcase-title">
<a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学排课 AI Copilot</a>
</div>
<p class="washi-showcase-desc">
同时协调 4 个年级课表、10 位教师出勤与 7 间专业教室，支持 CSV 导入与自然语言排课规则求解。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">打开应用 →</span>
</div>
</div>
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-titan-pack.png" alt="" width="640" height="360" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">⚡</span>
<span class="washi-showcase-badge">二维装箱 MIP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
</div>
<p class="washi-showcase-desc">
将订单零件排入母材平板，基于实时 MIP 求解体验零废料与零通断层的二维板材切割优化。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">打开游戏 →</span>
</div>
</div>
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-mofumofu-sheep.png" alt="" width="960" height="540" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">🐑</span>
<span class="washi-showcase-badge">图割与牧场围栏 MIP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">毛茸茸绵羊的牧场围栏</a>
</div>
<p class="washi-showcase-desc">
用有限数量的木栅栏阻断野狼入侵路线，并通过精确图割 MIP 最大化安全牧场内的野草莓收益。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">打开游戏 →</span>
</div>
</div>
</div>
</div>

<div class="washi-home-docs-dir">

## 文档导航

<div class="tip custom-block" style="padding-top: 8px;">

- **快速上手**: [安装与入门](/zh/getting-started/) · [使用 AI 编程助手](/zh/getting-started/coding-agents) · [运行时环境配置](/zh/getting-started/runtimes) · [跨源隔离配置](/zh/getting-started/cross-origin)
- **建模基础**: [决策变量与定义域](/zh/guide/variables) · [代数表达式](/zh/guide/expressions)（`expr`, `sum`, `dot`） · [约束条件](/zh/guide/constraints) · [目标函数与求解](/zh/guide/objectives)
- **进阶建模**: [冲突诊断、解验证与调试](/zh/guide/unsat-core) · [约束规划 (CP) 建模](/zh/guide/constraint-programming) · [分解法](/zh/guide/decomposition) · [建模模式与实战技巧](/zh/guide/formulation-tips)
- **求解器适配**: [求解器概览](/zh/solvers/) · [HiGHS](/zh/solvers/highs) · [Pumpkin](/zh/solvers/pumpkin) · [Z3](/zh/solvers/z3) · [GLPK](/zh/solvers/glpk) · [自定义求解器开发指南](/zh/solvers/custom-solver)
- **实战案例 — LP / MIP / QP**: [实际案例与 API 功能索引](/zh/examples/) · [生产计划问题](/zh/examples/production) · [0-1 背包问题](/zh/examples/knapsack) · [运输与分配网络](/zh/examples/transportation) · [营养问题与灵敏度分析](/zh/examples/diet-sensitivity) · [投资组合优化 (QP)](/zh/examples/portfolio-qp)
- **实战案例 — 排班与 CP**: [员工排班与休假冲突诊断](/zh/examples/shift-scheduling) · [电商购物车与优惠券优化](/zh/examples/ecommerce-coupons) · [资源受限项目调度 (CP)](/zh/examples/project-scheduling)
- **实战案例 — SMT、诊断与分解法**: [SMT 安全策略验证](/zh/examples/smt-security) · [约束冲突诊断 (Unsat Core)](/zh/examples/unsat-core) · [车辆路径规划问题 (CVRP)](/zh/examples/vehicle-routing) · [旅行商问题 (TSP)](/zh/examples/traveling-salesperson)
- **交互式 Playground 与应用**: [案例展示](/zh/showcase/) · <a href="/demo/" target="_self">WaSHI Playground</a> · <a href="/exercises/" target="_self">数理优化百题训练</a> · <a href="/apps/ai-shift/" target="_self">护士排班 AI 助手</a> · <a href="/apps/ai-timetable/" target="_self">大学排课 AI Copilot</a>
- **优化解谜游戏**: <a href="/games/demon-castle-shift/" target="_self">魔王城24小时警备排班</a> · <a href="/games/mofumofu-sheep/" target="_self">毛茸茸绵羊的牧场围栏</a> · <a href="/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
