# 矛盾診断 (`unsatCore`)・解の検証・デバッグ

モデルに解が見つからない（`"Infeasible"`）ときや、得られた解を本番で使う前に確認したいときのために、WaSHI は 4 つの診断ツールを提供しています。

- **矛盾診断（`m.check()`）**: どの名前付き制約同士が矛盾しているかを特定します。
- **解の独立検証（`m.verify()`）**: 得られた解が上下限・整数条件・制約を満たしているかを確認します。
- **数式の確認（`m.toLpString()`）**: CPLEX `.lp` 形式でモデルを出力し、係数・符号・制約名を確認します。
- **WebAssembly なしの単体テスト（`MockSolver`）**: CI などで固定の結果を即座に返してテストします。

---

## 矛盾している制約を特定する (`m.check()`)

`m.solve()` が `"Infeasible"` を返しても、「解がない」ことしか分からず、*どの制約同士が衝突しているか*までは分かりません。
原因を特定するには `m.check()` を呼び出します。
論理的な **充足不能コア（Unsat Core）**とは、同時に満たすことができない制約の部分集合を指し、他の制約をすべて取り除いてもなお矛盾が残る組み合わせです。

有界な整数・真偽値モデルでは `{ solver: "pumpkin" }`、`Continuous` 変数や小数を含むモデルでは `{ solver: "z3" }` を指定します。

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model();
const x = m.continuous("reserve", { lb: 0 });

// 制約に名前を付けて登録
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("矛盾している制約:", m.conflicts);
  // 出力: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

この例では、`routine_operating_cost` は直接の矛盾に関わらないため除外されます。
実際に衝突している `minimum_regulatory_reserve` と `budget_ceiling` だけが返ります。

> [!IMPORTANT]
> - **矛盾診断には `m.check()` を使う**: `m.solve()` は `"Infeasible"` しか返しません。`m.check()` は全ソルバーで `conflicts` を設定し、Pumpkin・Z3 では `unsatCore` も埋めます（HiGHS・GLPK では `undefined`）。
> - **診断したい制約には名前を付ける**: 変数の `lb`・`ub` には名前が付かず `conflicts` に出ません。上下限も診断したい場合は ``m.constraint(expr`...`, "rule_name")`` で登録してください。

### 診断用ソルバーの選び方

`m.solve()` が `"Infeasible"` になったあとは、変数の種類とスケール感度の要件に応じて次の 3 つから選びます。

| | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **向いているモデル** | 有界整数・真偽値のみのモデル | `Continuous` 変数や小数を含むモデル | 追加 import なしで手軽に確認したいとき |
| **準備・依存関係** | 同梱（`@ohtaman/washi/solvers/pumpkin`） | オプション（`z3-solver`） | 標準搭載（HiGHS）/ オプション（`glpk.js`） |
| **ブラウザ HTTP ヘッダー** | 不要 | `COOP` / `COEP` ヘッダー必須 | 不要 |
| **結果が入るフィールド** | `unsatCore` と `conflicts` | `unsatCore` と `conflicts` | `conflicts` のみ（`unsatCore` は `undefined`） |
| **返される内容** | 充足不能コア（同時に満たせない制約集合） | 充足不能コア（同時に満たせない制約集合） | 弾性緩和集合（緩めると解ける制約集合） |
| **単位スケールの影響** | 影響を受けない | 影響を受けない | 影響を受ける（数値が小さい制約ほど選ばれやすい） |

```typescript
// Pumpkin / Z3 を使う場合はファイルの先頭でインポートしてください:
// import "@ohtaman/washi/solvers/pumpkin";
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // 方法 1: 標準の HiGHS（追加 import 不要・数値スケールの影響あり）
  const diag = await m.check();
  console.error("緩和すると解ける制約:", diag.conflicts);

  // 方法 2: 同梱の Pumpkin（有界整数・真偽値向け / スケール非依存の Unsat Core）
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // 方法 3: Z3（Continuous 変数・小数に対応 / 要 z3-solver）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> **HiGHS が数値スケールの影響を受ける理由**: デフォルトの `m.check()` は、各名前付き制約に非負スラックを足して**無重みの緩和量合計**を最小化します。
> 人数 $\le 8$ と予算 $\le 50{,}000$ のように桁数が大きく異なる制約が混ざると、数値が小さい制約を緩める方が合計スラックがはるかに小さく済むため、そちらが優先的に選ばれます。
> 桁数に左右されない充足不能コアが必要な場合は、`pumpkin` か `z3` を使うか、制約の単位を揃えてください。

---

## 解を独立して検証する (`m.verify()`) {#verifying-solutions-m-verify}

求解後に `m.verify()` を呼ぶと、変数の上下限・整数条件・線形制約・論理制約が許容誤差内で満たされているかを独立してチェックできます。
`values` オプションに任意の解を渡せば、外部で生成した解の検証にも使えます。

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
    feasibilityTolerance: 1e-6, // 上下限・線形制約の許容誤差
    integralityTolerance: 1e-6, // Integer / Binary 変数の整数からの許容誤差
    evaluateLogicalConstraints: true,
  });

  console.log("Valid:", report.valid);
  console.log("Complete:", report.complete);
  console.log("Max violation:", report.maxViolation);
  console.log("Summary:", report.summary);

  if (!report.valid) {
    console.warn("Violations detected:", report.violations);
  }
}
```

### `VerificationReport` の主なフィールド

| フィールド | 型 | 内容 |
| :--- | :--- | :--- |
| `valid` | `boolean` | `complete === true` かつ `uncheckedConstraints` と `violations` が空のとき `true`。 |
| `complete` | `boolean` | すべての変数と制約を評価できたとき `true`。 |
| `maxViolation` | `number` | 検証した上下限・整数条件・制約の中で最大の違反量。 |
| `violations` | `VerificationViolation[]` | 検出された違反の一覧（上下限・整数条件・線形/論理制約・欠損値など）。 |
| `violationsByName` | `Record<string, VerificationViolation[]>` | 変数名または制約名ごとにまとめた違反一覧。 |
| `uncheckedConstraints` | `string[]` | 評価できなかった制約名の配列。 |
| `missingVariables` | `string[]` | 値が `null` または `undefined` だった変数名の配列。 |
| `summary` | `VerificationSummary` | チェック済み数と総数の集計。 |

---

## LP 形式の数式を確認する (`m.toLpString()`)

係数や符号、制約名が意図通りか確認したいときは、`m.toLpString()` で標準的な CPLEX `.lp` 形式の文字列を出力できます。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("DebugModel");
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`5 * ${x}`));
m.constraint(expr`2 * ${x} <= 15`, "resource_limit");

console.log(m.toLpString());
/*
Maximize
 obj: 5 x
Subject To
 resource_limit: 2 x <= 15
Bounds
 0 <= x <= 10
Generals
 x
End
*/
```

---

## WebAssembly なしで単体テストする (`MockSolver`)

モデルを構築・利用するアプリ側のロジックを単体テストするときは、`MockSolver` を使うと WebAssembly を読み込まずに固定の結果を即座に返せます。

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";

const mock = new MockSolver({
  status: "Optimal",
  objectiveValue: 420,
  values: { x: 10, y: 20 },
});

const m = new Model({ solver: mock });
const x = m.integer("x");
const y = m.integer("y");
m.objective(maximize(expr`10 * ${x} + 16 * ${y}`));

await m.solve();
console.log(m.objectiveValue); // 420
console.log(x.value, y.value); // 10, 20
```
