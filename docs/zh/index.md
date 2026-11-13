---
layout: home

hero:
  text: "TypeScript 数理优化建模器"
  tagline: "Python PuLP 的 TypeScript 替代方案。使用直观的中缀数学表达式构建 LP、MIP、凸 QP 与 SMT 模型，基于 WebAssembly（HiGHS、Z3、GLPK）在浏览器与 Node.js 中高效求解，无需 Python 服务或本地 C++ 依赖。"
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/getting-started/
    - theme: alt
      text: 案例展示
      link: /zh/showcase/

features:
  - icon: 📅
    title: 排班、排课与路径优化
    details: 使用内置 HiGHS（LP / MIP）高效求解人员排班、大学排课、二维装箱与车辆路径等组合优化问题。
    link: /zh/examples/
    linkText: 实战范例
  - icon: 📈
    title: 投资组合与连续资源分配
    details: 通过凸二次目标函数（QuadExpr）直接构建马科维茨投资组合风险最小化与连续指标拟合模型。
    link: /zh/examples/portfolio-qp
    linkText: 投资组合优化
  - icon: 🔍
    title: 逻辑规则验证与冲突诊断
    details: 当排班或业务规则因条件冲突而无可行解时，通过内置 HiGHS 弹性松弛或 Z3 严格冲突核（unsatCore）精准定位相互矛盾的约束。
    link: /zh/guide/unsat-core
    linkText: 冲突约束诊断
  - icon: 🌐
    title: 零后端部署与端侧运行
    details: 无需 Python 后端即可在浏览器 Web Worker 与 Node.js 中本地运行，可作为端侧大模型的数理校验护栏。
    link: /zh/getting-started/runtimes
    linkText: 运行时环境配置
---

<div class="washi-home-sections">

<div class="washi-home-showcase">
<div class="washi-home-showcase-head">
<h2>基于 WaSHI 构建的应用</h2>
<a href="/zh/showcase/" class="washi-home-all-link">查看全部案例 →</a>
</div>
<p class="washi-home-showcase-sub">
完全通过浏览器端 WebAssembly 本地运行的排班决策应用与数理优化解谜游戏，无需任何后端服务器通信。
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
<span class="washi-showcase-badge">Gemini Nano × HiGHS MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学排课 AI Copilot</a>
</div>
<p class="washi-showcase-desc">
同时协调 4 个年级课表、10 位教师出勤与 7 间专业教室，支持 CSV 导入与自然语言复杂排课规则求解。
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
<span class="washi-showcase-badge">二维装箱 MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
</div>
<p class="washi-showcase-desc">
将订单零件严丝合缝排入母材平板，基于实时 MILP 求解器体验零废料与零通断层的二维板材切割优化。
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
<span class="washi-showcase-badge">图割与牧场围栏 MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">毛茸茸绵羊的牧场围栏</a>
</div>
<p class="washi-showcase-desc">
用有限数量的木栅栏阻断野狼入侵路线，并通过精确整数规划最大化安全牧场内的野草莓收益。
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

- **快速上手**: [简介与安装](/zh/getting-started/) · [运行环境](/zh/getting-started/runtimes) · [Cross-Origin 隔离配置](/zh/getting-started/cross-origin) · [AI 编程助手快速参考](/zh/getting-started/ai-agents)
- **建模指南**: [变量与上下界](/zh/guide/variables) · [表达式 (expr, dot, sum)](/zh/guide/expressions) · [目标函数](/zh/guide/objectives) · [约束条件](/zh/guide/constraints) · [不可行冲突诊断 (Unsat Core)](/zh/guide/unsat-core) · [分解算法 (列生成与 Benders)](/zh/guide/decomposition) · [建模模式与优化技巧](/zh/guide/formulation-tips)
- **求解器适配**: [求解器概览与对比](/zh/solvers/) · [HiGHS (内置)](/zh/solvers/highs) · [Z3 (SMT)](/zh/solvers/z3) · [GLPK (LP/MIP)](/zh/solvers/glpk) · [自定义求解器适配器](/zh/solvers/custom-solver)
- **实战范例**: [范例总览与 API 速查](/zh/examples/) · [生产规划](/zh/examples/production) · [背包问题](/zh/examples/knapsack) · [运输网络规划](/zh/examples/transportation) · [饮食配方与敏感度分析](/zh/examples/diet-sensitivity) · [排班调度](/zh/examples/shift-scheduling) · [电商优惠券优化](/zh/examples/ecommerce-coupons) · [投资组合二次规划 (QP)](/zh/examples/portfolio-qp) · [SMT 安全策略验证](/zh/examples/smt-security) · [冲突约束诊断 (Unsat Core)](/zh/examples/unsat-core) · [车辆路径问题 (列生成)](/zh/examples/vehicle-routing) · [旅行商问题 (Benders 分解)](/zh/examples/traveling-salesperson)
- **交互式 Playground 与展厅**: [应用与游戏展厅](/zh/showcase/) · <a href="/demo/" target="_self">WaSHI Playground</a> · <a href="/apps/ai-shift/" target="_self">护士排班 AI 助手</a> · <a href="/apps/ai-timetable/" target="_self">大学排课 AI Copilot</a> · <a href="/games/demon-castle-shift/" target="_self">魔王城24小时警备排班</a> · <a href="/games/mofumofu-sheep/" target="_self">毛茸茸绵羊的牧场围栏</a> · <a href="/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
