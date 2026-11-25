# 运输与分配网络 (LP)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 (LP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize`, `constr.dual` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=transportation">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">源代码</a></li></ul> |

**运输问题**决定从每座工厂发往每家门店的货运量。目标是在不超过工厂产能并满足各门店需求的前提下，使总运输成本最小。

本示例用 `m.continuous(factories, stores)` 构建二维决策变量矩阵，通过 `dot()` 定义总运输成本目标函数，并用 `sum()` 和 ``m.constraint(expr`...`)`` 编写按行/列汇总的供需约束。

## 问题输入数据

`Tokyo`、`Nagoya`、`Osaka` 共 3 座工厂向 `North`、`East`、`West`、`South` 共 4 家区域门店供货：

| 工厂 / 门店 | North ($/件) | East ($/件) | West ($/件) | South ($/件) | 工厂供应上限 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** 件 |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** 件 |
| **Osaka** | $9 | $7 | $2 | $3 | **80** 件 |
| **门店需求量** | **70** 件 | **90** 件 | **60** 件 | **60** 件 | 总需求 280 / 总供应上限 300 |

## 数学模型形式化

设工厂集合为 $F$、门店集合为 $S$，工厂 $f$ 的供应上限为 $\text{Supply}_f$，门店 $s$ 的需求量为 $\text{Demand}_s$，从工厂 $f \in F$ 发往门店 $s \in S$ 的运输量为 $x_{f, s} \ge 0$，单位运输成本为 $c_{f, s}$。

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
  // 场景 A：基准工厂产能（最优成本：$880）
  await solveScenario("Scenario A: Baseline", supplies);

  // 场景 B：Tokyo 产能降至 80，同时 Nagoya 扩至 120、Osaka 扩至 100（最优成本：$940）
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

### 供应与需求约束的影子价格（`.dual`）

在最小化 LP 中，各约束的**影子价格**（`.dual`）衡量右端项增加 1 个单位时总成本的变化量：

- **`demand_s.dual`（$\ge 0$）：** 向门店 $s$ 多配送 1 件货物的边际到岸成本。
- **`supply_f.dual`（$\le 0$）：** 工厂 $f$ 供应上限提高 1 件时总运输成本的变化量（负值表示可节省的成本）。

场景 A 的最优总运输成本为 `$880`，场景 B 为 `$940`。在这两个场景中，`Tokyo` 都已达到供应上限，其 `supply_Tokyo.dual` 为 `-$2/件`。`Tokyo` 每增加 1 件供应能力，即可减少从 `Nagoya` 发出的更高成本替代运输，从而节省 `$2`；`Osaka` 同样处于供应上限，影子价格为 `-$1/件`。

### 处理产能不足

满足硬性需求约束的前提是总供应上限不少于总需求（$\sum_{f \in F} \text{Supply}_f \ge \sum_{s \in S} \text{Demand}_s$）。若门店总需求超过各工厂供应上限之和，HiGHS 将返回 `"Infeasible"`。

为避免产能紧张时直接无解，可在各门店的需求约束中加入非负的缺货或临时调拨变量 $u_s \ge 0$，将其改写为 $\sum_{f \in F} x_{f,s} + u_s \ge \text{Demand}_s$，并在目标函数中对 $u_s$ 施加较高的惩罚成本。这样求解器便可在供应稀缺时最优分配有限的产能。
