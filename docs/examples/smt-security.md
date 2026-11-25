# SMT Security Policies

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Propositional Logic & SMT | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `implies()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=smt_security">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">Source Code</a></li></ul> |

**Satisfiability Modulo Theories (SMT)** combines Boolean logic with arithmetic inequalities such as integer bounds and linear comparisons.

This example verifies safety rules and deduces system states for a smart-home security system using WaSHI and Z3.

## The Scenario

We model a security rule system driven by sensor readings and logical policies:
1. When ambient light (`luxLevel`) is at most `50 lux`, the system enters night mode (`isNight`).
2. When motion (`motionDetected`) is detected at night (`isNight`) while the alarm is armed (`alarmArmed`), the siren (`sirenActive`) must sound.
3. While the alarm is armed (`alarmArmed`), the front door (`frontDoorUnlocked`) must stay locked.
4. When motion (`motionDetected`) is detected at night (`isNight`), comfort lights (`lightsOn`) turn on.

## Implementation in WaSHI

> [!NOTE]
> **Z3 Prerequisites:** Importing `@ohtaman/washi/solvers/z3` requires the optional `z3-solver` peer dependency (`npm install z3-solver`). Running Z3 in a browser also requires Cross-Origin Isolation (`COOP` / `COEP`) headers — see [Cross-Origin Isolation](../getting-started/cross-origin.md).

<CodeRunner preset="smt_security">

```typescript
import { Model, implies, not, expr } from "@ohtaman/washi";
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
  m.constraint(implies(expr`${luxLevel} <= 50`, isNight), "dark_implies_night");

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
  const res = await m.check();

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. Formal Safety Verification (Counterexample Search):
  // Prove that the siren CANNOT remain off under these sensor readings
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check();
  console.log(`Can siren stay off? ${proof.status} (Proven safe when Unsat)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## Practical Notes

### Proof by Refutation (Counterexample Search)

A single `"Sat"` result only shows that at least one valid assignment exists. To prove that a safety property `P` (such as `sirenActive`) always holds, add its negation `not(P)` and call `m.check()`. If the solver returns `"Unsat"`, no counterexample exists; if it returns `"Sat"`, the variable values show a concrete loophole.

### One-Way Implication (`implies`) vs. Equivalence

The rule `` implies(expr`${luxLevel} <= 50`, isNight) `` only constrains `isNight` when `luxLevel <= 50` is true. When `luxLevel > 50`, `isNight` is unconstrained and may be assigned either `true` or `false`. To enforce an exact two-way equivalence, also add the converse rule `` implies(isNight, expr`${luxLevel} <= 50`) `` (or its logically equivalent inverse, `` implies(expr`${luxLevel} >= 51`, not(isNight)) ``).

### Alternative Solver for Discrete Models

This model contains only `BoolVar` variables and bounded integers (`luxLevel` in `[0, 1000]`). As a result, the same deduction and counterexample proof also work with bundled `@ohtaman/washi/solvers/pumpkin` via `m.check({ solver: "pumpkin" })`.
