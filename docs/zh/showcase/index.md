---
title: 案例展示
sidebar: false
aside: false
---

<div class="washi-showcase">

# 案例展示

<p class="washi-showcase-lead">
体验无需外部服务器、全部在浏览器本地运行的交互式 Playground、决策支持应用与数理优化益智游戏。
</p>

<div class="washi-showcase-section">

## ⚡ Playground

<div class="washi-showcase-grid">
  <div class="washi-showcase-card is-primary">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-playground.png" alt="WaSHI Playground" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">⚡</span>
          <span class="washi-showcase-badge">HiGHS · Pumpkin · Z3 · GLPK</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/demo/" target="_self" class="washi-showcase-title-link">WaSHI Playground</a>
        </div>
        <p class="washi-showcase-desc">
          在浏览器中用 TypeScript / JavaScript 编写 LP、MIP、凸 QP、CP 与 SMT 模型并通过 WebAssembly 本地求解。内置预设案例、LP 导出检查、灵敏度分析与 <code>unsatCore</code> 冲突诊断。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/demo/" target="_self" class="washi-showcase-cta">打开 Playground →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-exercises.png" alt="数理优化 N 题训练" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">📘</span>
          <span class="washi-showcase-badge">WaSHI (TS) × PuLP (Python)</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/exercises/?lang=zh" target="_self" class="washi-showcase-title-link">数理优化 N 题训练</a>
        </div>
        <p class="washi-showcase-desc">
          在浏览器本地运行的交互式数理优化 N 题训练。支持并排对比 TypeScript 版 WaSHI 与 Python 版 PuLP（Pyodide 上的 <code>highspy</code>），并提供自动评测与建模说明。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/exercises/?lang=zh" target="_self" class="washi-showcase-cta">开始练习 →</a>
      </div>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🏥 实际应用

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-ai-shift.png" alt="护士排班 AI 助手" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🏥</span>
          <span class="washi-showcase-badge">Gemini Nano × HiGHS MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/apps/ai-shift/" target="_self" class="washi-showcase-title-link">护士排班 AI 助手</a>
        </div>
        <p class="washi-showcase-desc">
          通过 WaSHI 与 HiGHS MIP 本地求解 30 人 × 1 个月三班倒排班并诊断冲突。自然语言规则输入需在支持 Chrome Built-in AI（Gemini Nano）的 Chrome 浏览器中运行。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/apps/ai-shift/" target="_self" class="washi-showcase-cta">打开应用 →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-ai-timetable.png" alt="大学排课 AI Copilot" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🎓</span>
          <span class="washi-showcase-badge">Gemini Nano × HiGHS MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学排课 AI Copilot</a>
        </div>
        <p class="washi-showcase-desc">
          使用 WaSHI 与 HiGHS MIP 求解涵盖 4 个年级、10 位教师与 7 间教室的大学课程排课问题（UCTP）并诊断冲突。自然语言规则添加需要 Chrome Built-in AI（Gemini Nano）。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/apps/ai-timetable/" target="_self" class="washi-showcase-cta">打开应用 →</a>
        <a href="/apps/ai-timetable-theory/?lang=zh" target="_self" class="washi-showcase-theory-btn">📖 阅读解说文章 →</a>
      </div>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🎮 优化解谜游戏

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-demon-castle.png" alt="魔王城24小时警备排班" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🏰</span>
          <span class="washi-showcase-badge">排班调度 MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/demon-castle-shift/" target="_self" class="washi-showcase-title-link">魔王城24小时警备排班</a>
        </div>
        <p class="washi-showcase-desc">
          与参谋莉莉丝一起，昼夜抵御勇者军进攻的排班解谜游戏。兼顾每位守卫擅长的时段与休息规则，合理安排班表守住城门。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/demon-castle-shift/" target="_self" class="washi-showcase-cta">开始游戏 →</a>
        <a href="/games/demon-castle-shift-theory/?lang=zh" target="_self" class="washi-showcase-theory-btn">📖 阅读解说文章 →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-mofumofu-sheep.png" alt="毛茸茸绵羊的牧场围栏" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🐑</span>
          <span class="washi-showcase-badge">图割与牧场围栏 MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">毛茸茸绵羊的牧场围栏</a>
        </div>
        <p class="washi-showcase-desc">
          用有限数量的木栅栏阻断野狼入侵路线的围栏解谜游戏。在填平或避开坑洞的同时，让小羊莫可的安全牧场包含尽可能多的野草莓。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-cta">开始游戏 →</a>
        <a href="/games/mofumofu-sheep-theory/?lang=zh" target="_self" class="washi-showcase-theory-btn">📖 阅读解说文章 →</a>
      </div>
    </div>
  </div>
  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-titan-pack.png" alt="TITAN PACK" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">⚡</span>
          <span class="washi-showcase-badge">二维装箱 MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
        </div>
        <p class="washi-showcase-desc">
          与质检无人机 UNIT-74 一起将订单零件严丝合缝排入钛合金母材平板。以实时二维切割 MIP 体验零废料与零通断层的完美方案。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/titan-pack/" target="_self" class="washi-showcase-cta">开始游戏 →</a>
        <a href="/games/titan-pack-theory/?lang=zh" target="_self" class="washi-showcase-theory-btn">📖 阅读解说文章 →</a>
      </div>
    </div>
  </div>
</div>

</div>

</div>
