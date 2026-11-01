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
