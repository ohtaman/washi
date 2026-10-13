# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）へようこそ。

WaSHI は、Python の **PuLP** や Julia の **JuMP** が持つ直感的でエレガントな代数モデリング体験を、モダンな TypeScript / JavaScript エコシステムにもたらすライブラリです。C/C++ のネイティブビルドを一切必要とせず、WebAssembly ソルバー（**HiGHS**, **Z3**, **GLPK**）によってブラウザや Node.js で高速に数理最適化を実行できます。

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
import { Model, expr, c, maximize } from "@ohtaman/washi";
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

`model.constraint()` と `c` タグ付きテンプレートリテラルを用いて不等式・等式制約を表現します：

```typescript
model.constraint(c`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.constraint(c`2 * ${x} + ${y} <= 50`, "labor_capacity");
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

- [ランタイム環境設定](./runtimes.md): Node.js, ブラウザ, Next.js, CDN での動かし方
- [モデリングガイド](../guide/expressions.md): 変数・数式テンプレート・制約の記述方法
- [ソルバー詳細](../solvers/): 各ソルバーの特性と選び方
