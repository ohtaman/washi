# 使用 AI 编程助手

本指南介绍如何配置 AI 编程助手（Claude Code、Cursor、Codex、Antigravity、Gemini CLI、Windsurf），使用 `@ohtaman/washi` 构建、求解、验证数理优化与约束规划模型，并将其打包为可分发的工具或应用。

---

## 1. 环境与工具配置

在 AI 编程助手中使用 WaSHI 分为两步：在项目中安装运行时库，以及为编程助手提供 WaSHI 当前的 API 与验证工作流。

### 安装运行时库

内置的 **HiGHS**（LP / MIP / 凸 QP）与 **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`，CP / LCG）均零外部依赖，开箱即用：

```bash
npm install @ohtaman/washi

# 仅在需要连续变量 SMT 逻辑约束或 GLPK 求解器时按需安装可选依赖：
# npm install z3-solver
# npm install glpk.js
```

### 配置编程助手上下文

根据您使用的工具选择以下任一方式：

- **Agent Skill（推荐 — Claude Code、Cursor、Codex、Antigravity、Gemini CLI）**：
  ```bash
  npx skills add ohtaman/washi
  ```
  该命令会安装 `skills/washi/SKILL.md`（也随包附带在 `node_modules/@ohtaman/washi/skills/washi/SKILL.md` 中）。它能帮助助手掌握求解器选型、`expr` 建模，以及使用 `m.toLpString()`、`m.verify()` 和 `m.check()` 进行调试验证。
- **IDE 文档索引（Cursor、Windsurf 等中的 `@Docs`）**：
  - 文档索引概览：`https://washi.ohtaman.dev/llms.txt`
  - 单文件完整 API 与示例参考：`https://washi.ohtaman.dev/llms-full.txt`
- **Context7 MCP**：
  - 库 ID：`/ohtaman/washi`

---

## 2. 第一次端到端运行

在已安装 `@ohtaman/washi` 的 Node.js / TypeScript 项目中，将以下入门提示词复制给编程助手：

```text
请使用 @ohtaman/washi 编写并运行一个 TypeScript 脚本，将 8 场内部技术分享（Tech Talk）排入 2 间会议室（Room A、Room B）和 4 个时间段。
输入数据：构造包含讲师、主题（"infra"、"frontend"、"data"、"security"）以及不可用时间段的示例数组。
要求：
1. 每场分享恰好安排到 1 间会议室和 1 个时间段，每个会议室时间段最多安排 1 场。
2. 避开讲师不可用时间段，且同一讲师在同一时间段不能出现在两间会议室。
3. 最小化同一时间段并行会场中出现相同主题的次数。
4. 为每条约束指定清晰的英文名称，使用内置 HiGHS 求解，检查 m.hasPrimalSolution 并断言 m.verify().valid === true 后打印日程表。
```

运行该提示词时，助手会在本地依次执行三个步骤：

1. **构建数学模型**：定义有界二元变量（`m.binary`）、代数表达式（`` expr`...` ``、`sum`）、具名约束（`m.constraint(..., "name")`）以及目标函数（`m.objective(minimize(...))`）。
2. **在 Node.js 中通过 WebAssembly 求解**：使用内置 HiGHS WebAssembly 二进制文件直接运行脚本（例如 `npx tsx schedule.ts`），无需安装 Python 环境或本地编译求解器。
3. **独立校验求解结果**：检查 `m.hasPrimalSolution` 并调用 `m.verify()`，在展示结果前独立校验变量上下界、整数性与约束残差。

---

## 3. 常见问题类型与现成提示词

以下提示词模板覆盖了 WaSHI 支持的核心数学问题类别，可根据实际数据结构与规则调整后直接使用。

### 会议排程与评审人分配（MILP — 内置 HiGHS）

```text
请使用 @ohtaman/washi（内置 HiGHS），将 24 份技术方案 / PR 评审任务分配给 6 名工程师，使每份方案由 2 名不同的评审人负责。
规则：
- 作者本人不能评审自己的方案，且评审人必须至少匹配该方案要求的一个领域标签。
- 遵守每位工程师的最大评审数量上限，并最小化单个工程师承担的最大评审任务数（Min-Max 负载均衡）。
- 为所有约束命名，运行脚本并验证 m.hasPrimalSolution 与 m.verify().valid === true。
```

### 预算与项目组合优选（0-1 MIP — 内置 HiGHS）

```text
请使用 @ohtaman/washi（内置 HiGHS），从候选研发项目 JSON 列表中选择一组项目以最大化年度预期收益总和。
每个项目包含 cost、backend_engineers、frontend_engineers 与 savings。
规则：
- 季度总预算不超过 120，后端人力不超过 14，前端人力不超过 10。
- 依赖关系：若选择项目 "billing_v2"，则必须同时选择 "auth_token_service"。
- 互斥关系："legacy_search_tuning" 与 "vector_search_migration" 最多只能选择其一。
- 为每条约束指定清晰名称，并确认 m.verify().valid === true。
```

### 含先后顺序与共享资源的任务调度（CP/LCG — 内置 Pumpkin）

```text
请使用 @ohtaman/washi 及其内置 CP 求解器（@ohtaman/washi/solvers/pumpkin），为 10 个发布流水线任务安排整数开始时间（lb: 0, ub: 120，给定固定持续时间），以最小化总完工时间（makespan）。
规则：
- 满足依赖任务之间的“完成—开始”先后顺序约束。
- 使用预发压测集群的任务之间不能在时间上重叠（使用 disjoint）。
- 任意时刻所有并行任务占用的共享 CI 执行器总数不超过 4（使用 cumulative）。
- 使用 { solver: "pumpkin" } 求解，验证 m.hasPrimalSolution 与 m.verify().valid === true，并输出每个任务的开始与结束时间。
```

