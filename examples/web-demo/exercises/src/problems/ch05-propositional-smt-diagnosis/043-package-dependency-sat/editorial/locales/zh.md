## 解题思路

为每对 `(pkg, ver)` 创建布尔变量 `pick[p][v]`（`m.bool`）和 0-1 计数变量 `used[p][v]`（`m.binary`），编码同包至多选一、根包必选其一、`requires` 蕴含以及 `conflicts` 排斥约束，最后用 `await m.solve({ solver: "z3" })` 最小化安装总包数。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && u_{p,v} \in \{0, 1\}
\end{aligned}
$$

## 核心要点

- **至多选一与恰好选一的 SAT 编码**：通过两两 `not(and(a, b))` 限制每个包最多安装一个版本；对根包额外加入 `or(...versions)` 即可升级为恰好安装一个版本。
- **诚实报告不可行冲突**：若出现菱形版本冲突，`m.solve({ solver: "z3" })` 返回 `"Infeasible"`，此时直接输出 `{ feasible: false, selected: null, installedCount: null }`。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

使用 `or(...)` 和 `implies(...)` 将必选根包与依赖规则注册为逻辑约束，用 `minimize(sum(allUsed))` 最小化 0-1 计数变量 `allUsed` 之和，并调用 `m.solve({ solver: "z3" })` 求得最优解。

**WaSHI (TypeScript)**

```ts
for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  m.constraint(implies(pick[req.pkg][req.ver], deps.length === 1 ? deps[0] : or(...deps)), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
