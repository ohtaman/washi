# Pumpkin 制約プログラミングソルバー

**Pumpkin** は Rust で開発されたオープンソースの制約プログラミング（CP）ソルバーです（[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)）。WaSHI では Pumpkin（`v0.5.0`）を WebAssembly として `@ohtaman/washi/solvers/pumpkin` に同梱しており、追加パッケージは不要です。

シングルスレッドで動作するため、ブラウザ上で **`COOP` / `COEP` ヘッダーを設定しなくても動作します**。

---

## 主な特徴

- **標準同梱・追加依存なし**: `pumpkin.wasm`（約 1.4 MB）が `@ohtaman/washi` に含まれており、MIT 互換ライセンスで利用できます。
- **Web Worker でバックグラウンド実行**: `SharedArrayBuffer` を使わないため、通常の静的ホスティングや iframe でも UI を止めずに動作します。
- **ネイティブ CP 制約に対応**: `disjoint()`、`cumulative()`、`distinct()`、`allowed()` / `not(allowed())`、`at()`、`max()`、`min()`、`abs()`、離散 `!=`、`m.indicator()` をそのまま解けます。
- **矛盾診断（`unsatCore`）**: `await model.check({ solver: "pumpkin" })` で、有界整数・真偽値モデル内の矛盾した名前付き制約を特定できます。
- **初期値ヒント（`initialValue`）**: `m.integer()` や `m.binary()` に探索時の初期値ヒントを渡せます。

> [!TIP]
> スケジュール調整・資源上限・重複禁止・`COOP`/`COEP` なしの `unsatCore` には **Pumpkin**、連続変数の LP / MIP / QP 最適化には **HiGHS**、連続変数を含む論理条件には **Z3** を使ってください。

---

## 使用例

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
// Status: Optimal, s1=0, s2=6 (または s1=4, s2=0)
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

## 実行オプション (`timeLimit`, `signal`, `onProgress`)

`model.solve()` や `model.check()` に実行オプションを渡せます。Pumpkin は進捗コールバックと `AbortSignal` による中断に対応しています。

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0, // 最大実行時間（秒）
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

Pumpkin は **有界な整数・真偽値** のみを扱うため、未対応の入力には明示的なエラーを返します。

- **有界整数のみ対応**: `Integer` / `Binary` 変数の上下限は $[-(2^{30} - 1),\, 2^{30} - 1]$ の有限整数である必要があります。`Continuous` 変数や `-Infinity` / `Infinity` はエラーになります。
- **整数係数と範囲上限**: 制約の係数、調整後の右辺（`rhs - lhs.constant`）、およびスケーリング後の上下限は符号付き 32 ビット整数の安全範囲（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）内の整数である必要があります。目的関数の定数項は小数でも構いません。
- **未対応機能**: 2次式（`QuadExpr`）、`relax: true`、および LP 用の許容誤差オプション（`relativeGap`, `absoluteGap`, `presolve`）は使用されません。

---

## ブラウザでの Worker と WASM 配置

ブラウザではデフォルトで同梱の `pumpkin.wasm` を専用 Web Worker 内で読み込みます（`file:` URL や制限付き iframe ではメインスレッドで実行）。メインスレッドで実行したい場合や、`pumpkin.wasm` を独自パスに配置したい場合は次のように指定します。

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 呼び出しごと、またはソルバー単位でメインスレッド実行を指定
await model.solve({ useWorker: false });
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });

// WASM の配信 URL を変更（solve/check の { wasmUrl } でも指定可）
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

`pumpkin.wasm` の読み込みに失敗した場合や HTML が返された場合は、外部 CDN へフォールバックせず試行した URL 付きでエラーを返します。

---

## 参考リンク

- [制約プログラミング (CP) モデリング](../guide/constraint-programming.md) · [資源制約付きプロジェクトスケジューリング (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md` (WASM の再ビルド手順)](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
