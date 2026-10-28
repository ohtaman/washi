import {
  ALL_STAFF_ATTRIBUTE_DEF,
  applyContractPresetToNurse,
  applyShiftTransitionToConfig,
  clearNurseContractFromState,
  CONTRACT_PRESETS,
  createDefaultShiftAliases,
  doesNurseMatchAttribute,
  doesNurseSatisfySkill,
  getEffectiveIncludedAliases,
  getJapaneseHolidayName,
  getShiftMeta,
  getShiftTransitionMatrix,
  getSkillMeta,
  reconcileCellRulesForPin,
  removeCustomShiftFromState,
  resolveDaysBySelector,
  SHIFT_META,
  type ActiveShiftCode,
  type AiShiftTrajectoryExport,
  type ContractPresetId,
  type CustomConstraintRule,
  type CustomShiftDef,
  type HolidayFilterMode,
  type MonthlyScheduleMap,
  type NurseProfile,
  type NurseScheduleConfig,
  type NurseSchedulingState,
  type ScheduleEvaluationReport,
  type ShiftCode,
  type SkillDefinition,
  type TrajectoryTurnRecord,
  type TransitionRuleType,
  type WashiSolveOutcome,
} from "./types";
import {
  createBlankNurseSchedulingState,
  createDefaultConfig,
  createDefaultSkillDefs,
  generateNurseSchedulingState,
  getDayOfWeek,
  injectConflictScenario,
  WEEKDAY_NAMES_JA,
} from "./generator";
import {
  exportNursesCsv,
  exportRelationsCsv,
  exportRequestsCsv,
  getSampleNursesCsv,
  getSampleRelationsCsv,
  getSampleRequestsCsv,
  parseNursesCsv,
  parseRelationsCsv,
  parseRequestsCsv,
  validateNurseDataset,
} from "./csv-handler";
import {
  diagnoseNurseScheduleWithHiGHS,
  evaluateNurseSchedule,
  generateWashiCodePreview,
  getPrevMonthTailWorkStreak,
  solveNurseScheduleWithWashi,
} from "./solver";
import {
  applyChatOperationsToState,
  checkGeminiNanoAvailability,
  createGeminiNanoManager,
  type GeminiNanoStatus,
} from "./nano-client";

// Application State - Start in blank slate mode (empty nurses and schedule until generated or CSV-imported)
let currentSeed = 202611;
let appState: NurseSchedulingState = createBlankNurseSchedulingState();
let currentSchedule: MonthlyScheduleMap | null = null;
let currentEvaluation: ScheduleEvaluationReport | null = null;
let lastSolveOutcome: WashiSolveOutcome | null = null;

// Pending CSV staging objects
let pendingCsvNurses: NurseProfile[] | null = null;
let pendingCsvRequests: ShiftPreference[] | null = null;
let pendingCsvRelations: PairRelation[] | null = null;

// Single-flight solver concurrency & cancellation state
let isSolving = false;
let pendingSolveRequested = false;
let activeSolveAbortController: AbortController | null = null;
let activeSolvePromise: Promise<WashiSolveOutcome | null> | null = null;
let activeChatAbortController: AbortController | null = null;
let selectedCellContext: { nurseId: string; day: number } | null = null;
let editingContractNurseId: string | null = null;

const nanoManager = createGeminiNanoManager();
const trajectoryTurns: TrajectoryTurnRecord[] = [];

function buildTrajectoryExport(): AiShiftTrajectoryExport {
  return {
    exportedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    nanoStatus: nanoManager.getStatus(),
    turnCount: trajectoryTurns.length,
    currentStateSummary: {
      config: { ...appState.config },
      customShiftDefs: [...(appState.customShiftDefs ?? [])],
      customRules: [...appState.customRules],
    },
    turns: trajectoryTurns,
  };
}

function syncTrajectoryUI(): void {
  const payload = buildTrajectoryExport();
  if (typeof window !== "undefined") {
    (window as any).__WASHI_AI_SHIFT_TRAJECTORY__ = payload;
  }
  const badgeEl = document.getElementById("badge-trajectory-count");
  if (badgeEl) {
    badgeEl.textContent = String(trajectoryTurns.length);
    badgeEl.hidden = trajectoryTurns.length === 0;
  }
  const previewEl = document.getElementById("trajectory-json-preview");
  if (previewEl) {
    previewEl.textContent = JSON.stringify(payload, null, 2);
  }
}

// Helper to safely query DOM elements
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return el as T;
}

function switchTab(tabName: "schedule" | "constraints" | "staff"): void {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>(".results-tab-btn");
  tabBtns.forEach((b) => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  for (const panelId of ["schedule", "constraints", "staff"]) {
    const panel = $(`tab-panel-${panelId}`);
    panel.hidden = panelId !== tabName;
  }
}

// ==================== SAFE MARKDOWN DOM RENDERER (STRICTLY textContent, NEVER innerHTML) ====================
function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  // Tokenize inline code (`...`), bold+italic (***...***), bold (**...**), and italic (*...*)
  const tokenRegex = /(`[^`\n]+`|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parent.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      const codeEl = document.createElement("code");
      codeEl.className = "md-inline-code";
      codeEl.textContent = token.slice(1, -1);
      parent.appendChild(codeEl);
    } else if (token.startsWith("***") && token.endsWith("***")) {
      const strongEl = document.createElement("strong");
      const emEl = document.createElement("em");
      emEl.textContent = token.slice(3, -3);
      strongEl.appendChild(emEl);
      parent.appendChild(strongEl);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      const strongEl = document.createElement("strong");
      strongEl.textContent = token.slice(2, -2);
      parent.appendChild(strongEl);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      const emEl = document.createElement("em");
      emEl.textContent = token.slice(1, -1);
      parent.appendChild(emEl);
    } else {
      parent.appendChild(document.createTextNode(token));
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

export function renderSafeMarkdown(container: HTMLElement, markdown: string): void {
  container.replaceChildren();
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();

    // Skip blank lines between blocks
    if (trimmed === "") {
      i++;
      continue;
    }

    // 1. Fenced code block: ```...```
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const preEl = document.createElement("pre");
      preEl.className = "md-code-block";
      const codeEl = document.createElement("code");
      codeEl.textContent = codeLines.join("\n");
      preEl.appendChild(codeEl);
      container.appendChild(preEl);
      continue;
    }

    // 2. Horizontal rule: --- or ***
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      const hrEl = document.createElement("hr");
      hrEl.className = "md-hr";
      container.appendChild(hrEl);
      i++;
      continue;
    }

    // 3. Heading: # .. ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length);
      const hEl = document.createElement(`h${level}`);
      hEl.className = "md-heading";
      appendInlineMarkdown(hEl, headingMatch[2]);
      container.appendChild(hEl);
      i++;
      continue;
    }

    // 4. Markdown Pipe Table
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|$/.test((lines[i + 1] ?? "").trim())
    ) {
      const parseCells = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseCells(trimmed);
      i += 2; // skip header + separator

      const tableEl = document.createElement("table");
      tableEl.className = "md-table";
      const theadEl = document.createElement("thead");
      const trHead = document.createElement("tr");
      for (const h of headers) {
        const th = document.createElement("th");
        appendInlineMarkdown(th, h);
        trHead.appendChild(th);
      }
      theadEl.appendChild(trHead);
      tableEl.appendChild(theadEl);

      const tbodyEl = document.createElement("tbody");
      while (i < lines.length) {
        const rowLine = (lines[i] ?? "").trim();
        if (!rowLine.startsWith("|") || !rowLine.endsWith("|")) break;
        const cells = parseCells(rowLine);
        const tr = document.createElement("tr");
        for (const c of cells) {
          const td = document.createElement("td");
          appendInlineMarkdown(td, c);
          tr.appendChild(td);
        }
        tbodyEl.appendChild(tr);
        i++;
      }
      tableEl.appendChild(tbodyEl);
      container.appendChild(tableEl);
      continue;
    }

    // 5. Unordered list: -, *, +, or ・
    if (/^(?:[-*+]\s+|・\s*)(.+)$/.test(trimmed)) {
      const ulEl = document.createElement("ul");
      ulEl.className = "md-list";
      while (i < lines.length) {
        const itemLine = (lines[i] ?? "").trim();
        const m = itemLine.match(/^(?:[-*+]\s+|・\s*)(.+)$/);
        if (!m) break;
        const liEl = document.createElement("li");
        appendInlineMarkdown(liEl, m[1]);
        ulEl.appendChild(liEl);
        i++;
      }
      container.appendChild(ulEl);
      continue;
    }

    // 6. Ordered list: 1. 2. etc.
    if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      const olEl = document.createElement("ol");
      olEl.className = "md-list";
      while (i < lines.length) {
        const itemLine = (lines[i] ?? "").trim();
        const m = itemLine.match(/^\d+\.\s+(.+)$/);
        if (!m) break;
        const liEl = document.createElement("li");
        appendInlineMarkdown(liEl, m[1]);
        olEl.appendChild(liEl);
        i++;
      }
      container.appendChild(olEl);
      continue;
    }

    // 7. Blockquote: > ...
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quoteLines.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      const bqEl = document.createElement("blockquote");
      bqEl.className = "md-quote";
      appendInlineMarkdown(bqEl, quoteLines.join("\n"));
      container.appendChild(bqEl);
      continue;
    }

    // 8. Regular paragraph (accumulate consecutive plain lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      const t = l.trim();
      if (
        t === "" ||
        t.startsWith("```") ||
        t.startsWith(">") ||
        /^(#{1,4})\s+/.test(t) ||
        /^(?:[-*+]\s+|・\s*)/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(t)
      ) {
        break;
      }
      paraLines.push(l);
      i++;
    }
    const pEl = document.createElement("p");
    pEl.className = "md-p";
    paraLines.forEach((pLine, idx) => {
      if (idx > 0) pEl.appendChild(document.createElement("br"));
      appendInlineMarkdown(pEl, pLine);
    });
    container.appendChild(pEl);
  }
}

// ==================== CHAT LOG HELPERS (STRICTLY textContent FOR LLM OUTPUT) ====================
function appendChatMessage(params: {
  role: "user" | "assistant" | "system";
  senderLabel: string;
  initialText: string;
  appliedSummaries?: string[];
}): { bodyEl: HTMLElement; opsContainerEl: HTMLElement; wrapperEl: HTMLElement } {
  const container = $("chat-messages");
  const msgEl = document.createElement("div");
  msgEl.className = `chat-msg chat-msg-${params.role}`;

  const headerEl = document.createElement("div");
  headerEl.className = "chat-msg-header";
  const senderSpan = document.createElement("span");
  senderSpan.textContent = params.senderLabel;
  const timeSpan = document.createElement("span");
  const now = new Date();
  timeSpan.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  headerEl.append(senderSpan, timeSpan);

  const bodyEl = document.createElement("div");
  bodyEl.className = "chat-msg-body";
  // NEVER use innerHTML for user or LLM output — renderSafeMarkdown builds DOM nodes with textContent
  renderSafeMarkdown(bodyEl, params.initialText);

  const opsContainerEl = document.createElement("div");
  opsContainerEl.className = "chat-applied-ops";
  if (!params.appliedSummaries || params.appliedSummaries.length === 0) {
    opsContainerEl.hidden = true;
  } else {
    renderAppliedSummariesInto(opsContainerEl, params.appliedSummaries);
  }

  msgEl.append(headerEl, bodyEl, opsContainerEl);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  return { bodyEl, opsContainerEl, wrapperEl: msgEl };
}

function renderAppliedSummariesInto(
  container: HTMLElement,
  summaries: string[],
  activeStepLabel?: string
): void {
  container.replaceChildren();
  if (summaries.length === 0 && !activeStepLabel) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  for (const s of summaries) {
    const item = document.createElement("div");
    item.className = "chat-op-pill";
    const hasIconPrefix =
      s.startsWith("🧭") ||
      s.startsWith("🛠️") ||
      s.startsWith("⚡") ||
      s.startsWith("✅") ||
      s.startsWith("Turn ");
    item.textContent = hasIconPrefix ? s : `✓ ${s}`;
    container.appendChild(item);
  }
  if (activeStepLabel) {
    const activeEl = document.createElement("div");
    activeEl.className = "chat-op-pill chat-op-pill-active";
    activeEl.textContent = activeStepLabel;
    container.appendChild(activeEl);
  }
}

// ==================== GEMINI NANO STATUS UI ====================
function updateNanoStatusUI(status: GeminiNanoStatus | "checking", progressPct?: number): void {
  const badge = $("nano-status-badge");
  const unavailBanner = $("nano-unavailable-banner");
  const dlWrap = $("nano-download-bar-wrap");
  const dlBar = $("nano-download-bar");
  const dlLabel = $("nano-download-label");

  badge.classList.remove("nano-ready", "nano-downloadable", "nano-checking", "nano-unavailable");

  if (status === "available") {
    badge.classList.add("nano-ready");
    badge.textContent = "🟢 Gemini Nano Ready";
    unavailBanner.hidden = true;
    dlWrap.hidden = true;
  } else if (status === "downloadable" || status === "downloading") {
    badge.classList.add("nano-downloadable");
    badge.textContent = status === "downloading" ? "⏬ モデル取得中" : "🟡 初回送信時ロード";
    unavailBanner.hidden = true;
    if (status === "downloading" && typeof progressPct === "number") {
      dlWrap.hidden = false;
      dlBar.style.width = `${progressPct}%`;
      dlLabel.textContent = `${progressPct}%`;
    } else {
      dlWrap.hidden = true;
    }
  } else if (status === "checking") {
    badge.classList.add("nano-checking");
    badge.textContent = "⏳ 確認中";
    dlWrap.hidden = true;
  } else {
    badge.classList.add("nano-unavailable");
    badge.textContent = "⚪ Gemini Nano 未有効";
    unavailBanner.hidden = false;
    dlWrap.hidden = true;
  }
}

async function checkAndInitNano(triggerWarmup = false): Promise<GeminiNanoStatus> {
  updateNanoStatusUI("checking");
  const status = await checkGeminiNanoAvailability();
  updateNanoStatusUI(status);

  if (triggerWarmup && (status === "available" || status === "downloadable")) {
    try {
      const finalStatus = await nanoManager.initialize((pct) => {
        updateNanoStatusUI("downloading", pct);
      });
      updateNanoStatusUI(finalStatus);
      return finalStatus;
    } catch {
      updateNanoStatusUI(nanoManager.getStatus());
      return nanoManager.getStatus();
    }
  }
  return status;
}

// ==================== RIGHT PANE: CLEAN STATUS BAR & CONFLICT ALERT ====================
function renderStatusAndConflictBar(): void {
  const statusBadge = $("kpi-status-badge");
  const summaryTextEl = $("kpi-summary-text");
  const solveTimeEl = $("kpi-solve-time");
  const abortSolveBtn = $("btn-abort-solve");
  const solveBtn = $("btn-solve-washi") as HTMLButtonElement;

  $("badge-staff-count").textContent = String(appState.nurses.length);

  const activeCustomCount = appState.customRules.filter((r) => r.enabled).length;
  const customBadge = $("badge-custom-rules");
  customBadge.textContent = String(activeCustomCount);
  customBadge.hidden = activeCustomCount === 0;

  statusBadge.classList.remove("status-optimal", "status-infeasible", "status-solving", "status-idle");

  if (isSolving) {
    statusBadge.classList.add("status-solving");
    statusBadge.textContent = "⏳ 計算中...";
    summaryTextEl.textContent = "WaSHI (HiGHS) で1ヶ月のシフトを計算しています...";
    abortSolveBtn.hidden = false;
    solveBtn.disabled = true;
    return;
  }

  abortSolveBtn.hidden = true;
  solveBtn.disabled = false;

  if (appState.nurses.length === 0) {
    statusBadge.classList.add("status-idle");
    statusBadge.textContent = "白紙モード";
    summaryTextEl.textContent = "スタッフデータが未登録です。「✨ サンプル生成」または「📂 CSV読込」を行ってください";
    solveTimeEl.textContent = "-- ms";
    return;
  }

  if (!lastSolveOutcome) {
    statusBadge.classList.add("status-idle");
    statusBadge.textContent = "準備完了";
    summaryTextEl.textContent = `${appState.nurses.length}名のデータが読み込まれています。「⚡ シフトを自動作成」を押して最適化してください`;
    solveTimeEl.textContent = "-- ms";
    return;
  }

  solveTimeEl.textContent = `${lastSolveOutcome.solveTimeMs} ms`;

  if (lastSolveOutcome.status === "Optimal" || lastSolveOutcome.status === "Feasible") {
    statusBadge.classList.add("status-optimal");
    statusBadge.textContent = "✅ シフト作成完了";
    const softRate = currentEvaluation?.softRequestSatisfactionRate ?? 100;
    const vCount = currentEvaluation?.violations.length ?? 0;
    const diff = lastSolveOutcome.diffFromPrevious;
    const diffSuffix =
      diff && diff.totalCells > 0
        ? ` ｜ 🔒 前回から ${diff.changedCellsCount}/${diff.totalCells}マス変更 (維持率 ${diff.retentionRatePct}%)`
        : "";
    summaryTextEl.textContent =
      vCount === 0
        ? `${appState.nurses.length}名×${appState.config.numDays}日間 ｜ ルール違反 0件 ｜ 希望達成率 ${softRate}%${diffSuffix}`
        : `${appState.nurses.length}名×${appState.config.numDays}日間 ｜ ⚠️ 手動固定による注意 ${vCount}件${diffSuffix}`;
  } else if (lastSolveOutcome.status === "Infeasible") {
    statusBadge.classList.add("status-infeasible");
    statusBadge.textContent = "🚨 シフト作成不可 (矛盾あり)";
    summaryTextEl.textContent = `条件が衝突しているためシフトを組めません（原因 ${lastSolveOutcome.conflicts.length}件）`;
  } else {
    statusBadge.classList.add("status-idle");
    statusBadge.textContent = "⏹ 中断 / 未完了";
    summaryTextEl.textContent = lastSolveOutcome.errorMessage || "計算が中断されました";
  }

  // Conflict Alert Box
  const conflictBanner = $("conflict-alert");
  const conflictList = $("conflict-list");
  conflictList.replaceChildren();

  if (lastSolveOutcome.status === "Infeasible" && lastSolveOutcome.conflicts.length > 0) {
    conflictBanner.hidden = false;
    for (const c of lastSolveOutcome.conflicts.slice(0, 8)) {
      const li = document.createElement("li");
      li.textContent = c.relaxSuggestion
        ? `${c.labelJa} ➔ 💡 ${c.relaxSuggestion}`
        : c.labelJa;
      conflictList.appendChild(li);
    }
    if (lastSolveOutcome.conflicts.length > 8) {
      const moreLi = document.createElement("li");
      moreLi.textContent = `...他 ${lastSolveOutcome.conflicts.length - 8} 件の関連制約`;
      conflictList.appendChild(moreLi);
    }
  } else {
    conflictBanner.hidden = true;
  }
}

