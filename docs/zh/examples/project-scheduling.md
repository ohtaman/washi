# 资源受限项目调度 (CP / Pumpkin)

| 问题类别 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 约束规划 (RCPSP) / Unsat Core 诊断 | Pumpkin (`{ solver: "pumpkin" }`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=project_scheduling">Playground (项目调度)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=project_conflict_unsat">Playground (冲突诊断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">源代码</a></li><li><a href="/zh/guide/constraint-programming">CP 建模指南</a></li></ul> |

**资源受限项目调度问题（RCPSP）** 用于安排项目工序，目标是最小化最大完工时间，即 **Makespan**。模型需要同时满足工序先后依赖、单台设备独占以及团队人力上限。

借助内置的 **Pumpkin** 求解器（`{ solver: "pumpkin" }`，无需额外导入）：
1. 每道工序只需一个整数开始时间变量 `start[task]`，不必为每个 `(工序, 小时)` 组合创建 0-1 变量。
2. 当新增维护窗口或加急截止期导致 `"Infeasible"` 时，可直接在同一模型上调用 `m.check()` 提取冲突规则集合（`unsatCore`）。

## 问题背景

我们以 24 小时为开始时间上限（`horizon = 24`）安排 **6 项硬件原型工序**。团队同时在岗人数上限为 `crewCapacity = 3` 名工程师，并共用 1 台共享测试与校准台。

| 工序 | 耗时 | 所需人数 | 前置依赖 | 共享校准台 (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2人 | — | 否 |
| `board` | 3h | 2人 | — | 否 |
| `firmware` | 4h | 1人 | — | **是** |
| `assembly` | 3h | 2人 | `chassis`, `board` | 否 |
| `calib` | 3h | 1人 | `board` | **是** |
| `test` | 2h | 2人 | `assembly`, `firmware`, `calib` | **是** |

若忽略人力上限，`chassis` 和 `board` 可在 `0h` 同时启动，关键路径长度为 `9h`（`chassis 4h -> assembly 3h -> test 2h`）。但在 `crewCapacity = 3` 的限制下，各需 2 人的 `chassis` 与 `board` 无法并行（`2 + 2 = 4 > 3`）。两者串行执行会将 `assembly` 推迟至 `7h` 开始，使最短完工时间（Makespan）从 `9h` 增至 **`12h`**。

## WaSHI 实现代码

<CodeRunner preset="project_scheduling">

```typescript
import { Model, expr, disjoint, cumulative, max, and, minimize } from "@ohtaman/washi";

async function runProjectScheduling() {
  const horizon = 24;
  const crewCapacity = 3;
  const tasks = [
    { id: "chassis", duration: 4, crew: 2, usesRig: false },
    { id: "board", duration: 3, crew: 2, usesRig: false },
    { id: "firmware", duration: 4, crew: 1, usesRig: true },
    { id: "assembly", duration: 3, crew: 2, usesRig: false },
    { id: "calib", duration: 3, crew: 1, usesRig: true },
    { id: "test", duration: 2, crew: 2, usesRig: true },
  ] as const;

  const m = new Model("PrototypeRCPSP", { solver: "pumpkin" });
  const start = m.integer(tasks.map((t) => t.id), { lb: 0, ub: horizon, prefix: "start" });

  // 1. 先行依赖网络
  m.constraint(expr`${start.chassis} + 4 <= ${start.assembly}`, "assembly_after_chassis");
  m.constraint(expr`${start.board} + 3 <= ${start.assembly}`, "assembly_after_board");
  m.constraint(expr`${start.board} + 3 <= ${start.calib}`, "calib_after_board");
  m.constraint(expr`${start.assembly} + 3 <= ${start.test}`, "test_after_assembly");
  m.constraint(expr`${start.firmware} + 4 <= ${start.test}`, "test_after_firmware");
  m.constraint(expr`${start.calib} + 3 <= ${start.test}`, "test_after_calib");

  // 2. 共享测试与校准台独占 (disjoint) 与 3 人团队上限 (cumulative)
  m.constraint(
    disjoint(tasks.filter((t) => t.usesRig).map((t) => ({ start: start[t.id], duration: t.duration }))),
    "single_rig"
  );
  m.constraint(
    cumulative(
      tasks.map((t) => ({ start: start[t.id], duration: t.duration, demand: t.crew })),
      crewCapacity
    ),
    "crew_limit"
  );

  // 3. 最小化最大完工时间 (Makespan = max(start + duration))
  const makespan = max(tasks.map((t) => expr`${start[t.id]} + ${t.duration}`));
  m.objective(minimize(makespan));

  const status = await m.solve();
  const optMakespan = m.objectiveValue;
  const report = m.verify();
  console.log(`Status: ${status} (valid: ${report.valid}), Minimum Makespan: ${optMakespan}h`);
  for (const t of tasks) {
    const s = start[t.id].value ?? 0;
    console.log(`  ${t.id}: [${s}h, ${s + t.duration}h) crew=${t.crew}${t.usesRig ? " [Rig]" : ""}`);
  }

  // 4. 追加校准台维护时段 [0, 6)（限制 firmware 与 calib 至少在 6h 启动）与加急交付红线 <= 13h，诊断不可满足核心
  m.constraint(
    and(expr`${start.firmware} >= 6`, expr`${start.calib} >= 6`),
    "rig_maintenance_window"
  );
  m.constraint(expr`${makespan} <= 13`, "rush_ship_deadline");

  const diag = await m.check();
  console.log(`Deadline Check: ${diag.status}`);
  console.log(`Unsat Core: ${(diag.unsatCore ?? []).join(", ")}`);
}

runProjectScheduling();
```

</CodeRunner>

## 实践要点

### 用全局约束保持模型紧凑

在约束规划中，**全局约束**可直接描述作用于一组变量的常见调度规则。本例中，`disjoint()` 防止共享校准台上的工序重叠，`cumulative()` 将任意时刻的在岗人数限制在 3 人以内。由于开始时间采用有界整数而非按小时展开的 0-1 变量，即使拉长排程窗口或细化时间粒度，变量规模也不会膨胀。

### 调用 `m.check()` 前先保存 `m.objectiveValue`

在同一 `Model` 实例上运行 `await m.check()` 会清空此前 `solve()` 的结果，使 `m.objectiveValue` 重置为 `null`。请先将最优目标值保存到局部变量，再执行冲突诊断。

### 为何 `13h` 加急截止期无解（`unsatCore`）

加入维护时段和 `<= 13h` 的截止期约束后，`m.check()` 返回 `"Unsat"`，并在 `unsatCore` 中隔离出构成冲突的 5 条约束。即使 `crew_limit` 在前半部分是瓶颈，这类与本次冲突无关的规则也会被排除：

1. `rig_maintenance_window` 将 `firmware` 和 `calib` 的最早开始时间推迟至 `6h`。
2. 由于 `chassis` 耗时 `4h`、`assembly` 耗时 `3h`，`assembly_after_chassis` 与 `test_after_assembly` 将 `test` 的最早开始时间推迟至 `7h`。
3. 占用共享校准台的 3 项工序（`firmware` 4h、`calib` 3h、`test` 2h）均无法早于 `6h` 启动，且受 `single_rig` 限制必须串行消耗 `9h`。
4. 因此三项工序最早在 `6 + 9 = 15h` 才能全部完工，与 `rush_ship_deadline`（`<= 13h`）直接矛盾。
