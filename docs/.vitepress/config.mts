import { defineConfig, type HeadConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import katex from "katex";
import jaLocale from "./locales/ja.json";
import zhLocale from "./locales/zh.json";

export default withMermaid(
  defineConfig({
  title: "WaSHI",
  titleTemplate: ":title | WaSHI — Mathematical Optimization Modeler in TypeScript",
  description: "WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, SMT).",
  base: "/washi/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://ohtaman.github.io/washi/",
  },
  transformHead({ pageData, siteData }) {
    const baseDomain = "https://ohtaman.github.io";
    const basePath = "/washi/";

    // Normalize relativePath for cleanUrls:
    // "index.md" -> ""
    // "ja/index.md" -> "ja/"
    // "getting-started/index.md" -> "getting-started/"
    // "getting-started/ai-agents.md" -> "getting-started/ai-agents"
    const cleanRelativePath = pageData.relativePath
      .replace(/(^|\/)index\.md$/, "$1")
      .replace(/\.md$/, "");

    const canonicalUrl = `${baseDomain}${basePath}${cleanRelativePath}`;

    const pageTitle = pageData.title
      ? `${pageData.title} | ${siteData.title}`
      : siteData.title;
    const pageDescription =
      pageData.description ||
      pageData.frontmatter.description ||
      siteData.description;
    const pageType = pageData.relativePath.endsWith("index.md") ? "website" : "article";
    const ogImage = `${baseDomain}${basePath}washi-logo.png`;
    const hasRawMarkdownEndpoint =
      pageData.relativePath === "index.md" ||
      /^(?:getting-started|guide|solvers|examples)\/[^/]+\.md$/.test(pageData.relativePath);

    const head: HeadConfig[] = [
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["link", { rel: "describedby", href: `${basePath}llms.txt` }],
      ...(hasRawMarkdownEndpoint
        ? ([
            [
              "link",
              {
                rel: "alternate",
                type: "text/markdown",
                href: `${basePath}${pageData.relativePath}`,
              },
            ],
          ] as HeadConfig[])
        : []),
      ["meta", { property: "og:url", content: canonicalUrl }],
      ["meta", { property: "og:type", content: pageType }],
      ["meta", { property: "og:title", content: pageTitle }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:image", content: ogImage }],
      ["meta", { name: "twitter:card", content: "summary" }],
      ["meta", { name: "twitter:url", content: canonicalUrl }],
      ["meta", { name: "twitter:title", content: pageTitle }],
      ["meta", { name: "twitter:description", content: pageDescription }],
      ["meta", { name: "twitter:image", content: ogImage }],
    ];

    return head;
  },
  markdown: {
    config(md) {
      // Block math: $$ ... $$
      md.block.ruler.after(
        "blockquote",
        "math_block",
        (state, startLine, endLine, silent) => {
          let pos = state.bMarks[startLine] + state.tShift[startLine];
          let max = state.eMarks[startLine];
          if (pos + 2 > max) return false;
          if (state.src.slice(pos, pos + 2) !== "$$") return false;

          pos += 2;
          let firstLine = state.src.slice(pos, max);

          if (silent) return true;

          let nextLine = startLine;
          let haveEndMarker = false;

          if (firstLine.trim().endsWith("$$")) {
            firstLine = firstLine.trim().slice(0, -2);
            haveEndMarker = true;
          }

          const lines: string[] = [firstLine];
          while (!haveEndMarker) {
            nextLine++;
            if (nextLine >= endLine) break;
            pos = state.bMarks[nextLine] + state.tShift[nextLine];
            max = state.eMarks[nextLine];
            const lineText = state.src.slice(pos, max);
            if (lineText.trim().endsWith("$$")) {
              lines.push(lineText.trim().slice(0, -2));
              haveEndMarker = true;
            } else {
              lines.push(lineText);
            }
          }

          state.line = nextLine + 1;
          const token = state.push("math_block", "math", 0);
          token.block = true;
          token.content = lines.join("\n").trim();
          token.map = [startLine, state.line];
          return true;
        },
        { alt: ["paragraph", "reference", "blockquote", "list"] }
      );

      // Inline math: $ ... $ (ignores currency like $400 or $1,020)
      md.inline.ruler.after("escape", "math_inline", (state, silent) => {
        if (state.src[state.pos] !== "$") return false;
        const start = state.pos + 1;
        if (start >= state.posMax) return false;

        const firstChar = state.src[start];
        // Ignore currency values ($0-$9) or whitespace after opening $
        if (!firstChar || /[\s0-9]/.test(firstChar)) return false;

        let match = start;
        while ((match = state.src.indexOf("$", match)) !== -1) {
          let backslashes = 0;
          let k = match - 1;
          while (k >= start && state.src[k] === "\\") {
            backslashes++;
            k--;
          }
          if (backslashes % 2 === 0) break;
          match++;
        }

        if (match === -1 || match === start) return false;
        const content = state.src.slice(start, match);
        if (/\s$/.test(content)) return false;

        if (!silent) {
          const token = state.push("math_inline", "math", 0);
          token.content = content;
        }
        state.pos = match + 1;
        return true;
      });

      md.renderer.rules.math_block = (tokens, idx) => {
        const html = katex.renderToString(tokens[idx].content, {
          displayMode: true,
          throwOnError: false,
        });
        return `<div v-pre class="katex-block">${html}</div>\n`;
      };

      md.renderer.rules.math_inline = (tokens, idx) => {
        const html = katex.renderToString(tokens[idx].content, {
          displayMode: false,
          throwOnError: false,
        });
        return `<span v-pre>${html}</span>`;
      };
    },
  },
  head: [
    ["link", { rel: "icon", href: "/washi/washi-logo.svg", type: "image/svg+xml" }],
    ["link", { rel: "alternate icon", href: "/washi/washi-logo.png", type: "image/png" }],
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "WaSHI" }],
    ["meta", { property: "og:image", content: "https://ohtaman.github.io/washi/washi-logo.png" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "twitter:image", content: "https://ohtaman.github.io/washi/washi-logo.png" }],
    ["meta", { name: "keywords", content: "typescript, optimization, mathematical-programming, constraint-programming, linear-programming, mip, smt, highs, z3, pulp, jump, webassembly" }],
    // Load Service Worker
    ["script", { src: "/washi/coi-serviceworker.js" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      title: "WaSHI",
      titleTemplate: ":title | WaSHI — Mathematical Optimization Modeler in TypeScript",
      description: "WebAssembly-backed Algebraic Modeler for Mathematical Optimization & Constraint Programming in TypeScript & JavaScript (LP, MIP, Convex QP, SMT).",
      themeConfig: {
        nav: [
          {
            text: "Getting Started",
            link: "/getting-started/",
            activeMatch: "^/(?:getting-started|guide|solvers|examples)/",
          },
          { text: "Showcase", link: "/showcase/", activeMatch: "^/showcase/" },
        ],
        sidebar: [
          {
            text: "Getting Started",
            items: [
              { text: "Introduction & Installation", link: "/getting-started/" },
              { text: "Runtime Environments", link: "/getting-started/runtimes" },
              { text: "Cross-Origin Isolation", link: "/getting-started/cross-origin" },
              { text: "AI Agent Quick-Reference", link: "/getting-started/ai-agents" },
            ],
          },
          {
            text: "Modeling Guide",
            items: [
              { text: "Variables & Bounds", link: "/guide/variables" },
              { text: "Expressions", link: "/guide/expressions" },
              { text: "Constraints", link: "/guide/constraints" },
              { text: "Objectives & Sense", link: "/guide/objectives" },
              { text: "Unsat Core Diagnosis", link: "/guide/unsat-core" },
              { text: "Decomposition Methods", link: "/guide/decomposition" },
            ],
          },
          {
            text: "Solvers",
            items: [
              { text: "Overview & Comparison", link: "/solvers/" },
              { text: "HiGHS (Built-in default)", link: "/solvers/highs" },
              { text: "Z3 (SMT / Unsat Core)", link: "/solvers/z3" },
              { text: "GLPK (LP / MIP)", link: "/solvers/glpk" },
              { text: "Custom Solver Adapter", link: "/solvers/custom-solver" },
            ],
          },
          {
            text: "Examples",
            items: [
              { text: "Overview & API Finder", link: "/examples/" },
              { text: "Production Planning (LP/MIP)", link: "/examples/production" },
              { text: "0-1 Knapsack (Binary MIP)", link: "/examples/knapsack" },
              { text: "Transportation Network (LP)", link: "/examples/transportation" },
              { text: "Diet & Sensitivity (Dual/Slack)", link: "/examples/diet-sensitivity" },
              { text: "Staff Shift Scheduling (MIP+Z3)", link: "/examples/shift-scheduling" },
              { text: "E-Commerce Coupon Optimizer", link: "/examples/ecommerce-coupons" },
              { text: "Portfolio Optimization (QP)", link: "/examples/portfolio-qp" },
              { text: "SMT Security Policies (Z3)", link: "/examples/smt-security" },
              { text: "Conflict Diagnosis (Unsat Core)", link: "/examples/unsat-core" },
              { text: "Vehicle Routing (Column Generation)", link: "/examples/vehicle-routing" },
              { text: "Traveling Salesperson (Benders)", link: "/examples/traveling-salesperson" },
            ],
          },
        ],
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      link: "/ja/",
      title: "WaSHI",
      titleTemplate: jaLocale.titleTemplate,
      description: jaLocale.description,
      themeConfig: {
        nav: [
          {
            text: jaLocale.nav[0].text,
            link: "/ja/getting-started/",
            activeMatch: "^/ja/(?:getting-started|guide|solvers|examples)/",
          },
          { text: jaLocale.nav[1].text, link: "/ja/showcase/", activeMatch: "^/ja/showcase/" },
        ],
        sidebar: [
          {
            text: jaLocale.sidebar[0].text,
            items: [
              { text: jaLocale.sidebar[0].items[0].text, link: "/ja/getting-started/" },
              { text: jaLocale.sidebar[0].items[1].text, link: "/ja/getting-started/runtimes" },
              { text: jaLocale.sidebar[0].items[2].text, link: "/ja/getting-started/cross-origin" },
              { text: jaLocale.sidebar[0].items[3].text, link: "/ja/getting-started/ai-agents" },
            ],
          },
          {
            text: jaLocale.sidebar[1].text,
            items: [
              { text: jaLocale.sidebar[1].items[0].text, link: "/ja/guide/variables" },
              { text: jaLocale.sidebar[1].items[1].text, link: "/ja/guide/expressions" },
              { text: jaLocale.sidebar[1].items[2].text, link: "/ja/guide/constraints" },
              { text: jaLocale.sidebar[1].items[3].text, link: "/ja/guide/objectives" },
              { text: jaLocale.sidebar[1].items[4].text, link: "/ja/guide/unsat-core" },
              { text: jaLocale.sidebar[1].items[5].text, link: "/ja/guide/decomposition" },
            ],
          },
          {
            text: jaLocale.sidebar[2].text,
            items: [
              { text: jaLocale.sidebar[2].items[0].text, link: "/ja/solvers/" },
              { text: jaLocale.sidebar[2].items[1].text, link: "/ja/solvers/highs" },
              { text: jaLocale.sidebar[2].items[2].text, link: "/ja/solvers/z3" },
              { text: jaLocale.sidebar[2].items[3].text, link: "/ja/solvers/glpk" },
              { text: jaLocale.sidebar[2].items[4].text, link: "/ja/solvers/custom-solver" },
            ],
          },
          {
            text: jaLocale.sidebar[3].text,
            items: [
              { text: jaLocale.sidebar[3].items[0].text, link: "/ja/examples/" },
              { text: jaLocale.sidebar[3].items[1].text, link: "/ja/examples/production" },
              { text: jaLocale.sidebar[3].items[2].text, link: "/ja/examples/knapsack" },
              { text: jaLocale.sidebar[3].items[3].text, link: "/ja/examples/transportation" },
              { text: jaLocale.sidebar[3].items[4].text, link: "/ja/examples/diet-sensitivity" },
              { text: jaLocale.sidebar[3].items[5].text, link: "/ja/examples/shift-scheduling" },
              { text: jaLocale.sidebar[3].items[6].text, link: "/ja/examples/ecommerce-coupons" },
              { text: jaLocale.sidebar[3].items[7].text, link: "/ja/examples/portfolio-qp" },
              { text: jaLocale.sidebar[3].items[8].text, link: "/ja/examples/smt-security" },
              { text: jaLocale.sidebar[3].items[9].text, link: "/ja/examples/unsat-core" },
              { text: jaLocale.sidebar[3].items[10].text, link: "/ja/examples/vehicle-routing" },
              { text: jaLocale.sidebar[3].items[11].text, link: "/ja/examples/traveling-salesperson" },
            ],
          },
        ],
        outline: jaLocale.outline,
        docFooter: jaLocale.docFooter,
        lastUpdated: jaLocale.lastUpdated,
        returnToTopLabel: jaLocale.returnToTopLabel,
        sidebarMenuLabel: jaLocale.sidebarMenuLabel,
        darkModeSwitchLabel: jaLocale.darkModeSwitchLabel,
        lightModeSwitchTitle: jaLocale.lightModeSwitchTitle,
        darkModeSwitchTitle: jaLocale.darkModeSwitchTitle,
        langMenuLabel: jaLocale.langMenuLabel,
        skipToContentLabel: jaLocale.skipToContentLabel,
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "WaSHI",
      titleTemplate: zhLocale.titleTemplate,
      description: zhLocale.description,
      themeConfig: {
        nav: [
          {
            text: zhLocale.nav[0].text,
            link: "/zh/getting-started/",
            activeMatch: "^/zh/(?:getting-started|guide|solvers|examples)/",
          },
          { text: zhLocale.nav[1].text, link: "/zh/showcase/", activeMatch: "^/zh/showcase/" },
        ],
        sidebar: [
          {
            text: zhLocale.sidebar[0].text,
            items: [
              { text: zhLocale.sidebar[0].items[0].text, link: "/zh/getting-started/" },
              { text: zhLocale.sidebar[0].items[1].text, link: "/zh/getting-started/runtimes" },
              { text: zhLocale.sidebar[0].items[2].text, link: "/zh/getting-started/cross-origin" },
              { text: zhLocale.sidebar[0].items[3].text, link: "/zh/getting-started/ai-agents" },
            ],
          },
          {
            text: zhLocale.sidebar[1].text,
            items: [
              { text: zhLocale.sidebar[1].items[0].text, link: "/zh/guide/variables" },
              { text: zhLocale.sidebar[1].items[1].text, link: "/zh/guide/expressions" },
              { text: zhLocale.sidebar[1].items[2].text, link: "/zh/guide/constraints" },
              { text: zhLocale.sidebar[1].items[3].text, link: "/zh/guide/objectives" },
              { text: zhLocale.sidebar[1].items[4].text, link: "/zh/guide/unsat-core" },
              { text: zhLocale.sidebar[1].items[5].text, link: "/zh/guide/decomposition" },
            ],
          },
          {
            text: zhLocale.sidebar[2].text,
            items: [
              { text: zhLocale.sidebar[2].items[0].text, link: "/zh/solvers/" },
              { text: zhLocale.sidebar[2].items[1].text, link: "/zh/solvers/highs" },
              { text: zhLocale.sidebar[2].items[2].text, link: "/zh/solvers/z3" },
              { text: zhLocale.sidebar[2].items[3].text, link: "/zh/solvers/glpk" },
              { text: zhLocale.sidebar[2].items[4].text, link: "/zh/solvers/custom-solver" },
            ],
          },
          {
            text: zhLocale.sidebar[3].text,
            items: [
              { text: zhLocale.sidebar[3].items[0].text, link: "/zh/examples/" },
              { text: zhLocale.sidebar[3].items[1].text, link: "/zh/examples/production" },
              { text: zhLocale.sidebar[3].items[2].text, link: "/zh/examples/knapsack" },
              { text: zhLocale.sidebar[3].items[3].text, link: "/zh/examples/transportation" },
              { text: zhLocale.sidebar[3].items[4].text, link: "/zh/examples/diet-sensitivity" },
              { text: zhLocale.sidebar[3].items[5].text, link: "/zh/examples/shift-scheduling" },
              { text: zhLocale.sidebar[3].items[6].text, link: "/zh/examples/ecommerce-coupons" },
              { text: zhLocale.sidebar[3].items[7].text, link: "/zh/examples/portfolio-qp" },
              { text: zhLocale.sidebar[3].items[8].text, link: "/zh/examples/smt-security" },
              { text: zhLocale.sidebar[3].items[9].text, link: "/zh/examples/unsat-core" },
              { text: zhLocale.sidebar[3].items[10].text, link: "/zh/examples/vehicle-routing" },
              { text: zhLocale.sidebar[3].items[11].text, link: "/zh/examples/traveling-salesperson" },
            ],
          },
        ],
        outline: zhLocale.outline,
        docFooter: zhLocale.docFooter,
        lastUpdated: zhLocale.lastUpdated,
        returnToTopLabel: zhLocale.returnToTopLabel,
        sidebarMenuLabel: zhLocale.sidebarMenuLabel,
        darkModeSwitchLabel: zhLocale.darkModeSwitchLabel,
        lightModeSwitchTitle: zhLocale.lightModeSwitchTitle,
        darkModeSwitchTitle: zhLocale.darkModeSwitchTitle,
        langMenuLabel: zhLocale.langMenuLabel,
        skipToContentLabel: zhLocale.skipToContentLabel,
      },
    },
  },
  themeConfig: {
    logo: "/washi-header.svg",
    siteTitle: false,
    search: {
      provider: "local",
      options: {
        locales: {
          ja: {
            translations: {
              button: {
                buttonText: jaLocale.search.button.buttonText,
                buttonAriaLabel: jaLocale.search.button.buttonAriaLabel,
              },
              modal: {
                displayDetails: jaLocale.search.modal.displayDetails,
                resetButtonTitle: jaLocale.search.modal.resetButtonTitle,
                backButtonTitle: jaLocale.search.modal.backButtonTitle,
                noResultsText: jaLocale.search.modal.noResultsText,
                footer: {
                  selectText: jaLocale.search.modal.footer.selectText,
                  selectKeyAriaLabel: jaLocale.search.modal.footer.selectKeyAriaLabel,
                  navigateText: jaLocale.search.modal.footer.navigateText,
                  navigateUpKeyAriaLabel: jaLocale.search.modal.footer.navigateUpKeyAriaLabel,
                  navigateDownKeyAriaLabel: jaLocale.search.modal.footer.navigateDownKeyAriaLabel,
                  closeText: jaLocale.search.modal.footer.closeText,
                  closeKeyAriaLabel: jaLocale.search.modal.footer.closeKeyAriaLabel,
                },
              },
            },
          },
          zh: {
            translations: {
              button: {
                buttonText: zhLocale.search.button.buttonText,
                buttonAriaLabel: zhLocale.search.button.buttonAriaLabel,
              },
              modal: {
                displayDetails: zhLocale.search.modal.displayDetails,
                resetButtonTitle: zhLocale.search.modal.resetButtonTitle,
                backButtonTitle: zhLocale.search.modal.backButtonTitle,
                noResultsText: zhLocale.search.modal.noResultsText,
                footer: {
                  selectText: zhLocale.search.modal.footer.selectText,
                  selectKeyAriaLabel: zhLocale.search.modal.footer.selectKeyAriaLabel,
                  navigateText: zhLocale.search.modal.footer.navigateText,
                  navigateUpKeyAriaLabel: zhLocale.search.modal.footer.navigateUpKeyAriaLabel,
                  navigateDownKeyAriaLabel: zhLocale.search.modal.footer.navigateDownKeyAriaLabel,
                  closeText: zhLocale.search.modal.footer.closeText,
                  closeKeyAriaLabel: zhLocale.search.modal.footer.closeKeyAriaLabel,
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/ohtaman/washi" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 ohtaman & WaSHI Contributors",
    },
  },
  vite: {
    assetsInclude: ["**/*.wasm"],
    optimizeDeps: {
      exclude: ["highs"],
    },
    worker: {
      format: "es",
    },
    resolve: {
      alias: [
        {
          find: /^(.*\/highs\/worker)\.js$/,
          replacement: "$1.ts",
        },
      ],
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  },
})
);
