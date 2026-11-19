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

const GAMEY_TEXT_RE =
  /\bBoss\b|\u30dc\u30b9|\bQuest\b|\u30af\u30a8\u30b9\u30c8|\u{1f451}|\u2605|\u2606|\u9053\u5834|\u9053\u573a|\u901a\u5173|\u5173\u5361/ui;

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
      const heroTitle = await page.locator(".ex-hero-title").textContent();
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

    // 2. Book TOC & Index layout checks (0/100, no 3-column card grid, no tutorials, no /200, provenance footnote)
    const indexLayout = await page.evaluate(() => ({
      sidebarCount: document.querySelectorAll(".book-sidebar").length,
      tocListCount: document.querySelectorAll(".toc-list").length,
      tocRowCount: document.querySelectorAll(".toc-list .toc-row[data-problem-id]").length,
      problemGridCount: document.querySelectorAll(".problem-grid").length,
      tutorialStripCount: document.querySelectorAll(".tutorial-strip").length,
      text: document.body.innerText,
    }));
    assert(indexLayout.sidebarCount === 1, "Expected .book-sidebar on Exercise Index");
    assert(indexLayout.tocListCount >= 1, "Expected .toc-list on Exercise Index");
    assert(indexLayout.tocRowCount === 10, `Expected 10 Chapter 1 .toc-row items, got ${indexLayout.tocRowCount}`);
    assert(indexLayout.problemGridCount === 0, "Expected zero .problem-grid card layouts");
    assert(indexLayout.tutorialStripCount === 0, "Expected zero .tutorial-strip callouts");
    assert(indexLayout.text.includes("0 / 100"), `Expected 0 / 100 progress initially, got: ${indexLayout.text}`);
    assert(!/\/\s*200/.test(indexLayout.text), "Unexpected /200 denominator on Exercise Index");
    assert(indexLayout.text.includes("AI-Drafted"), "Expected AI-Drafted footnote on Exercise Index");
    assert(indexLayout.text.includes("Solver-Verified"), "Expected Solver-Verified footnote on Exercise Index");
    assert(!/Reviewed by/.test(indexLayout.text), "Reviewed by must NOT appear when empty");
    assert(
      !GAMEY_TEXT_RE.test(indexLayout.text),
      `Unexpected gamey/star copy on Exercise Index: ${indexLayout.text}`
    );

    // Dark-mode toggle (modern-web-guidance: meta[name="color-scheme"] + localStorage 'theme')
    const initialMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    await page.click("#theme-toggle-btn");
    const flippedMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    assert(
      flippedMetaScheme === "dark" || flippedMetaScheme === "light",
      `Expected explicit light/dark meta content after toggle, got '${flippedMetaScheme}' (initial '${initialMetaScheme}')`
    );
    await page.click("#theme-toggle-btn");

    // 3. Page-by-page verification of all 10 problems (#001-#010) across WaSHI AND real Pyodide highspy
    const ids = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

    for (const id of ids) {
      await page.goto(`${baseUrl}/exercises/?id=${id}&lang=en`, { waitUntil: "networkidle" });
      await page.waitForSelector("#ws-problem-title");

      const wsCheck = await page.evaluate(() => {
        const sheet = document.querySelector(".ws-problem-sheet");
        const jumpBtn = document.querySelector("#jump-to-editor-btn");
        const workbench = document.querySelector("#answer-workbench");
        const gutter = document.querySelector("#gutter-washi");
        const highlight = document.querySelector("#highlight-washi");
        const textarea = document.querySelector("#editor-washi");
        const span = document.querySelector("#highlight-washi span");
        return {
          wsText: sheet ? sheet.innerText : "",
          hasJumpBtn: Boolean(jumpBtn),
          hasWorkbench: Boolean(workbench),
          hasGutter: Boolean(gutter),
          hasHighlight: Boolean(highlight),
          textMatch:
            highlight && textarea instanceof HTMLTextAreaElement
              ? highlight.textContent === textarea.value
              : false,
          textareaWeight: textarea ? getComputedStyle(textarea).fontWeight : "",
          spanWeight: span ? getComputedStyle(span).fontWeight : "400",
        };
      });
      assert(!/Reviewed by/.test(wsCheck.wsText), `${id} leaked Reviewed by badge`);
      assert(!/\$0\s*\\le/.test(wsCheck.wsText), `${id} leaked raw unrendered LaTeX ($0 \\le)`);
      assert(wsCheck.hasJumpBtn, `${id} missing #jump-to-editor-btn`);
      assert(wsCheck.hasWorkbench, `${id} missing #answer-workbench`);
      assert(wsCheck.hasGutter && wsCheck.hasHighlight, `${id} missing gutter/overlay highlighter`);
      assert(wsCheck.textMatch, `${id} overlay <pre>.textContent did not match textarea.value`);
      assert(
        wsCheck.textareaWeight === "400" && wsCheck.spanWeight === "400",
        `${id} editor fontWeight must stay 400 (got textarea=${wsCheck.textareaWeight}, span=${wsCheck.spanWeight})`
      );

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

      // Verify #001-#003 starters reproduce SUBOPTIMAL (#001) and VIOLATION (#002, #003) honestly
      if (id === "001" || id === "002" || id === "003") {
        await page.click('button[data-action="run"][data-runtime="washi"]');
        const expectedClass = id === "001" ? ".verdict-pill.is-suboptimal" : ".verdict-pill.is-violation";
        await page.waitForSelector(`#judge-results ${expectedClass}`, { timeout: 20_000 });
      }

      // Jump to workbench via button & reveal/run WaSHI solution
      await page.click("#jump-to-editor-btn");
      const washiSolBtn = page.locator('button[data-action="solution"][data-runtime="washi"]');
      await washiSolBtn.click();
      await washiSolBtn.click();
      await page.click('button[data-action="run"][data-runtime="washi"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 30_000 });

      // Single-runtime completion check: solving in WaSHI alone marks the exercise solved + updates 1/100 on #001
      const solveBadgeCount = await page.locator("#ws-solve-status .status-badge.is-solved").count();
      assert(solveBadgeCount === 1, `${id}: expected unified .status-badge.is-solved right after WaSHI AC`);
      if (id === "001") {
        const sideProg = await page.locator("#sidebar-progress-text").textContent();
        assert(sideProg?.includes("1 / 100"), `Expected sidebar progress 1 / 100 after #001 WaSHI AC, got ${sideProg}`);
      }

      // Verify overlay stays aligned right after loading full solution
      const solMatch = await page.evaluate(() => {
        const pre = document.querySelector("#highlight-washi");
        const ta = document.querySelector("#editor-washi");
        return pre && ta instanceof HTMLTextAreaElement ? pre.textContent === ta.value : false;
      });
      assert(solMatch, `${id} WaSHI solution overlay text mismatch`);

      // Keyboard navigation + ARIA attributes check for Tabs
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

      // Verify #001-#003 starters in real Pyodide highspy too
      if (id === "001" || id === "002" || id === "003") {
        await page.click('button[data-action="run"][data-runtime="highspy"]');
        const expectedClass = id === "001" ? ".verdict-pill.is-suboptimal" : ".verdict-pill.is-violation";
        await page.waitForSelector(`#judge-results ${expectedClass}`, { timeout: 120_000 });
      }

      // Reveal & Run real Python highspy solution in Pyodide Web Worker
      const pySolBtn = page.locator('button[data-action="solution"][data-runtime="highspy"]');
      await pySolBtn.click();
      await pySolBtn.click();
      await page.click('button[data-action="run"][data-runtime="highspy"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 120_000 });

      const pyCheckText = await page.locator("#tab-highspy .runtime-tab-check").innerText();
      assert(pyCheckText.includes("✓"), `${id}: expected highspy tab checkmark after Python AC`);

      console.log(`  [PASS] Problem ${id}: WaSHI AC + Pyodide highspy AC verified.`);
    }

    // 4. Verify 10 / 100 progress, persistence across reload, and Backup Dialog Export/Reset/Import
    await page.goto(`${baseUrl}/exercises/?lang=en`, { waitUntil: "networkidle" });
    await page.waitForSelector("#main-progress-text");
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("10 / 100"),
      "Expected 10 / 100 after solving #001-#010"
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

    // 4b. Verify leaving a workspace while a Python run is in flight never leaks results into another problem
    {
      const raceCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const racePage = await raceCtx.newPage();
      await racePage.goto(`${baseUrl}/exercises/?id=001&lang=en`, { waitUntil: "networkidle" });
      await racePage.click("#tab-highspy");
      const solBtn = racePage.locator('button[data-action="solution"][data-runtime="highspy"]');
      await solBtn.click();
      await solBtn.click();
      await racePage.click('button[data-action="run"][data-runtime="highspy"]');
      await racePage.click("#back-to-map-btn");
      await racePage.waitForSelector('.toc-list a[data-nav-id="002"]');
      await racePage.click('.toc-list a[data-nav-id="002"]');
      await racePage.waitForSelector("#ws-problem-title");
      await racePage.waitForTimeout(4500);
      const p002Placeholder = await racePage.locator("#judge-results").innerText();
      const p002Status = await racePage.locator("#ws-solve-status .status-badge.is-solved").count();
      assert(
        !p002Placeholder.includes("2600") && !p002Placeholder.includes("AC —"),
        `Stale #001 result leaked into #002 workspace: ${p002Placeholder}`
      );
      assert(
        p002Status === 0,
        `Stale #001 solved status leaked into #002 workspace`
      );
      await raceCtx.close();
    }

    // 4c. Explicit light-mode aesthetic & de-gamification check
    {
      const lightCtx = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        colorScheme: "light",
      });
      const lightPage = await lightCtx.newPage();
      lightPage.on("pageerror", (e) => pageErrors.push(`light: ${e.message}`));
      for (const checkUrl of [
        `${baseUrl}/exercises/?lang=en`,
        `${baseUrl}/exercises/?lang=ja`,
        `${baseUrl}/exercises/?lang=zh`,
        `${baseUrl}/exercises/?id=010&lang=en`,
        `${baseUrl}/exercises/?id=010&lang=ja`,
        `${baseUrl}/exercises/?id=010&lang=zh`,
      ]) {
        await lightPage.goto(checkUrl, { waitUntil: "networkidle" });
        const bgInfo = await lightPage.evaluate(() => {
          const rgb = getComputedStyle(document.body).backgroundColor;
          const m = rgb.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
          const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
          return { rgb, lum, text: document.body.innerText };
        });
        assert(
          bgInfo.lum > 0.85,
          `Expected bright light-mode background on ${checkUrl}, got ${bgInfo.rgb} (lum=${bgInfo.lum.toFixed(2)})`
        );
        assert(
          !GAMEY_TEXT_RE.test(bgInfo.text),
          `Unexpected gamey wording on ${checkUrl}`
        );
      }
      await lightCtx.close();
    }

    // 5. Mobile Audit (360x800 and 390x844) on Exercise Index & Math-heavy Workspace
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

    console.log("All Exercises browser checks passed cleanly (all 10 problems x WaSHI + Pyodide highspy, 3 locales, mobile audit)!");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
