import { Model } from "../../src/index.js";

const badge = document.getElementById("status-badge")!;
const output = document.getElementById("output")!;

async function run() {
  try {
    output.textContent = "Formulating 0-1 Knapsack problem...\n";

    // Standard zero-config model (NO setHighsWasmUrl, NO options.wasmUrl)
    const m = new Model({ name: "PureZeroConfig" });

    // Variables: Binary items
    const laptop = m.addVar({ name: "laptop", type: "Binary" });
    const phone = m.addVar({ name: "phone", type: "Binary" });
    const camera = m.addVar({ name: "camera", type: "Binary" });

    // Constraint: Total weight <= 5 kg (laptop: 3kg, phone: 1kg, camera: 3kg)
    m.addConstraint(
      laptop.mul(3).add(phone.mul(1)).add(camera.mul(3)).le(5),
      "max_weight"
    );

    // Objective: Maximize total value ($100, $60, $70)
    m.setObjective(
      laptop.mul(100).add(phone.mul(60)).add(camera.mul(70)),
      "Maximize"
    );

    output.textContent += "Calling m.solve() without any wasm configuration...\n";
    const startTime = performance.now();

    // Solve - this should automatically probe local, detect 404, and fetch from CDN
    const status = await m.solve();
    const durationMs = (performance.now() - startTime).toFixed(1);

    badge.textContent = `Status: ${status}`;
    badge.className = "badge optimal";

    const resultSummary = [
      `Status: ${status} (Solved in ${durationMs} ms)`,
      `Max Value: $${m.objectiveValue}`,
      "",
      "Packed Items:",
      `  • laptop : ${laptop.value} (weight: 3kg, value: $100)`,
      `  • phone  : ${phone.value} (weight: 1kg, value: $60)`,
      `  • camera : ${camera.value} (weight: 3kg, value: $70)`,
      "",
      "Total Weight: " + ((laptop.value ?? 0) * 3 + (phone.value ?? 0) * 1 + (camera.value ?? 0) * 3) + " / 5 kg",
    ].join("\n");

    output.textContent = resultSummary;
    console.log("[ZERO_CONFIG_VERIFIED]", {
      status,
      objectiveValue: m.objectiveValue,
      laptop: laptop.value,
      phone: phone.value,
      camera: camera.value,
    });
  } catch (err: any) {
    badge.textContent = "Error";
    badge.className = "badge error";
    output.textContent = `Failed to solve: ${err?.stack || err?.message || err}`;
    console.error("[ZERO_CONFIG_ERROR]", err);
  }
}

run();
