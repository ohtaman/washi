# HiGHS ソルバーエンジン

**HiGHS** はエディンバラ大学で創始されたオープンソースの数理最適化ソルバーです（[highs.dev](https://highs.dev/) · [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)）。線形計画問題（LP）、混合整数計画問題（MIP）、および凸二次計画問題（QP）を高速に解けます。

`@ohtaman/washi` では HiGHS が標準のデフォルトソルバーです。WebAssembly バイナリを同梱しているため追加パッケージは不要で、Node.js・ブラウザ・Web Worker のすべてでそのまま動作します。

---

## HiGHS を選ぶ基準

| 問題のタイプ | 推奨ソルバー | 選定理由 |
| :--- | :--- | :--- |
| **LP・MIP・連続変数の凸 QP** | **HiGHS**（デフォルト） | MIT ライセンスで標準同梱。数値最適化が高速で、LP の双対値・スラックや MIP ウォームスタートに対応。 |
| **有界整数の制約プログラミング（CP）** | **[Pumpkin](./pumpkin.md)** | `disjoint`・`cumulative`・`distinct` や `unsatCore` を Cross-Origin Isolation なしで実行可能。 |
| **連続変数を含む論理ルール** | **[Z3](./z3.md)** | 論理演算子内の厳密な実数演算や、連続・整数混在モデルの `unsatCore` 抽出に対応。 |
| **GNU GLPK 互換・ベンチマーク比較** | **[GLPK](./glpk.md)** | 既存の GLPK モデルとの検算用（GPL-3.0 の任意パッケージ）。 |

> [!TIP]
> 通常の数値最適化はまず **HiGHS** を選んでください。ネイティブの CP 伝播や充足可能性モジュロ理論（SMT）による矛盾診断が必要な場合のみ、**Pumpkin** や **Z3** を併用します。

---

## WaSHI における主な特徴

- **標準同梱・追加依存なし**: MIT ライセンスで `@ohtaman/washi` 本体に組み込まれており、追加インストールは不要です。
- **`COOP`/`COEP` ヘッダー不要**: シングルスレッド動作のため、`SharedArrayBuffer` や [Cross-Origin Isolation 設定](../getting-started/cross-origin.md) は不要です。
- **Web Worker バックグラウンド実行**: ブラウザではデフォルトで専用 Web Worker を使い、UI スレッドを止めずに求解します。
- **ウォームスタート（`initialValue`）**: `model.continuous()`・`model.integer()`・`model.binary()` に初期値ヒントを渡せます。
- **LP 緩和（`relax: true`）**: 変数定義を書き換えずに、MIP モデルの連続緩和問題を解けます。

---

## 対応する問題クラス

HiGHS では連続・離散・二次計画のいずれも同じ `Model` API で記述できます。問題に合わせて変数の種類と目的関数の形式を選んでください。

### 1. 線形計画問題（LP）

連続変数・線形制約・線形目的関数からなるモデルです。シンプレックス法または内点法で求解され、制約の双対値 `c.dual`、スラック `c.slack`、変数の被約費用 `v.reducedCost` を取得できます。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });

model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 100`, "cap");

await model.solve();
console.log(model.status, model.objectiveValue, cap.dual, cap.slack);
```

### 2. 混合整数計画問題（MIP）

連続変数に `model.integer()` や `model.binary()` を組み合わせたモデルです。分枝カット法で求解され、`objectiveBound`・`relativeGap`・`absoluteGap` を取得できます。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const mipModel = new Model({ solver: "highs" });
const count = mipModel.integer("count", { lb: 0, ub: 50 });
const open = mipModel.binary("open");

mipModel.objective(maximize(expr`12 * ${count} - 100 * ${open}`));
mipModel.constraint(expr`${count} <= 50 * ${open}`, "link");

await mipModel.solve();
console.log(mipModel.status, count.value, open.value);
```

### 3. 凸二次計画問題（Convex QP）

線形制約の下で、連続変数の凸二次目的関数を最小化（最大化時は凹二次目的関数）するモデルです。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const qpModel = new Model({ solver: "highs" });
const x = qpModel.continuous("x", { lb: 0 });
const y = qpModel.continuous("y", { lb: 0 });

qpModel.constraint(expr`${x} + ${y} >= 10`, "demand");
qpModel.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

await qpModel.solve();
console.log(qpModel.status, qpModel.objectiveValue, x.value, y.value);
// Optimal 25 5 5
```

> [!NOTE]
> **連続変数の凸 QP のみ対応**: QP モデル内のすべての変数は連続変数（`model.continuous()`）である必要があります。最小化時は二次行列 $\mathbf{Q}$ が半正定値、最大化時は半負定値である必要があります。
>
> 混合整数二次計画や二次制約には対応していません。バイナリ変数同士の積を MIP として線形化する方法は、[定式化パターン・Tips](../guide/formulation-tips.md) を参照してください。

---

## ソルバーオプション

実行オプションは `model.solve()` または `HighsSolver` コンストラクタに渡します。HiGHS はオプション名を厳密に検証し、未対応キーには実行時 `Error` を投げます。

