<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - TypeScript / JavaScript のための数理最適化・代数モデラー" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>TypeScript / JavaScript のための直感的な数理最適化・代数モデラー</strong></p>
  <p>
    <em>線形計画 (LP) • 混合整数計画 (MIP) • 凸二次計画 (QP) • SMT論理制約 &amp; 矛盾診断</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://ohtaman.github.io/washi/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://bundlephobia.com/package/@ohtaman/washi"><img src="https://img.shields.io/badge/bundle%20size-7.2%20kB%20(gzip)-blue" alt="bundle size" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
    <img src="https://img.shields.io/badge/types-TypeScript-blue" alt="TypeScript types" />
    <img src="https://img.shields.io/badge/tests-120%2B%20passing-brightgreen" alt="tests" />
  </p>
</div>

---

**WaSHI** は、Python の **PuLP** や Julia の **JuMP** のような表現力豊かな代数モデリングの美しさを、モダンな TypeScript / JavaScript エコシステムにもたらす高水準モデラーライブラリです。数式そのままの自然な記法で数理最適化モデルを定式化し、Node.js、ブラウザ、Bun、Deno、Next.js 上でネイティブ C++ コンパイル不要で即座に求解できます（WebAssembly 版の **HiGHS**、**Z3**、**GLPK** ソルバーを統合サポート）。

```ts
import { Model, expr, c } from "@ohtaman/washi";

const m = new Model({ sense: "Maximize" });
const x = m.addVar({ type: "Integer", lb: 0 });
const y = m.addVar({ type: "Integer", lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`生産量: x=${x.value}, y=${y.value} (最大利益: $${m.objectiveValue})`);
```

---

## 🎯 なぜ WaSHI を選ぶのか？

1. 🌐 **完全クライアントサイド実行 & サーバーコストゼロ**: ブラウザ、エッジワーカー、Electron アプリ内で本格的な数理最適化を完結。バックエンドサーバーの運用コストがゼロになり、オフライン環境でも動作可能。社外秘データ（シフト表や原価など）が外部に送信されないため強固なプライバシーを担保します。
2. 📦 **ゼロ依存・単一パッケージでの圧倒的な配布容易性**: Python のランタイム管理や仮想環境、OS 別の C/C++ ネイティブソルバーバイナリの同梱に悩まされることはありません。`npm install @ohtaman/washi` だけで WebAssembly ソルバーを含めて即座に動作します。
3. ✍️ **直感的な代数モデリング DX（PuLP / python-mip 互換）**: 泥臭い行列のインデックス操作は不要。テンプレートリテラル記法（`c`${x} + 2 * ${y} <= 40``）や、Python 最適化開発者におなじみの構文（`LpProblem`, `lpSum`）で、教科書そのままの数式を記述できます。
4. 🔄 **統一マルチソルバー API（HiGHS / Z3 / GLPK）**: 定式化したモデルコードはそのまま、産業用 MIP/QP に強い **HiGHS**、論理制約・SMT に強い **Z3**、学術用途の **GLPK** をオプション1つで柔軟に切り替え可能です。
5. 🔍 **実行不可能（Infeasible）時の矛盾原因自動診断**: ルール同士が矛盾して解なしになった場合、衝突している制約の部分集合（Unsat Core）を Z3 エンジン経由で特定・診断します。
6. ⚡ **WebAssembly 上での本格的な産業規模パフォーマンス**: 線形時間 $O(N)$ の高速式ビルダーにより、20,000 変数を超える大規模 MIP を約100msで定式化し、WebAssembly 版 HiGHS で約15秒で高速に求解します。

---

## ⚡ ソルバー対応マトリクス