// ==================== TAB 1: CLEAN 1-MONTH SCHEDULE MATRIX RENDERER ====================
function renderScheduleLegend(): void {
  const legendEl = document.getElementById("schedule-legend");
  if (!legendEl) return;
  legendEl.replaceChildren();

  const baseItems: Array<{ code: string; shortLabel: string; label: string; colorClass: string }> = [
    { code: "D", shortLabel: "日", label: "日勤", colorClass: "shift-D" },
    { code: "E", shortLabel: "準", label: "準夜勤", colorClass: "shift-E" },
    { code: "N", shortLabel: "深", label: "深夜勤", colorClass: "shift-N" },
    { code: "O", shortLabel: "休", label: "公休", colorClass: "shift-O" },
  ];
  for (const cs of appState.customShiftDefs ?? []) {
    baseItems.push({
      code: cs.code,
      shortLabel: cs.shortLabel,
      label: cs.label,
      colorClass: "shift-custom",
    });
  }

  for (const item of baseItems) {
    const wrap = document.createElement("span");
    wrap.className = "legend-item";
    const badge = document.createElement("span");
    badge.className = `shift-badge ${item.colorClass}`;
    badge.textContent = item.shortLabel;
    wrap.append(badge, document.createTextNode(` ${item.label}`));
    legendEl.appendChild(wrap);
  }

  const div = document.createElement("span");
  div.className = "legend-divider";
  div.textContent = "|";
  legendEl.appendChild(div);

  const markerItems: Array<{ dotClass: string; text: string }> = [
    { dotClass: "req-dot req-hard-dot", text: " 確定希望" },
    { dotClass: "req-dot req-soft-dot", text: " 希望" },
    { dotClass: "pin-sample-box", text: " 固定中" },
  ];
  const diff = lastSolveOutcome?.diffFromPrevious;
  if (diff && diff.changedCellsCount > 0) {
    markerItems.push({
      dotClass: "diff-sample-box",
      text: ` 前回から変更(${diff.changedCellsCount}マス)`,
    });
  }
  for (const m of markerItems) {
    const wrap = document.createElement("span");
    wrap.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = m.dotClass;
    wrap.append(dot, document.createTextNode(m.text));
    legendEl.appendChild(wrap);
  }
}

function renderScheduleMatrix(): void {
  renderScheduleLegend();
  const thead = $("schedule-thead");
  const tbody = $("schedule-tbody");
  const tfoot = $("schedule-tfoot");
  thead.replaceChildren();
  tbody.replaceChildren();
  tfoot.replaceChildren();

  const emptyStateEl = document.getElementById("empty-schedule-state");
  if (emptyStateEl) {
    emptyStateEl.hidden = appState.nurses.length > 0;
  }
  if (appState.nurses.length === 0) {
    return;
  }

  const { config, nurses, preferences, customRules, customShiftDefs } = appState;
  const numDays = config.numDays;
  const totalPrevLen = nurses[0]?.prevMonthShifts.length ?? 7;
  const showAllPrev = ($("chk-show-all-prev") as HTMLInputElement).checked;
  const highlightDiffEl = document.getElementById("chk-highlight-diff") as HTMLInputElement | null;
  const showDiffHighlight = highlightDiffEl ? highlightDiffEl.checked : true;
  const visiblePrevCount = showAllPrev ? totalPrevLen : Math.min(3, totalPrevLen);
  const prevStartOffset = totalPrevLen - visiblePrevCount;

  const diffCellMap = new Map<string, { prevShift: ShiftCode; nextShift: ShiftCode }>();
  if (showDiffHighlight && lastSolveOutcome?.diffFromPrevious) {
    for (const ch of lastSolveOutcome.diffFromPrevious.changes) {
      diffCellMap.set(`${ch.nurseId}_${ch.day}`, {
        prevShift: ch.prevShift,
        nextShift: ch.nextShift,
      });
    }
  }

  // Lookup maps for fast cell rendering
  const prefMap = new Map<string, { shift: ShiftCode; isHard: boolean; reason: string }>();
  for (const p of preferences) {
    prefMap.set(`${p.nurseId}_${p.day}`, {
      shift: p.shift,
      isHard: p.isHard,
      reason: p.reason,
    });
  }

  const pinMap = new Map<string, CustomConstraintRule>();
  for (const r of customRules) {
    if (
      r.enabled &&
      (r.kind === "pin_shift" || r.kind === "forbid_shift") &&
      r.nurseId &&
      r.day
    ) {
      pinMap.set(`${r.nurseId}_${r.day}`, r);
    }
  }

  const violationCellSet = new Set<string>();
  if (currentEvaluation) {
    for (const v of currentEvaluation.violations) {
      if (v.nurseId && v.day) {
        violationCellSet.add(`${v.nurseId}_${v.day}`);
      }
    }
  }

  // ---- THEAD ROW 1: Group Headers ----
  const trGroup = document.createElement("tr");
  const thNurse = document.createElement("th");
  thNurse.className = "sticky-nurse-col";
  thNurse.rowSpan = 2;
  thNurse.textContent = `スタッフ (${nurses.length}名)`;
  trGroup.appendChild(thNurse);

  const thPrevGroup = document.createElement("th");
  thPrevGroup.colSpan = visiblePrevCount;
  thPrevGroup.className = "prev-month-col prev-month-divider";
  thPrevGroup.textContent = "前月末";
  trGroup.appendChild(thPrevGroup);

  const thCurrGroup = document.createElement("th");
  thCurrGroup.colSpan = numDays;
  thCurrGroup.textContent = `${config.year}年${config.month}月 シフト表（マス目をクリックで固定・変更）`;
  trGroup.appendChild(thCurrGroup);

  const thSummaryGroup = document.createElement("th");
  thSummaryGroup.colSpan = 4;
  thSummaryGroup.textContent = "月間集計・36協定";
  trGroup.appendChild(thSummaryGroup);
  thead.appendChild(trGroup);

  // ---- THEAD ROW 2: Individual Day Headers ----
  const trDays = document.createElement("tr");
  for (let p = prevStartOffset; p < totalPrevLen; p++) {
    const th = document.createElement("th");
    th.className =
      p === totalPrevLen - 1 ? "prev-month-col prev-month-divider" : "prev-month-col";
    th.textContent = p === totalPrevLen - 1 ? "前末" : `前-${totalPrevLen - p}`;
    trDays.appendChild(th);
  }

  for (let d = 1; d <= numDays; d++) {
    const dow = getDayOfWeek(config.year, config.month, d);
    const holidayName = getJapaneseHolidayName(config.year, config.month, d);
    const th = document.createElement("th");
    th.className = `day-col ${dow === 0 || dow === 6 || holidayName ? "day-col-weekend" : ""}`;
    if (holidayName) {
      th.title = `${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}) — 祝日: ${holidayName}`;
    }
    const dayNumDiv = document.createElement("div");
    dayNumDiv.textContent = String(d);
    const dowDiv = document.createElement("div");
    dowDiv.textContent = holidayName ? `${WEEKDAY_NAMES_JA[dow]}·祝` : WEEKDAY_NAMES_JA[dow];
    if (dow === 0 || holidayName) dowDiv.className = "dow-sun";
    else if (dow === 6) dowDiv.className = "dow-sat";
    th.append(dayNumDiv, dowDiv);
    trDays.appendChild(th);
  }

  for (const label of ["夜勤", "公休", "連勤", "36(年)"]) {
    const th = document.createElement("th");
    th.className = "stat-col";
    th.textContent = label;
    trDays.appendChild(th);
  }
  thead.appendChild(trDays);

  // ---- TBODY: Filter & Nurse Rows ----
  const activeSkillDefs = appState.skillDefs ?? createDefaultSkillDefs();
  const roleFilter = ($("filter-role") as HTMLSelectElement).value;
  const filteredNurses = nurses.filter((n) => {
    if (!roleFilter || roleFilter === "all") return true;
    return doesNurseMatchAttribute(n, roleFilter, activeSkillDefs);
  });

  const getNurseDisplayAttributes = (nurse: NurseProfile) => {
    const roleDef = activeSkillDefs.find(
      (sd) => sd.category === "role" && nurse.skills.includes(sd.code)
    );
    const groupDef = activeSkillDefs.find(
      (sd) => sd.category === "group" && nurse.skills.includes(sd.code)
    );
    return {
      roleCode: roleDef?.code ?? "mid",
      roleLabel: roleDef?.label ?? "",
      groupLabel: groupDef?.shortLabel ?? groupDef?.label ?? "",
    };
  };

  for (const nurse of filteredNurses) {
    const tr = document.createElement("tr");

    // Clean Sticky Nurse Cell
    const tdNurse = document.createElement("td");
    tdNurse.className = "sticky-nurse-col";

    const topRow = document.createElement("div");
    topRow.className = "nurse-cell-top";
    const nameSpan = document.createElement("span");
    nameSpan.className = "nurse-name-label";
    nameSpan.textContent = `${nurse.name}${!nurse.nightOk ? " ☀️" : ""}`;

    const { roleCode, roleLabel, groupLabel } = getNurseDisplayAttributes(nurse);
    const roleSpan = document.createElement("span");
    roleSpan.className = `role-pill role-${roleCode}`;
    roleSpan.textContent = roleLabel;
    topRow.append(nameSpan, roleSpan);

    const tailStreak = getPrevMonthTailWorkStreak(nurse.prevMonthShifts, customShiftDefs);
    tdNurse.title = `${nurse.id} ${nurse.name} (${groupLabel ? `${groupLabel} / ` : ""}${roleLabel})\n前月末: ${tailStreak}連勤\n直近11ヶ月残業累計: ${nurse.yearly36Stats.prev11MonthsOvertimeHours}h`;
    tdNurse.appendChild(topRow);
    tr.appendChild(tdNurse);

    // Previous Month Carryover Cells
    for (let p = prevStartOffset; p < totalPrevLen; p++) {
      const tdPrev = document.createElement("td");
      tdPrev.className =
        p === totalPrevLen - 1 ? "prev-month-col prev-month-divider" : "prev-month-col";
      const s = nurse.prevMonthShifts[p] ?? "O";
      const sMeta = getShiftMeta(s, customShiftDefs);
      const badge = document.createElement("span");
      badge.className = `shift-badge shift-${sMeta.colorKey} shift-prev-badge`;
      badge.textContent = sMeta.shortLabel;
      badge.title = `${nurse.name} 前月(${p - totalPrevLen}日目): ${sMeta.label}`;
      tdPrev.appendChild(badge);
      tr.appendChild(tdPrev);
    }

    // Current Month 30 Days Cells
    const rowShifts = currentSchedule?.[nurse.id] ?? [];
    for (let d = 1; d <= numDays; d++) {
      const dow = getDayOfWeek(config.year, config.month, d);
      const holidayName = getJapaneseHolidayName(config.year, config.month, d);
      const td = document.createElement("td");
      td.className = `day-col ${dow === 0 || dow === 6 || holidayName ? "day-col-weekend" : ""}`;

      const shift: ShiftCode = rowShifts[d - 1] ?? "O";
      const shiftMeta = getShiftMeta(shift, customShiftDefs);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `shift-cell-btn shift-${shiftMeta.colorKey}`;
      btn.textContent = shiftMeta.shortLabel;

      const key = `${nurse.id}_${d}`;
      const pref = prefMap.get(key);
      const pin = pinMap.get(key);
      const hasViolation = violationCellSet.has(key);

      const tooltipParts: string[] = [
        `${nurse.name} — ${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}${
          holidayName ? `・祝日:${holidayName}` : ""
        }): ${shiftMeta.label}`,
      ];

      if (pref) {
        const prefMeta = getShiftMeta(pref.shift, customShiftDefs);
        const dot = document.createElement("span");
        dot.className = `cell-marker-dot ${pref.isHard ? "req-hard-dot" : "req-soft-dot"}`;
        btn.appendChild(dot);
        tooltipParts.push(
          `${pref.isHard ? "【確定希望】" : "【希望】"}${prefMeta.label} (${pref.reason})`
        );
      }

      if (pin) {
        btn.classList.add("cell-pinned-outline");
        tooltipParts.push(`📌 ${pin.description}`);
      }

      const diffEntry = diffCellMap.get(key);
      if (diffEntry) {
        btn.classList.add("cell-diff-changed");
        const prevMeta = getShiftMeta(diffEntry.prevShift, customShiftDefs);
        tooltipParts.push(
          `🔄 前回から変更: ${prevMeta.label}(${prevMeta.shortLabel}) ➔ ${shiftMeta.label}(${shiftMeta.shortLabel})`
        );
      }

      if (hasViolation) {
        btn.classList.add("cell-violation-outline");
        tooltipParts.push("⚠️ 制約違反あり");
      }

      btn.title = tooltipParts.join("\n");
      btn.addEventListener("click", () => {
        openShiftCellDialog(nurse, d);
      });

      td.appendChild(btn);
      tr.appendChild(td);
    }

    // 4 summary columns: 夜勤 (E+N), 公休 (O), 連勤, 36協定(年間累計)
    const summary = currentEvaluation?.nurseSummaries[nurse.id];
    const counts = summary?.counts ?? { D: 0, E: 0, N: 0, O: 0 };
    const nightTotal = summary?.totalNightShifts ?? ((counts.E ?? 0) + (counts.N ?? 0));
    const offTotal = summary?.totalOffDays ?? (counts.O ?? 0);
    const maxStreak = summary?.maxConsecutiveWork ?? 0;

    const tdNight = document.createElement("td");
    tdNight.className = "stat-col";
    tdNight.textContent = `${nightTotal}回`;
    const effectiveMaxNight = nurse.maxMonthlyNightShifts ?? config.maxMonthlyNightShifts;
    if (nightTotal > effectiveMaxNight) tdNight.classList.add("cov-short");

    const tdOff = document.createElement("td");
    tdOff.className = "stat-col";
    tdOff.textContent = `${offTotal}日`;
    const effectiveMinOff = nurse.minMonthlyDaysOff ?? config.minMonthlyDaysOff;
    if (offTotal < effectiveMinOff) tdOff.classList.add("cov-short");

    const tdStreak = document.createElement("td");
    tdStreak.className = "stat-col";
    tdStreak.textContent = `${maxStreak}連`;
    const effectiveMaxConsec = nurse.maxConsecutiveWorkDays ?? config.maxConsecutiveWorkDays;
    if (maxStreak > effectiveMaxConsec) tdStreak.classList.add("cov-short");

    const td36 = document.createElement("td");
    td36.className = "stat-col";
    const projAnnual =
      summary?.projectedAnnualOvertimeHours ?? nurse.yearly36Stats.prev11MonthsOvertimeHours;
    const monthOt = summary?.estMonthOvertimeHours ?? 0;
    td36.textContent = `${Math.round(projAnnual)}h`;
    td36.title = `直近11ヶ月累計: ${nurse.yearly36Stats.prev11MonthsOvertimeHours}h + 当月見込: ${monthOt}h = 年間計 ${projAnnual}h (上限 ${config.maxAnnualOvertimeHours}h)`;
    if (
      config.enforce36Agreement &&
      (projAnnual > config.maxAnnualOvertimeHours || monthOt > config.maxMonthlyOvertimeHours)
    ) {
      td36.classList.add("cov-short");
    } else if (summary?.is36Warning) {
      td36.classList.add("stat-36-warn");
    }

    tr.append(tdNight, tdOff, tdStreak, td36);
    tbody.appendChild(tr);
  }

  // ---- TFOOT: Daily Coverage Summary Rows ----
  const dailySummaries = currentEvaluation?.dailySummaries ?? [];
  const footerRows: Array<{
    label: string;
    renderDay: (dIdx: number) => { text: string; ok: boolean; title: string };
  }> = [
    {
      label: "☀️ 日勤計 (必要:平日" + config.weekdayDayStaff + "/土日" + config.weekendDayStaff + ")",
      renderDay: (idx) => {
        const ds = dailySummaries[idx];
        if (!ds) return { text: "-", ok: true, title: "" };
        return {
          text: String(ds.counts.D),
          ok: ds.counts.D >= ds.required.D,
          title: `日勤配置: ${ds.counts.D}名 / 必要:${ds.required.D}名 (リーダー:${ds.skillCounts.leader_cap?.D ?? 0}名)`,
        };
      },
    },
    {
      label: `🌆 準夜勤 (必要:${config.eveningStaff}名)`,
      renderDay: (idx) => {
        const ds = dailySummaries[idx];
        if (!ds) return { text: "-", ok: true, title: "" };
        return {
          text: String(ds.counts.E),
          ok: ds.counts.E >= ds.required.E,
          title: `準夜配置: ${ds.counts.E}名 / 必要: ${ds.required.E}名 (リーダー:${ds.skillCounts.leader_cap?.E ?? 0}名)`,
        };
      },
    },
    {
      label: `🌙 深夜勤 (必要:${config.nightStaff}名)`,
      renderDay: (idx) => {
        const ds = dailySummaries[idx];
        if (!ds) return { text: "-", ok: true, title: "" };
        return {
          text: String(ds.counts.N),
          ok: ds.counts.N >= ds.required.N,
          title: `深夜配置: ${ds.counts.N}名 / 必要: ${ds.required.N}名 (リーダー:${ds.skillCounts.leader_cap?.N ?? 0}名)`,
        };
      },
    },
  ];

  for (const fRow of footerRows) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.className = "sticky-nurse-col";
    tdLabel.textContent = fRow.label;
    tr.appendChild(tdLabel);

    const tdPrevBlank = document.createElement("td");
    tdPrevBlank.colSpan = visiblePrevCount;
    tdPrevBlank.className = "prev-month-col prev-month-divider";
    tdPrevBlank.textContent = "";
    tr.appendChild(tdPrevBlank);

    for (let idx = 0; idx < numDays; idx++) {
      const td = document.createElement("td");
      const res = fRow.renderDay(idx);
      td.textContent = res.text;
      td.title = res.title;
      td.className = res.ok ? "cov-ok" : "cov-short";
      tr.appendChild(td);
    }

    const tdTail = document.createElement("td");
    tdTail.colSpan = 4;
    tdTail.textContent = "";
    tr.appendChild(tdTail);
    tfoot.appendChild(tr);
  }
}

