# 目的関数と求解 (`m.solve` & `m.check`)

目的関数は、利益の最大化・コストの最小化・分散リスクの最小化など、最適化のゴールを定義します。また、目的関数なしで制約の充足可能性や SMT 論理式だけを検証したい場合は `m.check()` を使用できます。

---

## 目的関数の設定

`m.objective(maximize(...))` または `m.objective(minimize(...))` を使って目的方向と数式を設定します：

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

// 売上の最大化: 50*x + 40*y
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));

// コストの最小化の場合:
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

引数なしで `m.objective()` を呼び出すと、現在設定されている目的関数式（`LinExpr | QuadExpr`）を取得できます（目的関数を設定しない場合のデフォルトは `0` の最小化です）。

---

## 🚀 モデルの実行 (`m.solve()` vs. `m.check()`)

WaSHI には2つの非同期実行メソッドがあります：

| メソッド | 戻り値 | 用途 |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | すべての制約の下で目的関数を最適化します。変数の解、目的関数値、MIP ギャップ・双対境界、LP の双対変数/スラックを格納します。 |
| **`await m.check(options?)`** | `Promise<CheckResult>` | 目的関数なしで制約の充足可能性（SAT/UNSAT）を判定します。`{ status, values, conflicts?, unsatCore?, runTime? }`（`values: Record<string, number \| boolean>` に数値変数と論理変数の両方の解が格納されます）を返し、Z3 による競合診断（`unsatCore`）に使われます。 |

```typescript
const status = await m.solve({
  timeLimit: 10.0, // 制限時間（秒）
  mipGap: 0.01,    // 相対 MIP ギャップ許容値（1%）
  verbose: false,  // ソルバー内部ログの出力有無
});
```

### 求解オプション (`SolveOptions`)

| オプション | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `solver` | `"highs"` \| `"z3"` \| `"glpk"` \| `Solver` | モデルのソルバー (`"highs"`) | 実行に使用するソルバー名またはインスタンス。 |
| `timeLimit` | `number` | `undefined` | 最大実行時間（秒）。 |
| `mipGap` / `relGap` | `number` | `undefined` | 相対 MIP ギャップ許容値（例: `0.01` = 1%）。 |
| `absGap` | `number` | `undefined` | 絶対 MIP ギャップ許容値（HiGHS `mip_abs_gap`）。 |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | 求解前の前処理（Presolve）の制御モード。 |
| `verbose` / `outputFlag` | `boolean` | `false` | `true` の場合、ソルバーの反復ログを出力します。 |
| `useWorker` | `boolean` | `true` (ブラウザ) | ブラウザ環境で HiGHS を Web Worker 内で実行します。メインスレッド実行時は `false`。 |
| `wasmUrl` | `string` | 自動解決 | ブラウザ環境で `highs.wasm` を読み込むカスタム URL。 |
| `signal` | `AbortSignal` | `undefined` | 協調的キャンセル用の `AbortSignal` (`AbortController.signal`)。 |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | 求解中の進捗スナップショットを受け取るコールバック。 |

---

## ⏱️ リアルタイム進捗 (`onProgress`) と中断 (`AbortSignal`)

時間のかかる MIP 計算を UI 上で実行する際、`onProgress` で分枝限定法の進捗（暫定解・双対境界・MIPギャップ）をリアルタイムに取得し、`AbortController` で安全に中断できます：

```typescript
const controller = new AbortController();

const status = await m.solve({
  signal: controller.signal,
  onProgress: (event) => {
    console.log(
      `[${event.elapsedTime.toFixed(1)}s] ` +
      `暫定値: ${event.objectiveValue ?? "—"}, ` +
      `境界値: ${event.objectiveBound ?? "—"}, ` +
      `ギャップ: ${event.mipGap !== undefined ? (event.mipGap * 100).toFixed(2) + "%" : "—"}`
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

### `SolveProgressEvent` のフィールド

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | 求解開始からの経過秒数（オプション別名: `elapsedSeconds`）。 |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | 現在のソルバーフェーズ（判明している場合）。 |
| `objectiveValue` | `number \| undefined` | 現在見つかっている最良の実行可能解（暫定解）の目的関数値。 |
| `objectiveBound` | `number \| undefined` | 現在の最良双対境界値（Objective Bound）。 |
| `relGap` / `mipGap` | `number \| undefined` | 現在の相対 MIP ギャップ（`0.05` = 5%）。 |
| `absGap` | `number \| undefined` | 現在の絶対 MIP ギャップ `\|objectiveValue - objectiveBound\|`。 |
| `nodes` | `number \| undefined` | 探索済みの分枝限定ノード数。 |
| `iterations` | `number \| undefined` | ソルバーの反復回数（シンプレックス、内点法、または MIP LP 反復）。 |
| `message` | `string \| undefined` | ソルバーが出力した生の進捗ログ行。 |

---

## 📊 結果・ギャップ指標・ステータスの読み取り

求解完了後、ステータス、最適値、MIP の境界値とギャップをモデルから取得できます：

```typescript
const status = await m.solve();

