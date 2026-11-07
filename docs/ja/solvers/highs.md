# HiGHS ソルバーエンジン

**HiGHS** はエディンバラ大学を中心に開発されている高性能な数理最適化ソフトウェアです（[ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)）。線形計画問題（LP）、混合整数計画問題（MIP）、および凸二次計画問題（QP）における代表的なオープンソースソルバーとして広く利用されています。

`@ohtaman/washi` では、公式の上流リポジトリ（[ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)）から直接コンパイルした WebAssembly とネイティブ C API（`highs_c_api.h`）ドライバにより、サードパーティ製ラッパーに依存することなく、Node.js・Web Worker・ブラウザ環境でゼロコンフィグで完全動作します。

---

## WaSHI における主な特徴

- **標準搭載・ゼロコンフィグ**: 公式の HiGHS からビルドした WebAssembly 配布物を `@ohtaman/washi` に直接同梱しており、外部ランタイム依存ゼロで即座に動作します。
- **商用利用しやすい MIT ライセンス**: コアパッケージは 100% MIT ライセンスで提供されます。
- **Web Worker バックグラウンド実行**: ブラウザ環境では自動的に専用 Web Worker を起動して計算を行うため、メインスレッド（UI）をブロックしません。
- **ウォームスタート対応 (`initialValue`)**: 変数の初期値ヒント（`initialValue`）を HiGHS の `setSolution` に渡すウォームスタートをサポートしています。
- **高速な WASM 実行**: 直接ビルドされた 32 ビット WebAssembly バイナリにより、ネイティブに近い速度で動作します。

---

## アーキテクチャと WebAssembly ランタイム

WaSHI は公式 HiGHS C++ ソースから WebAssembly（`highs.wasm`）を直接ビルドし（`-fwasm-exceptions`、シングルスレッド可搬性 `-DHIGHS_NO_DEFAULT_THREADS=ON`）、ネイティブ C API（`highs_c_api.h`）を通じて直接連携しています。これにより、WebAssembly 線形メモリ上の TypedArray ビューによるゼロコピー解抽出、上流リリースの迅速な追従、および依存ゼロの自己完結型パッケージングを実現しています。

### コールバックと対話的制御

- **進捗監視と途中中断（対応済み）**:
  HiGHS の内部ロギングおよび割り込みフックと連携しており、リアルタイムの進捗通知（`onProgress`）や標準の `AbortSignal` を用いた協調的途中中断をサポートしています。
- **動的カット生成・遅延制約（WASM ラッパー層の制約により非対応）**:
  上流の WebAssembly ラッパーにおいて、ネイティブの callback type 8（MIP lazy constraints）は WASM ↔ JS 境界での同期メモリ安全性の観点から公開されていません。巡回セールスマン問題（TSP）の部分巡回路除去や Benders 分解などが必要な場合は、**反復求解ループ（解く $\to$ 違反検出 $\to$ `model.constraint(...)` $\to$ 再求解）**による切除平面法のアプローチをご利用ください。

### WebAssembly アセットの管理とオンデマンドビルド

HiGHS の WebAssembly バイナリ（`public/highs.wasm`）とランタイム（`runtime.js`）は、`highs.config.json` により SHA-256 チェックサム付きでバージョン管理されています：
- **高速な整合性検証**: ビルドおよび配布パイプライン実行時に `node scripts/ensure-highs-wasm.mjs` が走り、ミリ秒単位でローカルアセットを検証します。
- **オンデマンドダウンロード**: ファイルが存在しない場合やバージョン更新時は、`ensure-highs-wasm.mjs` が GitHub Release アセットから検証済みバイナリを自動取得します。
- **ソースからのコンパイル**: HiGHS のバージョンアップやビルドフラグ変更時は、Emscripten SDK（`emcc`）、CMake、Ninja があれば `npm run build:highs-wasm` でローカル再ビルドでき、マージ後に `gh release upload highs-v1.15.1 public/highs.wasm src/modeler/solvers/highs/runtime.js --clobber` で Release アセットを同期します（`.github/workflows/build-wasm.yml` により GitHub Actions 上での自動ビルド・Release 反映も可能です）。

---

## 対応する問題クラス

### 1. 線形計画問題 (LP)
主・双対シンプレックス法または内点法（IPM）により連続変数の最適化問題を解きます。求解後は制約の潜在価格（`c.dual`）・余剰（`c.slack`）および変数の被約費用（`v.reducedCost`）を取得できます：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");
await model.solve();
```

### 2. 混合整数計画問題 (MIP)
分枝限定法（Branch-and-Bound）と切除平面法（Cutting Planes）を用いて整数・0-1 バイナリ変数の問題を解きます：

```typescript
const count = model.integer("count", { lb: 0, ub: 50 });
const open = model.binary("open");
```

### 3. 凸二次計画問題 (Convex QP)
線形制約の下で2次の目的関数を最小化・最大化します：

```typescript
// expr タグで二次目的関数を記述:
model.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));
```

---

## ソルバーオプション

`model.solve()` にオプションを渡して制御できます：

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,       // 最大実行時間（秒）
  mipGap: 0.001,         // 相対 MIP ギャップが 0.1% 以内になったら終了 (別名: relGap)
  absGap: 1.0,           // 絶対 MIP ギャップ許容値
  presolve: "on",        // 前処理 ("on" | "off" | "choose")
  outputFlag: true,      // シンプレックス / 分枝限定法の内部ログを出力 (output_flag)
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`経過: ${ev.elapsedTime.toFixed(1)}s, 暫定値: ${ev.objectiveValue}`);
  },
});
```

---

## ブラウザでの Web Worker・WASM 設定

ブラウザではデフォルトで Web Worker が使用されますが、Web Worker が制限されている環境やメインスレッドで同期実行したい場合は `useWorker: false` を指定します：

```typescript
import { Model, HighsSolver } from "@ohtaman/washi";

// 方法 1: solve 呼び出し時に指定
await model.solve({ useWorker: false });

// 方法 2: HighsSolver インスタンス生成時に指定
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```
