import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";
import fs from "node:fs";

describe("Browser End-to-End (E2E) Tests", () => {
  let viteServer: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let devServerUrl = "http://localhost:5173/demo/";
  const screenshotsDir = path.resolve(process.cwd(), "test/screenshots");

  beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Start Vite dev server programmatically
    viteServer = await createServer({
      configFile: path.resolve(process.cwd(), "vite.config.ts"),
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    const port = typeof address === "object" && address ? address.port : 5173;
    devServerUrl = `http://localhost:${port}/demo/`;

    browser = await chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });

    page.on("console", (msg) => {
      console.log(`[PAGE ${msg.type()}]:`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.error("[PAGE ERROR]:", err);
    });
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (viteServer) {
      await viteServer.close();
    }
  });

  it("loads the demo playground and verifies title and branding", async () => {
    await page.goto(devServerUrl, { waitUntil: "networkidle" });

    const title = await page.title();
    expect(title).toContain("WaSHI Playground");

    const brandTitle = await page.textContent(".brand-title");
    expect(brandTitle).toContain("WaSHI Playground");

    const wasmBadge = await page.textContent(".status-chip");
    expect(wasmBadge).toContain("HiGHS v1.15.3 (WASM)");
  }, 15000);

  it("automatically solves the initial Production Planning problem with HiGHS", async () => {
    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("vars-tbody")?.textContent?.includes("chairs"),
      { timeout: 15000 }
    );

    const objText = await page.textContent("#metric-obj");
    expect(objText).toBe("1100");

    // Verify chairs and tables values in variable table
    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("chairs");
    expect(tableText).toContain("20");
    expect(tableText).toContain("tables");
    expect(tableText).toContain("10");

    await page.screenshot({ path: path.join(screenshotsDir, "01_initial_production_optimal.png") });
  }, 15000);

  it("switches to 0-1 Knapsack problem and solves interactively", async () => {
    await page.selectOption("#preset-select", "knapsack");
    await page.click("#run-btn");

    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("metric-obj")?.textContent === "120" &&
        document.getElementById("vars-tbody")?.textContent?.includes("Drone"),
      { timeout: 15000 }
    );

    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("Drone");
    expect(tableText).toContain("Camera");

    await page.screenshot({ path: path.join(screenshotsDir, "02_knapsack_solution.png") });
  }, 15000);

  it("switches to Transportation problem and solves distribution network", async () => {
    await page.selectOption("#preset-select", "transportation");
    await page.click("#run-btn");

    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("vars-tbody")?.textContent?.includes("ship_Tokyo"),
      { timeout: 15000 }
    );

    const objText = await page.textContent("#metric-obj");
    expect(Number(objText)).toBeGreaterThan(0);

    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("ship_Tokyo");

    await page.screenshot({ path: path.join(screenshotsDir, "03_transportation_solution.png") });
  }, 15000);

  it("switches to Markowitz Portfolio Optimization (Convex QP) and solves", async () => {
    await page.selectOption("#preset-select", "portfolio_qp");
    await page.click("#run-btn");

    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("vars-tbody")?.textContent?.includes("weight_Tech"),
      { timeout: 15000 }
    );

    const objText = await page.textContent("#metric-obj");
    const objVal = parseFloat(objText || "0");
    expect(objVal).toBeGreaterThan(0);

    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("weight_Tech");
    expect(tableText).toContain("weight_Bonds");

    await page.screenshot({ path: path.join(screenshotsDir, "04_portfolio_qp_optimal.png") });
  }, 15000);

  it("switches tabs to inspect CPLEX LP Format and Logs", async () => {
    // Click CPLEX LP Tab
    await page.click("#tab-btn-lp");
    const lpTabVisible = await page.evaluate(
      () => document.getElementById("tab-lp")?.classList.contains("active")
    );
    expect(lpTabVisible).toBe(true);

    const lpText = await page.textContent("#lp-output");
    expect(lpText).toContain("Subject To");
    expect(lpText).toContain("Bounds");
    expect(lpText).toContain("End");

    // Click Solver Logs Tab
    await page.click("#tab-btn-logs");
    const logsTabVisible = await page.evaluate(
      () => document.getElementById("tab-logs")?.classList.contains("active")
    );
    expect(logsTabVisible).toBe(true);

    // Switch back to results tab
    await page.click("#tab-btn-results");
    const resultsTabVisible = await page.evaluate(
      () => document.getElementById("tab-results")?.classList.contains("active")
    );
    expect(resultsTabVisible).toBe(true);
  }, 15000);

  it("switches solver to Z3 and diagnoses conflicting constraints (Unsat Core)", async () => {
    await page.selectOption("#solver-select", "z3");
    expect(await page.textContent("#solver-badge-text")).toContain("Z3 v5.2.0 (SMT/SAT/MIP)");

    await page.selectOption("#preset-select", "conflict_diagnosis_unsat");
    await page.click("#run-btn");

    await page.waitForFunction(
      () => {
        const s = document.getElementById("metric-status")?.textContent;
        return s === "Infeasible" || s === "Unsat";
      },
      { timeout: 30000 }
    );

    const isUnsatCoreVisible = await page.isVisible("#unsat-core-box");
    expect(isUnsatCoreVisible).toBe(true);

    const unsatCoreText = await page.textContent("#unsat-core-list");
    expect(unsatCoreText).toContain("strict_board_budget_cap");
    expect(unsatCoreText).toContain("rush_staffing_rule");

    await page.screenshot({ path: path.join(screenshotsDir, "05_z3_unsat_core_conflict.png") });

    // Switch solver back to HiGHS
    await page.selectOption("#solver-select", "highs");
    expect(await page.textContent("#solver-badge-text")).toContain("HiGHS v1.15.3 (WASM)");
  }, 30000);

  it("switches language between English and Japanese dynamically", async () => {
    await page.click("#lang-btn-ja");

    await page.waitForFunction(
      () => document.getElementById("run-btn")?.textContent?.includes("最適化を実行"),
      { timeout: 5000 }
    );
    expect(await page.textContent(".toolbar-label")).toContain("問題");
    expect(await page.textContent("#tab-btn-results")).toContain("解と変数一覧");

    await page.click("#lang-btn-en");

    await page.waitForFunction(
      () => document.getElementById("run-btn")?.textContent?.includes("Run Optimization"),
      { timeout: 5000 }
    );
    expect(await page.textContent(".toolbar-label")).toContain("Problem");
    expect(await page.textContent("#tab-btn-results")).toContain("Solution & Variables");
  });

  it("toggles theme between light and dark modes dynamically", async () => {
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");

    // Click theme toggle button
    await page.click("#theme-toggle-btn");
    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(toggledTheme).toBe(initialTheme === "dark" ? "light" : "dark");

    // Click again to toggle back
    await page.click("#theme-toggle-btn");
    const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(restoredTheme).toBe(initialTheme);
  });
});
