import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";
import fs from "node:fs";

describe("Zero-Config Browser WASM Verification (NO local highs.wasm)", () => {
  let viteServer: ViteDevServer;
  let browser: Browser;
  let page: Page;
  const port = 5199;
  const url = `http://localhost:${port}/`;
  const screenshotsDir = path.resolve(process.cwd(), "test/screenshots");

  const capturedConsoleLogs: string[] = [];
  const networkRequests: { url: string; status?: number }[] = [];

  beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // 1. Start dedicated Vite server with publicDir: false
    const configFile = path.resolve(process.cwd(), "examples/zero-config-browser/vite.config.ts");
    viteServer = await createServer({
      configFile,
      server: { port },
    });
    await viteServer.listen();

    // 2. Launch real Chromium
    browser = await chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 800 });

    page.on("console", (msg) => {
      const text = msg.text();
      capturedConsoleLogs.push(text);
      console.log(`[BROWSER CONSOLE] ${text}`);
    });

    page.on("response", (res) => {
      networkRequests.push({ url: res.url(), status: res.status() });
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

  it("verifies that the local server DOES NOT serve highs.wasm (returns HTML instead)", async () => {
    const localWasmResponse = await fetch(`http://localhost:${port}/highs.wasm`);
    // Crucial check: The server has NO highs.wasm and returns HTML (index.html) instead!
    const contentType = localWasmResponse.headers.get("content-type") || "";
    const bodyText = await localWasmResponse.text();
    expect(contentType).toContain("text/html");
    expect(bodyText).toContain("<!DOCTYPE html>");
  });

  it("loads the page, triggers CDN fallback, and solves the optimization model out-of-the-box", async () => {
    await page.goto(url, { waitUntil: "networkidle" });

    // Wait for the solver to reach Optimal status via CDN fallback
    await page.waitForFunction(
      () => document.getElementById("status-badge")?.textContent?.includes("Optimal"),
      { timeout: 20000 }
    );

    // Verify UI output
    const outputText = await page.textContent("#output");
    expect(outputText).toContain("Status: Optimal");
    expect(outputText).toContain("Max Value: $160");
    expect(outputText).toContain("laptop : 1");
    expect(outputText).toContain("phone  : 1");
    expect(outputText).toContain("camera : 0");

    // Verify CDN fetch happened and succeeded with 200
    const cdnFetch = networkRequests.find(
      (r) => r.url.includes("jsdelivr.net") && r.url.endsWith("highs.wasm")
    );
    expect(cdnFetch).toBeDefined();
    expect(cdnFetch?.status).toBe(200);

    // Verify console log contains fallback message
    const fallbackLog = capturedConsoleLogs.find((log) =>
      log.includes("Local highs.wasm not found or invalid") &&
      log.includes("Automatically falling back to official CDN")
    );
    expect(fallbackLog).toBeDefined();

    // Take screenshot as visual proof
    const screenshotPath = path.join(screenshotsDir, "zero_config_verified.png");
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  }, 25000);
});
