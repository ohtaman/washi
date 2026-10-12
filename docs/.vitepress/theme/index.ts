import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "katex/dist/katex.min.css";
import "./custom.css";
import ShiftSchedulingDemo from "./components/ShiftSchedulingDemo.vue";
import EcommerceCouponDemo from "./components/EcommerceCouponDemo.vue";
import PortfolioQpDemo from "./components/PortfolioQpDemo.vue";
import CodeRunner from "./components/CodeRunner.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("ShiftSchedulingDemo", ShiftSchedulingDemo);
    app.component("EcommerceCouponDemo", EcommerceCouponDemo);
    app.component("PortfolioQpDemo", PortfolioQpDemo);
    app.component("CodeRunner", CodeRunner);
  },
} satisfies Theme;
