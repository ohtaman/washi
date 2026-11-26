# カスタムソルバー開発ガイド

このガイドでは、**WaSHI**（`@ohtaman/washi`）向けに独自のソルバープラグインを実装・テスト・配布する方法を説明します。

`@ohtaman/washi` は **HiGHS**（デフォルト、`@ohtaman/washi/solvers/highs`）、**Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）、および `MockSolver` を同梱・自動登録し、オプションプラグイン（`@ohtaman/washi/solvers/glpk`、`@ohtaman/washi/solvers/z3`）はインポート時に登録されます。これらに加えて、WebAssembly・ネイティブ C++・Web Worker・クラウド REST/RPC など任意のバックエンドを登録し、共通の `Model` API から呼び出せます。

---

## 1. プラグインアーキテクチャの概要

```mermaid
graph TD
    A[WaSHI Model] --> B["ソルバーレジストリ (Symbol.for)"]
    B --> C["HiGHS WASM エンジン (同梱デフォルト / solvers/highs)"]
    B --> H["Pumpkin WASM エンジン (同梱 / solvers/pumpkin)"]
    B --> D["MockSolver (コア同梱)"]
    B --> E["GLPK プラグイン (@ohtaman/washi/solvers/glpk)"]
    B --> F["Z3 SMT プラグイン (@ohtaman/washi/solvers/z3)"]
    B --> G[カスタムソルバープラグイン]
```

### アーキテクチャの特徴

- **統一グローバルレジストリ**: `globalThis` 上の `Symbol.for("washi.solverRegistry")` で管理し、ESM チャンクや `<script>` 間で同一のレジストリマップを共有します。
- **環境に依存しない一貫性**: Node.js とブラウザで同一のソルバー名解決・対応機能（`capabilities`）チェック・エラーメッセージを提供します。
- **疎結合バンドル**: コアパッケージはオプションプラグインやカスタムプラグインをインポートせず、各プラグインは読み込まれたときにのみ自身を登録します。

---

## 2. API 仕様と TypeScript 型定義

すべてのカスタムソルバーは、`@ohtaman/washi` からエクスポートされる `Solver` インターフェースを実装します。

```typescript
import {
  generateLpString,
  buildLpSymbolMaps,
  isLpExportResult,
  sanitizeIdentifier,
  type Solver,
  type SolverOptions,
  type SolverResult,
  type SolverCheckResult,
  type SolverCapabilities,
  type SolveModelData,
  type CheckModelData,
  type LogicalConstraintItem,
  type LpModelData,
  type LpExportResult,
  type LpSymbolMaps,
  type SolverStatus,
  type TerminationStatus,
  type SolveProgressEvent,
} from "@ohtaman/washi";
```

### `Solver` インターフェース

```typescript
export interface Solver {
  /** ソルバーの一意な表示名（例: "GLPK", "AcmeCloudSolver"） */
  readonly name: string;

  /** ソルバーのバージョン文字列（例: "1.2.0"） */
  readonly version?: string;

  /** 対応している問題クラスや機能を宣言するフラグ */
  readonly capabilities?: SolverCapabilities;

  /** このソルバーインスタンスに設定された既定オプション */
  readonly options?: SolverOptions;

  /**
   * 数理最適化モデル（LP, MIP, QP, CP, SMT）を求解するメソッド。
   */
  solve(
    modelData: SolveModelData,
    options?: SolverOptions
  ): Promise<SolverResult>;

  /**
   * 目的関数なしで充足可能性・実行可能性を判定するメソッド（任意実装）。
   */
  check?(
    modelData: CheckModelData,
    options?: SolverOptions
  ): Promise<SolverCheckResult>;
}
```

### `CheckModelData` と `SolveModelData`

`Model.solve()` と `Model.check()` は、事前に LP 形式（CPLEX LP）の文字列へ変換せず、構造化されたモデルスナップショットをアダプターへ直接渡します。

```typescript
export interface CheckModelData {
  name?: string;
  variables: Var[];
  boolVars?: BoolVar[];
  constraints: Constraint[];
  logicalConstraints?: LogicalConstraintItem[];
}

export interface SolveModelData extends CheckModelData {
  sense: OptimizationSense;
  objective: LinExpr | QuadExpr;
}
```

### `SolverCapabilities`

対応機能は `capabilities` で宣言します。`Model` は `solve()` や `check()` を呼ぶ前に、これらのフラグに応じて事前検証や変換を行います。

