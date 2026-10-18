# HiGHS ソルバーエンジン

**HiGHS** はエディンバラ大学を中心に開発されている高性能な数理最適化ソフトウェアです。線形計画問題（LP）、混合整数計画問題（MIP）、および凸二次計画問題（QP）における代表的なオープンソースソルバーとして広く利用されています。

---

## WaSHI における主な特徴

- **標準搭載・ゼロコンフィグ**: `@ohtaman/washi` 本体に同梱されており、追加パッケージのインストールや C++ ビルドなしで即座に動作します。
- **商用利用しやすい MIT ライセンス**: コアパッケージは 100% MIT ライセンスで提供されます。
- **Web Worker バックグラウンド実行**: ブラウザ環境では自動的に専用 Web Worker を起動して計算を行うため、メインスレッド（UI）をブロックしません。
- **ウォームスタート対応 (`initialValue`)**: 変数の初期値ヒント（`initialValue`）を HiGHS の `setSolution` に渡すウォームスタートをサポートしています。

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
