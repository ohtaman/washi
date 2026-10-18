# 求解器概览

WaSHI 采用可插拔、解耦的求解器架构设计。你可以使用统一的代数建模 API 构建数学模型，然后根据问题类型和许可证需求选择最合适的求解引擎进行求解。

---

## ⚡ 求解器矩阵与对比

| 求解器 | 引擎许可证 | 支持的问题类型 | 适用场景 | WaSHI 中的状态 |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, 凸QP** | 工业级规模优化、运筹学、生产计划、金融组合优化 | **内置默认**（零配置） |
| **Z3** | **MIT** | **SMT, SAT, 逻辑, MIP** | 命题逻辑、不可行冲突诊断（`unsatCore`）、规则引擎 | 可选插件（`@ohtaman/washi/solvers/z3`） |
| **GLPK** | **GPL-3.0** | **LP, MIP** | 学术基准测试、既有 GLPK 模型兼容性验证 | 可选插件（`@ohtaman/washi/solvers/glpk`） |
| **Mock** | **MIT** | *任意* | 无需加载 WebAssembly 的 CI 超高速单元测试 | **内置** |

---

## 选择求解器

在创建 `Model` 时，或调用 `solve()` / `check()` 时按名称指定求解器：

```typescript
// 1. 内置 HiGHS（默认）
const m1 = new Model({ solver: "highs" });

// 2. Z3 SMT 求解器
import "@ohtaman/washi/solvers/z3";
const m2 = new Model({ solver: "z3" });

// 3. GLPK 求解器
import "@ohtaman/washi/solvers/glpk";
const m3 = new Model({ solver: "glpk" });
```

---

## 求解器详细指南

- [HiGHS 指南](/zh/solvers/highs)：Web Worker 多线程后台执行、MIP 容差设置、凸二次规划（QP）求解、进度回调与中断控制。
- [Z3 指南](/zh/solvers/z3)：SMT 逻辑断言、逻辑建模、`m.check()` 冲突约束集（Unsat Core）分析与跨源隔离要求。
- [GLPK 指南](/zh/solvers/glpk)：GLPK 适配器用法、GPL-3.0 许可证注意事项、状态映射与浏览器使用方式。
- [自定义求解器开发指南](/zh/solvers/custom-solver)：将私有求解器、商业求解器或云端 REST 求解服务集成为 WaSHI 插件的分步开发教程。
