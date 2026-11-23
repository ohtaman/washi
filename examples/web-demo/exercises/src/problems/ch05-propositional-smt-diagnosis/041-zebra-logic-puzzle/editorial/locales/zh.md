## 解题思路

通过 `m.bool()` 为每个类别 $c$、属性值 $v \in V_c$ 和位置 $p \in \{0, \dots, n-1\}$ 声明布尔变量 $x_{c,v,p}$。使用 `or(...)` 与成对的 `not(and(...))` 对每个位置和每个属性值施加 exact-one 约束，将各类结构化线索编译为命题逻辑约束，再调用 `await m.check({ solver: "z3" })` 求解。

## 数学模型

$$
\begin{aligned}
\text{find} \quad & x_{c,v,p} \in \{\text{false}, \text{true}\} && \forall c \in C,\; v \in V_c,\; p \in \{0, \dots, n-1\} \\
\text{s.t.} \quad & \bigvee_{v \in V_c} x_{c,v,p} \;\land\; \bigwedge_{u \neq v} \neg(x_{c,u,p} \land x_{c,v,p}) && \forall c \in C,\; p \in \{0, \dots, n-1\} \\
& \bigvee_{p=0}^{n-1} x_{c,v,p} \;\land\; \bigwedge_{p < q} \neg(x_{c,v,p} \land x_{c,v,q}) && \forall c \in C,\; v \in V_c \\
& \phi_{\text{clue}}(x) = \text{true} && \forall \text{clue} \in \text{clues}
\end{aligned}
$$

## 关键点

- **纯布尔 exact-one 编码**：用 `or(...)` 表示“至少一个”，用成对 `not(and(...))` 表示“至多一个”，即可在纯命题 SAT 框架下完成斑马谜题建模。
- **位置与相邻线索**：紧邻左侧（`immediate: true` 的 `leftOf`）对应 $x_{c_1,v_1,p} \implies x_{c_2,v_2,p+1}$ 并禁止 $p = n - 1$；一般 `leftOf` 与 `nextTo` 则将每个位置 $p$ 蕴涵到合法目标位置的析取上。
- 相关定义：[指南与术语表 — 问题族](?view=guide&lang=zh#paradigms) 与 [求解器状态](?view=guide&lang=zh#solver-status)。

## 核心实现

`exactOne` 辅助函数通过 `or(...)` 注册“至少一个”约束，并通过 `.forEach()` 注册成对的“至多一个”约束；最后若 `m.check({ solver: "z3" })` 未返回 `"Sat"`，则返回不可满足。

**WaSHI (TypeScript)**

```ts
function exactOne(m: Model, vars: BoolVar[], prefix: string): void {
  m.constraint(or(...vars), `${prefix}_at_least_one`);
  vars.forEach((vi, i) => {
    vars.slice(i + 1).forEach((vj, offset) => {
      m.constraint(not(and(vi, vj)), `${prefix}_at_most_one_${i}_${i + 1 + offset}`);
    });
  });
}

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
