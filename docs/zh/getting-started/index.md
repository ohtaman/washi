# 安装与入门

欢迎使用 **WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface)。

WaSHI 为 TypeScript/JavaScript 生态系统带来了类似于 Python **PuLP** 和 Julia **JuMP** 的代数建模方式。无需单独的 Python 后端或本地 C/C++ 编译环境，即可在浏览器与 Node.js 中运行 WebAssembly 求解器（**HiGHS**, **Z3**, **GLPK**）。

### 为什么选择 TypeScript 与 WebAssembly？

- **消除部署瓶颈与客户端协同**：在传统的运筹优化工作流（如 Python 的 PuLP 或 Pyomo）中，将模型转化为可交互的应用通常需要部署后端服务并维护本地 C/C++ 求解器二进制文件。随着 AI 辅助编程大幅加快 UI 与应用原型的开发速度，后端基础设施往往成为交付的主要瓶颈。通过基于 Web 标准（TypeScript + WebAssembly）运行建模器与求解器，整个优化应用可以直接作为静态资源（托管在 GitHub Pages 或 Cloudflare Pages 等平台上，包含生成的 JS、Worker 与 WASM 文件；使用 Z3 时需配置 COOP/COEP 响应头）发布，并能直接在浏览器端与端侧 LLM（如 WebGPU / WebLLM）无缝配合。
- **无需运算符重载的代数语法 (`expr`)**：由于 JavaScript 不支持运算符重载，常规库往往只能在冗长的方法链（`x.mul(30).add(y.mul(50))`）和无类型的纯字符串（`"30 * x + 50 * y"`）之间妥协。WaSHI 借鉴了参数化 SQL 模板的思路，使用标签模板字面量（`` expr`30 * ${x} + 50 * ${y} <= 40` ``）解析中缀运算符，同时将 `${x}` 直接绑定为 TypeScript 对象引用，从而兼顾公式可读性、静态类型检查、IDE 符号重命名以及多维索引访问（`${flow[i][j]}`）。

---

## 📦 安装

使用您偏好的包管理器安装：

::: code-group

```bash [npm]
npm install @ohtaman/washi
```

```bash [pnpm]
pnpm add @ohtaman/washi
```

```bash [yarn]
yarn add @ohtaman/washi
```

```bash [bun]
bun add @ohtaman/washi
```

:::

### 可选求解器依赖

默认的 **HiGHS** 求解器已内置随包提供，开箱即用。若需使用 **Z3**（进行 SMT 逻辑与冲突诊断）或 **GLPK**，请安装相应的对等依赖：

```bash
# SMT 逻辑与不可行约束诊断
npm install z3-solver

# GLPK 求解器 (GPL-3.0)
npm install glpk.js
```

---

## 🚀 快速上手示例

以下是求解经典工厂生产资源分配问题的完整流程。

### 1. 引入核心类与标签函数

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
```

### 2. 初始化模型实例

```typescript
const model = new Model();
```

### 3. 定义决策变量

```typescript
const x = model.integer("x", { lb: 0 });
const y = model.integer("y", { lb: 0 });
```

### 4. 设定目标函数

使用 `maximize()` 与 `expr` 标签模板字面量声明式设定目标函数：

```typescript
// 最大化 30*x + 50*y
model.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
```

### 5. 添加约束条件

使用 `expr` 标签模板字面量与 `constraint` 添加不等式或等式约束：

```typescript
model.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_capacity");
```

### 6. 异步求解与结果获取

```typescript
const result = await model.solve();

console.log("状态:", model.status); // "Optimal"
console.log("最优目标值:", model.objectiveValue); // 1100
console.log(`最优解: x = ${x.value}, y = ${y.value}`); // x = 20, y = 10
```

---

## 🧭 下一步

- [AI 编程助手快速参考](/getting-started/ai-agents)：面向 AI 编程代理的 API 签名与部署要点速查
- [运行时环境配置](/getting-started/runtimes)：Node.js、现代打包工具、浏览器 ESM、CDN 与离线部署说明
- [建模指南](/guide/variables)：决策变量、代数表达式 (`expr`)、约束条件与解验证 (`validateSolution`)
- [求解器矩阵](/solvers/)：HiGHS、Z3、GLPK 与自定义求解器插件对比
- [实际案例与 API 索引](/zh/examples/)：9 个可在页面内直接运行的优化与逻辑建模示例

