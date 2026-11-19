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

    // 2. Book TOC & Index layout checks (Plan C flush sidebar, white canvas, 0/100, Generated by Gemini, no pill capsules)
    const indexLayout = await page.evaluate(() => {
      const sb = document.querySelector(".book-sidebar");
      return {
        sidebarCount: document.querySelectorAll(".book-sidebar").length,
        sidebarLeft: sb ? Math.round(sb.getBoundingClientRect().left) : -1,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        tocListCount: document.querySelectorAll(".toc-list").length,
        tocRowCount: document.querySelectorAll(".toc-list .toc-row[data-problem-id]").length,
        problemGridCount: document.querySelectorAll(".problem-grid").length,
        tutorialStripCount: document.querySelectorAll(".tutorial-strip").length,
        pillCount: document.querySelectorAll(".paradigm-pill, .role-pill, .prov-badge").length,
        text: document.body.innerText,
      };
    });
    assert(indexLayout.sidebarCount === 1, "Expected .book-sidebar on Exercise Index");
    assert(indexLayout.sidebarLeft === 0, `Expected flush-left .book-sidebar at x=0, got x=${indexLayout.sidebarLeft}`);
    assert(
      indexLayout.bodyBg === "rgb(255, 255, 255)",
      `Expected crisp white Plan C canvas rgb(255, 255, 255), got ${indexLayout.bodyBg}`
    );
    assert(indexLayout.tocListCount >= 1, "Expected .toc-list on Exercise Index");
    assert(indexLayout.tocRowCount === 10, `Expected 10 Chapter 1 .toc-row items, got ${indexLayout.tocRowCount}`);
    assert(indexLayout.problemGridCount === 0, "Expected zero .problem-grid card layouts");
    assert(indexLayout.tutorialStripCount === 0, "Expected zero .tutorial-strip callouts");
    assert(indexLayout.pillCount === 0, "Expected zero button-like capsule pills on Exercise Index");
    assert(indexLayout.text.includes("0 / 100"), `Expected 0 / 100 progress initially, got: ${indexLayout.text}`);
    assert(!/\/\s*200/.test(indexLayout.text), "Unexpected /200 denominator on Exercise Index");
    assert(indexLayout.text.includes("Generated by Gemini"), "Expected Generated by Gemini footnote on Exercise Index");
    assert(!indexLayout.text.includes("AI-Drafted"), "Unexpected AI-Drafted copy on Exercise Index");
    assert(!indexLayout.text.includes("Solver-Verified"), "Unexpected Solver-Verified copy on Exercise Index");
    assert(!/Reviewed by/.test(indexLayout.text), "Reviewed by must NOT appear when empty");
    assert(
      !GAMEY_TEXT_RE.test(indexLayout.text),
      `Unexpected gamey/star copy on Exercise Index: ${indexLayout.text}`
    );

    // Dark-mode toggle & language switcher aligned with Docs / Playground (vitepress-theme-appearance + .lang-switch-group)
    assert((await page.locator("#backup-open-btn").count()) === 0, "Backup button must NOT be rendered");
    assert((await page.locator("#backup-dialog").count()) === 0, "Backup dialog must NOT be rendered");
    assert((await page.locator("#locale-select").count()) === 0, "Dropdown #locale-select must be replaced by .lang-switch-group");
    assert((await page.locator(".lang-switch-group [data-lang-btn]").count()) === 3, "Expected EN/JA/ZH buttons in .lang-switch-group");

    const initialMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    await page.click("#theme-toggle-btn");
    const flippedMetaScheme = await page.locator('meta[name="color-scheme"]').getAttribute("content");
    const storedAppearance = await page.evaluate(() => window.localStorage.getItem("vitepress-theme-appearance"));
    assert(
      flippedMetaScheme === "dark" || flippedMetaScheme === "light",
      `Expected explicit light/dark meta content after toggle, got '${flippedMetaScheme}' (initial '${initialMetaScheme}')`
    );
    assert(
      storedAppearance === flippedMetaScheme,
      `Expected vitepress-theme-appearance='${flippedMetaScheme}', got '${storedAppearance}'`
    );
    await page.click("#theme-toggle-btn");

    await page.click('.lang-switch-group [data-lang-btn="ja"]');
    await page.waitForSelector(".ex-hero-title");
    assert(
      (await page.locator(".ex-hero-title").textContent())?.includes(exJa.ui.brandTitle),
      "Expected segmented [data-lang-btn=\"ja\"] click to switch header/hero to Japanese"
    );
    assert(
      (await page.evaluate(() => window.localStorage.getItem("washi_locale"))) === "ja",
      "Expected shared washi_locale localStorage sync"
    );
    await page.click('.lang-switch-group [data-lang-btn="en"]');
    await page.waitForSelector(".ex-hero-title");

    // 3. Page-by-page verification of all 10 problems (#001-#010) across WaSHI AND real Pyodide highspy
    const ids = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

    for (const id of ids) {
      await page.goto(`${baseUrl}/exercises/?id=${id}&lang=en`, { waitUntil: "networkidle" });
      await page.waitForSelector("#ws-problem-title");

      const wsCheck = await page.evaluate(() => {
        const sheet = document.querySelector(".ws-problem-sheet");
        const jumpBtn = document.querySelector("#jump-to-editor-btn");
        const workbench = document.querySelector("#answer-workbench");
        const wbHead = document.querySelector(".answer-workbench-head");
        const gutter = document.querySelector("#gutter-washi");
        const highlight = document.querySelector("#highlight-washi");
        const textarea = document.querySelector("#editor-washi");
        const span = document.querySelector("#highlight-washi span");
        const sidebar = document.querySelector(".book-sidebar");
        const problemRect = sheet ? sheet.getBoundingClientRect() : null;
        const wbRect = workbench ? workbench.getBoundingClientRect() : null;
        return {
          wsText: sheet ? sheet.innerText : "",
          extraBadgesCount: document.querySelectorAll(
            ".ws-feedback-link, .paradigm-pill, .role-pill, .prov-badge"
          ).length,
          wbHeadBg: wbHead ? getComputedStyle(wbHead).backgroundColor : "",
          hasJumpBtn: Boolean(jumpBtn),
          hasWorkbench: Boolean(workbench),
          hasGutter: Boolean(gutter),
          hasHighlight: Boolean(highlight),
          isSideBySide:
            Boolean(problemRect && wbRect && wbRect.left >= problemRect.right - 2),
          sidebarHiddenLeft: sidebar ? Math.round(sidebar.getBoundingClientRect().right) <= 0 : false,
          textMatch:
            highlight && textarea instanceof HTMLTextAreaElement
              ? highlight.textContent === textarea.value
              : false,
          textareaWeight: textarea ? getComputedStyle(textarea).fontWeight : "",
          spanWeight: span ? getComputedStyle(span).fontWeight : "400",
        };
      });
      assert(!/Reviewed by/.test(wsCheck.wsText), `${id} leaked Reviewed by badge`);
      assert(!/AI-Drafted|Solver-Verified/.test(wsCheck.wsText), `${id} leaked removed provenance badges`);
      assert(wsCheck.wsText.includes("Generated by Gemini"), `${id} missing Generated by Gemini line`);
      assert(wsCheck.extraBadgesCount === 0, `${id} rendered ${wsCheck.extraBadgesCount} removed pill/feedback elements`);
      const wbRgb = wsCheck.wbHeadBg.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
      assert(
        wbRgb[0] >= 240 && Math.abs(wbRgb[0] - wbRgb[2]) < 15,
        `${id} expected neutral stone .answer-workbench-head background (not red/pink), got ${wsCheck.wbHeadBg}`
      );
      assert(wsCheck.isSideBySide, `${id} expected split side-by-side layout at 1366x900`);
      assert(wsCheck.sidebarHiddenLeft, `${id} expected TOC drawer initially closed (off-screen left)`);
      assert(!/\$0\s*\\le/.test(wsCheck.wsText), `${id} leaked raw unrendered LaTeX ($0 \\le)`);
      assert(wsCheck.hasJumpBtn, `${id} missing #jump-to-editor-btn`);
      assert(wsCheck.hasWorkbench, `${id} missing #answer-workbench`);
      assert(wsCheck.hasGutter && wsCheck.hasHighlight, `${id} missing gutter/overlay highlighter`);
      assert(wsCheck.textMatch, `${id} overlay <pre>.textContent did not match textarea.value`);
      assert(
        wsCheck.textareaWeight === "400" && wsCheck.spanWeight === "400",
        `${id} editor fontWeight must stay 400 (got textarea=${wsCheck.textareaWeight}, span=${wsCheck.spanWeight})`
      );

      // Verify collapsible TOC drawer open/Escape close on #001, and independent pane scroll on #005
      if (id === "001") {
        await page.click("#toc-drawer-toggle");
        await page.waitForSelector(".book-shell.is-workspace.is-toc-open");
        await page.waitForFunction(
          () => Math.round(document.querySelector(".book-sidebar")?.getBoundingClientRect().left ?? -1) === 0
        );
        await page.keyboard.press("Escape");
        const stillOpen = await page.locator(".book-shell.is-workspace.is-toc-open").count();
        assert(stillOpen === 0, "Expected Escape key to close TOC drawer");
        await page.waitForFunction(
          () => Math.round(document.querySelector(".book-sidebar")?.getBoundingClientRect().right ?? 1) <= 0
        );
      }
      if (id === "005") {
        const scrollCheck = await page.evaluate(() => {
          const leftPane = document.querySelector(".ws-pane-problem");
          const rightPane = document.querySelector(".ws-pane-editor");
          const wb = document.querySelector("#answer-workbench");
          if (!leftPane || !rightPane || !wb) return null;
          const beforeTop = Math.round(wb.getBoundingClientRect().top);
          leftPane.scrollTop = 300;
          const afterTop = Math.round(wb.getBoundingClientRect().top);
          return {
            leftScroll: leftPane.scrollTop,
            rightScroll: rightPane.scrollTop,
            beforeTop,
            afterTop,
          };
        });
        assert(scrollCheck && scrollCheck.leftScroll > 0, "Expected .ws-pane-problem to scroll independently on #005");
        assert(scrollCheck.rightScroll === 0, `Expected .ws-pane-editor scrollTop to remain 0, got ${scrollCheck.rightScroll}`);
        assert(
          scrollCheck.beforeTop === scrollCheck.afterTop,
          `Expected right editor position to stay pinned (${scrollCheck.beforeTop} vs ${scrollCheck.afterTop})`
        );
      }

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

      // Verify honest ERROR / INFEASIBLE vs VIOLATION on #001
      if (id === "001") {
        const origStarter = await page.locator("#editor-washi").inputValue();
        // Missing await m.solve() -> RUNTIME_ERROR (is-error), not VIOLATION
        await page.locator("#editor-washi").fill(origStarter.replace("await m.solve();", ""));
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-error", { timeout: 20_000 });
        const errText = await page.locator("#judge-results").innerText();
        assert(!errText.includes("VIOLATION"), "#001 missing solve() must not be classified as VIOLATION");

        // Returning {} -> RUNTIME_ERROR (is-error), not VIOLATION
        await page
          .locator("#editor-washi")
          .fill(origStarter.replace(/return \{[\s\S]*?\};/, "return {};"));
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-error", { timeout: 20_000 });

        // Contradictory constraint -> INFEASIBLE (is-infeasible), not VIOLATION
        await page
          .locator("#editor-washi")
          .fill(
            origStarter
              .replace("minimize(", "maximize(")
              .replace("await m.solve();", "m.constraint(expr`${c} >= 999`); await m.solve();")
          );
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-infeasible", { timeout: 20_000 });

        // Restore original #001 starter cleanly
        await page.click('button[data-action="reset"][data-runtime="washi"]');
      }

      // Verify #001-#003 starters reproduce SUBOPTIMAL (#001) and VIOLATION (#002, #003) honestly
      if (id === "001" || id === "002" || id === "003") {
        await page.click('button[data-action="run"][data-runtime="washi"]');
        const expectedClass = id === "001" ? ".verdict-pill.is-suboptimal" : ".verdict-pill.is-violation";
        await page.waitForSelector(`#judge-results ${expectedClass}`, { timeout: 20_000 });
      }

      // Reveal & run WaSHI solution
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

    // 4. Verify 10 / 100 progress persistence across reload without Backup UI
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
    assert((await page.locator("#backup-open-btn").count()) === 0, "Backup button must remain absent");
    assert((await page.locator("#backup-dialog").count()) === 0, "Backup dialog must remain absent");

    // 4b. Verify leaving a workspace while a Python run is in flight never leaks results into another problem
    {
      const raceCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const racePage = await raceCtx.newPage();
      await racePage.goto(`${baseUrl}/exercises/?id=001&lang=en`, { waitUntil: "networkidle" });
      await racePage.waitForSelector("#tab-highspy");
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
        await lightPage.waitForSelector(checkUrl.includes("?id=") ? "#ws-problem-title" : ".book-shell");
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

    // 4d. Lazy Markdown asset & long-code bounded editor viewport check (1366x900 & 1280x720)
    {
      const assetFiles = fs.readdirSync(path.resolve(siteDist, "assets"));
      const lazyMdChunks = assetFiles.filter((f) => /^(en|ja|zh)-.*\.js$/.test(f));
      assert(
        lazyMdChunks.length === 30,
        `Expected 30 emitted lazy Markdown JS chunks (10 problems x 3 locales) in dist/site/assets, got ${lazyMdChunks.length}`
      );

      const p005Base = fs.readFileSync(
        path.resolve(
          rootDir,
          "examples/web-demo/exercises/src/problems/ch01-modeling-basics/005-blending-nutrition/washi/solution.ts"
        ),
        "utf-8"
      );
      const padComments = Array.from(
        { length: 105 },
        (_, idx) => `// padding comment line ${idx + 1}: verifying fixed-height internal editor scroll & synchronized gutter`
      ).join("\n");
      const longCode = `${p005Base.trimEnd()}\n${padComments}\n`;

      for (const vp of [
        { width: 1366, height: 900 },
        { width: 1280, height: 720 },
      ]) {
        const longCtx = await browser.newContext({ viewport: vp, colorScheme: "light" });
        const longPage = await longCtx.newPage();
        longPage.on("pageerror", (e) => pageErrors.push(`long-code ${vp.width}x${vp.height}: ${e.message}`));
        const requestedChunks = [];
        longPage.on("response", (res) => {
          const url = res.url();
          if (/\/assets\/ja-.*\.js$/.test(url)) {
            requestedChunks.push(url);
          }
        });

        await longPage.goto(`${baseUrl}/exercises/?id=005&lang=ja`, { waitUntil: "networkidle" });
        await longPage.waitForSelector("#ws-problem-title");
        assert(
          requestedChunks.length >= 1,
          `Expected lazy Japanese Markdown chunk fetch on #005?lang=ja (${vp.width}x${vp.height})`
        );

        await longPage.locator("#editor-washi").fill(longCode);
        await longPage.click('button[data-action="run"][data-runtime="washi"]');
        await longPage.waitForSelector("#judge-results .ac-celebration", { timeout: 20_000 });

        await longPage.evaluate(() => {
          const ta = document.querySelector("#editor-washi");
          if (ta instanceof HTMLTextAreaElement) {
            ta.scrollTop = 300;
          }
        });
        await longPage.waitForFunction(() => {
          const ta = document.querySelector("#editor-washi");
          const hi = document.querySelector("#highlight-washi");
          const gu = document.querySelector("#gutter-washi");
          if (!(ta instanceof HTMLTextAreaElement) || !hi || !gu) return false;
          return (
            ta.scrollTop >= 290 &&
            Math.abs(hi.scrollTop - ta.scrollTop) <= 1 &&
            Math.abs(gu.scrollTop - ta.scrollTop) <= 1
          );
        });

        const longMetrics = await longPage.evaluate(() => {
          const wrap = document.querySelector(".code-editor-wrap");
          const panel = document.querySelector('#panel-washi');
          const toolbar = document.querySelector('#panel-washi .editor-toolbar');
          const ta = document.querySelector("#editor-washi");
          const hi = document.querySelector("#highlight-washi");
          const gu = document.querySelector("#gutter-washi");
          const runBtn = document.querySelector('button[data-action="run"][data-runtime="washi"]');
          const results = document.querySelector("#judge-results");
          const rightPane = document.querySelector(".ws-pane-editor");
          if (!wrap || !panel || !toolbar || !(ta instanceof HTMLTextAreaElement) || !hi || !gu || !runBtn || !results || !rightPane) {
            return null;
          }
          const wrapRect = wrap.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const toolbarRect = toolbar.getBoundingClientRect();
          const runRect = runBtn.getBoundingClientRect();
          const resRect = results.getBoundingClientRect();
          return {
            vh: window.innerHeight,
            wrapHeight: wrapRect.height,
            scrollHeight: ta.scrollHeight,
            clientHeight: ta.clientHeight,
            taScrollTop: ta.scrollTop,
            hiScrollTop: hi.scrollTop,
            guScrollTop: gu.scrollTop,
            paneScrollTop: rightPane.scrollTop,
            panelBottom: panelRect.bottom,
            toolbarBottom: toolbarRect.bottom,
            runTop: runRect.top,
            runBottom: runRect.bottom,
            resTop: resRect.top,
            resBottom: resRect.bottom,
          };
        });
        assert(longMetrics, `Missing long-code DOM elements at ${vp.width}x${vp.height}`);
        assert(
          longMetrics.wrapHeight < 620,
          `Expected bounded .code-editor-wrap (< 620px) at ${vp.width}x${vp.height}, got ${longMetrics.wrapHeight}`
        );
        assert(
          longMetrics.scrollHeight > longMetrics.clientHeight,
          `Expected internal vertical scroll on 120-line editor (${longMetrics.scrollHeight} <= ${longMetrics.clientHeight})`
        );
        assert(
          Math.abs(longMetrics.hiScrollTop - longMetrics.taScrollTop) <= 1 &&
            Math.abs(longMetrics.guScrollTop - longMetrics.taScrollTop) <= 1,
          `Expected synchronized highlight/gutter scroll (${longMetrics.taScrollTop}, ${longMetrics.hiScrollTop}, ${longMetrics.guScrollTop})`
        );
        assert(
          longMetrics.paneScrollTop === 0,
          `Expected .ws-pane-editor scrollTop to stay 0, got ${longMetrics.paneScrollTop}`
        );
        assert(
          longMetrics.toolbarBottom <= longMetrics.resTop + 1 &&
            longMetrics.toolbarBottom <= longMetrics.panelBottom + 1,
          `Expected .editor-toolbar (${longMetrics.toolbarBottom}) unclipped above #judge-results (${longMetrics.resTop}) at ${vp.width}x${vp.height}`
        );
        assert(
          longMetrics.runTop >= 0 && longMetrics.runBottom <= longMetrics.vh,
          `Expected Run button visible in viewport [0, ${longMetrics.vh}], got [${longMetrics.runTop}, ${longMetrics.runBottom}]`
        );
        assert(
          longMetrics.resTop >= 0 && longMetrics.resBottom <= longMetrics.vh,
          `Expected #judge-results visible in viewport [0, ${longMetrics.vh}], got [${longMetrics.resTop}, ${longMetrics.resBottom}]`
        );

        // Switch to highspy tab while #judge-results is populated to verify .python-lazy-note + toolbar fit cleanly too
        await longPage.click("#tab-highspy");
        await longPage.locator("#editor-highspy").fill(
          Array.from({ length: 120 }, (_, idx) => `# python line ${idx + 1}`).join("\n")
        );
        const pyMetrics = await longPage.evaluate(() => {
          const panel = document.querySelector("#panel-highspy");
          const toolbar = document.querySelector("#panel-highspy .editor-toolbar");
          const results = document.querySelector("#judge-results");
          if (!panel || !toolbar || !results) return null;
          return {
            panelBottom: panel.getBoundingClientRect().bottom,
            toolbarBottom: toolbar.getBoundingClientRect().bottom,
            resTop: results.getBoundingClientRect().top,
          };
        });
        assert(pyMetrics, `Missing highspy long-code elements at ${vp.width}x${vp.height}`);
        assert(
          pyMetrics.toolbarBottom <= pyMetrics.resTop + 1 &&
            pyMetrics.toolbarBottom <= pyMetrics.panelBottom + 1,
          `Expected highspy .editor-toolbar (${pyMetrics.toolbarBottom}) unclipped above #judge-results (${pyMetrics.resTop}) at ${vp.width}x${vp.height}`
        );
        await longCtx.close();
      }
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
        `${baseUrl}/exercises/?id=005&lang=ja`,
        `${baseUrl}/exercises/?id=007&lang=en`,
        `${baseUrl}/exercises/?id=009&lang=ja`,
        `${baseUrl}/exercises/?id=010&lang=ja`,
      ]) {
        await mobPage.goto(checkUrl, { waitUntil: "networkidle" });
        await mobPage.waitForSelector(checkUrl.includes("?id=") ? "#ws-problem-title" : ".book-shell");
        const acc = mobPage.locator("details.hint-accordion summary");
        const count = await acc.count();
        for (let i = 0; i < count; i++) await acc.nth(i).click();

        const metrics = await mobPage.evaluate(() => {
          const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const smallTargets = [];
          for (const el of document.querySelectorAll("button, a.ex-btn-primary, a.ex-btn-ghost, a.ws-back-link, a.ws-nav-link, [role='tab'], summary, select")) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height < 40) {
              smallTargets.push(`${el.tagName}#${el.id || el.className}:${Math.round(rect.height)}px`);
            }
          }
          const probPane = document.querySelector(".ws-pane-problem");
          const sheet = document.querySelector(".ws-problem-sheet");
          const wb = document.querySelector("#answer-workbench");
          const stackedClean =
            !probPane || !sheet || !wb
              ? true
              : probPane.getBoundingClientRect().height >= sheet.getBoundingClientRect().height &&
                probPane.getBoundingClientRect().bottom <= wb.getBoundingClientRect().top + 1;
          return { docOverflow, smallTargets, stackedClean };
        });
        assert(
          metrics.stackedClean,
          `Mobile stacked panes collapsed or overlapped at ${vp.width}x${vp.height} on ${checkUrl}`
        );
        assert(
          metrics.docOverflow <= 0,
          `Mobile overflow ${metrics.docOverflow}px at ${vp.width}x${vp.height} on ${checkUrl}`
        );
        assert(
          metrics.smallTargets.length === 0,
          `Undersized touch targets at ${vp.width}x${vp.height} on ${checkUrl}: ${metrics.smallTargets.join(", ")}`
        );
      }

      if (vp.width === 390) {
        await mobPage.goto(`${baseUrl}/exercises/?id=005&lang=en`, { waitUntil: "networkidle" });
        await mobPage.waitForSelector("#ws-problem-title");
        const mobLong = Array.from({ length: 120 }, (_, i) => `// line ${i + 1}`).join("\n");
        await mobPage.locator("#editor-washi").fill(mobLong);
        const mobMetrics = await mobPage.evaluate(() => {
          const wrap = document.querySelector(".code-editor-wrap");
          const ta = document.querySelector("#editor-washi");
          if (!wrap || !(ta instanceof HTMLTextAreaElement)) return null;
          return {
            wrapHeight: wrap.getBoundingClientRect().height,
            scrollHeight: ta.scrollHeight,
            clientHeight: ta.clientHeight,
          };
        });
        assert(mobMetrics, "Missing mobile editor elements for long-code check");
        assert(
          mobMetrics.wrapHeight <= 450,
          `Expected mobile .code-editor-wrap <= 450px with 120 lines, got ${mobMetrics.wrapHeight}`
        );
        assert(
          mobMetrics.scrollHeight > mobMetrics.clientHeight,
          `Expected internal scroll on mobile 120-line editor (${mobMetrics.scrollHeight} <= ${mobMetrics.clientHeight})`
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