// ==================== TAB 2: CONSTRAINTS & CUSTOM RULES UI ====================
function syncConfigInputsFromState(): void {
  const c = appState.config;
  ($("cfg-weekdayDayStaff") as HTMLInputElement).value = String(c.weekdayDayStaff);
  ($("cfg-weekendDayStaff") as HTMLInputElement).value = String(c.weekendDayStaff);
  ($("cfg-eveningStaff") as HTMLInputElement).value = String(c.eveningStaff);
  ($("cfg-nightStaff") as HTMLInputElement).value = String(c.nightStaff);

  ($("cfg-enforceSkillCoverage") as HTMLInputElement).checked = c.enforceSkillCoverage;
  ($("cfg-enforcePreceptorPairs") as HTMLInputElement).checked = Boolean(c.enforcePreceptorPairs);

  ($("cfg-enforcePrevMonthCarryover") as HTMLInputElement).checked = c.enforcePrevMonthCarryover;

  ($("cfg-maxConsecutiveWorkDays") as HTMLInputElement).value = String(c.maxConsecutiveWorkDays);
  ($("cfg-minMonthlyDaysOff") as HTMLInputElement).value = String(c.minMonthlyDaysOff);
  ($("cfg-minMonthlyWorkDays") as HTMLInputElement).value = String(c.minMonthlyWorkDays);
  ($("cfg-maxMonthlyNightShifts") as HTMLInputElement).value = String(c.maxMonthlyNightShifts);
  ($("cfg-enforce36Agreement") as HTMLInputElement).checked = c.enforce36Agreement;
  ($("cfg-maxMonthlyOvertimeHours") as HTMLInputElement).value = String(c.maxMonthlyOvertimeHours);
  ($("cfg-maxAnnualOvertimeHours") as HTMLInputElement).value = String(c.maxAnnualOvertimeHours);

  ($("cfg-enforceWeekendOff") as HTMLInputElement).checked = c.requireWeekendOff;
  ($("cfg-enforceNgPairs") as HTMLInputElement).checked = c.enforceNgPairs;
  ($("cfg-enforceHardRequests") as HTMLInputElement).checked = c.enforceHardRequests;
  const preserveEl = document.getElementById("chk-preserve-schedule") as HTMLInputElement | null;
  if (preserveEl) {
    preserveEl.checked = c.preserveCurrentSchedule !== false;
  }

  renderShiftTransitionMatrix();
  renderCustomRulesList();
  renderSkillDefsList();
  renderShiftAliasesList();
}

function renderShiftTransitionMatrix(): void {
  const wrap = document.getElementById("shift-transition-matrix");
  if (!wrap) return;
  wrap.replaceChildren();

  const matrix = getShiftTransitionMatrix(appState.config);
  const table = document.createElement("table");
  table.className = "transition-matrix-table";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  const thCorner = document.createElement("th");
  thCorner.textContent = "前日 ＼ 翌日";
  trHead.appendChild(thCorner);

  const cols: Array<{ key: "D" | "E" | "N" | "O"; label: string }> = [
    { key: "D", label: "☀️ 日勤(D)" },
    { key: "E", label: "🌆 準夜(E)" },
    { key: "N", label: "🌙 深夜(N)" },
    { key: "O", label: "🏖️ 公休(O)" },
  ];
  for (const col of cols) {
    const th = document.createElement("th");
    th.textContent = col.label;
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const rows: Array<{ key: "D" | "E" | "N"; label: string }> = [
    { key: "D", label: "前日: ☀️ 日勤(D)" },
    { key: "E", label: "前日: 🌆 準夜(E)" },
    { key: "N", label: "前日: 🌙 深夜(N)" },
  ];

  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    const thRow = document.createElement("th");
    thRow.textContent = r.label;
    tr.appendChild(thRow);

    for (const c of cols) {
      const td = document.createElement("td");
      const rule: TransitionRuleType = matrix[r.key][c.key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `trans-cell-btn trans-${rule}`;
      btn.textContent =
        rule === "forbid" ? "✕ 禁止" : rule === "require" ? "◎ 必須" : "○ 許可";

      btn.title = `クリックで「${r.key} ➔ ${c.key}」の遷移ルールを切り替え`;
      btn.addEventListener("click", () => {
        const nextRule: TransitionRuleType =
          c.key === "O"
            ? rule === "require"
              ? "allow"
              : "require"
            : rule === "forbid"
              ? "allow"
              : "forbid";
        appState = {
          ...appState,
          config: applyShiftTransitionToConfig(appState.config, r.key, c.key, nextRule),
        };
        syncConfigInputsFromState();
        void runWashiOptimization();
      });
      td.appendChild(btn);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function formatCustomShiftBaseAndAliases(cs: CustomShiftDef): string {
  const base = cs.baseShift ?? (cs.countsAsWorkDay ? "D" : "O");
  const baseText =
    base === "E"
      ? "準夜帯扱い(E)"
      : base === "N"
        ? "深夜帯扱い(N)"
        : base === "O"
          ? "休暇扱い(O)"
          : "日勤帯扱い(D)";
  const aliases = getEffectiveIncludedAliases(cs);
  const aliasText = aliases.length > 0 ? `グループ包含: [${aliases.join(", ")}]` : "グループ非包含(独立)";
  return `${baseText} / ${aliasText}`;
}

function renderSoftRuleWeightsList(): void {
  const listEl = document.getElementById("soft-rule-weights-list");
  if (!listEl) return;
  listEl.replaceChildren();

  const items: Array<{ key: string; label: string }> = [
    { key: "consecutive", label: "最大連勤日数上限" },
    { key: "monthlyDaysOff", label: "月間最低公休日数" },
    { key: "monthlyNightCap", label: "月間夜勤(準+深)上限" },
    { key: "enforcePreceptorPairs", label: "プリセプター同行夜勤" },
    { key: "enforceNgPairs", label: "相性NGペアの同シフト回避" },
    { key: "requireWeekendOff", label: "週末(土日)最低2日公休" },
    { key: "enforceHardRequests", label: "確定希望休の遵守" },
    { key: "enforce36Agreement", label: "36協定 時間外労働上限" },
  ];

  // Dynamically add active shift transitions from shiftTransitions matrix
  const transMatrix = getShiftTransitionMatrix(appState.config);
  const shiftShortJa: Record<string, string> = { D: "日", E: "準", N: "深", O: "休" };
  for (const fromShift of ["D", "E", "N"] as const) {
    const rowPolicies = transMatrix[fromShift];
    const reqTarget = (["D", "E", "N", "O"] as const).find(
      (t) => rowPolicies[t] === "require"
    );
    if (reqTarget) {
      items.push({
        key: `trans_${fromShift}_${reqTarget}`,
        label: `遷移必須 (${shiftShortJa[fromShift]}→${shiftShortJa[reqTarget]})`,
      });
    } else {
      for (const toShift of ["D", "E", "N", "O"] as const) {
        if (rowPolicies[toShift] === "forbid") {
          items.push({
            key: `trans_${fromShift}_${toShift}`,
            label: `遷移禁止 (${shiftShortJa[fromShift]}→${shiftShortJa[toShift]})`,
          });
        }
      }
    }
  }

  // Dynamically add active skill/attribute coverage definitions from skillDefs
  for (const sd of appState.skillDefs ?? createDefaultSkillDefs()) {
    const hasBound =
      sd.minDay > 0 ||
      sd.minEvening > 0 ||
      sd.minNight > 0 ||
      typeof sd.maxDay === "number" ||
      typeof sd.maxEvening === "number" ||
      typeof sd.maxNight === "number";
    if (hasBound) {
      items.push({
        key: `skill_${sd.code}`,
        label: `配置人数: ${sd.label}`,
      });
    }
  }

  const weights = appState.config.softRuleWeights ?? {};

  for (const item of items) {
    const field = document.createElement("label");
    field.className = "form-field";
    const span = document.createElement("span");
    span.textContent = item.label;

    const sel = document.createElement("select");
    sel.className = "toolbar-select";
    sel.style.height = "30px";
    sel.style.fontSize = "0.78rem";
    const curW = weights[item.key] ?? 0;
    const options: Array<{ val: string; text: string }> = [
      { val: "0", text: "🔒 必須 (ハード制約)" },
      { val: "15", text: "⚖️ なるべく (重み:弱 15)" },
      { val: "40", text: "⚖️ なるべく (重み:中 40)" },
      { val: "90", text: "⚖️ なるべく (重み:強 90)" },
    ];
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.val;
      o.textContent = opt.text;
      if (Number(opt.val) === curW) o.selected = true;
      sel.appendChild(o);
    }
    if (curW > 0 && !options.some((o) => Number(o.val) === curW)) {
      const customOpt = document.createElement("option");
      customOpt.value = String(curW);
      customOpt.textContent = `⚖️ なるべく (重み:${curW})`;
      customOpt.selected = true;
      sel.appendChild(customOpt);
    }

    sel.addEventListener("change", () => {
      const w = Number(sel.value) || 0;
      const nextWeights = { ...(appState.config.softRuleWeights ?? {}) };
      if (w > 0) {
        nextWeights[item.key] = w;
      } else {
        delete nextWeights[item.key];
      }
      appState = {
        ...appState,
        config: {
          ...appState.config,
          softRuleWeights: nextWeights,
        },
      };
      void runWashiOptimization();
    });

    field.append(span, sel);
    listEl.appendChild(field);
  }
}

function populateStaffingRuleSelectors(): void {
  const shiftSel = document.getElementById("select-staffing-shift") as HTMLSelectElement | null;
  const attrSel = document.getElementById("select-staffing-attr") as HTMLSelectElement | null;
  if (shiftSel) {
    const prevVal = shiftSel.value;
    shiftSel.replaceChildren();
    const baseOpts: Array<{ value: string; label: string }> = [
      { value: "D", label: "日勤 (D)" },
      { value: "E", label: "準夜勤 (E)" },
      { value: "N", label: "深夜勤 (N)" },
      { value: "night_both", label: "夜勤両方 (準夜・深夜)" },
    ];
    for (const cs of appState.customShiftDefs ?? []) {
      baseOpts.unshift({
        value: cs.code,
        label: `🏷️ カスタム: ${cs.label} (${cs.shortLabel})`,
      });
    }
    for (const o of baseOpts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === prevVal) opt.selected = true;
      shiftSel.appendChild(opt);
    }
  }
  if (attrSel) {
    const prevAttr = attrSel.value;
    attrSel.replaceChildren();
    const activeSkills = appState.skillDefs ?? createDefaultSkillDefs();
    const attrOpts: Array<{ value: string; label: string }> = [
      ...activeSkills.map((sk) => {
        const catPrefix =
          sk.category === "role" ? "👤 役割" : sk.category === "group" ? "👥 班" : "🎖️ スキル";
        return {
          value: sk.code,
          label: `${catPrefix}: ${sk.label} (${sk.shortLabel})`,
        };
      }),
      {
        value: ALL_STAFF_ATTRIBUTE_DEF.code,
        label: `属性: ${ALL_STAFF_ATTRIBUTE_DEF.label} (${ALL_STAFF_ATTRIBUTE_DEF.shortLabel})`,
      },
    ];
    for (const o of attrOpts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === prevAttr) opt.selected = true;
      attrSel.appendChild(opt);
    }
  }
}

function renderShiftAliasesList(): void {
  populateStaffingRuleSelectors();
  renderSoftRuleWeightsList();
  const listEl = document.getElementById("shift-aliases-list");
  if (!listEl) return;
  listEl.replaceChildren();

  const aliases = createDefaultShiftAliases(appState.customShiftDefs ?? []);
  appState.shiftAliases = aliases;
  for (const a of aliases) {
    const row = document.createElement("div");
    row.className = "custom-rule-item";
    const info = document.createElement("div");
    info.className = "checkbox-row";
    const badge = document.createElement("span");
    badge.className = `shift-badge shift-${a.code === "W" ? "W" : a.code === "EN" ? "EN" : "D"}`;
    badge.textContent = a.shortLabel;
    const text = document.createElement("span");
    text.textContent = `シフトグループ [${a.code}]: 「${a.label}」 ➔ 展開対象: [${a.shifts.join(", ")}]`;
    info.append(badge, text);
    row.appendChild(info);
    listEl.appendChild(row);
  }

  for (const cs of appState.customShiftDefs ?? []) {
    const row = document.createElement("div");
    row.className = "custom-rule-item";
    const info = document.createElement("div");
    info.className = "checkbox-row";
    info.style.flexWrap = "wrap";
    info.style.gap = "0.45rem";
    const badge = document.createElement("span");
    badge.className = "shift-badge shift-custom";
    badge.textContent = cs.shortLabel;
    const text = document.createElement("span");
    text.textContent = `カスタムシフト [${cs.code}]: 「${cs.label}」 (${formatCustomShiftBaseAndAliases(cs)})`;
    info.append(badge, text);

    const controlsWrap = document.createElement("div");
    controlsWrap.style.display = "flex";
    controlsWrap.style.alignItems = "center";
    controlsWrap.style.gap = "0.35rem";
    controlsWrap.style.flexWrap = "wrap";

    const baseSelect = document.createElement("select");
    baseSelect.className = "toolbar-select";
    baseSelect.style.height = "26px";
    baseSelect.style.fontSize = "0.74rem";
    const curBase = cs.baseShift ?? (cs.countsAsWorkDay ? "D" : "O");
    for (const b of [
      { v: "D", l: "区分:日勤帯(D)" },
      { v: "E", l: "区分:準夜帯(E)" },
      { v: "N", l: "区分:深夜帯(N)" },
      { v: "O", l: "区分:休暇(O)" },
    ] as const) {
      const opt = document.createElement("option");
      opt.value = b.v;
      opt.textContent = b.l;
      if (b.v === curBase) opt.selected = true;
      baseSelect.appendChild(opt);
    }
    baseSelect.addEventListener("change", () => {
      const nextBase = baseSelect.value as "D" | "E" | "N" | "O";
      const nextTimeRange =
        nextBase === "E"
          ? "16:30–01:00"
          : nextBase === "N"
            ? "00:30–09:00"
            : nextBase === "O"
              ? "終日 (休暇)"
              : "09:00–17:00";
      const nextCustom = appState.customShiftDefs.map((d) =>
        d.code === cs.code
          ? {
              ...d,
              baseShift: nextBase,
              timeRange: nextTimeRange,
              countsAsWorkDay: nextBase !== "O",
              overtimeHoursPerShift: nextBase === "O" ? 0 : 0.5,
            }
          : d
      );
      appState = {
        ...appState,
        customShiftDefs: nextCustom,
        shiftAliases: createDefaultShiftAliases(nextCustom),
      };
      renderAllViews();
      void runWashiOptimization();
    });
    controlsWrap.appendChild(baseSelect);

    const currentIncluded = getEffectiveIncludedAliases(cs);
    for (const aliasCode of ["W", "D", "EN"] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-xs-outline";
      const isIncluded = currentIncluded.includes(aliasCode);
      btn.textContent = `${isIncluded ? "✓" : "+"}${aliasCode}に含める`;
      btn.style.fontSize = "0.72rem";
      if (isIncluded) {
        btn.style.background = "rgba(37, 99, 235, 0.12)";
        btn.style.borderColor = "#2563eb";
        btn.style.color = "#2563eb";
        btn.style.fontWeight = "600";
      }
      btn.addEventListener("click", () => {
        const nextIncluded = isIncluded
          ? currentIncluded.filter((a) => a !== aliasCode)
          : [...currentIncluded, aliasCode];
        const nextCustom = appState.customShiftDefs.map((d) =>
          d.code === cs.code ? { ...d, includedInAliases: nextIncluded } : d
        );
        appState = {
          ...appState,
          customShiftDefs: nextCustom,
          shiftAliases: createDefaultShiftAliases(nextCustom),
        };
        renderAllViews();
        void runWashiOptimization();
      });
      controlsWrap.appendChild(btn);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-xs-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      appState = removeCustomShiftFromState(appState, cs.code);
      if (currentSchedule) {
        const cleanedSchedule: MonthlyScheduleMap = {};
        for (const [nId, row] of Object.entries(currentSchedule)) {
          cleanedSchedule[nId] = row.map((s) => (s === cs.code ? "O" : s));
        }
        currentSchedule = cleanedSchedule;
      }
      renderAllViews();
      void runWashiOptimization();
    });
    controlsWrap.appendChild(delBtn);

    row.append(info, controlsWrap);
    listEl.appendChild(row);
  }
}

