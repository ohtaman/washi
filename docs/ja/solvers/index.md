# ソルバー概要

WaSHI は、疎結合でプラグイン可能なソルバーアーキテクチャを採用しています。共通の代数モデリング API で問題を定式化し、問題クラスやライセンス要件に合わせて最適なソルバーを選択して求解できます。

---

## ⚡ ソルバー比較マトリクス

| ソルバー | ライセンス | 対応問題クラス | 最適な用途 | WaSHI での提供形態 |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | **MIT** | **LP, MIP, 凸QP** | 産業グレードの最適化、生産計画、ポートフォリオ最適化 | **標準搭載**（設定不要） |
| **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** | **MIT** | **CP, LCG, 論理, 有界整数** | 排反スケジューリング、CP グローバル制約、COOP/COEP不要の `unsatCore` | **同梱プラグイン** (`@ohtaman/washi/solvers/pumpkin`・追加依存なし) |
| **[Z3](https://github.com/Z3Prover/z3)** (via [`z3-solver`](https://www.npmjs.com/package/z3-solver)) | **MIT** | **SMT, SAT, 論理, MIP** | 命題論理、競合診断 (`unsatCore`)、ルールエンジン | オプション (`@ohtaman/washi/solvers/z3`・要 `z3-solver`) |
| **[GLPK](https://www.gnu.org/software/glpk/)** (via [`glpk.js`](https://www.npmjs.com/package/glpk.js)) | **GPL-3.0** | **LP, MIP** | 学術ベンチマーク、既存 GLPK モデルとの互換検証 | オプション (`@ohtaman/washi/solvers/glpk`・要 `glpk.js`) |
| **Mock** | **MIT** | *任意* | WebAssembly をロードしない CI での超高速単体テスト | **標準搭載** |

---

## ソルバーの指定方法

`Model` の作成時、または `solve()` / `check()` の呼び出し時にソルバー名を指定します：

```typescript
// 1. 標準搭載の HiGHS (デフォルト)
const m1 = new Model({ solver: "highs" });

// 2. Pumpkin CP/LCG ソルバー (WASM 同梱・COOP/COEP 不要)
import "@ohtaman/washi/solvers/pumpkin";
const m2 = new Model({ solver: "pumpkin" });

// 3. Z3 SMT ソルバー
import "@ohtaman/washi/solvers/z3";
const m3 = new Model({ solver: "z3" });

// 4. GLPK ソルバー
import "@ohtaman/washi/solvers/glpk";
const m4 = new Model({ solver: "glpk" });
```

---

## 各ソルバーの詳細ガイド

- [HiGHS ガイド](./highs.md): Web Worker バックグラウンド実行、MIP 許容誤差、凸二次計画 (QP)、進捗イベントと中断。
- [Pumpkin ガイド](./pumpkin.md): 同梱 LCG 制約プログラミング、Web Worker バックグラウンド実行、グローバル CP 制約、ウォームスタート、COOP/COEP 不要な `unsatCore` 抽出。
- [Z3 ガイド](./z3.md): SMT 論理アサーション、`m.check()` による Unsat Core 競合診断、Cross-Origin Isolation 要件。
- [GLPK ガイド](./glpk.md): GLPK アダプターの使い方、GPL-3.0 ライセンス上の注意点、ステータスマッピング。
- [カスタムソルバー開発](./custom-solver.md): 社内クラウドソルバーや独自 WASM エンジンを WaSHI プラグインとして統合する開発ガイド。
