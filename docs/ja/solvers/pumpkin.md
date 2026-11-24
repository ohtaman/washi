# Pumpkin 制約プログラミングソルバー

**Pumpkin** は [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) が Rust で開発しているオープンソースの制約プログラミング（CP）ソルバーです。WaSHI は Pumpkin（`v0.5.0`）を WebAssembly として `@ohtaman/washi/solvers/pumpkin` に同梱しており、追加パッケージは不要です。

シングルスレッドで動作するため、ブラウザで `SharedArrayBuffer` や `COOP`/`COEP` ヘッダー（[Cross-Origin Isolation 設定](../getting-started/cross-origin.md)）は不要です。

---

## Pumpkin を選ぶ基準

| 問題のタイプ | 推奨ソルバー | 選定理由 |
| :--- | :--- | :--- |
| **スケジューリング・資源上限・離散グローバル制約** | **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`） | `disjoint`・`cumulative`・`distinct`・`allowed` を追加設定なしでネイティブ処理。 |
| **`COOP`/`COEP` なしでのブラウザ `unsatCore`** | **Pumpkin**（`m.check({ solver: "pumpkin" })`） | 通常の静的サイトや iframe でも、有界整数・真偽値モデルの矛盾制約を抽出可能。 |
| **線形計画・混合整数計画・二次計画** | **[HiGHS](./highs.md)**（デフォルト） | 連続変数、双対値・スラック、凸二次目的関数、連続緩和に対応。 |
| **`Continuous` 変数を含む論理ルール** | **[Z3](./z3.md)** | 論理演算子内の実数不等式や、連続・整数混在モデルの `unsatCore` に対応。 |

---

## 主な特徴

- **標準同梱・追加依存なし**: `pumpkin.wasm`（約 1.4 MB）が `@ohtaman/washi` に含まれ、MIT 互換ライセンスで利用できます。
- **Web Worker バックグラウンド実行**: `SharedArrayBuffer` を使わずにメインスレッド外で実行し、ブラウザ UI の応答性を保ちます。
- **ネイティブ CP 制約**: `disjoint()`・`cumulative()`・`distinct()`・`allowed()`・`at()`・`max()`・`min()`・`abs()`・離散 `!=`・`m.indicator()` に対応します。
- **矛盾診断（`unsatCore`）**: `await model.check({ solver: "pumpkin" })` で、有界整数・真偽値モデル内の矛盾した名前付き制約を特定できます。
- **ウォームスタート（`initialValue`）**: `model.integer()` や `model.binary()` に探索時の初期値ヒントを渡せます。

---

## 使用例

`@ohtaman/washi/solvers/pumpkin` を一度インポートすると `"pumpkin"` ソルバーが登録されます。有界整数・真偽値モデルの最適化には `model.solve()`、充足可能性の確認や矛盾制約の抽出には `model.check()` を使います。

### 1. スケジューリングとグローバル制約 (`model.solve()`)

```typescript
import { Model, disjoint, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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
model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
// Status: Optimal, s1=4, s2=0
```

### 2. 矛盾診断 (`model.check()`)

```typescript
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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

`model.solve()`、`model.check()`、または `new PumpkinSolver(options)` に実行オプションを渡せます。対応オプションは `timeLimit`（秒）、`useWorker`、`wasmUrl`、`signal`、`onProgress` です。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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
    `解 (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## 制約と前提条件 {#domain-api-preconditions}

Pumpkin は **有界な整数・真偽値** のみを対象とします。未対応の変数・値・オプションを渡すと実行時に `Error` を投げます。

- **有界整数のみ対応**: `Integer` / `Binary` 変数は $[-(2^{30} - 1),\, 2^{30} - 1]$ の有限整数に限り、`Continuous` や無限大は `Error` になります。
- **整数係数と上限**: 係数・調整後右辺（`rhs - lhs.constant`）・スケーリング上下限はすべて $[-(2^{30} - 1),\, 2^{30} - 1]$ の整数が必要です。
- **制約全体の 32 ビット上限**: 各制約について、調整後右辺の絶対値と各項の最大絶対値（係数 × 上下限の最大絶対値）の合計は $2^{31} - 2$ 以下である必要があります。
- **目的関数のより厳しい上限**: 目的関数の係数は整数で、各項の最大絶対値の合計は $2^{30} - 1$ 以下である必要があります（目的関数の定数項は小数可）。
- **未対応の数式・緩和**: `QuadExpr`（二次目的関数・二次制約）と `relax: true` は実行時に `Error` を投げます。
- **未対応オプション**: `relativeGap`・`absoluteGap`・`presolve`・`threads`・`verbose`・`outputFlag` および未定義キーは実行時に `Error` を投げます。

---

## ブラウザでの Worker と WASM 配置

ブラウザではデフォルトで同梱の `pumpkin.wasm` を専用 Web Worker 内で読み込みます。`file:` URL やオリジンを持たない sandboxed iframe では、自動的にメインスレッドへ切り替わります。

メインスレッドでの実行や独自 URL からの `pumpkin.wasm` 配信を指定する例は次のとおりです。

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

`pumpkin.wasm` の読み込みに失敗した場合や HTML ページが返された場合、外部 CDN へフォールバックせず試行した URL 付きでエラーを投げます。

---

## 参考リンク

- [制約プログラミング (CP) モデリング](../guide/constraint-programming.md) · [資源制約付きプロジェクトスケジューリング (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md` (WASM の再ビルド手順)](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
