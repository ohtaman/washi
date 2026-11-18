# 制約プログラミング (CP) モデリング

WaSHI では、同じ TypeScript 代数モデリング API（`Model`、`expr`、`sum`、`dot`）を使って **数理最適化 (LP / MIP / 凸QP)** と **制約プログラミング (CP)** の両方を記述できます。同梱の **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）を指定すると、グローバル制約（`distinct`、`disjoint`、`cumulative`、`allowed`）や区分線形・要素参照プリミティブ（`max`、`min`、`abs`、`at`）が Big-M や時間離散化 0-1 MIP への展開を経ずに、ネイティブの Lazy Clause Generation (LCG) プロパゲータ上で直接解かれます。

---

## 1. MIP と CP のモデリング発想の違い

**MIP (HiGHS / GLPK)** では、組合せ的な意思決定を 0-1 バイナリ変数行列 $x_{i,t} \in \{0, 1\}$ や Big-M 不等式で表現し、連続緩和（LP 緩和）の下界を強めながら分枝限定法で解きます。

**CP (Pumpkin)** では、各対象が「どの時刻・どのスロットを選ぶか」を有限領域の整数変数（`m.integer(keys, { lb, ub })`）で直接表し、高レベルの**グローバル制約**を組み合わせて伝播（Domain Propagation）と節学習（Clause Learning）で探索します：

| モデリング要素 | MIP での表現 (`HiGHS` / `GLPK`) | CP での表現 (`Pumpkin`) | SMT (`Z3`) |
| :--- | :--- | :--- | :--- |
| **開始時刻・割当先** | 時間離散化バイナリ $x_{i,t}$ または全ペアの順序バイナリ + Big-M | 有界整数変数 `start[i]` $\in [0, H]$ | 連続変数・整数変数 |
| **同時利用人数・容量** | 全時刻 $t$ ごとに $\sum_i d_i x_{i,t} \le C$ の線形制約を生成 | 時間軸に依存しない単一の `cumulative(tasks, C)` | イベント点ベースの負荷記述 |
| **排他的占有（非重複）** | 2作業ペアごとの順序バイナリ $y_{ij} \in \{0, 1\}$ + Big-M | ネイティブの `disjoint(tasks)`（Edge-Finding） | ペアごとの `Or` 選言 |
| **順列・1対1割当** | 二重確率的な 0-1 割当行列 $x_{i,j} \in \{0, 1\}$ | 整数変数 `machine[i]` $\in [0, N-1]$ + `distinct(machine)` | ネイティブの `ctx.Distinct` |
| **テーブル・コスト参照** | 選択バイナリ $b_k$ ($\sum_k b_k = 1$) による線形和 | ネイティブの `at(costs, indexVar)`・`allowed` / `not(allowed)` | ネストされた `If` 式 |
| **得意な問題領域** | 連続フロー・混合配分・双対/シャドウプライス・2次目的関数 (`QuadExpr`)・強い LP 緩和 | スケジューリング・資源容量・順列割当・テーブル制約・`COOP`/`COEP` 不要の `unsatCore` | 連続変数を含む一般論理・厳密な反例探索・SMT 証明 |

---

## 2. 区間・資源制約スケジューリング (`disjoint`, `cumulative`, `max`)

時間離散化 MIP は時間幅 $H$ に比例して $O(|T| \cdot H)$ 個のバイナリ変数と制約行を生成するため、時間粒度が細かいとサイズと計算量が急増します（WaSHI の MIP 自動変換ではスパン 5,000 またはパルス変数 25,000 超でガードエラーを出し、`{ solver: "pumpkin" }` を推奨します）。

CP では各作業につき **開始時刻の整数変数 1 本だけ**（`start[task]`）を定義し、`disjoint`（単一設備の排他）や `cumulative`（人数・電力などの累計上限）で表現します。プロパゲータが開始可能区間の上下限やエネルギー余剰を直接推論するため、時間軸が長くてもモデルがコンパクトに保たれます。

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// 先行順序制約: prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + 3 <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + 3 <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + 4 <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + 3 <= ${start.coat}`, "coat_after_drill");

