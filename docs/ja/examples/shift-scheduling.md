# スタッフのシフト作成と希望休の競合診断 (MIP + Z3)

**問題クラス:** 0-1 整数計画 (MIP) & SMT Unsat Core · **ソルバー:** HiGHS + Z3 · **主な API:** `m.addVars(staff, days)`, `sum()`, `m.check()`, `m.unsatCore`  
**[▶ シフト最適化をデモで開く](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling)** · **[▶ 希望休の衝突診断をデモで開く](https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat)** · **ソースコード:** [`examples/node/11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts)

シフトスケジューリングは業務 SaaS で最も需要の高い最適化タスクの1つですが、現場で必ず発生するのが**「スタッフの希望休が重なり、必要人数を満たせず解なし（Infeasible）になる」**という問題です。

単なる「解が見つかりませんでした」というエラーでは現場の管理者は困ってしまいます。WaSHI を使えば：
1. **通常時（HiGHS MIP）:** 日別の必要人数・シニアリーダー配置・週5日上限・希望休をすべて満たす最小コストのシフト表を高速生成。
2. **解なし発生時（Z3 `unsatCore`）:** 名前付き制約の中から、矛盾を引き起こしている制約の部分集合（例: `coverage_Sat` と土曜日に希望休を出した3名の制約）をピンポイントで特定し、UI 上で調整対象を案内できます。

<ShiftSchedulingDemo />

---

## WaSHI による実装

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

function buildShiftModel(name: string, dayOffRequests: Array<{ staff: string; day: Day }>) {
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
```

---

## 実行結果

### パート1: 希望休が分散している場合（HiGHS による最適シフト表生成）
```text
Part 1: Optimizing Weekly Roster with Balanced Day-Off Requests (HiGHS)...
Status: Optimal
Optimal Weekly Payroll Cost: $3830

Staff (Role)   |  Mon  Tue  Wed  Thu  Fri  Sat  Sun | Total
-----------------------------------------------------------
Alice (Sr)     |   ON    ·    ·   ON    ·    ·    · |   2/5
Bob (Sr)       |    ·   ON   ON    ·   ON   ON   ON |   5/5
Charlie (Jr)   |    ·   ON   ON   ON   ON    ·   ON |   5/5
Diana (Jr)     |   ON   ON    ·    ·   ON   ON    · |   4/5
Evan (Jr)      |   ON    ·   ON   ON   ON   ON    · |   5/5
```

### パート2: 土曜日に3名の希望休が重なった場合（Z3 `unsatCore` による衝突診断）
土曜日は3名必要（`coverage_Sat >= 3`）ですが、`Alice`, `Bob`, `Charlie` の3名が土曜日に希望休を出した場合、実行不能となります。Z3 で `check()` を実行すると、無関係な水曜日の希望休（`day_off_Diana_Wed`）を除外し、土曜日の衝突原因だけを抽出します（注: `unsatCore` は矛盾する部分集合を返しますが、最小性は保証されません）。

```text
Part 2: Diagnosing Infeasible Saturday Vacation Requests (Z3 Unsat Core)...
Feasibility Check Status: Unsat
⚠️ Conflicting Constraint Subset (unsatCore):
  ❌ coverage_Sat
  ❌ day_off_Alice_Sat
  ❌ day_off_Bob_Sat
  ❌ day_off_Charlie_Sat
```