function readNumInput(id: string, fallback: number): number {
  const raw = ($(id) as HTMLInputElement).value.trim();
  if (raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readConfigInputsToState(): void {
  const preserveEl = document.getElementById("chk-preserve-schedule") as HTMLInputElement | null;
  const c: NurseScheduleConfig = {
    ...appState.config,
    preserveCurrentSchedule: preserveEl ? preserveEl.checked : appState.config.preserveCurrentSchedule !== false,
    weekdayDayStaff: readNumInput("cfg-weekdayDayStaff", 10),
    weekendDayStaff: readNumInput("cfg-weekendDayStaff", 7),
    eveningStaff: readNumInput("cfg-eveningStaff", 3),
    nightStaff: readNumInput("cfg-nightStaff", 3),
    enforceSkillCoverage: ($("cfg-enforceSkillCoverage") as HTMLInputElement).checked,
    enforcePreceptorPairs: ($("cfg-enforcePreceptorPairs") as HTMLInputElement).checked,
    enforcePrevMonthCarryover: ($("cfg-enforcePrevMonthCarryover") as HTMLInputElement).checked,
    maxConsecutiveWorkDays: readNumInput("cfg-maxConsecutiveWorkDays", 5),
    minMonthlyDaysOff: readNumInput("cfg-minMonthlyDaysOff", 9),
    minMonthlyWorkDays: readNumInput("cfg-minMonthlyWorkDays", 14),
    maxMonthlyNightShifts: readNumInput("cfg-maxMonthlyNightShifts", 8),
    enforce36Agreement: ($("cfg-enforce36Agreement") as HTMLInputElement).checked,
    maxMonthlyOvertimeHours: readNumInput("cfg-maxMonthlyOvertimeHours", 45),
    maxAnnualOvertimeHours: readNumInput("cfg-maxAnnualOvertimeHours", 360),
    requireWeekendOff: ($("cfg-enforceWeekendOff") as HTMLInputElement).checked,
    enforceNgPairs: ($("cfg-enforceNgPairs") as HTMLInputElement).checked,
    enforceHardRequests: ($("cfg-enforceHardRequests") as HTMLInputElement).checked,
  };
  appState = { ...appState, config: c };
}

function renderSkillDefsList(): void {
  const listEl = document.getElementById("skill-defs-list");
  if (!listEl) return;
  listEl.replaceChildren();

  const skills = appState.skillDefs ?? createDefaultSkillDefs();
  if (skills.length === 0) {
    const empty = document.createElement("div");
    empty.className = "constraint-card-desc";
    empty.textContent = "現在、登録されているスキル・属性はありません。";
    listEl.appendChild(empty);
    return;
  }

  for (const s of skills) {
    const row = document.createElement("div");
    row.className = "custom-rule-item";

    const info = document.createElement("div");
    info.className = "checkbox-row";
    const badge = document.createElement("span");
    badge.className = "shift-badge shift-custom";
    badge.textContent = s.shortLabel;

    const totalSatisfying = appState.nurses.filter((n) =>
      doesNurseSatisfySkill(n, s.code, skills)
    ).length;

    const catLabel =
      s.category === "role"
        ? "役割"
        : s.category === "team" || (s.category as string) === "group"
          ? "班"
          : "スキル";
    const subTarget = s.substitutesFor ? getSkillMeta(s.substitutesFor, skills) : null;
    const subNote = subTarget ? ` 【${subTarget.label}の代行可】` : "";

    const text = document.createElement("span");
    text.textContent = `${catLabel}「${s.label}」(該当:${totalSatisfying}名)${subNote}`;
    info.append(badge, text);

    const actionsWrap = document.createElement("div");
    actionsWrap.style.display = "flex";
    actionsWrap.style.alignItems = "center";
    actionsWrap.style.flexWrap = "wrap";
    actionsWrap.style.gap = "0.4rem";

    const makeBoundInput = (
      labelPrefix: string,
      val: number | undefined,
      onChange: (nextVal: number | undefined) => void,
      allowEmpty = false
    ) => {
      const lbl = document.createElement("label");
      lbl.style.display = "inline-flex";
      lbl.style.alignItems = "center";
      lbl.style.gap = "0.2rem";
      lbl.style.fontSize = "0.75rem";
      const sp = document.createElement("span");
      sp.textContent = labelPrefix;
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = "15";
      inp.style.width = "46px";
      inp.style.padding = "0.15rem 0.25rem";
      inp.style.fontSize = "0.75rem";
      inp.value = val !== undefined ? String(val) : "";
      if (allowEmpty) inp.placeholder = "-";
      inp.addEventListener("change", () => {
        const raw = inp.value.trim();
        if (allowEmpty && raw === "") {
          onChange(undefined);
        } else {
          const n = Math.max(0, Math.round(Number(raw) || 0));
          onChange(n);
        }
      });
      lbl.append(sp, inp);
      return lbl;
    };

    const updateSkillBound = (patch: Partial<SkillDefinition>) => {
      const nextSkills = (appState.skillDefs ?? createDefaultSkillDefs()).map((item) =>
        item.code === s.code ? { ...item, ...patch } : item
      );
      appState = { ...appState, skillDefs: nextSkills };
      renderAllViews();
      void runWashiOptimization();
    };

    actionsWrap.append(
      makeBoundInput("日≥", s.minDay ?? 0, (v) => updateSkillBound({ minDay: v ?? 0 })),
      makeBoundInput("準≥", s.minEvening ?? 0, (v) => updateSkillBound({ minEvening: v ?? 0 })),
      makeBoundInput("深≥", s.minNight ?? 0, (v) => updateSkillBound({ minNight: v ?? 0 })),
      makeBoundInput("準≤", s.maxEvening, (v) => updateSkillBound({ maxEvening: v }), true),
      makeBoundInput("深≤", s.maxNight, (v) => updateSkillBound({ maxNight: v }), true)
    );

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-xs-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      const { updatedState } = applyChatOperationsToState(appState, [
        { op: "remove_skill_def", skillName: s.label },
      ]);
      appState = updatedState;
      renderAllViews();
      void runWashiOptimization();
    });
    actionsWrap.appendChild(delBtn);

    row.append(info, actionsWrap);
    listEl.appendChild(row);
  }
}

function renderCustomRulesList(): void {
  const listEl = $("custom-rules-list");
  listEl.replaceChildren();

  const customShifts = appState.customShiftDefs ?? [];
  const nursesWithContractOverrides = appState.nurses.filter(
    (n) =>
      typeof n.minMonthlyWorkDays === "number" ||
      typeof n.maxMonthlyWorkDays === "number" ||
      typeof n.minMonthlyDaysOff === "number" ||
      typeof n.maxMonthlyNightShifts === "number" ||
      typeof n.maxConsecutiveWorkDays === "number" ||
      Boolean(n.forbiddenShifts && n.forbiddenShifts.length > 0) ||
      Boolean(n.weekdayOnly) ||
      Boolean(n.holidaysOff)
  );
  if (
    appState.customRules.length === 0 &&
    customShifts.length === 0 &&
    nursesWithContractOverrides.length === 0
  ) {
    const empty = document.createElement("div");
    empty.className = "constraint-card-desc";
    empty.textContent =
      "現在、追加された個別固定ルール・カスタムシフトはありません（シフト表のマス目クリックや左のAIチャットで追加できます）。";
    listEl.appendChild(empty);
    return;
  }

  for (const nurse of nursesWithContractOverrides) {
    const row = document.createElement("div");
    row.className = "custom-rule-item";

    const info = document.createElement("div");
    info.className = "checkbox-row";
    const parts: string[] = [];
    if (typeof nurse.minMonthlyWorkDays === "number") {
      parts.push(`月間最低勤務=${nurse.minMonthlyWorkDays}日`);
    }
    if (typeof nurse.maxMonthlyWorkDays === "number") {
      parts.push(`月間最大勤務=${nurse.maxMonthlyWorkDays}日`);
    }
    if (typeof nurse.minMonthlyDaysOff === "number") {
      parts.push(`月間最低公休=${nurse.minMonthlyDaysOff}日`);
    }
    if (typeof nurse.maxMonthlyNightShifts === "number") {
      parts.push(`月間夜勤上限=${nurse.maxMonthlyNightShifts}回`);
    }
    if (typeof nurse.maxConsecutiveWorkDays === "number") {
      parts.push(`最大連勤=${nurse.maxConsecutiveWorkDays}連勤`);
    }
    if (nurse.forbiddenShifts && nurse.forbiddenShifts.length > 0) {
      if (nurse.forbiddenShifts.includes("D")) parts.push("夜勤専従(日勤免除)");
      else if (nurse.forbiddenShifts.includes("N")) parts.push("深夜勤免除");
      else if (nurse.forbiddenShifts.includes("E")) parts.push("準夜勤免除");
    }
    if (nurse.weekdayOnly) {
      parts.push("平日のみ勤務(土日休)");
    }
    if (nurse.holidaysOff) {
      parts.push("祝日休み(祝休)");
    }
    const text = document.createElement("span");
    text.textContent = `👤 個別勤務契約: ${nurse.name}(${nurse.id}) [${parts.join(" / ")}]`;
    info.appendChild(text);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-xs-outline";
    delBtn.textContent = "解除";
    delBtn.addEventListener("click", () => {
      appState = clearNurseContractFromState(appState, nurse.id);
      renderAllViews();
      void runWashiOptimization();
    });

    row.append(info, delBtn);
    listEl.appendChild(row);
  }

  for (const cs of customShifts) {
    const row = document.createElement("div");
    row.className = "custom-rule-item";

    const info = document.createElement("div");
    info.className = "checkbox-row";
    const badge = document.createElement("span");
    badge.className = "shift-badge shift-custom";
    badge.textContent = cs.shortLabel;
    const text = document.createElement("span");
    text.textContent = `カスタムシフト定義: 「${cs.label}」 (コード:${cs.code} / ${formatCustomShiftBaseAndAliases(cs)})`;
    info.append(badge, text);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-xs-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      appState = removeCustomShiftFromState(appState, cs.code);
      if (currentSchedule) {
        const cleanedSchedule: MonthlyScheduleMap = {};
        for (const [nId, row] of Object.entries(currentSchedule)) {
          cleanedSchedule[nId] = row.map((s) => (s === cs.code ? "O" : s));
        }
        currentSchedule = cleanedSchedule;
      }
      renderAllViews();
      void runWashiOptimization();
    });

    row.append(info, delBtn);
    listEl.appendChild(row);
  }

  // Group multi-day pin_shift / forbid_shift rules for the same nurse & shift so a 17-day leave renders as 1 row
  interface RuleDisplayGroup {
    rules: CustomConstraintRule[];
    description: string;
  }
  const displayGroups: RuleDisplayGroup[] = [];
  const groupedIndexMap = new Map<string, number>();

  for (const rule of appState.customRules) {
    if (
      (rule.kind === "pin_shift" && rule.nurseId && typeof rule.day === "number" && rule.shift) ||
      (rule.kind === "forbid_shift" && rule.nurseId && typeof rule.day === "number")
    ) {
      const groupKey =
        rule.kind === "pin_shift"
          ? `pin::${rule.nurseId}::${rule.shift}`
          : `forbid::${rule.nurseId}::${(rule.forbidShifts ?? []).join("/")}`;
      const existingIdx = groupedIndexMap.get(groupKey);
      if (existingIdx !== undefined) {
        displayGroups[existingIdx].rules.push(rule);
      } else {
        groupedIndexMap.set(groupKey, displayGroups.length);
        displayGroups.push({
          rules: [rule],
          description: rule.description,
        });
      }
    } else {
      displayGroups.push({
        rules: [rule],
        description: rule.description,
      });
    }
  }

  for (const grp of displayGroups) {
    if (grp.rules.length > 1) {
      const r0 = grp.rules[0];
      const nurse = appState.nurses.find((n) => n.id === r0.nurseId);
      const nurseLabel = nurse ? `${nurse.name}(${nurse.id})` : r0.nurseId;
      const days = Array.from(new Set(grp.rules.map((r) => r.day!))).sort((a, b) => a - b);
      const isContiguous = days[days.length - 1] - days[0] + 1 === days.length;
      const spanText = isContiguous
        ? `${appState.config.month}/${days[0]}〜${appState.config.month}/${days[days.length - 1]} (計${days.length}日間)`
        : `${days.map((d) => `${appState.config.month}/${d}`).join("・")} (計${days.length}日間)`;
      if (r0.kind === "pin_shift") {
        const shiftMeta = getShiftMeta(r0.shift ?? "O", appState.customShiftDefs);
        grp.description = `${spanText}: ${nurseLabel} を「${shiftMeta.label}(${shiftMeta.shortLabel})」に固定`;
      } else {
        const shifts = (r0.forbidShifts ?? ["E", "N"]).join("/");
        grp.description = `${spanText}: ${nurseLabel} の [${shifts}] シフト配置を禁止`;
      }
    }

    const row = document.createElement("div");
    row.className = "custom-rule-item";

    const label = document.createElement("label");
    label.className = "checkbox-row";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = grp.rules.every((r) => r.enabled);
    chk.addEventListener("change", () => {
      for (const r of grp.rules) {
        r.enabled = chk.checked;
      }
      void runWashiOptimization();
    });
    const text = document.createElement("span");
    text.textContent = `📌 ${grp.description}`;
    label.append(chk, text);

    const actionsWrap = document.createElement("div");
    actionsWrap.style.display = "flex";
    actionsWrap.style.alignItems = "center";
    actionsWrap.style.gap = "0.35rem";

    const firstRule = grp.rules[0];
    if (firstRule && firstRule.kind !== "level_night_shifts") {
      const hardSelect = document.createElement("select");
      hardSelect.className = "toolbar-select";
      hardSelect.style.height = "26px";
      hardSelect.style.fontSize = "0.74rem";
      const curHard = firstRule.isHard !== false;
      const curW = firstRule.penaltyWeight ?? 40;
      const curVal = curHard ? "hard" : `soft:${curW}`;
      const hOpts = [
        { val: "hard", label: "🔒 必須(ハード)" },
        { val: "soft:15", label: "⚖️ なるべく(重み:15)" },
        { val: "soft:40", label: "⚖️ なるべく(重み:40)" },
        { val: "soft:90", label: "⚖️ なるべく(重み:90)" },
      ];
      for (const o of hOpts) {
        const opt = document.createElement("option");
        opt.value = o.val;
        opt.textContent = o.label;
        if (o.val === curVal) opt.selected = true;
        hardSelect.appendChild(opt);
      }
      if (!curHard && !hOpts.some((o) => o.val === curVal)) {
        const customOpt = document.createElement("option");
        customOpt.value = curVal;
        customOpt.textContent = `⚖️ なるべく(重み:${curW})`;
        customOpt.selected = true;
        hardSelect.appendChild(customOpt);
      }
      hardSelect.addEventListener("change", () => {
        const v = hardSelect.value;
        const isHard = v === "hard";
        const w = isHard ? undefined : Number(v.split(":")[1]) || 40;
        for (const r of grp.rules) {
          r.isHard = isHard ? undefined : false;
          r.penaltyWeight = w;
        }
        void runWashiOptimization();
      });
      actionsWrap.appendChild(hardSelect);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-xs-outline";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      const idSet = new Set(grp.rules.map((r) => r.id));
      appState = {
        ...appState,
        customRules: appState.customRules.filter((r) => !idSet.has(r.id)),
      };
      renderCustomRulesList();
      void runWashiOptimization();
    });
    actionsWrap.appendChild(delBtn);

    row.append(label, actionsWrap);
    listEl.appendChild(row);
  }
}

