# 制約プログラミング (CP) モデリング

WaSHI では、数理最適化（LP / MIP / QP）と制約プログラミング（CP）の両方を同じ TypeScript API で記述できます。
同梱の **Pumpkin** ソルバー（`{ solver: "pumpkin" }`、追加インポート不要）を使うと、スケジュール調整・資源上限・相異制約・テーブル制約といった組合せ条件を、巨大な 0-1 変数群へ展開せずに直接モデル化して解けます。

---

## 1. MIP (`HiGHS` / `GLPK`) と CP (`Pumpkin`) の使い分け

両手法は、意思決定の表現方法と探索空間の絞り込み方が根本的に異なります。

### 混合整数計画（MIP：`HiGHS` / `GLPK`）

意思決定を連続変数や整数変数（0-1 変数を含む）で表し、条件を線形不等式として記述して LP 緩和と分枝限定法で解きます。
連続フロー、線形な予算制約、2 次目的関数、LP の双対分析に強い一方、細かい時間軸の離散化や組合せ構造の 0-1 変数展開を行うとモデル規模が急膨張します。

### 制約プログラミング（CP：`Pumpkin`）

CP では各決定変数に有限の整数ドメイン（取り得る値の集合）を直接与えます。
変数間の構造的なルールは、複数変数の組合せ条件を 1 つにまとめた高水準な**グローバル制約**として記述します。
探索中にいずれかの変数のドメインが狭まるたびに**ドメイン伝播**（他の変数の取り得ない値を自動で削る推論）が働くため、巨大な 0-1 変数群を作らずコンパクトなモデルのまま解けます。

代表的なモデリングパターンの対比は次のとおりです。

| やりたいこと | MIP (`HiGHS` / `GLPK`) | CP (`Pumpkin`) |
| :--- | :--- | :--- |
| **開始時刻の決定** | 作業×時刻ごとの 0-1 変数 | 作業ごとに 1 つの整数変数 `start[i]` |
| **作業の重複禁止** | ペアごとの順序変数 + Big-M 制約 | `disjoint(tasks)` |
| **人数・設備の同時利用上限** | 全時刻ごとに総和制約を生成 | `cumulative(tasks, capacity)` |
| **1 対 1 の割当** | 2 次元の 0-1 割当行列 | `machine[i]` + `distinct(machine)` |
| **インデックスによる値・コスト参照** | 0-1 選択変数を使った重み付き和 | `at(costs, indexVar)` |
| **向いている問題** | 連続フロー、配合、2 次目的関数、双対分析 | スケジューリング、資源上限、順列・割当、互換性テーブル制約 |

> [!TIP]
> 連続変数（`Continuous`）・非整数の係数や定数・2 次目的関数が必要な場合は `HiGHS`、連続変数を含む論理条件には `Z3` を選んでください。
> 有界な整数変数と真偽値でスケジューリング・経路計画・組合せ割当をモデル化する場合は `Pumpkin` が適しています。

---

## 2. 作業スケジュールと共有資源 (`disjoint`, `cumulative`, `max`)

長い時間軸を時刻ごとの 0-1 変数に離散化すると、MIP では変数が数万個、制約が数万本規模に膨らみます。
WaSHI の MIP 変換は、`cumulative` の時間ホライズンが 5,000 ステップ超、または展開される時間スロット変数が 25,000 個超になるとエラーを投げ、`{ solver: "pumpkin" }` の利用を案内します。

Pumpkin なら時間軸の細かさに関係なく、各作業につき **1 つの整数変数（`start[task]`）** だけで済みます。
区間スケジューリングの基本は次の 3 つのプリミティブです。

