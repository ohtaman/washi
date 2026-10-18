# AI コーディングエージェント向けクイックリファレンス

> **スコープに関する注記**: このドキュメントは、`@ohtaman/washi` を用いて数理最適化モデルや充足可能性（SAT/SMT）モデルを構築する AI コーディングエージェントおよび開発者向けの**利用者向けモデリング・クイックリファレンス**です。
> - **ポータブル Agent Skill (`SKILL.md`)**: モデリング・`toLpString()` による式検査・`validateSolution()` による解検証・Z3 `unsatCore` による矛盾診断までを一貫して実行するワークフロースキル（Claude Code, Antigravity, Cursor, Codex 等に対応）として、[`skills/washi/SKILL.md`](https://github.com/ohtaman/washi/blob/main/skills/washi/SKILL.md)（npm パッケージ内の `node_modules/@ohtaman/washi/skills/washi/SKILL.md` にも同梱）を利用できます：
>   ```bash
>   # パッケージ同梱のスキルをプロジェクトのエージェントスキルディレクトリへ配置
>   mkdir -p .agents/skills/washi
>   cp node_modules/@ohtaman/washi/skills/washi/SKILL.md .agents/skills/washi/SKILL.md
>   ```
> - **リポジトリのレビュー規約**: リポジトリへのコントリビューションや Pull Request レビュー規約については、リポジトリルートの [`AGENTS.md`](https://github.com/ohtaman/washi/blob/main/AGENTS.md) を参照してください。

---

## 1. パッケージのインポートとデプロイ

### Node.js / バンドラー (Vite, Webpack, Next.js, Bun)

```ts
import {
  Model,
  expr,
  sum,
  dot,
  maximize,
  minimize,
  and,
  or,
  not,
  implies,
  xor,
  setHighsWasmUrl,
} from "@ohtaman/washi";

// オプションのソルバープラグイン（事前に peer dependencies のインストールが必要）:
// npm install z3-solver
import "@ohtaman/washi/solvers/z3";
// npm install glpk.js
import "@ohtaman/washi/solvers/glpk";
```

### ブラウザ ESM & 通常の `<script>` タグ

- **ブラウザ ESM**:
  - コア（HiGHS 標準搭載）: `import { Model, expr, maximize } from "./washi/washi.js";`
  - GLPK プラグイン: `import "./washi/solvers/glpk.js";`
  - Z3 プラグイン: `import "./washi/solvers/z3.js";`
- **通常の `<script>` / CodePen (IIFE)**:
  - コア: `<script src="./washi/washi.min.js"></script>`（グローバル `Washi` を公開）
  - GLPK プラグイン: `<script src="./washi/solvers/glpk.min.js"></script>`（`"glpk"` を登録し、`WashiGLPK` を公開）
  - Z3 プラグイン: `<script src="./washi/solvers/z3.min.js"></script>`（`"z3"` を登録し、`WashiZ3` を公開）

### WebAssembly アセットとランタイムの規則

1. **デフォルトでパッケージ同梱 WASM を使用（暗黙の CDN フォールバックなし）**:
   - Node.js および最新のバンドラーでは、WebAssembly アセットはモジュールからの相対パスで自動的に解決されます。
   - ブラウザ環境へデプロイする際は、`dist/browser/` ディレクトリ一式（JS、Worker、`.wasm` ファイル）をまとめて配置してください。ローカルの WASM URL が欠落している場合や HTML の SPA フォールバックが返された場合、初期化は試行した URL を明示して即座に失敗し、**外部パブリック CDN へ勝手に切り替わることは決してありません**。
   - ブラウザランタイムで `highs.wasm` をカスタム URL から読み込む場合は、`setHighsWasmUrl("https://.../highs.wasm")` を呼び出すか、`await m.solve({ wasmUrl: "https://.../highs.wasm" })` を渡します（Node.js では常にローカルの `highs` パッケージランタイムを読み込むため無視されます）。
2. **ブラウザでの Z3 実行にはセキュアコンテキスト・Cross-Origin Isolation・CORS が必要**:
   - Z3 WebAssembly は `SharedArrayBuffer` によるマルチスレッドを使用します。Z3 を実行するブラウザページは、セキュアコンテキスト（`window.isSecureContext === true`、すなわち HTTPS または `localhost`）かつ Cross-Origin Isolated（`window.crossOriginIsolated === true`）である必要があり、以下の HTTP ヘッダーを配信する必要があります：
     - `Cross-Origin-Opener-Policy: same-origin`（ドキュメント応答）
     - `Cross-Origin-Embedder-Policy: require-corp`（ドキュメント応答）
     - `Cross-Origin-Resource-Policy: cross-origin` および `Access-Control-Allow-Origin`（クロスオリジンのスクリプト / WASM アセット応答）
   - `@ohtaman/washi` のインポートによって Service Worker が自動注入されることはありません。ブラウザでセキュアコンテキストや Cross-Origin Isolation が欠けている場合、Z3 は原因を示すエラーで即座に reject します。
3. **Web Worker とキャンセル制御 (`AbortSignal`)**:
   - 求解開始前のキャンセル（実行開始時点で `signal.aborted`）は、すべてのソルバーでサポートされています。
   - `Worker` が利用可能なブラウザ環境では、HiGHS はデフォルトで専用 Web Worker 内で実行されます（`useWorker: true`）。`m.solve({ signal })` に `{ signal }` を渡すと、実行中の Worker 求解をプリエンプティブに強制終了（または待機中の Worker リクエストをキャンセル）できます。
   - メインスレッド実行の HiGHS（`useWorker: false` または Node.js）では、ソルバーの割り込みチェックポイントで呼ばれる `onProgress` コールバック内で同期的に `abort()` をトリガーした場合に協調的な途中中断が機能します。外部からの非同期 abort は、同期実行中の WASM スレッドがチェックポイントまたは完了に達するまで割り込むことはできません。割り込みフックを持たないシングルスレッド WASM ソルバー（GLPK、Z3）は実行開始前に `signal` を確認します。

---

## 2. 標準的なモデリング手順

モデルの定式化と求解は、以下の 4 つのステップで構成されます：

### ステップ 1: モデルと決定変数の作成

```ts
const m = new Model("ExampleModel");

// スカラー変数
const x = m.continuous("x", { lb: 0, ub: 100 });
const n = m.integer("n", { lb: 0, ub: 10 });
const b = m.binary("b");
const flag = m.bool("flag"); // 命題論理変数（Z3 / 論理制約用）

// インデックス付き変数コンテナ:
// - 数値次元 -> Array
// - キー配列次元 -> Record
const vec = m.continuous(4, { lb: 0, prefix: "v" }); // Var[] (長さ 4)
const grid = m.binary(2, 3, { prefix: "g" }); // Var[][] (2x3)
const byItem = m.integer(["desk", "chair"] as const, { lb: 0 }); // Record<"desk" | "chair", Var>
const mixed = m.binary(["A", "B"] as const, 3); // Record<"A" | "B", Var[]>
```

- **任意の初期値ヒント (`initialValue?: number`)**:
  - 数値変数コンストラクタ（`m.continuous`, `m.integer`, `m.binary`, `new Var`）および変更可能な `v.initialValue` プロパティは、求解結果 `v.value` とは区別されるオプションの有限な主問題初期値ヒントを受け取ります（境界 `[lb, ub]` および整数・バイナリ領域に対して許容誤差 `1e-6` で検証されます）。
  - 初期値は全変数に設定することも一部の変数のみに設定することも可能です（例：MIP モデルの再構築時に変数名で引き継ぐなど）。`initialValue` はあくまでソルバーへのヒントであり、変数の固定やハード制約の追加は行わず、ソルバーによる受理や計算時間の短縮を保証するものではありません。
  - **HiGHS**（`supportsWarmStart: true`）でサポートされています。ウォームスタート非対応のソルバー（**GLPK**、**Z3**）では、いずれかの変数に `initialValue !== undefined` が設定されているとエラーをスローします。

### ステップ 2: 数式の構築 (`expr`, `sum`, `dot`)

- **統一 `expr` テンプレートタグ**:
  - 1次式（`LinExpr`）: `` expr`30 * ${x} + 50 * ${n} - 10` ``
  - 2次式（`QuadExpr`）: `` expr`${x}^2 + 2 * ${x} * ${n} + ${n}^2` ``（凸 QP 目的関数向けに変数同士の積や二乗をサポート）。
  - 線形制約（`Constraint`）: `` expr`${x} + 2 * ${n} <= 40` ``（`<=`, `>=`, `==`, `=` をサポート）。
- **集計ヘルパー**:
  - `sum(iterable, mapper?)` は `Var` / `LinExpr` / `number` の `Iterable`（例：`Var[]`, `grid.flat()`, `Object.values(record)`）の総和を計算します。
  - `dot(a, b)` は対応する 1次元配列、2次元配列（`number[][]` / `Var[][]`）、プレーンな辞書（`Record<string, ...>`）、または配列と辞書の混合コンテナの内積を、引数の順序を問わず計算します。
- **メソッドチェーン（Fluent API）**:
  - 算術演算（`LinExpr` と `QuadExpr` で利用可能。`Var` は `.add()`, `.sub()`, `.mul()`, `.neg()` をサポート）: `.add(other)`, `.sub(other)`, `.mul(other)`, `.div(scalar)`, `.neg()`
  - 比較演算（`Var` と `LinExpr`）: `.le(rhs, name?)`, `.ge(rhs, name?)`, `.eq(rhs, name?)`
  - 論理演算（Z3 向けの `BoolVar`, `BoolExpr`, `Constraint`）: 関数形式の `and(...)`, `or(...)`, `not(...)`, `implies(a, b)`, `xor(a, b)` およびメソッド形式の `.and(...)`, `.or(...)`, `.not()`, `.implies(...)`, `.xor(...)`

### ステップ 3: 目的関数と制約条件のモデルへの登録

`expr` や `.le()` でオブジェクトを生成しただけではモデルに追加されません。必ず `m.constraint(...)` または `m.objective(...)` に渡して登録してください：

```ts
// maximize() または minimize() を用いて目的関数を設定
m.objective(maximize(expr`30 * ${x} + 50 * ${n}`));

// モデルに制約条件を登録
m.constraint(expr`${x} + 2 * ${n} <= 40`, "resource_limit");

// 条件付き（Indicator）制約 (MIP Big-M 変換: b === 1 => x <= 50)
m.indicator(b, expr`${x} <= 50`, { activeValue: 1, name: "cap_when_b" });
```

### ステップ 4: 実行 (`solve` または `check`) と解の検証 (`validateSolution`)

- **最適化 (`await m.solve(options?)`)**:
  - `SolverStatus`（`"Optimal"`, `"Feasible"`, `"Infeasible"`, `"Unbounded"`, `"TimeLimit"`, `"IterationLimit"`, `"Error"`, `"Unknown"`, `"NotSolved"`, `"Sat"`, または `"Unsat"`）を返します。組み込みの最適化ソルバーは最適化ステータス（`"Optimal"`, `"Feasible"`, `"Infeasible"`, `"Unbounded"`, `"TimeLimit"`, `"IterationLimit"`, `"Error"`, `"Unknown"`, `"NotSolved"`）を返し、時間・反復・解数制限や中断で停止した際に有効な実行可能解（Incumbent）が見つかっている場合は `"Feasible"` を返します。`"Sat"` と `"Unsat"` は充足可能性ソルバーやカスタムソルバーアダプター（`MockSolver` など）向けに `SolverStatus` に含まれています。
  - 解の値は `x.value`, `expr`...`.value`, `m.getValues(x)`, `m.getValues(container)`, `m.objectiveValue`, `constr.dual`, `constr.slack`, `x.reducedCost` から読み取ります。
  - 求解後に `m.validateSolution()` を呼び出すことで、変数の有限性、境界条件（`lb`/`ub`）、整数・バイナリ・真偽値領域、線形制約の残差、および論理制約を独立して検証できます（`SolutionValidationReport`: `{ valid, complete, maxViolation, violations, ... }`）。なお、`validateSolution()` は変数および制約条件の主実行可能性を検査するものであり、`m.objectiveValue` の再計算や比較は行いません。
- **充足可能性判定と Unsat Core (`await m.check(options?)`)**:
  - `CheckResult`（`{ status: "Sat" | "Unsat" | "Unknown", values: Record<string, number | boolean>, conflicts?: readonly string[], unsatCore?: readonly string[], runTime?: number }`）を返します。`conflicts` と `unsatCore` は省略可能であり、Unsat Core 抽出に対応したソルバー（Z3 など）が `"Unsat"` を返したときにのみ設定されます。
  - 線形算術制約のみを含むモデルでは、`m.check()` は実行可能性の `solve()` にフォールバックすることで、デフォルトの HiGHS や GLPK を含む任意のソルバーで動作します。論理制約（`BoolVar`, `and`, `or`, `implies` 等）および Unsat Core 抽出（`result.conflicts` / `result.unsatCore`）には SMT 対応ソルバー（`{ solver: "z3" }`）が必要です。Z3 は登録された制約を追跡しつつ、変数の上下限（`lb`/`ub`）およびバイナリ領域 `{0, 1}` を直接アサートするため、`conflicts` / `unsatCore` は*モデルの固定された変数境界・領域と合わせたときに*矛盾する登録済み制約名の部分集合を返します（最小性は保証されません）。
- **非同期 `solve` / `check` 実行中のモデル変更禁止**:
  - `await m.solve()` または `await m.check()` の完了待機中に変数・制約・目的関数を変更すると、進行中の実行は無効化され、古い Promise は reject されます。

---

## 3. 実行可能なコード例

### 例 A: インデックス付きコンテナと解検証を用いた混合整数線形計画 (MIP)

```ts
import { Model, expr, dot, sum, maximize } from "@ohtaman/washi";

export async function runMipExample() {
  const m = new Model("ProductionMIP");
  const products = ["desk", "chair"] as const;
  const profit = { desk: 30, chair: 50 };
  const woodPerUnit = { desk: 1, chair: 2 };
  const laborPerUnit = { desk: 2, chair: 1 };

  const qty = m.integer(products, { lb: 0, ub: 100 });
  const setup = m.binary("setup");

  m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${setup}`));
  m.constraint(expr`${dot(woodPerUnit, qty)} <= 40`, "wood_cap");
  m.constraint(expr`${dot(laborPerUnit, qty)} <= 50`, "labor_cap");
  m.constraint(expr`${sum(Object.values(qty))} <= 30 * ${setup}`, "require_setup");

  const status = await m.solve();
  const report = m.validateSolution();
  const values = m.getValues(qty);

  return {
    status,
    objectiveValue: m.objectiveValue,
    values,
    setup: setup.value,
    valid: report.valid,
    maxViolation: report.maxViolation,
  };
}
```

### 例 B: 凸二次計画 (QP)

二次目的関数では、`expr` 内で変数同士の積（`${x} * ${y}`）や二乗（`${x}^2`）を記述できます：

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

export async function runQpExample() {
  const m = new Model("PortfolioQP");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // x + y >= 4 の下で x^2 + y^2 を最小化
  m.objective(minimize(expr`${x}^2 + ${y}^2`));
  m.constraint(expr`${x} + ${y} >= 4`, "budget");

  const status = await m.solve();
  const report = m.validateSolution();

  return {
    status,
    objectiveValue: m.objectiveValue,
    x: x.value,
    y: y.value,
    valid: report.valid,
  };
}
```

