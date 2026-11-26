# 求解器概览

WaSHI 采用可插拔的求解器架构。使用统一的代数建模 API 编写一次模型，即可按问题类型与运行环境切换最合适的求解引擎。

---

## 求解器矩阵与对比

| 求解器 | 引擎许可证 | 支持的问题类型与变量 | 适用场景 | 提供方式与前提条件 |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](./highs.md)** | **MIT** | **LP, MIP, 凸 QP**（连续、整数、布尔） | 生产环境优化、运筹规划、凸 QP 投资组合优化 | **内置默认**（零额外依赖、无需导入；专属 API 位于 `@ohtaman/washi/solvers/highs`） |
| **[Pumpkin](./pumpkin.md)** | **MIT** | **CP、命题逻辑**（仅支持有界整数与布尔变量；不支持 `Continuous`） | 非重叠调度、CP 全局约束、离散模型 `unsatCore` | **内置**（`{ solver: "pumpkin" }`，零额外依赖、无需导入；专属 API 位于 `@ohtaman/washi/solvers/pumpkin`） |
| **[Z3](./z3.md)**（基于 `z3-solver`） | **MIT** | **SMT、SAT、LP/MIP**（连续、整数、布尔） | 含连续变量或小数系数的逻辑规则、连续/整数混合模型的冲突诊断（`unsatCore`） | **可选 peer 插件**（`@ohtaman/washi/solvers/z3`，需安装 `z3-solver`）；浏览器端需要安全上下文（`HTTPS`/`localhost`）和 `COOP`/`COEP` 响应头 |
| **[GLPK](./glpk.md)**（基于 `glpk.js`） | **GPL-3.0** | **LP, MIP**（连续、整数） | 学术基准测试、既有 GLPK 模型兼容性验证 | **可选 peer 插件**（`@ohtaman/washi/solvers/glpk`，需安装 `glpk.js`，注意 GPL-3.0 协议） |
| **Mock**（`MockSolver`） | **MIT** | *任意*（固定响应桩） | 不加载 WebAssembly 的高速 CI 单元测试 | **内置**（`solver: "mock"` 或 `new MockSolver(...)`） |

---

## 选择求解器

内置的 **HiGHS**（默认）与 **Pumpkin**（`{ solver: "pumpkin" }`）均已开箱注册，无需额外导入；仅可选插件（**Z3** 与 **GLPK**）需在模块顶部先导入，随后在创建 `Model` 或调用 `solve()` / `check()` 时指定求解器：

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";
import "@ohtaman/washi/solvers/glpk";

// 1. 创建 Model 时指定求解器（HiGHS 为内置默认，Pumpkin 亦无需额外导入）
const m = new Model({ solver: "highs" });
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`${x}`));

// 2. 在单次 solve() / check() 调用中切换求解器
await m.solve({ solver: "highs" });
await m.solve({ solver: "glpk" });
// check() 会忽略目标函数，仅检查约束的可满足性
await m.check({ solver: "pumpkin" });
await m.check({ solver: "z3" });

// 3. 不加载 WebAssembly 的单元测试 MockSolver
const mock = new MockSolver({ status: "Optimal", objectiveValue: 10, values: { x: 10 } });
await m.solve({ solver: mock });
```

更多 `MockSolver` 单元测试用法请参阅 [冲突诊断、解验证与调试](../guide/unsat-core.md)。

---

## 求解器详细指南

- [HiGHS 指南](./highs.md)：Web Worker 后台执行、MIP 容差设置、凸二次规划（QP）、进度回调与中断控制。
- [Pumpkin 指南](./pumpkin.md)：内置 CP / LCG（惰性子句生成）求解器、全局约束、热启动提示与离散模型 `unsatCore` 提取。
- [Z3 指南](./z3.md)：SMT 逻辑约束、含 `Continuous`/小数的规则、冲突诊断与浏览器 `COOP`/`COEP` 配置。
- [GLPK 指南](./glpk.md)：GLPK 适配器用法、GPL-3.0 协议注意事项与状态映射。
- [自定义求解器开发指南](./custom-solver.md)：将商业/私有求解器、云端 REST 服务或自研 WASM 引擎接入 WaSHI 的开发步骤。
