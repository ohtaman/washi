import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "./custom.css";
import ShiftSchedulingDemo from "./components/ShiftSchedulingDemo.vue";
import EcommerceCouponDemo from "./components/EcommerceCouponDemo.vue";
import PortfolioQpDemo from "./components/PortfolioQpDemo.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("ShiftSchedulingDemo", ShiftSchedulingDemo);
    app.component("EcommerceCouponDemo", EcommerceCouponDemo);
    app.component("PortfolioQpDemo", PortfolioQpDemo);
  },
} satisfies Theme;
