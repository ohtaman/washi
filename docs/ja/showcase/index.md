---
title: ショーケース
sidebar: false
aside: false
---

<div class="washi-showcase">

# ショーケース

<p class="washi-showcase-lead">
ブラウザ上の WebAssembly でローカル動作する対話型 Playground、実務スケジューリングアプリ、数理最適化パズルゲームを体験できます。
</p>

<div class="washi-showcase-section">

## ⚡ Playground

<div class="washi-showcase-grid">
  <div class="washi-showcase-card is-primary">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">⚡</span>
        <span class="washi-showcase-badge">HiGHS · Z3 · GLPK</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/demo/" target="_self" class="washi-showcase-title-link">WaSHI Playground</a>
      </div>
      <p class="washi-showcase-desc">
        LP・MIP・凸QP・SMT モデルを TypeScript / JavaScript で記述し、ブラウザ内の HiGHS・Z3・GLPK で即座に求解できる対話型オンライン環境。プリセット問題、LP/SMT-LIB 出力確認、感度分析、Z3 <code>unsatCore</code> による矛盾診断に対応しています。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/demo/" target="_self" class="washi-showcase-cta">Playground を開く →</a>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🏥 実務アプリケーション

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">🏥</span>
        <span class="washi-showcase-badge">Gemini Nano × HiGHS MILP</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/apps/ai-shift/" target="_self" class="washi-showcase-title-link">ナーススケジューリング AI Copilot</a>
      </div>
      <p class="washi-showcase-desc">
        自然な日本語チャット指示からブラウザ内蔵 AI（Gemini Nano）が勤務条件を抽出し、WaSHI × HiGHS が30名×1ヶ月の3交代シフト表をローカルで最適化・矛盾診断する実務コパイロット。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/apps/ai-shift/" target="_self" class="washi-showcase-cta">アプリを開く →</a>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">🎓</span>
        <span class="washi-showcase-badge">Gemini Nano × HiGHS MILP</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学時間割編成 AI Copilot (UCTP)</a>
      </div>
      <p class="washi-showcase-desc">
        「非常勤の小林先生は火・木の午後しか来られない」「SW設計演習は同日連続時限で」などの複雑な教務条件を Gemini Nano で構造化し、WaSHI (HiGHS) で4学年×7教室×10教員の時間割を一発編成・矛盾診断。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/apps/ai-timetable/" target="_self" class="washi-showcase-cta">アプリを開く →</a>
      <a href="/washi/apps/ai-timetable-theory/" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
    </div>
  </div>
</div>

</div>

<div class="washi-showcase-section">

## 🎮 パズルゲーム

<div class="washi-showcase-grid">
  <div class="washi-showcase-card">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">🏰</span>
        <span class="washi-showcase-badge">拠点防衛シフトパズル</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/games/demon-castle-shift/" target="_self" class="washi-showcase-title-link">魔王城の24時間警備シフト</a>
      </div>
      <p class="washi-showcase-desc">
        昼夜を問わず進軍してくる勇者軍から、参謀リリスと共に魔王城を守り抜くシフト編成パズル。各メンバーの得意な時間帯と休息を守りながらシフトを組んで城を守り抜きます。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/games/demon-castle-shift/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
      <a href="/washi/games/demon-castle-shift-theory/" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">🐑</span>
        <span class="washi-showcase-badge">まきばの柵パズル</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">もふもふ羊の牧場囲い</a>
      </div>
      <p class="washi-showcase-desc">
        限られた本数の木の柵だけで腹ペコオオカミの侵入ルートを遮断しつつ、ヒツジのモコたちが歩ける「安全なまきば」の野いちごを最大化し、穴ぼこを埋めたり避けたりする囲い込みパズル。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/games/mofumofu-sheep/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
      <a href="/washi/games/mofumofu-sheep-theory/" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
    </div>
  </div>

  <div class="washi-showcase-card">
    <div>
      <div class="washi-showcase-card-top">
        <span class="washi-showcase-icon">📈</span>
        <span class="washi-showcase-badge">凸2次計画・ポートフォリオ最適化</span>
      </div>
      <div class="washi-showcase-title">
        <a href="/washi/games/quant-survival/" target="_self" class="washi-showcase-title-link">QUANT SURVIVAL — クオンツ運用サバイバル</a>
      </div>
      <p class="washi-showcase-desc">
        初期資金100億円からスタートし、毎期襲いかかる市場ショックでロスカット退場になる確率を抑えながら資産を複利で増やすサバイバル。逆相関銘柄を組み合わせてリスクを相殺し、凸二次計画ソルバー WaSHI-QP と総資産を競います。
      </p>
    </div>
    <div class="washi-showcase-actions">
      <a href="/washi/games/quant-survival/" target="_self" class="washi-showcase-cta">ゲームをプレイ →</a>
      <a href="/washi/games/quant-survival-theory/" target="_self" class="washi-showcase-theory-btn">📖 解説記事を読む →</a>
    </div>
  </div>
</div>

</div>

</div>
