# 分解法 (`solveColumnGeneration` & `solveBenders`)

単一の MIP モデルでは候補列が多すぎて最初から列挙できない場合や、問題を2段階の意思決定に分割できる場合、WaSHI の2つの分解ヘルパーを使えます。

| 手法 | WaSHI API | 向いている問題 |
| :--- | :--- | :--- |
| **列生成法** | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | パターン・配送ルート・シフト案が多すぎて列挙できない問題（カッティングストック、VRP、乗務員スケジューリング）。 |
| **Benders 分解** | [`master.solveBenders()`](#benders-分解-solvebenders) | 2段階の意思決定（施設配置＋輸送計画）や、違反が起きたときだけ追加する遅延制約（TSP 部分巡回路除去）。 |

---

## 列生成法 (`solveColumnGeneration`)

列生成法は、変数の数（列数）が膨大で最初からすべて列挙できない線形計画・整数計画を解く手法です。
問題を次の2つに分けます。

- **制限主問題（RMP）**: 少数の初期列だけで構成した主問題 `Model`。
- **価格付け子問題（pricing subproblem）**: RMP の LP 双対値を受け取り、目的関数を改善する新しい列を探索するコールバック（`pricing`）。

`master.solveColumnGeneration()` は次の手順を繰り返します。

1. RMP の連続 LP 緩和（`master.relax()`）を解き、各制約の**双対値（潜在価格）**を取得します。
2. 取得した双対値（`duals`, `getDual`）を `pricing` コールバックに渡します。
3. 返された各 `ColumnProposal` の**被約費用**（$\bar{c} = \text{cost} - \sum_i \pi_i a_i$）を、`reducedCostTolerance` に照らして自動で判定します。
4. 改善する列（最小化では $\bar{c} < 0$、最大化では $\bar{c} > 0$）があれば RMP に追加し、`pricing` が `null` / `[]` を返すか改善列がなくなるまで反復します。
5. 最後に、集まった全列に対して整数計画（MIP）として解き直します（`finalizeAsMIP: true`、デフォルト有効）。

> [!IMPORTANT]
> **前提条件と性質**:
> - **初期 RMP の実行可能性**: 最初の LP 緩和で有限の最適解と双対値が得られるよう、実行可能な初期列を用意してください。
> - **LP 双対を返せるソルバーが必須**: HiGHS または GLPK が必要です（Pumpkin・Z3 は非対応）。
> - **Price-and-Branch ヒューリスティック**: `finalizeAsMIP: true` はルート LP の列プールだけで MIP を解きます。実用上高速ですが、厳密な Branch-and-Price ではありません。

### 例: 子問題 `Model` で `pricing` を書く

以下のカッティングストック問題では、RMP を3つの単純パターンで初期化し、価格付け子問題でナップサック問題を解いて有利な切り出しパターンを探します。
被約費用の判定は `solveColumnGeneration()` が自動で行うため、`pricing` 側は子問題の最適パターンをそのまま返すだけで構いません。

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. 主問題: 最初は 1 種類だけを切り出す単純なパターンで始める
const master = new Model("CuttingStockMaster");
const pA = master.integer("init_A", { lb: 0 }); // 幅 45 の A を 2 本
const pB = master.integer("init_B", { lb: 0 }); // 幅 36 の B を 2 本
const pC = master.integer("init_C", { lb: 0 }); // 幅 16 の C を 6 本

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. 列生成法を実行
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 子問題: 双対価値の合計が最大になる切り出しパターンを探す
    const sub = new Model("KnapsackPricing");
    const aA = sub.integer("a_A", { lb: 0, ub: 2 });
    const aB = sub.integer("a_B", { lb: 0, ub: 2 });
    const aC = sub.integer("a_C", { lb: 0, ub: 6 });

    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${aA} + ${dualB} * ${aB} + ${dualC} * ${aC}`));
    sub.constraint(expr`45 * ${aA} + 36 * ${aB} + 16 * ${aC} <= ${rollWidth}`);

    await sub.solve();

    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(aA.value ?? 0),
        demand_B: Math.round(aB.value ?? 0),
        demand_C: Math.round(aC.value ?? 0),
      },
    };
  },
});

console.log("最小ロール本数:", result.objectiveValue); // 14
console.log("反復回数:", result.iterations);
console.log("追加された列数:", result.columnsAdded);
```

### 例: TypeScript の独自ロジックで `pricing` を書く (`getDual`)

`pricing` の中で必ずしも子問題 `Model` を組む必要はありません。
`getDual(制約名)` を使って、動的計画法やループなど任意の TypeScript アルゴリズムで探索できます。

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const dA = getDual("demand_A");
    const dB = getDual("demand_B");
    const dC = getDual("demand_C");

    // 1 - dualSum < -1e-6 となる有利なパターンを探索
    let bestDualSum = 1 + 1e-6;
    let best: { demand_A: number; demand_B: number; demand_C: number } | null = null;
    for (let aA = 0; 45 * aA <= rollWidth; aA++) {
      for (let aB = 0; 45 * aA + 36 * aB <= rollWidth; aB++) {
        for (let aC = 0; 45 * aA + 36 * aB + 16 * aC <= rollWidth; aC++) {
          const dualSum = dA * aA + dB * aB + dC * aC;
          if (dualSum > bestDualSum) {
            bestDualSum = dualSum;
            best = { demand_A: aA, demand_B: aB, demand_C: aC };
          }
        }
      }
    }
    return best ? { cost: 1, type: "Integer", coefficients: best } : null;
  },
});
```

---

## Benders 分解 (`solveBenders`)

`master.solveBenders(options)` は、第1段階の整数決定を担う**主問題**と、第2段階の評価を担う**子問題**に分割します。
各反復で子問題が主問題の候補解を評価し、必要に応じて線形制約（**カット**）を主問題へ追加します。

- **最適性カット（`kind: "optimality"`）**: 子問題は実行可能だが、実際の第2段階コストが主問題の見積もり変数 `theta` を上回る場合に `theta` の下界を引き締めます。
- **実行可能性カット（`kind: "feasibility"`）**: 子問題が実行不能になる候補解や、部分巡回路などの遅延制約違反を主問題から除外します。

### 自動カット生成 (`sub.link()`)

`subproblem` から連続 LP の `Model` を返し、`sub.link(...)` で主問題の変数と接続します。
WaSHI が見積もり変数 `theta` の管理・主問題変数の代入・双対値からの最適性カット生成を自動で行い、ギャップが収束するまで繰り返します。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主問題: 工場を開くかどうかの 0-1 決定
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 固定開設コスト（子問題の運用コスト変数 theta は自動で追加される）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. 自動 Benders カットで求解
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    const sub = new Model("DispatchSubproblem");
    const x11 = sub.continuous("x_11", { lb: 0 });
    const x12 = sub.continuous("x_12", { lb: 0 });
    const x13 = sub.continuous("x_13", { lb: 0 });
    const x21 = sub.continuous("x_21", { lb: 0 });
    const x22 = sub.continuous("x_22", { lb: 0 });
    const x23 = sub.continuous("x_23", { lb: 0 });

    sub.objective(
      minimize(
        expr`3 * ${x11} + 4 * ${x12} + 2 * ${x13} + 4 * ${x21} + 2 * ${x22} + 3 * ${x23}`
      )
    );

    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // 子問題の輸送量を主問題の y1, y2 にリンク
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub;
  },
});

console.log("最小総コスト:", result.objectiveValue); // 390
console.log("追加カット数:", result.cutsAdded);
console.log("開く工場:", result.values);
```

