# SMT 安全策略与逻辑验证 (Z3 SMT)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 命题逻辑与 SMT 可满足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `implies()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_security">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">源代码</a></li></ul> |

可满足性模理论（SMT, Satisfiability Modulo Theories）将命题逻辑（布尔 SAT）与一阶理论（如线性整数算术、实数不等式）结合在一起。

本示例展示如何使用 WaSHI 与 Z3 求解器引擎，对智能家居 IoT 安防系统中的复合业务规则与系统状态进行形式化验证和逻辑推导。

## 业务场景

我们对一个包含传感器读数和逻辑规则的安防规则系统进行建模：
1. 当环境照度 $\le 50$ 时，判定当前为夜间模式（`isNight`）。
2. 当在夜间检测到移动且警报处于布防状态时，必须触发警笛（`sirenActive`）。
3. 如果警报处于布防状态，则前门绝不能处于未锁状态（`frontDoorUnlocked`）。
4. 当在夜间检测到移动时，应当自动开启柔和照明灯（`lightsOn`）。

## WaSHI 实现

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
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. 安全性属性的形式化验证（反例搜索 / 反证法）：
  // 证明在该传感器状态下，“警笛不响 (not(sirenActive))”是不可能的（Unsat）
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check({ solver: "z3" });
  console.log(`Can siren stay off? ${proof.status} (返回 Unsat 即证明无安全漏洞)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## 实战要点

- **反证法形式化验证（反例搜索）**：单次 `check()` 返回 `"Sat"` 仅表明*存在*满足规则的状态。若要严格**证明**某项安全属性 $P$（如 `sirenActive`）在所有可能状态下*必然*成立，应断言其否定式 `not(P)` 并验证 `m.check()` 返回 `"Unsat"`。若返回 `"Sat"`，此时求解器给出的变量赋值即为一个具体的安全漏洞反例。
- **单向蕴含（`implies`）与双向等价**：`` implies(expr`${luxLevel} <= 50`, isNight) `` 仅规定当 `luxLevel <= 50` 时 `isNight` 必为 `true`；当白天（`luxLevel > 50`）时，`isNight` 并不受此规则限制（开放世界假设）。若需表达充要条件，还需补充逆否规则 `` implies(expr`${luxLevel} >= 51`, not(isNight)) ``。
