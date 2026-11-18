import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve(import.meta.dirname, "..");
const siteDist = path.resolve(rootDir, "dist/site");

if (!fs.existsSync(path.resolve(siteDist, "exercises", "index.html"))) {
  throw new Error(
    `Missing built site at ${path.resolve(siteDist, "exercises", "index.html")}. Run 'npm run build:site' first.`
  );
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function startStaticServer(root) {
  return new Promise((resolvePromise) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || "/").split("?")[0];
      let filePath = path.join(root, decodeURIComponent(cleanUrl));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
        filePath = `${filePath}.html`;
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${cleanUrl}`);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolvePromise({ server, port: addr.port });
    });
  });
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function run() {
  const { server, port } = await startStaticServer(siteDist);
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const consoleErrors = [];
    const pageErrors = [];
    const httpErrors = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      const url = res.url();
      if (res.status() >= 400 && url.startsWith(baseUrl)) {
        httpErrors.push(`${res.status()} ${url}`);
      }
    });

    const docsJa = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "docs/.vitepress/locales/ja.json"), "utf-8")
    );
    const docsZh = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "docs/.vitepress/locales/zh.json"), "utf-8")
    );
    const exEn = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "examples/web-demo/exercises/src/locales/en.json"), "utf-8")
    );
    const exJa = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "examples/web-demo/exercises/src/locales/ja.json"), "utf-8")
    );
    const exZh = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "examples/web-demo/exercises/src/locales/zh.json"), "utf-8")
    );

    // 1. Verify VitePress top nav links in EN, JA, ZH
    for (const navCase of [
      { docsPath: "/", linkText: "100 Exercises", expectedBrand: exEn.ui.brandTitle },
      { docsPath: "/ja/", linkText: docsJa.nav[2].text, expectedBrand: exJa.ui.brandTitle },
      { docsPath: "/zh/", linkText: docsZh.nav[2].text, expectedBrand: exZh.ui.brandTitle },
    ]) {
      await page.goto(`${baseUrl}${navCase.docsPath}`, { waitUntil: "networkidle" });
      const navLink = page.locator("header.VPNav a", { hasText: navCase.linkText }).first();
      await navLink.waitFor({ state: "visible" });
      await Promise.all([page.waitForURL(/\/exercises\//), navLink.click()]);
      await page.waitForSelector("#hero-primary-cta");
      const heroTitle = await page.locator(".quest-hero-title").textContent();
      assert(
        heroTitle?.includes(navCase.expectedBrand),
        `Expected hero title '${navCase.expectedBrand}' from ${navCase.docsPath}, got '${heroTitle}'`
      );
    }

    // Also check /showcase/ card links directly to /exercises/
    await page.goto(`${baseUrl}/showcase/`, { waitUntil: "networkidle" });
    const showcaseCardLink = page.locator('a[href="/exercises/"]').first();
    await showcaseCardLink.waitFor({ state: "visible" });
    await Promise.all([page.waitForURL(/\/exercises\//), showcaseCardLink.click()]);
    await page.waitForSelector("#main-progress-text");

    // 2. Quest Map checks (0/100, Provenance badges, Tutorial Skip & Restore, Theme Toggle)
    const bodyText = await page.locator("body").innerText();
    assert(bodyText.includes("0 / 100"), `Expected 0 / 100 progress initially, got: ${bodyText}`);
    assert(bodyText.includes("AI-Drafted"), "Expected AI-Drafted badge on Quest Map");
    assert(bodyText.includes("Solver-Verified"), "Expected Solver-Verified badge on Quest Map");
    assert(!/Reviewed by/.test(bodyText), "Reviewed by must NOT appear when empty");

    // Tutorial skip & persist across reload
    await page.click("#dismiss-tutorial-btn");
    await page.waitForSelector("#restore-tutorial-btn");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#restore-tutorial-btn");
    assert((await page.locator(".tutorial-strip").count()) === 0, "Tutorial should remain dismissed after reload");
    await page.click("#restore-tutorial-btn");
    await page.waitForSelector(".tutorial-strip");

    // Dark-mode toggle (modern-web-guidance: meta[name="color-scheme"] + localStorage 'theme')
    const initialMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    await page.click("#theme-toggle-btn");
    const flippedMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    assert(
      flippedMetaScheme === "dark" || flippedMetaScheme === "light",
      `Expected explicit light/dark meta content after toggle, got '${flippedMetaScheme}' (initial '${initialMetaScheme}')`
    );
    await page.click("#theme-toggle-btn");

    // 3. Page-by-page verification of all 12 problems across WaSHI AND real Pyodide highspy
    const ids = ["T1", "T2", "001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

    for (const id of ids) {
      await page.goto(`${baseUrl}/exercises/?id=${id}&lang=en`, { waitUntil: "networkidle" });
      await page.waitForSelector("#ws-problem-title");

      const wsText = await page.locator(".ws-panel").innerText();
      assert(!/Reviewed by/.test(wsText), `${id} leaked Reviewed by badge`);
      assert(!/\$0\s*\\le/.test(wsText), `${id} leaked raw unrendered LaTeX ($0 \\le)`);

      // Non-exclusive hint accordions: opening all 3 leaves all 3 open simultaneously
      const summaries = page.locator("details.hint-accordion summary");
      const summaryCount = await summaries.count();
      assert(summaryCount >= 3, `${id} expected 3 hint accordions, got ${summaryCount}`);
      for (let i = 0; i < 3; i++) {
        await summaries.nth(i).click();
      }
      const openStates = await page
        .locator("details.hint-accordion")
        .evaluateAll((els) => els.slice(0, 3).map((el) => el.hasAttribute("open")));
      assert(openStates.every(Boolean), `${id} hints were mutually exclusive instead of independent`);

      // On T1 and T2 verify starters produce SUBOPTIMAL and VIOLATION honestly
      if (id === "T1" || id === "T2") {
        await page.click('button[data-action="run"][data-runtime="washi"]');
        const expectedClass = id === "T1" ? ".verdict-pill.is-suboptimal" : ".verdict-pill.is-violation";
        await page.waitForSelector(`#judge-results ${expectedClass}`, { timeout: 20_000 });
      }

      // Reveal & Run WaSHI solution
      const washiSolBtn = page.locator('button[data-action="solution"][data-runtime="washi"]');
      await washiSolBtn.click();
      await washiSolBtn.click();
      await page.click('button[data-action="run"][data-runtime="washi"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 30_000 });

      // Keyboard navigation + ARIA attributes check for Tabs (first on T1, click on others)
      const hasAriaControls = await page.locator("#tab-washi").getAttribute("aria-controls");
      assert(hasAriaControls === null, "Tab buttons must NOT use aria-controls per modern-web-guidance");
      await page.locator("#tab-washi").focus();
      await page.keyboard.press("ArrowRight");
      assert(
        (await page.locator("#tab-highspy").getAttribute("aria-selected")) === "true",
        `${id}: ArrowRight did not activate highspy tab`
      );
      assert(
        (await page.locator("#panel-washi").getAttribute("hidden")) !== null,
        `${id}: inactive tabpanel must carry hidden attribute`
      );

      // Verify tutorial starters in real Pyodide highspy too
      if (id === "T1" || id === "T2") {
        await page.click('button[data-action="run"][data-runtime="highspy"]');
        const expectedClass = id === "T1" ? ".verdict-pill.is-suboptimal" : ".verdict-pill.is-violation";
        await page.waitForSelector(`#judge-results ${expectedClass}`, { timeout: 120_000 });
      }

      // Reveal & Run real Python highspy solution in Pyodide Web Worker
      const pySolBtn = page.locator('button[data-action="solution"][data-runtime="highspy"]');
      await pySolBtn.click();
      await pySolBtn.click();
      await page.click('button[data-action="run"][data-runtime="highspy"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 120_000 });

      const starText = await page.locator("#ws-star-summary").innerText();
      assert(starText.includes("WaSHI ★") && starText.includes("highspy ★"), `${id} missing dual ★ mastery`);

      // Confirm tutorial (T1, T2) stays excluded from /100 main score
      if (id === "T2") {
        await page.goto(`${baseUrl}/exercises/?lang=en`, { waitUntil: "networkidle" });
        const midProgress = await page.locator("#main-progress-text").textContent();
        assert(midProgress?.includes("0 / 100"), `Tutorials leaked into main score: ${midProgress}`);
      }

      console.log(`  [PASS] Problem ${id}: WaSHI AC + Pyodide highspy AC verified.`);
    }

    // 4. Verify 10 / 100 progress, persistence across reload, and Backup Dialog Export/Reset/Import
    await page.goto(`${baseUrl}/exercises/?lang=en`, { waitUntil: "networkidle" });
    await page.waitForSelector("#main-progress-text");
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("10 / 100"),
      "Expected 10 / 100 after solving #001-#010"
    );
    assert(
      (await page.locator("#stars-progress-text").textContent())?.includes("20 / 200"),
      "Expected 20 / 200 stars after dual-runtime mastery on #001-#010"
    );
    await page.reload({ waitUntil: "networkidle" });
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("10 / 100"),
      "Progress did not persist across reload"
    );

    // Backup dialog export -> reset all -> import restore
    await page.click("#backup-open-btn");
    const exportedJson = await page.locator("#backup-export-text").inputValue();
    assert(exportedJson.includes('"010"'), "Backup JSON missing solved #010");
    await page.click("#backup-reset-all-btn");
    await page.click("#backup-reset-all-btn");
    await page.waitForSelector("#hero-primary-cta");
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("0 / 100"),
      "Reset All failed to clear progress"
    );
    await page.click("#backup-open-btn");
    await page.fill("#backup-import-text", exportedJson);
    await page.click("#backup-import-btn");
    await page.waitForSelector("#backup-dialog[open]");
    await page.click("#backup-close-btn");
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("10 / 100"),
      "Import JSON failed to restore 10 / 100"
    );

    // 4b. Verify leaving a workspace while a Python run is in flight never leaks results/stars into another problem
    {
      const raceCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const racePage = await raceCtx.newPage();
      await racePage.goto(`${baseUrl}/exercises/?id=T1&lang=en`, { waitUntil: "networkidle" });
      await racePage.click("#tab-highspy");
      const solBtn = racePage.locator('button[data-action="solution"][data-runtime="highspy"]');
      await solBtn.click();
      await solBtn.click();
      await racePage.click('button[data-action="run"][data-runtime="highspy"]');
      await racePage.click("#back-to-map-btn");
      await racePage.waitForSelector('a[data-nav-id="002"]');
      await racePage.click('a[data-nav-id="002"]');
      await racePage.waitForSelector("#ws-problem-title");
      // Wait long enough for Pyodide T1 background run to settle in the same SPA session
      await racePage.waitForTimeout(4500);
      const p002Placeholder = await racePage.locator("#judge-results").innerText();
      const p002Stars = await racePage.locator("#ws-star-summary").innerText();
      assert(
        !p002Placeholder.includes("2600") && !p002Placeholder.includes("AC —"),
        `Stale T1 result leaked into #002 workspace: ${p002Placeholder}`
      );
      assert(
        p002Stars.includes("highspy ☆"),
        `Stale T1 star leaked into #002 workspace: ${p002Stars}`
      );
      await raceCtx.close();
    }

    // 5. Mobile Audit (360x800 and 390x844) on Quest Map & Math-heavy Workspace
    for (const vp of [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const mobPage = await browser.newPage({ viewport: vp });
      mobPage.on("pageerror", (e) => pageErrors.push(`mobile ${vp.width}: ${e.message}`));
      for (const checkUrl of [
        `${baseUrl}/exercises/?lang=ja`,
        `${baseUrl}/exercises/?id=007&lang=en`,
        `${baseUrl}/exercises/?id=010&lang=ja`,
      ]) {
        await mobPage.goto(checkUrl, { waitUntil: "networkidle" });
        const acc = mobPage.locator("details.hint-accordion summary");
        const count = await acc.count();
        for (let i = 0; i < count; i++) await acc.nth(i).click();

        const metrics = await mobPage.evaluate(() => {
          const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const smallTargets = [];
          for (const el of document.querySelectorAll("button, a.ex-btn-primary, a.ex-btn-ghost, [role='tab'], summary, select")) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height < 40) {
              smallTargets.push(`${el.tagName}#${el.id || el.className}:${Math.round(rect.height)}px`);
            }
          }
          return { docOverflow, smallTargets };
        });
        assert(
          metrics.docOverflow <= 0,
          `Mobile overflow ${metrics.docOverflow}px at ${vp.width}x${vp.height} on ${checkUrl}`
        );
        assert(
          metrics.smallTargets.length === 0,
          `Undersized touch targets at ${vp.width}x${vp.height} on ${checkUrl}: ${metrics.smallTargets.join(", ")}`
        );
      }
      await mobPage.close();
    }

    assert(consoleErrors.length === 0, `Console errors observed: ${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `Uncaught page errors observed: ${pageErrors.join(" | ")}`);
    assert(httpErrors.length === 0, `HTTP >=400 responses observed: ${httpErrors.join(" | ")}`);

    console.log("✅ All Exercises browser checks passed cleanly (all 12 problems × WaSHI + Pyodide highspy, 3 locales, mobile audit)!");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
