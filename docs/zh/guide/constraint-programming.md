# 约束规划 (CP) 建模

WaSHI 支持用同一套 TypeScript API 编写数学规划（LP / MIP / QP）与约束规划（CP）模型。
借助内置的 **Pumpkin** 求解器（`@ohtaman/washi/solvers/pumpkin`），您可以直接表达调度、资源容量、互不相同与查表规则，无需把模型展开成庞大的 0-1 矩阵。

---

## 1. 何时使用 CP (`Pumpkin`) 与 MIP (`HiGHS` / `GLPK`)

两种范式在表示决策与剪枝搜索空间的方式上截然不同。

### 混合整数规划（MIP：`HiGHS` / `GLPK`）

MIP 用连续变量和整数变量（含 0-1 变量）表示决策，以线性不等式表达约束，并依靠线性规划松弛与分支定界求解。
它非常适合连续流、线性预算、二次目标与 LP 对偶分析，但一旦需要将细粒度时间轴离散化或将组合结构展开为 0-1 变量，模型规模就会急剧膨胀。

### 约束规划（CP：`Pumpkin`）

CP 直接为每个决策赋予有限整数定义域，并用**全局约束**（把一组变量间的结构化组合规则封装在一起的高层谓词）将它们连接起来。
在搜索过程中，**域传播**（每当变量定义域收窄或约束收紧时，自动从其他变量的定义域中剔除不可能的取值）会持续缩小搜索空间，使模型保持紧凑。

下表对比了常见建模需求在 MIP 与 CP 中的对应方式：

| 建模需求 | MIP (`HiGHS` / `GLPK`) | CP (`Pumpkin`) |
| :--- | :--- | :--- |
| **决定开始时间** | 每个任务×时间槽一个 0-1 变量 | 每个任务一个整数变量 `start[i]` |
| **任务禁止重叠** | 成对顺序变量 + Big-M 不等式 | `disjoint(tasks)` |
| **共享人力/设备容量** | 每个时间步生成一条求和约束 | `cumulative(tasks, capacity)` |
| **一对一分配** | 二维 0-1 分配矩阵 | `machine[i]` + `distinct(machine)` |
| **按选择查表取值/计费** | 0-1 选择变量加权求和 | `at(costs, indexVar)` |
| **最适合的问题** | 连续流、配比、二次目标、对偶分析 | 排程调度、资源上限、排列分配、兼容表 |

> [!TIP]
> 如果模型需要 `Continuous` 变量、小数系数或二次目标函数，请使用 `HiGHS`；含连续变量的逻辑规则请使用 `Z3`。
> 如果模型仅使用有界整数和布尔值处理调度、路径或组合分配，优先尝试 `Pumpkin`。

---

## 2. 任务调度与共享资源 (`disjoint`, `cumulative`, `max`)

在 MIP 中把较长的时间轴离散化为 0-1 时间槽变量，会迅速产生数万个变量与约束。
WaSHI 的 MIP 转换器会在 `cumulative` 超过 5,000 个时间步或 25,000 个槽位变量时报错，并建议使用 `{ solver: "pumpkin" }`。

使用 Pumpkin 时，无论时间刻度有多细，每个任务只需**一个整数变量**（`start[task]`）。
绝大多数区间调度模型都可由以下三个原语组成：

- **`disjoint(tasks)`**：接收 `{ start, duration }` 形式的任务数组，禁止共享单台设备的区间 `[start, start + duration)` 彼此重叠。
- **`cumulative(tasks, capacity)`**：接收 `{ start, duration, demand }` 形式的任务数组，确保任意时刻的资源总需求不超过 `capacity`。
- **`max(...)`**：计算所有任务中的最晚结束时间，即**总完工时间（Makespan）** $\max_i (\text{start}_i + \text{duration}_i)$，以便在目标函数中最小化。

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// 先后顺序：prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + ${duration.mill} <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + ${duration.drill} <= ${start.coat}`, "coat_after_drill");

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
console.log("总完工时间 (Makespan):", m.objectiveValue);
```

完整示例见 [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)。

---

## 3. 分配、兼容表与索引查表 (`distinct`, `allowed`, `at`)

无需构造 $N \times M$ 的 0-1 分配矩阵，只需为每个任务定义一个表示机器编号（`0` 到 `M - 1`）的有限整数变量 `machine[job]`：

- **`distinct(machine)`**：全局互异约束（AllDifferent），强制每个任务分配到不同的机器。
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**：全局表约束，直接允许或禁止指定取值组合，无需 Big-M 公式。
- **`at(costs, indexVar)`**：变量索引查表，可在 `expr` 或目标函数中直接读取 `costs[indexVar]`。

```typescript
import { Model, expr, distinct, allowed, not, minimize } from "@ohtaman/washi";
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

Pumpkin 仅支持 $[-(2^{30} - 1),\, 2^{30} - 1]$ 范围内的有限整数。
它不接受 `Continuous` 变量、非整数系数/常数以及无穷上下界（`-Infinity` / `Infinity`）。
将 `[lb, ub]` 收紧到合理范围可以缩小初始定义域并提升域传播效率。
详见 [Pumpkin 定义域前置条件](../solvers/pumpkin.md#domain-api-preconditions)。

### 用严格递增 (`<`) 消除排列对称性

从候选项中挑选 $k$ 个互不相同的元素填入可互换的位置（`slot[0]`, ..., `slot[k-1]`）时，同一组选项的任意排列目标值都完全相同。
若不打破对称性，求解器会白白遍历 $k!$ 种等价排列。
添加 `slot[0] < slot[1] < ...` 可以同时强制互不相同并固定唯一标准顺序：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
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
- **冲突诊断（`m.check()`）**：如果 CP 模型返回 `"Infeasible"`，调用 `await m.check({ solver: "pumpkin" })` 即可定位冲突的命名约束。详见 [冲突诊断 (`unsatCore`)](./unsat-core.md)。
