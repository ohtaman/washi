import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

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
    expect(locMatches).toContain("https://ohtaman.github.io/washi/solvers/highs");
    expect(locMatches).toContain("https://ohtaman.github.io/washi/examples/production");
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

    expect(content).toContain('titleTemplate: ":title | WaSHI — Algebraic Modeler for Mathematical Optimization & Constraint Programming"');
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

  it("updates docs homepages with PuLP/JuMP framing and domain tagline", () => {
    const enContent = fs.readFileSync(docsEnIndexPath, "utf-8");
    expect(enContent).toContain('text: "Algebraic Modeler for Mathematical Optimization & Constraint Programming"');
    expect(enContent).toContain("A TypeScript alternative to Python's PuLP and Julia's JuMP.");

    const jaContent = fs.readFileSync(docsJaIndexPath, "utf-8");
    expect(jaContent).toContain('text: "数理最適化と制約プログラミングのための代数モデラー"');
    expect(jaContent).toContain("PythonのPuLPやJuliaのJuMPのように直感的な数式で定式化できるTypeScript向け代数モデラー。");

    const zhContent = fs.readFileSync(docsZhIndexPath, "utf-8");
    expect(zhContent).toContain('text: "适用于数理优化与约束编程的代数建模器"');
    expect(zhContent).toContain("Python PuLP 与 Julia JuMP 的 TypeScript 替代方案。");
  });

  it("aligns README headers across English, Japanese, and Simplified Chinese", () => {
    const enReadme = fs.readFileSync(readmeEnPath, "utf-8");
    expect(enReadme).toContain("Algebraic Modeler for Mathematical Optimization &amp; Constraint Programming");
    expect(enReadme).toContain("algebraic modeler for mathematical optimization and constraint programming");

    const jaReadme = fs.readFileSync(readmeJaPath, "utf-8");
    expect(jaReadme).toContain("数理最適化と制約プログラミングのための代数モデラー");
    expect(jaReadme).toContain("数理最適化と制約プログラミングのための TypeScript / JavaScript 向け代数モデラー");

    const zhReadme = fs.readFileSync(readmeZhPath, "utf-8");
    expect(zhReadme).toContain("适用于数理优化与约束编程的代数建模器");
    expect(zhReadme).toContain("面向 TypeScript / JavaScript 的数理优化与约束编程代数建模器");
  });

  it("verifies emitted HTML in dist/site and dist/demo contains configured SEO tags and localized titles", () => {
    const siteDistPath = path.resolve(rootDir, "dist/site");
    if (!fs.existsSync(siteDistPath)) {
      return;
    }

    const enHtml = fs.readFileSync(path.resolve(siteDistPath, "index.html"), "utf-8");
    expect(enHtml).toContain("<title>WaSHI | WaSHI — Algebraic Modeler for Mathematical Optimization &amp; Constraint Programming</title>");
    expect(enHtml).toContain('name="description" content="WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, SMT)."');
    expect(enHtml).toContain('property="og:type" content="website"');
    expect(enHtml).toContain('property="og:site_name" content="WaSHI"');
    expect(enHtml).toContain('property="og:image" content="https://ohtaman.github.io/washi/washi-logo.png"');
    expect(enHtml).toContain('name="twitter:card" content="summary"');
    expect(enHtml).toContain('name="twitter:image" content="https://ohtaman.github.io/washi/washi-logo.png"');
    expect(enHtml).toContain('name="keywords" content="typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, smt, highs, z3, pulp, jump, webassembly"');

    const jaHtml = fs.readFileSync(path.resolve(siteDistPath, "ja/index.html"), "utf-8");
    expect(jaHtml).toContain("<title>WaSHI | WaSHI — 数理最適化と制約プログラミングのための代数モデラー</title>");
    expect(jaHtml).toContain('name="description" content="TypeScript & JavaScript 向け数理最適化と制約プログラミングのための代数モデラー（LP, MIP, 凸QP, SMT）"');

    const zhHtml = fs.readFileSync(path.resolve(siteDistPath, "zh/index.html"), "utf-8");
    expect(zhHtml).toContain("<title>WaSHI | WaSHI — 适用于数理优化与约束编程的代数建模器</title>");
    expect(zhHtml).toContain('name="description" content="适用于 TypeScript 与 JavaScript 的数理优化与约束编程代数建模器（LP, MIP, 凸QP, SMT）"');

    const demoDistPath = path.resolve(rootDir, "dist/demo/index.html");
    if (fs.existsSync(demoDistPath)) {
      const demoHtml = fs.readFileSync(demoDistPath, "utf-8");
      expect(demoHtml).toContain("<title>WaSHI — Browser Optimization & Constraint Programming Demos</title>");
      expect(demoHtml).toContain("Interactive browser demos and playground for WaSHI: solve linear programming, nurse shift scheduling, and constraint games client-side with WebAssembly (HiGHS & Z3).");
    }
  });
});
