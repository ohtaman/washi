---
layout: home

hero:
  text: "数理最適化と制約プログラミングのための代数モデラー"
  tagline: "PythonのPuLPのように直感的な数式で定式化できるTypeScript向け代数モデラー。WebAssembly（HiGHS・Z3・GLPK）を搭載し、Pythonサーバーやネイティブビルド不要でLP・混合整数計画法（MIP）・凸QP・SMTをブラウザやNode.jsで高速に求解します。"
  actions:
    - theme: brand
      text: はじめに
      link: /ja/getting-started/
    - theme: alt
      text: ショーケース
      link: /ja/showcase/

features:
  - icon: 📅
    title: シフト・時間割・配送計画
    details: 人員シフト、大学時間割、2次元パッキング、配送ルートなどの組合せ最適化を標準搭載の HiGHS（LP / MIP）で高速に求解します。
    link: /ja/examples/
    linkText: 定式化の具体例
  - icon: 📈
    title: ポートフォリオ・連続配分
    details: 資産配分のリスク最小化（Markowitz QP）や目標値への最小二乗フィットを凸二次計画（QuadExpr）でそのまま記述できます。
    link: /ja/examples/portfolio-qp
    linkText: ポートフォリオ最適化
  - icon: 🔍
    title: ルール検証と矛盾の原因特定
    details: 希望休の重複などで解が存在しないとき、どの条件同士が衝突しているか（unsatCore）を Z3 エンジンで特定します。
    link: /ja/guide/unsat-core
    linkText: 競合制約診断
  - icon: 🌐
    title: サーバー不要・ブラウザ完結
    details: Python バックエンド不要でブラウザの Web Worker や Node.js で動作。ローカル LLM が抽出した条件の数理ガードレールとしても機能します。
    link: /ja/getting-started/runtimes
    linkText: ランタイム環境設定
---

<div class="washi-home-sections">

<div class="washi-home-showcase">
<div class="washi-home-showcase-head">
<h2>WaSHI で動くアプリケーション</h2>
<a href="/washi/ja/showcase/" class="washi-home-all-link">ショーケース一覧を見る →</a>
</div>
<p class="washi-home-showcase-sub">
外部サーバー通信なしでブラウザ内の WebAssembly だけで動作する、実務スケジューリングアプリと最適化パズルです。
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
<a href="/washi/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学時間割編成 AI Copilot</a>
</div>
<p class="washi-showcase-desc">
4学年×10教員×7教室の時間割を同時編成。非常勤講師の曜日制約や連続コマ指定を自然言語や CSV から取り込んで求解します。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">アプリを開く →</span>
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
<span class="washi-showcase-badge">2次元パッキング MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/washi/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
</div>
<p class="washi-showcase-desc">
注文パーツを母材プレートに隙間なく配置し、端材ロス 0% と断層回避の条件を MILP ソルバーと競い合う2次元板金パズル。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">ゲームを開く →</span>
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
<span class="washi-showcase-badge">領域分離・最小カット MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/washi/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">もふもふ羊の牧場囲い</a>
</div>
<p class="washi-showcase-desc">
限られた木の柵でオオカミの侵入経路を遮断しつつ、安全な牧場内の野いちごを最大化するネットワーク分離パズル。
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">ゲームを開く →</span>
</div>
</div>
</div>
</div>

<div class="washi-home-docs-dir">

## ドキュメント一覧

<div class="tip custom-block" style="padding-top: 8px;">

- **はじめに**: [概要とインストール](/ja/getting-started/) · [AI コーディングエージェント向けクイックリファレンス](/ja/getting-started/ai-agents) · [ランタイム環境設定](/ja/getting-started/runtimes) · [Cross-Origin Isolation 設定](/ja/getting-started/cross-origin)
- **モデリングガイド**: [変数と上下限](/ja/guide/variables) · [数式の記述 (expr, dot, sum)](/ja/guide/expressions) · [目的関数](/ja/guide/objectives) · [制約条件](/ja/guide/constraints) · [競合制約診断 (Unsat Core)](/ja/guide/unsat-core) · [分解法 (列生成・Benders)](/ja/guide/decomposition)
- **ソルバー接続**: [ソルバー概要と比較](/ja/solvers/) · [HiGHS (標準搭載)](/ja/solvers/highs) · [Z3 (SMT)](/ja/solvers/z3) · [GLPK (LP/MIP)](/ja/solvers/glpk) · [カスタムソルバー実装](/ja/solvers/custom-solver)
- **定式化の具体例**: [具体例一覧と API 早見表](/ja/examples/) · [生産計画](/ja/examples/production) · [ナップサック問題](/ja/examples/knapsack) · [輸送ネットワーク計画](/ja/examples/transportation) · [献立問題と感度分析](/ja/examples/diet-sensitivity) · [シフトスケジューリング](/ja/examples/shift-scheduling) · [EC クーポン最適化](/ja/examples/ecommerce-coupons) · [ポートフォリオ最適化 (QP)](/ja/examples/portfolio-qp) · [SMT セキュリティポリシー検証](/ja/examples/smt-security) · [競合制約診断 (Unsat Core)](/ja/examples/unsat-core) · [配送計画問題 (列生成法)](/ja/examples/vehicle-routing) · [巡回セールスマン問題 (Benders 分解)](/ja/examples/traveling-salesperson)
- **インタラクティブ Playground・アプリ**: [ショーケース一覧](/ja/showcase/) · <a href="/washi/demo/" target="_self">WaSHI Playground</a> · <a href="/washi/apps/ai-shift/" target="_self">ナーススケジューリング AI Copilot</a> · <a href="/washi/apps/ai-timetable/" target="_self">大学時間割編成 AI Copilot</a> · <a href="/washi/games/demon-castle-shift/" target="_self">魔王城の24時間警備シフト</a> · <a href="/washi/games/mofumofu-sheep/" target="_self">もふもふ羊の牧場囲い</a> · <a href="/washi/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
