## 解题思路

为每对软件包与版本 $(p, v)$ 引入布尔选择变量 $x_{p,v} \in \{\text{false}, \text{true}\}$ 及通过 $x_{p,v} \iff (u_{p,v} = 1)$ 关联的 0-1 计数变量 $u_{p,v} \in \{0, 1\}$。在约束同包至多选一、必选根包恰好选一、`requires` 蕴含以及 `conflicts` 互斥的前提下，最小化 $\sum_{p,v} u_{p,v}$。在 WaSHI 中，将两者分别映射为 `pick[p][v]`（`m.bool`）和 `used[p][v]`（`m.binary`），并调用 `await m.solve({ solver: "z3" })` 求解。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && \forall p, \; v \in V_p \\
& x_{p,v} \in \{\text{false}, \text{true}\}, \; u_{p,v} \in \{0, 1\} && \forall p, \; v \in V_p
\end{aligned}
$$

## 核心要点

- **至多选一与恰好选一的 SAT 编码**：通过两两 `not(and(a, b))` 限制每个包最多安装一个版本；对根包额外加入 `or(...versions)` 即可升级为恰好安装一个版本。
- **`BoolVar` 与 `m.binary` 的双向通道约束**：逻辑组合子作用于 `BoolVar`，而 `minimize(sum(...))` 累加的是算术变量 `Var`，因此需将每个 `m.bool(...)` 与 `m.binary(...)` 指示变量通过双向 `implies`（``implies(b, expr`${u} == 1`)`` 与 ``implies(not(b), expr`${u} == 0`)``）关联。
- **处理不可行依赖图**：当依赖与冲突约束导致不存在合法安装方案时，`m.solve({ solver: "z3" })` 返回 `"Infeasible"`，此时直接返回 `{ feasible: false, selected: null, installedCount: null }`。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

通过双向 `implies` 将每个布尔变量 `b` 与 0-1 计数变量 `u` 关联，用 `or(...)` 和 `implies(...)` 注册必选根包与依赖规则（`depVersions` 为空时直接禁止 `pkg@ver`），再用 `minimize(sum(allUsed))` 与 `m.solve({ solver: "z3" })` 求得最优解。

**WaSHI (TypeScript)**

```ts
const b = m.bool(`pick_${pkg}_${ver}`);
const u = m.binary(`used_${pkg}_${ver}`);
m.constraint(implies(b, expr`${u} == 1`), `link_on_${pkg}_${ver}`);
m.constraint(implies(not(b), expr`${u} == 0`), `link_off_${pkg}_${ver}`);

for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  const rhs = deps.length === 0 ? not(pick[req.pkg][req.ver]) : deps.length === 1 ? deps[0] : or(...deps);
  m.constraint(deps.length === 0 ? rhs : implies(pick[req.pkg][req.ver], rhs), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