// ==================== TAB 3: 30 STAFF PROFILES & COMPATIBILITY ====================
function renderStaffProfilesTab(): void {
  const relList = $("relations-list");
  const tbody = $("staff-profile-tbody");
  relList.replaceChildren();
  tbody.replaceChildren();

  const staffBadge = document.getElementById("badge-staff-count");
  if (staffBadge) {
    staffBadge.textContent = String(appState.nurses.length);
  }

  const catGenBtn = document.getElementById("btn-cat-generate-sample");
  const catClearBtn = document.getElementById("btn-cat-clear-blank");
  const nextBanner = document.getElementById("staff-next-step-banner");
  const nextMsg = document.getElementById("staff-next-step-message");

  if (appState.nurses.length === 0) {
    if (catGenBtn) {
      catGenBtn.className = "btn-solve-primary";
      catGenBtn.textContent = "🎲 サンプルデータを読み込む";
    }
    if (catClearBtn) catClearBtn.hidden = true;
    if (nextBanner) nextBanner.hidden = true;

    const emptyRel = document.createElement("div");
    emptyRel.style.color = "var(--text-sumi-secondary)";
    emptyRel.style.fontSize = "0.85rem";
    emptyRel.style.padding = "0.5rem 0";
    emptyRel.textContent = "現在、スタッフおよびペア制約は登録されていません（白紙モード）。";
    relList.appendChild(emptyRel);

    const emptyTr = document.createElement("tr");
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = 8;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "2.5rem 1rem";
    emptyTd.style.color = "var(--text-sumi-secondary)";
    emptyTd.innerHTML =
      `📄 <strong>スタッフデータが未登録です（白紙モード）</strong><br>` +
      `<span style="font-size: 0.82rem; margin-top: 0.4rem; display: inline-block;">上の「🎲 サンプルデータを読み込む」ボタンを押すか、「📂 CSVインポート」で名簿ファイルを読み込んでください。</span>`;
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    return;
  }

  if (catGenBtn) {
    catGenBtn.className = "btn-toolbar-outline";
    catGenBtn.textContent = "🎲 サンプル再生成";
  }
  if (catClearBtn) catClearBtn.hidden = false;
  if (nextBanner) {
    nextBanner.hidden = false;
    if (nextMsg) {
      nextMsg.textContent = `✅ 基礎データの準備完了（${appState.nurses.length}名）。「⚙️ 条件・ルール設定」で制約を確認・調整するか、「⚡ シフトを自動作成」でシフトを編成してください。`;
    }
  }

  const nurseById = new Map(appState.nurses.map((n) => [n.id, n]));

  for (const rel of appState.relations) {
    const nA = nurseById.get(rel.nurseA);
    const nB = nurseById.get(rel.nurseB);
    if (!nA || !nB) continue;

    const pill = document.createElement("div");
    pill.className = `relation-pill ${
      rel.type === "ng_pair" ? "relation-ng" : "relation-preceptor"
    }`;
    const span = document.createElement("span");
    span.textContent =
      rel.type === "ng_pair"
        ? `⚡ 相性NG: ${nA.name} × ${nB.name}`
        : `🌱 指導ペア: ${nA.name} ➔ ${nB.name}`;
    pill.appendChild(span);

    const hardSelect = document.createElement("select");
    hardSelect.className = "toolbar-select";
    hardSelect.style.height = "24px";
    hardSelect.style.fontSize = "0.72rem";
    hardSelect.style.marginLeft = "0.25rem";
    const curHard = rel.isHard !== false;
    const curW = rel.penaltyWeight ?? 40;
    const curVal = curHard ? "hard" : `soft:${curW}`;
    for (const o of [
      { val: "hard", label: "🔒必須" },
      { val: "soft:15", label: "⚖️重み:15" },
      { val: "soft:40", label: "⚖️重み:40" },
      { val: "soft:90", label: "⚖️重み:90" },
    ]) {
      const opt = document.createElement("option");
      opt.value = o.val;
      opt.textContent = o.label;
      if (o.val === curVal) opt.selected = true;
      hardSelect.appendChild(opt);
    }
    hardSelect.addEventListener("change", () => {
      const v = hardSelect.value;
      const isHard = v === "hard";
      const w = isHard ? undefined : Number(v.split(":")[1]) || 40;
      rel.isHard = isHard ? undefined : false;
      rel.penaltyWeight = w;
      void runWashiOptimization();
    });
    pill.appendChild(hardSelect);

    if (rel.type === "ng_pair") {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-xs-outline";
      delBtn.textContent = "解除";
      delBtn.addEventListener("click", () => {
        appState = {
          ...appState,
          relations: appState.relations.filter((r) => r.id !== rel.id),
        };
        renderStaffProfilesTab();
        void runWashiOptimization();
      });
      pill.appendChild(delBtn);
    }

    relList.appendChild(pill);
  }

  for (const nurse of appState.nurses) {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = nurse.id;

    const tdName = document.createElement("td");
    tdName.style.fontWeight = "600";
    tdName.textContent = `${nurse.name} (${nurse.yearsExp}年目)`;

    const allSkillDefs = appState.skillDefs ?? createDefaultSkillDefs();
    const heldGroupAndRoleLabels = allSkillDefs
      .filter((sd) => (sd.category === "group" || sd.category === "role") && nurse.skills.includes(sd.code))
      .map((sd) => sd.shortLabel || sd.label);
    const tdRole = document.createElement("td");
    tdRole.textContent = heldGroupAndRoleLabels.join(" / ");

    const tdSkills = document.createElement("td");
    const skillsWrap = document.createElement("div");
    skillsWrap.style.display = "flex";
    skillsWrap.style.flexWrap = "wrap";
    skillsWrap.style.gap = "0.25rem";
    skillsWrap.style.alignItems = "center";

    const activeSkillDefs = (appState.skillDefs ?? createDefaultSkillDefs()).filter(
      (sd) => (sd.category ?? "skill") === "skill"
    );
    for (const sd of activeSkillDefs) {
      const hasSkill = nurse.skills.includes(sd.code);
      const skillBtn = document.createElement("button");
      skillBtn.type = "button";
      skillBtn.className = "btn-xs-outline";
      skillBtn.style.padding = "0.1rem 0.38rem";
      skillBtn.style.fontSize = "0.72rem";
      if (hasSkill) {
        skillBtn.style.background = "var(--accent-soft, rgba(37, 99, 235, 0.12))";
        skillBtn.style.borderColor = "var(--primary, #2563eb)";
        skillBtn.style.color = "var(--primary, #2563eb)";
        skillBtn.style.fontWeight = "600";
      } else {
        skillBtn.style.opacity = "0.45";
      }
      skillBtn.textContent = `${hasSkill ? "✓" : "+"}${sd.shortLabel}`;
      skillBtn.title = `クリックで「${sd.label}」スキルを${hasSkill ? "解除" : "付与"} (${nurse.name})`;
      skillBtn.addEventListener("click", () => {
        appState = {
          ...appState,
          nurses: appState.nurses.map((n) =>
            n.id === nurse.id
              ? {
                  ...n,
                  skills: hasSkill
                    ? n.skills.filter((sk) => sk !== sd.code)
                    : [...n.skills, sd.code],
                }
              : n
          ),
        };
        renderAllViews();
        void runWashiOptimization();
      });
      skillsWrap.appendChild(skillBtn);
    }

    const contractBtn = document.createElement("button");
    contractBtn.type = "button";
    contractBtn.className = "btn-xs-outline";
    contractBtn.style.padding = "0.1rem 0.38rem";
    contractBtn.style.fontSize = "0.72rem";
    contractBtn.textContent = nurse.nightOk ? "🌙夜勤可" : "☀️日勤専従";
    contractBtn.title = "クリックで「夜勤可 ⇄ 日勤専従(夜勤免除)」を切り替え";
    if (!nurse.nightOk) {
      contractBtn.style.background = "rgba(245, 158, 11, 0.15)";
      contractBtn.style.borderColor = "#d97706";
      contractBtn.style.color = "#b45309";
      contractBtn.style.fontWeight = "600";
    }
    contractBtn.addEventListener("click", () => {
      appState = {
        ...appState,
        nurses: appState.nurses.map((n) =>
          n.id === nurse.id ? { ...n, nightOk: !n.nightOk } : n
        ),
      };
      renderAllViews();
      void runWashiOptimization();
    });
    skillsWrap.appendChild(contractBtn);

    if (nurse.maxMonthlyNightShifts !== undefined) {
      const capSpan = document.createElement("span");
      capSpan.className = "role-pill";
      capSpan.textContent = `夜勤上限:${nurse.maxMonthlyNightShifts}回`;
      skillsWrap.appendChild(capSpan);
    }
    if (nurse.minMonthlyDaysOff !== undefined) {
      const offSpan = document.createElement("span");
      offSpan.className = "role-pill";
      offSpan.textContent = `公休:${nurse.minMonthlyDaysOff}日+`;
      skillsWrap.appendChild(offSpan);
    }
    if (nurse.maxMonthlyWorkDays !== undefined) {
      const maxWSpan = document.createElement("span");
      maxWSpan.className = "role-pill";
      maxWSpan.textContent = `勤務上限:${nurse.maxMonthlyWorkDays}日`;
      skillsWrap.appendChild(maxWSpan);
    }
    if (nurse.maxConsecutiveWorkDays !== undefined) {
      const consecSpan = document.createElement("span");
      consecSpan.className = "role-pill";
      consecSpan.textContent = `${nurse.maxConsecutiveWorkDays}連勤まで`;
      skillsWrap.appendChild(consecSpan);
    }
    if (nurse.weekdayOnly) {
      const wkSpan = document.createElement("span");
      wkSpan.className = "role-pill";
      wkSpan.textContent = "平日のみ(土日休)";
      skillsWrap.appendChild(wkSpan);
    }
    if (nurse.holidaysOff) {
      const holSpan = document.createElement("span");
      holSpan.className = "role-pill";
      holSpan.textContent = "祝日休み";
      skillsWrap.appendChild(holSpan);
    }
    if (nurse.forbiddenShifts && nurse.forbiddenShifts.length > 0) {
      const fbSpan = document.createElement("span");
      fbSpan.className = "role-pill";
      fbSpan.textContent = nurse.forbiddenShifts.includes("D")
        ? "夜勤専従(D免除)"
        : `免除:${nurse.forbiddenShifts.join("/")}`;
      skillsWrap.appendChild(fbSpan);
    }

    const editContractBtn = document.createElement("button");
    editContractBtn.type = "button";
    editContractBtn.className = "btn-xs-outline";
    editContractBtn.style.padding = "0.1rem 0.42rem";
    editContractBtn.style.fontSize = "0.72rem";
    editContractBtn.textContent = "⚙️ 契約編集";
    editContractBtn.title = `${nurse.name}の契約プリセット・月間上限・曜日/祝日条件を編集`;
    editContractBtn.addEventListener("click", () => {
      openNurseContractDialog(nurse);
    });
    skillsWrap.appendChild(editContractBtn);

    tdSkills.appendChild(skillsWrap);

    const tdPrev = document.createElement("td");
    const streak = getPrevMonthTailWorkStreak(nurse.prevMonthShifts, appState.customShiftDefs);
    tdPrev.textContent = `${nurse.prevMonthShifts
      .map((s) => getShiftMeta(s, appState.customShiftDefs).shortLabel)
      .join("-")} (末${streak}連)`;

    const td36 = document.createElement("td");
    const y36 = nurse.yearly36Stats;
    td36.textContent = `残業 ${y36.prev11MonthsOvertimeHours}h / 勤務 ${y36.prev11MonthsWorkDays}日 / 夜勤 ${y36.prev11MonthsNightShifts}回 / 有休 ${y36.paidLeaveDaysTaken}日`;
    if (y36.prev11MonthsOvertimeHours >= appState.config.maxAnnualOvertimeHours - 48) {
      td36.className = "stat-36-warn";
    }

    const tdPrefs = document.createElement("td");
    const nPrefs = appState.preferences.filter((p) => p.nurseId === nurse.id);
    tdPrefs.textContent =
      nPrefs.length > 0
        ? nPrefs
            .map(
              (p) =>
                `${p.day}日:${getShiftMeta(p.shift, appState.customShiftDefs).shortLabel}${
                  p.isHard ? "[確]" : "[希]"
                }`
            )
            .join(", ")
        : "なし";

    const tdStats = document.createElement("td");
    const summary = currentEvaluation?.nurseSummaries[nurse.id];
    if (summary) {
      const customParts = (appState.customShiftDefs ?? [])
        .map((cs) => `${cs.shortLabel}:${summary.counts[cs.code] ?? 0}`)
        .join(" / ");
      const customSuffix = customParts ? ` / ${customParts}` : "";
      tdStats.textContent = `日:${summary.counts.D} / 準:${summary.counts.E} / 深:${summary.counts.N} / 休:${summary.counts.O}${customSuffix} ｜ 当月+${summary.estMonthOvertimeHours}h ➔ 年計${summary.projectedAnnualOvertimeHours}h (残${summary.remainingAnnual36Hours}h)`;
      if (summary.is36Warning) {
        tdStats.className = "stat-36-warn";
      }
    } else {
      tdStats.textContent = "-";
    }

    tr.append(tdId, tdName, tdRole, tdSkills, tdPrev, td36, tdPrefs, tdStats);
    tbody.appendChild(tr);
  }
}

function renderModelInspectorSection(): void {
  const codeEl = $("washi-code-preview");
  const lpEl = $("washi-lp-preview");
  const statsBadge = $("lp-stats-badge");

  codeEl.textContent =
    lastSolveOutcome?.modelCodePreview ?? generateWashiCodePreview(appState);
  lpEl.textContent =
    lastSolveOutcome?.lpPreview ?? "計算後に CPLEX LP 形式の式が表示されます。";
  if (lastSolveOutcome) {
    statsBadge.textContent = `${lastSolveOutcome.numVariables} vars / ${lastSolveOutcome.numConstraints} constraints`;
  }
}

function renderAllViews(): void {
  renderStatusAndConflictBar();
  renderScheduleMatrix();
  syncConfigInputsFromState();
  renderStaffProfilesTab();
  renderModelInspectorSection();
}

// ==================== SINGLE-FLIGHT COALESCE SOLVER RUNNER (NEVER FREEZES OR DROPS) ====================
async function runWashiOptimization(): Promise<WashiSolveOutcome | null> {
  if (appState.nurses.length === 0) {
    appendChatMessage({
      role: "assistant",
      senderLabel: "🏥 AI シフト相談",
      initialText:
        "⚠️ **スタッフデータが未登録です（白紙モード）**\n" +
        "まずは右上の **「✨ サンプル生成」** を押して30名のサンプルデータを読み込むか、**「📂 CSV読込」** からお手元の名簿CSVを取り込んでください。",
    });
    renderAllViews();
    return null;
  }

  if (activeSolvePromise) {
    // Coalesce: request a fresh solve of the latest state, abort the superseded HiGHS solve,
    // and return the shared in-flight promise so callers await the latest coalesced outcome.
    pendingSolveRequested = true;
    activeSolveAbortController?.abort();
    return activeSolvePromise;
  }

  isSolving = true;
  renderStatusAndConflictBar();

  activeSolvePromise = (async () => {
    try {
      do {
        pendingSolveRequested = false;
        activeSolveAbortController = new AbortController();
        const signal = activeSolveAbortController.signal;

        // Yield to browser paint so status updates smoothly
        await new Promise((r) => setTimeout(r, 16));
        if (pendingSolveRequested) continue;

        const outcome = await solveNurseScheduleWithWashi(appState, {
          signal,
          timeLimit: 2.5,
          referenceSchedule: currentSchedule,
        });

        // If superseded by a newer click while solving, loop immediately with latest appState
        if (pendingSolveRequested) continue;

        lastSolveOutcome = outcome;
        if (outcome.schedule && outcome.evaluation) {
          currentSchedule = outcome.schedule;
          currentEvaluation = outcome.evaluation;
        } else if (outcome.status === "Infeasible") {
          currentEvaluation = null;
        }
      } while (pendingSolveRequested);

      return lastSolveOutcome;
    } finally {
      isSolving = false;
      activeSolveAbortController = null;
      activeSolvePromise = null;
      renderAllViews();
    }
  })();

  return activeSolvePromise;
}

async function runExplicitConflictDiagnosis(): Promise<WashiSolveOutcome | null> {
  if (activeSolvePromise) {
    await activeSolvePromise;
  }
  if (isSolving) return lastSolveOutcome;
  isSolving = true;
  renderStatusAndConflictBar();
  await new Promise((r) => setTimeout(r, 16));

  try {
    const t0 = performance.now();
    const diag = await diagnoseNurseScheduleWithHiGHS(appState);
    const diagTimeMs = Math.max(1, Math.round(performance.now() - t0));
    const isUnsat = diag.status === "Unsat";
    const diagOutcome: WashiSolveOutcome = {
      status: isUnsat
        ? "Infeasible"
        : lastSolveOutcome?.status && lastSolveOutcome.status !== "Infeasible"
          ? lastSolveOutcome.status
          : "Optimal",
      solverUsed: "HiGHS (WASM)",
      buildTimeMs: lastSolveOutcome?.buildTimeMs ?? 1,
      solveTimeMs: diagTimeMs,
      numVariables: lastSolveOutcome?.numVariables ?? 0,
      numConstraints: lastSolveOutcome?.numConstraints ?? 0,
      objectiveValue: isUnsat ? null : (lastSolveOutcome?.objectiveValue ?? 0),
      validatedByWashi: !isUnsat,
      maxViolation: lastSolveOutcome?.maxViolation ?? 0,
      schedule: isUnsat ? null : currentSchedule,
      evaluation: isUnsat ? null : currentEvaluation,
      lpPreview: lastSolveOutcome?.lpPreview ?? "",
      modelCodePreview:
        lastSolveOutcome?.modelCodePreview ?? generateWashiCodePreview(appState),
      conflicts: diag.conflicts,
      rawConflictNames: diag.rawNames,
      diffFromPrevious: lastSolveOutcome?.diffFromPrevious ?? null,
    };
    lastSolveOutcome = diagOutcome;

    if (diag.status === "Unsat") {
      appendChatMessage({
        role: "system",
        senderLabel: "🔍 矛盾・違反チェック結果",
        initialText:
          `### 🚨 衝突しているルールが検出されました (${diag.conflicts.length}件)\n` +
          diag.conflicts.slice(0, 6).map((c) => `- ${c.labelJa}`).join("\n"),
      });
    } else if (currentEvaluation && currentEvaluation.violations.length > 0) {
      appendChatMessage({
        role: "system",
        senderLabel: "🔍 矛盾・違反チェック結果",
        initialText:
          `### ⚠️ 現在のシフト表に手動固定等による注意箇所があります (${currentEvaluation.violations.length}件)\n` +
          currentEvaluation.violations
            .slice(0, 5)
            .map((v) => `- ${v.message}`)
            .join("\n"),
      });
    } else {
      appendChatMessage({
        role: "system",
        senderLabel: "🔍 矛盾・違反チェック結果",
        initialText:
          `### ✅ 整合性チェック完了（矛盾・違反 0件）\n` +
          `- **前月末7日間の引き継ぎ**（深夜明け・準夜明け遷移・連勤上限）: **クリア**\n` +
          `- **日別必要人数・リーダー配置・NGペア回避**: **クリア**\n` +
          `- **WaSHI \`validateSolution()\` 数理検証**: **全制約クリア (最大誤差 0)**`,
      });
    }
    return diagOutcome;
  } finally {
    isSolving = false;
    renderAllViews();
  }
}

// ==================== SHIFT CELL MODAL DIALOG (<dialog closedby="any">) ====================
function getSelectedCellApplyMode(): "pin_hard" | "pref_soft" | "forbid" {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="cell-apply-mode"]:checked'
  );
  if (checked?.value === "pref_soft" || checked?.value === "forbid") {
    return checked.value;
  }
  return "pin_hard";
}