- **二次目的関数（`QuadExpr`）**: モデルが二次目的関数を持ち、かつ `supportsQP === false` の場合はエラーを投げます。
- **ウォームスタート（`initialValue`）**: 変数に `initialValue` が設定されており、かつ `supportsWarmStart !== true` の場合はエラーを投げます。
- **論理制約**: `supportsLogicalConstraints` または `supportsSMT` が `true` なら `modelData.logicalConstraints` をそのまま渡します。
- **`solve()` 時の自動 MIP 線形化**: 両フラグのいずれも `true` でない場合、`Model` は `logicalConstraints`・`boolVars`・非線形／CP 式を等価なバイナリ変数と線形制約へ自動変換してから `solve()` を呼びます。
- **`check()` 未実装時のフォールバック**: アダプターが `check()` を実装していない場合、`Model.check()` は `solve()` を使った弾性スラック実行可能性問題へフォールバックします（違反した制約名を `conflicts` で返し、`unsatCore` は `undefined` になります）。

```typescript
export interface SolverCapabilities {
  /** 混合整数計画（整数・バイナリ変数）のサポート */
  supportsMIP?: boolean;

  /** 二次目的関数（QP）のサポート */
  supportsQP?: boolean;

  /** 二次制約または二次錐制約（QCQP / SOCP）のサポート */
  supportsQCQP?: boolean;

  /** SMT（Satisfiability Modulo Theories）および論理制約のサポート */
  supportsSMT?: boolean;

  /** SMT の実数（連続変数）理論を伴わない命題論理制約のネイティブサポート */
  supportsLogicalConstraints?: boolean;

  /** Unsat Core（矛盾する制約の部分集合。極小性は非保証）抽出のサポート */
  supportsUnsatCore?: boolean;

  /** 初期値ヒント / ウォームスタート（Var.initialValue）のサポート */
  supportsWarmStart?: boolean;
}
```

### `SolverOptions` と `SolveProgressEvent`

`solve()` と `check()` に渡される実行時オプションは `SolverOptions` に従います。ソルバー選択用の `solver` フィールドはアダプターへ渡される前に `Model` 側で取り除かれます。

```typescript
export interface SolverOptions {
  /** 最大実行時間（秒） */
  timeLimit?: number;

  /** 前処理モード */
  presolve?: "on" | "off" | "choose";

  /** 相対 MIP ギャップ許容値（例: 1% なら 0.01） */
  relativeGap?: number;

  /** 絶対 MIP ギャップ許容値 */
  absoluteGap?: number;

  /** 並列スレッド数 */
  threads?: number;

  /** ソルバーのコンソールログ出力を有効化 */
  verbose?: boolean;

  /** 整数・バイナリ変数を緩和した連続 LP 緩和問題を解く */
  relax?: boolean;

  /** ブラウザで Web Worker による非同期実行を使用 */
  useWorker?: boolean;

  /** 実行中の求解を中断するための AbortSignal */
  signal?: AbortSignal;

  /** 正規化された SolveProgressEvent を受け取る進捗コールバック */
  onProgress?: (progress: SolveProgressEvent) => void;

  /** その他のソルバー固有オプション */
  [key: string]: any;
}

export interface SolveProgressEvent {
  /** 経過時間（秒） */
  elapsedTime: number;
  /** elapsedTime の別名（秒） */
  elapsedSeconds?: number;
  /** 現在の求解フェーズ（取得可能な場合） */
  phase?: "simplex" | "ipm" | "mip";
  /** 現在の暫定目的関数値（取得可能な場合） */
  objectiveValue?: number;
  /** 証明済みの双対境界 / 目的関数境界（取得可能な場合） */
  objectiveBound?: number;
  /** 相対 MIP 最適性ギャップ（取得可能な場合） */
  relativeGap?: number;
  /** 絶対 MIP 最適性ギャップ |objectiveValue - objectiveBound|（取得可能な場合） */
  absoluteGap?: number;
  /** 探索済み MIP 分枝限定ノード数（取得可能な場合） */
  nodes?: number;
  /** ソルバー反復回数（シンプレックス・内点法・MIP の LP 反復） */
  iterations?: number;
  /** ソルバーからの任意の進捗メッセージ */
  message?: string;
}
```

### 構造化モデルデータの直接利用と LP ヘルパーの使い分け

バックエンドが受け付ける入力形式に応じて、モデルデータの扱い方を選びます。

