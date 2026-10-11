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
      
      // Route /washi/* to dist/demo/*
      if (!urlPath.startsWith("/washi/")) {
        res.statusCode = 404;
        res.end("Not Found (outside /washi/ base)");
        return;
      }

      let subPath = urlPath.slice("/washi/".length);
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

async function runBrowserVerification() {
  console.log("=== WaSHI Web Demo GitHub Pages Cross-Origin Isolation Verification ===");

  const { server, port } = await startStaticPagesServer();
  const demoUrl = `http://localhost:${port}/washi/demo/`;
  console.log(`Simulated GitHub Pages server running at ${demoUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (err) {
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
    await page.goto(demoUrl, { waitUntil: "networkidle" });

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
    await page.click("#run-btn");

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

    await page.click("#run-btn");

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
      const x = m.addVar({ name: "x", type: "Integer" });
      m.addConstraint(x.eq(0.5), "int_x_is_half");
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
    await page.click("#run-btn");

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

    await page.click("#run-btn");

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Optimal";
    }, { timeout: 20_000 });

    const z3MipObj = await page.evaluate(() => document.getElementById("metric-obj")?.textContent?.trim());
    assert.equal(z3MipObj, "1100", `Z3 production planning optimal objective must be 1100, got ${z3MipObj}`);
    console.log(`   Z3 MIP solved successfully with objective ${z3MipObj}!`);

    // Reset solver select back to default for subsequent tests
    await page.selectOption("#solver-select", "highs");
    await page.waitForTimeout(300);

    // 6. Test HiGHS Default Solver Regression Check
    console.log("6. Verifying HiGHS default solver operates without regression...");
    await page.selectOption("#preset-select", "production");
    await page.waitForTimeout(300);

    await page.click("#run-btn");

    await page.waitForFunction(() => {
      const el = document.getElementById("metric-status");
      return el && el.textContent?.trim() === "Optimal";
    }, { timeout: 15_000 });

    const highsObj = await page.evaluate(() => document.getElementById("metric-obj")?.textContent?.trim());
    assert.equal(highsObj, "1100", `HiGHS production planning optimal objective must be 1100, got ${highsObj}`);
    console.log(`   HiGHS solved successfully with objective ${highsObj}!`);

    // 7. Test Subpath Scope & Navigation to landing page (/washi/)
    console.log("7. Testing navigation between /washi/ and /washi/demo/ under scope...");
    await page.goto(`http://localhost:${port}/washi/`, { waitUntil: "networkidle" });
    const landingIsolated = await page.evaluate(() => window.crossOriginIsolated);
    console.log(`   Landing page (/washi/) crossOriginIsolated: ${landingIsolated}`);
    assert.equal(landingIsolated, true, "Landing page within /washi/ scope must also be crossOriginIsolated");

    // 8. Test Failure Behavior when cross-origin isolation is not available
    console.log("8. Testing graceful abort when crossOriginIsolated is false...");
    const failContext = await browser.newContext({ serviceWorkers: "block" });
    const failPage = await failContext.newPage();
    await failPage.goto(demoUrl, { waitUntil: "networkidle" });
    const failIsolated = await failPage.evaluate(() => window.crossOriginIsolated);
    assert.equal(failIsolated, false, "When Service Workers are blocked, crossOriginIsolated must be false");

    await failPage.selectOption("#solver-select", "z3");
    await failPage.click("#run-btn");

    const failStatus = await failPage.evaluate(() => document.getElementById("metric-status")?.textContent?.trim());
    assert.equal(failStatus, "Unsupported", "Metric status must be 'Unsupported' when isolation requirements fail");

    const failLogs = await failPage.evaluate(() => document.getElementById("log-output")?.textContent);
    assert(failLogs.includes("Z3 solver execution aborted"), `Log output should explain reason, got: ${failLogs}`);
    assert(failLogs.includes("Cross-Origin-Opener-Policy: same-origin"), "Log output should explain required headers");
    console.log("   Graceful abort verified: displayed clear reason without crashing or hanging!");
    await failContext.close();

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
