import { describe, it, expect } from "vitest";
import { Model, sum } from "../src/modeler/index.js";
import fs from "node:fs";
import path from "node:path";

describe("HiGHS WebAssembly Binary Verification", () => {
  it("verifies public/highs.wasm exists and is valid WebAssembly", async () => {
    const wasmPath = path.resolve(process.cwd(), "public/highs.wasm");
    expect(fs.existsSync(wasmPath)).toBe(true);

    const buf = fs.readFileSync(wasmPath);
    // WASM magic bytes: 0x00 0x61 0x73 0x6d (\0asm)
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0x61);
    expect(buf[2]).toBe(0x73);
    expect(buf[3]).toBe(0x6d);
  });

  it("solves multi-variable problem end-to-end", async () => {
    const m = new Model({ name: "EndToEndTest", sense: "Minimize" });
    const x = m.continuous(3, { lb: 0 });

    // Minimize 2*x0 + 3*x1 + x2
    m.minimize(x[0].mul(2).add(x[1].mul(3)).add(x[2]));

    // Subject to:
    // x0 + x1 >= 5
    m.constrain(x[0].add(x[1]).ge(5));
    // x1 + x2 >= 8
    m.constrain(x[1].add(x[2]).ge(8));

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(18); // x0=5, x1=0, x2=8 -> 2*5 + 1*8 = 18
    expect(x[0].value).toBe(5);
    expect(x[1].value).toBe(0);
    expect(x[2].value).toBe(8);
  });
});
