# SMT 安全策略与逻辑验证 (Z3 SMT)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 命题逻辑与 SMT 可满足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">源代码</a></li></ul> |

可满足性模理论（SMT, Satisfiability Modulo Theories）将命题逻辑（布尔 SAT）与一阶理论（如线性整数算术、实数不等式）结合在一起。

本示例展示如何使用 WaSHI 与 Z3 求解器引擎，对智能家居 IoT 安防系统中的复合业务规则与系统状态进行形式化验证和逻辑推导。

## 业务场景

我们对一个包含传感器读数和逻辑规则的安防规则系统进行建模：
1. 当环境照度 $\le 50$ 时，判定当前为夜间模式（`isNight`）。
2. 当在夜间检测到移动且警报处于布防状态时，必须触发警笛（`sirenActive`）。
3. 如果警报处于布防状态，则前门绝不能处于未锁状态（`frontDoorUnlocked`）。
4. 当在夜间检测到移动时，应当自动开启柔和照明灯（`lightsOn`）。

## WaSHI 实现

<CodeRunner preset="smt_sat_scheduling">

```typescript
import { Model, not, expr } from "@ohtaman/washi";
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
  m.constraint(luxLevel.le(50).implies(isNight), "dark_implies_night");

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
}

verifySecurityRules();
```

</CodeRunner>
