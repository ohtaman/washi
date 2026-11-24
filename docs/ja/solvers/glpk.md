# GLPK ソルバーエンジン

**GNU Linear Programming Kit（GLPK）** は、線形計画問題（LP）および混合整数計画問題（MIP）を解くためのオープンソースのシンプレックス・分枝カット法ソルバーです。

---

## GLPK と HiGHS の使い分け

| 用途 | 推奨ソルバー | 選定理由 |
| :--- | :--- | :--- |
| **一般的な LP・MIP 最適化** | **[HiGHS](./highs.md)**（デフォルト） | MIT ライセンスで標準同梱。MIP が高速で、Web Worker・ウォームスタート・LP 双対値/スラック/被約費用に対応。 |
| **学術ベンチマーク・GLPK モデルの検算** | **GLPK**（`@ohtaman/washi/solvers/glpk`） | GNU GLPK 5.0 の挙動を再現したい場合や、既存 GLPK モデルのクロスチェックに適合。 |

---

## インストール

GLPK は `glpk.js` 経由のオプションの peer dependency です。

```bash
npm install glpk.js
```

---

## ライセンスに関する注意点 (GPL-3.0)

GLPK は **GNU General Public License v3.0（GPL-3.0）** の下で提供されています。

- WaSHI 本体は MIT ライセンスであるため、`glpk.js` はコアパッケージに**静的バンドルされていません**。
- `@ohtaman/washi/solvers/glpk` を明示的にインポートしたときにのみ動的に読み込まれます。
- GLPK を同梱して製品を配布する場合は、配布方針が GPL-3.0 の条件を満たすことを確認してください。

---

## 基本的な使い方

`@ohtaman/washi/solvers/glpk` を一度インポートすると `"glpk"` ソルバーが登録されます。LP・MIP モデルは標準の `Model` API でそのまま記述・求解できます。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);      // Optimal
console.log("Objective:", model.objectiveValue); // 40
console.log("Shadow price:", cap.dual);          // 2
```

---

## ソルバーオプションと実行モデル

GLPK は WaSHI の `useWorker: true` オプションに対応しておらず、指定すると `Error` を投げます。Node.js では `glpk.js` がメインスレッド上で同期実行され、いずれの環境でも `signal` は求解開始前にのみ判定されます（実行中の途中中断は不可）。

### 対応オプション

| オプション | 型 | 説明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大実行時間（秒、`tmlim`）。 |
| `relativeGap` | `number` | 相対 MIP ギャップ許容値（`mipgap`）。 |
| `presolve` | `"on" \| "off" \| "choose"` | GLPK の前処理を制御（`"off"` で無効、`"on"` / `"choose"` で有効）。 |
| `verbose` | `boolean` | GLPK のコンソールログ出力を有効化（既定は `false`）。 |
| `relax` | `boolean` | MIP モデルの連続 LP 緩和問題を解く。 |
| `signal` | `AbortSignal` | 求解開始前に中断状態を確認（実行中の同期求解は中断不可）。 |
| `onProgress` | `(ev) => void` | MIP 分枝カット中のコールバック、または求解完了時に通知。 |

### 未対応オプションと機能（実行時にエラー）

- **`outputFlag`**: `Error` を投げます。代わりに `verbose: true` を使ってください。
- **その他の未対応オプション**: `absoluteGap`・`threads`・`useWorker: true` および未定義キーは `Error` を投げます。
- **未対応モデル機能**: `initialValue` ウォームスタートおよび `QuadExpr` 二次目的関数は `Error` を投げます。

---

## 結果のセマンティクスとステータスマッピング

### ソルバーステータス

GLPK のリターンコードは WaSHI の `SolverStatus` に厳密にマッピングされます。

| GLPK コード | WaSHI ステータス | 意味 |
| :--- | :--- | :--- |
| `GLP_OPT` (5) | `"Optimal"` | 最適解を取得。 |
| `GLP_FEAS` (2) | `"Feasible"` | 実行可能な MIP 暫定解あり。 |
| `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) | `"Infeasible"` | 実行可能解が存在しない。 |
| `GLP_UNBND` (6) | `"Unbounded"` | 目的関数が非有界。 |
| `GLP_UNDEF` (1) / その他 | `"Unknown"` | 未定義・未認識（`"Optimal"` には誤分類されない）。 |

### 解の取得可否

- `model.values`・`var.value`・`model.objectiveValue` は `"Optimal"` または `"Feasible"` の場合にのみ格納されます。
- `Infeasible`・`Unbounded`・`Unknown`・`Error` の場合、`model.objectiveValue` と各変数の `value` は `null` のままになります。

### LP と MIP の違い

- **線形計画問題（LP）**: シンプレックス法で求解されます。最適解で格納されるのは制約の双対値（`c.dual`）のみで、`c.slack` と `v.reducedCost` は常に `null` です。
- **混合整数計画問題（MIP）**: 分枝カット法で求解します。双対値は省略され、`objectiveBound`・`relativeGap`・`absoluteGap` は `undefined` です。