| ソルバー | ライセンス | 解ける問題クラス | 最適な用途 | WaSHI での提供形態 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 産業規模の計画最適化、生産スケジューリング、金融ポートフォリオ | **標準ビルトイン**（ゼロ設定） |
| **Z3** | **MIT** | **SMT, SAT, 命題論理, MIP** | 業務ルール検証、制約矛盾の診断 (`unsatCore`)、ルールエンジン | オプションプラグイン (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 学術的ベンチマーク、既存 GLPK モデル資産との照合 | オプションプラグイン (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | *任意* | WASM をロードしない CI/CD での高速単体テスト | 標準ビルトイン |

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
import { Model, c, expr } from "@ohtaman/washi";

const m = new Model({ name: "FactoryPlanning", sense: "Maximize" });

// 決定変数（整数・非負）
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// テンプレートリテラル記法による自然な目的関数と制約
m.maximize(expr`30 * ${chairs} + 50 * ${tables}`);
m.addConstraint(c`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// 標準の HiGHS WASM エンジンで求解
const status = await m.solve();

console.log(`ステータス: ${status}`); // "Optimal"
console.log(`最大利益: $${m.objectiveValue}`); // 1100
console.log(`生産数: 椅子=${chairs.value}, 机=${tables.value}`); // 椅子 20, 机 10
```

#### 🗂 多次元変数グリッド (`addVars`)

キー一覧や多次元インデックスから、1 行で変数群を定義（PuLP の `LpVariable.dicts` 相当）：

```ts
// 1次元辞書形式のバイナリ変数群
const openCity = m.addVars(["Tokyo", "Osaka", "Nagoya"], { type: "Binary" });

// 2次元輸送量行列: [工場] x [店舗]
const flow = m.addVars(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2次元グリッド (例: 8x8 チェス盤)
const board = m.addVars(8, 8, { type: "Binary", prefix: "queen" });
```

#### 🔀 Big-M インジケータ制約 (`addIndicator`)

条件分岐や固定費の発生ルールを、煩雑な手動 Big-M 計算なしに記述：

```ts
// 「東京工場が稼働していない (openCity['Tokyo'] == 0) なら、生産量 flow は 0」
m.addIndicator(openCity["Tokyo"], flow["F1"]["StoreA"].le(0), {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. ポートフォリオのリスク最小化 (凸二次計画: QP)

期待リターンと予算制約を満たしつつ、共分散行列に基づく投資リスクを最小化：

```ts
import { Model, QuadExpr, sum } from "@ohtaman/washi";

const m = new Model({ name: "MarkowitzPortfolio", sense: "Minimize" });
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// 決定変数: 投資比率 (0.0 〜 1.0)
const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

// 1. 予算制約: 合計 100%
m.addConstraint(sum(w).eq(1.0), "budget");

// 2. 目標リターン: 最低 8.5%
m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

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
    risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
  }
}
m.minimize(risk);

await m.solve();
console.log(`最小分散: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name, i) => {
  console.log(`  ${name}: ${((w[i].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT 論理制約 & ルールエンジン (Z3 連携)

命題変数（`BoolVar`）と論理結合子（`and`, `or`, `implies`, `not`, `xor`）、数値比較制約を混在させたルール定義：

```ts
import { Model, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.addBoolVar("isNight");
const motion = m.addBoolVar("motion");
const alarm = m.addBoolVar("alarm");
const siren = m.addBoolVar("siren");
const lux = m.addVar({ name: "lux", type: "Integer", lb: 0 });

// 論理ルール
m.addConstraint(lux.le(50).implies(isNight), "dark_implies_night");
m.addConstraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// 観測されたセンサー値
m.addConstraint(lux.le(10), "sensor_dark");
m.addConstraint(motion, "sensor_motion");
m.addConstraint(alarm, "alarm_on");

// 目的関数なしで制約充足可能性（SAT）を判定
const res = await m.check({ solver: "z3" });

console.log(`充足可能？ ${res.status === "Sat"}`); // true
console.log(`サイレン作動？ ${m.values.get("siren")}`); // true
```

---

### 4. 矛盾原因の自動特定 (`unsatCore`)

業務ルールや制約群が互いに矛盾している場合、**矛盾を引き起こしている制約の部分集合**（Unsat Core。最小性は保証しません）を特定してデバッグ（Z3 が必要）：

```ts
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
const rushDelivery = m.addBoolVar("rushDelivery");

// ルール 1: エンジニア1人あたり $8,000
m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

// ルール 2: 特急納品が必須
m.addConstraint(rushDelivery, "rush_required");

// ルール 3: 特急納品には最低 8 人のエンジニアが必要
m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// ルール 4: 役員会の予算上限 $50,000 (矛盾: 8人 * $8000 = $64,000 > $50,000!)
m.addConstraint(budget.le(50000), "strict_board_budget_cap");

// ルール 5: 最低 1 人雇用の労働基準（無関係なルール）
m.addConstraint(engineers.ge(1), "minimum_one_employee");

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
import { Model, expr, c } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ sense: "Maximize", solver: "glpk" });
const x = m.addVar({ type: "Integer", lb: 0 });
const y = m.addVar({ type: "Integer", lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.solve();
console.log(`ステータス: ${status}`); // "Optimal"
console.log(`目的関数値: ${m.objectiveValue}`); // 1100
```

---

### 6. Python PuLP 互換レイヤー

既存の Python PuLP 最適化スクリプトをスムーズに移植：

```ts
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  HiGHS,
  value,
} from "@ohtaman/washi";

const prob = new LpProblem("PuLPDemo", LpMaximize);

const x = new LpVariable("x", 0, undefined, LpInteger);
const y = new LpVariable("y", 0, undefined, LpInteger);

// PuLP の += 相当
prob.add(x.mul(30).add(y.mul(50)));
prob.add(x.add(y.mul(2)).le(40));
prob.add(x.mul(2).add(y).le(50));

await prob.solve(new HiGHS());

console.log(`ステータス: ${prob.status}`);
console.log(`目的関数値: ${value(prob.objective)}`);
console.log(`x = ${value(x)}, y = ${value(y)}`);
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

ブラウザ配布物には、`dist/browser/solvers/` 配下に事前バンドルされたスタンドアロンソルバープラグインが含まれています：
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
> **ブラウザ環境での Z3 利用について**:
> Z3 の WebAssembly エンジンはマルチスレッド（`SharedArrayBuffer`）を必要とするため、配信 Web サーバーがドキュメントレスポンスに以下の Cross-Origin-Isolation ヘッダーを送信する必要があります：
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> また、別オリジン（CDN など）からアセットを読み込む場合は `Cross-Origin-Resource-Policy: cross-origin` の返却が必要です。

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

## 💻 サンプルスクリプト & インタラクティブ Web デモ

`examples/node/` 配下に実行可能なスタンドアロンスクリプトを用意しています：

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
```

ブラウザで動く Web デモ (`examples/web-demo`) を起動するには：

```bash
npm run dev
# ドキュメント: http://localhost:5173/
# インタラクティブデモ: http://localhost:5173/demo/
```

---

## 🧪 テスト & 信頼性

厳格なテスト駆動開発 (TDD) により、120 以上の自動テストを実施しています：

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
