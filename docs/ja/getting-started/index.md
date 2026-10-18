# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）へようこそ。

WaSHI は、Python の **PuLP** や Julia の **JuMP** のような代数モデリングを TypeScript / JavaScript エコシステムで提供するライブラリです。別途 Python サーバーや C/C++ のネイティブビルドを用意することなく、WebAssembly ソルバー（**HiGHS**, **Z3**, **GLPK**）によってブラウザや Node.js で数理最適化を実行できます。

### なぜ TypeScript & WebAssembly なのか？

- **デプロイのボトルネック解消とクライアント完結**: 従来の数理最適化ワークフロー（Python の PuLP や Pyomo など）では、作成したモデルを他の人が使える Web ツールとして公開しようとすると、Python バックエンドやネイティブソルバーのホスティング・運用が必要になります。AI コーディングによって UI やアプリケーションの実装が高速化する中、このインフラ準備が公開時のボトルネックになりがちです。モデラーとソルバーを Web 標準技術（TypeScript + WebAssembly）で動かすことで、静的アセット（生成された JS・Worker・WASM を配信する GitHub Pages や Cloudflare Pages などの静的ホスティング。Z3 利用時は COOP/COEP ヘッダーが必要）として配布でき、さらにブラウザ内 LLM（WebGPU / WebLLM 等）ともサーバーを介さず同一ランタイム内で連携できます。
- **演算子オーバーロードなしでの数式記述 (`expr`)**: JavaScript / TypeScript には演算子オーバーロードがないため、通常のライブラリは冗長なメソッドチェーン（`x.mul(30).add(y.mul(50))`）か、型が効かない生文字列パース（`"30 * x + 50 * y"`）の二択になりがちです。WaSHI は SQL クエリビルダのパラメータバインディングと同様にタグ付きテンプレートリテラル（`` expr`30 * ${x} + 50 * ${y} <= 40` ``）を採用し、中置記法の演算子を解析しつつ `${x}` を実際の TypeScript オブジェクト参照としてバインドします。これにより、型チェック・IDE の変数リネーム（F2）・多次元配列の添字指定（`${flow[i][j]}`）がそのまま機能します。

---

## 📦 インストール

お好みのパッケージマネージャーでインストールしてください：

::: code-group

```bash [npm]
npm install @ohtaman/washi
```

```bash [pnpm]
pnpm add @ohtaman/washi
```

```bash [yarn]
yarn add @ohtaman/washi
```

```bash [bun]
bun add @ohtaman/washi
```

:::

### オプションのソルバー依存関係

標準の **HiGHS** ソルバーは設定不要で本体に同梱されています。Z3 による SMT 論理制約や競合診断（Unsat Core）、GLPK 互換が必要な場合は、対応する peer dependencies をインストールしてください：

```bash
# SMT論理およびUnsat Core競合診断用
npm install z3-solver

# GLPKソルバー用 (GPL-3.0)
npm install glpk.js
```

---

## 🚀 クイックスタート

工場における製品生産計画の最適化を例に、WaSHI の基本的な使い方を説明します。

### 1. クラスとタグのインポート

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
```

### 2. モデルのインスタンス化

```typescript
const model = new Model();
```

### 3. 決定変数の定義

決定変数は最適化によって求めたい未知数です。ドメインファクトリメソッド（`m.continuous`, `m.integer`, `m.binary`, `m.bool`）で直感的に定義します：

```typescript
const x = model.integer("x", { lb: 0 });
const y = model.integer("y", { lb: 0 });
```

### 4. 目的関数の設定

`maximize()` コンビネータと `expr` タグ付きテンプレートリテラルを用いて、目的関数を宣言的に設定します：

```typescript
// 30*x + 50*y の最大化
model.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
```

### 5. 制約条件の追加

`model.constraint()` と `expr` タグ付きテンプレートリテラルを用いて不等式・等式制約を表現します：

```typescript
model.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_capacity");
```

### 6. 求解と結果の取得

モデルを非同期で解きます。デフォルトで WebAssembly (HiGHS) が実行されます：

```typescript
const result = await model.solve();

console.log("ステータス:", model.status); // "Optimal"
console.log("最適目的関数値:", model.objectiveValue); // 1100
console.log(`最適解: x = ${x.value}, y = ${y.value}`); // x = 20, y = 10
```

---

## 🧭 次のステップ

- [AI コーディングエージェント向けクイックリファレンス](./ai-agents.md): AI コーディングエージェント向けの API シグネチャとデプロイ要点の速習リファレンス
- [ランタイム環境設定](./runtimes.md): Node.js, ブラウザバンドラー, ESM, CDN, イントラネット (CSP) での動かし方
- [モデリングガイド](../guide/variables.md): 決定変数・数式テンプレート (`expr`)・制約条件の記述方法
- [ソルバー詳細](../solvers/): 各ソルバーの特性と選び方
- [実践例・API 逆引きインデックス](../examples/): ブラウザ上で直接実行できる 9 つの最適化・論理モデリング事例


