import { defineConfig } from "vitepress";

export default defineConfig({
  title: "WaSHI",
  description: "WebAssembly Algebraic System for Hybrid & Integer modeling (LP, MIP, QP, SMT)",
  base: "/washi/",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  head: [
    ["link", { rel: "icon", href: "/washi/washi-logo.svg", type: "image/svg+xml" }],
    ["link", { rel: "alternate icon", href: "/washi/washi-logo.png", type: "image/png" }],
    ["meta", { name: "theme-color", content: "#3b82f6" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      title: "WaSHI",
      description: "Intuitive Mathematical Optimization & Algebraic Modeler for TypeScript & JavaScript",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/getting-started/" },
          { text: "Solvers", link: "/solvers/" },
          { text: "Examples", link: "/examples/" },
          { text: "Custom Solvers", link: "/solvers/custom-solver" },
          { text: "Interactive Demo ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "Getting Started",
            items: [
              { text: "Introduction & Installation", link: "/getting-started/" },
              { text: "Runtime Environments", link: "/getting-started/runtimes" },
              { text: "Cross-Origin Isolation", link: "/getting-started/cross-origin" },
            ],
          },
          {
            text: "Modeling Guide",
            items: [
              { text: "Variables & Bounds", link: "/guide/variables" },
              { text: "Expressions (`expr`)", link: "/guide/expressions" },
              { text: "Constraints (`c`)", link: "/guide/constraints" },
              { text: "Objectives & Sense", link: "/guide/objectives" },
              { text: "PuLP / python-mip Syntax", link: "/guide/pulp-compat" },
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
            text: "Recipes & Examples",
            items: [
              { text: "Overview", link: "/examples/" },
              { text: "01: Production Planning (LP)", link: "/examples/production" },
              { text: "02: Knapsack Problem (MIP)", link: "/examples/knapsack" },
              { text: "03: Portfolio Optimization (QP)", link: "/examples/portfolio-qp" },
              { text: "04: SMT Security Policies", link: "/examples/smt-security" },
              { text: "05: Conflict Diagnosis", link: "/examples/unsat-core" },
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
          { text: "ガイド", link: "/ja/getting-started/" },
          { text: "ソルバー", link: "/ja/solvers/" },
          { text: "実践例", link: "/ja/examples/" },
          { text: "カスタムソルバー", link: "/ja/solvers/custom-solver" },
          { text: "Web デモを試す ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "はじめに",
            items: [
              { text: "インストールと入門", link: "/ja/getting-started/" },
              { text: "ランタイム環境設定", link: "/ja/getting-started/runtimes" },
              { text: "Cross-Origin Isolation (COOP/COEP)", link: "/ja/getting-started/cross-origin" },
            ],
          },
          {
            text: "モデリングガイド",
            items: [
              { text: "変数と境界値", link: "/ja/guide/variables" },
              { text: "数式の記述 (`expr`)", link: "/ja/guide/expressions" },
              { text: "制約条件 (`c`)", link: "/ja/guide/constraints" },
              { text: "目的関数と最適化", link: "/ja/guide/objectives" },
              { text: "PuLP / python-mip 互換記法", link: "/ja/guide/pulp-compat" },
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
            text: "実践レシピ集",
            items: [
              { text: "レシピ一覧", link: "/ja/examples/" },
              { text: "01: 生産計画問題 (LP)", link: "/ja/examples/production" },
              { text: "02: ナップサック問題 (MIP)", link: "/ja/examples/knapsack" },
              { text: "03: ポートフォリオ最適化 (QP)", link: "/ja/examples/portfolio-qp" },
              { text: "04: セキュリティポリシー検証 (SMT)", link: "/ja/examples/smt-security" },
              { text: "05: 制約矛盾の診断", link: "/ja/examples/unsat-core" },
            ],
          },
        ],
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
          { text: "指南", link: "/zh/getting-started/" },
          { text: "求解器", link: "/zh/solvers/" },
          { text: "示例", link: "/zh/examples/" },
          { text: "自定义求解器", link: "/zh/solvers/custom-solver" },
          { text: "在线 Demo ↗", link: "https://ohtaman.github.io/washi/demo/" },
        ],
        sidebar: [
          {
            text: "快速入门",
            items: [
              { text: "安装与入门", link: "/zh/getting-started/" },
              { text: "运行时环境配置", link: "/zh/getting-started/runtimes" },
              { text: "跨源隔离 (COOP/COEP)", link: "/zh/getting-started/cross-origin" },
            ],
          },
          {
            text: "建模指南",
            items: [
              { text: "决策变量与上下界", link: "/zh/guide/variables" },
              { text: "数学表达式 (`expr`)", link: "/zh/guide/expressions" },
              { text: "约束条件 (`c`)", link: "/zh/guide/constraints" },
              { text: "目标函数与求解方向", link: "/zh/guide/objectives" },
              { text: "PuLP / python-mip 兼容语法", link: "/zh/guide/pulp-compat" },
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
              { text: "案例总览", link: "/zh/examples/" },
              { text: "01: 生产计划问题 (LP)", link: "/zh/examples/production" },
              { text: "02: 背包问题 (MIP)", link: "/zh/examples/knapsack" },
              { text: "03: 投资组合优化 (QP)", link: "/zh/examples/portfolio-qp" },
              { text: "04: 安全策略验证 (SMT)", link: "/zh/examples/smt-security" },
              { text: "05: 冲突诊断实战", link: "/zh/examples/unsat-core" },
            ],
          },
        ],
      },
    },
  },
  themeConfig: {
    logo: "/washi-logo.svg",
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/ohtaman/washi" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Mitsuhisa Ota & WaSHI Contributors",
    },
  },
});
