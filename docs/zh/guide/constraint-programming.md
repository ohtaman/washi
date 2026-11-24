# 约束规划 (CP) 建模

WaSHI 支持用同一套 TypeScript API（`Model`, `expr`, `sum`, `dot`）编写**数学规划（LP / MIP / QP）**和**约束规划（CP）**模型。
使用内置的 **Pumpkin** 求解器（`@ohtaman/washi/solvers/pumpkin`）时，排班调度、资源容量限制、互不相同（`distinct`）和查表约束会直接求解，无需转换成庞大的 0-1 矩阵。

---

## 1. 何时使用 CP (`Pumpkin`) 与 MIP (`HiGHS`)

在 **MIP (`HiGHS` / `GLPK`)** 中，通常需要为每个任务和每个时间槽创建 0-1 变量 $x_{i,t} \in \{0, 1\}$。这种方式适合连续流和线性预算，但时间粒度变细或组合增多时变量数会急剧膨胀。

在 **CP (`Pumpkin`)** 中，您可以直接用有界整数变量表示“选哪个时刻”或“选哪台机器”（例如 `start[task]` 取值 `[0, 20]`），并用高层约束把它们连接起来：

| 建模需求 | MIP (`HiGHS` / `GLPK`) | CP (`Pumpkin`) |
| :--- | :--- | :--- |
| **决定开始时间** | 每个任务×时间槽一个 0-1 变量 | 每个任务一个整数变量 `start[i]` |
| **任务禁止重叠** | 成对顺序变量 + Big-M 不等式 | `disjoint(tasks)` |
| **共享人力/设备容量** | 每个时间步生成一条求和约束 | `cumulative(tasks, capacity)` |
| **一对一分配** | 二维 0-1 分配矩阵 | `machine[i]` + `distinct(machine)` |
| **按选择查表计费** | 0-1 选择变量加权求和 | `at(costs, indexVar)` |
| **最适合的问题** | 连续流、配比、二次目标、对偶价格 | 排程调度、资源上限、排列分配、兼容表 |

> [!TIP]
> 如果模型包含 `Continuous` 变量、小数系数或二次目标函数，请使用 `HiGHS`（含连续变量的逻辑规则请用 `Z3`）。如果问题只涉及有界整数和布尔值（如调度、分配），优先尝试 `Pumpkin`。

---

## 2. 任务调度与共享资源 (`disjoint`, `cumulative`, `max`)

在 MIP 中把 10,000 个时间步拆成 0-1 变量会产生数万个变量和约束（WaSHI 的 MIP 转换器会在超过 5,000 步或 25,000 个变量时报错，并建议使用 `{ solver: "pumpkin" }`）。

使用 Pumpkin 时，无论时间刻度有多细，每个任务只需要**一个整数变量**（`start[task]`）：

- **`disjoint(tasks)`**：确保列表中的任务不会同时运行（例如共享同一台设备）。
- **`cumulative(tasks, capacity)`**：确保任意时刻的总资源需求（人数、电力等）不超过 `capacity`。
- **`max(...)`**：计算所有任务中的最晚结束时间（总工期），以便在目标函数中最小化。

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// 先后顺序：prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + 3 <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + 3 <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + 4 <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + 3 <= ${start.coat}`, "coat_after_drill");

// mill 和 drill 共用同一台 CNC 机床（不可重叠）
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// 同一时刻最多 2 名操作员同时工作
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
console.log("总工期:", m.objectiveValue);
```

完整示例见 [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)。

---

## 3. 分配、兼容表与索引查表 (`distinct`, `allowed`, `at`)

无需构造 $N \times M$ 的 0-1 变量矩阵，只需为每个任务定义一个表示机器编号（`0` 到 `M - 1`）的整数变量 `machine[job]`：

- **`distinct(machine)`**：强制每个任务分配到不同的机器上。
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**：直接允许或禁止特定的组合，无需手写 Big-M 公式。
- **`at(costs, indexVar)`**：在 `expr` 或目标函数中直接读取 `costs[indexVar]`。

```typescript
import { Model, expr, distinct, allowed, not, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// 每个任务运行在不同机器 (0, 1, 2) 上
m.constraint(distinct(machine), "one_job_per_machine");

// 禁止 Job A 在机器 0 的同时 Job B 在机器 1
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// 按分配的机器编号查表计费
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
console.log("总成本:", m.objectiveValue);
```

---

## 4. 使用 Pumpkin 时的实用技巧

### 保持整数上下界有限且紧凑
Pumpkin 仅支持 $[-(2^{30} - 1),\, 2^{30} - 1]$ 范围内的有限整数，不接受 `Continuous` 变量、小数或无穷边界（`-Infinity` / `Infinity`）。将 `[lb, ub]` 收紧到合理范围可以显著加快求解速度（详见 [Pumpkin 定义域前置条件](../solvers/pumpkin.md#domain-api-preconditions)）。

### 用严格递增 (`<`) 消除排列对称性
从候选项中挑选 $k$ 个填入可互换的位置（`slot[0]`, ..., `slot[k-1]`）时，同一组选项的不同排列成本完全相同，求解器会白白搜索 $k!$ 个等价解。添加 `slot[0] < slot[1] < ...` 可以同时保证互不相同并消除重复排列：

```typescript
import { Model, expr, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// 严格递增同时实现互不相同并消除 3! = 6 种重复排列
m.constraint([
  expr`${slot[0]} < ${slot[1]}`,
  expr`${slot[1]} < ${slot[2]}`,
]);

m.objective(
  minimize(
    expr`at(${latencyMs}, ${slot[0]}) + at(${latencyMs}, ${slot[1]}) + at(${latencyMs}, ${slot[2]})`
  )
);
await m.solve();
console.log("最低 3 项延迟总和:", m.objectiveValue);
```

### 热启动与冲突诊断
- **热启动（`initialValue`）**：在 `m.integer()` 或 `m.binary()` 中传入 `{ initialValue: val }`，为 Pumpkin 提供搜索初值提示。
- **冲突诊断（`m.check()`）**：如果 CP 模型返回 `"Infeasible"`，调用 `await m.check({ solver: "pumpkin" })` 即可定位冲突的命名约束（浏览器中无需配置 `COOP` / `COEP` 响应头，详见 [冲突诊断 (`unsatCore`)](./unsat-core.md)）。
