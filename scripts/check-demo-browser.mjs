import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDemoDir = resolve(__dirname, "../dist/demo");

assert(existsSync(distDemoDir), `dist/demo directory not found at ${distDemoDir}. Run "npm run build:demo" first.`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * Plain static HTTP server simulating GitHub Pages without COOP/COEP delivery headers.
 */
function startStaticPagesServer(port = 0) {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const urlPath = req.url?.split("?")[0] || "/";
      
      // Route /* to dist/demo/*
      let subPath = urlPath.replace(/^\/+/, "");
      if (subPath === "" || subPath.endsWith("/")) {
        subPath += "index.html";
      }

      const filePath = join(distDemoDir, subPath);

      if (!existsSync(filePath)) {
        // Try fallback to filePath/index.html if directory
        const dirIndex = join(filePath, "index.html");
        if (existsSync(dirIndex)) {
          const content = readFileSync(dirIndex);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.statusCode = 200;
          res.end(content);
          return;
        }
        res.statusCode = 404;
        res.end(`File not found: ${subPath}`);
        return;
      }

      const ext = extname(filePath);
      const contentType = mimeTypes[ext] || "application/octet-stream";

      // IMPORTANT: Simulating GitHub Pages by NOT setting COOP/COEP headers
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");

      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.end();
        return;
      }

      const fileContent = readFileSync(filePath);
      const range = req.headers["range"];
      if (range && range.startsWith("bytes=")) {
        const parts = range.slice("bytes=".length).split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileContent.length - 1;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileContent.length}`);
        res.setHeader("Content-Length", (end - start + 1));
        res.statusCode = 206;
        res.end(fileContent.slice(start, end + 1));
        return;
      }

      res.statusCode = 200;
      res.end(fileContent);
    });

    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolvePromise({ server, port: actualPort });
    });
  });
}

async function runAndWait(page) {
  await page.click("#run-btn");
  // Status/variables remain visible during a solve; wait for this run to finish.
  await page.waitForFunction(
    () => !document.getElementById("run-btn")?.disabled,
    null,
    { timeout: 30_000 }
  );
}

async function runBrowserVerification() {
  console.log("=== WaSHI Web Demo GitHub Pages Cross-Origin Isolation Verification ===");

  const { server, port } = await startStaticPagesServer();
  const demoUrl = `http://localhost:${port}/demo/`;
  console.log(`Simulated GitHub Pages server running at ${demoUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (err) {
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
    } catch {
      await new Promise((res) => server.close(res));
      const isMissingBinary =
        err.message?.includes("Executable doesn't exist") ||
        err.message?.includes("Please run the following command to download new browsers") ||
        err.message?.includes("playwright install");

      if (isMissingBinary && !process.env.CI && process.env.RUN_DEMO_BROWSER !== "1") {
        console.warn(
          `\n[Notice] Playwright Chromium binary is not installed locally.\n` +
          `Skipping demo browser verification. To run locally, install Chromium with: npx playwright install chromium\n`
        );
        process.exit(0);
      }
      throw err;
    }
  }

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    let navCount = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navCount++;
        console.log(`[Browser] Main frame navigation #${navCount}: ${frame.url()}`);
      }
    });

    const consoleMessages = [];
    page.on("console", (msg) => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log(`[Console ${msg.type()}] ${text}`);
    });

    page.on("pageerror", (err) => {
      console.error("[Page Error]", err);
    });

    page.on("request", (req) => {
      console.log(`[Request] ${req.method()} ${req.url()}`);
    });

    page.on("response", (res) => {
      console.log(`[Response] ${res.status()} ${res.url()}`);
    });

    page.on("requestfailed", (req) => {
      console.error(`[Request Failed] ${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });

    console.log("1. Visiting demo in fresh browser context...");
    await page.goto(demoUrl, { waitUntil: "networkidle", timeout: 60_000 });

    // Wait for initial Service Worker registration & automatic reload
    console.log("2. Awaiting Service Worker registration, activation, and reload...");
    await page.waitForFunction(() => {
      return (window.crossOriginIsolated === true) && (typeof SharedArrayBuffer !== "undefined");
    }, { timeout: 15_000 });

    const isIsolated = await page.evaluate(() => window.crossOriginIsolated);
    const hasSAB = await page.evaluate(() => typeof SharedArrayBuffer !== "undefined");

    console.log(`   crossOriginIsolated: ${isIsolated}`);
    console.log(`   SharedArrayBuffer available: ${hasSAB}`);
    assert.equal(isIsolated, true, "window.crossOriginIsolated must be true after Service Worker activation");
    assert.equal(hasSAB, true, "SharedArrayBuffer must be available after Service Worker activation");

    // Verify infinite reload loop prevention: wait 2 seconds and ensure navigation count did not spiral
    const initialNavs = navCount;
    await page.waitForTimeout(2000);
    assert.equal(navCount, initialNavs, `Page reloaded unexpectedly! Navigation count grew from ${initialNavs} to ${navCount}`);
    console.log("3. Verified reload loop prevention: navigation count remained stable.");

    // 4. Test SMT SAT Preset Execution
    console.log("4. Testing Z3 SMT SAT task scheduling preset...");
    await page.selectOption("#preset-select", "smt_sat_scheduling");
    await page.waitForTimeout(300);

    // Click Run button
    await runAndWait(page);

    // Wait until metric status is updated to Sat
    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Sat";
    }, { timeout: 20_000 });

    const satStatus = await page.evaluate(() => document.getElementById("metric-status")?.textContent?.trim());
    assert.equal(satStatus, "Sat", "SMT SAT problem must solve with status 'Sat'");
    console.log("   Z3 SMT SAT solved successfully (status: Sat)!");

    // 5. Test SMT UNSAT Conflict Diagnosis Preset Execution
    console.log("5. Testing Z3 SMT UNSAT conflict diagnosis preset...");
    await page.selectOption("#preset-select", "conflict_diagnosis_unsat");
    await page.waitForTimeout(300);

    await runAndWait(page);

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Unsat";
    }, { timeout: 20_000 });

    const unsatStatus = await page.evaluate(() => document.getElementById("metric-status")?.textContent?.trim());
    assert.equal(unsatStatus, "Unsat", "SMT UNSAT problem must solve with status 'Unsat'");

    const unsatCoreCount = await page.evaluate(() => {
      return document.querySelectorAll(".unsat-core-chip").length;
    });
    console.log(`   Z3 SMT UNSAT solved with unsatCore extracted (${unsatCoreCount} conflicting constraints isolated)!`);

    // 5b. Test Integer contradiction (x == 0.5 where x is Integer must be Unsat)
    console.log("5b. Testing integer contradition (Integer x == 0.5 must be Unsat)...");
    const intCode = `
      const m = new Model({ solver: "z3" });
      const x = m.integer("x");
      m.constraint(x.eq(0.5), "int_x_is_half");
      const res = await m.check({ solver: "z3" });
      console.log("Integer contradiction status:", res.status);
    `;
    await page.evaluate((c) => {
      const editor = document.getElementById("code-editor");
      if (editor) {
        editor.value = c;
        editor.dispatchEvent(new Event("input"));
      }
    }, intCode);
    await runAndWait(page);

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Unsat";
    }, { timeout: 20_000 });
    const intUnsatStatus = await page.evaluate(() => document.getElementById("metric-status")?.textContent?.trim());
    assert.equal(intUnsatStatus, "Unsat", "Integer x == 0.5 must be Unsat");
     // 5c. Test Z3 MIP Solver Execution
    console.log("5c. Testing Z3 MIP solver on Production Planning problem...");
    await page.selectOption("#preset-select", "production");
    await page.waitForTimeout(300);
    await page.selectOption("#solver-select", "z3");
    await page.waitForTimeout(300);

    await runAndWait(page);

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Optimal";
    }, { timeout: 20_000 });

    const z3MipObj = await page.evaluate(() => document.getElementById("metric-obj")?.textContent?.trim());
    assert.equal(z3MipObj, "2200", `Z3 production planning optimal objective must be 2200, got ${z3MipObj}`);
    console.log(`   Z3 MIP solved successfully with objective ${z3MipObj}!`);

    // Reset solver select back to default for subsequent tests
    await page.selectOption("#solver-select", "highs");
    await page.waitForTimeout(300);

    // 6. Test HiGHS Default Solver Regression Check
    console.log("6. Verifying HiGHS default solver operates without regression...");
    await page.selectOption("#preset-select", "production");
    await page.waitForTimeout(300);

    await runAndWait(page);

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Optimal";
    }, { timeout: 15_000 });

    const highsObj = await page.evaluate(() => document.getElementById("metric-obj")?.textContent?.trim());
    assert.equal(highsObj, "2200", `HiGHS production planning optimal objective must be 2200, got ${highsObj}`);
    console.log(`   HiGHS solved successfully with objective ${highsObj}!`);

    // 7. Test Root Scope & Navigation to landing page (/)
    console.log("7. Testing navigation between / and /demo/ under scope...");
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    const landingIsolated = await page.evaluate(() => window.crossOriginIsolated);
    console.log(`   Landing page (/) crossOriginIsolated: ${landingIsolated}`);
    assert.equal(landingIsolated, true, "Landing page within / scope must also be crossOriginIsolated");

    // 8. Test Failure Behavior when cross-origin isolation is not available
    console.log("8. Testing graceful abort when crossOriginIsolated is false...");
    const failContext = await browser.newContext({ serviceWorkers: "block" });
    const failPage = await failContext.newPage();
    await failPage.goto(demoUrl, { waitUntil: "networkidle" });
    const failIsolated = await failPage.evaluate(() => window.crossOriginIsolated);
    assert.equal(failIsolated, false, "When Service Workers are blocked, crossOriginIsolated must be false");

    await failPage.selectOption("#solver-select", "z3");
    await runAndWait(failPage);

    const failStatus = await failPage.evaluate(() => document.getElementById("metric-status")?.textContent?.trim());
    assert.equal(failStatus, "Unsupported", "Metric status must be 'Unsupported' when isolation requirements fail");

    const failLogs = await failPage.evaluate(() => document.getElementById("log-output")?.textContent);
    assert(failLogs.includes("Z3 solver execution aborted"), `Log output should explain reason, got: ${failLogs}`);
    assert(failLogs.includes("Cross-Origin-Opener-Policy: same-origin"), "Log output should explain required headers");
    console.log("   Graceful abort verified: displayed clear reason without crashing or hanging!");
    await failContext.close();

    // 9. Test Nurse Shift Scheduling Demo Basic Data Tab Layout & Scrolling
    console.log("9. Testing Nurse Scheduling Basic Data tab layout, collapsible relations, and scrolling...");
    const shiftPage = await context.newPage();
    await shiftPage.setViewportSize({ width: 1280, height: 800 });
    await shiftPage.goto(`http://localhost:${port}/apps/ai-shift/`, { waitUntil: "networkidle" });

    // Click the Master Data tab
    await shiftPage.click("#tab-btn-staff");
    await shiftPage.waitForFunction(() => {
      const panel = document.getElementById("tab-panel-staff");
      return panel && !panel.hidden;
    }, { timeout: 10_000 });

    const layoutMetrics = await shiftPage.evaluate(() => {
      const panel = document.getElementById("tab-panel-staff");
      const mgmtCard = document.getElementById("staff-mgmt-card");
      const relCard = document.getElementById("relations-card");
      const tableWrap = document.querySelector(".staff-table-wrap");
      const th = document.querySelector(".staff-profile-table th");

      const mgmtHeight = mgmtCard?.getBoundingClientRect().height || 0;
      const relHeight = relCard?.getBoundingClientRect().height || 0;
      const tableClientHeight = tableWrap?.clientHeight || 0;
      const tableScrollHeight = tableWrap?.scrollHeight || 0;
      const thStyle = th ? window.getComputedStyle(th) : null;
      const panelStyle = panel ? window.getComputedStyle(panel) : null;

      return {
        mgmtHeight,
        relHeight,
        tableClientHeight,
        tableScrollHeight,
        thPosition: thStyle?.position,
        panelDisplay: panelStyle?.display,
        panelFlexDirection: panelStyle?.flexDirection,
        panelOverflowY: panelStyle?.overflowY,
        relOpen: relCard?.hasAttribute("open"),
      };
    });

    // Verify compact management header (<= 110px) and compact relations card (<= 150px)
    assert(layoutMetrics.mgmtHeight > 0 && layoutMetrics.mgmtHeight <= 110,
      `Management header should be compact (<=110px), got ${layoutMetrics.mgmtHeight}px`);
    assert(layoutMetrics.relHeight > 0 && layoutMetrics.relHeight <= 150,
      `Relations card should be compact (<=150px), got ${layoutMetrics.relHeight}px`);

    // Verify staff table wrap expands to fill viewport and is scrollable
    assert(layoutMetrics.tableClientHeight >= 280,
      `Staff table wrap clientHeight should be at least 280px, got ${layoutMetrics.tableClientHeight}px`);
    assert(layoutMetrics.tableScrollHeight >= layoutMetrics.tableClientHeight,
      `Staff table should have scrollable content, scrollHeight=${layoutMetrics.tableScrollHeight}, clientHeight=${layoutMetrics.tableClientHeight}`);

    // Verify sticky column header
    assert.equal(layoutMetrics.thPosition, "sticky", "Table header must have position: sticky");

    // Test toggle of relations card
    await shiftPage.click(".relations-card-summary");
    const isClosed = await shiftPage.evaluate(() => !document.getElementById("relations-card")?.hasAttribute("open"));
    assert.equal(isClosed, true, "Relations card should collapse upon summary click");

    // Click again to reopen
    await shiftPage.click(".relations-card-summary");
    const isReopened = await shiftPage.evaluate(() => document.getElementById("relations-card")?.hasAttribute("open"));
    assert.equal(isReopened, true, "Relations card should reopen upon second summary click");

    await shiftPage.close();
    console.log("   Nurse Scheduling Basic Data tab layout and interaction verified!");

    // 10. Test Demon Castle Shift Opening Movie Climax Button Clickability (Issue #126)
    console.log("10. Testing Demon Castle Shift opening movie climax button unblocked by letterbox overlay...");
    const gamePage = await context.newPage();
    await gamePage.setViewportSize({ width: 1280, height: 800 });
    await gamePage.goto(`http://localhost:${port}/games/demon-castle-shift/index.html`, { waitUntil: "networkidle" });
    await gamePage.evaluate(() => localStorage.clear());
    await gamePage.reload({ waitUntil: "networkidle" });

    await gamePage.click("#btn-title-start");
    await gamePage.waitForSelector("#opening-movie-dialog[open]", { timeout: 10_000 });

    for (let c = 0; c < 4; c++) {
      await gamePage.click("#btn-op-next-cut");
      await gamePage.waitForTimeout(50);
    }

    await gamePage.waitForFunction(() => {
      const overlay = document.getElementById("op-climax-overlay");
      return overlay && !overlay.hidden;
    }, { timeout: 5_000 });

    // Verify floating controls (BGM toggle & Skip button) remain above the climax overlay and clickable
    const floatingControlsCheck = await gamePage.evaluate(() => {
      const skipBtn = document.getElementById("btn-op-skip");
      const bgmBtn = document.querySelector("#opening-movie-dialog [data-bgm-toggle]");
      const skipRect = skipBtn ? skipBtn.getBoundingClientRect() : null;
      const bgmRect = bgmBtn ? bgmBtn.getBoundingClientRect() : null;
      const elAtSkip = skipRect ? document.elementFromPoint(skipRect.left + skipRect.width / 2, skipRect.top + skipRect.height / 2) : null;
      const elAtBgm = bgmRect ? document.elementFromPoint(bgmRect.left + bgmRect.width / 2, bgmRect.top + bgmRect.height / 2) : null;
      return {
        skipUnblocked: elAtSkip === skipBtn || skipBtn?.contains(elAtSkip),
        bgmUnblocked: elAtBgm === bgmBtn || bgmBtn?.contains(elAtBgm),
      };
    });
    assert.equal(floatingControlsCheck.skipUnblocked, true, "Skip button must not be blocked by climax overlay");
    assert.equal(floatingControlsCheck.bgmUnblocked, true, "BGM button must not be blocked by climax overlay");

    // Verify #btn-op-finish receives pointer events cleanly without being intercepted by .op-letterbox-bottom
    await gamePage.click("#btn-op-finish", { timeout: 5_000 });
    await gamePage.waitForSelector("#prologue-dialog[open]", { timeout: 5_000 });
    console.log("   Demon Castle Shift opening movie climax transition verified cleanly!");
    await gamePage.close();

    // 11. Test Theory Articles Honshu Textbook Theme (Desktop & Simplified Mobile Layout)
    console.log("11. Testing Theory Articles Honshu textbook theme on desktop and mobile viewports...");
    const theoryPage = await context.newPage();
    await theoryPage.setViewportSize({ width: 1024, height: 800 });
    await theoryPage.goto(`http://localhost:${port}/games/mofumofu-sheep-theory/index.html`, { waitUntil: "load" });
    await theoryPage.click('[data-lang-btn="ja"]');
    await theoryPage.waitForSelector(".math-box .katex-display", { timeout: 5_000 });

    const desktopTheme = await theoryPage.evaluate(() => {
      const sheet = getComputedStyle(document.querySelector(".article-sheet"));
      const badge = getComputedStyle(document.querySelector(".chapter-badge"));
      const katexDisplay = getComputedStyle(document.querySelector(".math-box .katex-display"));
      return {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        sheetBorderTopWidth: sheet.borderTopWidth,
        sheetBorderTopColor: sheet.borderTopColor,
        badgeBg: badge.backgroundColor,
        katexAlign: katexDisplay.textAlign,
      };
    });
    assert.equal(desktopTheme.bodyBg, "rgb(255, 255, 255)", "Theory page background must be pure white (#ffffff)");
    assert.equal(desktopTheme.sheetBorderTopWidth, "3px", "Desktop article sheet must have 3px top accent rule");
    assert.equal(desktopTheme.sheetBorderTopColor, "rgb(194, 59, 34)", "Desktop article sheet top rule must be Honshu (#c23b22)");
    assert.equal(desktopTheme.badgeBg, "rgb(194, 59, 34)", "Desktop chapter badge must use solid Honshu background");
    assert.equal(desktopTheme.katexAlign, "start", "Formula box KaTeX display math must override centered katex.min.css alignment");

    await theoryPage.setViewportSize({ width: 360, height: 800 });
    const mobileTheme = await theoryPage.evaluate(() => {
      const sheet = getComputedStyle(document.querySelector(".article-sheet"));
      const badge = getComputedStyle(document.querySelector(".chapter-badge"));
      const mathBox = getComputedStyle(document.querySelector(".math-box"));
      const th = getComputedStyle(document.querySelector("table.mapping-table th"));
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sheetBorderTopWidth: sheet.borderTopWidth,
        badgeBg: badge.backgroundColor,
        badgeColor: badge.color,
        mathBorderLeftWidth: mathBox.borderLeftWidth,
        mathBorderTopWidth: mathBox.borderTopWidth,
        thWhiteSpace: th.whiteSpace,
      };
    });
    assert.equal(mobileTheme.scrollWidth, mobileTheme.clientWidth, "Mobile theory article must not overflow 360px viewport horizontally");
    assert.equal(mobileTheme.sheetBorderTopWidth, "0px", "Mobile article sheet must remove outer frame border");
    assert.equal(mobileTheme.badgeBg, "rgba(0, 0, 0, 0)", "Mobile chapter badge must render without filled box background");
    assert.equal(mobileTheme.badgeColor, "rgb(194, 59, 34)", "Mobile chapter badge text must use Honshu (#c23b22)");
    assert.equal(mobileTheme.mathBorderLeftWidth, "0px", "Mobile formula block must omit side card borders");
    assert.equal(mobileTheme.mathBorderTopWidth, "1px", "Mobile formula block must retain top/bottom hairline borders");
    assert.equal(mobileTheme.thWhiteSpace, "nowrap", "Mobile table headers must not wrap into single-character vertical stacks");
    await theoryPage.close();
    console.log("   Theory Articles Honshu desktop and simplified mobile styles verified!");

    console.log("\nAll browser verification checks PASSED successfully!");
  } finally {
    await browser.close();
    await new Promise((res) => server.close(res));
  }
}

runBrowserVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
