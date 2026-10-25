import { EXAMPLES, type ExampleModel, type PresetGroup } from "../presets/index.js";
import { executeModelCode } from "./runner.js";
import { DOCS_HTML } from "./docs.js";
import type { Model } from "../../../../src/modeler/model.js";
import { setDefaultSolver } from "../../../../src/modeler/solvers/registry.js";
import { registerZ3Solver } from "../../../../src/modeler/solvers/z3.js";
import { registerGLPKSolver } from "../../../../src/modeler/solvers/glpk.js";
import {
  initLocale,
  setLocale,
  getLocale,
  onLocaleChange,
  t,
  type Locale,
  type TranslationDict,
} from "./i18n.js";
import { initTheme } from "./theme.js";

const GROUP_LABELS: Record<Locale, Record<PresetGroup, string>> = {
  en: {
    fundamentals: "1. Fundamentals (Core Modeling APIs)",
    practical: "2. Practical Applications (Real-World Use Cases)",
    logic: "3. SMT Logic & Conflict Diagnosis (Z3)",
  },
  ja: {
    fundamentals: "1. 基本モデル（APIと概念の理解）",
    practical: "2. 実践ユースケース（業務・アプリ応用）",
    logic: "3. 論理検証・競合診断（Z3 SMT / Unsat Core）",
  },
};

