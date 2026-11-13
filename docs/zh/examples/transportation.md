# 运输与分配网络 (LP)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 (LP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=transportation">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">源代码</a></li></ul> |

运输问题是最基础的网络优化模型之一：确定从每个供应源（工厂）向每个目的地（门店）发出的货物数量，在不超过各工厂产能上限并满足各门店需求量的前提下，使总运输成本最小化。

本案例演示如何使用 `m.continuous(factories, stores)` 一行代码构建**二维决策变量矩阵**，并借助 `dot()` 与 `m.constraint(expr`...`)` 声明式地编写聚合约束。

## 问题输入数据

现有 **3 座工厂**（`Tokyo`, `Nagoya`, `Osaka`）向 **4 家区域门店**（`North`, `East`, `West`, `South`）发货：

| 工厂 \ 门店 | North ($/件) | East ($/件) | West ($/件) | South ($/件) | 工厂供应上限 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** 件 |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** 件 |
| **Osaka** | $9 | $7 | $2 | $3 | **80** 件 |
| **门店需求量** | **70** 件 | **90** 件 | **60** 件 | **60** 件 | 总计: 280 / 300 |

## 数学模型形式化

设 $x_{f, s} \ge 0$ 为从工厂 $f \in F$ 发往门店 $s \in S$ 的运输量，$c_{f, s}$ 为单位运输成本。

$$\begin{aligned}
\text{Minimize} \quad & \sum_{f \in F} \sum_{s \in S} c_{f,s} \, x_{f,s} \\
\text{Subject to} \quad & \sum_{s \in S} x_{f,s} \le \text{Supply}_f \quad \forall f \in F \quad (\text{工厂产能上限}) \\
& \sum_{f \in F} x_{f,s} \ge \text{Demand}_s \quad \forall s \in S \quad (\text{门店需求满足}) \\
& x_{f,s} \ge 0 \quad \forall f \in F, s \in S
\end{aligned}$$

## 使用 WaSHI 实现

<CodeRunner preset="transportation">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

const shippingCost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };
const demands = { North: 70, East: 90, West: 60, South: 60 };

async function solveScenario(label: string, cap: typeof supplies) {
  const m = new Model("TransportationNetwork");

  // 1. 创建二维连续变量矩阵：ship[factory][store] >= 0
  const ship = m.continuous([...factories], [...stores], { lb: 0 });

  // 2. 目标函数：通过二维点积（dot）最小化所有路线的总运输成本
  m.objective(minimize(expr`dot(${shippingCost}, ${ship})`));

  // 3. 供应上限约束（按行求和）：从工厂 f 发出的总量 <= cap[f]
  const supplyConstrs = Object.fromEntries(
    factories.map((f) => [
      f,
      m.constraint(expr`sum(${ship[f]}) <= ${cap[f]}`, `supply_${f}`),
    ])
  );

  // 4. 需求满足约束（按列求和）：运抵门店 s 的总量 >= demands[s]
  const demandConstrs = Object.fromEntries(
    stores.map((s) => [
      s,
      m.constraint(
        expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demands[s]}`,
        `demand_${s}`
      ),
    ])
  );

  const status = await m.solve();
  console.log(`[${label}] Status: ${status}, Total Shipping Cost: $${m.objectiveValue}`);
  for (const f of factories) {
    const dual = supplyConstrs[f].dual ?? 0;
    const routes = stores
      .map((s) => `${s}:${Math.round(ship[f][s].value ?? 0)}`)
      .join(", ");
    console.log(`  ${f.padEnd(7)} -> ${routes} (supply dual: $${dual}/u)`);
  }
  const demandDuals = stores
    .map((s) => `${s}:$${demandConstrs[s].dual ?? 0}`)
    .join(", ");
  console.log(`  Marginal Delivered Cost (demand duals) -> ${demandDuals}`);
}

async function runTransportation() {
  // 场景 A：基准工厂产能 ($920)
  await solveScenario("Scenario A: Baseline", supplies);

  // 场景 B：Tokyo 工厂因维护产能受限 (120 -> 80)，总成本升至 $1,000
  await solveScenario("Scenario B: Tokyo Maintenance", {
    Tokyo: 80,
    Nagoya: 120,
    Osaka: 100,
  });
}

runTransportation();
```

</CodeRunner>

## 实战要点

- **供应与需求影子价格（`.dual`）的经济学含义**：
  - **`demand_s.dual`（$\ge 0$）**：向门店 $s$ 多配送 1 单位货物的边际到岸成本。
  - **`supply_f.dual`（$\le 0$）**：将工厂 $f$ 的产能扩大 1 单位所能降低的全网总运输成本。在场景 B 中，当 Tokyo 产能受限于 80 件时，`supply_Tokyo.dual` 变为 `-$2/u`，表明在 Tokyo 每增加 1 件产能即可避免从 Nagoya 绕道发货，从而节省 \$2。
- **总供应量与总需求量平衡（$\sum \text{Supply}_f \ge \sum \text{Demand}_s$）**：若门店总需求超过所有工厂的总产能，硬需求约束将导致 `"Infeasible"`。在实际生产物流系统中，建议在各门店需求约束中加入非负的缺货/外部现货调拨松弛变量 $u_s \ge 0$（$\sum_f x_{f,s} + u_s \ge \text{Demand}_s$）并赋予高额惩罚成本，使求解器在产能不足时仍能给出最优的稀缺库存分配方案。
