# ソルバー概要

WaSHI は、疎結合でプラグイン可能なソルバーアーキテクチャを採用しています。共通の代数モデリング API で問題を定式化し、問題クラスやライセンス要件に合わせて最適なソルバーを選択して求解できます。

---

## ⚡ ソルバー比較マトリクス

| ソルバー | ライセンス | 対応問題クラス | 最適な用途 | WaSHI での提供形態 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 産業グレードの最適化、生産計画、ポートフォリオ最適化 | **標準搭載**（設定不要） |
| **Z3** | **MIT** | **SMT, SAT, 論理, MIP** | 命題論理、競合診断 (`unsatCore`)、ルールエンジン | オプション (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 学術ベンチマーク、既存 GLPK モデルとの互換検証 | オプション (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | *任意* | WebAssembly をロードしない CI での超高速単体テスト | **標準搭載** |

---

## ソルバーの指定方法

`Model` の作成時、または `solve()` / `check()` の呼び出し時にソルバー名を指定します：

```typescript
// 1. 標準搭載の HiGHS (デフォルト)
const m1 = new Model({ solver: "highs" });

// 2. Z3 SMT ソルバー
import "@ohtaman/washi/solvers/z3";
const m2 = new Model({ solver: "z3" });

// 3. GLPK ソルバー
import "@ohtaman/washi/solvers/glpk";
const m3 = new Model({ solver: "glpk" });
```

---

## 各ソルバーの詳細ガイド

- [HiGHS ガイド](./highs.md): Web Worker バックグラウンド実行、MIP 許容誤差、凸二次計画 (QP)、進捗イベントと中断。
- [Z3 ガイド](./z3.md): SMT 論理アサーション、`m.check()` による Unsat Core 競合診断、Cross-Origin Isolation 要件。
- [GLPK ガイド](./glpk.md): GLPK アダプターの使い方、GPL-3.0 ライセンス上の注意点、ステータスマッピング。
- [カスタムソルバー開発](./custom-solver.md): 社内クラウドソルバーや独自 WASM エンジンを WaSHI プラグインとして統合する開発ガイド。
