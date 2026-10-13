# 安装与入门

欢迎使用 **WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface)。

WaSHI 为现代 TypeScript/JavaScript 生态系统带来了类似于 Python **PuLP** 和 Julia **JuMP** 的代数建模体验。无需繁琐的 C/C++ 本地编译环境，即可在浏览器、Node.js 等多端直接运行工业级 WebAssembly 求解器（**HiGHS**, **Z3**, **GLPK**）。

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
import { Model, expr, c, maximize } from "@ohtaman/washi";
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

使用 `c` 标签模板字面量与 `constraint` 添加不等式或等式约束：

```typescript
model.constraint(c`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.constraint(c`2 * ${x} + ${y} <= 50`, "labor_capacity");
```

### 6. 异步求解与结果获取

```typescript
const result = await model.solve();

console.log("状态:", model.status); // "Optimal"
console.log("最优目标值:", model.objectiveValue); // 1100
console.log(`最优解: x = ${x.value}, y = ${y.value}`); // x = 20, y = 10
```