function renderCellDialogShiftButtons(): void {
  const dialog = $("shift-cell-dialog") as HTMLDialogElement;
  const btnsEl = $("cell-dialog-shift-buttons");
  btnsEl.replaceChildren();

  const mode = getSelectedCellApplyMode();
  const modeSuffix =
    mode === "pref_soft"
      ? " を希望登録"
      : mode === "forbid"
        ? " を禁止して再計算"
        : " に固定して再計算";

  const allShiftChoices: Array<{
    code: ShiftCode;
    shortLabel: string;
    label: string;
    colorClass: string;
  }> = [
    { code: "D", shortLabel: "日", label: "日勤", colorClass: "shift-D" },
    { code: "E", shortLabel: "準", label: "準夜勤", colorClass: "shift-E" },
    { code: "N", shortLabel: "深", label: "深夜勤", colorClass: "shift-N" },
    { code: "O", shortLabel: "休", label: "公休", colorClass: "shift-O" },
    { code: "W", shortLabel: "勤", label: "出勤お任せ (全勤務)", colorClass: "shift-W" },
    { code: "EN", shortLabel: "夜", label: "夜勤お任せ (準/深)", colorClass: "shift-EN" },
  ];
  for (const cs of appState.customShiftDefs ?? []) {
    allShiftChoices.push({
      code: cs.code,
      shortLabel: cs.shortLabel,
      label: cs.label,
      colorClass: "shift-custom",
    });
  }
  for (const alias of appState.shiftAliases ?? []) {
    if (alias.code === "W" || alias.code === "D" || alias.code === "EN") continue;
    allShiftChoices.push({
      code: alias.code,
      shortLabel: alias.shortLabel,
      label: `${alias.label} (${alias.shifts.join("/")})`,
      colorClass: "shift-W",
    });
  }

  for (const choice of allShiftChoices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-pin-shift";
    const badge = document.createElement("span");
    badge.className = `shift-badge ${choice.colorClass}`;
    badge.textContent = choice.shortLabel;
    const strong = document.createElement("strong");
    strong.textContent = choice.label;
    btn.append(badge, document.createTextNode(" "), strong, document.createTextNode(modeSuffix));
    btn.addEventListener("click", () => {
      if (!selectedCellContext) return;
      const { nurseId, day: targetDay } = selectedCellContext;
      dialog.close();
      applyCellShiftChoice(nurseId, targetDay, choice.code, getSelectedCellApplyMode(), true);
    });
    btnsEl.appendChild(btn);
  }
}

function openShiftCellDialog(nurse: NurseProfile, day: number): void {
  selectedCellContext = { nurseId: nurse.id, day };
  const dialog = $("shift-cell-dialog") as HTMLDialogElement;
  const titleEl = $("cell-dialog-title");
  const bodyEl = $("cell-dialog-body");

  const dow = getDayOfWeek(appState.config.year, appState.config.month, day);
  const holidayName = getJapaneseHolidayName(appState.config.year, appState.config.month, day);
  const currentShift: ShiftCode = currentSchedule?.[nurse.id]?.[day - 1] ?? "O";
  const currentMeta = getShiftMeta(currentShift, appState.customShiftDefs);
  titleEl.textContent = `${nurse.name} — ${appState.config.month}/${day} (${WEEKDAY_NAMES_JA[dow]}${
    holidayName ? `・祝日:${holidayName}` : ""
  })`;

  bodyEl.replaceChildren();
  const allSkillDefs = appState.skillDefs ?? createDefaultSkillDefs();
  const heldAttrLabels = allSkillDefs
    .filter((sd) => nurse.skills.includes(sd.code))
    .map((sd) => sd.shortLabel || sd.label)
    .join("・");
  const infoLines: string[] = [
    `現在のシフト: ${currentMeta.label} (${currentMeta.shortLabel})`,
    `属性・スキル: ${heldAttrLabels || "なし"} (${
      nurse.nightOk ? "夜勤可" : "日勤専従"
    })`,
    `前月末のシフト: ${nurse.prevMonthShifts
      .map((s) => getShiftMeta(s, appState.customShiftDefs).shortLabel)
      .join(" → ")} (前月末${getPrevMonthTailWorkStreak(
      nurse.prevMonthShifts,
      appState.customShiftDefs
    )}連勤)`,
    `36協定 直近11ヶ月累計: 残業 ${nurse.yearly36Stats.prev11MonthsOvertimeHours}h / 年間上限 ${appState.config.maxAnnualOvertimeHours}h`,
  ];

  const pref = appState.preferences.find(
    (p) => p.nurseId === nurse.id && p.day === day
  );
  if (pref) {
    const prefMeta = getShiftMeta(pref.shift, appState.customShiftDefs);
    infoLines.push(
      `本人の希望: ${prefMeta.label} (${
        pref.isHard ? "確定希望" : "希望"
      }・${pref.reason})`
    );
  }

  for (const line of infoLines) {
    const p = document.createElement("div");
    p.textContent = line;
    bodyEl.appendChild(p);
  }

  // Pre-check clicked day's weekday in pattern checkboxes
  const wkChecks = document.querySelectorAll<HTMLInputElement>(
    '#cell-pattern-weekdays input[type="checkbox"]'
  );
  wkChecks.forEach((chk) => {
    chk.checked = Number(chk.value) === dow;
  });

  // Sync custom shifts into pattern select
  const patternShiftSelect = document.getElementById("cell-pattern-shift") as HTMLSelectElement | null;
  if (patternShiftSelect) {
    patternShiftSelect.replaceChildren();
    const baseOpts: Array<{ value: string; text: string }> = [
      { value: "O", text: "休 (公休)" },
      { value: "W", text: "勤 (出勤お任せ: 全勤務)" },
      { value: "D", text: "日 (日勤)" },
      { value: "EN", text: "夜 (夜勤お任せ: 準/深)" },
      { value: "E", text: "準 (準夜勤)" },
      { value: "N", text: "深 (深夜勤)" },
    ];
    for (const cs of appState.customShiftDefs ?? []) {
      baseOpts.push({ value: cs.code, text: `${cs.shortLabel} (${cs.label})` });
    }
    for (const opt of baseOpts) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.text;
      patternShiftSelect.appendChild(o);
    }
  }

  renderCellDialogShiftButtons();
  dialog.showModal();
}

function applyCellShiftChoice(
  nurseId: string,
  day: number,
  shift: ShiftCode,
  mode: "pin_hard" | "pref_soft" | "forbid",
  triggerSolve: boolean
): void {
  const nurse = appState.nurses.find((n) => n.id === nurseId);
  if (!nurse) return;

  if (mode === "pref_soft") {
    const { updatedState } = applyChatOperationsToState(appState, [
      {
        op: "add_request",
        nurseNameOrId: nurseId,
        day,
        shift,
        isHard: false,
      },
    ]);
    appState = updatedState;
  } else if (mode === "forbid") {
    const { updatedState } = applyChatOperationsToState(appState, [
      {
        op: "forbid_shift",
        nurseNameOrId: nurseId,
        day,
        forbidShifts: [shift],
      },
    ]);
    appState = updatedState;
  } else {
    pinNurseCellShift(nurseId, day, shift, false);
  }

  renderAllViews();
  if (triggerSolve) {
    void runWashiOptimization();
  }
}

function pinNurseCellShift(nurseId: string, day: number, shift: ShiftCode, triggerSolve: boolean): void {
  const nurse = appState.nurses.find((n) => n.id === nurseId);
  if (!nurse) return;

  if (
    currentSchedule &&
    currentSchedule[nurseId] &&
    shift !== "W" &&
    shift !== "EN"
  ) {
    const nextRow = [...currentSchedule[nurseId]];
    nextRow[day - 1] = shift;
    currentSchedule = { ...currentSchedule, [nurseId]: nextRow };
    currentEvaluation = evaluateNurseSchedule(appState, currentSchedule);
  }

  const reconciled = reconcileCellRulesForPin(appState, nurseId, new Set([day]), shift);
  const shiftMeta = getShiftMeta(shift, appState.customShiftDefs);
  const newRule: CustomConstraintRule = {
    id: `pin_${nurseId}_d${day}_${Date.now()}`,
    description: `${nurse.name}の${appState.config.month}/${day}を「${shiftMeta.label}」に固定`,
    enabled: true,
    kind: "pin_shift",
    nurseId,
    day,
    shift,
  };
  appState = {
    ...appState,
    customRules: [...reconciled.customRules, newRule],
    preferences: reconciled.preferences,
  };

  renderAllViews();
  if (triggerSolve) {
    void runWashiOptimization();
  }
}

// ==================== NURSE CONTRACT & CONDITION MODAL DIALOG ====================
function populateContractModalFieldsFromNurse(nurse: NurseProfile): void {
  ($("contract-night-ok") as HTMLInputElement).checked = nurse.nightOk;
  ($("contract-weekday-only") as HTMLInputElement).checked = Boolean(nurse.weekdayOnly);
  ($("contract-holidays-off") as HTMLInputElement).checked = Boolean(nurse.holidaysOff);

  const fb = nurse.forbiddenShifts ?? [];
  ($("contract-forbid-D") as HTMLInputElement).checked = fb.includes("D");
  ($("contract-forbid-E") as HTMLInputElement).checked = fb.includes("E");
  ($("contract-forbid-N") as HTMLInputElement).checked = fb.includes("N");

  ($("contract-min-work") as HTMLInputElement).value =
    nurse.minMonthlyWorkDays !== undefined ? String(nurse.minMonthlyWorkDays) : "";
  ($("contract-max-work") as HTMLInputElement).value =
    nurse.maxMonthlyWorkDays !== undefined ? String(nurse.maxMonthlyWorkDays) : "";
  ($("contract-min-off") as HTMLInputElement).value =
    nurse.minMonthlyDaysOff !== undefined ? String(nurse.minMonthlyDaysOff) : "";
  ($("contract-max-night") as HTMLInputElement).value =
    nurse.maxMonthlyNightShifts !== undefined ? String(nurse.maxMonthlyNightShifts) : "";
  ($("contract-max-streak") as HTMLInputElement).value =
    nurse.maxConsecutiveWorkDays !== undefined ? String(nurse.maxConsecutiveWorkDays) : "";
}

function openNurseContractDialog(nurse: NurseProfile): void {
  editingContractNurseId = nurse.id;
  const dialog = $("nurse-contract-dialog") as HTMLDialogElement;
  const infoEl = $("contract-dialog-nurse-info");
  const allSkillDefs = appState.skillDefs ?? createDefaultSkillDefs();
  const heldAttrLabels = allSkillDefs
    .filter((sd) => (sd.category === "group" || sd.category === "role") && nurse.skills.includes(sd.code))
    .map((sd) => sd.shortLabel || sd.label)
    .join(" / ");
  infoEl.textContent = `${nurse.name} (${nurse.id}${heldAttrLabels ? ` / ${heldAttrLabels}` : ""})`;
  ($("contract-preset-select") as HTMLSelectElement).value = "";
  populateContractModalFieldsFromNurse(nurse);
  dialog.showModal();
}

// ==================== LEFT PANE: GEMINI NANO CHAT HANDLER ====================
async function handleChatSubmit(userText: string): Promise<void> {
  const trimmed = userText.trim();
  if (!trimmed) return;

  appendChatMessage({
    role: "user",
    senderLabel: "あなた",
    initialText: trimmed,
  });

  const sendBtn = $("btn-chat-send") as HTMLButtonElement;
  const abortBtn = $("btn-chat-abort") as HTMLButtonElement;
  sendBtn.disabled = true;

  const status = await checkAndInitNano(true);
  if (status === "unavailable") {
    sendBtn.disabled = false;
    appendChatMessage({
      role: "system",
      senderLabel: "⚠️ Chrome Built-in AI (Gemini Nano) 未有効",
      initialText:
        "お使いのブラウザでは Chrome 内蔵 AI (`LanguageModel` API / Gemini Nano) が有効になっていないため、AIチャット応答を生成できません（擬似AI応答は行いません）。\n\n右上の「⚙️」ボタンから Chrome フラグ設定手順をご確認いただくか、右側の画面から直接シフト固定・条件変更・最適化をお試しください。",
    });
    const setupDialog = $("nano-setup-dialog") as HTMLDialogElement;
    if (!setupDialog.open) {
      setupDialog.showModal();
    }
    return;
  }

  abortBtn.hidden = false;
  activeChatAbortController = new AbortController();
  const signal = activeChatAbortController.signal;

  const assistantMsg = appendChatMessage({
    role: "assistant",
    senderLabel: "🤖 Gemini Nano × WaSHI",
    initialText: "相談内容を解析中...",
  });

  const turnRecord: TrajectoryTurnRecord = {
    turnIndex: trajectoryTurns.length + 1,
    timestamp: new Date().toISOString(),
    userMessage: trimmed,
    llmCalls: [],
    extractedPlan: {
      intentType: "consult_only",
      operations: [],
    },
    appliedResult: {
      appliedLogs: [],
      customShiftDefsAfter: [...(appState.customShiftDefs ?? [])],
      customRulesAfter: [...appState.customRules],
      configAfter: { ...appState.config },
    },
    solverOutcome: {
      ran: false,
      mode: "none",
    },
    finalAssistantReply: "",
  };
  trajectoryTurns.push(turnRecord);
  syncTrajectoryUI();

  try {
    renderAppliedSummariesInto(
      assistantMsg.opsContainerEl,
      [],
      "⏳ 指示を解析しています…"
    );
    const enrichedPlan = await nanoManager.extractPlan(
      trimmed,
      appState,
      signal,
      (prog) => {
        if (prog.stage1Response) {
          assistantMsg.bodyEl.textContent = prog.stage1Response;
        }
        renderAppliedSummariesInto(
          assistantMsg.opsContainerEl,
          prog.routerTrace,
          prog.activeLabel
        );
        const container = $("chat-messages");
        container.scrollTop = container.scrollHeight;
      }
    );
    turnRecord.llmCalls = [...(enrichedPlan.llmCalls ?? [])];
    turnRecord.extractedPlan = {
      intentType: enrichedPlan.intentType,
      stage1Thought: enrichedPlan.stage1Thought,
      stage1Response: enrichedPlan.stage1Response,
      routerTrace: enrichedPlan.routerTrace,
      operations: enrichedPlan.operations,
    };

    const { updatedState, appliedLogs } = applyChatOperationsToState(
      appState,
      enrichedPlan.operations
    );
    if (enrichedPlan.operations.some((o) => o.op === "reset_default")) {
      currentSchedule = null;
      currentEvaluation = null;
    }
    appState = updatedState;
    turnRecord.appliedResult = {
      appliedLogs,
      customShiftDefsAfter: [...(appState.customShiftDefs ?? [])],
      customRulesAfter: [...appState.customRules],
      configAfter: { ...appState.config },
    };

    const pillSummaries = [...(enrichedPlan.routerTrace ?? []), ...appliedLogs];
    if (pillSummaries.length > 0) {
      renderAppliedSummariesInto(assistantMsg.opsContainerEl, pillSummaries);
    }
    if (appliedLogs.length > 0) {
      syncConfigInputsFromState();
    }

    const autoSolveChecked = ($("chk-auto-solve-on-chat") as HTMLInputElement).checked;
    if (
      (enrichedPlan.intentType === "modify_and_solve" &&
        appliedLogs.length > 0 &&
        autoSolveChecked) ||
      enrichedPlan.intentType === "solve_only"
    ) {
      assistantMsg.bodyEl.textContent = enrichedPlan.stage1Response
        ? `${enrichedPlan.stage1Response}\n（シフトを再計算しています…）`
        : "最適解を求めています…";
      renderAppliedSummariesInto(
        assistantMsg.opsContainerEl,
        pillSummaries,
        "⏳ 最適解を求めています…"
      );
      await runWashiOptimization();
      turnRecord.solverOutcome = {
        ran: true,
        mode: "solve",
        status: lastSolveOutcome?.status,
        buildTimeMs: lastSolveOutcome?.buildTimeMs,
        solveTimeMs: lastSolveOutcome?.solveTimeMs,
        numVariables: lastSolveOutcome?.numVariables,
        numConstraints: lastSolveOutcome?.numConstraints,
        objectiveValue: lastSolveOutcome?.objectiveValue,
        validatedByWashi: lastSolveOutcome?.validatedByWashi,
        maxViolation: lastSolveOutcome?.maxViolation,
        violationCount: lastSolveOutcome?.evaluation?.violations.length ?? 0,
        conflicts: lastSolveOutcome?.conflicts,
        rawConflictNames: lastSolveOutcome?.rawConflictNames,
        errorMessage: lastSolveOutcome?.errorMessage,
      };
      if (lastSolveOutcome) {
        const diff = lastSolveOutcome.diffFromPrevious;
        const diffTag =
          diff && diff.totalCells > 0
            ? ` / 変更 ${diff.changedCellsCount}マス (維持率 ${diff.retentionRatePct}%)`
            : "";
        pillSummaries.push(
          `⚡ WaSHI (HiGHS) 再計算完了: ${lastSolveOutcome.status} (${lastSolveOutcome.solveTimeMs}ms${diffTag})`
        );
        renderAppliedSummariesInto(assistantMsg.opsContainerEl, pillSummaries);
      }
    } else if (enrichedPlan.intentType === "diagnose_conflict") {
      renderAppliedSummariesInto(
        assistantMsg.opsContainerEl,
        pillSummaries,
        "⏳ 矛盾の原因を診断しています…"
      );
      const diagOutcome = await runExplicitConflictDiagnosis();
      turnRecord.solverOutcome = {
        ran: true,
        mode: "diagnose",
        status: diagOutcome?.status,
        solveTimeMs: diagOutcome?.solveTimeMs,
        conflicts: diagOutcome?.conflicts,
        rawConflictNames: diagOutcome?.rawConflictNames,
      };
    } else if (appliedLogs.length > 0) {
      renderAllViews();
    }
    syncTrajectoryUI();

    renderAppliedSummariesInto(
      assistantMsg.opsContainerEl,
      pillSummaries,
      "⏳ 結果をまとめています…"
    );
    const outcomeForTurn = turnRecord.solverOutcome.ran ? lastSolveOutcome : null;
    let fullText = "";
    for await (const chunk of nanoManager.streamConsultationReply(
      trimmed,
      appliedLogs,
      appState,
      outcomeForTurn,
      signal
    )) {
      fullText += chunk;
      // Strictly use renderSafeMarkdown (createElement + textContent, never innerHTML) for LLM output
      renderSafeMarkdown(assistantMsg.bodyEl, fullText);
      const container = $("chat-messages");
      container.scrollTop = container.scrollHeight;
    }
    renderAppliedSummariesInto(assistantMsg.opsContainerEl, pillSummaries);
    turnRecord.finalAssistantReply = fullText;
    const consultTrace = nanoManager.getLastConsultTrace();
    if (consultTrace) {
      turnRecord.llmCalls.push(consultTrace);
    }
    syncTrajectoryUI();
  } catch (err: any) {
    assistantMsg.opsContainerEl.querySelectorAll(".chat-op-pill-active").forEach((el) => el.remove());
    if (assistantMsg.opsContainerEl.children.length === 0) {
      assistantMsg.opsContainerEl.hidden = true;
    }
    turnRecord.error = err?.message ?? String(err);
    syncTrajectoryUI();
    if (err?.name === "AbortError") {
      renderSafeMarkdown(
        assistantMsg.bodyEl,
        `${assistantMsg.bodyEl.textContent ?? ""}\n\n*[停止しました]*`
      );
    } else {
      renderSafeMarkdown(
        assistantMsg.bodyEl,
        `エラーが発生しました: \`${err?.message ?? String(err)}\``
      );
    }
  } finally {
    sendBtn.disabled = false;
    abortBtn.hidden = true;
    activeChatAbortController = null;
  }
}

