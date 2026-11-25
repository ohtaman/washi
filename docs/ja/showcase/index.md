---
title: ショーケース
sidebar: false
aside: false
---

<div class="washi-showcase">

# ショーケース

<p class="washi-showcase-lead">
外部サーバーを使わずブラウザ内でローカルに動作する対話型 Playground、実務スケジューリングアプリ、数理最適化パズルゲームを体験できます。
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
          LP・MIP・凸 QP・CP・SMT モデルを TypeScript / JavaScript で記述し、ブラウザ内の WebAssembly で求解できます。プリセット問題、LP 形式での出力確認、感度分析、<code>unsatCore</code> による矛盾診断に対応しています。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/demo/" target="_self" class="washi-showcase-cta">Playground を開く →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-exercises.png" alt="数理最適化100本ノック" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">📘</span>
          <span class="washi-showcase-badge">WaSHI (TS) × PuLP (Python)</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/exercises/?lang=ja" target="_self" class="washi-showcase-title-link">数理最適化100本ノック</a>
        </div>
        <p class="washi-showcase-desc">
          ブラウザ内で完結する全 100 問の対話型数理最適化演習です。TypeScript（WaSHI）と Python（PuLP / Pyodide 上の <code>highspy</code>）の解答を並べて実行・自動採点でき、数式解説も確認できます。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/exercises/?lang=ja" target="_self" class="washi-showcase-cta">演習を始める →</a>
      </div>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🏥 実務アプリケーション

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-ai-shift.png" alt="ナーススケジューリング AI Copilot" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🏥</span>
          <span class="washi-showcase-badge">Gemini Nano × HiGHS MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/apps/ai-shift/" target="_self" class="washi-showcase-title-link">ナーススケジューリング AI Copilot</a>
        </div>
        <p class="washi-showcase-desc">
          30 名・1 ヶ月の 3 交代シフトを WaSHI と HiGHS（MIP ソルバー）でローカル最適化し、実行不能時は制約の矛盾診断を行います。自然言語での条件入力には Chrome Built-in AI（Gemini Nano）に対応したブラウザ環境が必要です。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/apps/ai-shift/" target="_self" class="washi-showcase-cta">アプリを開く →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-ai-timetable.png" alt="大学時間割編成 AI Copilot" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🎓</span>
          <span class="washi-showcase-badge">Gemini Nano × HiGHS MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学時間割編成 AI Copilot</a>
        </div>
        <p class="washi-showcase-desc">
          4 学年・10 教員・7 教室の大学時間割編成問題（UCTP）を WaSHI と HiGHS（MIP ソルバー）で求解し、制約の矛盾診断も行います。自然言語でのルール追加には Chrome Built-in AI（Gemini Nano）に対応したブラウザ環境が必要です。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/apps/ai-timetable/" target="_self" class="washi-showcase-cta">アプリを開く →</a>
        <a href="/apps/ai-timetable-theory/?lang=ja" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
      </div>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🎮 パズルゲーム

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-demon-castle.png" alt="魔王城の24時間警備シフト" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🏰</span>
          <span class="washi-showcase-badge">シフト編成 MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/demon-castle-shift/" target="_self" class="washi-showcase-title-link">魔王城の24時間警備シフト</a>
        </div>
        <p class="washi-showcase-desc">
          参謀リリスと共に、昼夜を問わず進軍する勇者軍から魔王城を守るシフト編成パズルです。各メンバーの得意時間帯を活かし、休息ルールを守りながら城を防衛します。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/demon-castle-shift/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
        <a href="/games/demon-castle-shift-theory/?lang=ja" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
      </div>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div class="washi-showcase-thumb">
      <img src="/showcase/thumb-mofumofu-sheep.png" alt="もふもふ羊の牧場囲い" class="washi-showcase-thumb-img" loading="lazy" />
    </div>
    <div class="washi-showcase-card-body">
      <div>
        <div class="washi-showcase-card-top">
          <span class="washi-showcase-icon">🐑</span>
          <span class="washi-showcase-badge">領域分離・最小カット MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">もふもふ羊の牧場囲い</a>
        </div>
        <p class="washi-showcase-desc">
          限られた木の柵でオオカミの侵入ルートを遮断する囲い込みパズルです。穴ぼこを埋めたり避けたりしながら、羊のモコたちが歩ける安全な牧場内の野いちごの数を最大化します。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
        <a href="/games/mofumofu-sheep-theory/?lang=ja" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
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
          <span class="washi-showcase-badge">2 次元パッキング MIP</span>
        </div>
        <div class="washi-showcase-title">
          <a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
        </div>
        <p class="washi-showcase-desc">
          検査ドローン「チタノ助」と共に、注文パーツをチタン母材へ隙間なく配置するパズルです。断層（fault line）を残さず端材ロス 0% を目指す 2 次元パッキングの MIP 最適化を体験できます。
        </p>
      </div>
      <div class="washi-showcase-actions">
        <a href="/games/titan-pack/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
        <a href="/games/titan-pack-theory/?lang=ja" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
      </div>
    </div>
  </div>
</div>

</div>

</div>
