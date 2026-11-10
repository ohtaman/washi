import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
// @ts-expect-error .mjs script module
import { appendInteractiveRoutesToSitemap } from "../scripts/build-site.mjs";

describe("Site SEO: Sitemap and robots.txt configuration", () => {
  const rootDir = process.cwd();
  const vitepressConfigPath = path.resolve(rootDir, "docs/.vitepress/config.mts");
  const publicRobotsPath = path.resolve(rootDir, "docs/public/robots.txt");
  const siteDistPath = path.resolve(rootDir, "dist/site");
  const siteRobotsPath = path.resolve(siteDistPath, "robots.txt");
  const siteSitemapPath = path.resolve(siteDistPath, "sitemap.xml");

  it("configures sitemap hostname with repository base in docs/.vitepress/config.mts", () => {
    expect(fs.existsSync(vitepressConfigPath)).toBe(true);
    const content = fs.readFileSync(vitepressConfigPath, "utf-8");

    // Must configure sitemap with trailing-slash base hostname to prevent URL path stripping
    expect(content).toMatch(/sitemap:\s*\{\s*hostname:\s*["']https:\/\/ohtaman\.github\.io\/washi\/["']/);
  });

  it("provides docs/public/robots.txt pointing to the canonical sitemap.xml", () => {
    expect(fs.existsSync(publicRobotsPath)).toBe(true);
    const content = fs.readFileSync(publicRobotsPath, "utf-8");

    expect(content).toMatch(/User-agent:\s*\*/i);
    expect(content).toMatch(/Allow:\s*\//i);
    expect(content).toMatch(/Sitemap:\s*https:\/\/ohtaman\.github\.io\/washi\/sitemap\.xml/i);
  });

  it("appends interactive demo, apps, and games routes to sitemap XML via appendInteractiveRoutesToSitemap", () => {
    const webDemoRoot = path.resolve(rootDir, "examples/web-demo");
    const baseXml =
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ohtaman.github.io/washi/</loc></url></urlset>';
    const augmented = appendInteractiveRoutesToSitemap(baseXml, webDemoRoot);
    const locs = [...augmented.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toEqual([
      "https://ohtaman.github.io/washi/",
      "https://ohtaman.github.io/washi/demo/",
      "https://ohtaman.github.io/washi/apps/ai-shift/",
      "https://ohtaman.github.io/washi/apps/ai-timetable-theory/",
      "https://ohtaman.github.io/washi/apps/ai-timetable/",
      "https://ohtaman.github.io/washi/games/demon-castle-shift-theory/",
      "https://ohtaman.github.io/washi/games/demon-castle-shift/",
      "https://ohtaman.github.io/washi/games/mofumofu-sheep-theory/",
      "https://ohtaman.github.io/washi/games/mofumofu-sheep/",
      "https://ohtaman.github.io/washi/games/titan-pack-theory/",
      "https://ohtaman.github.io/washi/games/titan-pack/",
    ]);

    // Idempotent when called a second time
    expect(appendInteractiveRoutesToSitemap(augmented, webDemoRoot)).toBe(augmented);
  });

  it("verifies site assembly copies robots.txt and generates well-formed sitemap.xml", () => {
    if (!fs.existsSync(siteDistPath)) {
      // If dist/site has not been built yet in this session, skip dist check
      return;
    }

    expect(fs.existsSync(siteRobotsPath)).toBe(true);
    const robots = fs.readFileSync(siteRobotsPath, "utf-8");
    expect(robots).toContain("Sitemap: https://ohtaman.github.io/washi/sitemap.xml");

    expect(fs.existsSync(siteSitemapPath)).toBe(true);
    const sitemap = fs.readFileSync(siteSitemapPath, "utf-8");
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain("<urlset");

    const locMatches = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locMatches.length).toBeGreaterThan(30);

    // Ensure every single URL has the correct hostname and /washi/ base path
    for (const url of locMatches) {
      expect(url.startsWith("https://ohtaman.github.io/washi")).toBe(true);
    }

    // Verify key localized and canonical doc routes are present
    expect(locMatches).toContain("https://ohtaman.github.io/washi/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/ja/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/zh/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/getting-started/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/guide/variables");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/guide/decomposition");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/solvers/highs");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/examples/production");

    // Verify interactive Playground, Apps, and Games routes are included in sitemap.xml
    expect(locMatches).toContain("https://ohtaman.github.io/washi/demo/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/apps/ai-shift/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/apps/ai-timetable/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/apps/ai-timetable-theory/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/demon-castle-shift/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/demon-castle-shift-theory/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/mofumofu-sheep/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/mofumofu-sheep-theory/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/titan-pack/");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/games/titan-pack-theory/");
  });

  it("skips Service Worker registration and reload in coi-serviceworker.js for search engine crawlers while registering for standard browsers", () => {
    const coiScriptPath = path.resolve(rootDir, "public/coi-serviceworker.js");
    const coiCode = fs.readFileSync(coiScriptPath, "utf-8");

    const runCoiInWindowContext = (userAgent: string) => {
      let registered = false;
      let reloaded = false;
      const win: Record<string, unknown> = {
        crossOriginIsolated: false,
        isSecureContext: true,
        location: {
          hostname: "ohtaman.github.io",
          href: "https://ohtaman.github.io/washi/demo/",
          reload: () => {
            reloaded = true;
          },
        },
      };
      const sandbox = {
        window: win,
        document: {
          currentScript: { src: "https://ohtaman.github.io/washi/coi-serviceworker.js" },
        },
        navigator: {
          userAgent,
          serviceWorker: {
            controller: null,
            register: () => {
              registered = true;
              return Promise.resolve({ active: {} });
            },
            addEventListener: () => {},
          },
        },
        sessionStorage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        URL,
        console,
      };
      vm.runInNewContext(coiCode, sandbox);
      return { status: win.__washi_coi_status, registered, reloaded };
    };

    // Search engine crawlers must skip SW registration and never trigger reload
    for (const botUa of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    ]) {
      const res = runCoiInWindowContext(botUa);
      expect(res.status).toBe("crawler_skipped");
      expect(res.registered).toBe(false);
      expect(res.reloaded).toBe(false);
    }

    // Standard browser UA must proceed to Service Worker registration
    const browserRes = runCoiInWindowContext(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );
    expect(browserRes.status).toBeUndefined();
    expect(browserRes.registered).toBe(true);
  });
});

describe("Site SEO: Meta tags, Open Graph, Twitter Cards, and Positioning Taglines", () => {
  const rootDir = process.cwd();
  const vitepressConfigPath = path.resolve(rootDir, "docs/.vitepress/config.mts");
  const pkgPath = path.resolve(rootDir, "package.json");
  const webDemoHtmlPath = path.resolve(rootDir, "examples/web-demo/index.html");
  const docsEnIndexPath = path.resolve(rootDir, "docs/index.md");
  const docsJaIndexPath = path.resolve(rootDir, "docs/ja/index.md");
  const docsZhIndexPath = path.resolve(rootDir, "docs/zh/index.md");
  const readmeEnPath = path.resolve(rootDir, "README.md");
  const readmeJaPath = path.resolve(rootDir, "README.ja.md");
  const readmeZhPath = path.resolve(rootDir, "README.zh-CN.md");

  it("configures SEO titleTemplate, description, OGP, and Twitter card in docs/.vitepress/config.mts", () => {
    const content = fs.readFileSync(vitepressConfigPath, "utf-8");

    expect(content).toContain('titleTemplate: ":title | WaSHI — Mathematical Optimization Modeler in TypeScript"');
    expect(content).toContain('description: "WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, SMT)."');

    // Open Graph meta tags
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:type",\s*content:\s*"website"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:site_name",\s*content:\s*"WaSHI"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:image",\s*content:\s*"https:\/\/ohtaman\.github\.io\/washi\/washi-logo\.png"\s*\}\]/);

    // Twitter card meta tags
    expect(content).toMatch(/\["meta",\s*\{\s*name:\s*"twitter:card",\s*content:\s*"summary"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*name:\s*"twitter:image",\s*content:\s*"https:\/\/ohtaman\.github\.io\/washi\/washi-logo\.png"\s*\}\]/);

    // Meta keywords
    expect(content).toContain("typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, smt, highs, z3, pulp, jump, webassembly");
  });

  it("updates package.json description and target search keywords", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.description).toBe("WaSHI: WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming (LP, MIP, QP, SMT)");

    const expectedKeywords = [
      "optimization",
      "mathematical-programming",
      "constraint-programming",
      "linear-programming",
      "mixed-integer-programming",
      "quadratic-programming",
      "smt",
      "z3",
      "highs",
      "pulp",
      "jump",
      "operations-research",
      "wasm",
      "webassembly",
      "typescript",
    ];
    for (const kw of expectedKeywords) {
      expect(pkg.keywords).toContain(kw);
    }
  });

  it("configures user-facing title and description in examples/web-demo/index.html", () => {
    const content = fs.readFileSync(webDemoHtmlPath, "utf-8");
    expect(content).toContain("<title>WaSHI — Browser Optimization & Constraint Programming Demos</title>");
    expect(content).toContain('name="description"');
    expect(content).toContain("Interactive browser demos and playground for WaSHI: solve linear programming, nurse shift scheduling, and constraint games client-side with WebAssembly (HiGHS & Z3).");
  });

  it("updates docs homepages with PuLP framing and domain tagline", () => {
    const enContent = fs.readFileSync(docsEnIndexPath, "utf-8");
    expect(enContent).toContain('text: "Mathematical Optimization Modeler in TypeScript"');
    expect(enContent).toContain("A TypeScript alternative to Python's PuLP.");

    const jaContent = fs.readFileSync(docsJaIndexPath, "utf-8");
    expect(jaContent).toContain('text: "TypeScript 数理最適化モデラー"');
    expect(jaContent).toContain("PythonのPuLPのように直感的な数式で定式化できるTypeScript向け代数モデラー。");

    const zhContent = fs.readFileSync(docsZhIndexPath, "utf-8");
    expect(zhContent).toContain('text: "TypeScript 数理优化建模器"');
    expect(zhContent).toContain("Python PuLP 的 TypeScript 替代方案。");

    // Verify 1-hop crawlability links from EN/JA/ZH homepages to Playground, Apps, Games, and full doc suite
    for (const [mdContent, prefix] of [
      [enContent, ""],
      [jaContent, "/ja"],
      [zhContent, "/zh"],
    ] as const) {
      expect(mdContent).toContain(`(${prefix}/guide/decomposition)`);
      expect(mdContent).toContain(`(${prefix}/solvers/)`);
      expect(mdContent).toContain(`(${prefix}/examples/)`);
      expect(mdContent).toContain(`(${prefix}/examples/transportation)`);
      expect(mdContent).toContain(`(${prefix}/examples/ecommerce-coupons)`);
      expect(mdContent).toContain(`(${prefix}/examples/unsat-core)`);
      expect(mdContent).toContain(`(${prefix}/examples/vehicle-routing)`);
      expect(mdContent).toContain(`(${prefix}/examples/traveling-salesperson)`);
      expect(mdContent).toContain('href="/washi/demo/" target="_self"');
      expect(mdContent).toContain('href="/washi/apps/ai-shift/" target="_self"');
      expect(mdContent).toContain('href="/washi/apps/ai-timetable/" target="_self"');
      expect(mdContent).toContain('href="/washi/games/demon-castle-shift/" target="_self"');
      expect(mdContent).toContain('href="/washi/games/mofumofu-sheep/" target="_self"');
      expect(mdContent).toContain('href="/washi/games/titan-pack/" target="_self"');
    }

    // Verify canonical links in standalone interactive HTML entrypoints
    for (const subpath of [
      "demo",
      "apps/ai-shift",
      "apps/ai-timetable",
      "apps/ai-timetable-theory",
      "games/demon-castle-shift",
      "games/demon-castle-shift-theory",
      "games/mofumofu-sheep",
      "games/mofumofu-sheep-theory",
      "games/titan-pack",
      "games/titan-pack-theory",
    ]) {
      const html = fs.readFileSync(path.resolve(rootDir, "examples/web-demo", subpath, "index.html"), "utf-8");
      expect(html).toContain(`<link rel="canonical" href="https://ohtaman.github.io/washi/${subpath}/" />`);
    }
  });

  it("aligns README headers across English, Japanese, and Simplified Chinese", () => {
    const enReadme = fs.readFileSync(readmeEnPath, "utf-8");
    expect(enReadme).toContain("Mathematical Optimization Modeler in TypeScript");
    expect(enReadme).toContain("algebraic modeler for mathematical optimization and constraint programming");

    const jaReadme = fs.readFileSync(readmeJaPath, "utf-8");
    expect(jaReadme).toContain("TypeScript 数理最適化モデラー");
    expect(jaReadme).toContain("数理最適化と制約プログラミングのための TypeScript / JavaScript 向け代数モデラー");

    const zhReadme = fs.readFileSync(readmeZhPath, "utf-8");
    expect(zhReadme).toContain("TypeScript 数理优化建模器");
    expect(zhReadme).toContain("面向 TypeScript / JavaScript 的数理优化与约束编程代数建模器");
  });

  it("verifies emitted HTML in dist/site and dist/demo contains configured SEO tags and localized titles", () => {
    const siteDistPath = path.resolve(rootDir, "dist/site");
    if (!fs.existsSync(siteDistPath)) {
      return;
    }

    const enHtml = fs.readFileSync(path.resolve(siteDistPath, "index.html"), "utf-8");
    expect(enHtml).toContain("<title>WaSHI | WaSHI — Mathematical Optimization Modeler in TypeScript</title>");
    expect(enHtml).toContain('name="description" content="WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, SMT)."');
    expect(enHtml).toContain('link rel="canonical" href="https://ohtaman.github.io/washi/"');
    expect(enHtml).toContain('property="og:url" content="https://ohtaman.github.io/washi/"');
    expect(enHtml).toContain('property="og:type" content="website"');
    expect(enHtml).toContain('property="og:site_name" content="WaSHI"');
    expect(enHtml).toContain('property="og:image" content="https://ohtaman.github.io/washi/washi-logo.png"');
    expect(enHtml).toContain('name="twitter:card" content="summary"');
    expect(enHtml).toContain('name="twitter:image" content="https://ohtaman.github.io/washi/washi-logo.png"');
    expect(enHtml).toContain('name="keywords" content="typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, smt, highs, z3, pulp, jump, webassembly"');

    const jaHtml = fs.readFileSync(path.resolve(siteDistPath, "ja/index.html"), "utf-8");
    expect(jaHtml).toContain("<title>WaSHI | WaSHI — TypeScript 数理最適化モデラー</title>");
    expect(jaHtml).toContain('name="description" content="TypeScript & JavaScript 向け数理最適化と制約プログラミングのための代数モデラー（LP, MIP, 凸QP, SMT）"');
    expect(jaHtml).toContain('link rel="canonical" href="https://ohtaman.github.io/washi/ja/"');
    expect(jaHtml).toContain('property="og:url" content="https://ohtaman.github.io/washi/ja/"');

    const zhHtml = fs.readFileSync(path.resolve(siteDistPath, "zh/index.html"), "utf-8");
    expect(zhHtml).toContain("<title>WaSHI | WaSHI — TypeScript 数理优化建模器</title>");
    expect(zhHtml).toContain('name="description" content="适用于 TypeScript 与 JavaScript 的数理优化与约束编程代数建模器（LP, MIP, 凸QP, SMT）"');
    expect(zhHtml).toContain('link rel="canonical" href="https://ohtaman.github.io/washi/zh/"');
    expect(zhHtml).toContain('property="og:url" content="https://ohtaman.github.io/washi/zh/"');

    // Verify subpage canonical URLs
    const subpageHtml = fs.readFileSync(path.resolve(siteDistPath, "getting-started/ai-agents.html"), "utf-8");
    expect(subpageHtml).toContain('link rel="canonical" href="https://ohtaman.github.io/washi/getting-started/ai-agents"');
    expect(subpageHtml).toContain('property="og:url" content="https://ohtaman.github.io/washi/getting-started/ai-agents"');
    expect(subpageHtml).toContain('property="og:type" content="article"');

    // Verify homepages link directly (1 hop) to Playground, Apps, Games, and newly added doc pages
    for (const html of [enHtml, jaHtml, zhHtml]) {
      expect(html).toContain('href="/washi/demo/" target="_self"');
      expect(html).toContain('href="/washi/apps/ai-shift/" target="_self"');
      expect(html).toContain('href="/washi/apps/ai-timetable/" target="_self"');
      expect(html).toContain('href="/washi/games/demon-castle-shift/" target="_self"');
      expect(html).toContain('href="/washi/games/mofumofu-sheep/" target="_self"');
      expect(html).toContain('href="/washi/games/titan-pack/" target="_self"');
    }

    // Verify standalone interactive HTML entrypoints contain canonical links
    for (const subpath of [
      "demo",
      "apps/ai-shift",
      "apps/ai-timetable",
      "apps/ai-timetable-theory",
      "games/demon-castle-shift",
      "games/demon-castle-shift-theory",
      "games/mofumofu-sheep",
      "games/mofumofu-sheep-theory",
      "games/titan-pack",
      "games/titan-pack-theory",
    ]) {
      const entryHtml = fs.readFileSync(path.resolve(siteDistPath, subpath, "index.html"), "utf-8");
      expect(entryHtml).toContain(`link rel="canonical" href="https://ohtaman.github.io/washi/${subpath}/"`);
    }

    const demoDistPath = path.resolve(rootDir, "dist/demo/index.html");
    if (fs.existsSync(demoDistPath)) {
      const demoHtml = fs.readFileSync(demoDistPath, "utf-8");
      expect(demoHtml).toContain("<title>WaSHI — Browser Optimization & Constraint Programming Demos</title>");
      expect(demoHtml).toContain("Interactive browser demos and playground for WaSHI: solve linear programming, nurse shift scheduling, and constraint games client-side with WebAssembly (HiGHS & Z3).");
    }
  });
});
