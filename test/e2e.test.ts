import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

describe("Browser End-to-End (E2E) Tests", () => {
  let browser: Browser;
  let page: Page;
  const devServerUrl = "http://127.0.0.1:5173";
  const screenshotsDir = path.resolve(process.cwd(), "test/screenshots");

  beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    browser = await chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
  }, 20000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it("loads the page and verifies title and header branding", async () => {
    await page.goto(devServerUrl, { waitUntil: "networkidle" });

    const title = await page.title();
    expect(title).toContain("HiGHS Web Modeler");

    const brandTitle = await page.textContent(".brand-title");
    expect(brandTitle).toContain("HiGHS Web Modeler");

    const wasmBadge = await page.textContent(".status-chip");
    expect(wasmBadge).toContain("HiGHS v1.15.3 (WASM)");
  }, 15000);

  it("automatically solves the initial Production Planning problem", async () => {
    // Wait for the solver status to become Optimal
    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Optimal",
      { timeout: 15000 }
    );

    const objText = await page.textContent("#metric-obj");
    expect(objText).toBe("1100");

    // Verify chairs and tables values in table
    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("chairs");
    expect(tableText).toContain("20");
    expect(tableText).toContain("tables");
    expect(tableText).toContain("10");

    await page.screenshot({ path: path.join(screenshotsDir, "01_initial_production_optimal.png") });
  }, 15000);

  it("switches to 0-1 Knapsack problem and solves interactively", async () => {
    // Select knapsack preset
    await page.selectOption("#preset-select", "knapsack");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for optimal status and objective 120
    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("metric-obj")?.textContent === "120",
      { timeout: 15000 }
    );

    // Verify visualizer rendered packed badges
    await page.waitForSelector(".item-badge.packed", { timeout: 5000 });
    const packedCount = await page.locator(".item-badge.packed").count();
    expect(packedCount).toBeGreaterThanOrEqual(2);

    const packedText = await page.locator(".item-badge.packed").allTextContents();
    const joined = packedText.join(" ");
    expect(joined).toContain("Drone");
    expect(joined).toContain("Camera");

    await page.screenshot({ path: path.join(screenshotsDir, "02_knapsack_solution.png") });
  }, 15000);

  it("switches to 8-Queens MIP puzzle and renders chessboard with 8 queens", async () => {
    // Select N-Queens preset
    await page.selectOption("#preset-select", "nqueens");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for optimal status
    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Optimal",
      { timeout: 15000 }
    );

    // Verify chessboard exists and has exactly 8 queens
    await page.waitForSelector(".chess-cell.has-queen", { timeout: 5000 });
    const queenCount = await page.locator(".chess-cell.has-queen").count();
    expect(queenCount).toBe(8);

    await page.screenshot({ path: path.join(screenshotsDir, "03_nqueens_chessboard.png") });
  }, 15000);

  it("switches to Nurse Scheduling problem and renders multi-shift roster", async () => {
    await page.selectOption("#preset-select", "nurse");
    await page.click("#run-btn");

    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Optimal",
      { timeout: 15000 }
    );

    // Verify roster table exists and has 10 nurse rows
    await page.waitForSelector(".nurse-roster-table tbody tr", { timeout: 5000 });
    const rowCount = await page.locator(".nurse-roster-table tbody tr").count();
    expect(rowCount).toBe(10);

    await page.screenshot({ path: path.join(screenshotsDir, "03b_nurse_roster.png") });
  }, 15000);

  it("switches tabs to inspect CPLEX LP Format, Logs, and Migration Guide", async () => {
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

    // Click Migration Guide Tab
    await page.click("#tab-btn-docs");
    const docsTabVisible = await page.evaluate(
      () => document.getElementById("tab-docs")?.classList.contains("active")
    );
    expect(docsTabVisible).toBe(true);

    const docsContent = await page.textContent("#docs-content");
    expect(docsContent).toContain("Python PuLP");
    expect(docsContent).toContain("python-mip");

    // Switch back to results tab
    await page.click("#tab-btn-results");
    const resultsTabVisible = await page.evaluate(
      () => document.getElementById("tab-results")?.classList.contains("active")
    );
    expect(resultsTabVisible).toBe(true);

    await page.screenshot({ path: path.join(screenshotsDir, "04_tabs_navigation.png") });
  }, 15000);

  it("tests filtering non-zero variables", async () => {
    // Select N-Queens problem to guarantee 64 variables (8 non-zero, 56 zero)
    await page.selectOption("#preset-select", "nqueens");
    await page.click("#run-btn");
    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Optimal",
      { timeout: 15000 }
    );

    const initialRows = await page.locator("#vars-tbody tr").count();
    expect(initialRows).toBe(64);

    // Toggle filter
    await page.click("#filter-non-zero");

    const filteredRows = await page.locator("#vars-tbody tr").count();
    expect(filteredRows).toBe(8);

    // Untoggle
    await page.click("#filter-non-zero");
    const restoredRows = await page.locator("#vars-tbody tr").count();
    expect(restoredRows).toBe(64);
  }, 15000);

  it("handles custom infeasible model correctly in UI", async () => {
    // Fill code editor with contradictory constraints
    const infeasibleCode = `
const m = new Model({ name: "InfeasibleUI" });
const x = m.addVar({ name: "x", lb: 0 });
m.addConstraint(x.le(2), "c_upper");
m.addConstraint(x.ge(5), "c_lower");
await m.optimize();
`;
    await page.fill("#code-editor", infeasibleCode);
    await page.click("#run-btn");

    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Infeasible",
      { timeout: 15000 }
    );

    const hasInfeasibleClass = await page.evaluate(
      () => document.getElementById("metric-status")?.classList.contains("status-infeasible")
    );
    expect(hasInfeasibleClass).toBe(true);

    await page.screenshot({ path: path.join(screenshotsDir, "05_infeasible_detected.png") });
  }, 15000);

  it("solves Markowitz Portfolio Optimization (Convex QP) in browser UI", async () => {
    // Select portfolio_qp preset
    await page.selectOption("#preset-select", "portfolio_qp");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for status to become Optimal
    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Optimal",
      { timeout: 15000 }
    );

    // Verify objective value is positive
    const objText = await page.textContent("#metric-obj");
    const objVal = parseFloat(objText || "0");
    expect(objVal).toBeGreaterThan(0);

    // Verify portfolio cards rendered with asset weights
    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("weight_Tech");
    expect(tableText).toContain("weight_Bonds");

    // Take screenshot of portfolio QP results
    await page.screenshot({ path: path.join(screenshotsDir, "06_portfolio_qp_optimal.png") });
  }, 15000);

  it("switches language between English and Japanese dynamically", async () => {
    // Click JA button
    await page.click("#lang-btn-ja");

    // Verify labels switched to Japanese
    await page.waitForFunction(
      () => document.getElementById("run-btn")?.textContent?.includes("最適化を実行"),
      { timeout: 5000 }
    );
    expect(await page.textContent(".toolbar-label")).toContain("問題モデル:");
    expect(await page.textContent("#tab-btn-results")).toContain("解と変数一覧");

    // Click EN button
    await page.click("#lang-btn-en");

    // Verify labels switched back to English
    await page.waitForFunction(
      () => document.getElementById("run-btn")?.textContent?.includes("Run Optimization"),
      { timeout: 5000 }
    );
    expect(await page.textContent(".toolbar-label")).toContain("Problem Model:");
    expect(await page.textContent("#tab-btn-results")).toContain("Solution & Variables");
  });
});
