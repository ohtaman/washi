# Pumpkin 制約プログラミングソルバー

**Pumpkin** は ConSol-Lab が Rust で開発しているオープンソースの制約プログラミング（CP）ソルバーです（[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)）。WaSHI は HiGHS と並んで Pumpkin（`v0.5.0`、`pumpkin.wasm`、約 2.1 MB）を MIT ライセンスで本体に同梱しており、追加パッケージや追加インポートなしで `{ solver: "pumpkin" }` をそのまま使えます（`PumpkinSolver` や `setPumpkinWasmUrl()` などの個別 API は `@ohtaman/washi/solvers/pumpkin` からインポートします）。

シングルスレッドで動作するため、ブラウザでも `SharedArrayBuffer` や `COOP`/`COEP` ヘッダー（[Cross-Origin Isolation 設定](../getting-started/cross-origin.md)）の設定は不要です。

---

## Pumpkin を選ぶ基準

| 問題のタイプ | 推奨ソルバー | 選定理由 |
| :--- | :--- | :--- |
| **スケジューリング・資源制約・離散グローバル制約** | **Pumpkin**（`{ solver: "pumpkin" }`） | `disjoint`・`cumulative`・`distinct`・`allowed` を追加設定なしでネイティブに制約伝播。 |
| **`COOP`/`COEP` なしでのブラウザ上での `unsatCore` 抽出** | **Pumpkin**（`m.check({ solver: "pumpkin" })`） | 通常の静的サイトや iframe でも、有界整数・真偽値モデルの矛盾する制約を抽出可能。 |
| **線形計画・混合整数計画・凸二次計画** | **[HiGHS](./highs.md)**（デフォルト） | 連続変数、双対値・スラック、凸二次目的関数、連続緩和に対応。 |
| **`Continuous` 変数を含む論理ルール** | **[Z3](./z3.md)** | 論理式内の実数不等式や、連続・整数混在モデルの `unsatCore` 抽出に対応。 |

---

## 対応するモデリング機能

- **ネイティブ CP・グローバル制約**: `disjoint()`・`cumulative()`・`distinct()`・`allowed()`・`at()`・`max()`・`min()`・`abs()`・離散変数間の `!=`（不等値制約）・`m.indicator()`。
- **ネイティブ命題論理**: `model.bool()`・`and()`・`or()`・`not()`・`implies()`・`xor()`。
- **ウォームスタート（`initialValue`）**: `model.integer()` や `model.binary()` の変数定義時に探索の初期値ヒントを指定可能。

---

## 使用例

Pumpkin は `@ohtaman/washi` 読み込み時に自動で登録されるため、追加の `import` なしで `new Model()`・`model.solve()`・`model.check()` に `{ solver: "pumpkin" }` を渡すだけで利用できます。有界整数・真偽値モデルにおける整数線形目的関数の最適化には `model.solve()`、充足可能性の確認や矛盾する制約の抽出には `model.check()` を使います。

### 1. スケジューリングとグローバル制約（`model.solve()`）

```typescript
import { Model, disjoint, expr, implies, minimize, not } from "@ohtaman/washi";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(
  disjoint([
    { start: s1, duration: 6 },
    { start: s2, duration: 4 },
  ]),
  "single_machine"
);
// 任意: disjoint のみで非重複は保証されるが、選択された順序を job1First に記録する例
model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
// Status: Optimal, s1=4, s2=0
```

### 2. 矛盾診断（`model.check()`）

```typescript
import { Model, expr, implies } from "@ohtaman/washi";

const model = new Model("PolicyConflict", { solver: "pumpkin" });
const vip = model.bool("vip");
const seats = model.integer("seats", { lb: 0, ub: 20 });

model.constraint(vip, "vip_active");
model.constraint(implies(vip, expr`${seats} >= 8`), "vip_seats");
model.constraint(expr`${seats} <= 5`, "room_cap");

const result = await model.check();
if (result.status === "Unsat") {
  console.log("矛盾している制約:", result.conflicts); // result.unsatCore / model.unsatCore でも参照可能
  // ["vip_active", "vip_seats", "room_cap"]
}
```

---

## ソルバーオプション

`model.solve()`、`model.check()`、または `new PumpkinSolver(options)` に実行オプションを渡せます。

