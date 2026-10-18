<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - TypeScript / JavaScript のための数理最適化・代数モデラー" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>TypeScript / JavaScript のための代数モデラー</strong></p>
  <p>
    <em>線形計画 (LP) • 混合整数計画 (MIP) • 凸二次計画 (QP) • SMT論理制約 &amp; 矛盾診断</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://github.com/ohtaman/washi/actions/workflows/distribution.yml"><img src="https://github.com/ohtaman/washi/actions/workflows/distribution.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://ohtaman.github.io/washi/ja/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、Python の **PuLP** や Julia の **JuMP** に着想を得た、TypeScript / JavaScript 向けの代数モデラーです。アプリケーションのコードで変数・目的関数・数値制約や論理制約を記述できます。WaSHI はモデルの構築、ソルバー向けの変換、変数への結果の反映を担当し、最適化や充足可能性の判定は **HiGHS**・**Z3**・**GLPK** が行います。

HiGHS が標準ソルバーで、Z3 と GLPK は任意で追加するプラグインです。Node.js 用とブラウザ用の配布物に WebAssembly アセットを含みます。配信に必要な設定は[ブラウザでの利用方法](#-ブラウザ--web-worker-での利用方法)を参照してください。

[ブラウザデモを試す](https://ohtaman.github.io/washi/demo/) · [AIエージェント向けクイックリファレンス](docs/ja/getting-started/ai-agents.md) · [サンプルのソースと実行方法](https://github.com/ohtaman/washi/blob/main/examples/README.md) · [ESM / script / CodePen のサンプル](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("木工製品の利益最大化");
const x = m.integer("机", { lb: 0 });
const y = m.integer("椅子", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "木材上限");
m.constraint(expr`2 * ${x} + ${y} <= 50`, "労働力上限");

await m.solve();
console.log(`生産量: x=${x.value}, y=${y.value} (最大利益: $${m.objectiveValue})`);
```

---

## 🎯 WaSHI が提供するもの

1. **代数的なモデル記述**: ドメイン変数メソッド（`m.binary`, `m.integer`, `m.continuous`）、タグ付きテンプレート（`expr`）、ベクトル集計関数（`dot`, `sum`）、およびファーストクラスの制約（`m.constraint`）によりモデルを記述します。JavaScript には演算子オーバーロードがないため、`` expr`...` `` は SQL のパラメータバインディングと同様に、中置記法の演算子（`+`, `-`, `*`, `^2`, `<=`, `>=`, `==`）を構文解析しつつ `${...}` に渡された値を型付きの `Var` や式のオブジェクト参照として直接バインドします。これにより、TypeScript の型検査、IDE のシンボルリネーム、多次元変数の添字参照（`${flow[i][j]}`）がそのまま機能します。
2. **ソルバーアダプター**: 共通のモデリング API から HiGHS・Z3・GLPK を利用でき、[独自アダプターも登録できます](https://github.com/ohtaman/washi/blob/main/docs/ja/solvers/custom-solver.md)。モデルの問題クラスを扱えるソルバーを選ぶ必要があり、対応機能はソルバーごとに異なります。
3. **ローカル実行と WebAssembly の配布**: ローカルソルバーのアダプターでは、別途 Python サービスや C/C++ のネイティブビルドを用意せずアプリケーション内で求解できるため、プロトタイプから Web ツールを公開する際のバックエンド構築のボトルネックを解消でき、ブラウザ内 LLM（WebGPU / WebLLM 等）とのクライアントサイド連携も容易です。ブラウザへの配布には生成された JS・Worker・WASM が必要です。オフライン利用には、これらをローカルに配置するかキャッシュしておく必要があります。Z3 には追加のブラウザ隔離設定があります。
4. **名前付き制約と SMT の結果**: Z3 を明示的に使って充足可能性を確認し、矛盾する制約の調査に競合制約（`conflicts` / `unsatCore`）を利用できます。返されるのは矛盾する制約の部分集合であり、最小の集合とは限りません。

モデルの構築と変換は WaSHI が担当します。扱える問題クラス、数値計算の挙動、求解時間は、選択したソルバー・設定・問題に依存します。モデル構築のオーバーヘッドとソルバーの実行時間は分けて計測する必要があり、特定のモデルでの結果は一般的な性能保証ではありません。

---

## ⚙️ ソルバーアダプターと対応範囲

| アダプター | エンジンのライセンス | 対応する問題クラス | エンジンの役割 | 提供形態 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 数値最適化 | 標準ソルバー |
| **Z3** | **MIT** | **SMT, SAT, 命題論理, MIP** | 充足可能性の判定、Unsat Core、最適化 | オプションプラグイン (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 線形・混合整数最適化 | オプションプラグイン (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | — | 統合テスト用の模擬応答 | 標準搭載。モデルの求解は行わない |

---

## 📦 インストール

```bash
# npm
npm install @ohtaman/washi

# pnpm
pnpm add @ohtaman/washi

# yarn
yarn add @ohtaman/washi

# bun
bun add @ohtaman/washi
```

*(任意)* Z3 や GLPK を使用する場合は、各パッケージを追加インストールします：

```bash
npm install z3-solver    # SMT・矛盾診断を利用する場合
npm install glpk.js      # GLPK ソルバーを利用する場合 (GPL-3.0)
```

---

## 🚀 使い方ガイド

### 1. 多次元変数・条件付き制約 (`m.indicator`)・解の検証 (`m.validateSolution`)

1次元辞書や2次元マトリクス変数を1行で宣言し、`m.indicator()` による条件付き Big-M 制約、進捗イベント（`onProgress`）とキャンセル（`AbortSignal`）、および `m.validateSolution()` による独立解検証を行えます：

```ts
import { Model, expr } from "@ohtaman/washi";

const m = new Model("FacilityPlanning");

// 1次元辞書形式のバイナリ変数群
const openCity = m.binary(["Tokyo", "Osaka", "Nagoya"]);

// 2次元輸送量行列: [工場] x [店舗]
const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0, ub: 1000 });

