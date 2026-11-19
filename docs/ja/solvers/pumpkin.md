# Pumpkin 制約プログラミングソルバー

**Pumpkin** は、デルフト工科大学（TU Delft）ConSol Lab が純 Rust で開発している LCG（Lazy Clause Generation：遅延節生成）ベースの制約プログラミング（CP）ソルバーです（[ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [docs.rs/pumpkin-core](https://docs.rs/pumpkin-core)）。WaSHI では Pumpkin（`v0.5.0`）を WebAssembly へ直接コンパイルし、外部ランタイム依存ゼロで利用できるプラグイン（`@ohtaman/washi/solvers/pumpkin`）として同梱しています。

マルチスレッド WASM を用いるソルバーとは異なり、Pumpkin はシングルスレッドの WASM として Web Worker（または Node.js メインプロセス）で実行されるため、ブラウザ側で **Cross-Origin Isolation（`COOP` / `COEP` ヘッダー）を設定せずに動作**します。

---

## WaSHI における主な特徴

- **標準同梱・追加依存なし**: `pumpkin.wasm`（約 1.4 MB）が `@ohtaman/washi` に同梱され、`@ohtaman/washi/solvers/pumpkin` からそのまま利用できます。追加の `npm install`（peer dependency）や Rust ツールチェーンは不要です。
- **商用利用しやすい MIT ライセンス**: トランジティブな Rust WASM 依存を含め、すべてパーミッシブなライセンス（`MIT`, `Apache-2.0`, `Unicode-3.0`）で構成されています。
- **Web Worker バックグラウンド実行 & COOP / COEP 不要**: 通常の HTTP(S) オリジン上では `SharedArrayBuffer` や Cross-Origin Isolation ヘッダーなしで専用 Web Worker により非同期実行され、UI スレッドをブロックせず第三者 iframe でもそのまま動作します。
- **ネイティブ CP グローバル制約・伝播器**: `distinct()`（Pumpkin `v0.5.0` の `all_different`、pairwise `binary_not_equals` 分解）、`disjoint()`（`disjunctive_strict` Vilím エッジ発見）、`cumulative()`（タイムテーブル伝播）、`allowed()` / `not(allowed())`（`table` / `negative_table`）、`at()`（`element`）、`max()` / `min()` / `abs()`（`maximum` / `minimum` / `absolute`）、離散 `!=`（`not_equals`）、および `M` 省略時の `m.indicator()`（`implied_by`）を Pumpkin ネイティブ制約へ直接変換します。
- **COOP / COEP 不要の Unsat Core 競合診断**: `await model.check({ solver: "pumpkin" })` により、通常のブラウザ環境のまま有界整数・真偽値制約の矛盾コア（`unsatCore` / `conflicts`）を抽出できます。
- **ウォームスタート対応 (`initialValue`)**: 有界 `Integer` / `Binary` 変数に対して `solve()`・`check()` の双方で `initialValue` ヒント（`supportsWarmStart: true`）をサポートし、Pumpkin の `WarmStart` brancher を通じた非拘束の探索ヒントとして利用できます（`Var.initialValue` は求解結果の `Var.value` とは独立して保持されます）。

---

## 対応する問題クラス

> [!TIP]
> **HiGHS・Pumpkin・Z3 の使い分け**:
> - **HiGHS** (`{ solver: "highs" }`): 連続変数を含む LP、凸 QP、線形緩和が強く効く大規模 MILP 向け。
> - **Pumpkin** (`{ solver: "pumpkin" }`): 排反スケジューリング、CP グローバル制約、有界整数＋命題論理モデル、および `COOP`/`COEP` 不要な `unsatCore` 抽出向け。
> - **Z3** (`{ solver: "z3" }`): 連続変数・実数係数を含む条件付き論理式や厳密な有理数 SMT 判定向け。

### 1. 排反スケジューリングとグローバル CP 制約 (`model.solve()`)

単一・累積資源スケジューリング、順序論理（`implies`, `not`）、およびグローバル述語（`disjoint`, `distinct`, `cumulative`, `allowed`, `at`, `max`, `min`, `abs`）を有界整数上でそのまま求解します：

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
```

### 2. 充足判定と Unsat Core（矛盾コア）の抽出 (`model.check()`)

`await model.check()` を使用すると、整数線形制約、CP グローバル制約、およびネストした命題論理（`and`, `or`, `not`, `implies`, `xor`）の充足可能性を判定し、充足不能（`"Unsat"`）の場合に矛盾する名前付き制約の部分集合（`conflicts` / `unsatCore`）を取得できます：

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
}
```

---

## ソルバーオプション

`model.solve()` または `model.check()` にオプションを渡して制御できます：

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,       // 最大実行時間（秒）
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`経過: ${ev.elapsedTime.toFixed(1)}s, 暫定値: ${ev.objectiveValue}`);
  },
});

