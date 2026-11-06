# 高度な分解法とベストプラクティス（列生成法・Benders分解）

混合整数計画法（MIP）は極めて柔軟で強力ですが、素朴な一体型定式化（Monolithic Formulation）では分枝限定法の探索木が爆発し、ソルバーの計算が停止・極度に遅延する構造的ボトルネックが存在します。
WaSHI では、オペレーションズ・リサーチ（OR）の確立されたベストプラクティスを非専門家でも手軽に扱えるよう、低レベルの分解プリミティブと高レベルオーケストレーター（`solveColumnGeneration` / `solveBenders`）を提供しています。

---

## なぜ分解法が必要なのか？（素朴な MIP が解けない理由）

汎用 MIP ソルバーが苦手とする典型的な問題構造は主に以下の2つです：

| 問題の構造・特徴 | 素朴な MIP が破綻する理由 | 確立されたベストプラクティス | WaSHI の API |
| :--- | :--- | :--- | :--- |
| **巨大な対称性と緩い連続緩和**<br>*(カッティングストック、ビンパッキング、配送計画/VRP、シフト・乗務員スケジューリング)* | パターンの対称な順列が無数に存在し、LP連続緩和が極めて緩いため、分枝限定法の探索木が指数関数的に爆発する。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **連結変数と多段階決定構造**<br>*(確率計画法、施設配置＋配送計画、容量投資計画)* | 1段目の投資/選択変数と、無数のシナリオ・運用子問題変数が混在し、単一モデルの行列サイズが巨大化する。 | **Benders 分解**<br>*(ベンダーズ切除平面法)* | [`solveBenders()`](#benders-分解-solvebenders) |

---

## 基礎プリミティブ

WaSHI は、双対情報の取得やモデルの動的変更を行うためのプリミティブを提供しています：

### 1. 制約のシャドウプライス / 双対変数（`dual` / `shadowPrice`）
LP 求解後に、制約の右辺定数（RHS）を 1 単位変化させたときの目的関数への寄与（限界費用）を取得できます：

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);        // 双対変数
console.log(c.shadowPrice); // c.dual のエイリアス
console.log(m.solution.duals.capacity);
```

### 2. 連続 LP 緩和（`model.relax()`）
分解アルゴリズムでは、双対変数を得るために整数制約を外した連続 LP 緩和を解く必要があります。`model.relax()` は、モデル内のすべての `Integer` および `Binary` 変数を上下限内の連続変数として一時的に緩和して求解します：

```typescript
// LP 緩和を解き、制約のシャドウプライスを m.solution.duals にセット
const status = await m.relax();
console.log("理論的双対下界/上界:", m.objectiveValue);
```

### 3. 動的な列追加（`model.column()`）
新しい決定変数の生成、目的関数への係数追加、および既存制約への寄与係数の注入を 1 回の呼び出しで実行します：

```typescript
const col = m.column({
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
2. 制約のシャドウプライス（双対値）を `pricing` コールバックに渡す。
3. `pricing` 内で子問題（ナップサック問題など）を解き、被約費用が負（改善可能）な候補パターン（$\bar{c} = \text{cost} - \sum \pi_i a_i < 0$）を返す。
4. 主問題に動的に列を追加し、改善する列がなくなるまで反復。
5. 最後に主問題を本来の整数問題（MIP）として解き、厳密な整数解を復元。

### 実装例：カッティングストック問題（CSP）

原反ロール（幅 $W = 100$）から、幅 45、36、16 の各アイテムの需要を満たすように切り出す最小本数を求めます：

```typescript
import { Model, expr, minimize, maximize, solveColumnGeneration } from "@ohtaman/washi";

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

// 単純な初期列（アイテムごとの単一カットパターン）を登録
master.column({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. 列生成法で自動求解
const result = await solveColumnGeneration({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual, reducedCostTolerance }) => {
    // 子問題：双対価値を最大化するナップサック問題
    const sub = new Model("KnapsackPricing");
    const a = {
      A: sub.integer("a_A", { lb: 0, ub: 2 }),
      B: sub.integer("a_B", { lb: 0, ub: 2 }),
      C: sub.integer("a_C", { lb: 0, ub: 6 }),
    };

    const dualA = getDual("demand_A");
    const dualB = getDual("demand_B");
    const dualC = getDual("demand_C");

    sub.objective(maximize(expr`${dualA} * ${a.A} + ${dualB} * ${a.B} + ${dualC} * ${a.C}`));
    sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

    await sub.solve();
    const maxDualValue = sub.objectiveValue ?? 0;
    const reducedCost = 1 - maxDualValue;

    // 主問題を改善できる負の被約費用を持つ列があれば追加
    if (reducedCost < -reducedCostTolerance) {
      return {
        cost: 1,
        type: "Integer",
        coefficients: {
          demand_A: Math.round(a.A.value ?? 0),
          demand_B: Math.round(a.B.value ?? 0),
          demand_C: Math.round(a.C.value ?? 0),
        },
        reducedCost,
      };
    }
    return null; // 最適な LP 緩和値に到達（反復終了）
  },
});

console.log("最適な必要ロール本数:", result.objectiveValue); // 14本
console.log("実行された反復回数:", result.iterations);
console.log("動的生成された列数:", result.columnsAdded);
```

---

## Benders 分解（`solveBenders`）

Benders 分解は問題を以下のように分割して解きます：
- **主問題（Master Problem）**: 連結変数（例：施設の開設有無などの 0-1 変数 $y$）と、子問題の推定費用を表す補助変数 $\theta \ge 0$ を持つ。
- **子問題コールバック（Subproblem）**: 主問題の暫定解 $y^*$ のもとで運用子問題を解き、**最適性カット（Optimality Cut）** または **実行可能性カット（Feasibility Cut）** を主問題へフィードバックする。

### 実装例：二段階容量制限付き施設配置問題

```typescript
import { Model, expr, minimize, solveBenders } from "@ohtaman/washi";

const master = new Model("BendersMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");
const theta = master.continuous("theta", { lb: 0 });

// 目的関数：施設開設固定費 + 推定運用輸送費 theta を最小化
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2} + ${theta}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "capacity_check");

const result = await solveBenders({
  master,
  gapTolerance: 1e-4,
  subproblem: async ({ getMasterValue }) => {
    const open1 = getMasterValue(y1);
    const open2 = getMasterValue(y2);
    const estTheta = getMasterValue(theta);

    // 施設開設状態を固定したもとで輸送コスト最小化の子問題を解く
    const sub = new Model("DispatchSubproblem");
    // ... 輸送変数や需要制約を定義 ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      // 子問題の双対値から Benders 最適性カットを構成
      const cut = expr`${theta} - 50 * ${sub.solution.duals.cap_F1} * ${y1} - 60 * ${sub.solution.duals.cap_F2} * ${y2} >= ${demandConstant}`;
      return {
        kind: "optimality",
        constraint: cut,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // 収束（カット不要）
  },
});

console.log("最適総費用:", result.objectiveValue);
console.log("追加されたカット数:", result.cutsAdded);
```