// 2次元グリッド (例: 8x8 チェス盤)
const board = m.binary(8, 8, { prefix: "queen" });

// 条件付き Big-M 制約: 東京拠点が閉鎖 (openCity['Tokyo'] == 0) なら flow <= 0
// (M を省略すると、変数の有限な上下限から安全な最小の Big-M が自動導出されます)
m.indicator(openCity["Tokyo"], expr`${flow["F1"]["StoreA"]} <= 0`, {
  activeValue: 0,
  name: "tokyo_closed_no_flow",
});

// 進捗コールバック (onProgress) と AbortSignal によるキャンセル制御
const controller = new AbortController();
await m.solve({
  signal: controller.signal,
  onProgress: (ev) => {
    // 分枝限定法のライブ指標: ev.elapsedTime, ev.objectiveValue, ev.objectiveBound, ev.mipGap
  },
});

// 求解結果が境界・整数性・線形/論理制約を満たすか独立検証
const report = m.validateSolution();
console.log("解の検証結果:", report.valid);
```

---

### 2. ポートフォリオのリスク最小化 (凸二次計画: QP)

期待リターンと予算制約を満たしつつ、共分散行列に基づく投資リスクを最小化：

```ts
import { Model, QuadExpr, sum, dot, minimize, expr } from "@ohtaman/washi";

const m = new Model("MarkowitzPortfolio");
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// 決定変数: 投資比率 (0.0 〜 1.0)
const w = m.continuous(assets, { lb: 0, ub: 1 });

// 1. 予算制約: 合計 100%
m.constraint(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget");

// 2. 目標リターン: 最低 8.5%
const retMap = Object.fromEntries(assets.map((a, i) => [a, returns[i]]));
m.constraint(expr`${dot(retMap, w)} >= 0.085`, "min_return");

// 3. 共分散行列 (リスク & 相関)
const cov = [
  [0.040, 0.002, 0.015],
  [0.002, 0.005, 0.002],
  [0.015, 0.002, 0.025],
];

// 二次目的関数: w^T * Cov * w
let risk = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
  }
}
m.objective(minimize(risk));

