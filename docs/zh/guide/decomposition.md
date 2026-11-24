# 分解法 (`solveColumnGeneration` & `solveBenders`)

当单个 MIP 模型的候选列过多而无法预先全部枚举，或问题自然分为两阶段决策时，WaSHI 提供了两个分解辅助方法：

| 方法 | WaSHI API | 适用场景 |
| :--- | :--- | :--- |
| **列生成法** | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | 方案、路径或班次组合呈指数级增长的问题（切割下料、VRP、乘务排班）。 |
| **Benders 分解** | [`master.solveBenders()`](#benders-分解-solvebenders) | 两阶段决策（选址＋调度）或按需追加的懒约束（TSP 子环消除）。 |

---

## 列生成法 (`solveColumnGeneration`)

列生成法用于求解决策变量（列）过多而无法一次性列举的大型线性或整数规划问题。
它将问题拆分为两部分：

- **限制主问题（RMP）**：仅包含少量可行初始列的主问题 `Model`。
- **定价子问题（pricing subproblem）**：读取 RMP 的 LP 对偶值并搜索能够改善目标的新列的回调函数（`pricing`）。

每次调用 `master.solveColumnGeneration()` 都会执行以下循环：

1. 求解 RMP 的连续 LP 松弛（`master.relax()`），获取每条约束的**对偶值（影子价格）**。
2. 将对偶值（`duals`、`getDual`）传入 `pricing` 回调。
3. 自动根据 `reducedCostTolerance` 计算每个返回 `ColumnProposal` 的**缩减成本 / 检验数**（$\bar{c} = \text{cost} - \sum_i \pi_i a_i$）。
4. 若存在能改善目标的新列（最小化时 $\bar{c} < 0$，最大化时 $\bar{c} > 0$），则将其加入 RMP 并重复迭代，直到 `pricing` 返回 `null` / `[]` 或没有更优列为止。
5. 默认在最后把包含全部已生成列的 RMP 作为整数规划求解一次（`finalizeAsMIP: true`）。

> [!IMPORTANT]
> **前置条件与说明**：
> - **初始 RMP 必须可行**：初始列（或人工松弛列）必须使首次 LP 松弛存在有限最优解，才能获得有效对偶值。
> - **需要支持 LP 对偶的求解器**：仅支持 HiGHS 或 GLPK，不支持 Pumpkin 或 Z3。
> - **Price-and-Branch 启发式**：`finalizeAsMIP: true` 仅对根节点 LP 生成的列池求解一次 MIP，实用且高效，但并非精确 Branch-and-Price。

### 示例：使用子问题 `Model` 编写 `pricing`

在下面的切割下料问题中，RMP 以三个单规格初始方案起步，定价子问题则通过背包模型寻找更优的切割方案。
由于 `solveColumnGeneration()` 会自动校验检验数，`pricing` 只需直接返回子问题求得的最佳方案即可：

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. 主问题：先用单一规格的简单初始方案起步
const master = new Model("CuttingStockMaster");
const pA = master.integer("init_A", { lb: 0 }); // 每卷切 2 个 A（宽 45）
const pB = master.integer("init_B", { lb: 0 }); // 每卷切 2 个 B（宽 36）
const pC = master.integer("init_C", { lb: 0 }); // 每卷切 6 个 C（宽 16）

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. 运行列生成
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 子问题：寻找对偶总价值最大的合法切割方案
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

console.log("最少卷数:", result.objectiveValue); // 14
console.log("迭代次数:", result.iterations);
console.log("新增列数:", result.columnsAdded);
```

### 示例：使用纯 TypeScript 算法编写 `pricing` (`getDual`)

`pricing` 中不必非得构建子问题 `Model`。
您也可以借助 `getDual(约束名)`，用动态规划或枚举循环等任意 TypeScript 算法直接求解：

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const dA = getDual("demand_A");
    const dB = getDual("demand_B");
    const dC = getDual("demand_C");

    // 搜索检验数为负的方案 (1 - dualSum < -1e-6)
    let bestDualSum = 1 + 1e-6;
    let best: { demand_A: number; demand_B: number; demand_C: number } | null = null;
    for (let aA = 0; 45 * aA <= rollWidth; aA++) {
      for (let aB = 0; 45 * aA + 36 * aB <= rollWidth; aB++) {
        for (let aC = 0; 45 * aA + 36 * aB + 16 * aC <= rollWidth; aC++) {
          const dualSum = dA * aA + dB * aB + dC * aC;
          if (dualSum > bestDualSum) {
            bestDualSum = dualSum;
            best = { demand_A: aA, demand_B: aB, demand_C: aC };
          }
        }
      }
    }
    return best ? { cost: 1, type: "Integer", coefficients: best } : null;
  },
});
```

---

## Benders 分解 (`solveBenders`)

`master.solveBenders(options)` 将问题拆分为负责第一阶段决策的**主问题**与负责第二阶段评估的**子问题**。
在每轮迭代中，子问题评估主问题的候选解，并按需向主问题添加线性约束（**割平面 / Cut**）：

- **最优性割（`kind: "optimality"`）**：当子问题可行但实际第二阶段成本高于主问题估算变量 `theta` 时，用来收紧 `theta` 的边界。
- **可行性割（`kind: "feasibility"`）**：当子问题不可行或主问题候选解违反结构性懒约束（如孤立子环）时，直接排除该候选解。

### 自动生成割平面 (`sub.link()`)

只需从 `subproblem` 返回连续 LP `Model`，并用 `sub.link(...)` 关联主问题变量。
WaSHI 会自动管理成本估算变量 `theta`、代入当前主问题取值、从 LP 子问题提取对偶并追加最优性割，直到间隙收敛：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主问题：工厂开设的 0-1 决策
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 固定开设成本（运营成本估算变量 theta 会自动添加）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. 使用自动 Benders 割平面求解
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

    // 将子问题运输流量关联到主问题变量 y1, y2
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub;
  },
});