### 例 C: Z3 による充足可能性判定と Unsat Core 競合診断

```ts
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export async function runZ3Example() {
  const m = new Model("PolicyCheck", { solver: "z3" });
  const vip = m.bool("vip");
  const discount = m.integer("discount", { lb: 0, ub: 50 });

  m.constraint(vip, "customer_is_vip");
  m.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  m.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatResult = await m.check();
  return {
    status: unsatResult.status,
    conflicts: unsatResult.conflicts,
  };
}
```

---

## 4. アンチパターンとよくある落とし穴

以下の無効な記述パターンや廃止された旧エイリアスは使用しないでください：

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

export function verifyNegativePatterns() {
  const m = new Model("NegativeExamples");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // 1. Constraint を m.objective() や算術メソッドに渡さないでください:
  // 誤り: m.objective(maximize(expr`${x} <= 10` as any)); -> Error がスローされます
  // 誤り: expr`${x} + 1`.add(expr`${y} <= 5` as any); -> Error がスローされます

  // 2. 比較演算子 (<=, >=, ==) のない算術式を m.constraint() に渡さないでください:
  // 誤り: m.constraint(expr`${x} + ${y}` as any); -> Error がスローされます

  // 3. 線形制約の中に二次項を含めないでください:
  // 誤り: expr`${x}^2 <= 10`; -> Error ("Quadratic constraints are not supported") がスローされます

  // 4. 廃止された旧エイリアス (#59 / #81 で削除済み) を使用しないでください:
  // - 廃止された `c` テンプレートタグではなく `expr` を使用する
  // - `m.constrain(...)` や `m.add(...)` ではなく `m.constraint(...)` を使用する
  // - `m.maximize(...)` / `m.minimize(...)` / `m.setObjective(...)` ではなく `m.objective(maximize(...))` / `m.objective(minimize(...))` を使用する
  // - `await m.optimize()` ではなく `await m.solve()` を使用する
  // - `.lessThanOrEqual()`, `.greaterThanOrEqual()`, `.equalTo()` ではなく `.le()`, `.ge()`, `.eq()` を使用する
  // - `expr.getValue()` ではなく `.value` または `m.getValues(...)` を使用する
  // - `m.vars` / `m.constrs` ではなく `m.variables` / `m.constraints` を使用する
  return { m, x, y, maximize };
}
```
