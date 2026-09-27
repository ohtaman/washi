import { EXAMPLES } from "../examples/index.js";
import { executeModelCode } from "./runner.js";
import { DOCS_HTML } from "./docs.js";
import type { Model } from "../modeler/model.js";

export function initApp() {
  const codeTextarea = document.getElementById("code-editor") as HTMLTextAreaElement;
  const lineNumbers = document.getElementById("line-numbers") as HTMLDivElement;
  const presetSelect = document.getElementById("preset-select") as HTMLSelectElement;
  const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
  const genLpBtn = document.getElementById("gen-lp-btn") as HTMLButtonElement;
  const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;

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

  if (docsContainer) {
    docsContainer.innerHTML = DOCS_HTML;
  }

  let currentModel: Model | null = null;
  let currentVisualizerType: string = "production";

  // Populate presets
  presetSelect.innerHTML = "";
  EXAMPLES.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex.id;
    opt.textContent = `[${ex.category}] ${ex.title}`;
    presetSelect.appendChild(opt);
  });

  function updateLineNumbers() {
    const lines = codeTextarea.value.split("\n").length;
    let numbers = "";
    for (let i = 1; i <= lines; i++) {
      numbers += `${i}\n`;
    }
    lineNumbers.textContent = numbers;
  }

  function loadPreset(id: string) {
    const example = EXAMPLES.find((ex) => ex.id === id) || EXAMPLES[0];
    codeTextarea.value = example.code;
    currentVisualizerType = example.visualizer || "table";
    updateLineNumbers();
  }

  // Preset switch
  presetSelect.addEventListener("change", () => {
    loadPreset(presetSelect.value);
  });

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
    runBtn.disabled = true;
    runBtn.textContent = "Solving with HiGHS...";
    metricStatus.textContent = "Solving...";
    metricStatus.className = "metric-value";

    try {
      const result = await executeModelCode(codeTextarea.value);

      if (!result.success) {
        metricStatus.textContent = "Error";
        metricStatus.className = "metric-value status-infeasible";
        logOutput.textContent = `Execution Error:\n${result.error}\n\nConsole logs:\n${result.logs.join("\n")}`;
        showTab("tab-logs");
        return;
      }

      currentModel = result.model || null;

      // Update metrics
      const status = currentModel?.status || "Optimal";
      metricStatus.textContent = status;
      metricStatus.className = `metric-value status-${status.toLowerCase()}`;

      const objVal = currentModel?.objectiveValue;
      metricObj.textContent = objVal !== null && objVal !== undefined ? Number(objVal).toFixed(4).replace(/\.?0+$/, "") : "--";

      metricTime.textContent = result.runTime ? `${(result.runTime * 1000).toFixed(1)} ms` : "--";
      metricVars.textContent = String(currentModel?.numVars ?? 0);

      // Render logs
      logOutput.textContent = result.logs.length > 0 ? result.logs.join("\n") : "Solve completed successfully with no warnings.";

      // Render LP String (avoid freezing DOM if model has tens of thousands of variables)
      if (currentModel) {
        if (currentModel.numVars > 5000) {
          lpOutput.textContent = `// 大規模モデル（決定変数: ${currentModel.numVars.toLocaleString()}個, 制約: ${currentModel.numConstrs.toLocaleString()}本）\n// ブラウザの描画負荷を抑えるため自動プレビューを省略しています。\n// 完全な LP 文字列は「LP 表示」ボタンまたは model.toLpString() で取得できます。`;
        } else {
          lpOutput.textContent = currentModel.toLpString();
        }
      }

      // Render variables table & visualizer
      renderVariablesTable();
      renderVisualizer();

      showTab("tab-results");
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "▶ Run Optimization";
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

    if (vars.length === 0) {
      varsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No matching variables.</td></tr>`;
      return;
    }

    const MAX_DISPLAY = 500;
    const isTruncated = vars.length > MAX_DISPLAY;
    const displayVars = isTruncated ? vars.slice(0, MAX_DISPLAY) : vars;

    let rowsHtml = displayVars
      .map((v) => {
        const valStr = v.value !== null ? v.value.toFixed(4).replace(/\.?0+$/, "") : "--";
        const rcStr = v.reducedCost !== null ? v.reducedCost.toFixed(4).replace(/\.?0+$/, "") : "--";
        const lbStr = v.lb === -Infinity ? "-∞" : String(v.lb);
        const ubStr = v.ub === Infinity ? "+∞" : String(v.ub);

        return `
        <tr>
          <td><strong>${v.name}</strong></td>
          <td>${v.type}</td>
          <td class="val-highlight">${valStr}</td>
          <td>[${lbStr}, ${ubStr}]</td>
          <td>${rcStr}</td>
        </tr>
      `;
      })
      .join("");

    if (isTruncated) {
      rowsHtml += `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-sumi-muted); font-size: 0.8rem; padding: 12px; background: var(--bg-washi);">
            … 全 ${vars.length.toLocaleString()} 変数のうち先頭 ${MAX_DISPLAY} 件を表示中（「非ゼロ変数のみ表示」をチェックすると絞り込めます）
          </td>
        </tr>
      `;
    }

    varsTableBody.innerHTML = rowsHtml;
  }

  filterNonZero.addEventListener("change", renderVariablesTable);

  function renderVisualizer() {
    if (!currentModel) {
      visualizerContainer.innerHTML = "";
      return;
    }

    if (currentVisualizerType === "nqueens") {
      renderNQueensBoard();
    } else if (currentVisualizerType === "knapsack") {
      renderKnapsackCards();
    } else if (currentVisualizerType === "production") {
      renderProductionCards();
    } else if (currentVisualizerType === "nurse") {
      renderNurseRoster();
    } else if (currentVisualizerType === "supply-chain") {
      renderSupplyChainSummary();
    } else {
      visualizerContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">Standard tabular representation in table below.</p>`;
    }
  }

  function renderNurseRoster() {
    const nurses = ["Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona", "George", "Hannah", "Ian", "Julia"];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const shifts = ["D", "E", "N"];

    let html = `
      <div style="width: 100%; overflow-x: auto;">
        <div style="margin-bottom: 10px; font-size: 0.76rem; display: flex; gap: 16px; color: var(--text-sumi-secondary);">
          <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-block;width:9px;height:9px;background:#1e3a5f;border-radius:2px;"></span>D: 日勤 (8:00-16:00)</span>
          <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-block;width:9px;height:9px;background:#b45309;border-radius:2px;"></span>E: 準夜勤 (16:00-0:00)</span>
          <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-block;width:9px;height:9px;background:#582f6e;border-radius:2px;"></span>N: 夜勤 (0:00-8:00)</span>
          <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-block;width:9px;height:9px;background:#dcd7cd;border-radius:2px;"></span>-: 休日 (Off)</span>
        </div>
        <table class="nurse-roster-table" style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: center;">
          <thead>
            <tr style="background: var(--bg-washi); border-bottom: 1px solid var(--border-washi);">
              <th style="padding: 7px 12px; text-align: left; font-weight:600; color:var(--text-sumi-secondary);">ナース</th>
              ${days.map(d => `<th style="padding: 7px 8px; font-weight:600; color:var(--text-sumi-secondary);">${d}</th>`).join("")}
              <th style="padding: 7px 8px; font-weight:600; color:var(--text-sumi-secondary);">勤務日数</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const n of nurses) {
      let count = 0;
      const cells = days.map(d => {
        let assigned = "-";
        for (const s of shifts) {
          const v = currentModel?.getVarByName(`x_${n}_${d}_${s}`);
          if (v && Math.round(v.value ?? 0) === 1) {
            assigned = s;
            count++;
            break;
          }
        }

        let bg = "transparent";
        let color = "var(--text-sumi-muted)";
        if (assigned === "D") { bg = "rgba(30, 58, 95, 0.08)"; color = "var(--color-ai)"; }
        else if (assigned === "E") { bg = "rgba(180, 83, 9, 0.1)"; color = "var(--color-amber)"; }
        else if (assigned === "N") { bg = "rgba(88, 47, 110, 0.12)"; color = "#582f6e"; }

        return `
          <td style="padding: 6px 6px; border-bottom: 1px solid var(--border-subtle);">
            <span style="display:inline-block; width:26px; height:24px; line-height:24px; border-radius:3px; font-weight:600; font-family:var(--font-mono); background:${bg}; color:${color};">
              ${assigned}
            </span>
          </td>
        `;
      }).join("");

      html += `
        <tr>
          <td style="padding: 7px 12px; text-align: left; font-weight: 500; border-bottom: 1px solid var(--border-subtle);">
            ${n}
          </td>
          ${cells}
          <td style="padding: 7px 8px; font-weight: 600; font-family:var(--font-mono); color: var(--color-hi); border-bottom: 1px solid var(--border-subtle);">
            ${count}日
          </td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
    visualizerContainer.innerHTML = html;
  }

  function renderNQueensBoard() {
    const N = 8;
    let html = `<div class="chessboard">`;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const isLight = (r + c) % 2 === 0;
        const v = currentModel?.getVarByName(`q_${r}_${c}`);
        const hasQueen = v && Math.round(v.value ?? 0) === 1;
        html += `<div class="chess-cell ${isLight ? "light" : "dark"} ${hasQueen ? "has-queen" : ""}">
          ${hasQueen ? "♛" : ""}
        </div>`;
      }
    }
    html += `</div>`;
    visualizerContainer.innerHTML = html;
  }

  function renderKnapsackCards() {
    const vars = currentModel?.variables || [];
    let html = `<div class="knapsack-grid">`;
    for (const v of vars) {
      const isPacked = Math.round(v.value ?? 0) === 1;
      html += `
        <div class="item-badge ${isPacked ? "packed" : ""}">
          <div class="name">${v.name}</div>
          <div class="specs">${isPacked ? "採用 (Packed)" : "除外"}</div>
        </div>
      `;
    }
    html += `</div>`;
    visualizerContainer.innerHTML = html;
  }

  function renderProductionCards() {
    const vars = currentModel?.variables || [];
    let html = `<div style="display: flex; gap: 14px; flex-wrap: wrap;">`;
    for (const v of vars) {
      html += `
        <div style="background: var(--bg-washi); padding: 12px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-washi); display: flex; flex-direction: column; gap: 4px; min-width: 140px;">
          <span style="font-size: 0.76rem; color: var(--text-sumi-muted);">${v.name}</span>
          <span style="font-family: var(--font-mono); font-size: 1.35rem; font-weight: 600; color: var(--color-hi);">
            ${v.value !== null ? v.value : 0} 個
          </span>
        </div>
      `;
    }
    html += `</div>`;
    visualizerContainer.innerHTML = html;
  }

  function renderSupplyChainSummary() {
    if (!currentModel) return;
    const openedWarehouses: Array<{ id: number; shipped: number }> = [];
    let totalShipped = 0;

    for (let w = 0; w < 50; w++) {
      const yw = currentModel.getVarByName(`y_${w}`);
      const isOpen = yw && Math.round(yw.value ?? 0) === 1;
      let shippedFromW = 0;
      for (let c = 0; c < 400; c++) {
        const xwc = currentModel.getVarByName(`x_${w}_${c}`);
        if (xwc && (xwc.value ?? 0) > 1e-4) {
          shippedFromW += xwc.value!;
        }
      }
      if (isOpen) {
        openedWarehouses.push({ id: w, shipped: Math.round(shippedFromW) });
        totalShipped += shippedFromW;
      }
    }

    openedWarehouses.sort((a, b) => b.shipped - a.shipped);

    let html = `
      <div style="display: flex; flex-direction: column; gap: 14px; width: 100%;">
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <div style="background: var(--bg-washi); padding: 12px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-washi); min-width: 150px;">
            <div style="font-size: 0.76rem; color: var(--text-sumi-muted);">開設拠点数</div>
            <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 600; color: var(--color-hi);">
              ${openedWarehouses.length} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-sumi-secondary);">/ 50 拠点</span>
            </div>
          </div>
          <div style="background: var(--bg-washi); padding: 12px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-washi); min-width: 150px;">
            <div style="font-size: 0.76rem; color: var(--text-sumi-muted);">総配送出荷量</div>
            <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 600; color: var(--color-ai);">
              ${Math.round(totalShipped).toLocaleString()} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-sumi-secondary);">個</span>
            </div>
          </div>
          <div style="background: var(--bg-washi); padding: 12px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-washi); min-width: 150px;">
            <div style="font-size: 0.76rem; color: var(--text-sumi-muted);">需要充足率</div>
            <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 600; color: var(--color-evergreen);">
              100.0%
            </div>
          </div>
        </div>

        <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-sumi); margin-top: 4px;">
          稼働物流拠点トップ 8（総出荷量順）:
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px;">
          ${openedWarehouses.slice(0, 8).map(wh => `
            <div style="background: var(--bg-panel); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-sm);">
              <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-sumi);">拠点 #${wh.id}</div>
              <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-hi); font-weight: 600;">${wh.shipped.toLocaleString()} 個</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
    visualizerContainer.innerHTML = html;
  }

  // Button Listeners
  runBtn.addEventListener("click", runOptimization);

  genLpBtn.addEventListener("click", async () => {
    const result = await executeModelCode(codeTextarea.value);
    if (result.model) {
      lpOutput.textContent = result.model.toLpString();
      showTab("tab-lp");
    } else {
      alert("Please ensure the code creates a Model or LpProblem.");
    }
  });

  resetBtn.addEventListener("click", () => {
    loadPreset(presetSelect.value);
  });

  // Initial load
  loadPreset("production");
  presetSelect.value = "production";

  // Auto-run first example after brief delay
  setTimeout(() => {
    runOptimization();
  }, 100);
}
