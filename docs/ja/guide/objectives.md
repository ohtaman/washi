# 目的関数と求解 (`m.solve` & `m.check`)

目的関数は、利益の最大化・コストの最小化・2次リスク分散の最小化など、最適化のゴールを定義します。
目的関数なしで制約の充足可能性や論理ルールだけを検証したい場合は、`m.check()` を使用します。

---

## 目的関数の設定

`m.objective(maximize(...))` または `m.objective(minimize(...))` で最適化の方向と数式を宣言します。

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
> Min-Max / Max-Min 負荷平準化、多目的最適化、MIP 終了許容ギャップ（`relativeGap` / `absoluteGap`）の設計については、[定式化パターン・Tips](./formulation-tips.md#multi-objective) を参照してください。

---

## モデルの実行 (`m.solve()` vs. `m.check()`)

WaSHI には2つの非同期実行メソッドがあります。

| メソッド | 戻り値 | 用途 |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | 全制約のもとで目的関数を最適化します。変数の解、目的関数値、MIP の境界・ギャップ、LP の双対値とスラックを格納します。 |
| **`await m.check(options?)`** | `Promise<CheckResult>` | 目的関数なしで制約を満たせるか判定します。`{ status, values, conflicts?, unsatCore?, runTime? }` を返し、CP/SMT の判定や矛盾診断に使います。 |

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
| `relativeGap` | `number` | `undefined` | 相対 MIP ギャップ許容値（例：`0.01` = 1%）。 |
| `absoluteGap` | `number` | `undefined` | 絶対 MIP ギャップ許容値（HiGHS `mip_abs_gap`）。 |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | 求解前の前処理（Presolve）の制御モード。 |
| `outputFlag` / `verbose` | `boolean` | `false` | ソルバーの反復ログを出力します（HiGHS は `outputFlag`、GLPK は `verbose`）。 |
| `useWorker` | `boolean` | `true`（ブラウザ専用） | ブラウザ環境で HiGHS と Pumpkin を Web Worker 上で実行します（Node.js では無視）。メインスレッド実行時は `false`。 |
| `wasmUrl` | `string` | 自動解決 | ブラウザ環境で `highs.wasm` や `pumpkin.wasm` を読み込むカスタム URL。 |
| `signal` | `AbortSignal` | `undefined` | キャンセル用の `AbortSignal`（`AbortController.signal`）。制約事項は後述を参照。 |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | 求解中の進捗スナップショットを受け取るコールバック。 |

第1引数にソルバー名を直接渡すこともできます：`await m.solve("glpk", { timeLimit: 5 })`。

---

## 結果・ギャップ指標・ステータスの読み取り

求解完了後、ステータス・最適値・MIP の境界値とギャップをモデルから読み取れます。

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

> [!TIP]
> 得られた解が元の境界条件・整数条件・制約を許容誤差内で満たしているかを独立検証するには、`m.verify()` を呼び出してください。
> 詳細は [矛盾診断・検証・デバッグ（`m.verify()`）](./unsat-core.md#verifying-solutions-m-verify) を参照してください。

### `m.status` と `m.terminationStatus` の違い

MIP ソルバーが `timeLimit`・反復上限・`AbortSignal` で途中停止した場合、2つの問いを区別して確認します。

1. **利用可能な実行可能解があるか？** `m.hasPrimalSolution` または `m.status` を確認します。
2. **なぜソルバーが停止したか？** `m.terminationStatus` を確認します。

停止前に有効な解（**暫定解**）が見つかっていた場合、WaSHI は `m.status = "Feasible"` を設定します。
このとき `x.value` や `m.objectiveValue` にその暫定解が入り、停止理由は `m.terminationStatus`（`"TimeLimit"` または `"Interrupted"`）に記録されます。
解が1つも見つからずに止まった場合は、`m.hasPrimalSolution` が `false` となり、`m.status` は `"TimeLimit"`・`"IterationLimit"`・`"Unknown"` のいずれかになります。

### 全 `SolverStatus` 一覧

| ステータス | `hasPrimalSolution` | 意味 |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | 大域的最適解が許容誤差内で証明されました。 |
| `"Feasible"` | `true` | 有効な解は見つかりましたが、最適性の証明前に停止しました（理由は `terminationStatus` を参照）。 |
| `"Sat"` | `true` | すべての制約を満たす解が見つかりました（`m.check()`）。 |
| `"Infeasible"` | `false` | すべての制約を同時に満たす解が存在しないことが証明されました。 |
| `"Unsat"` | `false` | 制約集合が充足不能（矛盾）であることが証明されました（`m.check()`）。 |
| `"Unbounded"` | `false` | 制約を満たしたまま目的関数値を無限に改善できます（非有界）。 |
| `"TimeLimit"` | `false` | 実行可能解が見つかる前に制限時間に達しました。 |
| `"IterationLimit"` | `false` | 実行可能解が見つかる前に反復上限に達しました。 |
| `"Unknown"` | `false` | 解が見つからないまま停止しました（例：解が見つかる前に `AbortSignal` で中断）。 |
| `"Error"` | `false` | ソルバー内部でエラーが発生しました。 |
| `"NotSolved"` | `false` | 求解前、またはモデル変更により解がリセットされた初期状態です。 |

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

    // 例: 目標スコア以上の暫定解が見つかった時点で早期終了する
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
> **バックエンドごとの `AbortSignal` の制約**:
> - **求解途中の即時中断**: ブラウザの Web Worker（`useWorker: true`）で HiGHS または Pumpkin を実行する場合のみ、Worker を即座に終了させて途中中断できます。
> - **求解開始前・呼び出し境界のみの中断**: Node.js、ブラウザで `useWorker: false` を指定した場合、および GLPK・Z3 では、`AbortSignal` はネイティブ求解の開始前や呼び出し境界でのみ確認されます。

### `SolveProgressEvent` のフィールド

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | 求解開始からの経過秒数（オプション別名：`elapsedSeconds`）。 |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | 現在のソルバーフェーズ（判明している場合）。 |
| `objectiveValue` | `number \| undefined` | 現在見つかっている最良の実行可能解（暫定解）の目的関数値。 |
| `objectiveBound` | `number \| undefined` | 現在の最良双対境界値（Objective Bound）。 |
| `relativeGap` | `number \| undefined` | 現在の相対 MIP ギャップ（`0.05` = 5%）。 |
| `absoluteGap` | `number \| undefined` | 現在の絶対 MIP ギャップ `\|objectiveValue - objectiveBound\|`。 |
| `nodes` | `number \| undefined` | 探索済みの分枝限定ノード数。 |
| `iterations` | `number \| undefined` | ソルバーの反復回数（シンプレックス、内点法、または MIP LP 反復）。 |
| `message` | `string \| undefined` | ソルバーが出力した生の進捗ログ行。 |

---

## モデルの変更と解状態の同期

`Model` インスタンスは、`Model` メソッドや `Model`・`Var`・`Constraint` のプロパティセッターによる変更を検知し、解状態の整合性を保ちます。

### 求解後の変更による状態リセット

変数や制約の追加、または `m.objective()`・`m.sense` による目的関数の変更を行うと、`m.status` は即座に `"NotSolved"` に戻ります。
変数のプロパティ（`v.lb`, `v.ub`, `v.type`）や制約のプロパティ（`c.lhs`, `c.sense`, `c.rhs`）を変更した場合も同様です。
同時に `m.solution` と `m.objectiveValue` がクリアされ、各変数の `value`・`reducedCost` および各制約の `dual`・`slack` がすべて `null` にリセットされます。

### 実行中の変更と重複呼び出しの保護

- **求解中のモデル変更**: `m.solve()` や `m.check()` の実行中にモデルを変更すると、古い結果は破棄されます。`m.status` は `"NotSolved"` のまま進行中の Promise が reject されます。
- **重複呼び出しの制御**: 同じモデルで新しい `m.solve()` または `m.check()` を開始すると、先行していた古い実行が完了しても最新の結果を上書きしないよう保護されます。
- **一括操作のロールバック**: `m.constraint([...])` などの一括操作に不正な要素が含まれる場合、部分的な変更を残さず全体がロールバックされ、既存の有効な解も維持されます。

> [!NOTE]
> 登録済みの変数や制約の名前変更、および内部マップや AST の直接書き換え（`c.lhs.terms`, `BoolOp.children` など）はサポートされていません。
> 次回の求解・検証・エクスポート実行時にモデル整合性チェックでエラーとなります。