### 対応オプション

| オプション | 型 | 説明 |
| :--- | :--- | :--- |
| `timeLimit` | `number` | 最大実行時間（秒）。 |
| `relativeGap` | `number` | 相対 MIP ギャップがこの許容値以内になったら終了。 |
| `absoluteGap` | `number` | 絶対 MIP ギャップがこの許容値以内になったら終了。 |
| `presolve` | `"on" \| "off" \| "choose"` | 求解前の前処理を制御。 |
| `outputFlag` | `boolean` | シンプレックス法・分枝カット法の内部ログ出力（既定は `false`）。 |
| `relax` | `boolean` | MIP モデルの連続 LP 緩和問題を解く。 |
| `useWorker` | `boolean` | ブラウザで Web Worker を使用（既定は `true`）。 |
| `wasmUrl` | `string \| null` | この呼び出しで使用する `highs.wasm` の URL を上書き。 |
| `signal` | `AbortSignal` | 実行中の求解を協調的に中断。 |
| `onProgress` | `(ev) => void` | 経過時間・暫定目的関数値・双対境界・ギャップをリアルタイム通知。 |

このほか、HiGHS 固有の上限キー（`mip_max_nodes`、`mip_max_improving_sols`、`mip_max_leaves`、`simplex_iteration_limit`、`ipm_iteration_limit`）も指定できます。

### 未対応オプション（実行時にエラー）

- `verbose`: `Error` を投げます。代わりに `outputFlag: true` を使ってください。
- `threads`: HiGHS WebAssembly はシングルスレッド動作のため `Error` を投げます。
- 未定義のオプションキー: 認識されないキーを渡すと `Error` を投げます。

### 時間制限・進捗監視・中断の例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");

const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,
  relativeGap: 0.001,
  absoluteGap: 1.0,
  presolve: "on",
  outputFlag: true,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`経過: ${ev.elapsedTime.toFixed(1)}s, 暫定値: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `利用可能な解 (${model.status}, 停止理由: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}, gap = ${((model.relativeGap ?? 0) * 100).toFixed(2)}%`
  );
}
```

---

## ブラウザでの Web Worker・WASM 設定

ブラウザではデフォルトで専用の Web Worker 内で HiGHS を実行します。これにより UI 描画を妨げず、`onProgress` や `AbortSignal` による中断も機能します。

メインスレッドで実行したい場合や、`highs.wasm` を独自パスから配信したい場合は `useWorker`・`setHighsWasmUrl`・`wasmUrl` を使います。

```typescript
import { Model, HighsSolver, expr, maximize, setHighsWasmUrl } from "@ohtaman/washi";

// グローバルに WASM の URL を指定（null を渡すと同梱バイナリに戻る）
setHighsWasmUrl("/assets/wasm/highs.wasm");

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0, ub: 10 });
model.objective(maximize(expr`${x}`));

// 方法 1: solve 呼び出しごとに Web Worker 無効化や wasmUrl を指定
await model.solve({ useWorker: false, wasmUrl: "/assets/wasm/highs.wasm" });

// 方法 2: HighsSolver インスタンスの既定値として指定
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```

`highs.wasm` の読み込みに失敗した場合や HTML ページが返された場合、外部 CDN へフォールバックせず試行した URL 付きでエラーを投げます。

---

## アーキテクチャと WebAssembly ランタイム

> [!NOTE]
> このセクションは、メンテナーや高度な統合を行う開発者向けの内部構成メモです。

WaSHI は公式 HiGHS C++ ソースを `-fwasm-exceptions` と `-DHIGHS_NO_DEFAULT_THREADS=ON` で 32 ビット WebAssembly（`highs.wasm`）へ直接コンパイルしています。ネイティブ C API（`highs_c_api.h`）を直接呼び出し、線形メモリ上の TypedArray ビューでゼロコピー解抽出を行い、`setSolution` で MIP ウォームスタートを渡します。

同梱の `highs.wasm` と `runtime.js` は `highs.config.json` の SHA-256 チェックサムで検証されています。再ビルド手順は [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow) を参照してください。

### コールバックと対話的制御

- **進捗監視と中断**: HiGHS のロギング・割り込みコールバック経由で `onProgress` と `AbortSignal` に対応しています。
- **動的カット・遅延制約**: 探索木内のコールバックは未公開です。Benders 分解には [`solveBenders()`](../guide/decomposition.md) や外側の反復カットループを使います。

---

## 参考リンク・引用文献

- **公式ウェブサイト**: [https://highs.dev/](https://highs.dev/)
- **公式ドキュメント**: [https://ergo-code.github.io/HiGHS/](https://ergo-code.github.io/HiGHS/)
- **ソースリポジトリ**: [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)（MIT License）
- **学術引用（Citation）**: 学術論文や技術報告で HiGHS を引用する際は、以下の基礎論文をご参照ください。
  > Q. Huangfu and J. A. J. Hall, *"Parallelizing the dual revised simplex method"*, Mathematical Programming Computation, 10 (1), 119–142, 2018. DOI: [10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)