> [!IMPORTANT]
> **自動 `sub.link()` モードの前提条件**:
> - **最適性カットのみ対応**: 連続 LP 子問題が実行不能になるとエラーになります。`total_capacity_floor` のような主問題制約で実行可能性を保つか、手動の `kind: "feasibility"` を使ってください。
> - **`Maximize` や負のコストでは `theta` を明示**: 自動 `theta` は `Minimize` かつ `lb: 0` 専用で、`Maximize` 主問題ではエラーになります。`theta` を宣言して目的関数に含め、`{ theta }` を渡してください。
> - **LP 双対を返せるソルバーが必須**: 連続子問題の双対値取得には HiGHS または GLPK が必要です。

### 手動カット生成 (`BendersCut` / 遅延制約)

独自のカット、実行可能性カット、または遅延制約（TSP の部分巡回路除去など）を扱う場合は、`BendersCut` オブジェクトまたはその配列を返し、収束時は `null` を返します。
最適性カットの `subproblemObjective` には子問題単体ではなく**合計目的関数値**（主問題＋子問題）を渡してください。WaSHI はその値を主問題の境界と比較して収束ギャップを判定します。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const master = new Model("ManualBenders");
const y = master.binary("y");
const theta = master.continuous("theta", { lb: 0 });
master.objective(minimize(expr`40 * ${y} + ${theta}`));

const result = await master.solveBenders({
  theta,
  gapTolerance: 1e-4,
  subproblem: ({ getMasterValue }) => {
    const yVal = getMasterValue(y);
    const estTheta = getMasterValue(theta);

    // y = 0 なら運用コスト 100、y = 1 なら 30
    const actualSubCost = 100 - 70 * yVal;
    if (estTheta < actualSubCost - 1e-4) {
      return {
        kind: "optimality", // 実行可能性カットなら "feasibility"
        constraint: expr`${theta} >= 100 - 70 * ${y}`,
        subproblemObjective: 40 * yVal + actualSubCost,
      };
    }
    return null; // 収束
  },
});

console.log(result.objectiveValue); // 70 (y = 1, theta = 30)
```

---

## 低レベルプリミティブ（自作ループ用）

独自の列生成ループやカット平面ループを組みたい場合は、次の 4 つの部品を直接使えます。

### 1. 制約の双対値 (`c.dual`)

連続 LP を解いたあと、各制約の双対値（潜在価格）を取得します。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                     // 双対値 / 潜在価格
console.log(m.solution?.duals.capacity); // 制約名での参照
```

### 2. 連続 LP 緩和 (`m.relax()`)

すべての `Integer` / `Binary` 変数を一時的に `[lb, ub]` の連続変数として解き、双対値を取得できるようにします。

```typescript
const status = await m.relax();
console.log("LP 緩和値:", m.objectiveValue);
```

### 3. 変数の動的な追加 (`m.column()`)

新しい変数を作成し、目的関数の係数と既存の名前付き制約への係数を 1 回の呼び出しで登録します。

```typescript
const col = m.column({
  name: "pattern_1",
  type: "Integer", // または "Continuous" / "Binary"
  lb: 0,
  cost: 1, // 目的関数の係数
  coefficients: {
    capacity: 2,
  },
});
```

### 4. 既存制約の係数更新 (`c.addTerm()` / `c.setTerm()`)

既存の線形制約に含まれる変数の係数を加算または上書きします。

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // 左辺に +5 * extra を追加
budget.setTerm(extra, 0); // 0 を設定すると extra を制約から削除
```

---

## 関連する例題・Tips

- [配送計画問題 (`solveColumnGeneration`)](../examples/vehicle-routing.md)
- [巡回セールスマン問題 (`solveBenders` 遅延部分巡回路除去)](../examples/traveling-salesperson.md)
- [定式化パターン・Tips](./formulation-tips.md#decomposition-tips)
