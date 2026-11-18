# 约束规划 (CP) 建模

WaSHI 允许您通过同一套 TypeScript 代数建模 API（`Model`、`expr`、`sum`、`dot`）同时描述**数学优化 (LP / MIP / 凸QP)** 与**约束规划 (CP)** 问题。当选用内置的 **Pumpkin** 求解器（`@ohtaman/washi/solvers/pumpkin`）时，全局约束（`distinct`、`disjoint`、`cumulative`、`allowed`）与分段线性/元素索引原语（`max`、`min`、`abs`、`at`）会直接映射到底层 Lazy Clause Generation (LCG) 传播器执行，无需 Big-M 或时间离散化的 0-1 MIP 展开。

---

## 1. MIP 与 CP 的建模思维差异

在 **MIP (HiGHS / GLPK)** 中，组合决策通常需要构造庞大的 0-1 二进制变量矩阵 $x_{i,t} \in \{0, 1\}$ 并配合 Big-M 不等式，以便单纯形法/分支定界借由连续线性松弛收紧下界。

在 **CP (Pumpkin)** 中，您可以直接用有限域整数变量（`m.integer(keys, { lb, ub })`）表示每个实体的选择，并与声明式**全局约束**组合进行域传播与子句学习：

| 建模要素 | MIP 写法 (`HiGHS` / `GLPK`) | CP 写法 (`Pumpkin`) | SMT (`Z3`) |
| :--- | :--- | :--- | :--- |
| **开始时间 / 槽位** | 时间离散化二进制变量 $x_{i,t}$ 或成对 Big-M 顺序二进制变量 | 有界整数变量 `start[i]` $\in [0, H]$ | 连续或整数变量 |
| **可再生资源上限** | 为每个离散时间点 $t$ 生成 $\sum_i d_i x_{i,t} \le C$ | 单条时间跨度无关的 `cumulative(tasks, C)` | 基于事件点的负载公式 |
| **互斥独占（无重叠）** | 成对优先级二进制变量 $y_{ij} \in \{0, 1\}$ 与 Big-M | 原生 `disjoint(tasks)` 传播器（Edge-Finding） | 成对 `Or` 析取 |
| **全互异 / 排列匹配** | 双随机 0-1 分配矩阵 $x_{i,j} \in \{0, 1\}$ | 整数分配变量 `machine[i]` $\in [0, N-1]$ + `distinct(machine)` | 原生 `ctx.Distinct` |
| **兼容表 / 代价查表** | 借助 $\sum_k b_k = 1$ 的选择器二进制加权求和 | 原生 `at(costs, indexVar)` 与 `allowed` / `not(allowed)` 表约束 | 嵌套 `If` 表达式 |
| **适用场景** | 连续流、配比优化、LP 对偶/影子价格、二次目标 (`QuadExpr`)、紧致 LP 松弛 | 项目调度、累积/析取资源、排列组合分配、查表约束、无需 `COOP`/`COEP` 的 `unsatCore` | 含连续实数逻辑（如否定里的 `Continuous`）、形式化反例证明 |

---

## 2. 区间与资源调度 (`disjoint`, `cumulative`, `max`)

时间离散化 MIP 会随调度跨度 $H$ 产生 $O(|T| \cdot H)$ 个二进制脉冲变量和行约束（WaSHI 的 MIP 线性化在跨度超过 5,000 或脉冲变量超过 25,000 时会触发保护报错并推荐使用 `{ solver: "pumpkin" }`）。

在 CP 中，每个任务只需要**一个有界整数开始时间变量** `start[task]`，即可配合 `disjoint`（单台设备互斥）和 `cumulative`（团队人力或功率上限）描述复杂调度。传播器直接维护最早/最晚开工边界与能量平衡，无论时间粒度多细都保持模型紧凑。

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// 先行依赖关系: prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + 3 <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + 3 <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + 4 <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + 3 <= ${start.coat}`, "coat_after_drill");

// mill 与 drill 共享单台 CNC 主轴（不可重叠）
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// 所有任务任意时刻累计占用操作员不超过 2 人
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
```

包含 6 项工序、共享测试台与截止期冲突诊断的完整案例，请参阅 [资源受限项目调度 (RCPSP)](../examples/project-scheduling.md)。

---

## 3. 组合分配、表约束与元素查表 (`distinct`, `allowed`, `at`)

无需建立 $N \times M$ 的 0-1 变量矩阵，而是为每个作业分配一个整数变量 `machine[job]`（取值域 $\{0, \dots, M-1\}$）：

- **`distinct(machine)`**：利用 Pumpkin 原生 `all_different` 传播器保证作业分配到互不相同的机器。
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**：以兼容或禁忌元组表形式直接编码复杂业务规则，无需人工推 Big-M。
- **`at(costs, indexVar)`**：通过从 0 开始的变量索引 `indexVar` 在 `costs` 数组中直接取值（原生 `element` 传播器），避免额外引入选择器二进制变量。

```typescript
import { Model, expr, distinct, allowed, not, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// 每个作业运行在互不相同的机器 (0, 1, 2) 上
m.constraint(distinct(machine), "one_job_per_machine");

// 安全互锁：禁止 Job A 在机器 0 与 Job B 在机器 1 同时出现
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// 借助从 0 开始的 Element 原语 at(table, indexVar) 动态查找代价
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
```

---

## 4. 值域收紧、打破对称性与冲突诊断

### 保持整数值域有限且紧凑
Pumpkin 基于有符号 32 位整数传播器工作，不支持 `Continuous` 变量、非整数系数或无界变量（`lb: -Infinity` / `ub: Infinity`）。在 Pumpkin 上运行的所有 `m.integer()` 变量均需具备 $[-(2^{30} - 1),\, 2^{30} - 1]$ 内的有限整数边界（参见 [Pumpkin 值域与 API 前置条件](../solvers/pumpkin.md)）。更紧凑的上界能显著缩小传播范围并加速冲突子句学习。

### 利用严格不等号 (`<`) 打破对称性
当从备选集合中为 $k$ 个可互换槽位（`slot[0]` ... `slot[k-1]`）挑选元素时，$k!$ 种排列的代价完全相同，会导致搜索树重复遍历等价状态。通过 `slot[0] < slot[1] < ...` 强加严格递增顺序，可在一条约束内同时确保互异并消除全部 $k!$ 排列对称性：

```typescript
import { Model, expr, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// 严格递增约束同时实现全互异，并消除 3! = 6 种排列对称
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
```

### 热启动与免 `COOP`/`COEP` 冲突诊断
- **热启动 (`initialValue`)**：在 `m.integer()` / `m.binary()` 上传入 `{ initialValue: val }`，即可通过 Pumpkin 的 `WarmStart` 分支器作为初始搜索引导值。
- **冲突诊断 (`m.check()`)**：若 CP 调度或组合规则无解，无需重写约束或开启浏览器 `COOP`/`COEP` 响应头，直接调用 `await m.check({ solver: "pumpkin" })` 即可提取引发不可行的命名约束子集（`unsatCore` / `conflicts`）——详见 [不可行冲突诊断 (`unsatCore`)](./unsat-core.md)。
