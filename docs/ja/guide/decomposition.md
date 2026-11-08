# 高度な分解法とベストプラクティス（列生成法・Benders分解）

混合整数計画法（MIP）では、問題構造によって単一のモデル（一体型定式化）の分枝限定法の探索木が大きくなり、求解に時間がかかる場合があります。
WaSHI では、子問題モデルを返す高レベルオーケストレーター（`master.solveColumnGeneration` / `master.solveBenders`）と、双対情報の取得やモデルの動的変更を行う低レベルの分解プリミティブを提供しています。

---

## なぜ分解法が必要なのか？（単一 MIP の課題）

単一の MIP 定式化で計算負荷が高くなりやすい典型的な問題構造は以下の2つです：

| 問題の構造・特徴 | 単一 MIP での課題 | 手法 | WaSHI の API |
| :--- | :--- | :--- | :--- |
| **対称性と緩い連続緩和**<br>*(カッティングストック、配送計画/VRP、シフト・乗務員スケジューリング)* | パターンの対称な順列が多く LP 連続緩和が緩いため、分枝限定法の探索木が大きくなる。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **連結変数と多段階決定構造**<br>*(巡回セールスマン/TSP、施設配置＋配送計画、2段階確率計画法)* | 1段目の投資/選択変数と多数のシナリオ・運用子問題変数が混在し、単一モデルの行列サイズが大きくなる。 | **Benders 分解**<br>*(ベンダーズ切除平面法)* | [`master.solveBenders()`](#benders-分解-solvebenders) |

---

## 基礎プリミティブ

WaSHI は、双対情報の取得やモデルの動的変更を行うためのプリミティブを提供しています：

### 1. 制約の双対変数（`dual`）
LP 求解後に、制約の右辺定数（RHS）を 1 単位変化させたときの目的関数への寄与（限界費用）を取得できます：

```typescript
m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

const c = m.getConstraintByName("capacity")!;
console.log(c.dual); // 双対変数 / シャドウプライス
console.log(m.solution?.duals.capacity);
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

### `pricing` コールバックによる列生成

制約の双対値（シャドウプライス）を受け取り、子問題を解いて（WaSHIモデルでも独自アルゴリズムでも可）改善列を返す `pricing` コールバックを渡します。WaSHI は被約費用を自動評価し、改善が見込める列を主問題へ動的に注入します：

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. 制限主問題（RMP）を素朴な初期パターンで普通に構築
const master = new Model("CuttingStockMaster");

const pA = master.integer("init_A", { lb: 0 }); // パターンA: ロール1本からAを2個（45*2 = 90 <= 100）
const pB = master.integer("init_B", { lb: 0 }); // パターンB: ロール1本からBを2個（36*2 = 72 <= 100）
const pC = master.integer("init_C", { lb: 0 }); // パターンC: ロール1本からCを6個（16*6 = 96 <= 100）

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
master.constraint(expr`6 * ${pC} >= 20`, "demand_C");
const [demandA, demandB, demandC] = master.constraints;

// 2. master.solveColumnGeneration() で求解
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 価格付け子問題（ナップサック問題）
    const sub = new Model("KnapsackPricing");
    const a_A = sub.integer("a_A", { lb: 0, ub: 2 });
    const a_B = sub.integer("a_B", { lb: 0, ub: 2 });
    const a_C = sub.integer("a_C", { lb: 0, ub: 6 });

    // 主問題の双対値を報酬として最大化
    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
    sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`);

    await sub.solve();

    // 生成された切り出しパターン（係数）を返却
    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(a_A.value ?? 0),
        demand_B: Math.round(a_B.value ?? 0),
        demand_C: Math.round(a_C.value ?? 0),
      },
    };
  },
});

