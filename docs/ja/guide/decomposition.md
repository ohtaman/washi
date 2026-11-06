# 高度な分解法とベストプラクティス（列生成法・Benders分解）

混合整数計画法（MIP）は極めて柔軟で強力ですが、素朴な一体型定式化（Monolithic Formulation）では分枝限定法の探索木が爆発し、ソルバーの計算が停止・極度に遅延する構造的ボトルネックが存在します。
WaSHI では、オペレーションズ・リサーチ（OR）の確立されたベストプラクティスを非専門家でも手軽に扱えるよう、子問題モデルを返すだけで完結する高レベルオーケストレーター（`master.solveColumnGeneration` / `master.solveBenders`）と低レベルの分解プリミティブを提供しています。

---

## なぜ分解法が必要なのか？（素朴な MIP が解けない理由）

汎用 MIP ソルバーが苦手とする典型的な問題構造は主に以下の2つです：

| 問題の構造・特徴 | 素朴な MIP が破綻する理由 | 確立されたベストプラクティス | WaSHI の API |
| :--- | :--- | :--- | :--- |
| **巨大な対称性と緩い連続緩和**<br>*(カッティングストック、配送計画/VRP、シフト・乗務員スケジューリング)* | パターンの対称な順列が無数に存在し、LP連続緩和が極めて緩いため、分枝限定法の探索木が指数関数的に爆発する。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **連結変数と多段階決定構造**<br>*(巡回セールスマン/TSP、施設配置＋配送計画、2段階確率計画法)* | 1段目の投資/選択変数と、無数のシナリオ・運用子問題変数が混在し、単一モデルの行列サイズが巨大化する。 | **Benders 分解**<br>*(ベンダーズ切除平面法)* | [`master.solveBenders()`](#benders-分解-solvebenders) |

---

## 基礎プリミティブ

WaSHI は、双対情報の取得やモデルの動的変更を行うためのプリミティブを提供しています：

### 1. 制約の双対変数（`dual`）
LP 求解後に、制約の右辺定数（RHS）を 1 単位変化させたときの目的関数への寄与（限界費用）を取得できます：

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual); // 双対変数 / シャドウプライス
console.log(m.solution.duals.capacity);
```

### 2. 連続 LP 緩和（`model.relax()`）
分解アルゴリズムでは、双対変数を得るために整数制約を外した連続 LP 緩和を解く必要があります。`model.relax()` は、モデル内のすべての `Integer` および `Binary` 変数を上下限内の連続変数として一時的に緩和して求解します：

```typescript
// LP 緩和を解き、制約のシャドウプライスを m.solution.duals にセット
const status = await m.relax();
console.log("理論的双対下界/上界:", m.objectiveValue);
```

### 3. 動的な列追加（`model.addColumn()`）
新しい決定変数の生成、目的関数への係数追加、および既存制約への寄与係数の注入を 1 回の呼び出しで実行します：

```typescript
const col = m.addColumn({
  name: "pattern_1",
  type: "Integer", // または "Continuous"
  lb: 0,
  cost: 1, // 目的関数の係数
  coefficients: {
    demand_itemA: 2,
    demand_itemB: 1,
  },
});
```

### 4. 制約項の動的更新（`addTerm` / `setTerm`）
既存の制約に含まれる変数の係数を動的に加算・変更できます：

```typescript
const c = m.getConstraintByName("budget")!;
c.addTerm(newVar, 5); // newVar の係数を +5
c.setTerm(newVar, 0); // 0 をセットすると制約から安全に削除
```

---

## 列生成法（`solveColumnGeneration`）

列生成法は、少数の初期列を持つ**制限主問題（Restricted Master Problem, RMP）**から開始し、以下のループを自動実行します：
1. `master.relax()` で主問題の連続 LP 緩和を解く。
2. 制約のシャドウプライス（双対値）に基づいて価格付け子問題を解く。
3. 被約費用が負（改善可能）な候補パターン（$\bar{c} = \text{cost} - \sum \pi_i a_i < 0$）を主問題に動的追加。
4. 改善する列がなくなるまで反復。
5. 最後に主問題を本来の整数問題（MIP）として解き、厳密な整数解を復元（`finalizeAsMIP`、既定値 `true`）。

### 推奨：子問題モデルと `linkColumn()` による全自動列生成

子問題のコールバックで `Model` を返し、マスター制約との紐付けを `sub.linkColumn(...)` で指定するだけで、目的関数の双対更新・子問題の求解・被約費用判定・列追加が全自動で行われます：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. 制限主問題（RMP）の構築
const master = new Model("CuttingStockMaster");
master.objective(minimize(0));

for (const item of items) {
  master.constraint(expr`0 >= ${item.demand}`, `demand_${item.id}`);
}

// 初期列を登録（通常の変数定義でも、addColumn でも可能）
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. master.solveColumnGeneration() で自動求解（sub を返すだけ！）
const result = await master.solveColumnGeneration({
  subproblem: () => {
    // 価格付け子問題（ナップサック問題）
    const sub = new Model("KnapsackPricing");
    const a = {
      A: sub.integer("a_A", { lb: 0, ub: 2 }),
      B: sub.integer("a_B", { lb: 0, ub: 2 }),
      C: sub.integer("a_C", { lb: 0, ub: 6 }),
    };
    sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

    // 子問題の変数がマスターのどの制約に寄与するかを linkColumn で紐付け
    sub.linkColumn({
      cost: 1,
      coefficients: {
        demand_A: a.A,
        demand_B: a.B,
        demand_C: a.C,
      },
    });

    return sub; // モデルを返すだけで、双対目的関数と列注入は全自動！
  },
});

console.log("最適な必要ロール本数:", result.objectiveValue); // 14本
console.log("実行された反復回数:", result.iterations);
console.log("動的生成された列数:", result.columnsAdded);
```

