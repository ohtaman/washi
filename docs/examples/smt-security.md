# SMT Security Policies

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Propositional Logic & SMT | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_security">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">Source Code</a></li></ul> |

Satisfiability Modulo Theories (SMT) combines propositional logic (Boolean SAT) with first-order theories (linear integer arithmetic, real inequalities).

This example demonstrates how to formally verify and deduce system states in an IoT home security system using WaSHI and the Z3 solver engine.

## The Scenario

We model a security rule system with sensor readings and logic rules:
1. When ambient light $\le 50$, it implies night time (`isNight`).
2. When motion is detected at night and the alarm is armed, the siren must sound.
3. If the alarm is armed, the front door must never be unlocked.
4. When motion is detected at night, comfort lights should turn on.

## Implementation in WaSHI

<CodeRunner preset="smt_security">

```typescript
import { Model, not, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartHomeSecurity", solver: "z3" });

  // 1. Boolean Propositional Variables
  const isNight = m.bool("isNight");
  const motionDetected = m.bool("motionDetected");
  const alarmArmed = m.bool("alarmArmed");
  const frontDoorUnlocked = m.bool("frontDoorUnlocked");
  const sirenActive = m.bool("sirenActive");
  const lightsOn = m.bool("lightsOn");

  // 2. Arithmetic metric (lux sensor)
  const luxLevel = m.integer("luxLevel", { lb: 0, ub: 1000 });

  // Rule 1: luxLevel <= 50 implies isNight
  m.constraint(luxLevel.le(50).implies(isNight), "dark_implies_night");

  // Rule 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.constraint(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // Rule 3: alarmArmed => NOT(frontDoorUnlocked)
  m.constraint(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // Rule 4: (motionDetected AND isNight) => lightsOn
  m.constraint(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. Observed Context
  m.constraint(expr`${luxLevel} <= 20`, "sensor_reading_dark");
  m.constraint(alarmArmed, "user_armed_alarm");
  m.constraint(motionDetected, "sensor_motion_triggered");

  // Check satisfiability and deduce state
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. Formal Safety Verification (Counterexample Search):
  // Prove that the siren CANNOT remain off under these sensor readings
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check({ solver: "z3" });
  console.log(`Can siren stay off? ${proof.status} (Proven safe when Unsat)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## Practical Notes

- **Proof by Refutation (Counterexample Search)**: A single `Sat` check shows that *a* valid assignment exists. To formally prove that a safety property $P$ (such as `sirenActive`) **must** hold in *every* valid state, assert its negation `not(P)` and verify that `m.check()` returns `"Unsat"`. If it returns `"Sat"`, the solver's variable values give you a concrete counterexample (security loophole).
- **One-Way Implication (`implies`) vs. Equivalence**: In classical logic, `luxLevel.le(50).implies(isNight)` only constrains `isNight` when `luxLevel <= 50`. During daytime (`luxLevel > 50`), `isNight` is unconstrained ("open-world" assumption) and could be assigned either `true` or `false` unless you also add the converse rule `luxLevel.ge(51).implies(not(isNight))`.
