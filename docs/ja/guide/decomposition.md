# 分解法 (`solveColumnGeneration` & `solveBenders`)

単一の MIP モデルの候補組合せが膨大で最初にすべて列挙できない場合や、問題を「設備投資」と「日々の運用」のような 2 段階に分けられる場合、WaSHI では次の 2 つの分解ヘルパーを使えます。

| 手法 | WaSHI API | 向いている問題 |
| :--- | :--- | :--- |
| **列生成法** | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | 切り出しパターン・配送ルート・シフト案が多すぎて列挙できない問題（カッティングストック、VRP、乗務員スケジューリングなど）。 |
| **Benders 分解** | [`master.solveBenders()`](#benders-分解-solvebenders) | 2段階の意思決定（施設配置＋輸送計画など）や、違反が起きたときだけ制約を追加する問題（TSP 部分巡回路除去など）。 |

---

## 列生成法 (`solveColumnGeneration`)

最初にすべての切り出しパターンやルート用の変数を作るのではなく、少数の初期パターン（**主問題**）から始め、`pricing` コールバックで「より有利な新パターン」を必要な分だけ追加します。

1. 現在のパターンだけで連続 LP 緩和（`master.relax()`）を解き、各制約の **双対値（シャドウプライス）**——その制約を 1 単位緩めると目的関数がどれだけ改善するか——を取得します。
2. その双対値（`duals`, `getDual`）を `pricing` コールバックに渡します。
3. コストより双対価値の節約分が大きいパターン（最小化では **被約費用** $\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$）が返されたら、主問題へ変数として追加します。
4. `pricing` が `null` / `[]` を返すか、改善するパターンがなくなるまで繰り返します。
5. 最後に、集まった全パターンで整数計画（MIP）として解き直します（`finalizeAsMIP: true`、デフォルト有効）。

### 例: 子問題 `Model` で `pricing` を書く

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

`pricing` の中で必ずしも子問題 `Model` を作る必要はありません。`getDual(制約名)` を使って、動的計画法やループなど任意の TypeScript アルゴリズムで探索できます。

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

`master.solveBenders(options)` は問題を次の 2 つに分けて解きます。
- **主問題**: 全体の意思決定や整数変数（例: どの工場を開くか）を担当。
- **子問題**: 主問題が出した候補解を評価し、実行不能だったり運用コストの見積もりが甘かったりすると、主問題に線形制約（**カット**）を追加してやり直させます。

### 自動カット生成 (`sub.link()`)

`subproblem` から連続 LP の `Model` を返し、`sub.link(...)` で主問題の変数とつなぐだけで使えます。WaSHI が運用コストの見積もり変数（`theta`）の管理・値の代入・カット追加を自動で行い、収束するまで繰り返します。

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

> [!NOTE]
> **子問題の目的関数が負になりうる場合**: 自動生成される `theta` の下限はデフォルトで `lb: 0` です。子問題で利益やリベートなど負の値をとりうる場合は、`const theta = master.continuous("theta", { lb: -1e6 })` を明示的に作り、`master.objective(...)` に `+ ${theta}` を含めて `{ theta }` を `solveBenders()` に渡してください。

### 手動カット生成 (`BendersCut` / 遅延制約)

TSP の部分巡回路除去のように、条件を満たさない解が見つかったときだけ制約を追加したい場合は、`BendersCut` オブジェクト（または配列）、収束時は `null` を返します。

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
連続 LP を解いたあと、各制約の双対値（シャドウプライス）を取得します。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                     // 双対値 / シャドウプライス
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