// ==================== CSV IMPORT / EXPORT / BLANK SLATE HELPERS ====================
function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openCsvDialog(): void {
  pendingCsvNurses = null;
  pendingCsvRequests = null;
  pendingCsvRelations = null;

  const inputNurses = document.getElementById("file-input-nurses") as HTMLInputElement | null;
  const inputReqs = document.getElementById("file-input-requests") as HTMLInputElement | null;
  const inputRels = document.getElementById("file-input-relations") as HTMLInputElement | null;
  if (inputNurses) inputNurses.value = "";
  if (inputReqs) inputReqs.value = "";
  if (inputRels) inputRels.value = "";

  const stN = document.getElementById("file-status-nurses");
  const stReq = document.getElementById("file-status-requests");
  const stRel = document.getElementById("file-status-relations");
  if (stN) {
    stN.textContent = "未選択";
    stN.className = "csv-file-status";
  }
  if (stReq) {
    stReq.textContent = "未選択";
    stReq.className = "csv-file-status";
  }
  if (stRel) {
    stRel.textContent = "未選択";
    stRel.className = "csv-file-status";
  }

  const feedbackEl = document.getElementById("csv-import-feedback");
  if (feedbackEl) feedbackEl.hidden = true;

  const execBtn = document.getElementById("btn-execute-csv-import") as HTMLButtonElement | null;
  if (execBtn) execBtn.disabled = true;

  const dialog = document.getElementById("csv-import-dialog") as HTMLDialogElement | null;
  if (dialog) dialog.showModal();
}

function checkImportReadiness(): void {
  const feedbackEl = document.getElementById("csv-import-feedback");
  const execBtn = document.getElementById("btn-execute-csv-import") as HTMLButtonElement | null;

  if (!pendingCsvNurses || pendingCsvNurses.length === 0) {
    if (execBtn) execBtn.disabled = true;
    if (feedbackEl) feedbackEl.hidden = true;
    return;
  }

  const customCodes = new Set((appState.customShiftDefs ?? []).map((c) => c.code));
  const validation = validateNurseDataset(
    pendingCsvNurses,
    pendingCsvRequests ?? [],
    pendingCsvRelations ?? [],
    appState.config.numDays,
    customCodes
  );

  if (!validation.valid) {
    if (execBtn) execBtn.disabled = true;
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.className = "csv-feedback-box";
      feedbackEl.innerHTML = `⚠️ <strong>データの不整合を検出しました:</strong><br>${validation.errors.join("<br>")}`;
    }
    return;
  }

  if (execBtn) execBtn.disabled = false;
  if (feedbackEl) {
    feedbackEl.hidden = false;
    feedbackEl.className = "csv-feedback-box is-success";
    const reqCount = pendingCsvRequests?.length ?? 0;
    const relCount = pendingCsvRelations?.length ?? 0;
    feedbackEl.innerHTML = `✅ <strong>インポート準備完了:</strong> 看護師 ${pendingCsvNurses.length}名、希望 ${reqCount}件、ペア ${relCount}件`;
  }
}

function executeCsvImport(): void {
  if (!pendingCsvNurses || pendingCsvNurses.length === 0) return;

  appState = {
    ...createBlankNurseSchedulingState({
      year: appState.config.year,
      month: appState.config.month,
      numDays: appState.config.numDays,
      staffCount: pendingCsvNurses.length,
    }),
    nurses: pendingCsvNurses,
    preferences: pendingCsvRequests ?? [],
    relations: pendingCsvRelations ?? [],
    customRules: [],
  };

  currentSchedule = null;
  currentEvaluation = null;
  lastSolveOutcome = null;

  const dialog = document.getElementById("csv-import-dialog") as HTMLDialogElement | null;
  if (dialog) dialog.close();

  renderAllViews();
  switchTab("schedule");

  appendChatMessage({
    role: "assistant",
    senderLabel: "🏥 AI シフト相談",
    initialText:
      `📂 **CSVデータを正常にインポートしました**\n` +
      `- **看護師名簿**: ${appState.nurses.length}名\n` +
      `- **シフト希望**: ${appState.preferences.length}件\n` +
      `- **相性・ペア制約**: ${appState.relations.length}件\n\n` +
      `右上の **「⚡ シフトを自動作成」** ボタンを押すと最適化計算を開始します！`,
  });
}

function handleDownloadAllSamples(): void {
  downloadTextFile("nurses_sample.csv", getSampleNursesCsv());
  setTimeout(() => {
    downloadTextFile("requests_sample.csv", getSampleRequestsCsv());
  }, 200);
  setTimeout(() => {
    downloadTextFile("relations_sample.csv", getSampleRelationsCsv());
  }, 400);
}

function handleExportCsvs(): void {
  if (appState.nurses.length === 0) {
    alert("エクスポートするスタッフデータがありません。");
    return;
  }
  downloadTextFile("nurses.csv", exportNursesCsv(appState.nurses));
  setTimeout(() => {
    downloadTextFile("requests.csv", exportRequestsCsv(appState.preferences));
  }, 200);
  setTimeout(() => {
    downloadTextFile("relations.csv", exportRelationsCsv(appState.relations));
  }, 400);
}

function handleGenerateSample(staffCount = 30, autoSwitchToSchedule = false): void {
  currentSeed += 7;
  appState = generateNurseSchedulingState({
    year: appState.config.year,
    month: appState.config.month,
    staffCount,
    seed: currentSeed,
  });
  currentSchedule = null;
  currentEvaluation = null;
  lastSolveOutcome = null;

  renderAllViews();
  if (autoSwitchToSchedule) {
    switchTab("schedule");
  } else {
    switchTab("staff");
  }

  appendChatMessage({
    role: "assistant",
    senderLabel: "🏥 AI シフト相談",
    initialText:
      `✨ **${staffCount}名・3交代制の基礎データをセットしました**\n` +
      `「基礎データ」タブで看護師名簿・スキル・前月末実績・希望シフト・相性ペアを確認できます。\n\n` +
      `**次のステップ**:\n` +
      `1. 「⚙️ 条件・ルール設定」タブで必要出勤人数（日勤/準夜/深夜）・連勤上限・夜勤ルール等を確認・調整\n` +
      `2. 「⚡ シフトを自動作成」ボタンを押してシフトを一括最適化（HiGHS）\n` +
      `3. シフト表の完成後、このチャットで個別の調整や相談ができます。`,
  });
}

function handleClearBlank(): void {
  appState = createBlankNurseSchedulingState({
    year: appState.config.year,
    month: appState.config.month,
    numDays: appState.config.numDays,
  });
  currentSchedule = null;
  currentEvaluation = null;
  lastSolveOutcome = null;

  renderAllViews();
  switchTab("staff");

  appendChatMessage({
    role: "assistant",
    senderLabel: "🏥 AI シフト相談",
    initialText: "🗑️ **シフト・スタッフデータをすべてクリアして白紙状態に戻しました。**",
  });
}

