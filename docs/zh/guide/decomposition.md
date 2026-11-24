# 分解法 (`solveColumnGeneration` & `solveBenders`)

当单个 MIP 模型的候选组合过多而无法预先全部列出，或问题可以自然拆分为“第一阶段决策”和“第二阶段运营”时，WaSHI 提供了两个分解辅助方法：

| 方法 | WaSHI API | 适用场景 |
| :--- | :--- | :--- |
| **列生成法** | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) | 切割方案、路径或班次组合过多（如切割下料、车辆路径 VRP、乘务排班）。 |
| **Benders 分解** | [`master.solveBenders()`](#benders-分解-solvebenders) | 两阶段决策（选址+调度）或仅在违背时才追加的懒约束（如 TSP 子环消除）。 |

---

## 列生成法 (`solveColumnGeneration`)

无需一开始就为每种切割方案或路径创建变量，`solveColumnGeneration()` 从少量初始方案（**主问题**）出发，按需通过 `pricing` 回调生成更好的新方案：

1. 对当前方案求解连续 LP 松弛（`master.relax()`），获取每条约束的**对偶值（影子价格）**——即放宽该约束 1 单位能改善多少目标值。
2. 将这些对偶值（`duals`, `getDual`）传给 `pricing` 回调。
3. 若返回的方案（`ColumnProposal`）成本低于其对偶收益（最小化时**检验数** $\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$），则将其作为新变量加入主问题。
4. 不断重复，直到 `pricing` 返回 `null` / `[]` 或没有更优方案为止。
5. 最后将汇总全部方案的主问题作为整数规划（MIP）求解（`finalizeAsMIP: true`，默认开启）。

### 示例：使用子问题 `Model` 编写 `pricing`

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

`pricing` 中不必非得构建子问题 `Model`，也可以通过 `getDual(约束名)` 用动态规划或循环直接求解：

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

`master.solveBenders(options)` 将问题拆分为两部分：
- **主问题**：负责全局或整数决策（例如开设哪些工厂）。
- **子问题**：评估主问题给出的候选解；若不可行或运营成本估算偏低，就向主问题追加线性约束（**割平面 / Cut**）重新求解。

### 自动生成割平面 (`sub.link()`)

只需在 `subproblem` 中返回一个连续 LP `Model`，并用 `sub.link(...)` 关联主问题变量即可。WaSHI 会自动管理运营成本估算变量 `theta`、代入主问题的值并追加割平面，直到收敛：

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

> [!NOTE]
> **子问题目标值为负时的处理**：自动生成的 `theta` 默认下界为 `lb: 0`。如果子问题目标可能为负（例如净收益或返利），请显式定义 `const theta = master.continuous("theta", { lb: -1e6 })`，在 `master.objective(...)` 中加上 `+ ${theta}`，并将 `{ theta }` 传入 `solveBenders()`。

### 手动生成割平面 (`BendersCut` / 懒约束)

如果需要自定义割平面或懒约束（例如 TSP 子环消除），可返回 `BendersCut` 对象或数组；收敛时返回 `null`：

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