console.log("Status:", m.status);                         // 例: "Optimal", "Feasible"
console.log("Termination Reason:", m.terminationStatus);  // 例: "Optimal", "TimeLimit", "Interrupted"
console.log("Has Primal Solution:", m.hasPrimalSolution); // 解が利用可能なとき true

// 目的関数値と MIP ギャップ指標
console.log("Objective Value:", m.objectiveValue);        // 目的関数値 (または null)
console.log("Objective Bound:", m.objectiveBound);        // 双対境界値 (または null)
console.log("Relative Gap:", m.relGap);                   // 相対ギャップ (別名: m.mipGap)
console.log("Absolute Gap:", m.absGap);                   // 絶対ギャップ |objectiveValue - objectiveBound|

// 個別および一括での変数値取得
console.log("x =", x.value, "y =", y.value);
console.log(m.getValues({ x, y }));                       // { x: ..., y: ... }
```

### `m.status` と `m.terminationStatus` の違い

MIP ソルバーが制限時間（`timeLimit`）やキャンセル（`AbortSignal`）で停止した場合、以下の2点を区別できます：
1. **利用可能な実行可能解（暫定解）が見つかったか？**（`m.hasPrimalSolution` / `m.status`）
2. **なぜソルバーが停止したか？**（`m.terminationStatus`）

停止前に実行可能な整数解（Incumbent）が見つかっていた場合、`m.status` は `"Feasible"` となり（`x.value` や `m.objectiveValue` から暫定解を取得可能）、`m.terminationStatus` には `"TimeLimit"` や `"Interrupted"` が記録されます。まだ実行可能解が1つも見つかっていない段階で停止した場合は、`m.hasPrimalSolution` は `false`、`m.terminationStatus` は `"TimeLimit"` / `"IterationLimit"` / `"Interrupted"` となり、`m.status` は `"TimeLimit"`、`"IterationLimit"`、または `"Unknown"`（暫定解なしで `AbortSignal` により中断された場合）となります。

### 全 `SolverStatus` 一覧

| ステータス | `hasPrimalSolution` | 意味 |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | 大域的最適解が証明されました（許容誤差内）。 |
| `"Feasible"` | `true` | 実行可能解（暫定解）が見つかりましたが、最適性の証明前に停止しました（停止理由は `terminationStatus` を参照）。 |
| `"Sat"` | `true` | すべての制約を充足する解が見つかりました（`m.check()`）。 |
| `"Infeasible"` | `false` | すべての制約を同時に満たす解が存在しないことが証明されました。 |
| `"Unsat"` | `false` | 制約集合が充足不能（矛盾）であることが証明されました（`m.check()`）。 |
| `"Unbounded"` | `false` | 制約を満たしたまま目的関数値を無限に改善できます（非有界）。 |
| `"TimeLimit"` | `false` | 実行可能解が見つかる前に制限時間に達しました。 |
| `"IterationLimit"` | `false` | 実行可能解が見つかる前に反復上限に達しました。 |
| `"Unknown"` | `false` | 解が見つからないまま判定不能で終了しました（暫定解が見つかる前に `AbortSignal` で中断された場合も含み、その際は `terminationStatus === "Interrupted"` となります）。 |
| `"Error"` | `false` | ソルバー内部でエラーが発生しました。 |
| `"NotSolved"` | `false` | 求解前、またはモデル変更により解がリセットされた初期状態です。 |

---

## 🔄 モデルの変更と解状態の同期

`Model` インスタンスは、メソッドやプロパティセッターによるモデルの変更を検知し、解の整合性を自動的に保ちます：

1. **求解後のモデル変更によるリセット**: 変数や制約の追加、目的関数の変更、変数の上下限/型の変更（`v.lb`, `v.ub`, `v.type`）、制約式の変更（`c.lhs`, `c.sense`, `c.rhs`）を行うと、即座に `m.status` が `"NotSolved"` に戻り、`m.objectiveValue` や各変数の `value` / `dual` / `slack` は `null` にクリアされます。
2. **求解中のモデル変更**: 非同期の `m.solve()` / `m.check()` の実行中にモデルが変更された場合、進行中の古い求解結果は破棄され、Promise は明示的なエラーで reject されます。
3. **重複呼び出しの制御**: 同じモデルに対して新しい `m.solve()` / `m.check()` が開始されると、先に走っていた古い実行の結果が後から完了しても最新の状態を上書きしないよう保護されます。
4. **トランザクション的な一括編集**: `m.constraint([...])` 等の一括操作で不正な要素が含まれていた場合、部分的な登録を残さずロールバックされます。
