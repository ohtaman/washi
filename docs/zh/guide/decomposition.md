# 分解方法 (`solveColumnGeneration` & `solveBenders`)

当混合整数规划（MIP）模型包含指数级数量的候选方案或具有两阶段耦合结构时，WaSHI 提供了两个高级分解编排器——`master.solveColumnGeneration()` 与 `master.solveBenders()`——以及用于读取对偶信息和动态修改模型的底层原语。

| 分解方法 | WaSHI 编排器 | 典型适用场景 |
| :--- | :--- | :--- |
| **列生成法** *(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | 切割方案、配送路线或排班组合数量呈指数增长的问题（如下料问题 Cutting Stock、车辆路径 VRP、机组排班）。 |
| **Benders 分解** *(及延迟割平面)* | [`master.solveBenders()`](#benders-分解-solvebenders) | 含耦合决策变量的两阶段问题或延迟约束分离（如设施选址＋调度、两阶段随机规划、TSP 子回路消除）。 |

---

## 基础原语

分解编排器内部使用的四个底层原语也可直接用于编写自定义迭代算法：

### 1. 约束对偶值 (`c.dual`)
求解连续线性规划（LP）后，读取每条约束右端项（RHS）每变动 1 单位对目标函数的边际影响（影子价格）：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                    // 对偶值 / 影子价格
console.log(m.solution?.duals.capacity); // 按约束名称读取
```

### 2. 连续 LP 松弛求解 (`m.relax()`)
`m.relax()` 会在 `[lb, ub]` 边界内临时将所有 `Integer` 与 `Binary` 变量松弛为连续变量求解 LP，并将影子价格填充到 `m.solution.duals`：

```typescript
// 求解连续 LP 松弛并填充 m.solution.duals
const status = await m.relax();
console.log("LP 松弛目标界:", m.objectiveValue);
```

### 3. 动态列注入 (`m.addColumn()`)
在单次调用中创建新决策变量、设置其目标函数系数，并将非零系数注入既有命名约束中：

```typescript
const col = m.addColumn({
  name: "pattern_1",
  type: "Integer", // 或 "Continuous" / "Binary"
  lb: 0,
  cost: 1, // 目标函数系数
  coefficients: {
    capacity: 2,
  },
});
```

### 4. 动态修改约束项 (`c.addTerm()` / `c.setTerm()`)
动态增减或覆盖既有线性约束中某个变量的系数：

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // 在左端项增加 +5 * extra
budget.setTerm(extra, 0); // 设为 0 可将该变量从约束中移除
```

---

## 列生成法 (`solveColumnGeneration`)

`master.solveColumnGeneration(options)` 从包含少量可行初始列的**受限主问题（Restricted Master Problem, RMP）**出发，自动执行列生成循环：
1. 调用 `master.relax()` 求解受限主问题的连续 LP 松弛。
2. 将当前约束影子价格（`duals`, `getDual`）传入 `pricing` 回调。
3. 评估候选列（`ColumnProposal` 或 `ColumnProposal[]`），将具有负检验数（最小化问题中 $\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$）的改进列动态注入主问题。
4. 重复迭代，直至 `pricing` 返回 `null` / `[]` 或没有超出 `reducedCostTolerance` 的改进列。
5. 最后默认在所有已生成列上将主问题作为 MIP 求解一次（`finalizeAsMIP: true`），恢复整数解。

### 使用 WaSHI 子问题模型实现 `pricing`

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. 受限主问题（RMP）：使用单一物料朴素切割方案初始化
const master = new Model("CuttingStockMaster");
const pA = master.integer("init_A", { lb: 0 }); // 每卷切 2 个 A（宽 45）
const pB = master.integer("init_B", { lb: 0 }); // 每卷切 2 个 B（宽 36）
const pC = master.integer("init_C", { lb: 0 }); // 每卷切 6 个 C（宽 16）

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. 运行列生成法
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 背包定价子问题：寻找最大化对偶价格总和的切割方案
    const sub = new Model("KnapsackPricing");
    const aA = sub.integer("a_A", { lb: 0, ub: 2 });
    const aB = sub.integer("a_B", { lb: 0, ub: 2 });
    const aC = sub.integer("a_C", { lb: 0, ub: 6 });

    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${aA} + ${dualB} * ${aB} + ${dualC} * ${aC}`));
    sub.constraint(expr`45 * ${aA} + 36 * ${aB} + 16 * ${aC} <= ${rollWidth}`);

    await sub.solve();

    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(aA.value ?? 0),
        demand_B: Math.round(aB.value ?? 0),
        demand_C: Math.round(aC.value ?? 0),
      },
    };
  },
});

console.log("最优总卷数:", result.objectiveValue); // 14
console.log("迭代次数:", result.iterations);
console.log("新增列数:", result.columnsAdded);
```

### 使用自定义算法实现 `pricing` (`getDual`)

由于 `pricing` 是接收 `PricingContext` 的普通回调函数，您也可以直接用动态规划或图最短路算法生成列，而无需构建子问题 `Model`：

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const duals = {
      A: getDual("demand_A"),
      B: getDual("demand_B"),
      C: getDual("demand_C"),
    };
    // 使用任意专用算法搜索新方案；无改进列时返回 null
    if (duals.A + duals.B * 0 <= 1) return null;
    return {
      cost: 1,
      type: "Integer",
      coefficients: { demand_A: 2, demand_B: 0, demand_C: 0 },
    };
  },
});
```

---

## Benders 分解 (`solveBenders`)

`master.solveBenders(options)` 将问题拆分为**主问题（Master Problem）**与**子问题（Subproblem）**，在每次迭代中固定主问题候选解并评估子问题，动态向主问题反馈**最优性割平面（Optimality Cut）**或**可行性割平面（Feasibility Cut）**。

### 基于 `sub.link()` 的自动割平面生成

在 `subproblem` 回调中返回连续 LP 子问题 `Model`，并通过 `sub.link(...)` 声明跨模型耦合约束，WaSHI 将自动管理辅助估计变量 $\theta$、代入主问题候选值、提取对偶变量并注入 Benders 割平面：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主问题：二元设施选址决策
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 固定建设成本（代表运营子问题成本的 theta 由系统自动管理）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. 自动生成 Benders 割平面并求解
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    const sub = new Model("DispatchSubproblem");
    const x11 = sub.continuous("x_11", { lb: 0 });
    const x12 = sub.continuous("x_12", { lb: 0 });
    const x13 = sub.continuous("x_13", { lb: 0 });
    const x21 = sub.continuous("x_21", { lb: 0 });
    const x22 = sub.continuous("x_22", { lb: 0 });
    const x23 = sub.continuous("x_23", { lb: 0 });

    sub.objective(
      minimize(
        expr`3 * ${x11} + 4 * ${x12} + 2 * ${x13} + 4 * ${x21} + 2 * ${x22} + 3 * ${x23}`
      )
    );

    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // 通过 sub.link() 将子问题流量关联到主问题决策变量 y1, y2
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub;
  },
});

console.log("最优总成本:", result.objectiveValue); // 390
console.log("添加割平面数:", result.cutsAdded);
console.log("设施选址结果:", result.values);
```

