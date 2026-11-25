# 目的関数と求解 (`m.solve` & `m.check`)

目的関数は、利益の最大化・コストの最小化・2次形式のリスク（分散）の最小化など、最適化の目標を定義します。
目的関数なしで制約の充足可能性や論理ルールだけを検証したい場合は、`m.check()` を使用します。

---

## 目的関数の設定

`m.objective(maximize(...))` または `m.objective(minimize(...))` で最適化の向き（最大化／最小化）と目的関数式を設定します。

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0, ub: 40 });
const y = m.integer("y", { lb: 0, ub: 40 });

// リソース制約の下で売上を最大化: 50*x + 40*y
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));
m.constraint(expr`2 * ${x} + 3 * ${y} <= 100`, "resource_limit");

// コストの最小化の場合:
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

引数なしで `m.objective()` を呼び出すと、現在の目的関数式（`LinExpr | QuadExpr`）を取得できます。
目的関数を設定しない場合、モデルはデフォルトで `0` の最小化を行います。

> [!TIP]
> Min-Max / Max-Min 負荷平準化については [Min-Max / Max-Min 目的関数（負荷平準化）](./formulation-tips.md#min-max-max-min-目的関数-負荷平準化) を、多目的最適化と MIP の終了許容ギャップ（`relativeGap` / `absoluteGap`）の設計については [多目的最適化と MIP 終了条件の設計](./formulation-tips.md#multi-objective) を参照してください。

---

## モデルの実行 (`m.solve()` vs. `m.check()`)

WaSHI には2つの非同期実行メソッドがあります。

| メソッド | 戻り値 | 用途 |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | 全制約のもとで目的関数を最適化します。変数の解・目的関数値・MIP の双対境界値とギャップ・LP の双対値とスラックをモデルに格納します。 |
| **`await m.check(options?)`** | `Promise<CheckResult>` | 目的関数を用いずに制約の充足可能性を判定します。`{ status, values, conflicts?, unsatCore?, runTime? }` を返し、CP/SMT の充足可能性判定や矛盾診断に使います。 |

```typescript
const status = await m.solve({
  timeLimit: 10.0,     // 制限時間（秒）
  relativeGap: 0.01,   // 相対 MIP ギャップ許容値（1%）
  outputFlag: false,   // ソルバー内部ログの出力有無（HiGHS: outputFlag, GLPK: verbose）
});
```

### 求解オプション (`SolveOptions`) {#solve-options}

| オプション | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `solver` | `string` \| `Solver` | モデルのソルバー (`"highs"`) | 実行に使用する登録済みソルバー名（`"highs"`, `"pumpkin"`, `"z3"`, `"glpk"` またはカスタム名）または `Solver` インスタンス。 |
| `timeLimit` | `number` | `undefined` | 最大実行時間（秒）。 |
| `relativeGap` | `number` | `undefined` | 相対 MIP 最適性ギャップの許容値（例：`0.01` = 1%）。 |
| `absoluteGap` | `number` | `undefined` | 絶対 MIP 最適性ギャップの許容値（HiGHS `mip_abs_gap`）。 |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | 前処理（Presolve）の動作モード。 |
| `relax` | `boolean` | `false` | 整数・バイナリ変数を連続変数に緩和した LP 緩和を解きます（`m.relax()` と同等）。HiGHS・GLPK で対応。 |
| `outputFlag` / `verbose` | `boolean` | `false` | ソルバーの内部ログ出力の有効化（HiGHS は `outputFlag`、GLPK は `verbose`）。 |
| `useWorker` | `boolean` | ブラウザ: `true` / Node.js: `false` | ブラウザでの HiGHS・Pumpkin の Web Worker 実行。メインスレッド実行時は `false`。Node.js では省略するか `false` を指定（明示的な `true` はエラー）。 |
| `wasmUrl` | `string` | 自動解決 | ブラウザ環境で `highs.wasm` や `pumpkin.wasm` を読み込むカスタム URL。 |
| `signal` | `AbortSignal` | `undefined` | キャンセル用の `AbortSignal`（`AbortController.signal`）。バックエンドごとの対応状況は後述を参照。 |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | 求解中の進捗スナップショットを受け取るコールバック。 |

第1引数にソルバー名を直接指定して `await m.solve("glpk", { timeLimit: 5 })` のように呼び出すこともできます。
未対応のオプションを指定した場合、ソルバーは暗黙に無視せずエラーをスローします。各ソルバーの対応オプションは [ソルバー概要](../solvers/index.md) を参照してください。

---

## 結果・ギャップ指標・ステータスの読み取り

求解完了後、ステータス・目的関数値・変数値・MIP の双対境界値とギャップをモデルから読み取れます。

```typescript
const status = await m.solve();

console.log("Status:", m.status);                         // 例: "Optimal", "Feasible"
console.log("Termination Reason:", m.terminationStatus);  // 例: "Optimal", "TimeLimit", "Interrupted"
console.log("Has Primal Solution:", m.hasPrimalSolution); // 解が利用可能なとき true

// 目的関数値と MIP ギャップ指標
console.log("Objective Value:", m.objectiveValue);        // 目的関数値 (または null)
console.log("Objective Bound:", m.objectiveBound);        // 双対境界値 (または undefined)
console.log("Relative Gap:", m.relativeGap);              // 相対ギャップ
console.log("Absolute Gap:", m.absoluteGap);              // 絶対ギャップ |objectiveValue - objectiveBound|

// 変数値の取得 (.value または変数名キーの m.values ReadonlyMap)
console.log("x =", x.value, "y =", y.value);
console.log("x by name:", m.values.get("x"));
```

`relax: true` を使わずに解いた場合、`Integer`・`Binary` 変数の `.value` は整数から `1e-5` 以内であれば厳密な整数へ自動正規化されますが、`m.objectiveValue` はソルバーが返した生の浮動小数点値を保持します。

> [!TIP]
> 得られた解が変数の上下限・整数条件・すべての制約を許容誤差内で満たしているかを独立して検証するには、`m.verify()` を呼び出してください。
> 詳細は [矛盾診断・検証・デバッグ（`m.verify()`）](./unsat-core.md#verifying-solutions-m-verify) を参照してください。

### `m.status` と `m.terminationStatus` の違い

MIP ソルバーが制限時間（`timeLimit`）・反復上限・`AbortSignal` などにより途中で停止した場合、次の2点を区別して確認します。

1. **利用可能な実行可能解があるか？** `m.hasPrimalSolution` または `m.status` を確認します。
2. **なぜソルバーが停止したか？** `m.terminationStatus` を確認します。

停止前に有効な解（**暫定解**）が見つかっていた場合、WaSHI は `m.status = "Feasible"` を設定します。
このとき `x.value` にその暫定解、`m.objectiveValue` にその目的関数値（暫定値）が入り、停止理由は `m.terminationStatus`（`"TimeLimit"`・`"IterationLimit"`・`"Interrupted"` など）に記録されます。
解が1つも見つからずに止まった場合は、`m.hasPrimalSolution` が `false` となり、`m.status` は `"TimeLimit"`・`"IterationLimit"`・`"Unknown"` のいずれかになります。

### 全 `SolverStatus` 一覧

| ステータス | `hasPrimalSolution` | 意味 |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | 許容誤差内で大域的最適性が証明された最適解が得られました。 |
| `"Feasible"` | `true` | 実行可能解は見つかりましたが、最適性の証明前に停止しました（理由は `terminationStatus` を参照）。 |
| `"Sat"` | `true` | すべての制約を満たす解が見つかりました（`m.check()`）。 |
| `"Infeasible"` | `false` | すべての制約を同時に満たす解が存在しないことが証明されました。 |
| `"Unsat"` | `false` | 制約集合が充足不能（矛盾）であることが証明されました（`m.check()`）。 |
| `"Unbounded"` | `false` | 制約を満たしたまま目的関数値を無限に改善できます（非有界）。 |
| `"TimeLimit"` | `false` | 実行可能解が見つかる前に制限時間に達しました。 |
| `"IterationLimit"` | `false` | 実行可能解が見つかる前に反復上限に達しました。 |
| `"Unknown"` | `false` | 実行可能解が得られないまま停止しました（例：解発見前の `AbortSignal` による中断）。 |
| `"Error"` | `false` | ソルバー内部でエラーが発生しました。 |
| `"NotSolved"` | `false` | 求解前、またはモデル変更により解がリセットされた未求解状態です。 |

---

## リアルタイム進捗 (`onProgress`) と中断 (`AbortSignal`)

時間のかかる MIP 計算をインタラクティブな UI で実行する際、`onProgress` で分枝限定法の進捗を受け取り、`AbortController` で中断できます。

```typescript
const controller = new AbortController();

const status = await m.solve({
  signal: controller.signal,
  onProgress: (event) => {
    console.log(
      `[${event.elapsedTime.toFixed(1)}s] ` +
      `暫定値: ${event.objectiveValue ?? "—"}, ` +
      `境界値: ${event.objectiveBound ?? "—"}, ` +
      `ギャップ: ${event.relativeGap !== undefined ? (event.relativeGap * 100).toFixed(2) + "%" : "—"}`
    );

    // 例（最大化問題）: 目標値以上の暫定解が見つかった時点で早期終了する
    if (event.objectiveValue !== undefined && event.objectiveValue >= 1000) {
      controller.abort();
    }
  },
});

console.log("ステータス:", m.status);               // 暫定解があれば "Feasible"、なければ "Unknown"
console.log("終了理由:", m.terminationStatus);      // "Interrupted"
console.log("解の有無:", m.hasPrimalSolution);      // 暫定解が存在すれば true
```

> [!NOTE]
> **バックエンドごとの `AbortSignal` の挙動**:
> - **非同期の即時中断**: ブラウザの Web Worker（`useWorker: true`）で HiGHS または Pumpkin を実行している場合、`abort()` を呼ぶと Worker を即座に終了します。
> - **協調的な途中中断**: Node.js やブラウザのメインスレッド（`useWorker: false`）でも、HiGHS は `onProgress` コールバック内の `abort()` 呼び出し経由で、Pumpkin は探索チェックポイントおよび `onProgress` 経由で実行中の求解を中断できます。
> - **開始前のみの中断**: GLPK と Z3 では、`AbortSignal` は求解の開始前にのみ確認されます。

### `SolveProgressEvent` のフィールド

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | 求解開始からの経過秒数（別名 `elapsedSeconds` が併記される場合があります）。 |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | 現在のソルバーフェーズ（取得可能な場合）。 |
| `objectiveValue` | `number \| undefined` | 現在見つかっている最良の実行可能解（暫定解）の目的関数値。 |
| `objectiveBound` | `number \| undefined` | 現在の最良双対境界値（Objective Bound）。 |
| `relativeGap` | `number \| undefined` | 現在の相対 MIP ギャップ（`0.05` = 5%）。 |
| `absoluteGap` | `number \| undefined` | 現在の絶対 MIP ギャップ `\|objectiveValue - objectiveBound\|`。 |
| `nodes` | `number \| undefined` | 探索済みの分枝限定ノード数。 |
| `iterations` | `number \| undefined` | ソルバーの反復回数（単体法（シンプレックス法）、内点法、または MIP の LP 緩和反復）。 |
| `message` | `string \| undefined` | ソルバーが出力した生の進捗ログ行。 |

---

## モデルの変更と解の状態の同期

`Model` インスタンスは、`Model` メソッドや `Model`・`Var`・`Constraint` のプロパティセッターによる変更を検知し、解の状態の整合性を保ちます。

### 求解後の変更による状態リセット

変数や制約の追加、または `m.objective()`・`m.sense` による目的関数の変更を行うと、`m.status` は即座に `"NotSolved"` に戻ります。
変数のプロパティ（`v.lb`, `v.ub`, `v.type`, `v.initialValue`）や制約のプロパティ（`c.lhs`, `c.sense`, `c.rhs`）を変更した場合も同様です。
同時に `m.solution` と `m.objectiveValue` がクリアされ、各変数の `value`・`reducedCost` および各制約の `dual`・`slack` がすべて `null` にリセットされます。

### 実行中の変更と重複呼び出しの保護

- **求解中のモデル変更**: `m.solve()` や `m.check()` の実行中にモデルを変更すると、その実行の結果は破棄され、`m.status` は `"NotSolved"` に保たれたまま進行中の Promise が reject されます。
- **重複呼び出しの制御**: 同じモデルで新しい `m.solve()` または `m.check()` を開始すると、先行していた実行が後から完了しても、最新の結果が上書きされないように保護されます。
- **一括操作のロールバック**: `m.constraint([...])` などの一括操作に不正な要素が含まれる場合、部分的な変更を残さず全体がロールバックされ、既存の有効な解も維持されます。

> [!NOTE]
> `Var.name` は読み取り専用であり、登録済み制約の名前変更（`c.name = ...`）は次回の求解・検証・エクスポート時の整合性チェックでエラーになります。
> `c.lhs.terms` や `BoolOp.children` のような内部マップ・AST 配列を直接書き換えると変更検知をすり抜けて古い解が残る恐れがあるため、代わりに `c.addTerm()`・`c.setTerm()` またはプロパティセッターを使用してください。