// mill と drill が共有する単一 CNC 主軸（重複禁止）
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// 全作業で同時稼働できる作業員数は最大 2 名
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
```

6工程・共有設備・人員制約と期限競合の診断を含む実践例は [リソース制約付きプロジェクトスケジューリング (RCPSP)](../examples/project-scheduling.md) を参照してください。

---

## 3. 組合せ割当・テーブル制約・要素参照 (`distinct`, `allowed`, `at`)

$N \times M$ 個の 0-1 変数 $x_{j,m}$ を作る代わりに、各ジョブに「どのマシンを使うか」を表す単一の有界整数変数 `machine[job]`（領域 $\{0, \dots, M-1\}$）を与えます：

- **`distinct(machine)`**: Pumpkin の `all_different` プロパゲータにより全ジョブを異なるマシンへ割り当てます。
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**: 複雑な Big-M 線形化なしに、組み合わせの許可・禁止ルールをテーブルとしてそのまま記述します。
- **`at(costs, indexVar)`**: 0 始まりの変数インデックスで配列値 `costs[indexVar]` を参照するネイティブ `element` プロパゲータです。

```typescript
import { Model, expr, distinct, allowed, not, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// 各ジョブを異なるマシン (0, 1, 2) に割当
m.constraint(distinct(machine), "one_job_per_machine");

// 安全インターロック: Job A=マシン0 と Job B=マシン1 の同時組を禁止
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// 変数インデックスによる 0 始まりコスト参照 (Element 制約)
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
```

---

## 4. 領域設計・対称性の破壊・矛盾診断

### 整数領域を有限かつタイトに保つ
Pumpkin は符号付き 32 ビット整数範囲で伝播計算を行うため、`Continuous` 変数・非整数係数・無界変数（`lb: -Infinity` や `ub: Infinity`）は拒否されます。すべての `m.integer()` に有限の整数範囲 $[-(2^{30} - 1),\, 2^{30} - 1]$ を指定してください（詳細は [Pumpkin ドメイン・API 事前条件](../solvers/pumpkin.md)）。ホライズン上限をタイトにするほど探索空間が縮みます。

### 狭義不等号 (`<`) による対称性の破壊
同質なスロット `slot[0]`, ..., `slot[k-1]` に $k$ 個の対象を選ぶ場合、同じ集合でも $k!$ 通りの順列がすべて同一目的値となり、探索木に対称解があふれます。`slot[0] < slot[1] < ...` と単調増加順序を課すだけで、**異なる値制約と対称性の排除を同時に**達成できます：

```typescript
import { Model, expr, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// 狭義単調増加で「すべて異なる」制約と 3! = 6 通りの順列対称性の排除を同時に表現
m.constraint([
  expr`${slot[0]} < ${slot[1]}`,
  expr`${slot[1]} < ${slot[2]}`,
]);

m.objective(
  minimize(
    expr`at(${latencyMs}, ${slot[0]}) + at(${latencyMs}, ${slot[1]}) + at(${latencyMs}, ${slot[2]})`
  )
);
await m.solve();
```

### ウォームスタートと `COOP`/`COEP` 不要の競合診断
- **ウォームスタート (`initialValue`)**: `m.integer()` / `m.binary()` に `{ initialValue: val }` を設定すると Pumpkin の分岐選択（`WarmStart` ブランチャー）の初期ヒントとして利用されます。
- **競合診断 (`m.check()`)**: CP モデルが `"Infeasible"` となった場合でも、同じモデルに `await m.check({ solver: "pumpkin" })` を呼ぶだけで（ブラウザで `COOP`/`COEP` ヘッダーを設定せずに）矛盾を起こしている制約名群（`unsatCore` / `conflicts`）を特定できます。詳細は [競合制約診断 (`unsatCore`)](./unsat-core.md) を参照してください。