await m.solve();
console.log(`最小分散: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name) => {
  console.log(`  ${name}: ${((w[name].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT 論理制約 & ルールエンジン (Z3 連携)

命題変数（`BoolVar`）と論理結合子（`and`, `or`, `implies`, `not`, `xor`）、数値比較制約を混在させたルール定義：

```ts
import { Model, not, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.bool("isNight");
const motion = m.bool("motion");
const alarm = m.bool("alarm");
const siren = m.bool("siren");
const lux = m.integer("lux", { lb: 0 });

// 論理ルール
m.constraint(lux.le(50).implies(isNight), "dark_implies_night");
m.constraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// 観測されたセンサー値
m.constraint(expr`${lux} <= 10`, "sensor_dark");
m.constraint(motion, "sensor_motion");
m.constraint(alarm, "alarm_on");

// 目的関数なしで制約充足可能性（SAT）を判定
const res = await m.check({ solver: "z3" });

console.log(`充足可能？ ${res.status === "Sat"}`); // true
console.log(`サイレン作動？ ${m.values.get("siren")}`); // true
```

---

### 4. 矛盾原因の自動特定 (`conflicts` / `unsatCore`)

業務ルールや制約群が互いに矛盾している場合、**矛盾を引き起こしている制約の部分集合**（Unsat Core / Conflicts。最小性は保証しません）を特定してデバッグ（Z3 が必要）：

```ts
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rushDelivery = m.bool("rushDelivery");

// ルール 1: エンジニア1人あたり $8,000
m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

// ルール 2: 特急納品が必須
m.constraint(rushDelivery, "rush_required");

// ルール 3: 特急納品には最低 8 人のエンジニアが必要
m.constraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// ルール 4: 役員会の予算上限 $50,000 (矛盾: 8人 * $8000 = $64,000 > $50,000!)
m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

// ルール 5: 最低 1 人雇用の労働基準（無関係なルール）
m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`ステータス: ${res.status}`); // "Unsat"
console.log("矛盾している制約:", res.conflicts);
// 出力: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// ※ 無関係な "minimum_one_employee" は的確に除外されます
```

---

### 5. GLPK ソルバーの利用 (GPL-3.0)

GNU Linear Programming Kit (GLPK) ソルバープラグインを利用する場合：

```ts
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ solver: "glpk" });
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.solve();
console.log(`ステータス: ${status}`); // "Optimal"
console.log(`目的関数値: ${m.objectiveValue}`); // 1100
```

---

### 6. ベクトル演算と高速内積 (`dot`)

ネストしたループを書くことなく、1次元・2次元の線形結合を1行で記述：

```ts
import { Model, dot, minimize } from "@ohtaman/washi";

const m = new Model();
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// 総輸送コストを1行で最小化:
m.objective(minimize(dot(costs, ship)));
await m.solve();

// 最適解の全変数値を取得
const solution = m.getValues(ship);
console.log(solution);
```

---

## 🌐 ブラウザ & Web Worker での利用方法

HiGHS はデフォルトでパッケージ同梱 WASM を使います。**CDN への自動フォールバックはありません。** Node.js はインストールされた HiGHS を使い、Vite / webpack 5 はパッケージ内の WASM・Worker 参照から配布ファイルを生成します。

### npm とバンドラー

```typescript
import { Model } from "@ohtaman/washi";
const model = new Model();
// 変数・目的関数・制約を定義
await model.solve();
```

検証対象の Vite / webpack ビルドでは WASM の手動コピー・URL 指定は不要です。その他のバンドラーや SSR は個別に確認し、ブラウザの求解はクライアントで実行してください。ブラウザでは Worker をデフォルトで使用します。簡単なデモは `model.solve({ useWorker: false })` でも動きますが、長い計算中は UI が止まります。

### ブラウザ標準 ESM（利用者側のビルド不要）

`dist/browser` 一式（JS の分割ファイル・`highs.wasm`・Worker を含む）を HTTP 配信します。Import Maps は不要です。

```html
<script type="module">
  import { Model } from "./washi/washi.js";
  const model = new Model();
  // 変数・目的関数・制約を定義
  await model.solve({ useWorker: false });
</script>
```

### 通常の script / CodePen

`dist/browser/washi.min.js` はグローバル API `Washi` を公開します。CodePen の External Scripts にその URL を追加するか、次のように読み込みます。

```html
<script src="./washi/washi.min.js"></script>
<script>
  const model = new Washi.Model();
  // 変数・目的関数・制約を定義
  model.solve({ useWorker: false }).then(status => console.log(status));
</script>
```

CDN から直接読み込む場合は、URL を `https://cdn.jsdelivr.net/npm/@ohtaman/washi@<version>/dist/browser/washi.min.js`（対応版リリースが公開された後にそのバージョンを指定）に指定できます。ESM は同じ版の `dist/browser/washi.js` を指定します。CDN の URL を選ぶことが明示的な CDN 利用になり、ローカル配信が勝手に CDN へ切り替わることはありません。

### ブラウザ環境でのソルバープラグイン（GLPK & Z3）

ブラウザ配布物には、`dist/browser/solvers/` 配下に事前バンドルされたスタンドアロンソルバープラグインが含まれています：
- **GLPK**: `dist/browser/solvers/glpk.js` (ESM) および `dist/browser/solvers/glpk.min.js` (IIFE、グローバル `WashiGLPK` を登録)
- **Z3**: `dist/browser/solvers/z3.js` (ESM) および `dist/browser/solvers/z3.min.js` (IIFE、グローバル `WashiZ3` を登録)、ならびに `z3-built.js` / `z3-built.wasm`

#### ブラウザ ESM での GLPK 利用
```html
<script type="module">
  import { Model, maximize } from "./washi/washi.js";
  import "./washi/solvers/glpk.js";

  const model = new Model({ solver: "glpk" });
  const x = model.continuous("x", { lb: 0, ub: 10 });
  model.objective(maximize(x));
  await model.solve();
  console.log("GLPK ステータス:", model.status);
</script>
```

#### スクリプトタグでの GLPK 利用
```html
<script src="./washi/washi.min.js"></script>
<script src="./washi/solvers/glpk.min.js"></script>
<script>
  const model = new Washi.Model({ solver: "glpk" });
  const x = model.continuous("x", { lb: 0, ub: 10 });
  model.objective(Washi.maximize(x));
  model.solve().then(status => console.log("GLPK ステータス:", status));
</script>
```

> [!NOTE]
> **ブラウザ環境での Z3 利用と Cross-Origin Isolation**:
> Z3 の WebAssembly エンジンはマルチスレッド（`SharedArrayBuffer`）を必要とするため、`Cross-Origin-Opener-Policy: same-origin` および `Cross-Origin-Embedder-Policy: require-corp` ヘッダーによる Cross-Origin Isolation が必要です。静的ホスティング（`coi-serviceworker.js`）、イントラネット・オフライン配置、CSP（`worker-src blob:`）、カスタム WASM URL（`setHighsWasmUrl`）の詳細は [Cross-Origin Isolation 設定](docs/ja/getting-started/cross-origin.md) および [ランタイム環境とデプロイ構成](docs/ja/getting-started/runtimes.md) を参照してください。

完全なスタンドアロンサンプル（ESM、スクリプトタグ、CodePen）は [`examples/distribution/`](examples/distribution/README.md) に用意されています。

---

## 🛠️ カスタムソルバー開発と拡張性

WaSHI は疎結合なプラグイン方式のソルバーアーキテクチャを採用しています。独自の最適化エンジン（クラウド REST ソルバー、WebAssembly エンジン、商用ソルバーアダプターなど）を容易に構築・登録できます：

- 詳細な開発手順、API コントラクト仕様（`Solver`, `SolveModelData`, `CheckModelData`, `SolverResult`）、およびテスト手法については [カスタムソルバー開発ガイド](docs/ja/solvers/custom-solver.md) をご覧ください。

---

## 💻 サンプルとブラウザデモ

[サンプル一覧](https://github.com/ohtaman/washi/blob/main/examples/README.md)および[オンライン実践レシピ集・API逆引き索引](https://ohtaman.github.io/washi/ja/examples/)では、目的別・WaSHI の API 機能別にサンプルを探せます。

| カテゴリ | サンプル | 確認できること | ソルバー |
| :--- | :--- | :--- | :--- |
| **基本モデル** | [生産計画](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) | 整数変数、利益の最大化、資源制約 (`expr`) | HiGHS |
| **基本モデル** | [輸送・物流ネットワーク](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) | 2次元マトリクス変数 (`continuous(rows, cols)`) と供給・需要バランス | HiGHS |
| **基本モデル** | [栄養問題と感度分析](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) | 潜在価格 (`constr.dual`)、余剰 (`constr.slack`)、被約費用 (`var.reducedCost`) | HiGHS |
| **実践応用** | [スタッフのシフト作成](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) | 週間シフト最適化と、土曜日の希望休が衝突した際の原因特定 | HiGHS + Z3 |
| **実践応用** | [ECカートのクーポン最適適用](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) | 条件付き購入金額閾値 (`indicator`)、併用不可ルール、追加購入提案 | HiGHS |
| **実践応用** | [ポートフォリオ配分](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) | 凸二次目的関数 (`QuadExpr`) と配分の制約 | HiGHS |
| **論理 / SMT** | [業務ルールの検証](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) | 数値・論理制約 (`bool`, `implies`) の充足可能性の確認 | Z3 |
| **論理 / SMT** | [矛盾する制約の診断](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) | 名前付き制約と Unsat Core (`unsatCore`) | Z3 |

[公開ブラウザデモ](https://ohtaman.github.io/washi/demo/)では、モデルを編集して実行できます。ブラウザ標準 ESM、script タグ、CodePen での使い方は[配布形式のサンプル](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)を参照してください。Z3 は Cross-Origin Isolation が必要です。詳細は上記のブラウザ要件に記載しています。

ローカルで実行する場合は、リポジトリを取得して開発用依存をインストールします。

```bash
git clone https://github.com/ohtaman/washi.git
cd washi
npm ci
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts

# ローカルのブラウザデモ: http://localhost:5173/demo/
npm run dev
```

サンプルはリポジトリの `src/` モジュールを import しています。公開パッケージを使うアプリでは、`@ohtaman/washi` と必要なソルバープラグインから import してください。

---

## 🧪 テスト & 再現可能なベンチマーク

リポジトリのユニット・統合テストを実行し、配布物をビルドできます：

```bash
# すべてのユニット・統合テストを実行
npm test

# プロダクション用バンドルと型定義を生成
npm run build
```

### オプションの再現可能なベンチマーク

正しさのテストの合否閾値に実行時間を含めることなく、決定論的な `small-lp`（24変数・18制約）および `scheduling-mip`（315変数・231制約、再構築モデルの `initialValue` ウォームスタートを含む）の各フェーズを計測できます：

```bash
# Node.js インプロセス WASM ベンチマークを実行（HiGHS・GLPK、デフォルト5回反復）
npm run bench

# 反復回数の指定や JSON 出力
node scripts/run-benchmarks.mjs --iterations=10 --json

# ヘッドレス Chromium の Web Worker 実行も計測（Playwright Chromium が必要）
node scripts/run-benchmarks.mjs --browser
```

- **明示的な計測境界**: コールド初期化（`coldRuntimeInitMs`, `coldFirstSolveMs`）と再利用ランタイムでの反復計測（`modelBuildMs`, `validationMs`, LP文字列アダプタ向けの `lpSerializationMs` または構造化アダプタ向けの `symbolMapMs`, `MockSolver` による `resultMappingMs`, `adapterSolveMs`, `endToEndSolveMs`）を分離して直接計測します（無関係なフェーズ時間を差し引いて「ネイティブソルバー時間」とみなすことはしません）。
- **実行環境の区別**: Node.js のインプロセス WASM（`usesBrowserWorker: false`）とブラウザ Web Worker 実行（`usesBrowserWorker: true`、Worker ライフサイクルや `postMessage` 転送を含む）は異なる実行環境として区別してレポートされます。

---

## 📄 ライセンス

- **`@ohtaman/washi`**: [MIT ライセンス](./LICENSE)
- **HiGHS**（標準エンジン）: MIT ライセンス
- **Z3**（オプション）: MIT ライセンス
- **GLPK**（オプション）: GPL-3.0 ライセンス
