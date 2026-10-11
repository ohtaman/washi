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
5. 🔍 **実行不可能（Infeasible）時の矛盾原因自動診断**: ルール同士が矛盾して解なしになった場合、どの制約同士が衝突しているかの最小部分集合（Unsat Core）を Z3 エンジン経由で瞬時に特定・診断します。
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

業務ルールや制約群が互いに矛盾している場合、**矛盾を引き起こしている最小の制約サブセット**を特定してデバッグ（Z3 が必要）：

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

### 5. Python PuLP 互換レイヤー

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

## 💻 サンプルスクリプト & インタラクティブ Web デモ

`examples/node/` 配下に実行可能なスタンドアロンスクリプトを用意しています：

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
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