console.log("最优总成本:", result.objectiveValue); // 390
console.log("新增割数:", result.cutsAdded);
console.log("开设工厂:", result.values);
```

> [!IMPORTANT]
> **自动 `sub.link()` 模式的前置条件**：
> - **仅支持最优性割**：若连续 LP 子问题不可行会直接报错。请像 `total_capacity_floor` 那样在主问题保证可行性，或改用手动 `kind: "feasibility"` 割。
> - **`Maximize` 或负成本需显式传入 `theta`**：自动 `theta` 仅支持 `Minimize` 且默认 `lb: 0`，用于 `Maximize` 会报错。请声明 `theta`、加入目标并传入 `{ theta }`。
> - **需要支持 LP 对偶的求解器**：求解连续子问题对偶需要 HiGHS 或 GLPK。

### 手动生成割平面 (`BendersCut` / 懒约束)

若需自定义割平面、可行性割或懒约束（如 TSP 子环消除），请返回 `BendersCut` 对象或数组；收敛时返回 `null`。
返回最优性割时，`subproblemObjective` 应填入**总目标函数值**（主问题＋子问题），以便 WaSHI 将其与主问题下界比较并正确计算收敛间隙：

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

    // y = 0 时运营成本为 100，y = 1 时为 30
    const actualSubCost = 100 - 70 * yVal;
    if (estTheta < actualSubCost - 1e-4) {
      return {
        kind: "optimality", // 可行性割请设为 "feasibility"
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

## 底层原语（自定义循环用）

如果想自己编写列生成或割平面循环，可以直接调用以下四个底层接口：

### 1. 读取约束对偶值 (`c.dual`)

求解连续 LP 后，读取每条约束的对偶值（影子价格）：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                     // 对偶值 / 影子价格
console.log(m.solution?.duals.capacity); // 按约束名查询
```

### 2. 连续 LP 松弛 (`m.relax()`)

`m.relax()` 会临时将所有 `Integer` 和 `Binary` 变量放宽为 `[lb, ub]` 内的连续变量并求解 LP，从而获得对偶值：

```typescript
const status = await m.relax();
console.log("LP 松弛界:", m.objectiveValue);
```

### 3. 动态添加列 (`m.column()`)

一次性创建新变量、设置目标系数，并将其关联到已有的命名约束：

```typescript
const col = m.column({
  name: "pattern_1",
  type: "Integer", // 或 "Continuous" / "Binary"
  lb: 0,
  cost: 1, // 目标函数系数
  coefficients: {
    capacity: 2,
  },
});
```

### 4. 动态更新约束系数 (`c.addTerm()` / `c.setTerm()`)

对已有线性约束中的变量系数进行累加或覆盖：

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // 左端增加 +5 * extra
budget.setTerm(extra, 0); // 设为 0 即从约束中移除 extra
```

---

## 相关示例与技巧

- [车辆路径问题 (`solveColumnGeneration`)](../examples/vehicle-routing.md)
- [旅行商问题 (`solveBenders` 懒子环消除)](../examples/traveling-salesperson.md)
- [建模模式与技巧](./formulation-tips.md#decomposition-tips)
