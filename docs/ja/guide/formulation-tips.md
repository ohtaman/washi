# 数理最適化の定式化パターン・Tips

これまでのモデリングガイド各ページでは、WaSHI の基本 API（`Model`, `expr`, `m.constraint`, `m.solve`）を解説しました。
本ページでは、線形計画（LP）や混合整数線形計画（MILP）でよく使う定式化パターンとソルバー運用のコツをまとめています。
Pumpkin を使った制約プログラミング（`disjoint`, `cumulative`, `distinct`, `allowed`, `at`）の定式化は、[制約プログラミング (CP) モデリングガイド](./constraint-programming.md) を参照してください。

---

## 1. 変数・ドメインの定式化

### 半連続変数（$\{0\} \cup [L, U]$）

半連続量は、非稼働なら `0`、稼働するなら正の区間 `[L, U]` 内の値をとる変数です。
たとえば、生産しない場合は `0`、生産する場合は最小ロット $L = 10$ 以上・上限 $U = 100$ 以下といった条件が該当します。

連続変数 `batch` とバイナリ変数 `isActive` を連結制約（$L \cdot b \le x \le U \cdot b$）で結ぶと表現できます。

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SemiContinuousBatch");
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// isActive === 0 なら batch = 0、isActive === 1 なら batch は [10, 100] の範囲
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

### 計画変更の最小化（ハミング距離ペナルティ）とウォームスタートの違い {#minimal-perturbation}

急な欠員や需要変動で計画を作り直す際、[`initialValue`](./variables.md#初期値ヒント-ウォームスタート-initialvalue) に既存計画を渡すだけでは探索開始点のヒントにしかなりません。
わずかな目的関数改善のために割当全体が大きく入れ替わることは防げません。

既存のバイナリ計画 $x_i^{\text{prev}} \in \{0, 1\}$ からの変更件数（**ハミング距離**）を抑えたい場合は、目的関数に変更ペナルティ項を加えます。

$$\text{Changes} = \sum_{i:\, x_i^{\text{prev}} = 0} x_i + \sum_{i:\, x_i^{\text{prev}} = 1} (1 - x_i)$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("StableReschedule");
const prevPlan = [1, 0, 1, 0];
const x = prevPlan.map((prev, i) =>
  m.binary(`slot_${i}`, { initialValue: prev })
);

// 既存計画 prevPlan から反転（0→1 または 1→0）した項のリスト
const flipTerms = x.map((v, i) => (prevPlan[i] === 1 ? expr`1 - ${v}` : v));

// 合計 3 枠以上を確保しつつ、既存計画からの変更件数を最小化
m.constraint(expr`sum(${x}) >= 3`, "min_active_slots");
m.objective(minimize(expr`5 * sum(${flipTerms})`));
```

---

## 2. 非線形項の線形化

### バイナリ変数同士の積（$x_A \cdot x_B$）の線形化 {#binary-product}

整数計画で、2つのバイナリ決定 $x_A, x_B \in \{0, 1\}$ が**両方 `1`** のときだけシナジー効果や追加コストが発生する場合を考えます。
2次式のままにせず、補助変数 $z_{AB} \in [0, 1]$ と次の3本の線形不等式（Fortet / McCormick 線形化）に置き換えると、純粋な MILP のまま高速に解けます。

$$z_{AB} \le x_A, \quad z_{AB} \le x_B, \quad z_{AB} \ge x_A + x_B - 1$$

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("BinaryProductLinearization");
const xA = m.binary("xA");
const xB = m.binary("xB");
// xA, xB がバイナリであれば、bothAB は連続変数 [0, 1] でも自動的に {0, 1} をとります
const bothAB = m.continuous("both_AB", { lb: 0, ub: 1 });

m.constraint(expr`${bothAB} <= ${xA}`, "and_upper_A");
m.constraint(expr`${bothAB} <= ${xB}`, "and_upper_B");
m.constraint(expr`${bothAB} >= ${xA} + ${xB} - 1`, "and_lower_AB");

m.objective(maximize(expr`10 * ${xA} + 10 * ${xB} + 5 * ${bothAB}`));
```

### Min-Max / Max-Min 目的関数（負荷平準化）

WaSHI 組み込みの `max(...)` と `min(...)` は、HiGHS・GLPK 向けの純粋な線形不等式や Pumpkin のネイティブ制約へ自動変換されます。
詳細は [区分線形関数・インデックス参照](./expressions.md#piecewise-linear) を参照してください。

第4節の辞書式2段階最適化のように共通上限変数 $z$ を後続の制約でも参照したい場合は、**エピグラフ定式化**を明示的に書きます。
すべての負荷に $\text{load}_i \le z$ を課して $z$ を最小化します（最小値を最大化する Max-Min では $u_i \ge z$ として $z$ を最大化します）。

$$\min z \quad \text{subject to} \quad \text{load}_i \le z \quad \forall i$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("MinMaxLoadBalancing");
const workers = ["Alice", "Bob", "Carol"] as const;
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

// 各担当者の稼働時間を共通上限 maxHours 以下に抑える
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));
m.constraint(expr`sum(${hours}) >= 60`, "total_required_work");

