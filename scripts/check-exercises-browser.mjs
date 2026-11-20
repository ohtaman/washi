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

async function waitForCoiReady(page) {
  await page.waitForFunction(
    () => window.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined",
    { timeout: 15_000 }
  );
  await page.waitForLoadState("networkidle");
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

    const chaptersSrc = fs.readFileSync(
      path.resolve(rootDir, "examples/web-demo/exercises/src/problems/chapters.ts"),
      "utf-8"
    );
    const availableChapterCount = (chaptersSrc.match(/available:\s*true\b/g) || []).length;
    const expectedTocRows = 1 + availableChapterCount * 10;
    const expectedLazyMdChunks = (expectedTocRows * 2 + 1) * 3;

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
      await waitForCoiReady(page);
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
        tocText: Array.from(document.querySelectorAll(".toc-list"))
          .map((el) => el.innerText)
          .join("\n"),
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
    assert(
      indexLayout.tocRowCount === expectedTocRows,
      `Expected ${expectedTocRows} .toc-row items (#000 + ${availableChapterCount} chapters), got ${indexLayout.tocRowCount}`
    );
    assert(indexLayout.problemGridCount === 0, "Expected zero .problem-grid card layouts");
    assert(indexLayout.tutorialStripCount === 0, "Expected zero .tutorial-strip callouts");
    assert(indexLayout.pillCount === 0, "Expected zero button-like capsule pills on Exercise Index");
    assert(indexLayout.text.includes("0 / 100"), `Expected 0 / 100 progress initially, got: ${indexLayout.text}`);
    assert(!/\/\s*200/.test(indexLayout.text), "Unexpected /200 denominator on Exercise Index");
    assert(indexLayout.text.includes("Drafted by Gemini"), "Expected Drafted by Gemini footnote on Exercise Index");
    assert(
      (await page.locator("#about-heading").innerText()).includes("About Optimization 100") &&
        (await page.locator("#about-exercises").innerText()).includes("not a Python package") &&
        (await page.locator("#about-exercises").innerText()).includes("Reviewed by ..."),
      "Expected About section heading, runtime clarification, and AI/review note in #about-exercises"
    );
    assert(!indexLayout.text.includes("AI-Drafted"), "Unexpected AI-Drafted copy on Exercise Index");
    assert(!indexLayout.text.includes("Solver-Verified"), "Unexpected Solver-Verified copy on Exercise Index");
    assert(!/Reviewed by/.test(indexLayout.tocText) && !/Reviewed by\s+@/.test(indexLayout.text), "Reviewed by handle must NOT appear when empty");
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

    // 2b. Verify built-in Guide & Glossary view (?view=guide) renders and switches locale cleanly
    await page.click("#hero-guide-link");
    await page.waitForSelector("#guide-content h1");
    const guideTextEn = await page.locator("#guide-content").innerText();
    assert(
      guideTextEn.includes("Decision Variable") && guideTextEn.includes("SUBOPTIMAL"),
      "Expected Guide & Glossary English content"
    );
    await page.click('.lang-switch-group [data-lang-btn="ja"]');
    await page.waitForFunction(() =>
      document.querySelector("#guide-content")?.textContent?.includes("決定変数")
    );
    const guideTableCheckJa = await page.evaluate(() =>
      [...document.querySelectorAll(".guide-sheet table")].map((tbl) => ({
        tableWidth: tbl.getBoundingClientRect().width,
        wrapWidth: tbl.parentElement?.getBoundingClientRect().width ?? 0,
        wrapScrollWidth: tbl.parentElement?.scrollWidth ?? 0,
        wrapClientWidth: tbl.parentElement?.clientWidth ?? 0,
        colWidths: [...tbl.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().width),
        maxBodyHeight: Math.max(
          ...[...tbl.querySelectorAll("tbody tr")].map((tr) => tr.getBoundingClientRect().height)
        ),
      }))
    );
    assert(guideTableCheckJa.length >= 2, "Expected at least 2 tables in Guide");
    for (const [idx, tbl] of guideTableCheckJa.entries()) {
      assert(
        tbl.tableWidth <= tbl.wrapWidth + 1 && tbl.wrapScrollWidth <= tbl.wrapClientWidth + 1,
        `Desktop Guide table[${idx}] overflows wrapper (${tbl.tableWidth} > ${tbl.wrapWidth}, scroll=${tbl.wrapScrollWidth}/${tbl.wrapClientWidth})`
      );
      assert(
        tbl.colWidths[0] >= 120,
        `Guide table[${idx}] col 0 too narrow (${tbl.colWidths[0]}px)`
      );
      assert(
        tbl.colWidths[1] >= 180,
        `Guide table[${idx}] col 1 too narrow (${tbl.colWidths[1]}px)`
      );
      assert(
        tbl.maxBodyHeight <= 180,
        `Guide table[${idx}] row wrapped excessively vertically (maxBodyHeight=${tbl.maxBodyHeight}px)`
      );
    }
    await page.click('.lang-switch-group [data-lang-btn="en"]');
    await page.click("#guide-back-to-map-btn");
    await page.waitForSelector("#hero-primary-cta");

    // 3. Page-by-page verification of #000 + all 10 Chapter 1 problems (#001-#010) across WaSHI AND real Pyodide highspy
    const ids = ["000", "001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

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
          discussionHref: document.querySelector("#ws-discussion-link")?.getAttribute("href") ?? "",
          discussionTarget: document.querySelector("#ws-discussion-link")?.getAttribute("target") ?? "",
          discussionRel: document.querySelector("#ws-discussion-link")?.getAttribute("rel") ?? "",
        };
      });
      assert(!/Reviewed by/.test(wsCheck.wsText), `${id} leaked Reviewed by badge`);
      assert(!/AI-Drafted|Solver-Verified/.test(wsCheck.wsText), `${id} leaked removed provenance badges`);
      assert(wsCheck.wsText.includes("Drafted by Gemini"), `${id} missing Drafted by Gemini line`);
      assert(
        /^https:\/\/github\.com\/ohtaman\/washi\/discussions\/\d+$/.test(wsCheck.discussionHref),
        `${id} expected dedicated GitHub Discussion link, got '${wsCheck.discussionHref}'`
      );
      assert(
        wsCheck.discussionTarget === "_blank" && wsCheck.discussionRel.includes("noopener"),
        `${id} expected #ws-discussion-link target=_blank noopener`
      );
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

      // Verify collapsible TOC drawer inert state, keyboard focus order, open, and Escape close on #001
      if (id === "001") {
        const closedDrawerCheck = await page.evaluate(() => {
          const sidebar = document.querySelector(".book-sidebar");
          return {
            hasInert: sidebar?.hasAttribute("inert") ?? false,
            visibility: sidebar ? getComputedStyle(sidebar).visibility : null,
          };
        });
        assert(closedDrawerCheck.hasInert, "Expected closed workspace drawer to have inert attribute");
        assert(
          closedDrawerCheck.visibility === "hidden",
          `Expected closed workspace drawer visibility:hidden, got ${closedDrawerCheck.visibility}`
        );

        await page.focus("#toc-drawer-toggle");
        await page.keyboard.press("Tab");
        const nextFocusedId = await page.evaluate(() => document.activeElement?.id ?? "");
        assert(
          nextFocusedId === "back-to-map-btn",
          `Expected Tab from #toc-drawer-toggle to skip closed drawer and focus #back-to-map-btn, got '${nextFocusedId}'`
        );

        await page.click("#toc-drawer-toggle");
        await page.waitForSelector(".book-shell.is-workspace.is-toc-open");
        await page.waitForFunction(
          () => {
            const sb = document.querySelector(".book-sidebar");
            return (
              sb !== null &&
              !sb.hasAttribute("inert") &&
              getComputedStyle(sb).visibility === "visible" &&
              Math.round(sb.getBoundingClientRect().left) === 0
            );
          }
        );
        await page.keyboard.press("Escape");
        const stillOpen = await page.locator(".book-shell.is-workspace.is-toc-open").count();
        assert(stillOpen === 0, "Expected Escape key to close TOC drawer");
        await page.waitForFunction(
          () => {
            const sb = document.querySelector(".book-sidebar");
            return (
              sb !== null &&
              sb.hasAttribute("inert") &&
              Math.round(sb.getBoundingClientRect().right) <= 0
            );
          }
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

      // Verify Statement tabs (Problem | Editorial) across all #000-#010 cleanly
      assert(
        (await page.locator("#stmt-panel-problem details.hint-accordion").count()) === 0,
        `${id} expected clean Problem tab without hint accordions`
      );
      await page.click("#stmt-tab-editorial");
      await page.waitForFunction(
        () =>
          document.querySelector("#editorial-content h2") !== null &&
          !document.querySelector("#stmt-panel-editorial")?.hasAttribute("hidden")
      );
      assert(
        (await page.locator("#stmt-panel-editorial .editorial-notice").count()) === 1,
        `Expected unsolved notice inside Editorial tab before solving #${id}`
      );
      await page.click("#stmt-tab-problem");
      await page.waitForFunction(
        () => !document.querySelector("#stmt-panel-problem")?.hasAttribute("hidden")
      );

      // Verify honest ERROR / INFEASIBLE / SUBOPTIMAL vs VIOLATION on #001
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

        // Minimization instead of maximization -> SUBOPTIMAL
        await page
          .locator("#editor-washi")
          .fill(
            origStarter
              .replace("import { Model, expr, maximize }", "import { Model, expr, minimize, maximize }")
              .replace("maximize(", "minimize(")
              .replace(
                "// TODO: Add butter constraint: c + 2 * l <= input.butterCap",
                "m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, \"butter\");"
              )
          );
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-suboptimal", { timeout: 20_000 });

        // Contradictory constraint -> INFEASIBLE (is-infeasible), not VIOLATION
        await page
          .locator("#editor-washi")
          .fill(
            origStarter.replace("await m.solve();", "m.constraint(expr`${c} >= 999`); await m.solve();")
          );
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-infeasible", { timeout: 20_000 });

        // Restore original #001 starter cleanly
        await page.click('button[data-action="reset"][data-runtime="washi"]');
      }

      // Verify #000-#003 starters reproduce VIOLATION honestly
      if (id === "000" || id === "001" || id === "002" || id === "003") {
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-violation", { timeout: 20_000 });
      }

      // Reveal & run WaSHI solution
      const washiSolBtn = page.locator('button[data-action="solution"][data-runtime="washi"]');
      await washiSolBtn.click();
      await washiSolBtn.click();
      await page.click('button[data-action="run"][data-runtime="washi"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 30_000 });

      // Single-runtime completion check: #000 keeps 0 / 100; solving #001 updates to 1 / 100; editorial notice clears immediately
      const solveBadgeCount = await page.locator("#ws-solve-status .status-badge.is-solved").count();
      assert(solveBadgeCount === 1, `${id}: expected unified .status-badge.is-solved right after WaSHI AC`);
      assert(
        (await page.locator("#stmt-panel-editorial .editorial-notice").count()) === 0,
        `${id}: expected .editorial-notice to disappear immediately after AC`
      );
      if (id === "000") {
        const sideProg = await page.locator("#sidebar-progress-text").textContent();
        assert(sideProg?.includes("0 / 100"), `Expected #000 tutorial to keep 0 / 100 main progress, got ${sideProg}`);
        const resText000 = await page.locator("#judge-results").innerText();
        assert(!resText000.includes("Vars: 0"), `#000 non-solver results should omit 'Vars: 0', got ${resText000}`);
      } else if (id === "001") {
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

      // Verify #000-#003 starters in real Pyodide PuLP too
      if (id === "000" || id === "001" || id === "002" || id === "003") {
        if (id === "001") {
          const origPyStarter = await page.locator("#editor-highspy").inputValue();
          await page
            .locator("#editor-highspy")
            .fill(origPyStarter.replace(/^\s*prob\.solve\(.*\)$/m, ""));
          await page.click('button[data-action="run"][data-runtime="highspy"]');
          await page.waitForSelector("#judge-results .verdict-pill.is-error", { timeout: 120_000 });
          await page.click('button[data-action="reset"][data-runtime="highspy"]');
        }
        await page.click('button[data-action="run"][data-runtime="highspy"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-violation", { timeout: 120_000 });
      }

      // Reveal & Run real Python PuLP solution in Pyodide Web Worker
      const pySolBtn = page.locator('button[data-action="solution"][data-runtime="highspy"]');
      await pySolBtn.click();
      await pySolBtn.click();
      if (id === "001") {
        // Also verify zero-argument `prob.solve()` defaults to HiGHS in Pyodide (instead of failing on CBC subprocess)
        const pySol = await page.locator("#editor-highspy").inputValue();
        await page.locator("#editor-highspy").fill(pySol.replace("prob.solve(pulp.HiGHS(msg=False))", "prob.solve()"));
        await page.click('button[data-action="run"][data-runtime="highspy"]');
        await page.waitForSelector("#judge-results .ac-celebration", { timeout: 120_000 });
        await page.locator("#editor-highspy").fill(pySol);
      }
      if (id === "007" || id === "010") {
        const pySol = await page.locator("#editor-highspy").inputValue();
        const poisoned =
          id === "007"
            ? pySol.replace(
                "prob.solve(pulp.HiGHS(msg=False))",
                "prob += x[0][0] == 1\n    prob += x[0][0] == 0\n    prob.solve(pulp.HiGHS(msg=False))"
              )
            : pySol.replace(
                "prob.solve(pulp.HiGHS(msg=False))",
                "prob += quantities[0] >= 9999\n    prob.solve(pulp.HiGHS(msg=False))"
              );
        await page.locator("#editor-highspy").fill(poisoned);
        await page.click('button[data-action="run"][data-runtime="highspy"]');
        await page.waitForSelector("#judge-results .verdict-pill.is-infeasible", { timeout: 120_000 });
        await page.locator("#editor-highspy").fill(pySol);
      }
      await page.click('button[data-action="run"][data-runtime="highspy"]');
      await page.waitForSelector("#judge-results .ac-celebration", { timeout: 120_000 });
      if (id !== "000") {
        assert(
          (await page.locator("#judge-results .case-meta").count()) > 0,
          `${id}: expected Python case-meta variable/constraint metrics from pyodide-worker`
        );
      }

      const pyCheckText = await page.locator("#tab-highspy .runtime-tab-check").innerText();
      assert(pyCheckText.includes("✓"), `${id}: expected highspy tab checkmark after Python AC`);

      console.log(`  [PASS] Problem ${id}: WaSHI AC + Pyodide PuLP AC verified.`);
    }

    // 4. Verify 10 / 100 progress persistence across reload without Backup UI + clearing solved status
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

    // Verify clearing single problem (#001) solved status in workspace
    await page.goto(`${baseUrl}/exercises/?id=001&lang=en`, { waitUntil: "networkidle" });
    await page.waitForSelector("#clear-problem-solved-btn");
    await page.click("#clear-problem-solved-btn");
    await page.waitForFunction(
      () => document.querySelector("#ws-solve-status .status-badge.is-solved") === null
    );
    assert(
      (await page.locator("#stmt-panel-editorial .editorial-notice").count()) === 1,
      "Expected .editorial-notice to reappear after clearing #001 solved status"
    );
    assert(
      (await page.locator("#tab-washi .runtime-tab-check").innerText()).trim() === "",
      "Expected WaSHI tab checkmark cleared after #clear-problem-solved-btn"
    );
    assert(
      (await page.locator("#sidebar-progress-text").textContent())?.includes("9 / 100"),
      "Expected 9 / 100 after clearing #001 solved status"
    );

    // Verify clearing all remaining solved records via two-click #clear-all-solved-btn on Overview
    await page.goto(`${baseUrl}/exercises/?lang=en`, { waitUntil: "networkidle" });
    await page.waitForSelector("#clear-all-solved-btn");
    await page.click("#clear-all-solved-btn");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#clear-all-solved-btn")
          ?.classList.contains("ex-btn-warning") ?? false
    );
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("9 / 100"),
      "Single click must only arm #clear-all-solved-btn without wiping progress"
    );
    await page.click("#clear-all-solved-btn");
    await page.waitForFunction(
      () => document.querySelector("#clear-all-solved-btn") === null
    );
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("0 / 100"),
      "Expected 0 / 100 after confirming #clear-all-solved-btn"
    );
    await page.reload({ waitUntil: "networkidle" });
    assert(
      (await page.locator("#main-progress-text").textContent())?.includes("0 / 100"),
      "Expected 0 / 100 to persist after reload"
    );

    // 4a. Representative milestone verifications for Chapters 2+
    {
      const milestoneCases = [
        { id: "011", expectHighspy: true },
        { id: "027", expectHighspy: true },
        { id: "036", expectHighspy: false },
      ];
      for (const mc of milestoneCases) {
        await page.goto(`${baseUrl}/exercises/?id=${mc.id}&lang=en`, { waitUntil: "networkidle" });
        await page.waitForSelector("#ws-problem-title");
        assert(
          (await page.locator("#ws-discussion-link").count()) === 0,
          `${mc.id}: expected #ws-discussion-link omitted when discussionNumber is absent`
        );
        if (mc.expectHighspy) {
          assert((await page.locator("#tab-highspy").count()) === 1, `${mc.id}: expected #tab-highspy`);
        } else {
          assert((await page.locator("#tab-highspy").count()) === 0, `${mc.id}: expected WaSHI-only (no #tab-highspy)`);
        }
        const washiSolBtn = page.locator('button[data-action="solution"][data-runtime="washi"]');
        await washiSolBtn.click();
        await washiSolBtn.click();
        await page.click('button[data-action="run"][data-runtime="washi"]');
        await page.waitForSelector("#judge-results .ac-celebration", { timeout: 60_000 });
        if (mc.expectHighspy) {
          await page.click("#tab-highspy");
          const pySolBtn = page.locator('button[data-action="solution"][data-runtime="highspy"]');
          await pySolBtn.click();
          await pySolBtn.click();
          await page.click('button[data-action="run"][data-runtime="highspy"]');
          await page.waitForSelector("#judge-results .ac-celebration", { timeout: 120_000 });
        }
        console.log(`  [PASS] Milestone ${mc.id}: real-browser AC verified.`);
      }
    }

    // 4b. Verify leaving a workspace while a Python run is in flight never leaks results into another problem
    {
      const raceCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const racePage = await raceCtx.newPage();
      await racePage.goto(`${baseUrl}/exercises/?id=001&lang=en`, { waitUntil: "networkidle" });
      await waitForCoiReady(racePage);
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

    // 4b2. Verify stale #001 workspace is inert and ignores edits while delayed #002 Markdown loads
    {
      const delayCtx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      const delayPage = await delayCtx.newPage();
      delayPage.on("pageerror", (e) => pageErrors.push(`delay-nav: ${e.message}`));
      await delayPage.goto(`${baseUrl}/exercises/?id=001&lang=en`, { waitUntil: "networkidle" });
      await delayPage.waitForSelector("#editor-washi");

      let releaseRoute;
      let notifyIntercepted;
      const chunkIntercepted = new Promise((resolve) => {
        notifyIntercepted = resolve;
      });
      await delayPage.route(/\/assets\/en-.*\.js$/, async (route) => {
        const url = route.request().url();
        if (delayPage.url().includes("id=002")) {
          notifyIntercepted?.(url);
          await new Promise((done) => {
            releaseRoute = done;
          });
        }
        await route.continue();
      });

      await delayPage.click('.ws-subbar a[data-nav-id="002"]');
      await chunkIntercepted;

      const midFlight = await delayPage.evaluate(() => {
        const split = document.querySelector(".ws-split");
        const editor = document.querySelector("#editor-washi");
        const wasInert = split?.hasAttribute("inert") ?? false;
        const wasReadOnly = editor instanceof HTMLTextAreaElement ? editor.readOnly : false;
        if (editor instanceof HTMLTextAreaElement) {
          editor.value = "// STALE #001 EDIT DURING #002 LOAD";
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        }
        const progressRaw = window.localStorage.getItem("washi_exercises_progress_v1");
        return { wasInert, wasReadOnly, progressRaw };
      });
      assert(midFlight.wasInert, "Expected stale .ws-split to have inert attribute while loading #002");
      assert(midFlight.wasReadOnly, "Expected stale #editor-washi to be readOnly while loading #002");
      assert(
        !midFlight.progressRaw?.includes("STALE #001 EDIT"),
        `Stale edit while loading #002 leaked into localStorage drafts: ${midFlight.progressRaw}`
      );

      releaseRoute?.();
      await delayPage.waitForFunction(
        () =>
          document.querySelector("#ws-problem-title")?.textContent?.includes("002") &&
          !document.querySelector(".ws-split")?.hasAttribute("inert")
      );
      const loaded002Code = await delayPage.locator("#editor-washi").inputValue();
      assert(
        !loaded002Code.includes("STALE #001 EDIT") && loaded002Code.includes("P002Input"),
        `Expected fresh #002 starter after delayed load, got: ${loaded002Code.slice(0, 120)}`
      );
      await delayCtx.close();
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
        await waitForCoiReady(lightPage);
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
        lazyMdChunks.length === expectedLazyMdChunks,
        `Expected ${expectedLazyMdChunks} emitted lazy Markdown JS chunks ((${expectedTocRows} statements + ${expectedTocRows} editorials + 1 guide) x 3 locales) in dist/site/assets, got ${lazyMdChunks.length}`
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
        await waitForCoiReady(longPage);
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
        `${baseUrl}/exercises/?lang=ja&view=guide`,
        `${baseUrl}/exercises/?id=005&lang=ja`,
        `${baseUrl}/exercises/?id=007&lang=en`,
        `${baseUrl}/exercises/?id=009&lang=ja`,
        `${baseUrl}/exercises/?id=010&lang=ja`,
      ]) {
        await mobPage.goto(checkUrl, { waitUntil: "networkidle" });
        await waitForCoiReady(mobPage);
        await mobPage.waitForSelector(
          checkUrl.includes("?id=")
            ? "#ws-problem-title"
            : checkUrl.includes("view=guide")
              ? ".guide-sheet table"
              : ".book-shell"
        );
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
          const guideTableOverflows = [...document.querySelectorAll(".guide-sheet .md-table-wrap")]
            .filter((wrap) => wrap.scrollWidth > wrap.clientWidth + 1)
            .map((wrap) => `${wrap.scrollWidth}/${wrap.clientWidth}`);
          return { docOverflow, smallTargets, stackedClean, guideTableOverflows };
        });
        assert(
          metrics.guideTableOverflows.length === 0,
          `Mobile Guide table horizontal overflow at ${vp.width}x${vp.height}: ${metrics.guideTableOverflows.join(", ")}`
        );
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
          const wb = document.querySelector(".answer-workbench");
          const panel = document.querySelector(".answer-workbench > [role='tabpanel']:not([hidden])");
          const inner = panel?.querySelector(".tab-panel-inner");
          const wrap = panel?.querySelector(".code-editor-wrap");
          const results = document.querySelector("#judge-results");
          const ta = document.querySelector("#editor-washi");
          if (!wb || !panel || !inner || !wrap || !results || !(ta instanceof HTMLTextAreaElement)) {
            return null;
          }
          const wbRect = wb.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          const wrapRect = wrap.getBoundingClientRect();
          const resRect = results.getBoundingClientRect();
          return {
            wbHeight: wbRect.height,
            wbBottom: wbRect.bottom,
            panelHeight: panelRect.height,
            innerHeight: innerRect.height,
            wrapHeight: wrapRect.height,
            wrapBottom: wrapRect.bottom,
            resTop: resRect.top,
            scrollHeight: ta.scrollHeight,
            clientHeight: ta.clientHeight,
          };
        });
        assert(mobMetrics, "Missing mobile editor elements for long-code check");
        assert(
          mobMetrics.panelHeight >= mobMetrics.innerHeight - 1 && mobMetrics.panelHeight >= 280,
          `Expected non-collapsed mobile [role='tabpanel'] (${mobMetrics.panelHeight} < ${mobMetrics.innerHeight})`
        );
        assert(
          mobMetrics.wrapBottom <= mobMetrics.resTop + 1 && mobMetrics.wrapBottom <= mobMetrics.wbBottom + 1,
          `Expected mobile .code-editor-wrap unclipped above results/workbench (wrapBottom=${mobMetrics.wrapBottom}, resTop=${mobMetrics.resTop}, wbBottom=${mobMetrics.wbBottom})`
        );
        assert(
          mobMetrics.wrapHeight >= 280 && mobMetrics.wrapHeight <= 450,
          `Expected mobile .code-editor-wrap in [280, 450]px with 120 lines, got ${mobMetrics.wrapHeight}`
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
