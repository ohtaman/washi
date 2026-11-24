# スタッフのシフト作成と希望休の競合診断 (MIP + Z3)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 0-1 整数計画 (MIP) & SMT Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=shift_scheduling">Playground (シフト最適化)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=shift_conflict_unsat">Playground (衝突診断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts">ソースコード</a></li></ul> |

スタッフのシフト作成では、希望休が必要人数やシニア配置ルールと衝突し、混合整数計画（MIP）ソルバーが `"Infeasible"` を返すことがあります。

この例では、同じモデル上で最適解の探索と原因診断を組み合わせる手順を示します。
1. **まず HiGHS で最適化する:** 希望休と人員ルールを満たす最小人件費シフトを求めます。
2. **`"Optimal"` なら確定する:** 実行可能なシフトが得られたら、そのまま結果を表示して終了します。
3. **`"Infeasible"` のときだけ Z3 で診断する:** 同じモデルに `model.check({ solver: "z3" })` を実行し、矛盾する制約の部分集合（`unsatCore`）を抽出します。

> [!IMPORTANT]
> **希望休はハード制約です:**
> このモデルでは希望休を必須ルール（`shift[staff][day] == 0`）として設定しています。ペナルティ付きのソフト制約ではないため、人員要件と衝突すると `"Infeasible"` になります。

<ShiftSchedulingDemo />

## シナリオとルール設定

**5 名のスタッフ**（`Alice`, `Bob`, `Charlie`, `Diana`, `Evan`）に対し、`Mon`〜`Sun` の **7 日間**のシフトを作成します。

- **日別の最低必要人数:** `Mon`〜`Thu`: 3 名、`Fri`: 4 名、`Sat`: 3 名、`Sun`: 2 名。
- **シニア配置:** 毎日最低 1 名のシニア（`Alice` または `Bob`）が必要です。
- **週あたり勤務上限:** 各スタッフ週 5 日以内です。
- **週末手当:** `Sat`・`Sun` の勤務には基本日給に `+$30` を加算します。

次の 2 つのシナリオで動作を比較します。

| シナリオ | ハード希望休 | 結果 |
| :--- | :--- | :--- |
| **シナリオ A（実行可能）** | `Alice (Sun)`, `Bob (Mon)`, `Charlie (Sat)`, `Diana (Wed)` | HiGHS が `"Optimal"`（週間人件費 `$3,830`）を返します。 |
| **シナリオ B（衝突あり）** | `Alice (Sat)`, `Bob (Sat)`, `Charlie (Sat)`, `Diana (Wed)` | シニア 2 名とも土曜休みのため HiGHS が `"Infeasible"` を返し、Z3 が `unsatCore` を抽出します。 |

## WaSHI による実装

> [!NOTE]
> **Z3 の前提条件:** `@ohtaman/washi/solvers/z3` を使うには、オプションのピア依存パッケージ `z3-solver`（`npm install z3-solver`）が必要です。ブラウザ上で Z3 を実行する場合は `COOP` / `COEP` ヘッダーも必要になります（詳しくは [Cross-Origin Isolation](../getting-started/cross-origin.md) を参照してください）。

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof days)[number];

const staffList = [
  { name: "Alice",   isSenior: true,  dailyWage: 220, maxShifts: 5 },
  { name: "Bob",     isSenior: true,  dailyWage: 210, maxShifts: 5 },
  { name: "Charlie", isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Diana",   isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Evan",    isSenior: false, dailyWage: 150, maxShifts: 5 },
];

const requiredCoverage: Record<Day, number> = {
  Mon: 3, Tue: 3, Wed: 3, Thu: 3, Fri: 4, Sat: 3, Sun: 2,
};