export function initApp() {
  initTheme();
  registerZ3Solver();
  registerGLPKSolver();

  const codeTextarea = document.getElementById("code-editor") as HTMLTextAreaElement;
  const lineNumbers = document.getElementById("line-numbers") as HTMLDivElement;
  const presetSelect = document.getElementById("preset-select") as HTMLSelectElement;
  const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
  const genLpBtn = document.getElementById("gen-lp-btn") as HTMLButtonElement;
  const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;

  // Language buttons
  const langBtnEn = document.getElementById("lang-btn-en") as HTMLButtonElement | null;
  const langBtnJa = document.getElementById("lang-btn-ja") as HTMLButtonElement | null;

  // Tabs
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // Results elements
  const metricStatus = document.getElementById("metric-status") as HTMLDivElement;
  const metricObj = document.getElementById("metric-obj") as HTMLDivElement;
  const metricTime = document.getElementById("metric-time") as HTMLDivElement;
  const metricVars = document.getElementById("metric-vars") as HTMLDivElement;
  const varsTableBody = document.getElementById("vars-tbody") as HTMLTableSectionElement;
  const visualizerContainer = document.getElementById("visualizer-container") as HTMLDivElement;
  const lpOutput = document.getElementById("lp-output") as HTMLElement;
  const logOutput = document.getElementById("log-output") as HTMLElement;
  const docsContainer = document.getElementById("docs-content") as HTMLElement;
  const filterNonZero = document.getElementById("filter-non-zero") as HTMLInputElement;
  const unsatCoreBox = document.getElementById("unsat-core-box") as HTMLDivElement | null;
  const unsatCoreList = document.getElementById("unsat-core-list") as HTMLDivElement | null;

  if (docsContainer) {
    docsContainer.innerHTML = DOCS_HTML;
  }

  let currentModel: Model | null = null;

  function populatePresetOptions(locale: Locale) {
    const selectedValue = presetSelect.value;
    presetSelect.innerHTML = "";

    const groups: PresetGroup[] = ["fundamentals", "practical", "logic"];
    for (const grp of groups) {
      const groupItems = EXAMPLES.filter((ex) => ex.group === grp);
      if (groupItems.length === 0) continue;

      const optgroup = document.createElement("optgroup");
      optgroup.label = GROUP_LABELS[locale][grp];

      for (const ex of groupItems) {
        const opt = document.createElement("option");
        opt.value = ex.id;
        const displayTitle = locale === "ja" && ex.titleJa ? ex.titleJa : ex.title;
        opt.textContent = `[${ex.category}] ${displayTitle}`;
        optgroup.appendChild(opt);
      }
      presetSelect.appendChild(optgroup);
    }

    if (selectedValue && EXAMPLES.some((e) => e.id === selectedValue)) {
      presetSelect.value = selectedValue;
    }
  }

  function applyLocale(locale: Locale) {
    document.documentElement.lang = locale;
    if (langBtnEn && langBtnJa) {
      if (locale === "ja") {
        langBtnJa.classList.add("active");
        langBtnEn.classList.remove("active");
      } else {
        langBtnEn.classList.add("active");
        langBtnJa.classList.remove("active");
      }
    }

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n") as keyof TranslationDict;
      if (key) {
        el.textContent = t(key);
      }
    });

    const navDocs = document.getElementById("nav-back-docs");
    if (navDocs) {
      navDocs.setAttribute("href", locale === "ja" ? "../ja/" : "../");
    }
    const navShowcase = document.getElementById("nav-showcase");
    if (navShowcase) {
      navShowcase.setAttribute("href", locale === "ja" ? "../ja/showcase/" : "../showcase/");
    }
    const navBrandLogo = document.getElementById("nav-brand-logo");
    if (navBrandLogo) {
      navBrandLogo.setAttribute("href", locale === "ja" ? "../ja/" : "../");
    }

    populatePresetOptions(locale);
    renderVisualizer();
  }

  if (langBtnEn) {
    langBtnEn.addEventListener("click", () => setLocale("en"));
  }
  if (langBtnJa) {
    langBtnJa.addEventListener("click", () => setLocale("ja"));
  }

  onLocaleChange(applyLocale);

  // Populate initial presets
  populatePresetOptions(getLocale());

  function updateLineNumbers() {
    const lines = codeTextarea.value.split("\n").length;
    lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  }

  function loadPreset(id: string) {
    const example = EXAMPLES.find((ex) => ex.id === id) || EXAMPLES[0];
    codeTextarea.value = example.code;
    presetSelect.value = example.id;
    updateLineNumbers();

    if (example.category === "SMT" || example.code.includes('solver: "z3"')) {
      if (solverSelect) solverSelect.value = "z3";
      updateSolver("z3");
    } else if (example.id.includes("glpk") || example.code.includes('solver: "glpk"')) {
      if (solverSelect) solverSelect.value = "glpk";
      updateSolver("glpk");
    } else {
      if (solverSelect) solverSelect.value = "highs";
      updateSolver("highs");
    }
  }

  // Preset switch
  presetSelect.addEventListener("change", () => {
    loadPreset(presetSelect.value);
  });

  // Solver selector
  const solverSelect = document.getElementById("solver-select") as HTMLSelectElement | null;
  const solverBadgeText = document.getElementById("solver-badge-text") as HTMLSpanElement | null;
  let currentSolver: "highs" | "glpk" | "z3" = "highs";

  function updateSolver(solverName: "highs" | "glpk" | "z3") {
    currentSolver = solverName;
    setDefaultSolver(solverName);
    if (solverBadgeText) {
      if (solverName === "z3") {
        const isIsolated = typeof window !== "undefined" && (window as any).crossOriginIsolated === true;
        solverBadgeText.textContent = isIsolated
          ? "Z3 v5.2.0 (SMT/SAT/MIP)"
          : "Z3 v5.2.0 (COI Required)";
      } else if (solverName === "glpk") {
        solverBadgeText.textContent = "GLPK v5.0.0 (WASM)";
      } else {
        solverBadgeText.textContent = "HiGHS v1.15.3 (WASM)";
      }
    }
  }

  if (solverSelect) {
    solverSelect.addEventListener("change", () => {
      updateSolver(solverSelect.value as "highs" | "glpk" | "z3");
    });
  }

  // Editor events
  codeTextarea.addEventListener("input", updateLineNumbers);
  codeTextarea.addEventListener("scroll", () => {
    lineNumbers.scrollTop = codeTextarea.scrollTop;
  });

  // Handle Tab indentation & Shortcuts
  codeTextarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = codeTextarea.selectionStart;
      const end = codeTextarea.selectionEnd;
      codeTextarea.value =
        codeTextarea.value.substring(0, start) + "  " + codeTextarea.value.substring(end);
      codeTextarea.selectionStart = codeTextarea.selectionEnd = start + 2;
      updateLineNumbers();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runOptimization();
    }
  });

  // Tab switching
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const targetContent = document.getElementById(targetId!);
      if (targetContent) {
        targetContent.classList.add("active");
      }
    });
  });

  // Run Optimization
  async function runOptimization() {
    if (currentSolver === "z3" && typeof window !== "undefined" && !(window as any).crossOriginIsolated) {
      const coiStatus = (window as any).__washi_coi_status;
      let failureReason = "Cross-origin isolation (COOP/COEP) is not established.";
      if (coiStatus === "insecure_context") {
        failureReason = "Page is not running in a Secure Context (HTTPS or localhost).";
      } else if (coiStatus === "sw_unsupported") {
        failureReason = "Service Workers are not supported or are disabled in this browser context.";
      } else if (coiStatus === "failed_after_reload") {
        failureReason = "Service Worker was registered, but cross-origin isolation could not be established after page reload.";
      } else if (coiStatus === "registration_failed") {
        failureReason = "Failed to register cross-origin isolation Service Worker.";
      }

      const msg = `[WaSHI] Z3 solver execution aborted.\n\n` +
        `Reason: ${failureReason}\n\n` +
        `Requirements:\n` +
        `  The Z3 multithreaded WebAssembly engine requires SharedArrayBuffer and crossOriginIsolated === true.\n` +
        `  Document delivery headers required:\n` +
        `    Cross-Origin-Opener-Policy: same-origin\n` +
        `    Cross-Origin-Embedder-Policy: require-corp\n\n` +
        `Action:\n` +
        `  On GitHub Pages or static hosts, ensure Service Workers are enabled and the page is loaded over HTTPS\n` +
        `  so coi-serviceworker can establish cross-origin isolation.`;

      logOutput.textContent = msg;
      showTab("tab-logs");
      metricStatus.textContent = "Unsupported";
      metricStatus.className = "metric-value status-infeasible";
      return;
    }

    runBtn.disabled = true;
    const solverDisplayName =
      currentSolver === "z3" ? "Z3" : currentSolver === "glpk" ? "GLPK" : "HiGHS";
    runBtn.textContent = `Solving with ${solverDisplayName}...`;

    if (unsatCoreBox) unsatCoreBox.style.display = "none";

    try {
      const result = await executeModelCode(codeTextarea.value);

      if (!result.success) {
        logOutput.textContent = `Execution Error:\n${result.error}\n\nStack:\n${result.logs.join("\n")}`;
        showTab("tab-logs");
        metricStatus.textContent = "Error";
        metricStatus.className = "metric-value status-infeasible";
        return;
      }

      currentModel = result.model || null;

      // Update metrics
      const status = currentModel?.status || "Optimal";
      metricStatus.textContent = status;
      metricStatus.className = `metric-value status-${status.toLowerCase()}`;

      const objVal = currentModel?.objectiveValue;
      metricObj.textContent =
        objVal !== null && objVal !== undefined
          ? Number(objVal).toFixed(4).replace(/\.?0+$/, "")
          : "--";

      metricTime.textContent = result.runTime
        ? `${(result.runTime * 1000).toFixed(1)} ms`
        : "--";
      const totalVars = (currentModel?.numVars ?? 0) + (currentModel?.boolVars.length ?? 0);
      metricVars.textContent = String(totalVars);

      // Render Unsat Core if conflicting constraints detected
      if (
        unsatCoreBox &&
        unsatCoreList &&
        currentModel?.unsatCore &&
        currentModel.unsatCore.length > 0
      ) {
        unsatCoreBox.style.display = "flex";
        unsatCoreList.innerHTML = currentModel.unsatCore
          .map((cName) => `<span class="unsat-core-chip">${cName}</span>`)
          .join("");
      }

      // Render logs
      logOutput.textContent =
        result.logs.length > 0
          ? result.logs.join("\n")
          : "Solve completed successfully with no warnings.";

      // Render LP String
      if (currentModel) {
        lpOutput.textContent = currentModel.toLpString();
      }

      // Render variables table & visualizer
      renderVariablesTable();
      renderVisualizer();

      showTab("tab-results");
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = t("runButton");
    }
  }

  function showTab(tabId: string) {
    tabButtons.forEach((b) => {
      if (b.getAttribute("data-tab") === tabId) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
    tabContents.forEach((c) => {
      if (c.id === tabId) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });
  }

  function renderVariablesTable() {
    if (!currentModel) {
      varsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No model executed yet.</td></tr>`;
      return;
    }

    const onlyNonZero = filterNonZero.checked;
    let vars = currentModel.variables;

    if (onlyNonZero) {
      vars = vars.filter((v) => Math.abs(v.value ?? 0) > 1e-6);
    }

    let bVars = currentModel.boolVars || [];
    if (onlyNonZero) {
      bVars = bVars.filter((bv) => currentModel!.values.get(bv.name) === true);
    }

    if (vars.length === 0 && bVars.length === 0) {
      varsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No matching variables.</td></tr>`;
      return;
    }

    const MAX_DISPLAY = 500;
    const isTruncated = vars.length > MAX_DISPLAY;
    const displayVars = isTruncated ? vars.slice(0, MAX_DISPLAY) : vars;

    let rowsHtml = displayVars
      .map((v) => {
        const valStr =
          v.value !== null && v.value !== undefined
            ? v.value.toFixed(4).replace(/\.?0+$/, "")
            : "--";
        const rcStr =
          v.reducedCost !== null && v.reducedCost !== undefined
            ? v.reducedCost.toFixed(4).replace(/\.?0+$/, "")
            : "--";
        const lbStr = v.lb === -Infinity ? "-∞" : String(v.lb);
        const ubStr = v.ub === Infinity ? "+∞" : String(v.ub);

        return `
        <tr>
          <td><strong>${v.name}</strong></td>
          <td>${v.type}</td>
          <td class="font-mono font-semibold" style="color: var(--color-hi);">${valStr}</td>
          <td class="font-mono" style="color: var(--text-muted); font-size: 0.8rem;">[${lbStr}, ${ubStr}]</td>
          <td class="font-mono" style="color: var(--text-muted); font-size: 0.8rem;">${rcStr}</td>
        </tr>
      `;
      })
      .join("");

    if (bVars.length > 0) {
      rowsHtml += bVars
        .map((bv) => {
          const val = currentModel!.values.get(bv.name);
          return `
          <tr>
            <td><strong>${bv.name}</strong></td>
            <td>Boolean</td>
            <td class="font-mono font-semibold" style="color: ${val ? "var(--color-seiji)" : "var(--text-muted)"};">
              ${val ? "true (1)" : "false (0)"}
            </td>
            <td class="font-mono" style="color: var(--text-muted); font-size: 0.8rem;">[0, 1]</td>
            <td class="font-mono" style="color: var(--text-muted); font-size: 0.8rem;">--</td>
          </tr>
        `;
        })
        .join("");
    }

    if (isTruncated) {
      rowsHtml += `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">... Showing first 500 variables (${vars.length} total) ...</td></tr>`;
    }

    varsTableBody.innerHTML = rowsHtml;
  }

  filterNonZero.addEventListener("change", renderVariablesTable);

  function renderVisualizer() {
    if (!currentModel || currentModel.status === "Infeasible" || currentModel.status === "Unsat") {
      visualizerContainer.innerHTML = `<p style="color: var(--text-sumi-muted); font-size: 0.85rem; padding: 12px 0;">No primal feasible solution to display.</p>`;
      return;
    }

    // Default clean Decision Variables Summary cards
    const vars = currentModel.variables || [];
    const nonZeroVars = vars.filter((v) => (v.value ?? 0) > 1e-5);

    if (nonZeroVars.length === 0) {
      visualizerContainer.innerHTML = `<p style="color: var(--text-sumi-muted); font-size: 0.85rem;">All variables evaluated to 0.</p>`;
      return;
    }

    // Determine if variables look like proportions (sum close to 1) or counts
    const totalVal = nonZeroVars.reduce((sum, v) => sum + (v.value || 0), 0);
    const isProportion = Math.abs(totalVal - 1.0) < 1e-3;

    const colors = ["#C23B22", "#1E3A5F", "#237A4B", "#B45309", "#582F6E", "#0F766E"];

    const cardsHtml = nonZeroVars
      .slice(0, 12)
      .map((v, i) => {
        const val = v.value || 0;
        const color = colors[i % colors.length];
        const valStr = isProportion
          ? `${(val * 100).toFixed(1)}%`
          : Number(val.toFixed(2)).toLocaleString();

        const pct = isProportion ? (val * 100).toFixed(1) : Math.min(100, Math.round((val / totalVal) * 100));

        return `
          <div style="background: var(--bg-surface); border: 1px solid var(--border-washi); border-radius: var(--radius-sm); padding: 10px 14px; min-width: 140px; flex: 1 1 140px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
              <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-sumi-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${v.name}
              </span>
              <span style="font-family: var(--font-mono); font-size: 1rem; font-weight: 700; color: ${color};">
                ${valStr}
              </span>
            </div>
            <div style="width: 100%; height: 6px; background: var(--border-subtle); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
            </div>
          </div>
        `;
      })
      .join("");

    visualizerContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <div style="font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-sumi-muted);">
          ${getLocale() === "ja" ? "主要決定変数の最適値サマリー" : "Optimal Decision Variables Summary"}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; width: 100%;">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  // Button Listeners
  runBtn.addEventListener("click", runOptimization);

  genLpBtn.addEventListener("click", async () => {
    const result = await executeModelCode(codeTextarea.value);
    if (result.model) {
      lpOutput.textContent = result.model.toLpString();
      showTab("tab-lp");
    } else {
      alert("Please ensure the code creates a Model.");
    }
  });

  resetBtn.addEventListener("click", () => {
    loadPreset(presetSelect.value);
  });

  // Initialize internationalization locale
  const initialLoc = initLocale();
  applyLocale(initialLoc);

  // Parse preset from URL query parameter if present
  const urlParams = new URLSearchParams(window.location.search);
  const requestedPreset = urlParams.get("preset");
  const targetPreset = EXAMPLES.some((e) => e.id === requestedPreset)
    ? requestedPreset!
    : "production";

  loadPreset(targetPreset);

  // Auto-run first example after brief delay
  setTimeout(() => {
    runOptimization();
  }, 100);
}