// ==================== INITIALIZATION & EVENT LISTENERS ====================
function setupEventListeners(): void {
  // Theme toggle
  const themeBtn = $("ai-shift-theme-btn");
  const updateThemeIcon = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  };
  updateThemeIcon();
  themeBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("washi-theme", next);
      localStorage.setItem("vitepress-theme-appearance", next);
    } catch (_) {}
    updateThemeIcon();
  });

  // Tutorial banner toggle & interactive step buttons
  const tutorialBanner = $("tutorial-banner");
  $("btn-toggle-tutorial").addEventListener("click", () => {
    tutorialBanner.hidden = !tutorialBanner.hidden;
  });
  $("btn-close-tutorial").addEventListener("click", () => {
    tutorialBanner.hidden = true;
  });

  // 4-Step Interactive Tutorial Workflow Buttons
  // Step 1: Generate sample data or load CSV (stays on staff master data tab)
  $("btn-tut-step1")?.addEventListener("click", () => {
    handleGenerateSample(30, false);
    switchTab("staff");
  });

  // Step 2: Review and tweak constraints (switches to constraints tab)
  $("btn-tut-step2")?.addEventListener("click", () => {
    switchTab("constraints");
  });

  // Step 3: Auto-solve nurse schedule (switches to schedule tab and optimizes)
  $("btn-tut-step3")?.addEventListener("click", () => {
    if (appState.nurses.length === 0) {
      handleGenerateSample(30, true);
    } else {
      switchTab("schedule");
    }
    readConfigInputsToState();
    void runWashiOptimization();
  });

  // Step 4: AI consultation and fine-tuning (switches to schedule and focuses chat)
  $("btn-tut-step4")?.addEventListener("click", () => {
    switchTab("schedule");
    const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
    if (chatInput) {
      chatInput.value = "佐藤さんの15日を「休」にして、夜勤回数のバランスを再調整して";
      chatInput.focus();
    }
  });

  // Workflow Next-Step Banners & Conflict Demo Button
  $("btn-cat-go-constraints")?.addEventListener("click", () => {
    switchTab("constraints");
  });

  $("btn-cat-go-schedule")?.addEventListener("click", () => {
    switchTab("schedule");
    readConfigInputsToState();
    void runWashiOptimization();
  });

  $("btn-constraints-go-schedule")?.addEventListener("click", () => {
    switchTab("schedule");
    readConfigInputsToState();
    void runWashiOptimization();
  });

  $("btn-test-conflict-scenario")?.addEventListener("click", () => {
    if (appState.nurses.length === 0) handleGenerateSample(30, true);
    switchTab("schedule");
    const scenario = (($("select-conflict-scenario") as HTMLSelectElement | null)?.value ??
      "carryover_clash") as "leader_shortage" | "carryover_clash" | "overload_day";
    const { updatedState, descriptionJa } = injectConflictScenario(appState, scenario);
    appState = updatedState;
    syncConfigInputsFromState();
    appendChatMessage({
      role: "system",
      senderLabel: "🧪 矛盾診断テスト",
      initialText:
        `### 💥 デモ用の矛盾ルールを追加しました\n` +
        `- ${descriptionJa}\n` +
        `- 右上の赤いアラートに、**WaSHI (HiGHS)** が特定した衝突原因が表示されています。**「✨ 衝突している追加ルールを解除して解決」** を押すと元の正常なシフトに戻ります。\n`,
    });
    void runWashiOptimization();
  });

  // Tabs switching
  const tabBtns = document.querySelectorAll<HTMLButtonElement>(".results-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab as "schedule" | "constraints" | "staff";
      if (targetTab) switchTab(targetTab);
    });
  });

  // Schedule filters
  $("filter-role").addEventListener("change", () => {
    renderScheduleMatrix();
  });
  $("chk-show-all-prev").addEventListener("change", () => {
    renderScheduleMatrix();
  });
  $("chk-highlight-diff").addEventListener("change", () => {
    renderScheduleMatrix();
  });
  $("chk-preserve-schedule").addEventListener("change", () => {
    const chk = $("chk-preserve-schedule") as HTMLInputElement;
    appState = {
      ...appState,
      config: {
        ...appState.config,
        preserveCurrentSchedule: chk.checked,
      },
    };
  });

  // Top action bar buttons
  $("btn-solve-washi").addEventListener("click", () => {
    readConfigInputsToState();
    switchTab("schedule");
    void runWashiOptimization();
  });

  $("btn-abort-solve").addEventListener("click", () => {
    pendingSolveRequested = false;
    activeSolveAbortController?.abort();
  });

  $("btn-check-current").addEventListener("click", () => {
    readConfigInputsToState();
    void runExplicitConflictDiagnosis();
  });

  $("btn-diagnose-conflict").addEventListener("click", () => {
    readConfigInputsToState();
    void runExplicitConflictDiagnosis();
  });

  const resetToCleanState = () => {
    currentSchedule = null;
    currentEvaluation = null;
    void nanoManager.resetConversation();
    if (appState.nurses.length === 0) {
      appState = createBlankNurseSchedulingState({
        year: appState.config.year,
        month: appState.config.month,
        numDays: appState.config.numDays,
      });
      renderAllViews();
      return;
    }
    appState = generateNurseSchedulingState({
      year: appState.config.year,
      month: appState.config.month,
      staffCount: appState.nurses.length,
      seed: currentSeed,
    });
    syncConfigInputsFromState();
    void runWashiOptimization();
  };

  $("btn-reset-clean")?.addEventListener("click", resetToCleanState);
  $("btn-reset-default-config")?.addEventListener("click", resetToCleanState);

  // Top Action Bar & Empty State CSV / Sample / Clear Actions
  $("btn-generate-sample")?.addEventListener("click", () => handleGenerateSample(30));
  $("btn-empty-generate")?.addEventListener("click", () => handleGenerateSample(30));
  $("btn-cat-generate-sample")?.addEventListener("click", () => {
    const c = Number(($("input-staff-count") as HTMLInputElement | null)?.value) || 30;
    handleGenerateSample(c);
  });

  $("btn-open-csv-dialog")?.addEventListener("click", openCsvDialog);
  $("btn-empty-csv")?.addEventListener("click", openCsvDialog);
  $("btn-cat-import-csv")?.addEventListener("click", openCsvDialog);

  $("btn-export-csvs")?.addEventListener("click", handleExportCsvs);
  $("btn-clear-blank")?.addEventListener("click", handleClearBlank);
  $("btn-cat-clear-blank")?.addEventListener("click", handleClearBlank);

  // CSV Dialog Events
  $("btn-close-csv-dialog")?.addEventListener("click", () => {
    ($("csv-import-dialog") as HTMLDialogElement | null)?.close();
  });
  $("btn-close-csv-dialog-cancel")?.addEventListener("click", () => {
    ($("csv-import-dialog") as HTMLDialogElement | null)?.close();
  });
  $("btn-dl-sample-nurses")?.addEventListener("click", () => {
    downloadTextFile("nurses_sample.csv", getSampleNursesCsv());
  });
  $("btn-dl-sample-requests")?.addEventListener("click", () => {
    downloadTextFile("requests_sample.csv", getSampleRequestsCsv());
  });
  $("btn-dl-sample-relations")?.addEventListener("click", () => {
    downloadTextFile("relations_sample.csv", getSampleRelationsCsv());
  });
  $("btn-dl-all-samples")?.addEventListener("click", handleDownloadAllSamples);
  $("btn-empty-samples")?.addEventListener("click", handleDownloadAllSamples);
  $("btn-cat-download-samples")?.addEventListener("click", handleDownloadAllSamples);

  $("btn-execute-csv-import")?.addEventListener("click", executeCsvImport);

  $("file-input-nurses")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const st = $("file-status-nurses");
    if (!file) {
      pendingCsvNurses = null;
      st.textContent = "未選択";
      st.className = "csv-file-status";
      checkImportReadiness();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      const parsed = parseNursesCsv(text);
      if (parsed.errors.length > 0) {
        pendingCsvNurses = null;
        st.textContent = `❌ ${parsed.errors[0]}`;
        st.className = "csv-file-status is-error";
      } else {
        pendingCsvNurses = parsed.nurses;
        st.textContent = `✅ ${parsed.nurses.length}名 読み込み完了`;
        st.className = "csv-file-status is-ready";
      }
      checkImportReadiness();
    };
    reader.readAsText(file, "utf-8");
  });

  $("file-input-requests")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const st = $("file-status-requests");
    if (!file) {
      pendingCsvRequests = null;
      st.textContent = "未選択";
      st.className = "csv-file-status";
      checkImportReadiness();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      const knownIds = pendingCsvNurses ? new Set(pendingCsvNurses.map((n) => n.id)) : undefined;
      const customCodes = new Set((appState.customShiftDefs ?? []).map((c) => c.code));
      const parsed = parseRequestsCsv(text, knownIds, customCodes);
      if (parsed.errors.length > 0) {
        pendingCsvRequests = null;
        st.textContent = `❌ ${parsed.errors[0]}`;
        st.className = "csv-file-status is-error";
      } else {
        pendingCsvRequests = parsed.preferences;
        st.textContent = `✅ ${parsed.preferences.length}件 読み込み完了`;
        st.className = "csv-file-status is-ready";
      }
      checkImportReadiness();
    };
    reader.readAsText(file, "utf-8");
  });

  $("file-input-relations")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const st = $("file-status-relations");
    if (!file) {
      pendingCsvRelations = null;
      st.textContent = "未選択";
      st.className = "csv-file-status";
      checkImportReadiness();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      const knownIds = pendingCsvNurses ? new Set(pendingCsvNurses.map((n) => n.id)) : undefined;
      const customCodes = new Set((appState.customShiftDefs ?? []).map((c) => c.code));
      const parsed = parseRelationsCsv(text, knownIds, customCodes);
      if (parsed.errors.length > 0) {
        pendingCsvRelations = null;
        st.textContent = `❌ ${parsed.errors[0]}`;
        st.className = "csv-file-status is-error";
      } else {
        pendingCsvRelations = parsed.relations;
        st.textContent = `✅ ${parsed.relations.length}件 読み込み完了`;
        st.className = "csv-file-status is-ready";
      }
      checkImportReadiness();
    };
    reader.readAsText(file, "utf-8");
  });

  $("btn-add-skill-def").addEventListener("click", () => {
    const nameInput = $("input-new-skill-name") as HTMLInputElement;
    const subSelect = $("select-new-skill-sub") as HTMLSelectElement;
    const minDInput = $("input-new-skill-min-d") as HTMLInputElement;
    const minEInput = $("input-new-skill-min-e") as HTMLInputElement;
    const minNInput = $("input-new-skill-min-n") as HTMLInputElement;

    const rawName = nameInput.value.trim();
    if (!rawName) return;

    const { updatedState, appliedLogs } = applyChatOperationsToState(appState, [
      {
        op: "add_skill_def",
        skillName: rawName,
        substitutesFor: subSelect.value ? subSelect.value : undefined,
        skillMinDay: Number(minDInput.value) || 0,
        skillMinEvening: Number(minEInput.value) || 0,
        skillMinNight: Number(minNInput.value) || 0,
      },
    ]);
    appState = updatedState;
    nameInput.value = "";
    subSelect.value = "";
    minDInput.value = "0";
    minEInput.value = "0";
    minNInput.value = "0";
    renderAllViews();
    if (appliedLogs.length > 0) {
      appendChatMessage({
        role: "system",
        senderLabel: "🎖️ スキル・資格追加",
        initialText: appliedLogs.map((l) => `- ${l}`).join("\n"),
      });
    }
    void runWashiOptimization();
  });

  const baseShiftSelect = document.getElementById(
    "select-new-custom-shift-base"
  ) as HTMLSelectElement | null;
  if (baseShiftSelect) {
    baseShiftSelect.addEventListener("change", () => {
      const b = baseShiftSelect.value;
      const chkW = document.getElementById("chk-custom-alias-W") as HTMLInputElement | null;
      const chkD = document.getElementById("chk-custom-alias-D") as HTMLInputElement | null;
      const chkEN = document.getElementById("chk-custom-alias-EN") as HTMLInputElement | null;
      if (chkW) chkW.checked = b !== "O";
      if (chkD) chkD.checked = false;
      if (chkEN) chkEN.checked = b === "E" || b === "N";
    });
  }

  $("btn-add-custom-shift-def").addEventListener("click", () => {
    const codeInput = $("input-new-custom-shift-code") as HTMLInputElement;
    const shortInput = $("input-new-custom-shift-short") as HTMLInputElement;
    const labelInput = $("input-new-custom-shift-label") as HTMLInputElement;
    const baseSel = document.getElementById("select-new-custom-shift-base") as HTMLSelectElement | null;
    const chkW = document.getElementById("chk-custom-alias-W") as HTMLInputElement | null;
    const chkD = document.getElementById("chk-custom-alias-D") as HTMLInputElement | null;
    const chkEN = document.getElementById("chk-custom-alias-EN") as HTMLInputElement | null;

    const rawLabel = labelInput.value.trim();
    if (!rawLabel) return;
    const rawCode = codeInput.value.trim();
    const rawShort = shortInput.value.trim();
    const baseShift = ((baseSel?.value as "D" | "E" | "N" | "O") || "D");
    const includedInAliases: string[] = [];
    if (chkW?.checked) includedInAliases.push("W");
    if (chkD?.checked) includedInAliases.push("D");
    if (chkEN?.checked) includedInAliases.push("EN");

    const { updatedState, appliedLogs } = applyChatOperationsToState(appState, [
      {
        op: "add_custom_shift",
        shift: rawCode || undefined,
        shiftName: rawLabel,
        shortLabel: rawShort || undefined,
        baseShift,
        includedInAliases,
      },
    ]);
    if (appliedLogs.length === 0) {
      appendChatMessage({
        role: "system",
        senderLabel: "⚠️ カスタムシフト追加エラー",
        initialText: `指定されたコード「${rawCode || rawLabel}」は予約コード（D/E/N/O/W/EN）または既存のカスタムシフトと重複しているため追加できません。別のコードを指定してください。`,
      });
      return;
    }
    appState = updatedState;
    codeInput.value = "";
    shortInput.value = "";
    labelInput.value = "";
    renderAllViews();
    appendChatMessage({
      role: "system",
      senderLabel: "🏷️ カスタムシフト追加",
      initialText: appliedLogs.map((l) => `- ${l}`).join("\n"),
    });
    void runWashiOptimization();
  });

  const btnAddStaffingRule = document.getElementById("btn-add-staffing-rule");
  if (btnAddStaffingRule) {
    btnAddStaffingRule.addEventListener("click", () => {
      const shiftSel = $("select-staffing-shift") as HTMLSelectElement;
      const attrSel = $("select-staffing-attr") as HTMLSelectElement;
      const minIn = $("input-staffing-min") as HTMLInputElement;
      const maxIn = $("input-staffing-max") as HTMLInputElement;
      const hardSel = $("select-staffing-hardness") as HTMLSelectElement;

      const targetShift = shiftSel.value || "D";
      const attribute = attrSel.value || "leader_cap";
      const minVal = minIn.value.trim() !== "" ? Number(minIn.value) : undefined;
      const maxVal = maxIn.value.trim() !== "" ? Number(maxIn.value) : undefined;
      if (minVal === undefined && maxVal === undefined) return;

      const hardVal = hardSel.value || "hard";
      const isHard = hardVal === "hard";
      const penaltyWeight = isHard ? undefined : Number(hardVal.split(":")[1]) || 40;

      const { updatedState, appliedLogs } = applyChatOperationsToState(appState, [
        {
          op: "set_staffing_rule",
          targetShift,
          attribute,
          minCount: minVal,
          maxCount: maxVal,
          isHard: isHard ? undefined : false,
          penaltyWeight,
        },
      ]);
      appState = updatedState;
      minIn.value = "";
      maxIn.value = "";
      renderAllViews();
      if (appliedLogs.length > 0) {
        appendChatMessage({
          role: "system",
          senderLabel: "🎖️ シフト別スキル人数ルール追加",
          initialText: appliedLogs.map((l) => `- ${l}`).join("\n"),
        });
      }
      void runWashiOptimization();
    });
  }

  // Conflict Alert buttons
  $("btn-clear-custom-conflicts").addEventListener("click", () => {
    resetToCleanState();
  });

  $("btn-ask-nano-conflict").addEventListener("click", () => {
    const conflictSummary =
      lastSolveOutcome?.conflicts
        .slice(0, 4)
        .map((c) => c.labelJa)
        .join(" / ") ?? "";
    const promptText = `現在シフトが組めず、以下の矛盾(${conflictSummary})が検出されました。どう調整すれば解決できるか教えて。`;
    ($("chat-input") as HTMLTextAreaElement).value = promptText;
    void handleChatSubmit(promptText);
  });

  // Tab 2 Settings apply button
  $("btn-apply-config-solve").addEventListener("click", () => {
    readConfigInputsToState();
    switchTab("schedule");
    void runWashiOptimization();
  });

  // Popover Prompt Chips (Auto-close popover on selection)
  const popoverEl = $("prompt-examples-popover") as HTMLElement & {
    hidePopover?: () => void;
  };
  const chips = document.querySelectorAll<HTMLButtonElement>(".prompt-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.dataset.prompt ?? "";
      const input = $("chat-input") as HTMLTextAreaElement;
      input.value = prompt;
      if (typeof popoverEl.hidePopover === "function") {
        try {
          popoverEl.hidePopover();
        } catch (_) {}
      }
      input.focus();
    });
  });

  // Chat Form Submit & Keyboard Shortcut
  const chatForm = $("chat-form") as HTMLFormElement;
  const chatInput = $("chat-input") as HTMLTextAreaElement;

  chatForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = chatInput.value;
    if (!text.trim()) return;
    chatInput.value = "";
    void handleChatSubmit(text);
  });

  chatInput.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      chatForm.requestSubmit();
    }
  });

  $("btn-chat-abort").addEventListener("click", () => {
    if (activeChatAbortController) {
      activeChatAbortController.abort();
    }
  });

  // Shift Cell Dialog controls
  const cellDialog = $("shift-cell-dialog") as HTMLDialogElement;
  $("btn-close-cell-dialog").addEventListener("click", () => {
    cellDialog.close();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="cell-apply-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      renderCellDialogShiftButtons();
    });
  });

  $("btn-apply-cell-pattern").addEventListener("click", () => {
    if (!selectedCellContext) return;
    const { nurseId } = selectedCellContext;
    const selectedDows: number[] = [];
    document
      .querySelectorAll<HTMLInputElement>('#cell-pattern-weekdays input[type="checkbox"]:checked')
      .forEach((chk) => {
        const v = Number(chk.value);
        if (Number.isInteger(v) && v >= 0 && v <= 6) selectedDows.push(v);
      });
    const holidays = (
      ($("cell-pattern-holidays") as HTMLSelectElement).value || "ignore"
    ) as HolidayFilterMode;
    const shift = (($("cell-pattern-shift") as HTMLSelectElement).value || "O") as ShiftCode;
    const exclusiveOff = ($("cell-pattern-exclusive-off") as HTMLInputElement).checked;
    const mode = getSelectedCellApplyMode();
    const matchedDays = resolveDaysBySelector(
      appState.config.year,
      appState.config.month,
      appState.config.numDays,
      { kind: "pattern", daysOfWeek: selectedDows, holidays }
    );
    if (matchedDays.length === 0) return;

    const { updatedState } = applyChatOperationsToState(appState, [
      mode === "forbid"
        ? {
            op: "forbid_shift",
            nurseNameOrId: nurseId,
            days: matchedDays,
            forbidShifts: [shift],
          }
        : {
            op: "add_request",
            nurseNameOrId: nurseId,
            days: matchedDays,
            shift,
            isHard: mode !== "pref_soft",
            onlyMatchedDaysWork: exclusiveOff,
            isCalendarPattern: true,
          },
    ]);
    appState = updatedState;
    cellDialog.close();
    renderAllViews();
    void runWashiOptimization();
  });

  $("btn-unpin-cell").addEventListener("click", () => {
    if (selectedCellContext) {
      const { nurseId, day } = selectedCellContext;
      appState = {
        ...appState,
        customRules: appState.customRules.filter(
          (r) => !(r.nurseId === nurseId && r.day === day)
        ),
        preferences: appState.preferences.filter(
          (p) => !(p.nurseId === nurseId && p.day === day)
        ),
      };
      cellDialog.close();
      renderAllViews();
      void runWashiOptimization();
    }
  });

  // Nurse Contract Dialog controls
  const contractDialog = $("nurse-contract-dialog") as HTMLDialogElement;
  $("btn-close-contract-dialog").addEventListener("click", () => {
    contractDialog.close();
  });
  $("btn-cancel-contract-dialog").addEventListener("click", () => {
    contractDialog.close();
  });

  $("contract-preset-select").addEventListener("change", () => {
    if (!editingContractNurseId) return;
    const nurse = appState.nurses.find((n) => n.id === editingContractNurseId);
    if (!nurse) return;
    const presetVal = ($("contract-preset-select") as HTMLSelectElement).value as
      | ContractPresetId
      | "";
    if (!presetVal) return;
    const previewNurse = applyContractPresetToNurse(nurse, presetVal);
    populateContractModalFieldsFromNurse(previewNurse);
  });

  $("btn-reset-nurse-contract").addEventListener("click", () => {
    if (!editingContractNurseId) return;
    const targetId = editingContractNurseId;
    appState = clearNurseContractFromState(appState, targetId, { resetNightOk: true });
    contractDialog.close();
    renderAllViews();
    void runWashiOptimization();
  });

  $("btn-save-nurse-contract").addEventListener("click", () => {
    if (!editingContractNurseId) return;
    const targetId = editingContractNurseId;
    const nightOk = ($("contract-night-ok") as HTMLInputElement).checked;
    const weekdayOnly = ($("contract-weekday-only") as HTMLInputElement).checked;
    const holidaysOff = ($("contract-holidays-off") as HTMLInputElement).checked;

    const forbiddenShifts: ActiveShiftCode[] = [];
    if (($("contract-forbid-D") as HTMLInputElement).checked) forbiddenShifts.push("D");
    if (($("contract-forbid-E") as HTMLInputElement).checked) forbiddenShifts.push("E");
    if (($("contract-forbid-N") as HTMLInputElement).checked) forbiddenShifts.push("N");

    const parseOptNum = (id: string): number | undefined => {
      const raw = ($(id) as HTMLInputElement).value.trim();
      if (!raw) return undefined;
      const v = Number(raw);
      return Number.isFinite(v) ? v : undefined;
    };

    const minMonthlyWorkDays = parseOptNum("contract-min-work");
    const maxMonthlyWorkDays = parseOptNum("contract-max-work");
    const minMonthlyDaysOff = parseOptNum("contract-min-off");
    const maxMonthlyNightShifts = parseOptNum("contract-max-night");
    const maxConsecutiveWorkDays = parseOptNum("contract-max-streak");

    const clearedState = clearNurseContractFromState(appState, targetId);
    const { updatedState } = applyChatOperationsToState(clearedState, [
      {
        op: "set_nurse_contract",
        nurseNameOrId: targetId,
        nightOk,
        weekdayOnly,
        holidaysOff,
        forbiddenShifts,
        minMonthlyWorkDays,
        maxMonthlyWorkDays,
        minMonthlyDaysOff,
        maxMonthlyNightShifts,
        maxConsecutiveWorkDays,
      },
    ]);
    appState = updatedState;
    contractDialog.close();
    renderAllViews();
    void runWashiOptimization();
  });

  // Fallback for browsers that do not yet support `<dialog closedby="any">`
  if (
    typeof HTMLDialogElement !== "undefined" &&
    !("closedBy" in HTMLDialogElement.prototype)
  ) {
    document.querySelectorAll<HTMLDialogElement>("dialog.shift-dialog").forEach((dlg) => {
      dlg.addEventListener("click", (event) => {
        const rect = dlg.getBoundingClientRect();
        const isInDialog =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInDialog) {
          dlg.close();
        }
      });
    });
  }

  // Gemini Nano Setup Dialog controls
  const nanoDialog = $("nano-setup-dialog") as HTMLDialogElement;
  $("btn-nano-setup-help").addEventListener("click", () => {
    nanoDialog.showModal();
  });
  $("btn-open-nano-modal").addEventListener("click", () => {
    nanoDialog.showModal();
  });
  $("btn-close-nano-dialog").addEventListener("click", () => {
    nanoDialog.close();
  });
  $("btn-dialog-close-ok").addEventListener("click", () => {
    nanoDialog.close();
  });
  $("btn-retry-nano").addEventListener("click", () => {
    void checkAndInitNano(true);
  });
  $("btn-dialog-recheck-nano").addEventListener("click", () => {
    void checkAndInitNano(true);
  });

  // Trajectory Inspector & Export Dialog controls
  const trajectoryDialog = $("trajectory-dialog") as HTMLDialogElement;
  $("btn-open-trajectory").addEventListener("click", () => {
    syncTrajectoryUI();
    trajectoryDialog.showModal();
  });
  $("btn-close-trajectory-dialog").addEventListener("click", () => {
    trajectoryDialog.close();
  });
  $("btn-copy-trajectory").addEventListener("click", async () => {
    const jsonText = JSON.stringify(buildTrajectoryExport(), null, 2);
    const copyBtn = $("btn-copy-trajectory");
    const origLabel = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(jsonText);
      copyBtn.textContent = "✅ クリップボードにコピーしました！";
      setTimeout(() => {
        copyBtn.textContent = origLabel;
      }, 2000);
    } catch {
      copyBtn.textContent = "⚠️ 下のプレビューからコピーしてください";
      setTimeout(() => {
        copyBtn.textContent = origLabel;
      }, 2500);
    }
  });
  $("btn-download-trajectory").addEventListener("click", () => {
    const jsonText = JSON.stringify(buildTrajectoryExport(), null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `washi-ai-shift-trajectory-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  $("btn-clear-trajectory").addEventListener("click", () => {
    trajectoryTurns.length = 0;
    syncTrajectoryUI();
  });
}

async function bootstrap(): Promise<void> {
  setupEventListeners();
  syncConfigInputsFromState();

  switchTab("staff");

  appendChatMessage({
    role: "assistant",
    senderLabel: "🏥 AI シフト相談",
    initialText:
      "### 🏥 ナーススケジューリング AI Copilot (白紙モード)\n" +
      "大学時間割と同様に、**①データ準備 → ②制約調整 → ③シフト自動作成 → ④AI相談・個別調整** の手順で進めます。\n\n" +
      "1. **データ準備**: まずは「✨ サンプル生成」で標準30名のデータをセットするか、「📂 CSV読込」から名簿を取り込みます。\n" +
      "2. **制約調整**: 「⚙️ 条件・ルール設定」タブにあらかじめ基本的な人員基準や連勤制限が設定されています。必要に応じて調整できます。\n" +
      "3. **シフト自動作成**: 「⚡ シフトを自動作成」ボタンを押すと、数理最適化ソルバー（HiGHS）が最適な勤務割を編成します。\n" +
      "4. **AI相談・調整**: シフト表のマス目クリックやこのチャットで、個別希望の追加や微調整ができます。",
  });

  // Check LanguageModel availability and pre-warm session if already available
  void checkGeminiNanoAvailability().then((st) => {
    updateNanoStatusUI(st);
    if (st === "available") {
      void checkAndInitNano(true);
    }
  });

  renderAllViews();
}

void bootstrap();