> **Note**: 静的な子問題モデルの場合は、`subproblem: { model: sub, mapping: { demand_A: a.A, ... }, cost: 1 }` のような宣言的オブジェクト形式で渡すことも可能です。

### 低レベル制御：カスタム `pricing` コールバック

最短経路アルゴリズムなどの専用ソルバーを価格付けに利用したい場合は、`pricing` コールバックを手動定義できます：

```typescript
const result = await master.solveColumnGeneration({
  pricing: async ({ getDual, reducedCostTolerance }) => {
    const dualA = getDual("demand_A");
    const dualB = getDual("demand_B");
    const dualC = getDual("demand_C");

    // 独自ソルバーで被約費用最小のパターンを探索
    const bestPattern = solveKnapsack(dualA, dualB, dualC);
    const reducedCost = 1 - bestPattern.dualValue;

    if (reducedCost < -reducedCostTolerance) {
      return {
        cost: 1,
        type: "Integer",
        coefficients: bestPattern.coefficients,
        reducedCost,
      };
    }
    return null; // 改善列なし（反復終了）
  },
});
```

---

## Benders 分解（`solveBenders`）

Benders 分解は問題を以下のように分割して解きます：
- **主問題（Master Problem）**: 連結変数（例：施設の開設有無などの 0-1 変数 $y$）と、子問題の推定費用を表す補助変数 $\theta \ge 0$ を持つ。
- **子問題（Subproblem）**: 主問題の暫定解 $y^*$ のもとで運用子問題を解き、**最適性カット（Optimality Cut）** を主問題へフィードバックする。

### 推奨：子問題モデルと `linkRow()` による全自動カット生成

子問題のコールバックで `Model` を返し、マスター変数との連結制約を `sub.linkRow(...)` で指定するだけで、$\theta$ の管理・双対変数の抽出・Benders 最適性カットの生成が全自動で完結します：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主問題（マスター）：施設開設の決定
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 目的関数：施設開設固定費（theta は自動注入・管理されます）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
// 全体需要を満たす最低限の施設容量制約
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "capacity_check");

// 2. master.solveBenders() で全自動求解
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    // 運用子問題（輸送費用最小化）
    const sub = new Model("TransportSubproblem");
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

    // 需要制約
    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // マスター変数 y1, y2 との連結制約を行リンク（linkRow / link）で指定するだけ！
    sub.linkRow(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.linkRow(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // モデルを返すだけで、カット生成・theta管理は全自動！
  },
});

