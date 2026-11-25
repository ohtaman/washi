# SMT 安全策略与逻辑验证 (Z3 SMT)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 命题逻辑与 SMT 可满足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `implies()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=smt_security">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">源代码</a></li></ul> |

**可满足性模理论（SMT, Satisfiability Modulo Theories）** 将布尔逻辑与整数范围、线性不等式等算术约束结合起来求解。

本示例演示如何使用 WaSHI 与 Z3 验证智能家居安防规则，并根据传感器读数推导系统状态。

## 业务场景

我们对一个包含传感器读数和逻辑规则的安防系统进行建模：
1. 环境照度（`luxLevel`）不超过 `50 lux` 时，进入夜间模式（`isNight`）。
2. 夜间（`isNight`）检测到移动（`motionDetected`）且警报处于布防状态（`alarmArmed`）时，必须触发警笛（`sirenActive`）。
3. 警报处于布防状态（`alarmArmed`）时，前门不能处于未锁状态（`frontDoorUnlocked`）。
4. 夜间（`isNight`）检测到移动（`motionDetected`）时，开启柔和照明灯（`lightsOn`）。

在当前观测到的传感器状态（`luxLevel <= 20`、`alarmArmed`、`motionDetected`）下，我们先推导系统的正常响应状态。随后形式化证明：在这些读数下，警笛（`sirenActive`）不可能保持关闭。

## WaSHI 实现

> [!NOTE]
> **Z3 前置条件：** 引入 `@ohtaman/washi/solvers/z3` 需要先安装可选对等依赖 `z3-solver`（`npm install z3-solver`）。在浏览器中使用 Z3 还需要配置 `COOP` / `COEP` 响应头，详见 [跨源隔离](../getting-started/cross-origin.md)。

<CodeRunner preset="smt_security">

```typescript
import { Model, implies, not, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartHomeSecurity", solver: "z3" });

  // 1. 布尔命题变量
  const isNight = m.bool("isNight");
  const motionDetected = m.bool("motionDetected");
  const alarmArmed = m.bool("alarmArmed");
  const frontDoorUnlocked = m.bool("frontDoorUnlocked");
  const sirenActive = m.bool("sirenActive");
  const lightsOn = m.bool("lightsOn");

  // 2. 算术度量变量（照度传感器 lux）
  const luxLevel = m.integer("luxLevel", { lb: 0, ub: 1000 });

  // 规则 1: luxLevel <= 50 蕴含 isNight
  m.constraint(implies(expr`${luxLevel} <= 50`, isNight), "dark_implies_night");

  // 规则 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.constraint(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // 规则 3: alarmArmed => NOT(frontDoorUnlocked)
  m.constraint(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // 规则 4: (motionDetected AND isNight) => lightsOn
  m.constraint(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. 观测到的上下文状态
  m.constraint(expr`${luxLevel} <= 20`, "sensor_reading_dark");
  m.constraint(alarmArmed, "user_armed_alarm");
  m.constraint(motionDetected, "sensor_motion_triggered");

  // 检查可满足性并推导系统状态
  const res = await m.check();

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. 安全性属性的形式化验证（反例搜索 / 反证法）：
  // 证明在该传感器状态下，“警笛不响 (not(sirenActive))”是不可能的（Unsat）
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check();
  console.log(`Can siren stay off? ${proof.status} (Proven safe when Unsat)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## 实战要点

### 反证法形式化验证（反例搜索）

单次 `m.check()` 返回 `"Sat"` 只说明至少存在一种合法状态。若要证明某项安全属性 `P`（如 `sirenActive`）必然成立，应加入其否定 `not(P)` 再调用 `m.check()`。返回 `"Unsat"` 表示不存在反例；返回 `"Sat"` 时，变量取值即给出具体的安全漏洞反例。

在本例中，首次检查返回 `"Sat"`，推导出 `sirenActive = true`、`lightsOn = true`、`isNight = true` 且前门上锁。加入 `not(sirenActive)` 后返回 `"Unsat"` 及由 6 条规则组成的证明核，并自动排除了无关的 `lock_safety_rule` 与 `comfort_lights`。

### 单向蕴含（`implies`）与双向等价

`` implies(expr`${luxLevel} <= 50`, isNight) `` 仅在 `luxLevel <= 50` 为真时限制 `isNight`。当 `luxLevel > 50` 时，`isNight` 不受该规则约束，取 `true` 或 `false` 均可。若要表达双向等价，需同时添加逆命题 `` implies(isNight, expr`${luxLevel} <= 50`) ``（或与其逻辑等价的否命题 `` implies(expr`${luxLevel} >= 51`, not(isNight)) ``）。

### 离散模型的替代求解器

此模型仅包含 `BoolVar` 和有界整数（`luxLevel` 范围为 `[0, 1000]`）。因此，使用内置的 `@ohtaman/washi/solvers/pumpkin` 并调用 `m.check({ solver: "pumpkin" })` 也能完成相同的推导与反例验证。