- **モデルデータを直接使う**: 構造化オブジェクトを扱うバックエンドの場合（`PumpkinSolver`・`GLPKSolver`・`Z3Solver` と同方式）。
- **LP ヘルパーを使う**: バックエンドが CPLEX / HiGHS 形式の LP テキストや文字種制限のある ASCII 識別子を必要とする場合。

| ヘルパー関数 | 用途 |
| :--- | :--- |
| `generateLpString(modelData, { relax }?)` | `modelData` を CPLEX LP 文字列（`lpString`）と名前衝突を回避した逆引きマップ（`nameToVar`・`nameToConstraint`）へ変換。`{ relax: true }` で連続 LP 緩和を出力。`modelData.objective.constant` は含まれないため、アダプター側で `objectiveValue`・`objectiveBound` に加算が必要。 |
| `buildLpSymbolMaps(modelData)` | LP 文字列を生成せず、サニタイズ済み識別子マップ（`nameToVar`・`varToName`・`nameToConstraint`・`constraintToName`）だけを構築。 |
| `isLpExportResult(value)` | `LpExportResult` の実行時型ガード（旧来の 3 引数オーバーロード `solve(modelData, lpResult, options)` 互換用）。 |
| `sanitizeIdentifier(raw, fallbackPrefix = "x", id = 0)` | 任意の変数名・制約名を LP 形式で有効な識別子へ変換。 |

```typescript
export interface LpExportResult {
  lpString: string;
  nameToVar: Map<string, Var>;
  nameToConstraint: Map<string, Constraint>;
}
```

### `SolverResult`・`SolverCheckResult` の正規化と識別子の復元

`solve()` が返す `values`・`boolValues`・`reducedCosts`・`duals`・`slacks` は、モデル上の元の変数名・制約名（`v.name`・`bv.name`・`c.name`）をキーにする必要があります。`check()` も同様に、`values`・`unsatCore`・`conflicts` を元の名前（`v.name`・`bv.name`・`c.name`・`lc.name`）で返します。LP ヘルパーを使った場合は、`nameToVar` と `nameToConstraint` で元の名前へ復元してください。

```typescript
export interface SolverResult {
  status: SolverStatus;
  terminationStatus?: TerminationStatus;
  hasPrimalSolution?: boolean;
  objectiveValue: number | null;
  objectiveBound?: number;
  relativeGap?: number;
  absoluteGap?: number;
  values: Record<string, number>;
  boolValues?: Record<string, boolean>;
  reducedCosts?: Record<string, number>;
  duals?: Record<string, number>;
  slacks?: Record<string, number>;
  runTime?: number;
  logs?: string[];
  raw?: any;
}

export interface SolverCheckResult {
  status: "Sat" | "Unsat" | "Unknown";
  values: Record<string, number | boolean>;
  unsatCore?: readonly string[];
  /** unsatCore の別名: 実行不能の原因となる矛盾制約の部分集合 */
  conflicts?: readonly string[];
  runTime?: number;
  logs?: string[];
  raw?: any;
}
```

#### 標準化された `SolverStatus` の値

- `"Optimal"`: 最適解を取得（MIP はギャップ許容値内、LP は最適性証明済み）。
- `"Feasible"`: 実行可能な暫定解はあるが、最適性は未証明。
- `"Infeasible"`: モデルが実行不可能と証明された。
- `"Unbounded"`: 目的関数が非有界。
- `"TimeLimit"`: 実行可能な暫定解を得られないまま `timeLimit` に到達。
- `"IterationLimit"`: 実行可能な暫定解を得られないまま反復回数上限に到達。
- `"Sat"` / `"Unsat"`: `check()` または SMT ソルバーの充足可能 / 充足不能ステータス。
- `"Error"` / `"NotSolved"` / `"Unknown"`: 失敗・未求解・未認識ステータス。`"Unknown"` や `"Error"` を `"Optimal"` へ変換してはいけません。

---

## 3. ステップバイステップ実装チュートリアル

### チュートリアル A: 社内クラウド REST ソルバーアダプター

以下は、求解時に `generateLpString` で CPLEX LP 文字列を生成し、HTTP マイクロサービスへ送信して求解するカスタムソルバーの実装例です。

