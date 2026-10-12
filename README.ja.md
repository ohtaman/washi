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
    <a href="https://ohtaman.github.io/washi/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、Python の **PuLP** や Julia の **JuMP** に着想を得た、TypeScript / JavaScript 向けの代数モデラーです。アプリケーションのコードで変数・目的関数・数値制約や論理制約を記述できます。WaSHI はモデルの構築、ソルバー向けの変換、変数への結果の反映を担当し、最適化や充足可能性の判定は **HiGHS**・**Z3**・**GLPK** が行います。

HiGHS が標準ソルバーで、Z3 と GLPK は任意で追加するプラグインです。Node.js 用とブラウザ用の配布物に WebAssembly アセットを含みます。配信に必要な設定は[ブラウザでの利用方法](#-ブラウザ--web-worker-での利用方法)を参照してください。

[ブラウザデモを試す](https://ohtaman.github.io/washi/demo/) · [サンプルのソースと実行方法](https://github.com/ohtaman/washi/blob/main/examples/README.md) · [ESM / script / CodePen のサンプル](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)

```ts
import { Model, expr } from "@ohtaman/washi";

const m = new Model("木工製品の利益最大化");
const x = m.integer("机", { lb: 0 });
const y = m.integer("椅子", { lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.constrain(expr`${x} + 2 * ${y} <= 40`, "木材上限");
m.constrain(expr`2 * ${x} + ${y} <= 50`, "労働力上限");

await m.optimize();
console.log(`生産量: x=${x.value}, y=${y.value} (最大利益: $${m.objectiveValue})`);
```

---

## 🎯 WaSHI が提供するもの

1. **代数的なモデル記述**: 直感的なドメイン変数メソッド（`m.binary`, `m.integer`, `m.continuous`）、タグ付きテンプレート（`expr`）、ベクトル集計関数（`dot`, `sum`）、そして第1推奨の `m.constrain()` により、数学的定義に忠実なモデルを簡潔に記述できます。
2. **ソルバーアダプター**: 共通のモデリング API から HiGHS・Z3・GLPK を利用でき、[独自アダプターも登録できます](https://github.com/ohtaman/washi/blob/main/docs/custom-solver-guide.md)。モデルの問題クラスを扱えるソルバーを選ぶ必要があり、対応機能はソルバーごとに異なります。
3. **ローカル実行と WebAssembly の配布**: ローカルソルバーのアダプターでは、別途 Python サービスや C/C++ のネイティブビルドを用意せず、アプリケーション内で求解できます。ブラウザへの配布には生成された JS・Worker・WASM が必要です。オフライン利用には、これらをローカルに配置するかキャッシュしておく必要があります。Z3 には追加のブラウザ隔離設定があります。
4. **名前付き制約と SMT の結果**: Z3 を明示的に使って充足可能性を確認し、矛盾する制約の調査に Unsat Core を利用できます。返されるのは矛盾する制約の部分集合であり、最小の集合とは限りません。

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

### 1. 混合整数線形計画法 (MIP: 生産計画問題)

リソース制約の下で利益を最大化する生産計画：

```ts
import { Model, expr } from "@ohtaman/washi";

const m = new Model("FactoryPlanning");

// 決定変数（整数・非負）
const chairs = m.integer("chairs", { lb: 0 });
const tables = m.integer("tables", { lb: 0 });

// テンプレートリテラル記法による自然な目的関数と制約
m.maximize(expr`30 * ${chairs} + 50 * ${tables}`);
m.constrain(expr`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.constrain(expr`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// 標準の HiGHS WASM エンジンで求解
const status = await m.optimize();

console.log(`ステータス: ${status}`); // "Optimal"
console.log(`最大利益: $${m.objectiveValue}`); // 1100
console.log(`生産数: 椅子=${chairs.value}, 机=${tables.value}`); // 椅子 20, 机 10
```

#### 🗂 多次元変数グリッド

キー一覧や多次元インデックスから、1 行で変数群を定義：

```ts
// 1次元辞書形式のバイナリ変数群
const openCity = m.binary(["Tokyo", "Osaka", "Nagoya"]);

// 2次元輸送量行列: [工場] x [店舗]
const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2次元グリッド (例: 8x8 チェス盤)
const board = m.binary(8, 8, { prefix: "queen" });
```

#### 🔀 Big-M インジケータ制約 (`m.indicator`)

条件分岐や固定費の発生ルールを、煩雑な手動 Big-M 計算なしに記述：

```ts
// 「東京工場が稼働していない (openCity['Tokyo'] == 0) なら、生産量 flow は 0」
m.indicator(openCity["Tokyo"], expr`${flow["F1"]["StoreA"]} <= 0`, {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. ポートフォリオのリスク最小化 (凸二次計画: QP)

期待リターンと予算制約を満たしつつ、共分散行列に基づく投資リスクを最小化：

```ts
import { Model, QuadExpr, sum, dot, expr } from "@ohtaman/washi";

const m = new Model("MarkowitzPortfolio");
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// 決定変数: 投資比率 (0.0 〜 1.0)
const w = m.continuous(assets, { lb: 0, ub: 1 });

// 1. 予算制約: 合計 100%
m.constrain(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget");

// 2. 目標リターン: 最低 8.5%
const retMap = Object.fromEntries(assets.map((a, i) => [a, returns[i]]));
m.constrain(expr`${dot(retMap, w)} >= 0.085`, "min_return");

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
m.minimize(risk);

await m.optimize();
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

const isNight = m.addBoolVar("isNight");
const motion = m.addBoolVar("motion");
const alarm = m.addBoolVar("alarm");
const siren = m.addBoolVar("siren");
const lux = m.integer("lux", { lb: 0 });

// 論理ルール
m.constrain(lux.le(50).implies(isNight), "dark_implies_night");
m.constrain(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// 観測されたセンサー値
m.constrain(expr`${lux} <= 10`, "sensor_dark");
m.constrain(motion, "sensor_motion");
m.constrain(alarm, "alarm_on");

// 目的関数なしで制約充足可能性（SAT）を判定
const res = await m.check({ solver: "z3" });

console.log(`充足可能？ ${res.status === "Sat"}`); // true
console.log(`サイレン作動？ ${m.values.get("siren")}`); // true
```

---

### 4. 矛盾原因の自動特定 (`unsatCore`)

業務ルールや制約群が互いに矛盾している場合、**矛盾を引き起こしている制約の部分集合**（Unsat Core。最小性は保証しません）を特定してデバッグ（Z3 が必要）：

```ts
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rushDelivery = m.addBoolVar("rushDelivery");

// ルール 1: エンジニア1人あたり $8,000
m.constrain(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

// ルール 2: 特急納品が必須
m.constrain(rushDelivery, "rush_required");

// ルール 3: 特急納品には最低 8 人のエンジニアが必要
m.constrain(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// ルール 4: 役員会の予算上限 $50,000 (矛盾: 8人 * $8000 = $64,000 > $50,000!)
m.constrain(expr`${budget} <= 50000`, "strict_board_budget_cap");

// ルール 5: 最低 1 人雇用の労働基準（無関係なルール）
m.constrain(expr`${engineers} >= 1`, "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`ステータス: ${res.status}`); // "Unsat"
console.log("矛盾している制約:", res.unsatCore);
// 出力: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// ※ 無関係な "minimum_one_employee" は的確に除外されます
```

---

### 5. GLPK ソルバーの利用 (GPL-3.0)

GNU Linear Programming Kit (GLPK) ソルバープラグインを利用する場合：

```ts
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ solver: "glpk" });
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.constrain(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constrain(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.optimize();
console.log(`ステータス: ${status}`); // "Optimal"
console.log(`目的関数値: ${m.objectiveValue}`); // 1100
```

---

### 6. ベクトル演算と高速内積 (`dot`)

ネストしたループを書くことなく、1次元・2次元の線形結合を1行で記述：

```ts
import { Model, dot } from "@ohtaman/washi";

const m = new Model();
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// 総輸送コストを1行で最小化:
m.minimize(dot(costs, ship));
await m.optimize();

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

CDN から直接読み込む場合は、URL を `https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.1.2/dist/browser/washi.min.js`（`0.1.2` 以降のバージョンを固定）に指定できます。ESM は同じ版の `dist/browser/washi.js` を指定します。CDN の URL を選ぶことが明示的な CDN 利用になり、ローカル配信が勝手に CDN へ切り替わることはありません。

### ブラウザ環境でのソルバープラグイン（GLPK & Z3）

ブラウザ配布物には、`dist/browser/solvers/` 配下に事前バンドルされたスタンドアロンソルバープラグインが含まれています（CDN 利用時は `>= 0.2.0` または `@latest` で利用可能）：
- **GLPK**: `dist/browser/solvers/glpk.js` (ESM) および `dist/browser/solvers/glpk.min.js` (IIFE、グローバル `WashiGLPK` を登録)
- **Z3**: `dist/browser/solvers/z3.js` (ESM) および `dist/browser/solvers/z3.min.js` (IIFE、グローバル `WashiZ3` を登録)、ならびに `z3-built.js` / `z3-built.wasm`

#### ブラウザ ESM での GLPK 利用
```html
<script type="module">
  import { Model } from "./washi/washi.js";
  import "./washi/solvers/glpk.js";

  const model = new Model({ solver: "glpk" });
  const x = model.addVar({ lb: 0, ub: 10 });
  model.maximize(x);
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
  const x = model.addVar({ lb: 0, ub: 10 });
  model.maximize(x);
  model.solve().then(status => console.log("GLPK ステータス:", status));
</script>
```

> [!NOTE]
> **ブラウザ環境での Z3 利用と Cross-Origin Isolation**:
> Z3 の WebAssembly エンジンはマルチスレッド（`SharedArrayBuffer`）を必要とするため、ブラウザのセキュリティ仕様により Cross-Origin Isolation が必須となります。ドキュメントレスポンスに以下のヘッダーが必要です：
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> また、別オリジンからアセットを読み込む場合は `Cross-Origin-Resource-Policy: cross-origin` の返却が必要です。
> 
> 任意のヘッダーを設定できない一般的な静的配信（GitHub Pages や CodePen 等の iframe プレビュー環境）では、追加対応なしで条件を満たすことはできません。なお、ライブラリ本体 `@ohtaman/washi` のインポートによって利用者のページに Service Worker が勝手に登録されることはありません。
> 
> GitHub Pages で公開している公式 Web デモでは、`/washi/` スコープ限定の独立した `coi-serviceworker.js` を同オリジンに配置・登録し、初回アクセス時に1回だけ安全に再読み込みを行って `window.crossOriginIsolated === true` を確立してから Z3 を実行します。Service Worker が利用できない環境や隔離の確立に失敗した環境では、原因を明示して安全に実行を中断します。

完全なスタンドアロンサンプル（ESM、スクリプトタグ、CodePen）は `examples/distribution/` に用意されています。

### 工場内・オフライン配布、Worker、自前配信

アプリのビルド出力一式、または `dist/browser` 一式をローカル HTTP サーバー・社内サーバーに配布します。必要なアセットがローカルにあれば、ブラウザのキャッシュが空でも外部ネットワークは不要です。HTML や最初の JS だけでは不足します。`file://` 実行や PWA の自動キャッシュは対象外です。

ESM はモジュール URL、script 版は読み込み時に保持した script URL からアセットを解決します。CDN の Worker は Blob のモジュールから起動します。配信元の CORS と、CSP の script・通信先許可が必要です。CDN Worker では `worker-src blob:` も許可してください。使えない場合は `useWorker: false` を指定します。Worker の読み込み・メッセージ処理に失敗した場合は、求解 Promise がエラーになります。

自前 URL は `setHighsWasmUrl(url)` / `options.wasmUrl` で指定できます。従来の HiGHS CDN を明示的に選ぶ場合：

```typescript
import { setHighsWasmUrl, OFFICIAL_HIGHS_CDN_WASM_URL } from "@ohtaman/washi";
setHighsWasmUrl(OFFICIAL_HIGHS_CDN_WASM_URL);
```

初期化に失敗すると取得先を含むエラーを返し、別ホストには切り替えません。従来のオリジンルート / CDN 自動フォールバックを利用していた場合は、生成アセットを配布するか URL を明示してください。

### 配布物の検証

`npm run test:distribution` は実際の npm tarball をインストールし、任意依存なしの Vite / webpack アプリをビルドして、生成 JS と実 WASM を VM で実行します。ブラウザ・CORS の検証とは別です。`npx playwright install chromium` 後に `RUN_DISTRIBUTION_BROWSER=1 npm run test:distribution` で Chromium の検証も実行できます。CI はそのモードを使い、別オリジン配信と外部ネットワーク遮断も確認します。

---

## 🛠️ カスタムソルバー開発と拡張性

WaSHI は疎結合なプラグイン方式のソルバーアーキテクチャを採用しています。独自の最適化エンジン（クラウド REST ソルバー、WebAssembly エンジン、商用ソルバーアダプターなど）を容易に構築・登録できます：

- 詳細な開発手順、API コントラクト仕様（`Solver`, `LpModelData`, `SolverResult`）、およびテスト手法については [Custom Solver Developer Guide](docs/custom-solver-guide.md) をご覧ください。

---

## 💻 サンプルとブラウザデモ

[サンプル一覧](https://github.com/ohtaman/washi/blob/main/examples/README.md)および[オンライン実践レシピ集・API逆引き索引](https://ohtaman.github.io/washi/ja/examples/)では、目的別・WaSHI の API 機能別にサンプルを探せます。

| カテゴリ | サンプル | 確認できること | ソルバー |
| :--- | :--- | :--- | :--- |
| **基本モデル** | [生産計画](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) | 整数変数、利益の最大化、資源制約 (`expr`, `c`) | HiGHS |
| **基本モデル** | [輸送・物流ネットワーク](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) | 2次元マトリクス変数 (`addVars(rows, cols)`) と供給・需要バランス | HiGHS |
| **基本モデル** | [栄養問題と感度分析](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) | 潜在価格 (`constr.dual`)、余剰 (`constr.slack`)、被約費用 (`var.reducedCost`) | HiGHS |
| **実践応用** | [スタッフのシフト作成](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) | 週間シフト最適化と、土曜日の希望休が衝突した際の原因特定 | HiGHS + Z3 |
| **実践応用** | [ECカートのクーポン最適適用](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) | 条件付き購入金額閾値 (`addIndicator`)、併用不可ルール、追加購入提案 | HiGHS |
| **実践応用** | [ポートフォリオ配分](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) | 凸二次目的関数 (`QuadExpr`) と配分の制約 | HiGHS |
| **論理 / SMT** | [業務ルールの検証](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) | 数値・論理制約 (`addBoolVar`, `implies`) の充足可能性の確認 | Z3 |
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

## 🧪 テスト & 信頼性

リポジトリのユニット・統合テストを実行し、配布物をビルドできます：

```bash
# すべてのユニット・統合テストを実行
npm test

# プロダクション用バンドルと型定義を生成
npm run build
```

---

## 📄 ライセンス

- **`@ohtaman/washi`**: [MIT ライセンス](./LICENSE)
- **HiGHS**（標準エンジン）: MIT ライセンス
- **Z3**（オプション）: MIT ライセンス
- **GLPK**（オプション）: GPL-3.0 ライセンス
