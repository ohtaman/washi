---
layout: home

hero:
  text: "TypeScript 数理最適化モデラー"
  tagline: "PythonのPuLPのように直感的な数式で定式化できるTypeScript向け代数モデラー。同梱の HiGHS・Pumpkin やオプションの Z3・GLPK を使い、ブラウザと Node.js で LP・MIP・凸 QP・CP・SMT の各問題を解けます。"
  actions:
    - theme: brand
      text: はじめに
      link: /ja/getting-started/
    - theme: alt
      text: N本ノック
      link: /exercises/?lang=ja
    - theme: alt
      text: ショーケース
      link: /ja/showcase/

features:
  - icon: 🌐
    title: WebAssembly でネイティブ環境構築不要
    details: Python サーバーや C/C++ のネイティブビルドは不要です。ブラウザ（Web Worker）や Node.js でそのままモデルを解けます。
    link: /ja/getting-started/runtimes
    linkText: ランタイム環境設定
  - icon: ✍️
    title: 直感的な代数モデリング
    details: 行列や LP 形式文字列を手作業で組み立てず、PuLP に近い数式で線形計画・整数計画・凸二次計画・制約プログラミング・論理（SMT）モデルを記述できます。
    link: /ja/guide/expressions
    linkText: 数式の記述
  - icon: 🧩
    title: TypeScript による型安全なモデリング
    details: アプリ側のデータ構造に変数辞書を対応付け、添字やキーの綴り間違い、数値と真偽値の取り違えをコンパイル時に防ぎます。
    link: /ja/guide/variables
    linkText: 決定変数とドメイン
  - icon: 🔍
    title: 「解なし」の原因を特定
    details: 制約同士が矛盾して解が見つからないとき、同梱の HiGHS・Pumpkin またはオプションの Z3 で矛盾するルールを特定できます。
    link: /ja/guide/unsat-core
    linkText: 矛盾診断・解の検証・デバッグ
  - icon: ⚙️
    title: 用途別に切り替えられるソルバー構成
    details: 共通のモデリング API のまま（対応する問題クラスの範囲で）、同梱の HiGHS・Pumpkin、オプションの Z3・GLPK プラグイン、独自ソルバーを用途別に切り替えられます。
    link: /ja/solvers/
    linkText: ソルバー概要
  - icon: 🔀
    title: 大規模問題向けの分解法
    details: 列生成法・Benders 分解に加え、LP 緩和や双対変数（潜在価格）の取得にも対応し、単一モデルでは解きにくい大規模問題にも対応します。
    link: /ja/guide/decomposition
    linkText: 分解法
---

<div class="washi-home-sections">

<div class="washi-home-showcase">
<div class="washi-home-showcase-head">
<h2>WaSHI で動くアプリケーション</h2>
<a href="/ja/showcase/" class="washi-home-all-link">ショーケース一覧を見る →</a>
</div>
<p class="washi-home-showcase-sub">
外部サーバー通信なしでブラウザ内で完結して動作する、実務スケジューリングアプリと最適化パズルです。
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
<a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">大学時間割編成 AI Copilot</a>
</div>
<p class="washi-showcase-desc">
4 学年・10 教員・7 教室の時間割を同時編成します。非常勤講師の曜日制約や連続コマ指定を自然言語で追加し、CSV データと合わせて時間割を最適化します。
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
<span class="washi-showcase-badge">2 次元パッキング MIP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
</div>
<p class="washi-showcase-desc">
注文パーツを母材プレートに隙間なく配置し、端材ロス 0% と断層（通し目地）回避の達成を MIP ソルバーと競う 2 次元板金パズルです。
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
<span class="washi-showcase-badge">領域分離・最小カット MIP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">もふもふ羊の牧場囲い</a>
</div>
<p class="washi-showcase-desc">
限られた木の柵でオオカミの侵入経路を遮断しつつ、安全な牧場内の野いちごの数を最大化するネットワーク分離パズルです。
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

- **はじめに**: [インストールと入門](/ja/getting-started/) · [AI コーディングエージェント](/ja/getting-started/coding-agents) · [ランタイム環境設定](/ja/getting-started/runtimes) · [Cross-Origin Isolation 設定](/ja/getting-started/cross-origin)
- **モデリング基礎**: [決定変数とドメイン](/ja/guide/variables) · [数式の記述](/ja/guide/expressions)（`expr`, `sum`, `dot`） · [制約条件](/ja/guide/constraints) · [目的関数と求解](/ja/guide/objectives)
- **応用モデリング**: [矛盾診断・解の検証・デバッグ](/ja/guide/unsat-core) · [制約プログラミング (CP) モデリング](/ja/guide/constraint-programming) · [分解法](/ja/guide/decomposition) · [定式化パターン・Tips](/ja/guide/formulation-tips)
- **ソルバー接続**: [ソルバー概要](/ja/solvers/) · [HiGHS](/ja/solvers/highs) · [Pumpkin](/ja/solvers/pumpkin) · [Z3](/ja/solvers/z3) · [GLPK](/ja/solvers/glpk) · [カスタムソルバー開発](/ja/solvers/custom-solver)
- **実践例 — LP・MIP・QP**: [実践例・サンプル集](/ja/examples/) · [生産計画問題](/ja/examples/production) · [0-1 ナップサック問題](/ja/examples/knapsack) · [輸送・物流ネットワーク問題](/ja/examples/transportation) · [栄養問題と感度分析](/ja/examples/diet-sensitivity) · [ポートフォリオ最適化 (QP)](/ja/examples/portfolio-qp)
- **実践例 — シフト・Indicator・CP**: [スタッフのシフト作成](/ja/examples/shift-scheduling) · [EC カートのクーポン最適化](/ja/examples/ecommerce-coupons) · [プロジェクトスケジューリング (CP)](/ja/examples/project-scheduling)
- **実践例 — SMT・診断・分解法**: [セキュリティポリシー検証 (SMT)](/ja/examples/smt-security) · [制約矛盾の診断 (Unsat Core)](/ja/examples/unsat-core) · [車両配送計画問題 (CVRP)](/ja/examples/vehicle-routing) · [巡回セールスマン問題 (TSP)](/ja/examples/traveling-salesperson)
- **Playground・実務アプリ**: [ショーケース](/ja/showcase/) · <a href="/demo/" target="_self">WaSHI Playground</a> · <a href="/exercises/" target="_self">数理最適化N本ノック</a> · <a href="/apps/ai-shift/" target="_self">ナーススケジューリング AI Copilot</a> · <a href="/apps/ai-timetable/" target="_self">大学時間割編成 AI Copilot</a>
- **パズルゲーム**: <a href="/games/demon-castle-shift/" target="_self">魔王城の24時間警備シフト</a> · <a href="/games/mofumofu-sheep/" target="_self">もふもふ羊の牧場囲い</a> · <a href="/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