```typescript
import {
  generateLpString,
  registerSolver,
  type Solver,
  type SolverOptions,
  type SolverResult,
  type SolverStatus,
  type SolveModelData,
} from "@ohtaman/washi";

export interface CloudSolverConfig extends SolverOptions {
  endpoint?: string;
  apiKey?: string;
}

export class CloudSolver implements Solver {
  public readonly name = "CloudSolver";
  public readonly version = "1.0.0";
  public readonly capabilities = {
    supportsMIP: true,
    supportsQP: false,
  };
  public readonly options: SolverOptions;

  private endpoint: string;
  private apiKey: string;

  constructor(config: CloudSolverConfig = {}) {
    const { endpoint, apiKey, ...defaultOptions } = config;
    this.endpoint = endpoint || "https://solver.mycompany.internal/v1/solve";
    this.apiKey = apiKey || "";
    this.options = defaultOptions;
  }

  async solve(
    modelData: SolveModelData,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const mergedOptions: SolverOptions = { ...this.options, ...options };
    const startTime = performance.now();
    const { lpString, nameToVar, nameToConstraint } = generateLpString(modelData, {
      relax: mergedOptions.relax,
    });

    let payload: any;
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          lp: lpString,
          timeLimit: mergedOptions.timeLimit,
          relativeGap: mergedOptions.relativeGap,
          absoluteGap: mergedOptions.absoluteGap,
        }),
        signal: mergedOptions.signal,
      });

      if (!response.ok) {
        throw new Error(`[CloudSolver] Server returned HTTP ${response.status}: ${await response.text()}`);
      }

      payload = await response.json();
    } catch (err: any) {
      if (mergedOptions.signal?.aborted || err?.name === "AbortError") {
        return {
          status: "Unknown",
          terminationStatus: "Interrupted",
          hasPrimalSolution: false,
          objectiveValue: null,
          values: {},
          runTime: (performance.now() - startTime) / 1000,
        };
      }
      throw err;
    }

    const runTime = (performance.now() - startTime) / 1000;

    const values: Record<string, number> = Object.create(null);
    for (const [k, val] of Object.entries((payload.values || {}) as Record<string, number>)) {
      values[nameToVar.get(k)?.name ?? k] = val;
    }
    const duals: Record<string, number> = Object.create(null);
    for (const [k, val] of Object.entries((payload.duals || {}) as Record<string, number>)) {
      duals[nameToConstraint.get(k)?.name ?? k] = val;
    }
    const slacks: Record<string, number> = Object.create(null);
    for (const [k, val] of Object.entries((payload.slacks || {}) as Record<string, number>)) {
      slacks[nameToConstraint.get(k)?.name ?? k] = val;
    }

    const statusMap: Record<string, SolverStatus> = {
      OPTIMAL: "Optimal",
      FEASIBLE: "Feasible",
      INFEASIBLE: "Infeasible",
      UNBOUNDED: "Unbounded",
      TIME_LIMIT: "TimeLimit",
      TIMELIMIT: "TimeLimit",
      ITERATION_LIMIT: "IterationLimit",
      ERROR: "Error",
      NOT_SOLVED: "NotSolved",
      SAT: "Sat",
      UNSAT: "Unsat",
    };
    const rawStatus: SolverStatus = statusMap[String(payload.status).toUpperCase()] ?? "Unknown";
    const offset = modelData.objective?.constant ?? 0;
    const hasFiniteObj =
      typeof payload.objectiveValue === "number" && Number.isFinite(payload.objectiveValue);
    const hasIncumbent =
      hasFiniteObj ||
      Object.values(values).some((val) => typeof val === "number" && Number.isFinite(val));
    const isLimitStop = rawStatus === "TimeLimit" || rawStatus === "IterationLimit";
    const status: SolverStatus = isLimitStop && hasIncumbent ? "Feasible" : rawStatus;
    const hasPrimalSolution =
      (status === "Optimal" || status === "Feasible") && hasIncumbent;

    return {
      status,
      terminationStatus: rawStatus,
      hasPrimalSolution,
      objectiveValue: hasPrimalSolution && hasFiniteObj ? payload.objectiveValue + offset : null,
      values: hasPrimalSolution ? values : {},
      duals: hasPrimalSolution ? duals : {},
      slacks: hasPrimalSolution ? slacks : {},
      runTime: payload.solveDuration || runTime,
      logs: payload.logs || [],
      raw: payload,
    };
  }
}

// `import "my-cloud-solver"` で `solver: "cloud"` が使えるように自動登録
export function registerCloudSolver(): void {
  registerSolver("cloud", (opts) => new CloudSolver(opts));
}
registerCloudSolver();
```

