import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { Plugin } from "vite";
import type { HeadConfig, PageData, SiteData } from "vitepress";
import vitepressConfig, { buildGoogleTagHead } from "../docs/.vitepress/config.mts";
import viteDemoConfig from "../vite.config.ts";
// @ts-expect-error .mjs script module
import { appendInteractiveRoutesToSitemap } from "../scripts/build-site.mjs";
// @ts-expect-error .mjs script module
import { buildLlmsArtifacts } from "../scripts/generate-llms.mjs";

const rootDir = process.cwd();
const siteDistPath = path.resolve(rootDir, "dist/site");
const demoDistIndexPath = path.resolve(rootDir, "dist/demo/index.html");
const requireSiteDist = process.env.REQUIRE_SITE_DIST === "1";
const itSiteDist = requireSiteDist || fs.existsSync(siteDistPath) ? it : it.skip;
const itSiteAndDemoDist =
  requireSiteDist || (fs.existsSync(siteDistPath) && fs.existsSync(demoDistIndexPath))
    ? it
    : it.skip;

describe("Site SEO: Sitemap and robots.txt configuration", () => {
  const vitepressConfigPath = path.resolve(rootDir, "docs/.vitepress/config.mts");
  const publicRobotsPath = path.resolve(rootDir, "docs/public/robots.txt");
  const siteRobotsPath = path.resolve(siteDistPath, "robots.txt");
  const siteSitemapPath = path.resolve(siteDistPath, "sitemap.xml");

  it("configures root base and custom domain sitemap hostname in docs/.vitepress/config.mts", () => {
    expect(fs.existsSync(vitepressConfigPath)).toBe(true);
    const content = fs.readFileSync(vitepressConfigPath, "utf-8");

    expect(content).toMatch(/base:\s*["']\/["']/);
    // Must configure sitemap with trailing-slash custom domain hostname
    expect(content).toMatch(/sitemap:\s*\{\s*hostname:\s*["']https:\/\/washi\.ohtaman\.dev\/["']/);
  });

  it("provides docs/public/CNAME and docs/public/robots.txt pointing to the canonical sitemap.xml", () => {
    const cnamePath = path.resolve(rootDir, "docs/public/CNAME");
    expect(fs.existsSync(cnamePath)).toBe(true);
    expect(fs.readFileSync(cnamePath, "utf-8").trim()).toBe("washi.ohtaman.dev");

    expect(fs.existsSync(publicRobotsPath)).toBe(true);
    const content = fs.readFileSync(publicRobotsPath, "utf-8");

    expect(content).toMatch(/User-agent:\s*\*/i);
    expect(content).toMatch(/Allow:\s*\//i);
    expect(content).toMatch(/Sitemap:\s*https:\/\/washi\.ohtaman\.dev\/sitemap\.xml/i);
  });

  it("appends interactive demo, apps, and games routes to sitemap XML via appendInteractiveRoutesToSitemap", () => {
    const webDemoRoot = path.resolve(rootDir, "examples/web-demo");
    const baseXml =
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://washi.ohtaman.dev/</loc></url></urlset>';
    const augmented = appendInteractiveRoutesToSitemap(baseXml, webDemoRoot);
    const locs = [...augmented.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toEqual([
      "https://washi.ohtaman.dev/",
      "https://washi.ohtaman.dev/demo/",
      "https://washi.ohtaman.dev/exercises/",
      "https://washi.ohtaman.dev/apps/ai-shift/",
      "https://washi.ohtaman.dev/apps/ai-timetable-theory/",
      "https://washi.ohtaman.dev/apps/ai-timetable/",
      "https://washi.ohtaman.dev/games/demon-castle-shift-theory/",
      "https://washi.ohtaman.dev/games/demon-castle-shift/",
      "https://washi.ohtaman.dev/games/mofumofu-sheep-theory/",
      "https://washi.ohtaman.dev/games/mofumofu-sheep/",
      "https://washi.ohtaman.dev/games/titan-pack-theory/",
      "https://washi.ohtaman.dev/games/titan-pack/",
    ]);

    // Idempotent when called a second time
    expect(appendInteractiveRoutesToSitemap(augmented, webDemoRoot)).toBe(augmented);
  });

  itSiteDist("verifies site assembly copies CNAME and robots.txt and generates well-formed sitemap.xml", () => {
    expect(fs.existsSync(siteDistPath)).toBe(true);

    const siteCnamePath = path.resolve(siteDistPath, "CNAME");
    expect(fs.existsSync(siteCnamePath)).toBe(true);
    expect(fs.readFileSync(siteCnamePath, "utf-8").trim()).toBe("washi.ohtaman.dev");

    expect(fs.existsSync(siteRobotsPath)).toBe(true);
    const robots = fs.readFileSync(siteRobotsPath, "utf-8");
    expect(robots).toContain("Sitemap: https://washi.ohtaman.dev/sitemap.xml");

    expect(fs.existsSync(siteSitemapPath)).toBe(true);
    const sitemap = fs.readFileSync(siteSitemapPath, "utf-8");
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain("<urlset");

    const locMatches = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locMatches.length).toBeGreaterThan(30);

    // Ensure every single URL uses the custom domain and does not retain legacy /washi/ prefix
    for (const url of locMatches) {
      expect(url.startsWith("https://washi.ohtaman.dev/")).toBe(true);
      expect(url.startsWith("https://washi.ohtaman.dev/washi/")).toBe(false);
    }

    // Verify key localized and canonical doc routes are present
    expect(locMatches).toContain("https://washi.ohtaman.dev/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/ja/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/zh/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/getting-started/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/getting-started/coding-agents");
    expect(locMatches).toContain("https://washi.ohtaman.dev/ja/getting-started/coding-agents");
    expect(locMatches).toContain("https://washi.ohtaman.dev/zh/getting-started/coding-agents");
    expect(locMatches).toContain("https://washi.ohtaman.dev/guide/variables");
    expect(locMatches).toContain("https://washi.ohtaman.dev/guide/constraint-programming");
    expect(locMatches).toContain("https://washi.ohtaman.dev/guide/decomposition");
    expect(locMatches).toContain("https://washi.ohtaman.dev/solvers/highs");
    expect(locMatches).toContain("https://washi.ohtaman.dev/solvers/pumpkin");
    expect(locMatches).toContain("https://washi.ohtaman.dev/examples/production");
    expect(locMatches).toContain("https://washi.ohtaman.dev/examples/project-scheduling");

    // Verify interactive Playground, Exercises, Apps, and Games routes are included in sitemap.xml
    expect(locMatches).toContain("https://washi.ohtaman.dev/demo/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/exercises/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/apps/ai-shift/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/apps/ai-timetable/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/apps/ai-timetable-theory/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/demon-castle-shift/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/demon-castle-shift-theory/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/mofumofu-sheep/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/mofumofu-sheep-theory/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/titan-pack/");
    expect(locMatches).toContain("https://washi.ohtaman.dev/games/titan-pack-theory/");
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
          hostname: "washi.ohtaman.dev",
          href: "https://washi.ohtaman.dev/demo/",
          reload: () => {
            reloaded = true;
          },
        },
      };
      const sandbox = {
        window: win,
        document: {
          currentScript: { src: "https://washi.ohtaman.dev/coi-serviceworker.js" },
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

  it("keeps public/coi-serviceworker.js and docs/public/coi-serviceworker.js synchronized and safely handles non-GET beacons and 204 responses", async () => {
    const rootCoi = fs.readFileSync(path.resolve(rootDir, "public/coi-serviceworker.js"), "utf-8");
    const docsCoi = fs.readFileSync(path.resolve(rootDir, "docs/public/coi-serviceworker.js"), "utf-8");
    expect(docsCoi).toBe(rootCoi);

    type FetchEventStub = {
      request: { method: string; cache?: string; mode?: string };
      respondWith: (p: Promise<Response>) => void;
    };
    let fetchHandler: ((event: FetchEventStub) => void) | undefined;
    let mockFetchResponse: {
      status: number;
      statusText: string;
      type: string;
      headers: Headers;
      body: ReadableStream<Uint8Array> | string | null;
    } = {
      status: 200,
      statusText: "OK",
      type: "basic",
      headers: new Headers({ "content-type": "text/html" }),
      body: "hello",
    };

    const swSelf = {
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
      addEventListener: (type: string, listener: (event: FetchEventStub) => void) => {
        if (type === "fetch") {
          fetchHandler = listener;
        }
      },
    };

    vm.runInNewContext(rootCoi, {
      self: swSelf,
      Headers,
      Response,
      fetch: () => Promise.resolve(mockFetchResponse),
    });

    expect(typeof fetchHandler).toBe("function");

    // 1. POST analytics beacons (e.g. GA4 /g/collect) must bypass SW interception completely
    let postIntercepted = false;
    fetchHandler!({
      request: { method: "POST", mode: "no-cors" },
      respondWith: () => {
        postIntercepted = true;
      },
    });
    expect(postIntercepted).toBe(false);

    // 2. GET 200 responses must receive COOP/COEP/CORP headers
    let capturedPromise: Promise<Response> | undefined;
    fetchHandler!({
      request: { method: "GET", mode: "same-origin" },
      respondWith: (p) => {
        capturedPromise = p;
      },
    });
    expect(capturedPromise).toBeDefined();
    const okRes = await capturedPromise!;
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
    expect(okRes.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(okRes.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");

    // 3. GET 204 No Content responses (even when upstream exposes a non-null stream object) must pass null body without throwing
    mockFetchResponse = {
      status: 204,
      statusText: "No Content",
      type: "cors",
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    };
    let captured204: Promise<Response> | undefined;
    fetchHandler!({
      request: { method: "GET", mode: "cors" },
      respondWith: (p) => {
        captured204 = p;
      },
    });
    expect(captured204).toBeDefined();
    const res204 = await captured204!;
    expect(res204.status).toBe(204);
    expect(res204.body).toBeNull();
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
    expect(content).toContain('description: "WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, CP, SMT)."');

    // Open Graph meta tags
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:type",\s*content:\s*"website"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:site_name",\s*content:\s*"WaSHI"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*property:\s*"og:image",\s*content:\s*"https:\/\/washi\.ohtaman\.dev\/washi-logo\.png"\s*\}\]/);

    // Twitter card meta tags
    expect(content).toMatch(/\["meta",\s*\{\s*name:\s*"twitter:card",\s*content:\s*"summary"\s*\}\]/);
    expect(content).toMatch(/\["meta",\s*\{\s*name:\s*"twitter:image",\s*content:\s*"https:\/\/washi\.ohtaman\.dev\/washi-logo\.png"\s*\}\]/);

    // Meta keywords
    expect(content).toContain("typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, cp, lcg, smt, highs, pumpkin, z3, pulp, jump, webassembly");
  });

  it("emits spec-compliant llms.txt describedby and raw Markdown alternate links via transformHead and keeps Getting Started sidebars focused on human setup guides", async () => {
    expect(typeof vitepressConfig.transformHead).toBe("function");
    type TransformCtx = Parameters<NonNullable<typeof vitepressConfig.transformHead>>[0];

    const runTransformHead = async (relativePath: string): Promise<HeadConfig[]> => {
      const pageData: PageData = {
        relativePath,
        filePath: relativePath,
        title: "Test Title",
        titleTemplate: ":title | WaSHI",
        description: "Test Description",
        headers: [],
        frontmatter: {},
        params: {},
        isNotFound: false,
      };
      const siteData = {
        title: "WaSHI",
        description: "Site Description",
      } as SiteData;
      const res = await vitepressConfig.transformHead!({
        pageData,
        siteData,
      } as TransformCtx);
      return res ?? [];
    };

    const { allDocFiles } = buildLlmsArtifacts(rootDir) as { allDocFiles: string[] };
    for (const publishedRelPath of ["index.md", "getting-started/coding-agents.md", ...allDocFiles]) {
      const head = await runTransformHead(publishedRelPath);
      expect(head).toContainEqual(["link", { rel: "describedby", href: "/llms.txt" }]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", type: "text/markdown", href: `/${publishedRelPath}` },
      ]);
    }

    for (const nonRawMdRelPath of [
      "showcase/index.md",
      "ja/index.md",
      "ja/getting-started/index.md",
      "ja/getting-started/coding-agents.md",
      "ja/showcase/index.md",
      "zh/index.md",
      "zh/getting-started/index.md",
      "zh/getting-started/coding-agents.md",
    ]) {
      const head = await runTransformHead(nonRawMdRelPath);
      expect(head).toContainEqual(["link", { rel: "describedby", href: "/llms.txt" }]);
      expect(
        head.some(
          (entry) =>
            entry[0] === "link" &&
            typeof entry[1] === "object" &&
            entry[1].type === "text/markdown"
        )
      ).toBe(false);
    }

    // Verify Getting Started sidebars contain only human setup guides across EN, JA, and ZH
    type SidebarGroup = { items?: Array<{ link?: string }> };
    const enSidebar = vitepressConfig.locales?.root?.themeConfig?.sidebar as
      | SidebarGroup[]
      | undefined;
    const jaSidebar = vitepressConfig.locales?.ja?.themeConfig?.sidebar as
      | SidebarGroup[]
      | undefined;
    const zhSidebar = vitepressConfig.locales?.zh?.themeConfig?.sidebar as
      | SidebarGroup[]
      | undefined;

    expect(enSidebar?.[0]?.items?.map((item) => item.link)).toEqual([
      "/getting-started/",
      "/getting-started/coding-agents",
      "/getting-started/runtimes",
      "/getting-started/cross-origin",
    ]);
    expect(jaSidebar?.[0]?.items?.map((item) => item.link)).toEqual([
      "/ja/getting-started/",
      "/ja/getting-started/coding-agents",
      "/ja/getting-started/runtimes",
      "/ja/getting-started/cross-origin",
    ]);
    expect(zhSidebar?.[0]?.items?.map((item) => item.link)).toEqual([
      "/zh/getting-started/",
      "/zh/getting-started/coding-agents",
      "/zh/getting-started/runtimes",
      "/zh/getting-started/cross-origin",
    ]);

    expect(enSidebar?.[2]?.items?.map((item) => item.link)).toEqual([
      "/solvers/",
      "/solvers/highs",
      "/solvers/pumpkin",
      "/solvers/z3",
      "/solvers/glpk",
      "/solvers/custom-solver",
    ]);
    expect(jaSidebar?.[2]?.items?.map((item) => item.link)).toEqual([
      "/ja/solvers/",
      "/ja/solvers/highs",
      "/ja/solvers/pumpkin",
      "/ja/solvers/z3",
      "/ja/solvers/glpk",
      "/ja/solvers/custom-solver",
    ]);
    expect(zhSidebar?.[2]?.items?.map((item) => item.link)).toEqual([
      "/zh/solvers/",
      "/zh/solvers/highs",
      "/zh/solvers/pumpkin",
      "/zh/solvers/z3",
      "/zh/solvers/glpk",
      "/zh/solvers/custom-solver",
    ]);
  });

  it("emits localized hreflang alternates (en, ja, zh-CN, x-default) via transformHead", async () => {
    type TransformCtx = Parameters<NonNullable<typeof vitepressConfig.transformHead>>[0];
    const runTransformHead = async (relativePath: string, isNotFound = false): Promise<HeadConfig[]> => {
      const pageData: PageData = {
        relativePath,
        filePath: relativePath,
        title: "Test Title",
        titleTemplate: ":title | WaSHI",
        description: "Test Description",
        headers: [],
        frontmatter: {},
        params: {},
        isNotFound,
      };
      const siteData = { title: "WaSHI", description: "Site Description" } as SiteData;
      return (await vitepressConfig.transformHead!({ pageData, siteData } as TransformCtx)) ?? [];
    };

    // Root index across EN, JA, ZH must emit identical hreflang cluster
    for (const indexRel of ["index.md", "ja/index.md", "zh/index.md"]) {
      const head = await runTransformHead(indexRel);
      expect(head).toContainEqual(["link", { rel: "alternate", hreflang: "en", href: "https://washi.ohtaman.dev/" }]);
      expect(head).toContainEqual(["link", { rel: "alternate", hreflang: "ja", href: "https://washi.ohtaman.dev/ja/" }]);
      expect(head).toContainEqual(["link", { rel: "alternate", hreflang: "zh-CN", href: "https://washi.ohtaman.dev/zh/" }]);
      expect(head).toContainEqual(["link", { rel: "alternate", hreflang: "x-default", href: "https://washi.ohtaman.dev/" }]);
    }

    // Nested guide route across EN, JA, ZH
    for (const guideRel of ["guide/variables.md", "ja/guide/variables.md", "zh/guide/variables.md"]) {
      const head = await runTransformHead(guideRel);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "en", href: "https://washi.ohtaman.dev/guide/variables" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "ja", href: "https://washi.ohtaman.dev/ja/guide/variables" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "zh-CN", href: "https://washi.ohtaman.dev/zh/guide/variables" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "x-default", href: "https://washi.ohtaman.dev/guide/variables" },
      ]);
    }

    // Human coding-agents guide across EN, JA, ZH
    for (const codingRel of [
      "getting-started/coding-agents.md",
      "ja/getting-started/coding-agents.md",
      "zh/getting-started/coding-agents.md",
    ]) {
      const head = await runTransformHead(codingRel);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "en", href: "https://washi.ohtaman.dev/getting-started/coding-agents" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "ja", href: "https://washi.ohtaman.dev/ja/getting-started/coding-agents" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "zh-CN", href: "https://washi.ohtaman.dev/zh/getting-started/coding-agents" },
      ]);
      expect(head).toContainEqual([
        "link",
        { rel: "alternate", hreflang: "x-default", href: "https://washi.ohtaman.dev/getting-started/coding-agents" },
      ]);
    }

    // Canonical-only EN ai-agents guide emits en and x-default without removed ja/zh-CN alternates
    const aiAgentsHead = await runTransformHead("getting-started/ai-agents.md");
    expect(aiAgentsHead).toContainEqual([
      "link",
      { rel: "alternate", hreflang: "en", href: "https://washi.ohtaman.dev/getting-started/ai-agents" },
    ]);
    expect(aiAgentsHead).toContainEqual([
      "link",
      { rel: "alternate", hreflang: "x-default", href: "https://washi.ohtaman.dev/getting-started/ai-agents" },
    ]);
    expect(
      aiAgentsHead.some(
        (entry) =>
          entry[0] === "link" &&
          typeof entry[1] === "object" &&
          (entry[1].hreflang === "ja" || entry[1].hreflang === "zh-CN")
      )
    ).toBe(false);

    // 404 / non-existent route must not emit hreflang tags
    const notFoundHead = await runTransformHead("404.md", true);
    expect(
      notFoundHead.some(
        (entry) =>
          entry[0] === "link" &&
          typeof entry[1] === "object" &&
          "hreflang" in entry[1]
      )
    ).toBe(false);
  });

  it("injects Google Tag scripts only when GOOGLE_TAG_ID is configured and wires deploy-demo.yml via vars.GOOGLE_TAG_ID", async () => {
    const inlineInit =
      "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());";

    const withEnvGoogleTagId = async (
      value: string | undefined,
      fn: () => Promise<void>
    ): Promise<void> => {
      const hadPrev = Object.prototype.hasOwnProperty.call(process.env, "GOOGLE_TAG_ID");
      const prevValue = process.env.GOOGLE_TAG_ID;
      if (value === undefined) {
        delete process.env.GOOGLE_TAG_ID;
      } else {
        process.env.GOOGLE_TAG_ID = value;
      }
      try {
        await fn();
      } finally {
        if (hadPrev) {
          process.env.GOOGLE_TAG_ID = prevValue;
        } else {
          delete process.env.GOOGLE_TAG_ID;
        }
      }
    };

    const plugins = (viteDemoConfig.plugins ?? []).flat() as Plugin[];
    const gtagPlugin = plugins.find((p) => p && p.name === "washi-google-tag");
    expect(gtagPlugin).toBeDefined();
    const hook = gtagPlugin?.transformIndexHtml;
    const transformFn =
      typeof hook === "function" ? hook : hook && "handler" in hook ? hook.handler : undefined;
    expect(typeof transformFn).toBe("function");

    const invokeViteGoogleTagTransform = () =>
      (transformFn as (html: string, ctx: { path: string; filename: string }) => unknown)(
        "<html><head></head><body></body></html>",
        { path: "/demo/index.html", filename: "demo/index.html" }
      );

    const hasAnalyticsEntry = (head: HeadConfig[] | undefined): boolean =>
      (head ?? []).some((entry) => {
        const serialized = JSON.stringify(entry);
        return (
          serialized.includes("googletagmanager.com") ||
          serialized.includes("gtm.js") ||
          serialized.includes("dataLayer") ||
          serialized.includes("gtag(")
        );
      });

    // 1. Unset, empty, or whitespace-only GOOGLE_TAG_ID must emit zero analytics scripts
    for (const emptyVal of [undefined, "", "   \t\n  "]) {
      await withEnvGoogleTagId(emptyVal, async () => {
        expect(buildGoogleTagHead()).toEqual([]);
        expect(buildGoogleTagHead(emptyVal)).toEqual([]);

        vi.resetModules();
        const reloadedVitepress = await import("../docs/.vitepress/config.mts");
        expect(reloadedVitepress.default.head).toContainEqual([
          "script",
          { src: "/coi-serviceworker.js" },
        ]);
        expect(hasAnalyticsEntry(reloadedVitepress.default.head)).toBe(false);

        const injectedTags = await invokeViteGoogleTagTransform();
        expect(injectedTags).toEqual([]);
      });
    }

    // 2. Non-empty GOOGLE_TAG_ID (including surrounding whitespace) must inject expected scripts in both VitePress and Vite demo
    for (const configuredVal of ["GTM-TEST1234", "  GTM-TEST1234  "]) {
      const expectedVitepressHead: HeadConfig[] = [
        ["script", { async: "", src: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234" }],
        ["script", {}, inlineInit],
      ];
      await withEnvGoogleTagId(configuredVal, async () => {
        expect(buildGoogleTagHead()).toEqual(expectedVitepressHead);
        expect(buildGoogleTagHead(configuredVal)).toEqual(expectedVitepressHead);
        // Explicit undefined overrides a set process.env.GOOGLE_TAG_ID cleanly
        expect(buildGoogleTagHead(undefined)).toEqual([]);

        vi.resetModules();
        const reloadedVitepress = await import("../docs/.vitepress/config.mts");
        expect(reloadedVitepress.default.head).toContainEqual([
          "script",
          { async: "", src: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234" },
        ]);
        expect(reloadedVitepress.default.head).toContainEqual(["script", {}, inlineInit]);

        const injectedTags = await invokeViteGoogleTagTransform();
        expect(injectedTags).toEqual([
          {
            tag: "script",
            attrs: { async: true, src: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234" },
            injectTo: "head",
          },
          {
            tag: "script",
            children: inlineInit,
            injectTo: "head",
          },
        ]);
      });
    }

    // 3. CI workflow passes vars.GOOGLE_TAG_ID on Unified Site build, and source/workflow files contain no hardcoded container IDs
    const deployWorkflowPath = path.resolve(rootDir, ".github/workflows/deploy-demo.yml");
    const deployWorkflow = fs.readFileSync(deployWorkflowPath, "utf-8");
    expect(deployWorkflow).toMatch(
      /run:\s*npm run build:site[\s\S]*?env:[\s\S]*?GOOGLE_TAG_ID:\s*\$\{\{\s*vars\.GOOGLE_TAG_ID\s*\}\}/
    );

    const viteConfigPath = path.resolve(rootDir, "vite.config.ts");
    for (const configFile of [vitepressConfigPath, viteConfigPath, deployWorkflowPath]) {
      const src = fs.readFileSync(configFile, "utf-8");
      const rel = path.relative(rootDir, configFile);
      expect(src, `Hardcoded GTM/GA tag ID in ${rel}`).not.toMatch(/\b(?:GTM|GT|G)-[A-Z0-9]{4,}\b/);
    }
  });

  it("updates package.json description and target search keywords", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.description).toBe(
      "WaSHI: TypeScript & JavaScript algebraic modeler for Mathematical Optimization & Constraint Programming (LP, MILP, QP, CP, SMT) powered by WebAssembly (HiGHS, Pumpkin, Z3, GLPK)"
    );

    const expectedKeywords = [
      "optimization",
      "mathematical-programming",
      "constraint-programming",
      "linear-programming",
      "mixed-integer-programming",
      "quadratic-programming",
      "milp",
      "lp",
      "mip",
      "qp",
      "cp",
      "solver",
      "modeler",
      "scheduling",
      "timetabling",
      "smt",
      "z3",
      "highs",
      "glpk",
      "pumpkin",
      "lcg",
      "pulp",
      "jump",
      "operations-research",
      "wasm",
      "webassembly",
      "typescript",
      "javascript",
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
    expect(jaContent).toContain('text: "TypeScript 数理最適化\u30e2\u30c7\u30e9\u30fc"');
    expect(jaContent).toContain("Python\u306ePuLP\u306e\u3088\u3046\u306b直感的\u306a数式\u3067定式化\u3067\u304d\u308bTypeScript向\u3051代数\u30e2\u30c7\u30e9\u30fc。");

    const zhContent = fs.readFileSync(docsZhIndexPath, "utf-8");
    expect(zhContent).toContain('text: "TypeScript 数理优化建模器"');
    expect(zhContent).toContain("Python PuLP 的 TypeScript 替代方案。");

    // Verify 1-hop crawlability links from EN/JA/ZH homepages to Playground, Apps, Games, and full doc suite
    for (const [mdContent, prefix] of [
      [enContent, ""],
      [jaContent, "/ja"],
      [zhContent, "/zh"],
    ] as const) {
      expect(mdContent).toContain(`(${prefix}/getting-started/coding-agents)`);
      expect(mdContent).toContain(`(${prefix}/getting-started/runtimes)`);
      expect(mdContent).not.toContain("getting-started/ecosystem");
      expect(mdContent).not.toContain("getting-started/ai-agents");
      expect(mdContent).toContain(`(${prefix}/guide/constraint-programming)`);
      expect(mdContent).toContain(`(${prefix}/guide/decomposition)`);
      expect(mdContent).toContain(`(${prefix}/solvers/)`);
      expect(mdContent).toContain(`(${prefix}/solvers/highs)`);
      expect(mdContent).toContain(`(${prefix}/solvers/pumpkin)`);
      expect(mdContent).toContain(`(${prefix}/examples/)`);
      expect(mdContent).toContain(`(${prefix}/examples/transportation)`);
      expect(mdContent).toContain(`(${prefix}/examples/ecommerce-coupons)`);
      expect(mdContent).toContain(`(${prefix}/examples/project-scheduling)`);
      expect(mdContent).toContain(`(${prefix}/examples/unsat-core)`);
      expect(mdContent).toContain(`(${prefix}/examples/vehicle-routing)`);
      expect(mdContent).toContain(`(${prefix}/examples/traveling-salesperson)`);
      expect(mdContent).toContain('href="/demo/" target="_self"');
      expect(mdContent).toContain('href="/exercises/" target="_self"');
      expect(mdContent).toContain('href="/apps/ai-shift/" target="_self"');
      expect(mdContent).toContain('href="/apps/ai-timetable/" target="_self"');
      expect(mdContent).toContain('href="/games/demon-castle-shift/" target="_self"');
      expect(mdContent).toContain('href="/games/mofumofu-sheep/" target="_self"');
      expect(mdContent).toContain('href="/games/titan-pack/" target="_self"');
    }

    // Verify canonical links in standalone interactive HTML entrypoints
    for (const subpath of [
      "demo",
      "exercises",
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
      expect(html).toContain(`<link rel="canonical" href="https://washi.ohtaman.dev/${subpath}/" />`);
    }
  });

  it("ensures zero stale ohtaman.github.io or /washi/ base links remain across docs, READMEs, and web-demo entrypoints", () => {
    const collectFiles = (dir: string, exts: string[]): string[] => {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "dist" || entry.name === "cache" || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectFiles(fullPath, exts));
        } else if (exts.some((ext) => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const filesToScan = [
      readmeEnPath,
      readmeJaPath,
      readmeZhPath,
      path.resolve(rootDir, "examples/README.md"),
      ...collectFiles(path.resolve(rootDir, "docs"), [".md", ".vue", ".ts", ".mts"]),
      ...collectFiles(path.resolve(rootDir, "examples/web-demo"), [".html"]),
    ];

    for (const file of filesToScan) {
      const content = fs.readFileSync(file, "utf-8");
      const rel = path.relative(rootDir, file);
      expect(content, `Stale ohtaman.github.io reference in ${rel}`).not.toContain("ohtaman.github.io");
      expect(content, `Stale /washi/ root-relative attribute in ${rel}`).not.toMatch(/(?:href|src)=["']\/washi\//);
      if (rel.startsWith(`docs${path.sep}`)) {
        expect(content, `Stale raw HTML internal .md href in ${rel}`).not.toMatch(
          /<a\s+[^>]*href=["'](?!https?:\/\/)[^"']*\.md["']/
        );
      }
    }
  });

  it("aligns README headers across English, Japanese, and Simplified Chinese", () => {
    const enReadme = fs.readFileSync(readmeEnPath, "utf-8");
    expect(enReadme).toContain("Mathematical Optimization Modeler in TypeScript");
    expect(enReadme).toContain("algebraic modeler for mathematical optimization and constraint programming");

    const jaReadme = fs.readFileSync(readmeJaPath, "utf-8");
    expect(jaReadme).toContain("TypeScript 数理最適化\u30e2\u30c7\u30e9\u30fc");
    expect(jaReadme).toContain("数理最適化\u3068制約\u30d7\u30ed\u30b0\u30e9\u30df\u30f3\u30b0\u306e\u305f\u3081\u306e TypeScript / JavaScript 向\u3051代数\u30e2\u30c7\u30e9\u30fc");

    const zhReadme = fs.readFileSync(readmeZhPath, "utf-8");
    expect(zhReadme).toContain("TypeScript 数理优化建模器");
    expect(zhReadme).toContain("面向 TypeScript / JavaScript 的数理优化与约束编程代数建模器");

    for (const readme of [enReadme, jaReadme, zhReadme]) {
      expect(readme).toContain("https://washi.ohtaman.dev/llms.txt");
      expect(readme).toContain("https://washi.ohtaman.dev/llms-full.txt");
    }
  });

  itSiteAndDemoDist("verifies emitted HTML in dist/site and dist/demo contains configured SEO tags and localized titles", () => {
    expect(fs.existsSync(siteDistPath)).toBe(true);

    const enHtml = fs.readFileSync(path.resolve(siteDistPath, "index.html"), "utf-8");
    expect(enHtml).toContain("<title>WaSHI | WaSHI — Mathematical Optimization Modeler in TypeScript</title>");
    expect(enHtml).toContain('name="description" content="WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, CP, SMT)."');
    expect(enHtml).toContain('link rel="canonical" href="https://washi.ohtaman.dev/"');
    expect(enHtml).toContain('property="og:url" content="https://washi.ohtaman.dev/"');
    expect(enHtml).toContain('property="og:type" content="website"');
    expect(enHtml).toContain('property="og:site_name" content="WaSHI"');
    expect(enHtml).toContain('property="og:image" content="https://washi.ohtaman.dev/washi-logo.png"');
    expect(enHtml).toContain('name="twitter:card" content="summary"');
    expect(enHtml).toContain('name="twitter:image" content="https://washi.ohtaman.dev/washi-logo.png"');
    expect(enHtml).toContain('name="keywords" content="typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, cp, lcg, smt, highs, pumpkin, z3, pulp, jump, webassembly"');
    expect(enHtml).not.toContain('"/washi/');

    const jaHtml = fs.readFileSync(path.resolve(siteDistPath, "ja/index.html"), "utf-8");
    expect(jaHtml).toContain("<title>WaSHI | WaSHI — TypeScript 数理最適化\u30e2\u30c7\u30e9\u30fc</title>");
    expect(jaHtml).toContain('name="description" content="TypeScript & JavaScript 向\u3051数理最適化\u3068制約\u30d7\u30ed\u30b0\u30e9\u30df\u30f3\u30b0\u306e\u305f\u3081\u306e代数\u30e2\u30c7\u30e9\u30fc（LP, MIP, 凸QP, CP, SMT）"');
    expect(jaHtml).toContain('link rel="canonical" href="https://washi.ohtaman.dev/ja/"');
    expect(jaHtml).toContain('property="og:url" content="https://washi.ohtaman.dev/ja/"');

    const zhHtml = fs.readFileSync(path.resolve(siteDistPath, "zh/index.html"), "utf-8");
    expect(zhHtml).toContain("<title>WaSHI | WaSHI — TypeScript 数理优化建模器</title>");
    expect(zhHtml).toContain('name="description" content="适用于 TypeScript 与 JavaScript 的数理优化与约束编程代数建模器（LP, MIP, 凸QP, CP, SMT）"');
    expect(zhHtml).toContain('link rel="canonical" href="https://washi.ohtaman.dev/zh/"');
    expect(zhHtml).toContain('property="og:url" content="https://washi.ohtaman.dev/zh/"');

    // Verify subpage canonical URLs and llms.txt / Markdown discovery links
    const subpageHtml = fs.readFileSync(path.resolve(siteDistPath, "getting-started/ai-agents.html"), "utf-8");
    expect(subpageHtml).toContain('link rel="canonical" href="https://washi.ohtaman.dev/getting-started/ai-agents"');
    expect(subpageHtml).toContain('property="og:url" content="https://washi.ohtaman.dev/getting-started/ai-agents"');
    expect(subpageHtml).toContain('property="og:type" content="article"');
    expect(subpageHtml).toContain('link rel="describedby" href="/llms.txt"');
    expect(subpageHtml).toContain('link rel="alternate" type="text/markdown" href="/getting-started/ai-agents.md"');

    const codingAgentsHtml = fs.readFileSync(path.resolve(siteDistPath, "getting-started/coding-agents.html"), "utf-8");
    expect(codingAgentsHtml).toContain('link rel="canonical" href="https://washi.ohtaman.dev/getting-started/coding-agents"');
    expect(codingAgentsHtml).toContain('link rel="alternate" type="text/markdown" href="/getting-started/coding-agents.md"');
    expect(fs.existsSync(path.resolve(siteDistPath, "getting-started/coding-agents.md"))).toBe(true);
    expect(fs.existsSync(path.resolve(siteDistPath, "ja/getting-started/coding-agents.html"))).toBe(true);
    expect(fs.existsSync(path.resolve(siteDistPath, "zh/getting-started/coding-agents.html"))).toBe(true);

    // Removed pages must not exist in built dist/site
    expect(fs.existsSync(path.resolve(siteDistPath, "getting-started/ecosystem.html"))).toBe(false);
    expect(fs.existsSync(path.resolve(siteDistPath, "getting-started/ecosystem.md"))).toBe(false);
    expect(fs.existsSync(path.resolve(siteDistPath, "ja/getting-started/ecosystem.html"))).toBe(false);
    expect(fs.existsSync(path.resolve(siteDistPath, "zh/getting-started/ecosystem.html"))).toBe(false);
    expect(fs.existsSync(path.resolve(siteDistPath, "ja/getting-started/ai-agents.html"))).toBe(false);
    expect(fs.existsSync(path.resolve(siteDistPath, "zh/getting-started/ai-agents.html"))).toBe(false);

    expect(enHtml).toContain('link rel="describedby" href="/llms.txt"');
    expect(enHtml).toContain('link rel="alternate" type="text/markdown" href="/index.md"');
    expect(fs.existsSync(path.resolve(siteDistPath, "llms.txt"))).toBe(true);
    expect(fs.existsSync(path.resolve(siteDistPath, "index.md"))).toBe(true);

    // Localized and showcase pages emit rel="describedby" to /llms.txt, but no unshipped raw .md alternate link
    const showcaseHtml = fs.readFileSync(path.resolve(siteDistPath, "showcase/index.html"), "utf-8");
    for (const html of [jaHtml, zhHtml, showcaseHtml]) {
      expect(html).toContain('link rel="describedby" href="/llms.txt"');
      expect(html).not.toContain('type="text/markdown"');
    }

    // Verify homepages link directly (1 hop) to Playground, Apps, Games, and newly added doc pages
    for (const html of [enHtml, jaHtml, zhHtml]) {
      expect(html).toContain('hreflang="en" href="https://washi.ohtaman.dev/"');
      expect(html).toContain('hreflang="ja" href="https://washi.ohtaman.dev/ja/"');
      expect(html).toContain('hreflang="zh-CN" href="https://washi.ohtaman.dev/zh/"');
      expect(html).toContain('hreflang="x-default" href="https://washi.ohtaman.dev/"');
      expect(html).toContain('href="/demo/" target="_self"');
      expect(html).toContain('href="/exercises/" target="_self"');
      expect(html).toContain('href="/apps/ai-shift/" target="_self"');
      expect(html).toContain('href="/apps/ai-timetable/" target="_self"');
      expect(html).toContain('href="/games/demon-castle-shift/" target="_self"');
      expect(html).toContain('href="/games/mofumofu-sheep/" target="_self"');
      expect(html).toContain('href="/games/titan-pack/" target="_self"');
    }

    // Verify standalone interactive HTML entrypoints contain canonical links
    const entryHtmlList: string[] = [];
    for (const subpath of [
      "demo",
      "exercises",
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
      expect(entryHtml).toContain(`link rel="canonical" href="https://washi.ohtaman.dev/${subpath}/"`);
      expect(entryHtml).not.toContain('"/washi/');
      entryHtmlList.push(entryHtml);
    }

    expect(fs.existsSync(demoDistIndexPath)).toBe(true);
    const demoHtml = fs.readFileSync(demoDistIndexPath, "utf-8");
    expect(demoHtml).toContain("<title>WaSHI — Browser Optimization & Constraint Programming Demos</title>");
    expect(demoHtml).toContain("Interactive browser demos and playground for WaSHI: solve linear programming, nurse shift scheduling, and constraint games client-side with WebAssembly (HiGHS & Z3).");

    if (requireSiteDist) {
      const configuredTagId = process.env.GOOGLE_TAG_ID?.trim();
      for (const html of [enHtml, jaHtml, zhHtml, ...entryHtmlList, demoHtml]) {
        if (configuredTagId) {
          expect(html).toContain(
            `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(configuredTagId)}`
          );
          expect(html).toMatch(/gtag\(\s*['"]js['"]\s*,\s*new Date(?:\(\))?\s*\)/);
        } else {
          expect(html).not.toContain("googletagmanager.com/gtm.js");
          expect(html).not.toContain("window.dataLayer");
        }
      }
    }
  });
});
