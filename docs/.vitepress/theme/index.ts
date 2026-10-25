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
  enhanceApp({ app, router }) {
    app.component("ShiftSchedulingDemo", ShiftSchedulingDemo);
    app.component("EcommerceCouponDemo", EcommerceCouponDemo);
    app.component("PortfolioQpDemo", PortfolioQpDemo);
    app.component("CodeRunner", CodeRunner);

    if (typeof window !== "undefined") {
      router.onBeforeRouteChange = (to) => {
        const url = new URL(to, window.location.origin);
        if (/^(?:\/washi)?\/(?:demo|apps|games)(?:\/|$)/.test(url.pathname)) {
          const normalizedPath =
            /\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.endsWith("/")
              ? url.pathname
              : `${url.pathname}/`;
          window.location.assign(normalizedPath + url.search + url.hash);
          return false;
        }
        return true;
      };

      window.addEventListener(
        "click",
        (e) => {
          const target = e.target as Element | null;
          const link = target?.closest?.("a");
          if (!link) return;
          const href = link.getAttribute("href");
          if (!href) return;
          if (
            /^(?:https?:\/\/[^/]+)?(?:\/washi)?\/(?:demo|apps|games)(?:\/|$)/.test(href) &&
            !link.hasAttribute("target")
          ) {
            link.setAttribute("target", "_self");
          }
        },
        { capture: true }
      );
    }
  },
} satisfies Theme;
