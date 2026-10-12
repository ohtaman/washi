/**
 * Example 4: Smart Home Security Rules (SMT / SAT)
 * 
 * Demonstrates:
 * - Propositional boolean variables (BoolVar)
 * - First-class logic operators: and, or, not, implies, xor
 * - Satisfiability checking via check({ solver: "z3" })
 * 
 * Run with: npx tsx examples/node/04-smt-security-rules.ts
 */

import { Model, not, expr } from "../../src/index.js";
import { registerZ3Solver } from "../../src/modeler/solvers/z3.js";

async function main() {
  console.log("=== Smart Home Security Rules (SMT / SAT) ===");

  // Enable optional Z3 solver plugin
  registerZ3Solver();

  const m = new Model({ name: "SmartHomeSecurity", solver: "z3" });

  // 1. Boolean Propositional Variables
  const isNight = m.addBoolVar("isNight");
  const motionDetected = m.addBoolVar("motionDetected");
  const alarmArmed = m.addBoolVar("alarmArmed");
  const frontDoorUnlocked = m.addBoolVar("frontDoorUnlocked");
  const sirenActive = m.addBoolVar("sirenActive");
  const lightsOn = m.addBoolVar("lightsOn");

  // 2. Arithmetic metric (continuous sensor)
  const luxLevel = m.integer("luxLevel", { lb: 0, ub: 1000 });

  // Rule 1: Sensor reading <= 50 implies night
  m.constrain(luxLevel.le(50).implies(isNight), "dark_implies_night");

  // Rule 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.constrain(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // Rule 3: alarmArmed => NOT(frontDoorUnlocked)
  m.constrain(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // Rule 4: (motionDetected AND isNight) => lightsOn
  m.constrain(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. Observed Context
  m.constrain(expr`${luxLevel} <= 20`, "sensor_reading_dark");
  m.constrain(alarmArmed, "user_armed_alarm");
  m.constrain(motionDetected, "sensor_motion_triggered");

  console.log("Checking security satisfiability with Z3...");
  const res = await m.check({ solver: "z3" });

  console.log(`\nStatus: ${res.status}`);
  console.log("Deduced System State:");
  console.log(`  • Siren Active : ${m.values.get("sirenActive")}`);
  console.log(`  • Lights On    : ${m.values.get("lightsOn")}`);
  console.log(`  • Door Locked  : ${m.values.get("frontDoorUnlocked") ? "No (Unlocked)" : "Yes (Locked)"}`);
  console.log(`  • Is Night     : ${m.values.get("isNight")}`);
}

main().catch(console.error);