// maxHours を最小化することで 60 時間が均等配分（各 20 時間）される
m.objective(minimize(maxHours));
```

---

## 3. 制約設計と数値安定性 {#constraint-design}

### ハード制約とソフト制約（スラック変数による緩和）

すべての業務目標を絶対条件（**ハード制約**）にすると、需要が供給を少しでも超えた瞬間に `"Infeasible"` になります。
物理的・法的な制約はハード制約に残し、柔軟に調整できる目標は非負のスラック変数（$s \ge 0$）とペナルティ重み $W$ を使った**ソフト制約**にします。

| 制約の種類 | ハード制約 | ソフト制約（緩和後, $s \ge 0$） | 目的関数へのペナルティ項（最小化） |
| :--- | :--- | :--- | :--- |
| **下限制約** | $\text{lhs} \ge b$ | $\text{lhs} + s_{\text{short}} \ge b$ | $+ W \cdot s_{\text{short}}$ |
| **上限制約** | $\text{lhs} \le b$ | $\text{lhs} - s_{\text{excess}} \le b$ | $+ W \cdot s_{\text{excess}}$ |
| **目標等式** | $\text{lhs} = b$ | $\text{lhs} + s_{\text{short}} - s_{\text{excess}} = b$ | $+ W_1 \cdot s_{\text{short}} + W_2 \cdot s_{\text{excess}}$ |

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("SoftConstraintCoverage");
const assignedStaff = m.integer("assigned_staff", { lb: 0, ub: 4 }); // 出勤可能上限は 4 名
const shortage = m.continuous("shortage", { lb: 0 });                // 不足人数を表す非負スラック変数 (s >= 0)

// ソフト制約: 目標は 5 名だが、不可能な場合は shortage > 0 を許容して解を返す
m.constraint(expr`${assignedStaff} + ${shortage} >= 5`, "target_5_staff");

// 通常コスト (100) より十分大きいペナルティ重み (1000) を不足分に課す
m.objective(minimize(expr`100 * ${assignedStaff} + 1000 * ${shortage}`));

await m.solve();
// assignedStaff.value === 4, shortage.value === 1（Infeasible にならず最善の妥協解が得られる）
```

> [!TIP]
> **ペナルティ重み $W$ のスケーリング**: $W$ は通常の単位コストより十分大きく（目安は $10\sim 1{,}000$ 倍）設定し、$10^{12}$ のような極端な値は避けてください。
> モデル内の最大係数と最小係数の比を $10^5\sim 10^6$ 以内に収めると、LP・MIP ソルバーの浮動小数点精度を保てます。

### 同一リソースの対称性除去（Symmetry Breaking）

同一スペックのトラック・箱・並列機械が $K$ 台あるモデルでは、リソース番号を入れ替えた $K!$ 通りの等価な解が生じます。
対称性除去を入れないと、MIP ソルバーが分枝限定木で鏡像の部分木を重複探索し、最適性証明が遅くなります。