### 目标配比均衡与方差最小化（凸 QP — 内置 HiGHS）

内置 HiGHS 支持在纯连续变量（`m.continuous`）模型上求解凸二次目标函数：

```text
请使用 @ohtaman/washi（内置 HiGHS），使用 m.continuous 变量（lb: 0.05, ub: 0.50）将总预算 1.0 分配到 5 个区域算力池。
目标权重为 [0.30, 0.25, 0.20, 0.15, 0.10]，并要求区域 0 与区域 1 的份额之和不超过 0.48。
在满足 sum(w) == 1.0 与区域上限的条件下最小化平方偏差之和 expr`sum((${w} - ${target})^2)`，并验证 m.verify().valid === true。
```

### 规则与配置冲突诊断（不可行判定 / Unsat Core）

```text
请使用 @ohtaman/washi 与 @ohtaman/washi/solvers/pumpkin，通过 await m.check({ solver: "pumpkin" }) 检查一组基于有界整数与布尔变量的部署及特性开关规则是否可满足。
构造一个包含相互矛盾具名规则的测试用例，打印 res.status 与 res.unsatCore（或 res.conflicts），展示具体是哪几条具名规则发生了冲突。
```

> [!NOTE]
> `await m.check()` 默认即可配合内置 **HiGHS** 使用（通过弹性松弛定位冲突约束并返回于 `res.conflicts`）。若需在无需 `COOP`/`COEP` 响应头的环境下对有界整数与布尔模型提取 `res.unsatCore`，可导入内置的 `@ohtaman/washi/solvers/pumpkin`；若模型包含连续变量或实数系数并需要精确 SMT `unsatCore`，请安装 `z3-solver`（`@ohtaman/washi/solvers/z3`）。

---

## 4. 应用打包与分发提示词（单文件 HTML、桌面端与移动端）

当命令行脚本的建模与校验通过后，您可以让编程助手将同一模型打包为单文件网页工具或离线桌面/移动应用。

### 零服务器单文件 `.html` 工具（`file://` 双击即用）

```text
请将这个 @ohtaman/washi 优化模型打包为单个自包含的 .html 文件（内联 HTML、CSS 与 JavaScript），以便团队成员直接通过 file:// 双击打开使用。
- 从 https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js 加载 WaSHI（挂载于全局 window.Washi）。
- 提供 CSV / 文本输入框、“求解”按钮、最优分配结果表格，并在状态为 "Infeasible" 时调用 await m.check() 展示冲突规则。
- 每次求得可行解后均调用 m.verify() 进行校验。
```

- **`file://` 运行时说明**：
  - 从 HTTPS CDN 加载 `washi.min.js`（使用 Pumpkin 时同时加载 `solvers/pumpkin.min.js`）时，直接通过 `file://` 双击打开本地 `.html` 无需启动本地 HTTP 服务器即可工作——WaSHI 检测到不透明源（`window.origin === "null"`）时会自动切换为主线程执行。
  - 自托管的本地相对路径 `.wasm` 文件（在 `file://` 下会被浏览器的 `fetch()` CORS 规则拦截）以及 **Z3**（依赖 `SharedArrayBuffer` 与 `COOP`/`COEP` 响应头）仍需通过 `http://` 或 `https://` 服务访问。

### 离线桌面端与移动端应用（Vite + Tauri / Capacitor / PWA）

```text
请将这个 Vite + TypeScript 的 @ohtaman/washi 应用封装为离线运行的桌面端/移动端应用，使用内置 HiGHS（或 @ohtaman/washi/solvers/pumpkin），无需后端服务器，也无需本地编译 C++ 求解器。
- 所有求解计算均通过 @ohtaman/washi 在客户端本地完成。
- 配置内容安全策略（CSP）以允许 WebAssembly 编译（在 script-src 中加入 'wasm-unsafe-eval'）与 Web Worker（worker-src 'self' blob:）。
```

- **WebView 运行时说明**：标准 Vite 构建会将 `highs.wasm` 与 `pumpkin.wasm` 作为静态资源一并打包，可在 Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor 移动 WebView 以及离线 Service Worker PWA 中直接离线运行。关于 `tauri.conf.json` 的 CSP 配置（如 `'wasm-unsafe-eval'`），请参阅[运行时环境配置](./runtimes.md)。

---

## 5. 与编程助手协作迭代与调试

- **要求为所有约束命名并调用 `m.verify()`**：始终要求助手在调用 `m.constraint(c, "rule_name")`（以及 `m.indicator(...)` 的 `name`）时传入清晰的唯一名称，并在每次求解后断言 `m.verify().valid === true`。未命名的约束（`c_0`、`c_1`）会降低冲突诊断结果的可读性。
- **遇到 `"Infeasible"` 时使用 `m.check()` 定位冲突**：当新增业务规则导致 `m.solve()` 返回 `"Infeasible"` 时，可发送如下追问提示词：
  ```text
  添加新约束后 m.solve() 返回了 "Infeasible"。
  请调用 await m.check()（有界整数与布尔模型可调用 await m.check({ solver: "pumpkin" })），打印 res.conflicts / res.unsatCore，用通俗语言解释具体哪些具名规则与变量上下界相互矛盾，并建议将哪些非刚性规则改为带非负松弛惩罚变量的软约束。
  ```
- **上线前检查 `m.toLpString()` 与变量上下界**：让助手在小规模测试数据上输出 `m.toLpString()`，核对变量的 `lb` / `ub` 上下界（尤其是省略 `M` 时在 `m.indicator()` 中引用的变量必须设置有限上下界）、目标方向（`Maximize` / `Minimize`）以及不等号方向（`<=` / `>=`）是否与业务定义一致。
