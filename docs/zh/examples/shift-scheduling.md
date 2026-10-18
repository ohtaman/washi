# 员工排班与休假冲突诊断 (MIP + Z3)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 0-1 混合整数规划 (MIP) & SMT 不可满足核 | HiGHS + Z3 | `m.binary(staff, days)`, `m.constraint()`, `expr`, `minimize`, `dot`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_scheduling">演练场 (排班优化)</a></li><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat">演练场 (冲突诊断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts">源代码</a></li></ul> |

员工排班是企业 SaaS 与劳动力管理系统中混合整数规划（MIP）的经典落地场景。然而在实际业务中，**员工提交的休假申请经常会与每日最低到岗人数或资深员工值班要求发生冲突**，导致求解器返回无解（`Infeasible`）。

仅提示“无法生成排班表”会让现场排班主管无所适从。本示例展示了一套实用的生产级工作流：
1. **首先执行 HiGHS MIP 优化：** 在给定的休假申请与排班规则下，尝试求解人工成本最低的排班方案。
2. **若有最优解（Optimal）则直接采纳：** 如果存在可行排班表，直接输出排班结果与最小薪资成本，不产生任何额外的诊断开销。
3. **仅在无解（Infeasible）时调用 Z3 `unsatCore` 进行冲突诊断：** 若 HiGHS 判定无解，则使用 Z3 对**完全相同的模型与约束**进行可满足性检查，提取引发矛盾的约束子集（`unsatCore`），精准定位是哪一天的到岗要求与哪几位员工的休假申请发生了冲突。

> [!IMPORTANT]
> **休假申请被建模为硬约束（Hard Constraints）：**
> 在本模型中，员工的休假申请被作为必须严格满足的硬约束（`shift[staff][day] == 0`）执行，而非带有惩罚项的软约束松弛。当休假申请与强制性到岗规则无法同时满足时，模型将严格判定为不可行（`Infeasible`）。

<ShiftSchedulingDemo />

## 场景与排班规则

我们需要为 **5 名员工**（`Alice`、`Bob`、`Charlie`、`Diana`、`Evan`）制定一周 **7 天**（`Mon`–`Sun`）的排班表：

- **每日最低到岗人数：** `Mon–Thu`：3 人，`Fri`：4 人，`Sat`：3 人，`Sun`：2 人。
- **资深主管值班：** 每天至少需要 1 名资深员工（`Alice` 或 `Bob`）在岗值班。
- **每周最大出勤天数：** 每名员工每周最多工作 **5 天**。
- **周末值班补贴：** 周末班次（`Sat`、`Sun`）在基础日薪之上额外增加 `+$30` 补贴。

为了展示完整的工作流，我们评估两个具有不同休假输入的独立命名场景：
- **场景 A（均衡的休假申请 — 可行）：** Alice (周日)、Bob (周一)、Charlie (周六)、Diana (周三)。所有排班约束均可同时满足，HiGHS 输出最优排班表。
- **场景 B（冲突的周六休假申请 — 无解与冲突诊断）：** Alice (周六)、Bob (周六)、Charlie (周六)、Diana (周三)。由于两名资深员工（Alice 和 Bob）同时申请周六休假，“每天至少 1 名资深员工在岗”的规则无法满足。HiGHS 返回 `Infeasible`，随即触发 Z3 冲突诊断。

## WaSHI 实现

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

  // 二维 0-1 变量矩阵: shift[staff][day] ∈ {0, 1}
  const shift = m.binary(staffList.map((s) => s.name), [...days]);

  // 目标函数: 通过二维点积最小化每周总薪资成本（周末含 +$30 补贴）
  const costMatrix = Object.fromEntries(
    staffList.map((s) => [
      s.name,
      Object.fromEntries(
        days.map((d) => [d, s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0)])
      ),
    ])
  );
  m.objective(minimize(dot(costMatrix, shift)));

  // 规则 1: 每日最低到岗人数要求
  for (const d of days) {
    m.constraint(
      expr`${sum(staffList, (s) => shift[s.name][d])} >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // 规则 2: 每天至少安排 1 名资深员工值班
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constraint(
      expr`${sum(seniors, (s) => shift[s.name][d])} >= 1`,
      `senior_duty_${d}`
    );
  }

  // 规则 3: 每名员工每周的最大出勤天数
  for (const s of staffList) {
    m.constraint(
      expr`${sum(days, (d) => shift[s.name][d])} <= ${s.maxShifts}`,
      `max_shifts_${s.name}`
    );
  }

  // 规则 4: 将命名的休假申请作为硬约束 (shift[staff][day] == 0)
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
    "硬约束休假申请: " +
      dayOffRequests.map((r) => `${r.staff} (${r.day})`).join(", ")
  );

  const { model, shift } = buildShiftModel(modelName, dayOffRequests);

  // 步骤 1: 使用 HiGHS 求解排班优化
  const status = await model.solve();
  console.log(`HiGHS 求解状态: ${status}`);

  if (status === "Optimal") {
    console.log(`最优周薪总额: $${model.objectiveValue}`);
    for (const s of staffList) {
      const schedule = days.map((d) => (Math.round(shift[s.name][d].value ?? 0) === 1 ? "ON" : " ·"));
      console.log(`  ${s.name.padEnd(8)}: ${schedule.join(" ")}`);
    }
    console.log("排班求解成功（无需执行 UNSAT 冲突诊断）。\n");
  } else if (status === "Infeasible") {
    // 步骤 2: 仅当无解时，使用 Z3 对完全相同的模型和约束进行诊断
    console.log("HiGHS 返回 Infeasible（无解）！正在使用 Z3 unsatCore 诊断冲突原因...");
    const checkRes = await model.check({ solver: "z3" });
    console.log(`Z3 判定状态: ${checkRes.status}`);
    console.log("冲突约束子集 (unsatCore):", model.unsatCore);
    console.log(
      "注: unsatCore 返回引发冲突的约束子集（不保证极小性或返回顺序）。" +
      "与冲突无关的申请（如 Diana 的周三休假）已被排除在核心之外。\n"
    );
  }
}

async function main() {
  // 场景 A: 均衡的休假申请（可求解）
  await runScenario(
    "场景 A: 均衡的休假申请",
    "FeasibleRoster",
    [
      { staff: "Alice", day: "Sun" },
      { staff: "Bob", day: "Mon" },
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );

  // 场景 B: 周六休假申请冲突（无解并诊断）
  await runScenario(
    "场景 B: 冲突的周六休假申请",
    "ConflictRoster",
    [
      { staff: "Alice", day: "Sat" }, // 资深员工
      { staff: "Bob", day: "Sat" },   // 资深员工
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );
}

main();
```

</CodeRunner>