console.log("最適総費用:", result.objectiveValue); // 390
console.log("反復回数:", result.iterations);
console.log("追加されたカット数:", result.cutsAdded);
console.log("施設開設状況:", {
  F1: result.values.open_F1,
  F2: result.values.open_F2,
});
```

### 低レベル制御：カスタム `BendersCut` コールバック

カットの数式や係数を手動で組み立てる場合は、`subproblem` コールバックから `BendersCut` オブジェクトを直接返すことも可能です：

```typescript
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: async ({ getMasterValue }) => {
    const open1 = getMasterValue(y1);
    const open2 = getMasterValue(y2);
    const estTheta = getMasterValue("theta");

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      // 最適性カットを手動定義
      return {
        kind: "optimality",
        constraint: expr`theta - 50 * ${sub.solution.duals.cap1} * ${y1} - 60 * ${sub.solution.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // 収束（カット不要）
  },
});
```

---

## OR の実践的キラーアプリケーション

OR の現場で分解法が決定的な威力を発揮する2大代表例です：

### 1. 配送計画問題（CVRP: 容量制約付き配送計画） $\times$ 列生成法
*(完全な実行可能コード: [`examples/node/13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts))*

* **問題の課題**: 複数台の車両で顧客を巡回配送する際、訪問順序の全ルートをあらかじめ列挙すると何億通りにも達し、単一 MIP ではメモリが爆発します。
* **列生成法のアプローチ**:
  * **主問題（Set Covering）**: 生成されたルート候補の中から、全顧客をカバーする最小台数・最小距離の組み合わせを選ぶ。
  * **子問題（Pricing / ナップサック問題）**: 顧客制約のシャドウプライス（双対変数）をもとに、車両積載容量を満たしつつコスト削減効果の高い新規ルート（列）を動的に1本ずつ生成。

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const vehicleCapacity = 8;
const customers = [
  { id: "C1", demand: 4 },
  { id: "C2", demand: 3 },
  { id: "C3", demand: 5 },
  { id: "C4", demand: 2 },
  { id: "C5", demand: 4 },
];

// 1. 主問題：顧客の配送カバー
const master = new Model("CVRP_Master");
const initialRoutes: Var[] = [];
for (const cust of customers) {
  initialRoutes.push(master.integer(`init_${cust.id}`, { lb: 0, ub: 1 }));
}
master.objective(minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr())));

for (let i = 0; i < customers.length; i++) {
  master.constraint(expr`${initialRoutes[i]} >= 1`, `visit_${customers[i].id}`);
}

// 2. 列生成法で求解
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  subproblem: () => {
    const sub = new Model("RoutePricing");
    const a: Record<string, Var> = {};
    for (const cust of customers) {
      a[cust.id] = sub.binary(`v_${cust.id}`);
    }

    // 車両の積載容量制約: sum(demand_i * a_i) <= vehicleCapacity
    const load = customers.reduce((acc, c) => acc.add(a[c.id].mul(c.demand)), new LinExpr());
    sub.constraint(expr`${load} <= ${vehicleCapacity}`);

    // 生成列と主問題の制約を紐付け
    const coefficients: Record<string, Var> = {};
    for (const cust of customers) {
      coefficients[`visit_${cust.id}`] = a[cust.id];
    }
    sub.linkColumn({ cost: 1, coefficients });
    return sub;
  },
});

console.log("最適車両台数:", result.objectiveValue); // 3台
```

### 2. 巡回セールスマン問題（TSP） $\times$ Benders 分解（部分巡回除去）
*(完全な実行可能コード: [`examples/node/14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts))*

* **問題の課題**: 全都市を1筆書きで巡回する際、「途中で小さな島（部分巡回）ができてしまう」のを禁止する部分巡回除去制約（SECs）は、都市数 $n$ に対して **$O(2^n)$ 個（天文学的数値）** 存在します。
* **Benders 分解（遅延カット生成 / DFJ法）のアプローチ**:
  * **主問題**: 各都市の入次数・出次数が1という割り当て緩和制約だけで解く。
  * **子問題**: 得られた経路グラフで連結成分を調べ、もし島（部分巡回 $S$）が見つかれば、その島を禁止する Benders 実行可能カット（$\sum_{i,j \in S} x_{ij} \le |S| - 1$）を動的に主問題へ注入。

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const n = cities.length;
const master = new Model("TSP_Master");
const x: Record<string, Var> = {};
const objExpr = new LinExpr();

for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      const v = master.binary(`x_${i}_${j}`);
      x[`${i}_${j}`] = v;
      objExpr.addTerm(v, dist(i, j));
    }
  }
}
master.objective(minimize(objExpr));

// 各都市の出次数・入次数制約
for (let i = 0; i < n; i++) {
  const outE = new LinExpr();
  const inE = new LinExpr();
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      outE.addTerm(x[`${i}_${j}`], 1);
      inE.addTerm(x[`${j}_${i}`], 1);
    }
  }
  master.constraint(expr`${outE} == 1`, `out_${i}`);
  master.constraint(expr`${inE} == 1`, `in_${i}`);
}

// Benders 遅延部分巡回路除去で求解
const result = await master.solveBenders({
  subproblem: ({ getMasterValue }) => {
    const cycles = findCycles(n, (i, j) => getMasterValue(x[`${i}_${j}`]) > 0.5);
    if (cycles.length === 1 && cycles[0].length === n) {
      return null; // 全都市を回る単一ツアーが完成！最適解！
    }

    // 部分巡回を検出：最小の島 S に対する Benders 実行可能カットを生成
    const S = cycles.reduce((min, c) => (c.length < min.length ? c : min), cycles[0]);
    const secExpr = new LinExpr();
    for (const i of S) {
      for (const j of S) {
        if (i !== j) secExpr.addTerm(x[`${i}_${j}`], 1);
      }
    }
    return {
      kind: "feasibility",
      constraint: expr`${secExpr} <= ${S.length - 1}`,
    };
  },
});
```