function buildShiftModel(name: string, dayOffRequests: Array<{ staff: string; day: Day }>) {
  const m = new Model(name);

  // 2次元 0-1 変数: shift[staff][day] ∈ {0, 1}
  const shift = m.binary(staffList.map((s) => s.name), [...days]);

  // 目的関数: 週間人件費の最小化（土日は +$30 の週末手当）
  const costMatrix = Object.fromEntries(
    staffList.map((s) => [
      s.name,
      Object.fromEntries(
        days.map((d) => [d, s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0)])
      ),
    ])
  );
  m.objective(minimize(expr`dot(${costMatrix}, ${shift})`));

  // ルール1: 日別の最低必要人数
  for (const d of days) {
    m.constraint(
      expr`sum(${staffList}, ${(s) => shift[s.name][d]}) >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // ルール2: 毎日最低1名のシニアスタッフを配置
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constraint(
      expr`sum(${seniors}, ${(s) => shift[s.name][d]}) >= 1`,
      `senior_duty_${d}`
    );
  }

  // ルール3: 各スタッフの週あたり最大出勤日数（5日以内）
  for (const s of staffList) {
    m.constraint(
      expr`sum(${shift[s.name]}) <= ${s.maxShifts}`,
      `max_shifts_${s.name}`
    );
  }

  // ルール4: スタッフの希望休（厳格なハード制約: shift[staff][day] == 0）
  for (const req of dayOffRequests) {
    m.constraint(
      expr`${shift[req.staff][req.day]} == 0`,
      `day_off_${req.staff}_${req.day}`
    );
  }

  return { model: m, shift };
}

async function runScenario(
  title: string,
  modelName: string,
  dayOffRequests: Array<{ staff: string; day: Day }>
) {
  console.log(`=== ${title} ===`);
  console.log(
    "ハード制約としての希望休: " +
      dayOffRequests.map((r) => `${r.staff} (${r.day})`).join(", ")
  );

  const { model, shift } = buildShiftModel(modelName, dayOffRequests);

  // ステップ1: HiGHS による最適化
  const status = await model.solve();
  console.log(`HiGHS 最適化結果: ${status}`);

  if (status === "Optimal") {
    console.log(`最適週間人件費: $${model.objectiveValue}`);
    for (const s of staffList) {
      const schedule = days.map((d) => (shift[s.name][d].value === 1 ? "ON" : " ·"));
      console.log(`  ${s.name.padEnd(8)}: ${schedule.join(" ")}`);
    }
    console.log("シフト作成完了（不要な UNSAT 診断は実行しません）\n");
  } else if (status === "Infeasible") {
    // ステップ2: 解なしの場合のみ、同一モデル・制約のまま Z3 で診断
    console.log("HiGHS が Infeasible（解なし）を検出！Z3 unsatCore で原因制約を診断中...");
    const checkRes = await model.check({ solver: "z3" });
    console.log(`Z3 判定結果: ${checkRes.status}`);
    console.log("矛盾制約部分集合 (unsatCore):", model.unsatCore);
    console.log(
      "※ unsatCore は矛盾を引き起こす制約の部分集合を特定します（最小性や返却順は保証されません）。" +
      "無関係な Diana の水曜休みなどは core から除外されます。\n"
    );
  }
}

async function main() {
  // シナリオA: バランスの取れた希望休（実行可能）
  await runScenario(
    "シナリオA: バランスの取れた希望休（最適化成功）",
    "FeasibleRoster",
    [
      { staff: "Alice", day: "Sun" },
      { staff: "Bob", day: "Mon" },
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );

  // シナリオB: 土曜日に希望休が集中（解なし・診断）
  await runScenario(
    "シナリオB: 土曜日の希望休重複（解なし＆Z3診断）",
    "ConflictRoster",
    [
      { staff: "Alice", day: "Sat" }, // シニア
      { staff: "Bob", day: "Sat" },   // シニア
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );
}

main();
```

</CodeRunner>

## ソフト制約による希望休衝突の自動修復

Z3 の `unsatCore` で `senior_duty_Sat` と `day_off_Alice_Sat`・`day_off_Bob_Sat` の衝突が分かったら、代替案を自動生成できます。ハード制約を外し、希望休の日に出勤させた場合だけ目的関数へ `$500` のペナルティを加算する**ソフト制約**に切り替えます。

```typescript
// ソフト制約パターン: 希望休をハード制約にする代わりに、希望休の日に出勤した場合 +$500 のペナルティを課す
const requestedShiftVars = dayOffRequests.map((req) => shift[req.staff][req.day]);
m.objective(minimize(expr`dot(${costMatrix}, ${shift}) + 500 * sum(${requestedShiftVars})`));
```

シナリオ B でこのソフト制約モデルを解くと、HiGHS は総目的値 **`$4,330`**（人件費 `$3,830` + ペナルティ `$500`）で `"Optimal"` を返します。4 件中 3 件の希望休を守り、シニア 1 名の土曜希望休だけを調整します（HiGHS の出力では `Alice (Sat)`）。`Bob` はすでに上限（`maxShifts = 5`）の 5 日間勤務し、`Alice` が残り 2 日のシニア枠を担当します。そのため、`Alice (Sat)` と `Bob (Sat)` のどちらを調整しても最適コストは同じ `$4,330` です。

> [!TIP]
> このモデルの変数はすべて整数係数の 0-1 変数（`m.binary()`）です。同梱の `@ohtaman/washi/solvers/pumpkin` を読み込んで `await model.check({ solver: "pumpkin" })` を実行すれば、`z3-solver` なしでも `unsatCore` を抽出できます。
