# スタッフのシフト作成と希望休の競合診断 (MIP + Z3)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 0-1 整数計画 (MIP) & SMT Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `m.constraint()`, `expr`, `minimize`, `dot`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_scheduling">Playground (シフト最適化)</a></li><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat">Playground (衝突診断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts">ソースコード</a></li></ul> |

シフトスケジューリングは業務 SaaS で最も需要の高い最適化タスクの1つですが、現場で必ず発生するのが**「スタッフの希望休が重なり、必要人数やリーダー要件を満たせず解なし（Infeasible）になる」**という問題です。

単なる「解が見つかりませんでした」というエラーでは現場の管理者は困ってしまいます。この例では、実務に即した以下の流れ（ワークフロー）を示します：

1. **まずは HiGHS による最適化を実行:** 指定された希望休や業務ルールのもとで、最小人件費のシフト表作成を試みます。
2. **解が得られれば（Optimal）確定:** 実行可能であればシフト表と最適人件費を出力し、不要な診断処理は行いません。
3. **解なし（Infeasible）時のみ Z3 `unsatCore` で診断:** HiGHS が解なしと判定した場合に限り、**同一の入力・制約のまま** Z3 で充足可能性を検証し、矛盾を引き起こしている制約の部分集合（`unsatCore`）を抽出して「どの必要人数枠と誰の希望休が衝突したか」を特定します。

> [!IMPORTANT]
> **希望休はハード制約としてモデル化されています:**
> 本モデルにおいて、希望休は厳格に遵守すべきハード制約（`shift[staff][day] == 0`）として設定されています。ソフト制約としてのペナルティ緩和ではありません。そのため、希望休と現場要件が両立しない場合は厳密に `Infeasible`（実行不可能）となります。

<ShiftSchedulingDemo />

## シナリオとルール設定

**5名のスタッフ**（`Alice`, `Bob`, `Charlie`, `Diana`, `Evan`）の**7日間**（`Mon`〜`Sun`）のシフトを作成します：

- **日別の最低必要人数:** `Mon`〜`Thu`: 3名、`Fri`: 4名、`Sat`: 3名、`Sun`: 2名
- **シニアリーダー配置:** 毎日最低1名のシニアスタッフ（`Alice` または `Bob`）の配置が必須
- **週あたり最大勤務日数:** 各スタッフ週5日以内
- **週末手当:** 週末（`Sat`, `Sun`）の出勤には基本日給に加えて `+$30` の手当が加算

本例では、入力条件の違いを明確にするため、独立した**2つの名前付きシナリオ**を評価します：
- **シナリオA（バランスの取れた希望休 — 実行可能）:** Alice (日), Bob (月), Charlie (土), Diana (水)。すべての条件を同時に満たすことができ、HiGHS が最適シフト表を出力します。
- **シナリオB（土曜日の希望休重複 — 解なし＆原因診断）:** Alice (土), Bob (土), Charlie (土), Diana (水)。シニアリーダー2名（Alice, Bob）が両名とも土曜休みを申請しているため、「毎日シニア1名必須」の条件を満たせなくなります。HiGHS は `Infeasible` を返し、同一モデルのまま Z3 による原因診断が起動します。

## WaSHI による実装

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, sum, dot, minimize, expr } from "@ohtaman/washi";
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
  m.objective(minimize(dot(costMatrix, shift)));

  // ルール1: 日別の最低必要人数
  for (const d of days) {
    m.constraint(
      expr`${sum(staffList, (s) => shift[s.name][d])} >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // ルール2: 毎日最低1名のシニアスタッフを配置
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constraint(
      expr`${sum(seniors, (s) => shift[s.name][d])} >= 1`,
      `senior_duty_${d}`
    );
  }

  // ルール3: 各スタッフの週あたり最大出勤日数（5日以内）
  for (const s of staffList) {
    m.constraint(
      expr`${sum(days, (d) => shift[s.name][d])} <= ${s.maxShifts}`,
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
      const schedule = days.map((d) => (Math.round(shift[s.name][d].value ?? 0) === 1 ? "ON" : " ·"));
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
