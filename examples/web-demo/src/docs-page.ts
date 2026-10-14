// WaSHI Project Page & Docs Scripts
import { initTheme } from "./ui/theme.js";

export function initDocsPage() {
  initTheme();
  // Install tab switching
  const installTabs = document.querySelectorAll<HTMLButtonElement>(".install-tab-btn");
  const installCode = document.getElementById("install-code-text");

  const installCommands: Record<string, string> = {
    npm: "npm install @ohtaman/washi",
    pnpm: "pnpm add @ohtaman/washi",
    yarn: "yarn add @ohtaman/washi",
    bun: "bun add @ohtaman/washi",
  };

  installTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const pm = tab.getAttribute("data-pm") || "npm";
      installTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (installCode && installCommands[pm]) {
        installCode.textContent = installCommands[pm];
      }
    });
  });

  // Copy buttons
  document.querySelectorAll<HTMLButtonElement>(".code-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-copy-target");
      const codeEl = targetId ? document.getElementById(targetId) : null;
      const textToCopy = codeEl ? codeEl.textContent : btn.getAttribute("data-copy-text");

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
          const origText = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = origText;
          }, 2000);
        });
      }
    });
  });

  // Language Switcher
  const langBtnEn = document.getElementById("docs-lang-en");
  const langBtnJa = document.getElementById("docs-lang-ja");

  function setLanguage(lang: "en" | "ja") {
    document.documentElement.lang = lang;
    localStorage.setItem("opt_ts_locale", lang);

    if (lang === "ja") {
      langBtnJa?.classList.add("active");
      langBtnEn?.classList.remove("active");
      document.querySelectorAll(".lang-en").forEach((el) => ((el as HTMLElement).style.display = "none"));
      document.querySelectorAll(".lang-ja").forEach((el) => ((el as HTMLElement).style.display = ""));
    } else {
      langBtnEn?.classList.add("active");
      langBtnJa?.classList.remove("active");
      document.querySelectorAll(".lang-ja").forEach((el) => ((el as HTMLElement).style.display = "none"));
      document.querySelectorAll(".lang-en").forEach((el) => ((el as HTMLElement).style.display = ""));
    }
  }

  // Detect initial lang
  const savedLang = localStorage.getItem("opt_ts_locale");
  const initialLang = savedLang === "en" || savedLang === "ja"
    ? savedLang
    : (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";

  setLanguage(initialLang);

  langBtnEn?.addEventListener("click", () => setLanguage("en"));
  langBtnJa?.addEventListener("click", () => setLanguage("ja"));
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initDocsPage);
}