- **`disjoint(tasks)`**: `{ start, duration }` 形式のタスク配列を受け取り、単一設備を共有する場合など、区間 `[start, start + duration)` 同士の重複を禁止します。
- **`cumulative(tasks, capacity)`**: `{ start, duration, demand }` 形式のタスク配列を受け取り、どの時点でも合計負荷が `capacity` 以下になるよう制限します。
- **`max(...)`**: 複数の式の最大値を表します。スケジューリングでは全作業の完了時刻の最大値である**メイクスパン**（$\max_i (\text{start}_i + \text{duration}_i)$）を表し、目的関数で最小化できます。

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// 先行順序: prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + ${duration.mill} <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + ${duration.drill} <= ${start.coat}`, "coat_after_drill");

// mill と drill は 1 台の CNC マシンを共有（重複禁止）
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// 全体で同時に作業できる担当者は最大 2 名
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
console.log("メイクスパン:", m.objectiveValue);
```

より実践的な例は [資源制約付きプロジェクトスケジューリング (RCPSP)](../examples/project-scheduling.md) を参照してください。

---

## 3. 割当・組合せルール・コスト参照 (`distinct`, `allowed`, `at`)

$N \times M$ の 0-1 割当行列を作る代わりに、各ジョブに担当マシン番号（`0` 〜 `M - 1`）を表す有界な整数変数 `machine[job]` を 1 つ持たせます。

- **`distinct(machine)`**: すべてのジョブに異なるマシンを割り当てるグローバル制約（AllDifferent）です。
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**: `allowed` で許可する組合せ、`not(allowed(...))` で禁止する組合せをそのまま列挙できるテーブル制約で、煩雑な線形化は不要です。
- **`at(costs, indexVar)`**: `costs[indexVar]` の値を `expr` や目的関数の中で直接参照します。

```typescript
import { Model, expr, distinct, allowed, not, minimize } from "@ohtaman/washi";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// 各ジョブを異なるマシン (0, 1, 2) に割り当てる
m.constraint(distinct(machine), "one_job_per_machine");

// jobA をマシン 0、jobB をマシン 1 に同時に割り当てる組合せを禁止
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// 選ばれたマシン番号に応じてコスト配列から値を参照する
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
console.log("合計コスト:", m.objectiveValue);
```

---

## 4. Pumpkin でモデルを組むときのポイント

### 整数変数の範囲 (`lb`, `ub`) は有限かつ狭くする

Pumpkin が扱えるのは $[-(2^{30} - 1),\, 2^{30} - 1]$ の範囲の有界な整数のみです。
`Continuous` 変数、非整数の係数・定数、無限大の上下限（`-Infinity` / `Infinity`）はエラーになります。
`[lb, ub]` を可能な限り狭い範囲に絞るほど初期ドメインが小さくなり、ドメイン伝播が効率よく働きます。
詳しくは [Pumpkin の前提条件](../solvers/pumpkin.md#domain-api-preconditions) を参照してください。

### 対称性を `<` で除去して無駄な探索を減らす

互いに区別されない $k$ 個の枠（`slot[0]`, ..., `slot[k-1]`）に異なる要素を 1 つずつ割り当てる問題では、並び順が違うだけの同じ組合せがすべて同じコストになります。
対称性除去を入れないと、ソルバーは等価な $k!$ 通りの並び順を無駄に探索します。
`slot[0] < slot[1] < ...` を加えると、重複禁止と昇順（一意な順序）への固定を同時に実現できます。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// 狭義の昇順に固定して、重複禁止と 3! = 6 通りの対称性除去を同時に行う
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
console.log("最小レイテンシ合計:", m.objectiveValue);
```

### ウォームスタートと矛盾診断

- **ウォームスタート / 初期値ヒント（`initialValue`）**: `m.integer()` や `m.binary()` に `{ initialValue: val }` を渡すと、渡した値が探索時の値選択のヒントとして使われます。
- **矛盾診断（`m.check()`）**: CP モデルが `"Infeasible"` になったときは、`await m.check({ solver: "pumpkin" })` で矛盾している名前付き制約を特定できます。詳細は [矛盾診断 (`unsatCore`)](./unsat-core.md) を参照してください。
