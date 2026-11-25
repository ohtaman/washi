# 使用 AI 编程助手

本指南介绍如何配置 AI 编程助手，用 `@ohtaman/washi` 构建、验证并打包数理优化与约束模型。涵盖 Claude Code、Cursor、Codex、Antigravity、Gemini CLI 与 Windsurf 等常见工具。

---

## 1. 环境与工具配置

配合编程助手使用 WaSHI 分为两步。首先在项目中安装运行时库，然后将助手接入 WaSHI 的 API 参考与验证流程。

### 安装运行时库

安装 `@ohtaman/washi` 即内置 **HiGHS**，用于线性、混合整数与凸二次规划（`LP`/`MIP`/`QP`），同时也零外部依赖地内置了约束规划（`CP`）求解器 **Pumpkin**：

```bash
npm install @ohtaman/washi

# 仅在需要 SMT 求解器（Z3：连续变量逻辑约束等）或 GLPK 时按需安装可选依赖：
# npm install z3-solver
# npm install glpk.js
```

### 配置编程助手上下文

根据您使用的开发工具选择对应的接入方式：

| 接入方式 | 适用工具 | 配置方法 |
| --- | --- | --- |
| **Agent Skill** *(推荐)* | Claude Code、Cursor、Codex、Antigravity、Gemini CLI | 运行 `npx skills add ohtaman/washi` |
| **IDE `@Docs` 索引** | Cursor、Windsurf | 添加 `https://washi.ohtaman.dev/llms.txt` 或 `https://washi.ohtaman.dev/llms-full.txt` |
| **Context7 MCP** | 支持 MCP 的助手 | 引用库 ID `/ohtaman/washi` |

安装 Agent Skill 后，会将 `SKILL.md` 配置到编程助手的技能目录中。它帮助助手掌握求解器选型、`expr` 建模，以及使用 `m.toLpString()`、`m.verify()` 和 `m.check()` 进行调试。

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

1. **构建数学模型**：用 `m.binary()` 声明 0-1 二元变量，并通过 `` expr`...` `` 与 `sum()` 编写表达式、具名约束及最小化目标。
2. **在 Node.js 中通过 WebAssembly 求解**：运行脚本（例如 `npx tsx schedule.ts`），并使用内置 HiGHS WebAssembly 二进制文件完成求解。无需 Python 环境或本地编译求解器。
3. **独立校验求解结果**：检查 `m.hasPrimalSolution` 并调用 `m.verify()`。这会在输出结果前独立确认上下界、整数性与约束满足情况。

---

## 3. 常见问题类型与现成提示词

先在下表中找到对应的问题类型与推荐求解器，再根据您的数据结构修改相应提示词模板：

| 问题类型 | 推荐求解器 | 核心建模原语 |
| --- | --- | --- |
| 分配、排程与 0-1 选择（`MILP` / `0-1 MIP`） | 内置 **HiGHS** | `m.binary()`、`sum()`、`dot()` |
| 含共享资源的任务调度（`CP`） | 内置 **Pumpkin** | `disjoint()`、`cumulative()`、`distinct()` |
| 目标配比均衡与方差最小化（凸 `QP`） | 内置 **HiGHS** | `m.continuous()`、`` expr`...^2` `` |
| 规则冲突诊断（`unsatCore`） | 内置 **Pumpkin** 或可选 **Z3** | `m.check()` |

### 评审人分配与负载均衡（MILP — 内置 HiGHS）

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
- 季度总预算不超过 120，后端工程师不超过 14 人，前端工程师不超过 10 人。
- 依赖关系：若选择项目 "billing_v2"，则必须同时选择 "auth_token_service"。
- 互斥关系："legacy_search_tuning" 与 "vector_search_migration" 最多只能选择其一。
- 为每条约束指定清晰名称，并确认 m.verify().valid === true。
```

### 含先后顺序与共享资源的任务调度（CP — 内置 Pumpkin）

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
> `await m.check()` 默认即可配合内置 **HiGHS** 使用，并在 `res.conflicts` 中返回冲突约束名称。
>
> 若需提取精确的不可满足核心（`res.unsatCore`），请按变量类型选择求解器：
> - **有界整数与布尔变量**：导入内置的 `@ohtaman/washi/solvers/pumpkin`（无需浏览器 `COOP`/`COEP` 响应头）。
> - **连续变量或非整数（小数/分数）系数**：安装 `z3-solver` 并导入 `@ohtaman/washi/solvers/z3`。

---

## 4. 应用打包与分发提示词（单文件 HTML、桌面端与移动端）

命令行脚本验证通过后，您可以让编程助手将同一模型打包为单文件网页工具或离线应用。

### 零服务器单文件 `.html` 工具（双击本地文件 `file://` 即用）