console.log("最適な必要ロール本数:", result.objectiveValue); // 14本
console.log("実行された反復回数:", result.iterations);
console.log("動的生成された列数:", result.columnsAdded);
```

### 独自アルゴリズム（グラフ探索・動的計画法）での子問題求解

`pricing` は単なる関数ですので、子問題の求解にダイクストラ法や動的計画法などの独自アルゴリズムを自由に組み合わせられます：

```typescript
const result = await master.solveColumnGeneration({
  pricing: async ({ getDual }) => {
    // グラフ探索などの専用アルゴリズムで最適ルートを探索
    const route = solveSpecializedShortestPath(getDual);
    if (!route) return null;

    return {
      cost: route.distance,
      type: "Integer",
      coefficients: route.visitedCustomers,
    };
  },
});
```

---

## Benders 分解（`solveBenders`）

Benders 分解は問題を以下のように分割して解きます：
- **主問題（Master Problem）**: 連結変数（例：施設の開設有無などの 0-1 変数 $y$）と、子問題の推定費用を表す補助変数 $\theta \ge 0$ を持つ。
- **子問題（Subproblem）**: 主問題の暫定解 $y^*$ のもとで運用子問題を解き、**最適性カット（Optimality Cut）** を主問題へフィードバックする。

### 推奨：子問題モデルと `link()` による自動カット生成

子問題のコールバックで `Model` を返し、マスター変数との連結制約を `sub.link(...)` で指定すると、$\theta$ の管理・双対変数の抽出・Benders 最適性カットの生成が自動で行われます：

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

// 2. master.solveBenders() で求解
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

    // マスター変数 y1, y2 との連結制約を link で指定
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // モデルを返すとカット生成・theta管理が自動で行われる
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
  subproblem: async () => {
    const open1 = y1.value ?? 0;
    const open2 = y2.value ?? 0;
    const estTheta = theta.value ?? 0;

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      // 最適性カットを手動定義
      return {
        kind: "optimality",
        constraint: expr`${theta} - 50 * ${sub.solution!.duals.cap1} * ${y1} - 60 * ${sub.solution!.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // 収束（カット不要）
  },
});
```

---

## 応用例

分解法が用いられる代表的な問題例です：

### 1. 配送計画問題（CVRP: 容量制約付き配送計画） $\times$ 列生成法
*(完全な実行可能コード: [`examples/node/13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts))*

* **問題の構造**: 複数台の車両で顧客を巡回配送する問題では、訪問順序の全ルートをあらかじめ列挙すると変数が膨大になります。
* **列生成法による定式化**:
  * **主問題（Set Covering）**: 生成されたルート候補の中から、全顧客をカバーする最小台数・最小距離の組み合わせを選ぶ。
  * **子問題（Pricing / ナップサック問題）**: 顧客制約のシャドウプライス（双対変数）をもとに、車両積載容量を満たしつつ被約費用が負となる新規ルート（列）を動的に1本ずつ生成。

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
const visitConstrs = master.constraints;

// 2. 列生成法で求解
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    const sub = new Model("RoutePricing");
    const a: Record<string, Var> = {};
    const obj = new LinExpr();

    for (let i = 0; i < customers.length; i++) {
      const cust = customers[i];
      a[cust.id] = sub.binary(`v_${cust.id}`);
      obj.addTerm(a[cust.id], visitConstrs[i].dual ?? 0);
    }

    sub.objective(maximize(obj));

    // 車両の積載容量制約: sum(demand_i * a_i) <= vehicleCapacity
    const load = customers.reduce((acc, c) => acc.add(a[c.id].mul(c.demand)), new LinExpr());
    sub.constraint(expr`${load} <= ${vehicleCapacity}`);

    await sub.solve();

    const coefficients: Record<string, number> = {};
    for (const cust of customers) {
      coefficients[`visit_${cust.id}`] = Math.round(a[cust.id].value ?? 0);
    }

    return {
      cost: 1,
      type: "Integer",
      coefficients,
    };
  },
});

console.log("最適車両台数:", result.objectiveValue); // 3台
```

### 2. 巡回セールスマン問題（TSP） $\times$ Benders 分解（部分巡回除去）
*(完全な実行可能コード: [`examples/node/14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts))*

* **問題の構造**: 全都市を単一の閉路で巡回するための部分巡回除去制約（SECs）は、都市数 $n$ に対して $O(2^n)$ 個存在します。
* **Benders 分解（遅延カット生成 / DFJ法）による定式化**:
  * **主問題**: 各都市の入次数・出次数が1という割り当て緩和制約だけで解く。
  * **子問題**: 得られた経路グラフで連結成分を調べ、部分巡回 $S$ が見つかれば、それを禁止する Benders 実行可能カット（$\sum_{i,j \in S} x_{ij} \le |S| - 1$）を動的に主問題へ注入。

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
  subproblem: () => {
    const cycles = findCycles(n, (i, j) => (x[`${i}_${j}`].value ?? 0) > 0.5);
    if (cycles.length === 1 && cycles[0].length === n) {
      return null; // 全都市を回る単一ツアーが完成
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
