# スタッフのシフト作成と希望休の競合診断 (MIP + Z3)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 0-1 整数計画 (MIP) & SMT Unsat Core | HiGHS + Z3 | `m.addVars(staff, days)`, `sum()`, `m.check()`, `m.unsatCore` | [Playground (シフト最適化)](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) · [Playground (衝突診断)](https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat) · [ソースコード](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |

シフトスケジューリングは業務 SaaS で最も需要の高い最適化タスクの1つですが、現場で必ず発生するのが**「スタッフの希望休が重なり、必要人数を満たせず解なし（Infeasible）になる」**という問題です。

単なる「解が見つかりませんでした」というエラーでは現場の管理者は困ってしまいます。WaSHI を使えば：
1. **通常時（HiGHS MIP）:** 日別の必要人数・シニアリーダー配置・週5日上限・希望休をすべて満たす最小コストのシフト表を高速生成。
2. **解なし発生時（Z3 `unsatCore`）:** 名前付き制約の中から、矛盾を引き起こしている制約の部分集合（例: `coverage_Sat` と土曜日に希望休を出した3名の制約）をピンポイントで特定し、UI 上で調整対象を案内できます。

<ShiftSchedulingDemo />

## WaSHI による実装

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, sum } from "@ohtaman/washi";
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

function buildShiftModel(name, dayOffRequests) {
  const m = new Model({ name, sense: "Minimize" });

  // 2次元 0-1 変数: shift[staff][day] (1 = 出勤, 0 = 休日)
  const shift = m.addVars(
    staffList.map((s) => s.name),
    [...days],
    { type: "Binary", prefix: "shift" }
  );

  // 目的関数: 週間人件費の最小化（土日は +$30 の週末手当）
  const costTerms = [];
  for (const s of staffList) {
    for (const d of days) {
      const cost = s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0);
      costTerms.push(shift[s.name][d].mul(cost));
    }
  }
  m.minimize(sum(costTerms));

  // ルール1: 日別の最低必要人数
  for (const d of days) {
    m.addConstraint(sum(staffList, (s) => shift[s.name][d]).ge(requiredCoverage[d]), `coverage_${d}`);
  }

  // ルール2: 毎日最低1名のシニアスタッフを配置
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.addConstraint(sum(seniors, (s) => shift[s.name][d]).ge(1), `senior_duty_${d}`);
  }

  // ルール3: 各スタッフの週あたり最大出勤日数（5日以内）
  for (const s of staffList) {
    m.addConstraint(sum([...days], (d) => shift[s.name][d]).le(s.maxShifts), `max_shifts_${s.name}`);
  }

  // ルール4: スタッフの希望休（shift[staff][day] <= 0）
  for (const req of dayOffRequests) {
    m.addConstraint(shift[req.staff][req.day].le(0), `day_off_${req.staff}_${req.day}`);
  }

  return { model: m, shift };
}

async function runShiftScheduling() {
  // パート1: 希望休が分散している場合（HiGHS による最適シフト表生成）
  const { model: m1 } = buildShiftModel("FeasibleRoster", [
    { staff: "Alice", day: "Sun" },
    { staff: "Bob", day: "Mon" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana", day: "Wed" },
  ]);
  const s1 = await m1.solve();
  console.log(`Part 1 (HiGHS): Status=${s1}, Optimal Weekly Payroll=$${m1.objectiveValue}`);

  // パート2: 土曜日に3名の希望休が重なった場合（Z3 unsatCore による衝突診断）
  const { model: m2 } = buildShiftModel("ConflictRoster", [
    { staff: "Alice", day: "Sat" },
    { staff: "Bob", day: "Sat" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana", day: "Wed" },
  ]);
  const res2 = await m2.check("z3");
  console.log(`Part 2 (Z3 Check): Status=${res2.status}`);
  console.log("Conflicting Constraint Subset (unsatCore):", m2.unsatCore);
}

runShiftScheduling();
```

</CodeRunner>
