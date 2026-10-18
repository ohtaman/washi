# GLPK ソルバーエンジン

**GNU Linear Programming Kit (GLPK)** は、線形計画問題（LP）および混合整数計画問題（MIP）を解くために長年広く使われている実績あるソルバーパッケージです。

---

## インストール

GLPK は `glpk.js` を介したオプションの peer dependency として提供されます：

```bash
npm install glpk.js
```

---

## ライセンスに関する注意点 (GPL-3.0)

GLPK は **GNU General Public License v3.0 (GPL-3.0)** の下でライセンスされています。

- WaSHI 本体は MIT ライセンスであるため、`glpk.js` はコアパッケージに**静的バンドルされていません**。
- `@ohtaman/washi/solvers/glpk` を明示的にインポートして使用した場合にのみ動的に読み込まれます。
- GLPK を同梱して製品を配布する場合は、プロジェクトのライセンス方針が GPL-3.0 の要件に適合していることを確認してください。

---

## 基本的な使い方

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);
console.log("Objective:", model.objectiveValue);
```

---

## 結果のセマンティクスとステータスマッピング

### ソルバーステータス
GLPK のリターンコードは WaSHI の `SolverStatus` に厳密にマッピングされます：
- `GLP_OPT` (5) $\to$ `"Optimal"`
- `GLP_FEAS` (2) $\to$ `"Feasible"`（実行可能な MIP 暫定解あり）
- `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) $\to$ `"Infeasible"`
- `GLP_UNBND` (6) $\to$ `"Unbounded"`
- `GLP_UNDEF` (1) および未定義のステータス $\to$ `"Unknown"`（誤って `"Optimal"` と判定されることはありません）

### 解の取得可否
- 変数の解（`model.values`, `var.value`）および目的関数値（`model.objectiveValue`）は、有効な主問題解が存在する場合（`"Optimal"` または `"Feasible"`）にのみ格納されます。
- 解が得られなかった場合（`Infeasible`, `Unbounded`, `Unknown`, `Error`）、`model.objectiveValue` および各変数の `value` は `null` となり、偽のゼロ埋め解が返されることはありません。

### LP と MIP の違い
- **線形計画問題 (LP)**: シンプレックス法で求解され、最適解では双対変数（潜在価格 `constraint.dual`）および余剰（`constraint.slack`）が格納されます。
- **混合整数計画問題 (MIP)**: 分枝カット法で求解され、整数条件を満たす主問題解が得られます（離散最適化では双対変数は定義されないため省略されます）。