番号の若いリソースから順に使う順序制約（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$）を加えると、最適値を保ったまま探索空間を削減できます。

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SymmetryBreaking");
const numTrucks = 4;
const truckUsed = m.binary(numTrucks, { prefix: "truck_used" });

// トラック k が使用されているときだけトラック k+1 の使用を許可する
for (let k = 0; k < numTrucks - 1; k++) {
  m.constraint(
    expr`${truckUsed[k]} >= ${truckUsed[k + 1]}`,
    `order_truck_${k}`
  );
}
```

---

## 4. 多目的最適化と MIP 終了条件の設計 {#multi-objective}

### 多目的最適化（重み付き和 vs. 辞書式2段階最適化）

総コスト $f_1$ を抑えつつ最大稼働時間 $f_2$ も小さくしたい場合など、複数目的を扱う主な手法は次の2つです。

- **重み付き和（1回で求解）**: スケールを揃えて ``minimize(expr`${totalCost} + 50 * ${maxHours}`)`` のように単一目的へ統合します。
- **辞書式2段階最適化**: まず第1目的 $f_1$ の最適値 $f_1^*$ を求め、許容幅付きの制約で $f_1$ を固定した上で第2目的 $f_2$ を再求解します。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("LexicographicTwoStage");
const workers = ["Alice", "Bob"] as const;
const wage = { Alice: 20, Bob: 20 };
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

const totalCost = expr`dot(${wage}, ${hours})`;
m.constraint(expr`sum(${hours}) >= 40`, "required_hours");
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));

// 第1段階: 最優先の目的（総人件費）を最小化
m.objective(minimize(totalCost));
await m.solve();
const minCost = m.objectiveValue!;

// 第2段階: コスト増加を最大 1% 以内に抑える制約を追加し、最大稼働時間を平準化
m.constraint(expr`${totalCost} <= ${minCost * 1.01}`, "near_optimal_cost");
m.objective(minimize(maxHours));
await m.solve();
```

### MIP の Tail-Off と終了許容ギャップの設計

組合せ MIP では、開始数秒で実用上十分な**暫定解（Incumbent）**が見つかる一方、残りわずかなギャップの証明に大半の時間がかかる現象（**Tail-Off**）がよく起こります。

対話型 UI やバッチ処理では、[`m.solve(options)`](./objectives.md#solve-options) の `timeLimit` と併せて実用的な許容ギャップを設定してください。

- **`relativeGap: 0.01`**: 双対境界との相対差が **1% 以内**に入った時点で終了します。
- **`absoluteGap: 100`**: 目的関数の単位で `|objectiveValue - objectiveBound| <= 100` になった時点で終了します。

---

## 5. 分解法における定式化の勘所 {#decomposition-tips}

[`solveColumnGeneration` や `solveBenders`](./decomposition.md) を使う際は、次の3つの工夫で収束性と解品質を高められます。

### 列生成法における集合被覆（`>= 1`）と集合分割（`== 1`）

需要カバー制約を等式 `== 1` ではなく不等式 `>= 1`（集合被覆）で書くと、双対価格が $\pi_i \ge 0$ に制限されます。
これにより双対価格の正負振動が抑えられ、三角不等式を満たす配送計画など重複訪問を削ってもコストが増えない問題で収束が安定・高速化します。

### Price-and-Branch（`finalizeAsMIP: true`）と厳密な Branch-and-Price

ルートノードの LP 緩和で集めた列プールに対して最後に1回 MIP を解く手法（`finalizeAsMIP: true`）を **Price-and-Branch** と呼びます。
分枝限定木の各ノードで列生成を繰り返す厳密な **Branch-and-Price** と異なり、価格付け子問題に分枝制約を組み込まずに高精度な整数解を高速に得られます。

### Benders 分解・遅延制約におけるマルチカット分離

分離コールバックが1つの候補解から複数の孤立サイクルや違反コンポーネントを見つけた場合は、**すべての違反に対するカットを配列で一括返却**してください。
1反復で複数のカットを加えることで、主問題 MIP の再求解回数を大きく減らせます（実装例：[巡回セールスマン問題](../examples/traveling-salesperson.md)）。
