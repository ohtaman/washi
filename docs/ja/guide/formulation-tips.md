# 数理最適化の定式化パターン・Tips

これまでのモデリングガイド各ページでは WaSHI の API と機能（`Model`、`expr`、`m.constraint`、`m.solve` など）を解説しました。本ページでは、線形計画法（LP）や混合整数計画法（MIP）で頻出する一般的な数理最適化の定式化テクニックとソルバー運用の勘所をまとめています。

---

## 1. 変数・ドメインの定式化

### 半連続変数（$\{0\} \cup [L, U]$）

「生産しない場合は `0`、生産する場合は最小ロット $L = 10$ 以上かつ上限 $U = 100$ 以下」のように $\{0\} \cup [L, U]$ の範囲をとる半連続量は、連続変数 `batch` とバイナリ変数 `isActive` を連結制約（$L \cdot b \le x \le U \cdot b$）で結ぶことで表現できます：

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

急な欠員や需要変動で計画を作り直す際、[`initialValue`](./variables.md#初期値ヒント-ウォームスタート-initialvalue) に既存計画を渡すだけでは「探索開始点のヒント」になるだけであり、わずかな目的関数改善のために割当全体が大きく入れ替わることは防げません。

既存のバイナリ計画 $x_i^{\text{prev}} \in \{0, 1\}$ からの変更件数（ハミング距離）を抑えたい場合は、目的関数に**変更ペナルティ項**を追加します：

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

整数計画モデルで「施策 $A$ と施策 $B$ の両方を選んだとき（$x_A = 1$ かつ $x_B = 1$）だけシナジー効果や追加コストが発生する」といった積 $z_{AB} = x_A \cdot x_B$ を扱う場合、2次式のままにするのではなく、補助変数 $z_{AB} \in [0, 1]$ と以下の3本の線形不等式（McCormick / Fortet 線形化）に置き換えることで通常の MILP として高速に求解できます：

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

LP/MIP の目的関数には `Math.max(...)` を直接記述できません。残業時間や設備負荷の最大値を抑えて平準化する $\min \max_i (\text{load}_i)$ を表現するには、補助上限変数 $z$ を導入し、全要素に対して $\text{load}_i \le z$ を課したうえで $z$ を最小化します：

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

*（同様に、最小水準を最大化する **Max-Min 最適化** $\max \min_i u_i$ では、すべての $i$ について $u_i \ge z$ を課し、`m.objective(maximize(z))` を設定します。）*

---

## 3. 制約設計と数値安定性 {#constraint-design}

### ハード制約とソフト制約（スラック変数による緩和）

すべての業務目標を絶対条件（**ハード制約**）にすると、繁忙期や欠員時に1つでも条件を満たせない場合に解なし（`"Infeasible"`）となります。物理的・法的な絶対制約はハード制約とし、可能な限り守りたい目標は非負スラック変数（$s \ge 0$）とペナルティ重み $W$ を用いた**ソフト制約**として定式化します：

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
> **ペナルティ重み $W$ のスケーリング**: 重み $W$ は通常の単位コストより十分大きく（例：$10\sim 1{,}000$ 倍）設定しつつ、$10^{12}$ のような極端に巨大な値は避けてください。モデル内の最大係数と最小係数の比を $10^5\sim 10^6$ 以内に収めることで、ソルバーの浮動小数点数値安定性を保てます。

### 同一リソースの対称性除去（Symmetry Breaking）

同一スペックのトラック・箱（ビン）・並列機械が $K$ 台あるモデルでは、リソース番号を入れ替えた $K!$ 通りの等価な解が存在し、分枝限定法の探索木で鏡像の部分木が重複探索されて最適性証明が遅くなります。

「番号の若いリソースから順に使用する（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$）」という順序付け制約を追加することで、最適値を損なわずに探索空間を削減できます：

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

「総コスト（$f_1$）を抑えつつ、最大稼働時間の偏り（$f_2$）も小さくしたい」といった複数目的を扱うには、主に2つの手法があります：

- **重み付き和（1回で求解）**: スケールを揃えて ``minimize(expr`${totalCost} + 50 * ${maxHours}`)`` のように単一目的へ統合します。
- **辞書式（階層的）2段階最適化**: 第1目的に明確な優先順位がある場合は、まず第1目的で求解して最適値 $f_1^*$ を求め、次に $f_1 \le f_1^*$（または 1% の許容幅を持たせて $f_1 \le 1.01 f_1^*$）を制約として追加してから第2目的で再求解します：

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

組合せ最適化（MIP）では、探索開始から短時間で実用上十分な良質解（Incumbent）が見つかる一方、残りの 0.5% 未満のギャップを詰めて数学的な大域最適性を証明するまでに計算時間の大半が費やされる現象（**Tail-Off**）が頻発します。

対話型 UI やバッチ処理では、[`m.solve(options)`](./objectives.md#solve-options) の `timeLimit` と併せてビジネス上意味のある許容ギャップを設定することを推奨します：
- **`relGap: 0.01`**: 理論上の双対境界との相対差が **1% 以内**に入った時点で終了します。
- **`absGap: 100`**: 目的関数の単位（円やドルなど）において `|objectiveValue - objectiveBound| <= 100` となった時点で終了します。

---

## 5. 分解法における定式化の勘所 {#decomposition-tips}

[`solveColumnGeneration` や `solveBenders`](./decomposition.md) を用いる際の定式化上のポイントです：

1. **列生成法における集合被覆（`>= 1`）と集合分割（`== 1`）**:
   需要カバー制約を等式 `== 1`（集合分割）ではなく不等式 `>= 1`（集合被覆）で定式化すると、双対変数の符号が $\pi_i \ge 0$ に制限されて双対価格の正負振動が抑えられ、列生成の収束が安定・高速化します（三角不等式を満たす配送経路など、重複訪問をスキップしてもコストが増えない問題で有効です）。
2. **Price-and-Branch（`finalizeAsMIP: true`）と厳密な Branch-and-Price**:
   ルートノードの LP 緩和で生成された列プールに対して最後に1回 MIP を解く手法（`finalizeAsMIP: true`）は **Price-and-Branch（Restricted Master Heuristic）** と呼ばれ、Pricing 子問題内への分枝制約の組み込みを行わずに高精度な整数解を高速に得られます。
3. **Benders 分解・遅延制約におけるマルチカット分離**:
   TSP の部分巡回路除去のように、1回の暫定解から複数の違反コンポーネント（孤立サイクル）が見つかった場合、最小の1個だけでなく**すべての違反に対するカットを配列で一括返却**することで、主問題 MIP の再求解回数を大きく削減できます（実装例は [巡回セールスマン問題 (`examples/traveling-salesperson`)](../examples/traveling-salesperson.md) を参照）。