> [!NOTE]
> **子问题目标值为负时的 `theta` 下界设置**：未显式声明 `theta` 而直接使用 `sub.link(...)` 时，WaSHI 默认注入下界为 `lb: 0` 的辅助变量 `__benders_theta`（假设子问题成本非负）。若子问题目标值可能为负（如净收益或返利），请显式声明 `const theta = master.continuous("theta", { lb: -1e6 })`，在 `master.objective(...)` 中加入 `+ ${theta}`，并在 `solveBenders(options)` 中传入 `{ theta }`。

### 手动构造割平面 (`BendersCut` / 延迟约束)

对于组合优化中的延迟约束分离（如子回路消除）或自定义解析割平面，可直接返回单个 `BendersCut`、数组 `BendersCut[]`，或在收敛时返回 `null`：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const master = new Model("ManualBenders");
const y = master.binary("y");
const theta = master.continuous("theta", { lb: 0 });
master.objective(minimize(expr`40 * ${y} + ${theta}`));

const result = await master.solveBenders({
  theta,
  gapTolerance: 1e-4,
  subproblem: ({ getMasterValue }) => {
    const yVal = getMasterValue(y);
    const estTheta = getMasterValue(theta);

    // 运营子问题成本：y = 0 时为 100，y = 1 时为 30
    const actualSubCost = 100 - 70 * yVal;
    if (estTheta < actualSubCost - 1e-4) {
      return {
        kind: "optimality", // 组合延迟可行性割平面可设为 "feasibility"
        constraint: expr`${theta} >= 100 - 70 * ${y}`,
        subproblemObjective: 40 * yVal + actualSubCost,
      };
    }
    return null; // 已收敛
  },
});

console.log(result.objectiveValue); // 70 (y = 1, theta = 30)
```

---

## 相关案例与建模技巧

- **分解算法完整案例**：
  - [车辆路径问题 CVRP (`solveColumnGeneration`)](../examples/vehicle-routing.md)
  - [旅行商问题 TSP (`solveBenders` 延迟子回路消除)](../examples/traveling-salesperson.md)
- **建模技巧**：关于列生成中的集合覆盖（`>= 1`）与集合划分（`== 1`）对比、Price-and-Branch（`finalizeAsMIP`）以及多割平面分离，请参见 [建模模式与优化技巧](./formulation-tips.md#decomposition-tips)。