```text
请将这个 @ohtaman/washi 优化模型打包为单个自包含的 .html 文件（内联 HTML、CSS 与 JavaScript），以便团队成员直接双击本地 .html 文件（file://）打开使用。
- 从 https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js 加载 WaSHI（挂载于全局 window.Washi）。
- 提供 CSV / 文本输入框、“求解”按钮、最优分配结果表格，并在状态为 "Infeasible" 时调用 await m.check() 展示冲突规则。
- 每次求得可行解后均调用 m.verify() 进行校验。
```

**`file://` 运行机制说明**：

| 场景 | 行为与前提条件 |
| --- | --- |
| **CDN 脚本** | 从 HTTPS CDN 加载 `washi.min.js` 可在 `file://` 下直接运行，无需本地服务器。遇到不透明源（`window.origin === "null"`）时，WaSHI 会自动在主线程运行 HiGHS 与 Pumpkin。 |
| **自托管 `.wasm`** | 浏览器会在 `file://` 下拦截本地 `.wasm` 的 `fetch()` 请求。自托管 WebAssembly 资源请通过 `http://` 或 `https://` 提供。 |
| **浏览器中的 Z3** | 需要安全上下文（`https://` 或 `http://localhost`，普通 `http://` 局域网地址不行）以及 `Cross-Origin-Opener-Policy` 和 `Cross-Origin-Embedder-Policy`（`COOP`/`COEP`），详见[跨源隔离配置](./cross-origin.md)。 |

### 离线桌面端与移动端应用（Vite + Tauri / Capacitor / PWA）

```text
请将这个 Vite + TypeScript 的 @ohtaman/washi 应用封装为离线运行的桌面端/移动端应用，使用内置 HiGHS（或 @ohtaman/washi/solvers/pumpkin），无需后端服务器，也无需本地编译原生求解器。
- 所有求解计算均通过 @ohtaman/washi 在客户端本地完成。
- 配置内容安全策略（CSP）以允许 WebAssembly 编译（在 script-src 中加入 'wasm-unsafe-eval'）与 Web Worker（worker-src 'self' blob:）。
```

**WebView 部署机制说明**：

标准 Vite 构建会将所使用的求解器 `.wasm` 资源（`highs.wasm`，以及导入时的 `pumpkin.wasm`）打包为静态资源，可在 Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor 移动 WebView 与离线 PWA 中直接运行。请在内容安全策略（`CSP`）的 `script-src` 中加入 `'wasm-unsafe-eval'`（使用 Web Worker 时同时配置 `worker-src 'self' blob:`）；完整的 `tauri.conf.json` 示例请参阅[运行时环境与部署配置](./runtimes.md)。

---

## 5. 与编程助手协作迭代与调试

### 为所有约束命名并校验每次求解

要求助手在调用 `m.constraint(c, "rule_name")` 和 `m.indicator(...)` 时传入清晰的名称，并断言 `m.verify().valid === true`。未命名约束会按从 1 开始的编号自动命名（线性约束为 `c_1`、`c_2`，逻辑约束为 `lc_1`、`lc_2`），不利于排查冲突。

### 遇到 `"Infeasible"` 时用 `m.check()` 定位冲突

当新增规则导致 `m.solve()` 返回 `"Infeasible"` 时，可发送如下追问提示词：

```text
添加新约束后 m.solve() 返回了 "Infeasible"。
请调用 await m.check()（有界整数与布尔模型可调用 await m.check({ solver: "pumpkin" })），打印 res.conflicts / res.unsatCore，用通俗语言解释具体哪些具名规则与变量上下界相互矛盾，并建议将哪些非刚性规则改为带非负松弛惩罚变量的软约束。
```

### 上线前检查 `m.toLpString()` 与变量上下界

让助手在小规模测试数据上打印 `m.toLpString()`，重点核对以下三项：

- **有限上下界（`lb` / `ub`）**：省略 `M` 时，`m.indicator()` 中引用的变量必须设置有限上下界。
- **目标方向**：确认 `Maximize` 或 `Minimize` 与业务目标一致。
- **约束等号与不等号**：逐一核查所有 `<=`、`>=` 与 `=` 的类型和方向是否符合预期。
