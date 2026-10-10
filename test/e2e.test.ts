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

    page.on("console", (msg) => {
      console.log(`[PAGE ${msg.type()}]:`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.error("[PAGE ERROR]:", err);
    });
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

  it("renders editor line numbers cleanly without wrapping or overlapping digits", async () => {
    // Check computed styles of #line-numbers vs #code-editor
    const lineNumbersStyle = await page.evaluate(() => {
      const ln = document.getElementById("line-numbers");
      const ed = document.getElementById("code-editor");
      if (!ln || !ed) return null;
      const lnComputed = window.getComputedStyle(ln);
      const edComputed = window.getComputedStyle(ed);
      return {
        lnWhiteSpace: lnComputed.whiteSpace,
        lnFontSize: lnComputed.fontSize,
        edFontSize: edComputed.fontSize,
        lnLineHeight: lnComputed.lineHeight,
        edLineHeight: edComputed.lineHeight,
        lnText: ln.textContent || "",
        edValue: (ed as HTMLTextAreaElement).value || "",
      };
    });

    expect(lineNumbersStyle).not.toBeNull();
    // white-space must be pre or pre-line so newlines are preserved and numbers do not wrap into same line
    expect(["pre", "pre-line", "pre-wrap"]).toContain(lineNumbersStyle!.lnWhiteSpace);
    // font size and line height must match exactly so vertical positioning does not drift
    expect(lineNumbersStyle!.lnFontSize).toBe(lineNumbersStyle!.edFontSize);
    expect(lineNumbersStyle!.lnLineHeight).toBe(lineNumbersStyle!.edLineHeight);

    // Number of lines in lineNumbers text must match textarea line count
    const edLineCount = lineNumbersStyle!.edValue.split("\n").length;
    const lnLines = lineNumbersStyle!.lnText.trim().split("\n");
    expect(lnLines.length).toBe(edLineCount);

    // Every line in lnLines must be a single number (e.g. "1", "2", ... not "1 2" or multiple digits on one line)
    for (let i = 0; i < lnLines.length; i++) {
      expect(lnLines[i].trim()).toBe(String(i + 1));
    }

    await page.screenshot({ path: path.join(screenshotsDir, "07_editor_line_numbers_fixed.png") });
  });

  it("switches solver engine to GLPK and solves Production Planning problem", async () => {
    // Select initial production preset
    await page.selectOption("#preset-select", "production");

    // Select GLPK solver
    await page.selectOption("#solver-select", "glpk");

    // Verify header status badge updated
    const badgeText = await page.textContent("#solver-badge-text");
    expect(badgeText).toContain("GLPK v5.0.0 (WASM)");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for status to become Optimal
    await page.waitForFunction(
      () =>
        document.getElementById("metric-status")?.textContent === "Optimal" &&
        document.getElementById("metric-obj")?.textContent === "1100",
      { timeout: 15000 }
    );

    // Verify chairs and tables values in table
    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("chairs");
    expect(tableText).toContain("20");
    expect(tableText).toContain("tables");
    expect(tableText).toContain("10");

    await page.screenshot({ path: path.join(screenshotsDir, "08_glpk_production_optimal.png") });
  }, 15000);

  it("handles QP model with GLPK gracefully by reporting capability error", async () => {
    // Select GLPK solver
    await page.selectOption("#solver-select", "glpk");

    // Select QP preset
    await page.selectOption("#preset-select", "portfolio_qp");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for status to become Error
    await page.waitForFunction(
      () => document.getElementById("metric-status")?.textContent === "Error",
      { timeout: 15000 }
    );

    // Verify error message in solver logs
    const logText = await page.textContent("#log-output");
    expect(logText).toContain("does not support quadratic objectives (QP)");

    await page.screenshot({ path: path.join(screenshotsDir, "09_glpk_qp_capability_error.png") });

    // Switch solver back to HiGHS
    await page.selectOption("#solver-select", "highs");
    expect(await page.textContent("#solver-badge-text")).toContain("HiGHS v1.15.3 (WASM)");
  }, 15000);

  it("switches solver to Z3 and solves Smart Home Security SMT model in UI", async () => {
    // Select Z3 solver
    await page.selectOption("#solver-select", "z3");
    expect(await page.textContent("#solver-badge-text")).toContain("Z3 v5.2.0 (SMT/SAT/MIP)");

    // Select Smart Home SMT preset
    await page.selectOption("#preset-select", "logic_puzzle_smt");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for solver status to become Sat or Optimal
    await page.waitForFunction(
      () => {
        const s = document.getElementById("metric-status")?.textContent;
        return s === "Optimal" || s === "Sat";
      },
      { timeout: 15000 }
    );

    // Verify boolean variables in table
    const tableText = await page.textContent("#vars-tbody");
    expect(tableText).toContain("Boolean");
    expect(tableText).toContain("sirenActive");
    expect(tableText).toContain("lightsOn");

    await page.screenshot({ path: path.join(screenshotsDir, "10_z3_smt_security_optimal.png") });
  }, 30000);

  it("diagnoses conflicting constraints with Z3 and displays Unsat Core alert in UI", async () => {
    // Select Z3 solver
    await page.selectOption("#solver-select", "z3");

    // Select Conflict Diagnosis preset
    await page.selectOption("#preset-select", "conflict_diagnosis_unsat");

    // Click Run Optimization
    await page.click("#run-btn");

    // Wait for solver status to become Infeasible or Unsat
    await page.waitForFunction(
      () => {
        const s = document.getElementById("metric-status")?.textContent;
        return s === "Infeasible" || s === "Unsat";
      },
      { timeout: 30000 }
    );

    // Verify Unsat Core alert box is displayed
    const isUnsatCoreVisible = await page.isVisible("#unsat-core-box");
    expect(isUnsatCoreVisible).toBe(true);

    const unsatCoreText = await page.textContent("#unsat-core-list");
    expect(unsatCoreText).toContain("strict_board_budget_cap");
    expect(unsatCoreText).toContain("rush_staffing_rule");

    await page.screenshot({ path: path.join(screenshotsDir, "11_z3_unsat_core_conflict.png") });

    // Switch solver back to HiGHS
    await page.selectOption("#solver-select", "highs");
    expect(await page.textContent("#solver-badge-text")).toContain("HiGHS v1.15.3 (WASM)");
  }, 30000);
});
