# 资源受限项目调度 (CP / Pumpkin)

| 问题类别 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| CP / LCG (RCPSP 与 Unsat Core) | Pumpkin (`@ohtaman/washi/solvers/pumpkin`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=project_scheduling">Playground (项目调度)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=project_conflict_unsat">Playground (冲突诊断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">源代码</a></li><li><a href="/zh/guide/constraint-programming">CP 建模指南</a></li></ul> |

**资源受限项目调度问题 (RCPSP)** 在满足工序**先行依赖关系**的同时，还必须遵守**独占单台设备的不重叠限制（析取约束）**以及**共享团队人力上限（累积资源约束）**，目标是最小化总完工时间（Makespan）。

借助内置的 **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）求解器：
1. 每道工序只需**一个有限域整数开始时间变量**（`start[task]`），彻底免除 $O(|T| \cdot H)$ 规模的时间离散化二进制变量。
2. 当加入维护窗口或加急截止期导致无解时，无需在浏览器中配置 `COOP` / `COEP` 响应头，直接调用 `m.check()` 即可定位相互冲突的命名约束集合（`unsatCore`）。

## 问题背景

在 24 小时规划窗口内调度 **6 项硬件原型研发工序**（工程师总数上限 `crewCapacity = 3` 人，共享 1 台 HIL 联调校准台）：

| 工序 | 耗时 | 所需人数 | 前置依赖 | 共享校准台 (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2人 | — | 否 |
| `board` | 3h | 2人 | — | 否 |
| `firmware` | 4h | 1人 | — | **是** |
| `assembly` | 3h | 2人 | `chassis`, `board` | 否 |
| `calib` | 3h | 1人 | `board` | **是** |
| `test` | 2h | 2人 | `assembly`, `firmware`, `calib` | **是** |

若忽略人力上限，仅看关键路径只需 `9h`（`chassis 4h -> assembly 3h -> test 2h`）；但在 `crewCapacity = 3` 人限制下，每项需 2 人的 `{chassis, board, assembly}` 无法重叠并行，因此真正的最小总完工时间为 **`12h`**。

## WaSHI 实现代码

<CodeRunner preset="project_scheduling">

```typescript
import { Model, expr, disjoint, cumulative, max, and, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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

  // 2. 独占校准台 (disjoint) 与 3 人团队累积上限 (cumulative)
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

  // 4. 追加校准台维护时段 [0, 6) 与加急交付红线 <= 13h，诊断不可满足核心
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

- **原生全局传播器优势**：在有界整数开始时间上直接联合使用 `disjoint`（边缘检测）与 `cumulative`（时间表过滤），使 Pumpkin 能够通过惰性子句生成直接学习资源瓶颈原因，而不受离散时间步长爆炸困扰。
- **在 `m.check()` 前保留求解结果**：在同一 `Model` 实例上执行 `await m.check()` 会清空此前 `solve()` 的目标值与变量取值字段，因此请先保存最优化结果后再运行冲突诊断。
- **免 `COOP` / `COEP` 的纯前端 `unsatCore`**：第二阶段的 `diag.unsatCore` 会排除无关的 `crew_limit`，准确锁定校准台维护窗（`firmware >= 6`、`calib >= 6`）、`assembly -> test` 链（`test >= 7`）、`single_rig` 累计耗时 9h（完工 $\ge 15 > 13$）与 `rush_ship_deadline` 之间的矛盾。
