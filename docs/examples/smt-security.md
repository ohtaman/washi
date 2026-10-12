# SMT Security Policies

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Propositional Logic & SMT | Z3 (`@ohtaman/washi/solvers/z3`) | `m.addBoolVar()`, `.implies()`, `.and()`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">Source Code</a></li></ul> |

Satisfiability Modulo Theories (SMT) combines propositional logic (Boolean SAT) with first-order theories (linear integer arithmetic, real inequalities).

This example demonstrates how to formally verify and deduce system states in an IoT home security system using WaSHI and the Z3 solver engine.

## The Scenario

We model a security rule system with sensor readings and logic rules:
1. When ambient light $\le 50$, it implies night time (`isNight`).
2. When motion is detected at night and the alarm is armed, the siren must sound.
3. If the alarm is armed, the front door must never be unlocked.
4. When motion is detected at night, comfort lights should turn on.

## Implementation in WaSHI

<CodeRunner preset="smt_sat_scheduling">

```typescript
import { Model, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartHomeSecurity", solver: "z3" });

  // 1. Boolean Propositional Variables
  const isNight = m.addBoolVar("isNight");
  const motionDetected = m.addBoolVar("motionDetected");
  const alarmArmed = m.addBoolVar("alarmArmed");
  const frontDoorUnlocked = m.addBoolVar("frontDoorUnlocked");
  const sirenActive = m.addBoolVar("sirenActive");
  const lightsOn = m.addBoolVar("lightsOn");

  // 2. Arithmetic metric (lux sensor)
  const luxLevel = m.addVar({ name: "luxLevel", type: "Integer", lb: 0, ub: 1000 });

  // Rule 1: luxLevel <= 50 implies isNight
  m.addConstraint(luxLevel.le(50).implies(isNight), "dark_implies_night");

  // Rule 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.addConstraint(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // Rule 3: alarmArmed => NOT(frontDoorUnlocked)
  m.addConstraint(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // Rule 4: (motionDetected AND isNight) => lightsOn
  m.addConstraint(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. Observed Context
  m.addConstraint(luxLevel.le(20), "sensor_reading_dark");
  m.addConstraint(alarmArmed, "user_armed_alarm");
  m.addConstraint(motionDetected, "sensor_motion_triggered");

  // Check satisfiability and deduce state
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