// timeLimit や AbortSignal を使用する場合は hasPrimalSolution で暫定解の有無を確認します:
if (model.hasPrimalSolution) {
  console.log(
    `利用可能な解 (${model.status}, 停止理由: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## ドメイン制約・事前条件

Pumpkin は**有界整数・真偽値専用の CP/LCG ソルバー**です。非対応のモデル構文は暗黙に丸めたり別ソルバーへフォールバックせず、明示的なエラーを投げます：

- **有界整数 / Binary / BoolVar のみ対応**: すべての `Var` は有限整数上下界（`lb`, `ub` が `[-(2^30 - 1), 2^30 - 1]` の整数）である必要があります。無界整数（`-Infinity` / `Infinity`）や `Continuous` 変数はエラーになります。
- **整数係数の線形制約**: 制約の係数、調整済み右辺値（`rhs - lhs.constant`）、およびスケーリング上下界はすべて 32bit 安全範囲（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）の整数である必要があります（目的関数の定数項は小数可）。
- **非対応機能**: `QuadExpr`（二次式）、`Continuous` 変数、無界変数、および LP 緩和（`relax: true`）は明示的にエラーになります。

---

## ブラウザでの Web Worker・WASM 設定

ブラウザでは通常、`@ohtaman/washi/solvers/pumpkin` が同梱の `pumpkin.wasm` を自動解決し、HTTP(S) オリジン下では `pumpkin-worker.js` を用いた専用 Web Worker で非同期実行します（`file://` や不透明オリジンのサンドボックス iframe ではメインスレッドで実行されます）。

Web Worker が制限されている環境やメインスレッドで同期実行したい場合は `useWorker: false` を指定するか、`PumpkinSolver` を直接インスタンス化します：

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 方法 1: solve / check 呼び出し時に指定
await model.solve({ useWorker: false });

// 方法 2: PumpkinSolver インスタンス生成時に指定
const syncModel = new Model({
  solver: new PumpkinSolver({ useWorker: false }),
});

// pumpkin.wasm を独自のパスや CDN に配置する場合（グローバル設定、または呼び出しごとの { wasmUrl } 指定）:
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

`pumpkin.wasm` の取得失敗や HTML フォールバック応答が返された場合、WaSHI は試行した URL を含めて即座にエラーを報告し、**暗黙的な CDN フォールバックは一切行いません**。

---

## アーキテクチャと WebAssembly ランタイム

WaSHI は専用の Rust WebAssembly ラッパークレート（`wasm/pumpkin`、`pumpkin-core` / `pumpkin-constraints` / `pumpkin-propagators` / `pumpkin-conflict-resolvers` `v0.5.0` を `wasm32-unknown-unknown` へビルド）から `pumpkin.wasm` と `wasm-bindgen` バインディングを直接生成しています。

同梱の `pumpkin.wasm` と `runtime.js` / `runtime.d.ts` は `pumpkin.config.json` の SHA-256 チェックサムで整合性が検証されています。ソースからの再ビルドや Release 更新を行うメンテナー向け手順は [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow) を参照してください。

### コールバックと対話的制御

- **進捗監視と途中中断（対応済み）**:
  `solve()` 中は暫定解が見つかるたびにリアルタイムの進捗通知（`onProgress` で `elapsedTime`・`objectiveValue` を配信）を行い、`AbortSignal` による中断にも対応します。ブラウザ Web Worker 環境では実行中 Worker の即時停止とキューキャンセルが行われ、メインスレッドおよび Node.js 環境では探索フック上の協調的中断チェック（`should_abort`）が機能します。
- **離散最適性の厳密証明**:
  有限整数領域上の厳密 LCG ソルバーとして動作するため、LP 緩和ベースのギャップオプション（`relativeGap`, `absoluteGap`, `presolve`）ではなく、節学習（nogood learning）と目的境界の厳密化（`LinearSatUnsat`）によって最適性を証明します。

---

## 参考リンク

- **モデリングガイド・実践例**: [制約プログラミング (CP) モデリング](../guide/constraint-programming.md) · [リソース制約付きプロジェクトスケジューリング (RCPSP)](../examples/project-scheduling.md)
- **ソースリポジトリ**: [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)（MIT License — ConSol Lab, TU Delft）
- **Rust クレート・API ドキュメント**: [docs.rs/pumpkin-core](https://docs.rs/pumpkin-core) · [crates.io/crates/pumpkin-core](https://crates.io/crates/pumpkin-core)
