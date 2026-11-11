# 分解法 (`solveColumnGeneration` & `solveBenders`)

指数関数的に多くの候補パターンを持つ問題や、2段階の連結構造を持つ大規模な混合整数計画（MIP）に対して、WaSHI は高レベル分解オーケストレーター（`master.solveColumnGeneration()` と `master.solveBenders()`）および双対情報取得・動的モデル更新用の低レベルプリミティブを提供しています。

| 分解手法 | WaSHI のオーケストレーター | 主な対象問題 |
| :--- | :--- | :--- |
| **列生成法** *(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | 切り出しパターン・配送ルート・シフト案の組合せが膨大な問題（カッティングストック、VRP、乗務員スケジューリングなど）。 |
| **Benders 分解** *(および遅延制約法)* | [`master.solveBenders()`](#benders-分解-solvebenders) | 1段目の意思決定と運用子問題が結合する問題、または遅延カット分離（施設配置＋輸送計画、2段階確率計画、TSP 部分巡回路除去など）。 |

---

## 基礎プリミティブ

分解オーケストレーターの内部でも利用されている以下の低レベル API は、独自の反復アルゴリズムからも直接呼び出せます。

### 1. 制約の双対変数 (`c.dual`)
連続線形計画（LP）を解いた後、各制約の右辺定数（RHS）を 1 単位変化させたときの目的関数への限界寄与（シャドウプライス）を取得します：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                    // 双対変数 / シャドウプライス
console.log(m.solution?.duals.capacity); // 制約名からの参照
```

### 2. 連続 LP 緩和 (`m.relax()`)
`m.relax()` は、モデル内のすべての `Integer` / `Binary` 変数を `[lb, ub]` 内の連続変数として一時的に緩和して LP を解き、`m.solution.duals` に双対変数を格納します：

```typescript
// 連続 LP 緩和を解き、制約のシャドウプライスを m.solution.duals にセット
const status = await m.relax();
console.log("LP 緩和の目的関数値:", m.objectiveValue);
```

### 3. 動的な列追加 (`m.addColumn()`)
新しい決定変数の作成、目的関数係数の設定、および既存の名前付き制約への係数追加を 1 回の呼び出しで行います：

```typescript
const col = m.addColumn({
  name: "pattern_1",
  type: "Integer", // または "Continuous" / "Binary"
  lb: 0,
  cost: 1, // 目的関数の係数
  coefficients: {
    capacity: 2,
  },
});
```

### 4. 制約項の動的更新 (`c.addTerm()` / `c.setTerm()`)
既存の線形制約に含まれる特定変数の係数を動的に加算または上書きします：

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // 左辺に +5 * extra を加算
budget.setTerm(extra, 0); // 0 をセットすると該当変数の項を削除
```

---

## 列生成法 (`solveColumnGeneration`)

`master.solveColumnGeneration(options)` は、少数の初期列を持つ**制限主問題（Restricted Master Problem, RMP）**から開始し、以下のループを実行します：
1. `master.relax()` で主問題の連続 LP 緩和を解く。
2. 現在の双対変数（`duals`, `getDual`）を引数として `pricing` コールバックを呼び出す。
3. 返却された候補列（`ColumnProposal` または `ColumnProposal[]`）の被約費用を評価し、目的関数を改善する列（最小化では $\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$）を主問題へ動的に注入する。
4. `pricing` が `null` / `[]` を返すか、`reducedCostTolerance` を超える改善列がなくなるまで反復する。
5. 最後に、生成された全列を含む主問題を MIP として求解し整数解を得る（`finalizeAsMIP: true`、デフォルト有効）。

### WaSHI 子問題モデルを用いた `pricing` コールバック

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. 制限主問題（RMP）：単一アイテムのみの初期パターンで構築
const master = new Model("CuttingStockMaster");
const pA = master.integer("init_A", { lb: 0 }); // 幅 45 の A を 2 個切り出すパターン
const pB = master.integer("init_B", { lb: 0 }); // 幅 36 の B を 2 個切り出すパターン
const pC = master.integer("init_C", { lb: 0 }); // 幅 16 の C を 6 個切り出すパターン

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. 列生成法の実行
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 価格付け子問題（ナップサック問題）：双対価値の合計を最大化する切り出し方を探す
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

console.log("最適ロール本数:", result.objectiveValue); // 14
console.log("反復回数:", result.iterations);
console.log("追加された列数:", result.columnsAdded);
```

### 独自アルゴリズムでの `pricing` 実装 (`getDual`)

`pricing` は `PricingContext` を受け取る通常のコールバック関数であるため、子問題 `Model` を構築する代わりに、組合せ探索・動的計画法・最短路アルゴリズムなど任意の TypeScript ロジックで直接列を生成できます：

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const dA = getDual("demand_A");
    const dB = getDual("demand_B");
    const dC = getDual("demand_C");

    // 実行可能パターン (45*aA + 36*aB + 16*aC <= rollWidth) から負の被約費用 (1 - dualSum < -1e-6) を持つ最良列を探索
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

`master.solveBenders(options)` は、問題を**主問題（Master Problem）**と**子問題（Subproblem）**に分割し、主問題の候補解に対して子問題を評価して**最適性カット（Optimality Cut）**または**実行可能性カット（Feasibility Cut）**を動的に追加します。

### `sub.link()` による自動カット生成

`subproblem` コールバックから連続 LP の子問題 `Model` を返し、主問題変数との連結制約を `sub.link(...)` で登録すると、補助変数 $\theta$ の管理・主問題変数値の代入・双対変数の抽出・Benders カットの注入がすべて自動で行われます：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主問題：施設の開設決定（0-1 バイナリ変数）
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 固定開設コスト（運用子問題コストを表す theta は自動管理されます）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. 自動 Benders カット生成による求解
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

    // 子問題の輸送量と主問題の開設変数 y1, y2 を sub.link() で接続
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub;
  },
});

console.log("最適総コスト:", result.objectiveValue); // 390
console.log("追加されたカット数:", result.cutsAdded);
console.log("施設開設の解:", result.values);
```

> [!NOTE]
> **子問題の目的関数が負になり得る場合の `theta` 下限設定**: `theta` 変数を明示せずに `sub.link(...)` を使用すると、WaSHI はデフォルトで `lb: 0`（非負の子問題コストを想定）の補助変数 `__benders_theta` を生成します。子問題の目的関数が負の値（利益項やリベートなど）を取り得る場合は、`const theta = master.continuous("theta", { lb: -1e6 })` を宣言して `master.objective(...)` に `+ ${theta}` を含め、`solveBenders(options)` に `{ theta }` を渡してください。

### 手動カット生成 (`BendersCut` / 遅延制約分離)

組合せ的な遅延制約（部分巡回路除去など）や解析的なカットを直接構成する場合は、`BendersCut` オブジェクト（または複数カットの配列 `BendersCut[]`）を返し、収束時に `null` を返します：

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

    // 子問題の運用コスト: y = 0 のとき 100、y = 1 のとき 30
    const actualSubCost = 100 - 70 * yVal;
    if (estTheta < actualSubCost - 1e-4) {
      return {
        kind: "optimality", // 遅延実行可能性カットの場合は "feasibility"
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

## 関連チュートリアルと定式化 Tips

- **分解法の実践チュートリアル**:
  - [配送計画問題 CVRP (`solveColumnGeneration`)](../examples/vehicle-routing.md)
  - [巡回セールスマン問題 TSP (`solveBenders` による部分巡回路除去)](../examples/traveling-salesperson.md)
- **定式化パターン・Tips**: 列生成法における集合被覆（`>= 1`）と集合分割（`== 1`）の使い分け、Price-and-Branch（`finalizeAsMIP`）、およびマルチカット分離については [定式化パターン・Tips](./formulation-tips.md#decomposition-tips) を参照してください。
