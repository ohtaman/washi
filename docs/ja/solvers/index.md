# ソルバー概要

WaSHI は、疎結合でプラグイン可能なソルバーアーキテクチャを採用しています。統一された代数モデリング API で問題を定式化し、問題の性質に合わせて最適なソルバーを選択して解くことができます。

---

## ⚡ ソルバー比較マトリクス

| ソルバー | ライセンス | 対応問題クラス | 最適な用途 | WaSHIでの提供形態 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 工業グレードの最適化、生産計画、金融 | **標準搭載**（設定不要） |
| **Z3** | **MIT** | **SMT, SAT, 論理, MIP** | 命題論理、競合診断 (`unsatCore`)、ルールエンジン | オプション (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 学術ベンチマーク、レガシーGLPK互換 | オプション (`@ohtaman/washi/solvers/glpk`) |

---

## ソルバーの指定方法

`Model` のインスタンス化時に `solver` を指定します：

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
