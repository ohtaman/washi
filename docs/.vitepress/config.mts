import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import katex from "katex";

export default withMermaid(
  defineConfig({
  title: "WaSHI",
  description: "WebAssembly-backed, Solver-independent, High-level modeling Interface (LP, MIP, QP, SMT)",
  base: "/washi/",
  cleanUrls: true,
  lastUpdated: true,
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
    // Service Worker を読み込み
    ["script", { src: "/washi/coi-serviceworker.js" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      title: "WaSHI",
      description: "Intuitive Mathematical Optimization & Algebraic Modeler for TypeScript & JavaScript",
      themeConfig: {
        nav: [
          { text: "Getting Started", link: "/getting-started/" },
          { text: "Guide", link: "/guide/variables" },
          { text: "Solvers", link: "/solvers/" },
          { text: "Examples", link: "/examples/" },
          { text: "Playground ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "Getting Started",
            items: [
              { text: "Introduction & Installation", link: "/getting-started/" },
              { text: "AI Agent Quick-Reference", link: "/getting-started/ai-agents" },
              { text: "Runtime Environments", link: "/getting-started/runtimes" },
              { text: "Cross-Origin Isolation", link: "/getting-started/cross-origin" },
            ],
          },
          {
            text: "Modeling Guide",
            items: [
              { text: "Variables & Bounds", link: "/guide/variables" },
              { text: "Expressions (`expr`)", link: "/guide/expressions" },
              { text: "Constraints (`expr`)", link: "/guide/constraints" },
              { text: "Objectives & Sense", link: "/guide/objectives" },
              { text: "Unsat Core Diagnosis", link: "/guide/unsat-core" },
            ],
          },
          {
            text: "Solvers Matrix",
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
      description: "TypeScript & JavaScript 向け直感的数理最適化モデラー",
      themeConfig: {
        nav: [
          { text: "はじめに", link: "/ja/getting-started/" },
          { text: "ガイド", link: "/ja/guide/variables" },
          { text: "ソルバー", link: "/ja/solvers/" },
          { text: "実践例", link: "/ja/examples/" },
          { text: "Playground ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "はじめに",
            items: [
              { text: "インストールと入門", link: "/ja/getting-started/" },
              { text: "AIエージェント向けリファレンス", link: "/ja/getting-started/ai-agents" },
              { text: "ランタイム環境設定", link: "/ja/getting-started/runtimes" },
              { text: "Cross-Origin Isolation (COOP/COEP)", link: "/ja/getting-started/cross-origin" },
            ],
          },
          {
            text: "モデリングガイド",
            items: [
              { text: "変数と境界値", link: "/ja/guide/variables" },
              { text: "数式の記述 (`expr`)", link: "/ja/guide/expressions" },
              { text: "制約条件 (`expr`)", link: "/ja/guide/constraints" },
              { text: "目的関数と最適化", link: "/ja/guide/objectives" },
              { text: "競合制約診断 (Unsat Core)", link: "/ja/guide/unsat-core" },
            ],
          },
          {
            text: "ソルバー詳細",
            items: [
              { text: "ソルバー比較と概要", link: "/ja/solvers/" },
              { text: "HiGHS (標準ソルバー)", link: "/ja/solvers/highs" },
              { text: "Z3 (SMT / 競合診断)", link: "/ja/solvers/z3" },
              { text: "GLPK (LP / MIP)", link: "/ja/solvers/glpk" },
              { text: "カスタムソルバー作成ガイド", link: "/ja/solvers/custom-solver" },
            ],
          },
          {
            text: "実践例・サンプル",
            items: [
              { text: "一覧・逆引きインデックス", link: "/ja/examples/" },
              { text: "生産計画問題 (LP/MIP)", link: "/ja/examples/production" },
              { text: "0-1 ナップサック問題 (MIP)", link: "/ja/examples/knapsack" },
              { text: "輸送・物流ネットワーク (LP)", link: "/ja/examples/transportation" },
              { text: "栄養問題と感度分析 (Dual/Slack)", link: "/ja/examples/diet-sensitivity" },
              { text: "シフト作成と希望休の競合診断", link: "/ja/examples/shift-scheduling" },
              { text: "ECカートのクーポン最適適用", link: "/ja/examples/ecommerce-coupons" },
              { text: "ポートフォリオ最適化 (QP)", link: "/ja/examples/portfolio-qp" },
              { text: "セキュリティポリシー検証 (SMT)", link: "/ja/examples/smt-security" },
              { text: "制約矛盾の診断 (Unsat Core)", link: "/ja/examples/unsat-core" },
            ],
          },
        ],
        outline: {
          label: "このページの目次",
        },
        docFooter: {
          prev: "前のページ",
          next: "次のページ",
        },
        lastUpdated: {
          text: "最終更新",
        },
        returnToTopLabel: "トップに戻る",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "外観モード",
        lightModeSwitchTitle: "ライトモードに切り替え",
        darkModeSwitchTitle: "ダークモードに切り替え",
        langMenuLabel: "言語を切り替え",
        skipToContentLabel: "本文へスキップ",
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "WaSHI",
      description: "适用于 TypeScript/JavaScript 的现代代数建模与数理优化系统",
      themeConfig: {
        nav: [
          { text: "快速入门", link: "/zh/getting-started/" },
          { text: "指南", link: "/zh/guide/variables" },
          { text: "求解器", link: "/zh/solvers/" },
          { text: "示例", link: "/zh/examples/" },
          { text: "Playground ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "快速入门",
            items: [
              { text: "安装与入门", link: "/zh/getting-started/" },
              { text: "AI 编程助手快速参考", link: "/zh/getting-started/ai-agents" },
              { text: "运行时环境配置", link: "/zh/getting-started/runtimes" },
              { text: "跨源隔离 (COOP/COEP)", link: "/zh/getting-started/cross-origin" },
            ],
          },
          {
            text: "建模指南",
            items: [
              { text: "决策变量与上下界", link: "/zh/guide/variables" },
              { text: "数学表达式 (`expr`)", link: "/zh/guide/expressions" },
              { text: "约束条件 (`expr`)", link: "/zh/guide/constraints" },
              { text: "目标函数与求解方向", link: "/zh/guide/objectives" },
              { text: "不可行冲突诊断 (Unsat Core)", link: "/zh/guide/unsat-core" },
            ],
          },
          {
            text: "求解器矩阵",
            items: [
              { text: "概览与对比", link: "/zh/solvers/" },
              { text: "HiGHS (内置默认)", link: "/zh/solvers/highs" },
              { text: "Z3 (SMT / 冲突诊断)", link: "/zh/solvers/z3" },
              { text: "GLPK (LP / MIP)", link: "/zh/solvers/glpk" },
              { text: "自定义求解器指南", link: "/zh/solvers/custom-solver" },
            ],
          },
          {
            text: "实际案例与代码示例",
            items: [
              { text: "案例总览与 API 索引", link: "/zh/examples/" },
              { text: "生产计划问题 (LP/MIP)", link: "/zh/examples/production" },
              { text: "0-1 背包问题 (MIP)", link: "/zh/examples/knapsack" },
              { text: "运输与分配网络 (LP)", link: "/zh/examples/transportation" },
              { text: "营养问题与灵敏度分析", link: "/zh/examples/diet-sensitivity" },
              { text: "员工排班与冲突诊断", link: "/zh/examples/shift-scheduling" },
              { text: "购物车优惠券最优组合", link: "/zh/examples/ecommerce-coupons" },
              { text: "投资组合优化 (QP)", link: "/zh/examples/portfolio-qp" },
              { text: "安全策略验证 (SMT)", link: "/zh/examples/smt-security" },
              { text: "不可行冲突诊断 (Unsat Core)", link: "/zh/examples/unsat-core" },
            ],
          },
        ],
        outline: {
          label: "本页目录",
        },
        docFooter: {
          prev: "上一页",
          next: "下一页",
        },
        lastUpdated: {
          text: "最后更新于",
        },
        returnToTopLabel: "返回顶部",
        sidebarMenuLabel: "菜单",
        darkModeSwitchLabel: "外观模式",
        lightModeSwitchTitle: "切换到浅色模式",
        darkModeSwitchTitle: "切换到深色模式",
        langMenuLabel: "切换语言",
        skipToContentLabel: "跳转到正文",
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
                buttonText: "検索",
                buttonAriaLabel: "検索",
              },
              modal: {
                displayDetails: "詳細リストを表示",
                resetButtonTitle: "検索条件をリセット",
                backButtonTitle: "検索を閉じる",
                noResultsText: "関連する結果が見つかりませんでした",
                footer: {
                  selectText: "選択",
                  selectKeyAriaLabel: "Enter キー",
                  navigateText: "移動",
                  navigateUpKeyAriaLabel: "上矢印キー",
                  navigateDownKeyAriaLabel: "下矢印キー",
                  closeText: "閉じる",
                  closeKeyAriaLabel: "Esc キー",
                },
              },
            },
          },
          zh: {
            translations: {
              button: {
                buttonText: "搜索文档",
                buttonAriaLabel: "搜索文档",
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "清除查询条件",
                backButtonTitle: "关闭搜索",
                noResultsText: "无法找到相关结果",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车键",
                  navigateText: "切换",
                  navigateUpKeyAriaLabel: "向上箭头键",
                  navigateDownKeyAriaLabel: "向下箭头键",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc 键",
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