---

### チュートリアル B: カスタムソルバーの登録と利用方法

設定を全体で共有するか呼び出し単位（またはモデル単位）で変えるかに応じて、次の 3 つの方法から選びます。

| 方法 | 向いている用途 |
| :--- | :--- |
| **登録名文字列** | 既定設定のプラグインを再利用する場合（`solver: "cloud"`）。 |
| **ソルバーインスタンス** | 呼び出しごと・モデルごとに認証情報・エンドポイント・オプションを変えたい場合。 |
| **グローバルデフォルト（`setDefaultSolver`）** | 各 `new Model()` を書き換えずにアプリ全体でデフォルトソルバーを切り替えたい場合。 |

#### 方法 1: 登録名文字列で指定する

```typescript
import { Model } from "@ohtaman/washi";
import "./cloud-solver.js"; // "cloud" を自動登録

const model = new Model({ name: "SupplyChain", solver: "cloud" });
// または await model.solve({ solver: "cloud" })
```

#### 方法 2: ソルバーインスタンスを直接渡す

```typescript
import { Model } from "@ohtaman/washi";
import { CloudSolver } from "./cloud-solver.js";

const customInstance = new CloudSolver({
  endpoint: "https://dedicated-gpu-cluster.internal/solve",
  apiKey: "secret-token",
});

const model = new Model({ name: "FacilityLocation", solver: customInstance });
const status = await model.solve();
```

#### 方法 3: グローバルなデフォルトソルバーとして設定する

```typescript
import { setDefaultSolver, Model } from "@ohtaman/washi";
import { CloudSolver } from "./cloud-solver.js";

setDefaultSolver(() => new CloudSolver());

// 以降、solver を明示しないモデルはデフォルトで CloudSolver を使用します
const model = new Model("DefaultedModel");
```

---

## 4. 配布: 独立したプラグインパッケージとして公開する

カスタムソルバーを独立した npm パッケージ（例: `@my-org/washi-solver-cplex`）として公開するには、`package.json` で Node.js（ESM）用とブラウザ用のエントリーポイントを宣言します。

### 1. `package.json` の `exports` 構成

```json
{
  "name": "@my-org/washi-solver-cplex",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/lib/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/lib/index.js",
      "default": "./dist/lib/index.js"
    },
    "./browser": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/browser/index.js",
      "default": "./dist/browser/index.js"
    },
    "./browser/index.min.js": "./dist/browser/index.min.js"
  },
  "peerDependencies": {
    "@ohtaman/washi": ">=0.8.0"
  }
}
```

### 2. ブラウザ向け単体ビルド（IIFE）

ブラウザ用 `.min.js` バンドルを出力する際は、Vite や Rollup の出力フォーマットに即時実行関数式（`iife`）を指定します。

- **出力フォーマット**: `iife`
- **グローバル変数名**: `WashiCplex`
- **レジストリ連携**: `Symbol.for("washi.solverRegistry")` により、`<script>` タグで `washi.min.js` の後にプラグインの `.min.js` を読み込むだけで自動的に登録されます。

---

## 5. カスタムソルバーのテスト

ネットワーク通信をモックすれば、事前ビルド（バンドル）なしで Vitest や Jest から直接アダプターをテストできます。

```typescript
import { describe, it, expect, vi } from "vitest";
import { Model, expr, maximize, registerSolver, listAvailableSolvers } from "@ohtaman/washi";
import { CloudSolver } from "./cloud-solver.js";

describe("Custom Solver Integration", () => {
  it("registers in available solvers list", () => {
    registerSolver("cloud-test", () => new CloudSolver());
    expect(listAvailableSolvers()).toContain("cloud-test");
  });

  it("propagates primal values and duals into WaSHI Model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "OPTIMAL",
          objectiveValue: 34,
          values: { x: 2, y: 10 },
          duals: { budget: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      const model = new Model({ solver: new CloudSolver() });
      const x = model.continuous("x", { lb: 0, ub: 10 });
      const y = model.continuous("y", { lb: 0, ub: 10 });
      model.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
      model.constraint(expr`${x} + ${y} <= 12`, "budget");

      const status = await model.solve();
      expect(status).toBe("Optimal");
      expect(x.value).toBe(2);
      const c1 = model.constraints.get("budget");
      expect(c1?.dual).toBe(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
```