| オプション | 型 | 説明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大実行時間（秒）。 |
| `useWorker` | `boolean` | ブラウザ環境で Web Worker を使用（ブラウザでの既定は `true`。`file:` URL やオリジンを持たない環境では `false` へフォールバック）。Node.js で `useWorker: true` を指定すると `Error` を投げる。 |
| `wasmUrl` | `string \| null` | 使用する `pumpkin.wasm` の URL を上書き（`null` で同梱バイナリを使用。グローバル設定は `setPumpkinWasmUrl()`）。 |
| `signal` | `AbortSignal` | 実行中の処理や探索を中断。ブラウザの Web Worker では強制終了し、取得済みの暫定解があればそれを保持。メインスレッドや Node.js ではチェックポイントで協調的に中断。 |
| `onProgress` | `(ev) => void` | 経過時間と暫定目的関数値を逐次受け取る進捗コールバック（`solve()` のみ対応、`check()` では無視）。 |

> [!NOTE]
> Pumpkin は離散 CP ソルバーのため、LP 感度情報（`c.dual`・`c.slack`・`v.reducedCost`）は `null`、MIP の境界・ギャップ情報（`objectiveBound`・`relativeGap`・`absoluteGap`）は `undefined` のままになります。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const model = new Model("TimedSearch", { solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.constraint(expr`${x} + ${y} >= 40`, "min_total");
model.objective(minimize(expr`2 * ${x} + 3 * ${y}`));

const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`経過: ${ev.elapsedTime.toFixed(1)}s, 暫定値: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `解 (${model.status}, 停止理由: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## 制限事項と前提条件 {#domain-api-preconditions}

Pumpkin は **有界な整数変数と真偽値変数**のみからなるモデルを対象とします。未対応の変数・値・オプションを渡すと実行時に `Error` を投げます。

- **有界整数のみ対応**: `Integer` 変数の上下限は $[-(2^{30} - 1),\, 2^{30} - 1]$ の有限整数である必要があり（`Binary` 変数は 0/1 の範囲）、`Continuous` 変数や `Integer` 変数への無限大指定は `Error` を投げます。
- **整数係数と許容範囲**: 係数・調整後右辺（`rhs - lhs.constant`）・係数倍した変数の上下限（$a_i \cdot \mathrm{lb}_i, a_i \cdot \mathrm{ub}_i$）はすべて $[-(2^{30} - 1),\, 2^{30} - 1]$ の範囲の整数である必要があります。
- **制約全体の 32 ビット上限**: 各制約について、調整後右辺の絶対値と各項の最大絶対値（$|\text{係数}| \times \max(|\mathrm{lb}|, |\mathrm{ub}|)$）の合計は $2^{31} - 2$ 以下である必要があります。
- **目的関数のより厳しい数値上限**: 目的関数の係数は整数で、各項の最大絶対値の合計は $2^{30} - 1$ 以下である必要があります（目的関数の定数項は小数可）。
- **未対応のモデル機能**: `QuadExpr`（二次目的関数・二次制約）や `relax: true` を指定すると実行時に `Error` を投げます。
- **未対応オプション**: `relativeGap`・`absoluteGap`・`presolve`・`threads`・`verbose`・`outputFlag` や未定義キーを指定すると実行時に `Error` を投げます。

---

## ブラウザでの Worker と WASM 配置

ブラウザではデフォルトで同梱の `pumpkin.wasm` を専用 Web Worker 内で読み込みます。`file:` URL やオリジンを持たない `sandbox` 属性付きの iframe では、自動的にメインスレッドでの実行へフォールバックします。

メインスレッドでの実行や独自 URL から `pumpkin.wasm` を読み込む設定例は次のとおりです。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// グローバルに WASM URL を指定（solve() / check() の { wasmUrl } でも上書き可能）
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");

const model = new Model({ solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 10 });
model.objective(minimize(expr`${x}`));

// 方法 1: 単一の呼び出しでメインスレッド実行を指定
await model.solve({ useWorker: false });

// 方法 2: PumpkinSolver インスタンスの既定値として指定
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });
```

`pumpkin.wasm` の読み込みに失敗した場合や HTML のエラーページが返された場合、外部 CDN へフォールバックせず、試行した URL を含むエラーを投げます。

---

## 参考リンク

- [制約プログラミング（CP）モデリング](../guide/constraint-programming.md) · [資源制約付きプロジェクトスケジューリング（RCPSP）](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md`（WASM の再ビルド手順）](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
