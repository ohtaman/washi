import {
  DAYS_OF_WEEK,
  PERIODS,
  STUDENT_COHORTS,
  type AiTimetableTrajectoryExport,
  type AssignedSession,
  type CustomRuleKind,
  type TimetableDay,
  type TimetableEvaluationReport,
  type TimetablePeriod,
  type TimetableState,
  type TrajectoryTurnRecord,
  type WashiTimetableSolveOutcome,
  type WeeklyTimetableSolution,
} from "./types";
import {
  CATEGORY_I18N,
  COHORT_I18N,
  DAY_FULL_I18N,
  DAY_HEADER_I18N,
  DAY_SHORT_I18N,
  EQUIPMENT_I18N,
  ROOM_TYPE_I18N,
  UI_TEXT_I18N,
  formatConstraintMetaI18n,
  formatCustomRuleI18n,
  formatPeriodI18n,
  formatSlotI18n,
  formatSlotReasonI18n,
  getCourseI18n,
  getProfessorI18n,
  getRoomI18n,
  getTimetableLang,
  pickTimetableLang,
  setTimetableLang,
  type TimetableLang,
} from "./i18n";
import {
  generateTimetableState,
  injectTimetableConflictScenario,
} from "./generator";
import {
  diagnoseTimetableWithHiGHS,
  solveTimetableWithWashi,
} from "./solver";
import {
  applyTimetableChatOperationsToState,
  createTimetableGeminiNanoManager,
  type GeminiNanoStatus,
} from "./nano-client";

export type TimetableBoardViewMode = "cohorts_4" | "professors_matrix" | "rooms_matrix";

declare global {
  interface Window {
    __WASHI_AI_TIMETABLE_TRAJECTORY__?: AiTimetableTrajectoryExport;
  }
}

let activeLang: TimetableLang = getTimetableLang();
let appState: TimetableState = generateTimetableState();
let currentTimetable: WeeklyTimetableSolution | null = null;
let currentEvaluation: TimetableEvaluationReport | null = null;
let lastSolveOutcome: WashiTimetableSolveOutcome | null = null;
let lastNanoStatus: GeminiNanoStatus = "unavailable";
let activeViewMode: TimetableBoardViewMode = "cohorts_4";
let activeCrossFilter: { kind: "prof" | "room"; id: string } | null = null;

let isSolving = false;
let pendingSolveRequested = false;
let pendingSolveWaiters: Array<(res: WashiTimetableSolveOutcome | null) => void> = [];
let activeSolveAbortController: AbortController | null = null;
let activeChatAbortController: AbortController | null = null;

const nanoManager = createTimetableGeminiNanoManager();
const trajectoryTurns: TrajectoryTurnRecord[] = [];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return el as T;
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtml(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function buildTrajectoryExport(): AiTimetableTrajectoryExport {
  return {
    exportedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    nanoStatus: nanoManager.getStatus(),
    turnCount: trajectoryTurns.length,
    currentStateSummary: {
      config: { ...appState.config },
      customRules: [...appState.customRules],
    },
    turns: trajectoryTurns,
  };
}

function syncTrajectoryUI(): void {
  const payload = buildTrajectoryExport();
  if (typeof window !== "undefined") {
    window.__WASHI_AI_TIMETABLE_TRAJECTORY__ = payload;
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

function switchTab(tabName: "timetable" | "constraints" | "catalog"): void {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>(".results-tab-btn");
  tabBtns.forEach((b) => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  for (const panelId of ["timetable", "constraints", "catalog"]) {
    const panel = $(`tab-panel-${panelId}`);
    panel.hidden = panelId !== tabName;
  }
}

// ==================== SAFE MARKDOWN DOM RENDERER ====================
function appendInlineMarkdown(parent: HTMLElement, text: string): void {
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

    if (trimmed === "") {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;
      const preEl = document.createElement("pre");
      preEl.className = "md-code-block";
      const codeEl = document.createElement("code");
      codeEl.textContent = codeLines.join("\n");
      preEl.appendChild(codeEl);
      container.appendChild(preEl);
      continue;
    }

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

    if (/^([-*•・]|\d+\.)\s+/.test(trimmed)) {
      const isOrdered = /^\d+\.\s+/.test(trimmed);
      const listEl = document.createElement(isOrdered ? "ol" : "ul");
      listEl.className = "md-list";
      while (i < lines.length) {
        const l = (lines[i] ?? "").trim();
        const itemMatch = l.match(/^([-*•・]|\d+\.)\s+(.+)$/);
        if (!itemMatch) break;
        const li = document.createElement("li");
        appendInlineMarkdown(li, itemMatch[2]);
        listEl.appendChild(li);
        i++;
      }
      container.appendChild(listEl);
      continue;
    }

    const pEl = document.createElement("p");
    pEl.className = "md-p";
    appendInlineMarkdown(pEl, trimmed);
    container.appendChild(pEl);
    i++;
  }
}

function appendChatMessage(
  role: "user" | "assistant" | "system",
  markdownText: string,
  appliedOps?: string[],
  isWelcome = false
): { msgEl: HTMLElement; bodyEl: HTMLElement; opsEl: HTMLElement | null } {
  const ui = UI_TEXT_I18N[activeLang];
  const logEl = $("chat-messages");
  const msgEl = document.createElement("div");
  msgEl.className = `chat-msg chat-msg-${role}`;
  msgEl.dataset.chatRole = role;
  if (isWelcome) {
    msgEl.dataset.welcomeMsg = "true";
  }

  const headerEl = document.createElement("div");
  headerEl.className = "chat-msg-header";
  const senderSpan = document.createElement("span");
  senderSpan.dataset.chatSender = role;
  senderSpan.textContent =
    role === "user"
      ? ui.chatSenderUser
      : role === "assistant"
        ? ui.chatSenderAssistant
        : ui.chatSenderSystem;
  const timeSpan = document.createElement("span");
  const locale = activeLang === "en" ? "en-US" : activeLang === "zh" ? "zh-CN" : "ja-JP";
  timeSpan.textContent = new Date().toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  headerEl.append(senderSpan, timeSpan);

  const bodyEl = document.createElement("div");
  bodyEl.className = "chat-msg-body";
  renderSafeMarkdown(bodyEl, markdownText);

  msgEl.append(headerEl, bodyEl);

  let opsEl: HTMLElement | null = null;
  if (appliedOps && appliedOps.length > 0) {
    opsEl = document.createElement("div");
    opsEl.className = "chat-applied-ops";
    for (const opText of appliedOps) {
      const pill = document.createElement("div");
      pill.className = "chat-op-pill";
      pill.textContent = `✓ ${opText}`;
      opsEl.appendChild(pill);
    }
    msgEl.appendChild(opsEl);
  }

  logEl.appendChild(msgEl);
  logEl.scrollTop = logEl.scrollHeight;
  return { msgEl, bodyEl, opsEl };
}

function updateNanoStatusUI(status: GeminiNanoStatus, pct?: number | null): void {
  lastNanoStatus = status;
  const ui = UI_TEXT_I18N[activeLang];
  const badge = $("nano-status-badge");
  const unavailBanner = $("nano-unavailable-banner");
  const dlWrap = $("nano-download-bar-wrap");
  const dlBar = $("nano-download-bar");
  const dlLabel = $("nano-download-label");

  badge.className = "nano-badge";
  if (status === "available") {
    badge.classList.add("nano-ready");
    badge.textContent = ui.nanoReady;
    unavailBanner.hidden = true;
    dlWrap.hidden = true;
  } else if (status === "downloading") {
    badge.classList.add("nano-downloadable");
    badge.textContent = ui.nanoDownloading;
    unavailBanner.hidden = true;
    dlWrap.hidden = false;
    const p = pct ?? 0;
    dlBar.style.width = `${p}%`;
    dlLabel.textContent = `${p}%`;
  } else if (status === "downloadable") {
    badge.classList.add("nano-downloadable");
    badge.textContent = ui.nanoDownloadable;
    unavailBanner.hidden = true;
    dlWrap.hidden = true;
  } else {
    badge.classList.add("nano-unavailable");
    badge.textContent = ui.nanoUnavailableBadge;
    unavailBanner.hidden = false;
    dlWrap.hidden = true;
  }
}

function populateSelectOptions(): void {
  const ui = UI_TEXT_I18N[activeLang];
  const courseSelectIds = [
    "select-new-rule-course1",
    "select-new-rule-course2",
    "dialog-select-course",
  ];
  for (const id of courseSelectIds) {
    const sel = $<HTMLSelectElement>(id);
    const prevVal = sel.value;
    sel.replaceChildren();
    for (const c of appState.courses) {
      const prof = appState.professors.find((p) => p.id === c.professorId);
      const cI18n = getCourseI18n(c, activeLang);
      const pI18n = prof ? getProfessorI18n(prof, activeLang) : null;
      const cohortStr = c.cohorts.map((cid) => COHORT_I18N[activeLang][cid].shortLabel).join("/");
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.id}: ${cI18n.title} (${cohortStr} · ${pI18n?.shortName ?? ""})`;
      sel.appendChild(opt);
    }
    if (prevVal && appState.courses.some((c) => c.id === prevVal)) {
      sel.value = prevVal;
    } else if (id === "select-new-rule-course2" && appState.courses.length > 1) {
      sel.value = appState.courses[1].id;
    }
  }

  const roomSelectIds = ["select-new-rule-room", "dialog-select-room"];
  for (const id of roomSelectIds) {
    const sel = $<HTMLSelectElement>(id);
    const prevVal = sel.value;
    sel.replaceChildren();
    const autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = ui.autoAssignRoomOpt;
    sel.appendChild(autoOpt);
    for (const r of appState.rooms) {
      const rI18n = getRoomI18n(r, activeLang);
      const opt = document.createElement("option");
      opt.value = r.id;
      const capText = pickTimetableLang(activeLang, {
        ja: `定員${r.capacity}名`,
        en: `Cap ${r.capacity}`,
        zh: `容量${r.capacity}人`,
      });
      opt.textContent = `${rI18n.name} (${capText} · ${ROOM_TYPE_I18N[activeLang][r.roomType]})`;
      sel.appendChild(opt);
    }
    if (prevVal && appState.rooms.some((r) => r.id === prevVal)) {
      sel.value = prevVal;
    }
  }

  const daySelectIds = ["select-new-rule-day", "dialog-select-day"];
  for (const id of daySelectIds) {
    const sel = $<HTMLSelectElement>(id);
    const prev = sel.value;
    Array.from(sel.options).forEach((opt) => {
      const d = opt.value as TimetableDay;
      if (DAY_HEADER_I18N[activeLang][d]) {
        opt.textContent = DAY_HEADER_I18N[activeLang][d];
      }
    });
    if (prev) sel.value = prev;
  }

  const periodSelectIds = ["select-new-rule-period", "dialog-select-period"];
  for (const id of periodSelectIds) {
    const sel = $<HTMLSelectElement>(id);
    const prev = sel.value;
    Array.from(sel.options).forEach((opt) => {
      const p = Number(opt.value) as TimetablePeriod;
      if (p >= 1 && p <= 5) {
        opt.textContent = formatPeriodI18n(p, activeLang);
      }
    });
    if (prev) sel.value = prev;
  }
}

function applyCrossHighlightClasses(): void {
  const cards = document.querySelectorAll<HTMLElement>("[data-course-id]");
  if (!activeCrossFilter) {
    cards.forEach((el) => {
      el.classList.remove("is-cross-dimmed", "is-cross-highlighted");
    });
    return;
  }

  cards.forEach((el) => {
    const profId = el.dataset.profId;
    const roomId = el.dataset.roomId;
    const matched =
      (activeCrossFilter?.kind === "prof" && profId === activeCrossFilter.id) ||
      (activeCrossFilter?.kind === "room" && roomId === activeCrossFilter.id);
    el.classList.toggle("is-cross-highlighted", matched);
    el.classList.toggle("is-cross-dimmed", !matched);
  });
}

function renderCrossHighlightBar(): void {
  const ui = UI_TEXT_I18N[activeLang];
  const bar = $("cross-highlight-bar");
  bar.replaceChildren();

  const label = document.createElement("span");
  label.className = "cross-bar-label";
  label.textContent = ui.crossBarLabel;
  bar.appendChild(label);

  const clearChip = document.createElement("button");
  clearChip.type = "button";
  clearChip.className = `cross-chip ${activeCrossFilter === null ? "active" : ""}`;
  clearChip.textContent = ui.crossBarAll;
  clearChip.addEventListener("click", () => {
    activeCrossFilter = null;
    renderCrossHighlightBar();
    applyCrossHighlightClasses();
  });
  bar.appendChild(clearChip);

  for (const p of appState.professors) {
    const pI18n = getProfessorI18n(p, activeLang);
    const chip = document.createElement("button");
    chip.type = "button";
    const isActive = activeCrossFilter?.kind === "prof" && activeCrossFilter.id === p.id;
    chip.className = `cross-chip ${isActive ? "active" : ""}`;
    chip.textContent = `👨‍🏫${pI18n.shortName}${p.employment === "adjunct" ? ui.adjunctSuffix : ""}`;
    chip.title = pickTimetableLang(activeLang, {
      ja: `${pI18n.name} (${pI18n.title}) が担当するコマを全学年の時間割でハイライト`,
      en: `Highlight courses taught by ${pI18n.name} (${pI18n.title}) across all cohort boards`,
      zh: `在所有年级课表中高亮显示 ${pI18n.name} (${pI18n.title}) 讲授的课程`,
    });
    chip.addEventListener("mouseenter", () => {
      const prev = activeCrossFilter;
      activeCrossFilter = { kind: "prof", id: p.id };
      applyCrossHighlightClasses();
      activeCrossFilter = prev;
    });
    chip.addEventListener("mouseleave", () => {
      applyCrossHighlightClasses();
    });
    chip.addEventListener("click", () => {
      if (activeCrossFilter?.kind === "prof" && activeCrossFilter.id === p.id) {
        activeCrossFilter = null;
      } else {
        activeCrossFilter = { kind: "prof", id: p.id };
      }
      renderCrossHighlightBar();
      applyCrossHighlightClasses();
    });
    bar.appendChild(chip);
  }

  for (const r of appState.rooms) {
    const rI18n = getRoomI18n(r, activeLang);
    const chip = document.createElement("button");
    chip.type = "button";
    const isActive = activeCrossFilter?.kind === "room" && activeCrossFilter.id === r.id;
    chip.className = `cross-chip ${isActive ? "active" : ""}`;
    chip.textContent = `🏫${rI18n.shortName}`;
    chip.title = pickTimetableLang(activeLang, {
      ja: `${rI18n.name} (定員${r.capacity}名) を使用するコマを全学年の時間割でハイライト`,
      en: `Highlight courses assigned to ${rI18n.name} (Cap ${r.capacity}) across all cohort boards`,
      zh: `在所有年级课表中高亮显示使用 ${rI18n.name} (容量${r.capacity}人) 的课程`,
    });
    chip.addEventListener("mouseenter", () => {
      const prev = activeCrossFilter;
      activeCrossFilter = { kind: "room", id: r.id };
      applyCrossHighlightClasses();
      activeCrossFilter = prev;
    });
    chip.addEventListener("mouseleave", () => {
      applyCrossHighlightClasses();
    });
    chip.addEventListener("click", () => {
      if (activeCrossFilter?.kind === "room" && activeCrossFilter.id === r.id) {
        activeCrossFilter = null;
      } else {
        activeCrossFilter = { kind: "room", id: r.id };
      }
      renderCrossHighlightBar();
      applyCrossHighlightClasses();
    });
    bar.appendChild(chip);
  }
}

function renderTimetableBoard(): void {
  renderCrossHighlightBar();
  const ui = UI_TEXT_I18N[activeLang];

  const cohortsGrid = $("view-cohorts-grid");
  const matrixWrap = $("view-matrix-wrap");

  const highlightDiff = $<HTMLInputElement>("chk-highlight-diff").checked;
  const courseMap = new Map(appState.courses.map((c) => [c.id, c]));
  const profMap = new Map(appState.professors.map((p) => [p.id, p]));
  const roomMap = new Map(appState.rooms.map((r) => [r.id, r]));

  const pinnedCourseSlots = new Set<string>();
  for (const r of appState.customRules) {
    if (r.enabled && r.kind === "pin_slot" && r.courseId && r.days && r.periods) {
      for (const d of r.days) {
        for (const p of r.periods) {
          pinnedCourseSlots.add(`${r.courseId}_${d}_${p}`);
        }
      }
    }
  }

  const changedCourseSlots = new Set<string>();
  if (highlightDiff && lastSolveOutcome?.diffFromPrevious) {
    for (const ch of lastSolveOutcome.diffFromPrevious.changes) {
      changedCourseSlots.add(`${ch.courseId}_${ch.nextDay}_${ch.nextPeriod}`);
    }
  }

  if (activeViewMode === "cohorts_4") {
    cohortsGrid.hidden = false;
    matrixWrap.hidden = true;
    cohortsGrid.replaceChildren();

    // Render 4 independent Weekly Timetables (Y1, Y2, Y3, Y4) side by side in a 2x2 grid!
    for (const cohort of STUDENT_COHORTS) {
      const cohortI18n = COHORT_I18N[activeLang][cohort.id];
      const card = document.createElement("div");
      card.className = "cohort-board-card";

      const header = document.createElement("div");
      header.className = "cohort-board-header";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = pickTimetableLang(activeLang, {
        ja: `🎓 ${cohortI18n.label} 時間割`,
        en: `🎓 ${cohortI18n.label}`,
        zh: `🎓 ${cohortI18n.label} 课表`,
      });

      const cohortSum = currentEvaluation?.cohortSummaries[cohort.id];
      const metaSpan = document.createElement("span");
      metaSpan.className = "cohort-board-meta";
      if (cohortSum) {
        metaSpan.textContent = pickTimetableLang(activeLang, {
          ja: `学生${cohort.studentCount}名 | 週${cohortSum.totalSessions}コマ (必修等:${cohortSum.compulsorySessions} / 空きコマ:${cohortSum.hollowGapsCount})`,
          en: `${cohort.studentCount} students | ${cohortSum.totalSessions}/wk (Core:${cohortSum.compulsorySessions} / Gaps:${cohortSum.hollowGapsCount})`,
          zh: `学生${cohort.studentCount}人 | 周${cohortSum.totalSessions}节 (必修:${cohortSum.compulsorySessions} / 空堂:${cohortSum.hollowGapsCount})`,
        });
      } else {
        metaSpan.textContent = pickTimetableLang(activeLang, {
          ja: `学生${cohort.studentCount}名`,
          en: `${cohort.studentCount} students`,
          zh: `学生${cohort.studentCount}人`,
        });
      }

      header.append(titleSpan, metaSpan);
      card.appendChild(header);

      const tbl = document.createElement("table");
      tbl.className = "mini-timetable";

      const thead = document.createElement("thead");
      const headTr = document.createElement("tr");
      const pTh = document.createElement("th");
      pTh.className = "mini-period-th";
      pTh.textContent = ui.periodColHeader;
      headTr.appendChild(pTh);
      for (const d of DAYS_OF_WEEK) {
        const dTh = document.createElement("th");
        dTh.textContent = DAY_HEADER_I18N[activeLang][d];
        headTr.appendChild(dTh);
      }
      thead.appendChild(headTr);
      tbl.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const period of PERIODS) {
        const tr = document.createElement("tr");
        const pCell = document.createElement("td");
        pCell.className = "mini-period-th";
        pCell.textContent = formatPeriodI18n(period, activeLang);
        tr.appendChild(pCell);

        for (const day of DAYS_OF_WEEK) {
          const td = document.createElement("td");
          td.className = "mini-slot-td";

          const slotSessions = (currentTimetable?.bySlot[`${day}_${period}`] ?? []).filter(
            (s) => {
              const c = courseMap.get(s.courseId);
              return c ? c.cohorts.includes(cohort.id) : false;
            }
          );

          if (slotSessions.length > 0) {
            const stack = document.createElement("div");
            stack.className = "slot-cards-stack";

            for (const s of slotSessions) {
              const course = courseMap.get(s.courseId);
              if (!course) continue;
              const prof = profMap.get(course.professorId);
              const room = roomMap.get(s.roomId);
              const cI18n = getCourseI18n(course, activeLang);
              const pI18n = prof ? getProfessorI18n(prof, activeLang) : null;
              const rI18n = room ? getRoomI18n(room, activeLang) : null;
              const catMeta = CATEGORY_I18N[activeLang][course.category];

              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = `course-session-card ${catMeta.colorClass}`;
              btn.dataset.courseId = course.id;
              btn.dataset.profId = course.professorId;
              btn.dataset.roomId = s.roomId;

              const slotCourseKey = `${course.id}_${day}_${period}`;
              if (pinnedCourseSlots.has(slotCourseKey)) {
                btn.classList.add("cell-pinned-outline");
              }
              if (changedCourseSlots.has(slotCourseKey)) {
                btn.classList.add("cell-diff-changed");
              }

              const topRow = document.createElement("div");
              topRow.className = "card-top-row";
              const catSpan = document.createElement("span");
              catSpan.textContent = `${catMeta.shortLabel}·${course.id}`;
              const roomSpan = document.createElement("span");
              roomSpan.className = "card-room-pill";
              roomSpan.textContent = rI18n ? rI18n.shortName : s.roomId;
              topRow.append(catSpan, roomSpan);

              const titleRow = document.createElement("div");
              titleRow.className = "card-course-title";
              titleRow.textContent =
                course.sessionsPerWeek > 1
                  ? `${cI18n.shortTitle}(${s.sessionIndex + 1}/${course.sessionsPerWeek})`
                  : cI18n.shortTitle;

              const metaRow = document.createElement("div");
              metaRow.className = "card-meta-row";
              const profSpan = document.createElement("span");
              profSpan.textContent = `👨‍🏫${pI18n ? pI18n.shortName : course.professorId}`;
              const capSpan = document.createElement("span");
              capSpan.textContent = pickTimetableLang(activeLang, {
                ja: `${course.enrollment}名`,
                en: `${course.enrollment}p`,
                zh: `${course.enrollment}人`,
              });
              metaRow.append(profSpan, capSpan);

              btn.append(topRow, titleRow, metaRow);
              btn.addEventListener("click", () => {
                openSlotInspectorDialog(day, period, s);
              });
              stack.appendChild(btn);
            }
            td.appendChild(stack);
          } else {
            const emptyBtn = document.createElement("button");
            emptyBtn.type = "button";
            emptyBtn.className = "mini-slot-empty";
            emptyBtn.textContent = ui.pinEmptySlotBtn;
            emptyBtn.title = pickTimetableLang(activeLang, {
              ja: `${cohortI18n.shortLabel}の科目を ${formatSlotI18n(day, period, activeLang)} に固定`,
              en: `Pin a ${cohortI18n.shortLabel} course to ${formatSlotI18n(day, period, activeLang)}`,
              zh: `将${cohortI18n.shortLabel}课程固定在 ${formatSlotI18n(day, period, activeLang)}`,
            });
            emptyBtn.addEventListener("click", () => {
              openSlotInspectorDialog(day, period, null);
            });
            td.appendChild(emptyBtn);
          }

          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      card.appendChild(tbl);
      cohortsGrid.appendChild(card);
    }

    applyCrossHighlightClasses();
    return;
  }

  // ==================== VIEW 2 & 3: 25-SLOT FULL MATRIX (LIKE NURSE SHIFT MATRIX) ====================
  cohortsGrid.hidden = true;
  matrixWrap.hidden = false;

  const thead = $("matrix-25-thead");
  const tbody = $("matrix-25-tbody");
  const tfoot = $("matrix-25-tfoot");
  thead.replaceChildren();
  tbody.replaceChildren();
  tfoot.replaceChildren();

  const isProfMatrix = activeViewMode === "professors_matrix";

  // Build 2-row header: Row 1 = Days (Mon..Fri, colspan=5), Row 2 = Periods (1..5)
  const trDays = document.createElement("tr");
  const thCorner = document.createElement("th");
  thCorner.className = "sticky-nurse-col";
  thCorner.rowSpan = 2;
  thCorner.textContent = isProfMatrix ? ui.matrixProfCorner : ui.matrixRoomCorner;
  trDays.appendChild(thCorner);

  for (const d of DAYS_OF_WEEK) {
    const thDay = document.createElement("th");
    thDay.colSpan = 5;
    thDay.className = "matrix-day-group-th matrix-day-divider";
    thDay.textContent =
      activeLang === "en"
        ? DAY_FULL_I18N.en[d]
        : `${DAY_FULL_I18N[activeLang][d]} (${d})`;
    trDays.appendChild(thDay);
  }

  const thStat = document.createElement("th");
  thStat.rowSpan = 2;
  thStat.className = "stat-col";
  thStat.textContent = isProfMatrix ? ui.matrixProfStatCol : ui.matrixRoomStatCol;
  trDays.appendChild(thStat);
  thead.appendChild(trDays);

  const trPeriods = document.createElement("tr");
  for (const d of DAYS_OF_WEEK) {
    void d;
    for (const p of PERIODS) {
      const thP = document.createElement("th");
      if (p === 5) thP.className = "matrix-day-divider";
      thP.textContent = formatPeriodI18n(p, activeLang);
      trPeriods.appendChild(thP);
    }
  }
  thead.appendChild(trPeriods);

  if (isProfMatrix) {
    // Rows = 10 Professors
    for (const prof of appState.professors) {
      const pI18n = getProfessorI18n(prof, activeLang);
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.className = "sticky-nurse-col";

      const topDiv = document.createElement("div");
      topDiv.className = "nurse-cell-top";
      const nameSpan = document.createElement("span");
      nameSpan.className = "nurse-name-label";
      nameSpan.textContent = `${prof.id} ${pI18n.name}`;
      const roleSpan = document.createElement("span");
      roleSpan.className = `role-pill ${prof.employment === "adjunct" ? "role-newcomer" : "role-mid"}`;
      roleSpan.textContent = pI18n.title;
      topDiv.append(nameSpan, roleSpan);
      tdName.appendChild(topDiv);
      tr.appendChild(tdName);

      const profCourseIds = new Set(
        appState.courses.filter((c) => c.professorId === prof.id).map((c) => c.id)
      );

      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          const td = document.createElement("td");
          td.className = `matrix-slot-cell ${p === 5 ? "matrix-day-divider" : ""}`;

          const assigned = (currentTimetable?.bySlot[`${d}_${p}`] ?? []).find((s) =>
            profCourseIds.has(s.courseId)
          );

          const isUnavailDay = prof.unavailableDays.includes(d);
          const unavailSlot = prof.unavailableSlots.find((u) => u.day === d && u.period === p);
          const customForbidRule = appState.customRules.find(
            (r) =>
              r.enabled &&
              r.kind === "forbid_slot" &&
              r.professorId === prof.id &&
              (!r.days || r.days.includes(d)) &&
              (!r.periods || r.periods.includes(p))
          );

          if (assigned) {
            const c = courseMap.get(assigned.courseId)!;
            const r = roomMap.get(assigned.roomId);
            const cI18n = getCourseI18n(c, activeLang);
            const rI18n = r ? getRoomI18n(r, activeLang) : null;
            const catMeta = CATEGORY_I18N[activeLang][c.category];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `matrix-course-btn ${catMeta.colorClass}`;
            btn.dataset.courseId = c.id;
            btn.dataset.profId = prof.id;
            btn.dataset.roomId = assigned.roomId;

            if (pinnedCourseSlots.has(`${c.id}_${d}_${p}`)) {
              btn.classList.add("cell-pinned-outline");
            }
            if (changedCourseSlots.has(`${c.id}_${d}_${p}`)) {
              btn.classList.add("cell-diff-changed");
            }

            const codeSpan = document.createElement("span");
            codeSpan.className = "matrix-course-code";
            codeSpan.textContent = cI18n.shortTitle;
            const subSpan = document.createElement("span");
            subSpan.className = "matrix-course-sub";
            subSpan.textContent = `${c.cohorts.join("/")}[${rI18n?.shortName ?? assigned.roomId}]`;
            btn.append(codeSpan, subSpan);
            btn.title = `${formatSlotI18n(d, p, activeLang)}: ${cI18n.title} (${c.cohorts.join("/")} · ${rI18n?.name ?? ""})`;
            btn.addEventListener("click", () => {
              openSlotInspectorDialog(d, p, assigned);
            });
            td.appendChild(btn);
          } else if (isUnavailDay || unavailSlot || customForbidRule) {
            td.classList.add("matrix-slot-unavail");
            td.textContent = isUnavailDay ? ui.matrixUnavailDay : ui.matrixUnavailSlot;
            td.title = isUnavailDay
              ? pickTimetableLang(activeLang, {
                  ja: `${pI18n.name}: ${DAY_FULL_I18N.ja[d]}は出講不可`,
                  en: `${pI18n.name}: Unavailable on ${DAY_FULL_I18N.en[d]}`,
                  zh: `${pI18n.name}: ${DAY_FULL_I18N.zh[d]}不可出勤`,
                })
              : unavailSlot
                ? `${pI18n.name}: ${formatSlotReasonI18n(unavailSlot.reason, activeLang)}`
                : formatCustomRuleI18n(customForbidRule!, appState, activeLang);
          }

          tr.appendChild(td);
        }
      }

      const tdStat = document.createElement("td");
      tdStat.className = "stat-col";
      const sum = currentEvaluation?.professorSummaries[prof.id];
      tdStat.textContent = sum
        ? pickTimetableLang(activeLang, {
            ja: `${sum.assignedSessions}コマ (連${sum.maxConsecutiveCount})`,
            en: `${sum.assignedSessions}/wk (Max ${sum.maxConsecutiveCount})`,
            zh: `${sum.assignedSessions}节 (连${sum.maxConsecutiveCount})`,
          })
        : "--";
      tr.appendChild(tdStat);
      tbody.appendChild(tr);
    }
  } else {
    // Rows = 7 Rooms
    for (const room of appState.rooms) {
      const rI18n = getRoomI18n(room, activeLang);
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.className = "sticky-nurse-col";

      const topDiv = document.createElement("div");
      topDiv.className = "nurse-cell-top";
      const nameSpan = document.createElement("span");
      nameSpan.className = "nurse-name-label";
      nameSpan.textContent = rI18n.name;
      const capSpan = document.createElement("span");
      capSpan.className = "role-pill role-leader";
      capSpan.textContent = pickTimetableLang(activeLang, {
        ja: `定員${room.capacity}`,
        en: `Cap ${room.capacity}`,
        zh: `容量${room.capacity}`,
      });
      topDiv.append(nameSpan, capSpan);
      tdName.appendChild(topDiv);
      tr.appendChild(tdName);

      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          const td = document.createElement("td");
          td.className = `matrix-slot-cell ${p === 5 ? "matrix-day-divider" : ""}`;

          const assigned = currentTimetable?.bySlotAndRoom[`${d}_${p}_${room.id}`];
          const isClosed = appState.customRules.some(
            (r) =>
              r.enabled &&
              r.kind === "room_closure" &&
              r.roomId === room.id &&
              (!r.days || r.days.includes(d)) &&
              (!r.periods || r.periods.includes(p))
          );

          if (assigned) {
            const c = courseMap.get(assigned.courseId)!;
            const prof = profMap.get(c.professorId);
            const cI18n = getCourseI18n(c, activeLang);
            const pI18n = prof ? getProfessorI18n(prof, activeLang) : null;
            const catMeta = CATEGORY_I18N[activeLang][c.category];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `matrix-course-btn ${catMeta.colorClass}`;
            btn.dataset.courseId = c.id;
            btn.dataset.profId = c.professorId;
            btn.dataset.roomId = room.id;

            if (pinnedCourseSlots.has(`${c.id}_${d}_${p}`)) {
              btn.classList.add("cell-pinned-outline");
            }
            if (changedCourseSlots.has(`${c.id}_${d}_${p}`)) {
              btn.classList.add("cell-diff-changed");
            }

            const codeSpan = document.createElement("span");
            codeSpan.className = "matrix-course-code";
            codeSpan.textContent = cI18n.shortTitle;
            const subSpan = document.createElement("span");
            subSpan.className = "matrix-course-sub";
            subSpan.textContent = `${c.cohorts.join("/")}·${pI18n?.shortName ?? ""} (${c.enrollment})`;
            btn.append(codeSpan, subSpan);
            btn.title = `${formatSlotI18n(d, p, activeLang)} [${rI18n.name}]: ${cI18n.title} (${c.enrollment}/${room.capacity})`;
            btn.addEventListener("click", () => {
              openSlotInspectorDialog(d, p, assigned);
            });
            td.appendChild(btn);
          } else if (isClosed) {
            td.classList.add("matrix-slot-unavail");
            td.textContent = ui.matrixClosedSlot;
          }

          tr.appendChild(td);
        }
      }

      const tdStat = document.createElement("td");
      tdStat.className = "stat-col";
      const used =
        currentTimetable?.sessions.filter((s) => s.roomId === room.id).length ?? 0;
      const pct = currentEvaluation?.roomUtilizationPct[room.id] ?? 0;
      tdStat.textContent = `${used}/25 (${pct}%)`;
      tr.appendChild(tdStat);
      tbody.appendChild(tr);
    }
  }

  // Footer row: Active simultaneous courses per slot (out of 7 rooms)
  const footTr = document.createElement("tr");
  const footLabel = document.createElement("td");
  footLabel.className = "sticky-nurse-col";
  footLabel.textContent = ui.matrixFooterLabel;
  footTr.appendChild(footLabel);

  for (const d of DAYS_OF_WEEK) {
    for (const p of PERIODS) {
      const td = document.createElement("td");
      if (p === 5) td.className = "matrix-day-divider";
      const cnt = (currentTimetable?.bySlot[`${d}_${p}`] ?? []).length;
      td.textContent = `${cnt}`;
      footTr.appendChild(td);
    }
  }
  const footTotal = document.createElement("td");
  footTotal.className = "stat-col";
  const totalSessions = currentTimetable?.sessions.length ?? 0;
  footTotal.textContent = pickTimetableLang(activeLang, {
    ja: `計${totalSessions}コマ`,
    en: `Total ${totalSessions}`,
    zh: `共${totalSessions}节`,
  });
  footTr.appendChild(footTotal);
  tfoot.appendChild(footTr);

  applyCrossHighlightClasses();
}

function renderCustomRulesAndSettings(): void {
  const ui = UI_TEXT_I18N[activeLang];
  const listEl = $("custom-rules-list");
  listEl.replaceChildren();

  const activeCount = appState.customRules.filter((r) => r.enabled).length;
  const badge = $("badge-custom-rules");
  badge.textContent = String(activeCount);
  badge.hidden = activeCount === 0;

  if (appState.customRules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "constraint-card-desc";
    empty.textContent = ui.customRulesEmpty;
    listEl.appendChild(empty);
  } else {
    for (const rule of appState.customRules) {
      const row = document.createElement("div");
      row.className = "custom-rule-item";

      const left = document.createElement("label");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "8px";
      left.style.cursor = "pointer";
      left.style.flex = "1";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = rule.enabled;
      chk.addEventListener("change", () => {
        rule.enabled = chk.checked;
        void triggerSolve();
      });

      const badgeSpan = document.createElement("span");
      badgeSpan.className = "constraint-tag";
      badgeSpan.textContent = rule.isHard !== false ? ui.tagHardRule : ui.tagSoftRule;

      const descSpan = document.createElement("span");
      descSpan.textContent = formatCustomRuleI18n(rule, appState, activeLang);

      left.append(chk, badgeSpan, descSpan);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "6px";

      const toggleHardBtn = document.createElement("button");
      toggleHardBtn.type = "button";
      toggleHardBtn.className = "btn-xs-outline";
      toggleHardBtn.textContent =
        rule.isHard !== false ? ui.btnSwitchToSoft : ui.btnSwitchToHard;
      toggleHardBtn.addEventListener("click", () => {
        rule.isHard = rule.isHard === false;
        renderCustomRulesAndSettings();
        void triggerSolve();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-xs-outline";
      delBtn.textContent = ui.btnDeleteRule;
      delBtn.addEventListener("click", () => {
        appState.customRules = appState.customRules.filter((r) => r.id !== rule.id);
        renderCustomRulesAndSettings();
        void triggerSolve();
      });

      right.append(toggleHardBtn, delBtn);
      row.append(left, right);
      listEl.appendChild(row);
    }
  }

  // Sync config inputs
  const c = appState.config;
  $<HTMLInputElement>("cfg-enforceRoomCapacity").checked = c.enforceRoomCapacity;
  $<HTMLInputElement>("cfg-enforceRoomEquipment").checked = c.enforceRoomEquipment;
  $<HTMLInputElement>("cfg-enforceCohortNoOverlap").checked = c.enforceCohortNoOverlap;
  $<HTMLInputElement>("cfg-forbidSameCourseSameDay").checked = c.forbidSameCourseSameDay;
  $<HTMLInputElement>("cfg-enforceAdjunctDayRestrictions").checked =
    c.enforceAdjunctDayRestrictions;
  $<HTMLInputElement>("cfg-enforceProfessorAvailability").checked = c.enforceProfessorAvailability;
  $<HTMLInputElement>("cfg-enforceMaxConsecutivePeriods").checked = c.enforceMaxConsecutivePeriods;
  $<HTMLInputElement>("cfg-maxProfessorConsecutivePeriods").value = String(
    c.maxProfessorConsecutivePeriods
  );
  $<HTMLInputElement>("cfg-maxProfessorSessionsPerDay").value = String(
    c.maxProfessorSessionsPerDay
  );
  $<HTMLInputElement>("cfg-maxCohortCompulsoryPerDay").value = String(
    c.maxCohortCompulsoryPerDay
  );
  $<HTMLInputElement>("cfg-weightCohortIdleGaps").value = String(c.weightCohortIdleGaps);
  $<HTMLInputElement>("chk-preserve-timetable").checked = c.preserveCurrentTimetable;
}

function renderCatalogTables(): void {
  const ui = UI_TEXT_I18N[activeLang];

  // Update table headers
  const profHeadRow = $("cat-prof-thead-row");
  profHeadRow.replaceChildren();
  for (const h of ui.catProfHeaders) {
    const th = document.createElement("th");
    th.textContent = h;
    profHeadRow.appendChild(th);
  }

  const roomHeadRow = $("cat-room-thead-row");
  roomHeadRow.replaceChildren();
  for (const h of ui.catRoomHeaders) {
    const th = document.createElement("th");
    th.textContent = h;
    roomHeadRow.appendChild(th);
  }

  const courseHeadRow = $("cat-course-thead-row");
  courseHeadRow.replaceChildren();
  for (const h of ui.catCourseHeaders) {
    const th = document.createElement("th");
    th.textContent = h;
    courseHeadRow.appendChild(th);
  }

  // 1. Professors
  const profTbody = $("catalog-prof-tbody");
  profTbody.replaceChildren();
  for (const p of appState.professors) {
    const pI18n = getProfessorI18n(p, activeLang);
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = p.id;

    const tdName = document.createElement("td");
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = pI18n.name;
    tdName.appendChild(nameStrong);

    const tdTitle = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `role-pill ${p.employment === "adjunct" ? "role-newcomer" : "role-mid"}`;
    pill.textContent = pI18n.title;
    tdTitle.appendChild(pill);

    const tdSpec = document.createElement("td");
    tdSpec.textContent = pI18n.specialty;

    const tdUnavail = document.createElement("td");
    const unavailParts: string[] = [];
    if (p.unavailableDays.length > 0) {
      const avail = DAYS_OF_WEEK.filter((d) => !p.unavailableDays.includes(d))
        .map((d) => DAY_SHORT_I18N[activeLang][d])
        .join(activeLang === "en" ? "/" : "・");
      unavailParts.push(
        pickTimetableLang(activeLang, {
          ja: `出講曜日: ${avail}曜のみ`,
          en: `Available: ${avail} only`,
          zh: `可出勤日: 仅${avail}`,
        })
      );
    }
    for (const s of p.unavailableSlots) {
      const reason = formatSlotReasonI18n(s.reason, activeLang);
      unavailParts.push(
        `${formatSlotI18n(s.day, s.period, activeLang)} NG${reason ? ` (${reason})` : ""}`
      );
    }
    tdUnavail.textContent =
      unavailParts.length > 0
        ? unavailParts.join(" / ")
        : pickTimetableLang(activeLang, {
            ja: "全日可",
            en: "All Days Available",
            zh: "全周可排",
          });

    const tdPref = document.createElement("td");
    const prefParts: string[] = [
      pickTimetableLang(activeLang, {
        ja: `1日最大${p.maxSessionsPerDay}コマ`,
        en: `Max ${p.maxSessionsPerDay}/day`,
        zh: `单日最多${p.maxSessionsPerDay}节`,
      }),
    ];
    if (p.avoidPeriod1) {
      prefParts.push(
        pickTimetableLang(activeLang, {
          ja: "1限回避希望",
          en: "Avoid P1",
          zh: "回避第1节",
        })
      );
    }
    if (p.avoidPeriod5) {
      prefParts.push(
        pickTimetableLang(activeLang, {
          ja: "5限回避希望",
          en: "Avoid P5",
          zh: "回避第5节",
        })
      );
    }
    tdPref.textContent = prefParts.join(" · ");

    const tdStat = document.createElement("td");
    const sum = currentEvaluation?.professorSummaries[p.id];
    if (sum) {
      tdStat.textContent = pickTimetableLang(activeLang, {
        ja: `週${sum.assignedSessions}コマ (出講${sum.activeDaysCount}日 / 最大連続:${sum.maxConsecutiveCount}コマ)`,
        en: `${sum.assignedSessions}/wk (${sum.activeDaysCount} days / Max consec: ${sum.maxConsecutiveCount})`,
        zh: `周${sum.assignedSessions}节 (出勤${sum.activeDaysCount}天 / 最大连堂:${sum.maxConsecutiveCount}节)`,
      });
    } else {
      tdStat.textContent = "--";
    }

    tr.append(tdId, tdName, tdTitle, tdSpec, tdUnavail, tdPref, tdStat);
    profTbody.appendChild(tr);
  }

  // 2. Rooms
  const roomTbody = $("catalog-room-tbody");
  roomTbody.replaceChildren();
  for (const r of appState.rooms) {
    const rI18n = getRoomI18n(r, activeLang);
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = r.id;

    const tdName = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = rI18n.name;
    tdName.appendChild(strong);

    const tdType = document.createElement("td");
    tdType.textContent = `${ROOM_TYPE_I18N[activeLang][r.roomType]} (${rI18n.building})`;

    const tdCap = document.createElement("td");
    tdCap.textContent = pickTimetableLang(activeLang, {
      ja: `${r.capacity}名`,
      en: `${r.capacity}`,
      zh: `${r.capacity}人`,
    });

    const tdEquip = document.createElement("td");
    tdEquip.textContent = r.equipment
      .map((e) => EQUIPMENT_I18N[activeLang][e])
      .join(activeLang === "en" ? ", " : "・");

    const tdUtil = document.createElement("td");
    const usedCount =
      currentTimetable?.sessions.filter((s) => s.roomId === r.id).length ?? 0;
    const pct = currentEvaluation?.roomUtilizationPct[r.id] ?? 0;
    tdUtil.textContent = pickTimetableLang(activeLang, {
      ja: `${usedCount} / 25コマ (${pct}%)`,
      en: `${usedCount} / 25 slots (${pct}%)`,
      zh: `${usedCount} / 25节 (${pct}%)`,
    });

    tr.append(tdId, tdName, tdType, tdCap, tdEquip, tdUtil);
    roomTbody.appendChild(tr);
  }

  // 3. Courses
  const courseTbody = $("catalog-course-tbody");
  courseTbody.replaceChildren();
  const profMap = new Map(appState.professors.map((p) => [p.id, p]));
  const roomMap = new Map(appState.rooms.map((r) => [r.id, r]));

  for (const c of appState.courses) {
    const cI18n = getCourseI18n(c, activeLang);
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = c.id;

    const tdTitle = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = cI18n.title;
    tdTitle.appendChild(strong);

    const tdCat = document.createElement("td");
    const catMeta = CATEGORY_I18N[activeLang][c.category];
    const badge = document.createElement("span");
    badge.className = `shift-badge ${catMeta.colorClass}`;
    const cohortShort = c.cohorts.map((cid) => COHORT_I18N[activeLang][cid].shortLabel).join("/");
    badge.textContent = `${cohortShort} · ${catMeta.shortLabel}`;
    tdCat.appendChild(badge);

    const tdProf = document.createElement("td");
    const prof = profMap.get(c.professorId);
    const pI18n = prof ? getProfessorI18n(prof, activeLang) : null;
    tdProf.textContent = pI18n ? `${pI18n.name} (${pI18n.title})` : c.professorId;

    const tdEnr = document.createElement("td");
    tdEnr.textContent = pickTimetableLang(activeLang, {
      ja: `${c.enrollment}名 / 週${c.sessionsPerWeek}コマ`,
      en: `${c.enrollment} students / ${c.sessionsPerWeek}x wk`,
      zh: `${c.enrollment}人 / 周${c.sessionsPerWeek}节`,
    });

    const tdReq = document.createElement("td");
    const reqs = c.requiredEquipment.map((e) => EQUIPMENT_I18N[activeLang][e]);
    if (c.requiredRoomType) {
      reqs.unshift(
        pickTimetableLang(activeLang, {
          ja: `${ROOM_TYPE_I18N.ja[c.requiredRoomType]}必須`,
          en: `${ROOM_TYPE_I18N.en[c.requiredRoomType]} Req.`,
          zh: `需${ROOM_TYPE_I18N.zh[c.requiredRoomType]}`,
        })
      );
    }
    tdReq.textContent = reqs.join(activeLang === "en" ? ", " : "・");

    const tdAssigned = document.createElement("td");
    const assigned = currentTimetable?.byCourse[c.id] ?? [];
    if (assigned.length > 0) {
      tdAssigned.textContent = assigned
        .map((s) => {
          const rm = roomMap.get(s.roomId);
          const rmShort = rm ? getRoomI18n(rm, activeLang).shortName : s.roomId;
          return `${formatSlotI18n(s.day, s.period, activeLang)} [${rmShort}]`;
        })
        .join(" / ");
    } else {
      tdAssigned.textContent = pickTimetableLang(activeLang, {
        ja: "未割当",
        en: "Unassigned",
        zh: "未分配",
      });
    }

    tr.append(tdId, tdTitle, tdCat, tdProf, tdEnr, tdReq, tdAssigned);
    courseTbody.appendChild(tr);
  }
}

function updateStatusAndConflictsUI(outcome: WashiTimetableSolveOutcome): void {
  const ui = UI_TEXT_I18N[activeLang];
  const badge = $("kpi-status-badge");
  const summaryText = $("kpi-summary-text");
  const solveTimeEl = $("kpi-solve-time");
  const conflictAlert = $("conflict-alert");
  const conflictList = $("conflict-list");

  solveTimeEl.textContent = `${outcome.solveTimeMs} ms (${outcome.numVariables} vars / ${outcome.numConstraints} constrs)`;
  $("lp-stats-badge").textContent =
    `${outcome.numVariables} vars / ${outcome.numConstraints} constraints`;
  $("washi-code-preview").textContent = outcome.modelCodePreview;
  $("washi-lp-preview").textContent = outcome.lpPreview;

  badge.className = "status-pill";
  if (outcome.status === "Optimal" || outcome.status === "Feasible") {
    badge.classList.add("status-optimal");
    badge.textContent = outcome.status === "Optimal" ? ui.statusOptimal : ui.statusFeasible;
    const ev = outcome.evaluation;
    const diff = outcome.diffFromPrevious;
    const diffStr =
      diff && diff.totalSessions > 0 && diff.changedSessionsCount > 0
        ? pickTimetableLang(activeLang, {
            ja: ` / 前回から${diff.changedSessionsCount}コマ変更(維持率${diff.retentionRatePct}%)`,
            en: ` / ${diff.changedSessionsCount} moved (${diff.retentionRatePct}% retained)`,
            zh: ` / 较上次变动${diff.changedSessionsCount}节(保持率${diff.retentionRatePct}%)`,
          })
        : "";
    const nCourses = appState.courses.length;
    const nSess = outcome.timetable?.sessions.length ?? 0;
    const gaps = ev?.softPenaltyCount ?? 0;
    summaryText.textContent = pickTimetableLang(activeLang, {
      ja: `全${nCourses}科目(${nSess}コマ)を配置完了 | ハード違反: 0件 / 学生空きコマ合計: ${gaps}コマ${diffStr}`,
      en: `Scheduled all ${nCourses} courses (${nSess} sessions) | Hard violations: 0 / Student idle gaps: ${gaps}${diffStr}`,
      zh: `全部${nCourses}门课程(${nSess}节课)排课完成 | 硬约束违反: 0项 / 学生空堂合计: ${gaps}节${diffStr}`,
    });
    conflictAlert.hidden = true;
  } else if (outcome.status === "Infeasible") {
    badge.classList.add("status-infeasible");
    badge.textContent = ui.statusInfeasible;
    summaryText.textContent = pickTimetableLang(activeLang, {
      ja: `条件が衝突しているため時間割を組めません（衝突要因: ${outcome.conflicts.length}件）`,
      en: `Timetable is infeasible due to conflicting rules (${outcome.conflicts.length} conflicting constraints identified)`,
      zh: `约束条件发生冲突，无法排出可行课表（已定位冲突因素: ${outcome.conflicts.length}项）`,
    });
    conflictAlert.hidden = false;
    conflictList.replaceChildren();
    for (const c of outcome.conflicts) {
      const loc = formatConstraintMetaI18n(c, appState, activeLang);
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = loc.label;
      li.appendChild(strong);
      if (loc.suggestion) {
        const hint = document.createElement("span");
        hint.style.marginLeft = "6px";
        hint.style.opacity = "0.85";
        hint.textContent = `💡 ${loc.suggestion}`;
        li.appendChild(hint);
      }
      conflictList.appendChild(li);
    }
  } else {
    badge.classList.add("status-infeasible");
    badge.textContent = ui.statusError;
    summaryText.textContent =
      outcome.errorMessage ??
      pickTimetableLang(activeLang, {
        ja: "ソルバー実行中にエラーが発生しました",
        en: "An error occurred while running the solver",
        zh: "求解器执行过程中发生错误",
      });
  }
}

async function triggerSolve(): Promise<WashiTimetableSolveOutcome | null> {
  if (isSolving) {
    pendingSolveRequested = true;
    return new Promise<WashiTimetableSolveOutcome | null>((resolve) => {
      pendingSolveWaiters.push(resolve);
    });
  }
  isSolving = true;
  pendingSolveRequested = false;

  const abortCtrl = new AbortController();
  activeSolveAbortController = abortCtrl;

  const badge = $("kpi-status-badge");
  badge.className = "status-pill status-solving";
  badge.textContent = UI_TEXT_I18N[activeLang].statusSolving;
  $("btn-abort-solve").hidden = false;

  let outcome: WashiTimetableSolveOutcome | null = null;
  try {
    outcome = await solveTimetableWithWashi(appState, {
      signal: abortCtrl.signal,
      referenceTimetable: currentTimetable,
    });
    lastSolveOutcome = outcome;
    if (outcome.timetable) {
      currentTimetable = outcome.timetable;
      currentEvaluation = outcome.evaluation;
    }
    updateStatusAndConflictsUI(outcome);
    renderTimetableBoard();
    renderCustomRulesAndSettings();
    renderCatalogTables();
    syncTrajectoryUI();
  } finally {
    isSolving = false;
    activeSolveAbortController = null;
    $("btn-abort-solve").hidden = true;
    if (pendingSolveRequested) {
      pendingSolveRequested = false;
      const waiters = pendingSolveWaiters.splice(0);
      void triggerSolve().then(
        (queuedRes) => {
          for (const resolve of waiters) resolve(queuedRes);
        },
        () => {
          for (const resolve of waiters) resolve(null);
        }
      );
    }
  }
  return outcome;
}

function openSlotInspectorDialog(
  day: TimetableDay,
  period: TimetablePeriod,
  session: AssignedSession | null
): void {
  const dialog = $<HTMLDialogElement>("slot-inspector-dialog");
  const body = $("slot-dialog-body");
  body.replaceChildren();

  const courseSel = $<HTMLSelectElement>("dialog-select-course");
  const daySel = $<HTMLSelectElement>("dialog-select-day");
  const periodSel = $<HTMLSelectElement>("dialog-select-period");
  const roomSel = $<HTMLSelectElement>("dialog-select-room");

  daySel.value = day;
  periodSel.value = String(period);

  if (session) {
    courseSel.value = session.courseId;
    roomSel.value = session.roomId;
    const course = appState.courses.find((c) => c.id === session.courseId);
    const prof = appState.professors.find((p) => p.id === course?.professorId);
    const room = appState.rooms.find((r) => r.id === session.roomId);
    const cI18n = course ? getCourseI18n(course, activeLang) : null;
    const pI18n = prof ? getProfessorI18n(prof, activeLang) : null;
    const rI18n = room ? getRoomI18n(room, activeLang) : null;
    const infoP = document.createElement("p");
    infoP.style.margin = "0";
    infoP.textContent = pickTimetableLang(activeLang, {
      ja: `現在の割当: ${formatSlotI18n(day, period, "ja")} 「${cI18n?.title ?? session.courseId}」 (担当: ${pI18n?.name ?? ""} / 教室: ${rI18n?.name ?? session.roomId} / 履修: ${course?.enrollment ?? 0}名)`,
      en: `Current Assignment: ${formatSlotI18n(day, period, "en")} "${cI18n?.title ?? session.courseId}" (Prof: ${pI18n?.name ?? ""} / Room: ${rI18n?.name ?? session.roomId} / Enrollment: ${course?.enrollment ?? 0})`,
      zh: `当前已排: ${formatSlotI18n(day, period, "zh")} 《${cI18n?.title ?? session.courseId}》 (教师: ${pI18n?.name ?? ""} / 教室: ${rI18n?.name ?? session.roomId} / 选课: ${course?.enrollment ?? 0}人)`,
    });
    body.appendChild(infoP);
  } else {
    roomSel.value = "";
    const infoP = document.createElement("p");
    infoP.style.margin = "0";
    infoP.textContent = pickTimetableLang(activeLang, {
      ja: `${formatSlotI18n(day, period, "ja")} に固定または禁止したい科目を選択してください。`,
      en: `Select a course to pin or forbid at ${formatSlotI18n(day, period, "en")}.`,
      zh: `请选择要在 ${formatSlotI18n(day, period, "zh")} 固定或禁排的课程。`,
    });
    body.appendChild(infoP);
  }

  dialog.showModal();
}

export function applyTimetableLang(lang: TimetableLang): void {
  activeLang = lang;
  setTimetableLang(lang);
  const ui = UI_TEXT_I18N[lang];

  document.title = ui.pageTitle;
  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    const isTarget = btn.dataset.langBtn === lang;
    btn.classList.toggle("is-active", isTarget);
    btn.setAttribute("aria-pressed", isTarget ? "true" : "false");
  });

  setText("header-app-title", ui.headerTitle);
  setText("btn-toggle-tutorial", ui.btnTutorial);
  $("btn-toggle-tutorial").title = pickTimetableLang(lang, {
    ja: "使い方チュートリアルの表示/非表示を切り替え",
    en: "Show or hide the 3-step quick guide",
    zh: "显示或隐藏 3 步快速指南",
  });
  for (const closeBtnId of [
    "btn-close-tutorial",
    "btn-close-slot-dialog",
    "btn-close-nano-dialog",
    "btn-close-trajectory-dialog",
  ]) {
    const closeBtn = document.getElementById(closeBtnId);
    if (closeBtn) closeBtn.setAttribute("aria-label", ui.dialogCloseLabel);
  }
  const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = pickTimetableLang(lang, {
      ja: "ブラウザ内蔵 Gemini Nano で教員・教務課の複雑な要望を入力し、WaSHI (HiGHS) で大学時間割編成問題(UCTP: 25科目・30コマ・7教室・10教員)を最適化・矛盾診断するデモ。",
      en: "Interactive University Course Timetabling (UCTP) AI Copilot powered by Chrome Built-in AI (Gemini Nano) and WaSHI (HiGHS WASM MIP solver).",
      zh: "基于浏览器端侧 Gemini Nano 与 WaSHI (HiGHS) 求解器的大学排课问题 (UCTP: 25门课・30节课・7间教室・10位教师) 优化与冲突诊断演示。",
    });
  }
  setText("nav-link-theory", ui.btnTheory);
  const theoryLink = document.getElementById("nav-link-theory") as HTMLAnchorElement | null;
  if (theoryLink) {
    theoryLink.href = `../ai-timetable-theory/?lang=${lang}`;
  }
  setText("nav-link-apps", ui.navApps);
  setText("nav-link-aishift", ui.navAiShift);
  $("ai-timetable-theme-btn").title = ui.themeToggleTitle;

  $("chat-pane-aside").setAttribute("aria-label", ui.chatPaneAria);
  setText("chat-header-title", ui.chatHeaderTitle);
  $("btn-open-trajectory").title = ui.trajectoryBtnTitle;
  $("btn-nano-setup-help").title = ui.nanoSetupBtnTitle;
  setText("nano-unavail-text", ui.nanoUnavailBannerText);
  setText("btn-open-nano-modal", ui.nanoSetupLink);
  setText("btn-retry-nano", ui.nanoRetryLink);
  $("chat-messages").setAttribute("aria-label", ui.chatLogAria);

  // Update existing chat sender labels and welcome message
  document.querySelectorAll<HTMLElement>("[data-chat-sender]").forEach((el) => {
    const role = el.dataset.chatSender;
    if (role === "user") el.textContent = ui.chatSenderUser;
    else if (role === "assistant") el.textContent = ui.chatSenderAssistant;
    else if (role === "system") el.textContent = ui.chatSenderSystem;
  });
  const welcomeMsg = document.querySelector<HTMLElement>(
    '[data-welcome-msg="true"] .chat-msg-body'
  );
  if (welcomeMsg) {
    renderSafeMarkdown(welcomeMsg, ui.chatWelcomeMarkdown);
  }

  // Prompt examples popover
  setText("popover-header-text", ui.popoverHeader);
  const popoverList = $("prompt-popover-list");
  popoverList.replaceChildren();
  for (const item of ui.promptChips) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "prompt-chip";
    chip.dataset.prompt = item.prompt;
    chip.textContent = item.label;
    chip.addEventListener("click", () => {
      $<HTMLTextAreaElement>("chat-input").value = item.prompt;
      const popover = document.getElementById("prompt-examples-popover") as HTMLElement & {
        hidePopover?: () => void;
      };
      popover?.hidePopover?.();
      $<HTMLTextAreaElement>("chat-input").focus();
    });
    popoverList.appendChild(chip);
  }

  setText("chat-input-label", ui.chatInputLabel);
  $<HTMLTextAreaElement>("chat-input").placeholder = ui.chatPlaceholder;
  setText("btn-examples-trigger", ui.btnExamples);
  setText("txt-auto-solve", ui.autoSolveLabel);
  $("lbl-auto-solve").title = ui.autoSolveTitle;
  setText("btn-chat-abort", ui.btnChatAbort);
  setText("txt-chat-send", ui.btnChatSend);

  // Tutorial banner
  setText("tutorial-title-text", ui.tutorialTitle);
  setText("btn-close-tutorial", ui.tutorialClose);
  setText("step1-title", ui.step1Title);
  setHtml("step1-desc", ui.step1DescHtml);
  setText("btn-tut-step1", ui.step1Btn);
  setText("step2-title", ui.step2Title);
  setHtml("step2-desc", ui.step2DescHtml);
  setText("btn-tut-step2", ui.step2Btn);
  setText("step3-title", ui.step3Title);
  setHtml("step3-desc", ui.step3DescHtml);
  $("select-conflict-scenario").setAttribute("aria-label", ui.step3SelectAria);
  setText("opt-conflict-1", ui.step3Opt1);
  setText("opt-conflict-2", ui.step3Opt2);
  setText("opt-conflict-3", ui.step3Opt3);
  setText("btn-tut-step3", ui.step3Btn);

  // Action bar
  setText("btn-abort-solve", ui.btnAbortSolve);
  setText("btn-solve-washi", ui.btnSolveWashi);
  setText("btn-check-current", ui.btnCheckCurrent);
  $("btn-check-current").title = ui.btnCheckCurrentTitle;
  setText("btn-reset-clean", ui.btnResetClean);
  $("btn-reset-clean").title = ui.btnResetCleanTitle;

  // Conflict banner
  setText("conflict-banner-title", ui.conflictBannerTitle);
  setText("btn-clear-custom-conflicts", ui.btnClearConflicts);
  setText("btn-ask-nano-conflict", ui.btnAskAiConflict);

  // Tabs
  setText("tab-txt-timetable", ui.tabTimetable);
  setText("tab-txt-constraints", ui.tabConstraints);
  setText("tab-txt-catalog", ui.tabCatalog);

  // Tab 1 controls & legend
  setText("btn-view-cohorts", ui.viewCohortsBtn);
  setText("btn-view-profs", ui.viewProfsBtn);
  setText("btn-view-rooms", ui.viewRoomsBtn);

  const cats = CATEGORY_I18N[lang];
  setText("leg-badge-comp", cats.compulsory.shortLabel);
  setText("leg-txt-comp", cats.compulsory.label);
  setText("leg-badge-core", cats.elective_core.shortLabel);
  setText("leg-txt-core", cats.elective_core.label);
  setText("leg-badge-lab", cats.lab_exercise.shortLabel);
  setText("leg-txt-lab", cats.lab_exercise.label);
  setText("leg-badge-elec", cats.elective.shortLabel);
  setText("leg-txt-elec", cats.elective.label);
  setText("leg-badge-sem", cats.seminar.shortLabel);
  setText("leg-txt-sem", cats.seminar.label);
  setText("leg-txt-pinned", ui.legendPinned);
  setText("leg-txt-changed", ui.legendChanged);

  setText("txt-preserve-toggle", ui.preserveToggleLabel);
  $("lbl-preserve-toggle").title = ui.preserveToggleTitle;
  setText("txt-diff-toggle", ui.diffToggleLabel);
  $("lbl-diff-toggle").title = ui.diffToggleTitle;

  // Tab 2 rules & config
  setText("custom-rules-title", ui.customRulesTitle);
  setText("custom-rules-desc", ui.customRulesDesc);
  setText("btn-apply-config-solve", ui.btnApplyConfigSolve);
  setText("btn-reset-default-config", ui.btnResetDefaultConfig);
  setText("lbl-new-rule-kind", ui.newRuleKindLabel);
  setText("opt-rule-pin", ui.newRuleKindPin);
  setText("opt-rule-forbid", ui.newRuleKindForbid);
  setText("opt-rule-nooverlap", ui.newRuleKindNoOverlap);
  setText("opt-rule-consec", ui.newRuleKindConsec);
  setText("opt-rule-sameday", ui.newRuleKindSameDay);
  setText("lbl-new-rule-c1", ui.newRuleCourse1Label);
  setText("lbl-new-rule-c2", ui.newRuleCourse2Label);
  setText("lbl-new-rule-day", ui.newRuleDayLabel);
  setText("lbl-new-rule-period", ui.newRulePeriodLabel);
  setText("lbl-new-rule-room", ui.newRuleRoomLabel);
  setText("btn-add-custom-rule", ui.btnAddCustomRule);

  setText("card1-title", ui.card1Title);
  setText("card1-desc", ui.card1Desc);
  setHtml("lbl-cfg-roomcap", ui.cfgRoomCapHtml);
  setHtml("lbl-cfg-roomequip", ui.cfgRoomEquipHtml);
  setHtml("lbl-cfg-cohort", ui.cfgCohortNoOverlapHtml);
  setHtml("lbl-cfg-sameday", ui.cfgForbidSameDayHtml);

  setText("card2-title", ui.card2Title);
  setText("card2-desc", ui.card2Desc);
  setHtml("lbl-cfg-adjunct", ui.cfgAdjunctDaysHtml);
  setHtml("lbl-cfg-profavail", ui.cfgProfAvailHtml);
  setHtml("lbl-cfg-maxconsec", ui.cfgMaxConsecHtml);
  setText("lbl-num-maxconsec", ui.cfgNumMaxConsec);
  setText("lbl-num-maxdaily", ui.cfgNumMaxDaily);
  setText("lbl-num-maxcohort", ui.cfgNumMaxCohortDaily);
  setText("lbl-num-weightgap", ui.cfgNumWeightGap);

  setText("dev-inspector-summary", ui.devInspectorSummary);
  setText("btn-diagnose-conflict", ui.btnDiagnoseSingle);

  // Tab 3 catalog titles
  setText("cat-prof-title", ui.catProfTitle);
  setText("cat-prof-desc", ui.catProfDesc);
  setText("cat-room-title", ui.catRoomTitle);
  setText("cat-course-title", ui.catCourseTitle);

  // Modals
  setText("slot-dialog-title", ui.slotDialogTitle);
  setText("lbl-dlg-course", ui.newRuleCourse1Label);
  setText("lbl-dlg-day", ui.newRuleDayLabel);
  setText("lbl-dlg-period", ui.newRulePeriodLabel);
  setText("lbl-dlg-room", ui.newRuleRoomLabel);
  setText("btn-dialog-pin-course", ui.slotDialogPinBtn);
  setText("btn-dialog-forbid-course", ui.slotDialogForbidBtn);
  setText("btn-dialog-clear-course-rules", ui.slotDialogClearBtn);

  setText("nano-setup-dialog-title", ui.nanoDialogTitle);
  setHtml("nano-dlg-intro", ui.nanoDialogIntroHtml);
  setHtml("nano-dlg-step1", ui.nanoDialogStep1Html);
  setHtml("nano-dlg-step2", ui.nanoDialogStep2Html);
  setHtml("nano-dlg-step3", ui.nanoDialogStep3Html);
  setText("nano-dlg-note", ui.nanoDialogNote);
  setText("btn-dialog-recheck-nano", ui.nanoDialogRecheckBtn);
  setText("btn-dialog-close-ok", ui.nanoDialogCloseBtn);

  setText("trajectory-dialog-title", ui.trajDialogTitle);
  setText("traj-dlg-desc", ui.trajDialogDesc);
  setText("btn-copy-trajectory", ui.trajCopyBtn);
  setText("btn-download-trajectory", ui.trajDownloadBtn);
  setText("btn-clear-trajectory", ui.trajClearBtn);

  populateSelectOptions();
  updateNanoStatusUI(lastNanoStatus);
  if (lastSolveOutcome) {
    updateStatusAndConflictsUI(lastSolveOutcome);
  } else {
    setText("kpi-status-badge", ui.statusPreparing);
  }
  renderTimetableBoard();
  renderCustomRulesAndSettings();
  renderCatalogTables();
}

async function handleChatSubmit(userMessage: string): Promise<void> {
  if (activeChatAbortController) return;
  const trimmed = userMessage.trim();
  if (!trimmed) return;

  appendChatMessage("user", trimmed);
  const inputEl = $<HTMLTextAreaElement>("chat-input");
  inputEl.value = "";
  inputEl.disabled = true;

  const sendBtn = $<HTMLButtonElement>("btn-chat-send");
  const abortBtn = $<HTMLButtonElement>("btn-chat-abort");
  sendBtn.disabled = true;
  abortBtn.hidden = false;

  const chatAbort = new AbortController();
  activeChatAbortController = chatAbort;

  const analyzingText = pickTimetableLang(activeLang, {
    ja: "⏳ 指示を解析しています...",
    en: "⏳ Analyzing your request...",
    zh: "⏳ 正在解析您的排课指令...",
  });
  const assistantMsg = appendChatMessage("assistant", analyzingText);

  try {
    const nanoStatus = nanoManager.getStatus();
    if (nanoStatus !== "available") {
      renderSafeMarkdown(
        assistantMsg.bodyEl,
        pickTimetableLang(activeLang, {
          ja: "⚠️ Chrome Built-in AI (`LanguageModel` / Gemini Nano) が有効になっていません。右上の「⚙️」ボタンから有効化手順をご確認いただくか、右側の時間割ボード・ルール設定タブから直接条件を操作してください。",
          en: "⚠️ Chrome Built-in AI (`LanguageModel` / Gemini Nano) is not enabled. Click the ⚙️ icon above for setup steps, or use the interactive Timetable Board and Rules tab on the right.",
          zh: "⚠️ Chrome 内置 AI (`LanguageModel` / Gemini Nano) 尚未启用。请点击右上角「⚙️」查看启用步骤，或直接在右侧课表看板与规则设置标签页中操作。",
        })
      );
      return;
    }

    const plan = await nanoManager.extractPlan(
      trimmed,
      appState,
      chatAbort.signal,
      (ev) => {
        renderSafeMarkdown(assistantMsg.bodyEl, ev.activeLabel);
      },
      activeLang
    );

    const { updatedState, appliedLogs } = applyTimetableChatOperationsToState(
      appState,
      plan.operations,
      activeLang
    );
    appState = updatedState;

    if (appliedLogs.length > 0) {
      const opsEl = document.createElement("div");
      opsEl.className = "chat-applied-ops";
      for (const log of appliedLogs) {
        const pill = document.createElement("div");
        pill.className = "chat-op-pill";
        pill.textContent = `✓ ${log}`;
        opsEl.appendChild(pill);
      }
      assistantMsg.msgEl.appendChild(opsEl);
    }

    if (plan.rejectedToolCalls.length > 0) {
      const rejectedEl = document.createElement("div");
      rejectedEl.className = "chat-applied-ops";
      for (const tc of plan.rejectedToolCalls) {
        const pill = document.createElement("div");
        pill.className = "chat-op-pill chat-op-pill-rejected";
        const label = pickTimetableLang(activeLang, {
          ja: "⚠ 引数が不正なため未適用",
          en: "⚠ Not applied (invalid arguments)",
          zh: "⚠ 参数无效，未应用",
        });
        pill.textContent = `${label}: ${tc.tool_name} ${JSON.stringify(tc.args ?? {})}`;
        rejectedEl.appendChild(pill);
      }
      assistantMsg.msgEl.appendChild(rejectedEl);
    }

    const autoSolve = $<HTMLInputElement>("chk-auto-solve-on-chat").checked;
    let outcome: WashiTimetableSolveOutcome | null = null;
    if (autoSolve && (appliedLogs.length > 0 || plan.intentType === "modify_and_solve")) {
      renderSafeMarkdown(
        assistantMsg.bodyEl,
        pickTimetableLang(activeLang, {
          ja: "⚡ WaSHI (HiGHS) で時間割を最適化しています...",
          en: "⚡ Optimizing timetable with WaSHI (HiGHS)...",
          zh: "⚡ 正在使用 WaSHI (HiGHS) 优化课表...",
        })
      );
      outcome = await triggerSolve();
    } else {
      renderCustomRulesAndSettings();
      renderCatalogTables();
    }

    let streamedText = "";
    for await (const delta of nanoManager.streamConsultationReply(
      trimmed,
      appliedLogs,
      appState,
      outcome,
      chatAbort.signal,
      activeLang
    )) {
      streamedText += delta;
      renderSafeMarkdown(assistantMsg.bodyEl, streamedText);
    }

    const consultTrace = nanoManager.getLastConsultTrace();
    if (consultTrace) {
      plan.llmTraces.push(consultTrace);
    }

    trajectoryTurns.push({
      turnIndex: trajectoryTurns.length + 1,
      timestamp: new Date().toISOString(),
      userMessage: trimmed,
      plan,
      appliedLogs,
      solveStatus: outcome?.status,
      solveTimeMs: outcome?.solveTimeMs,
      conflictNames: outcome?.rawConflictNames,
      finalAssistantReply: streamedText || plan.replyJa,
    });
    syncTrajectoryUI();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    renderSafeMarkdown(
      assistantMsg.bodyEl,
      pickTimetableLang(activeLang, {
        ja: `⚠️ エラーが発生しました: ${msg}`,
        en: `⚠️ Error: ${msg}`,
        zh: `⚠️ 发生错误: ${msg}`,
      })
    );
  } finally {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    abortBtn.hidden = true;
    activeChatAbortController = null;
  }
}

function wireEvents(): void {
  // Language switcher buttons
  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.langBtn as TimetableLang | undefined;
      if (lang === "ja" || lang === "en" || lang === "zh") {
        applyTimetableLang(lang);
      }
    });
  });

  // Theme toggle
  $("ai-timetable-theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("washi-theme", next);
    } catch {
      // Ignore
    }
  });

  // Tutorial banner toggle
  $("btn-toggle-tutorial").addEventListener("click", () => {
    const b = $("tutorial-banner");
    b.hidden = !b.hidden;
  });
  $("btn-close-tutorial").addEventListener("click", () => {
    $("tutorial-banner").hidden = true;
  });

  // Tutorial Step 1: Pin C15 (数理最適化) to Tue Period 2 in R101
  $("btn-tut-step1").addEventListener("click", () => {
    const res = applyTimetableChatOperationsToState(appState, [
      {
        op: "pin_course_slot",
        courseId: "C15",
        days: ["Tue"],
        periods: [2],
        roomId: "R101",
        isHard: true,
      },
    ]);
    appState = res.updatedState;
    appendChatMessage(
      "system",
      pickTimetableLang(activeLang, {
        ja: "📌 チュートリアル STEP 1: 「数理最適化(C15)」を火曜2限・101大講義室(R101)に固定して再計算します。",
        en: '📌 Tutorial STEP 1: Pinned "Mathematical Optimization (C15)" to Tue P2 in Hall 101 (R101) and re-optimizing.',
        zh: "📌 指南 STEP 1: 已将《数学规划(C15)》固定在周二第2节・101大阶梯教室(R101)并重新优化。",
      }),
      res.appliedLogs
    );
    void triggerSolve();
  });

  // Tutorial Step 2: Consecutive sessions for C12 (ソフトウェア設計演習)
  $("btn-tut-step2").addEventListener("click", () => {
    const res = applyTimetableChatOperationsToState(appState, [
      {
        op: "add_course_relation_rule",
        kind: "course_consecutive",
        courseId: "C12",
        isHard: true,
      },
    ]);
    appState = res.updatedState;
    appendChatMessage(
      "system",
      pickTimetableLang(activeLang, {
        ja: "🔗 チュートリアル STEP 2: 「ソフトウェア設計演習(C12・週2コマ)」を同じ曜日の連続する時限(2コマ連続)に指定して再計算します。",
        en: '🔗 Tutorial STEP 2: Added consecutive-period rule for "Software Design Lab (C12, 2 sessions/wk)" and re-optimizing.',
        zh: "🔗 指南 STEP 2: 已将《软件设计实验(C12・周2节)》设为同日相邻节次连排并重新求解。",
      }),
      res.appliedLogs
    );
    void triggerSolve();
  });

  // Tutorial Step 3: Inject conflict scenario
  $("btn-tut-step3").addEventListener("click", () => {
    const sc = $<HTMLSelectElement>("select-conflict-scenario").value as
      | "prof_impossible_day"
      | "room_double_book"
      | "pc_lab_overload";
    const injected = injectTimetableConflictScenario(appState, sc);
    appState = injected.updatedState;
    appendChatMessage(
      "system",
      pickTimetableLang(activeLang, {
        ja: `💥 チュートリアル STEP 3 (矛盾診断デモ): ${injected.descriptionJa}`,
        en: `💥 Tutorial STEP 3 (Conflict Diagnosis Demo): Injected conflicting scenario (${sc}) and running WaSHI IIS diagnosis.`,
        zh: `💥 指南 STEP 3 (冲突诊断演示): 已注入冲突场景 (${sc}) 并运行 WaSHI 冲突诊断。`,
      }),
      [injected.descriptionJa]
    );
    void triggerSolve();
  });

  // Action bar buttons
  $("btn-solve-washi").addEventListener("click", () => {
    void triggerSolve();
  });
  $("btn-abort-solve").addEventListener("click", () => {
    activeSolveAbortController?.abort();
  });
  $("btn-check-current").addEventListener("click", async () => {
    const diag = await diagnoseTimetableWithHiGHS(appState);
    if (diag.status === "Sat") {
      appendChatMessage(
        "system",
        pickTimetableLang(activeLang, {
          ja: "✅ 整合性チェック完了: 現在のすべての時間割制約条件に矛盾はありません（充足可能: Sat）。",
          en: "✅ Feasibility Check Passed: All current timetable constraints are mutually satisfiable (Sat).",
          zh: "✅ 一致性检查通过: 当前所有排课约束条件均无矛盾（可满足: Sat）。",
        })
      );
    } else {
      const listMd = diag.conflicts
        .map((c) => `- **${formatConstraintMetaI18n(c, appState, activeLang).label}**`)
        .join("\n");
      appendChatMessage(
        "system",
        pickTimetableLang(activeLang, {
          ja: `🚨 整合性チェック結果: ${diag.conflicts.length}件の制約が衝突しています。\n${listMd}`,
          en: `🚨 Feasibility Check: ${diag.conflicts.length} conflicting constraints detected.\n${listMd}`,
          zh: `🚨 一致性检查结果: 检测到 ${diag.conflicts.length} 项约束冲突。\n${listMd}`,
        })
      );
    }
  });
  $("btn-reset-clean").addEventListener("click", () => {
    appState = generateTimetableState();
    currentTimetable = null;
    appendChatMessage(
      "system",
      pickTimetableLang(activeLang, {
        ja: "↩ すべての時間割設定と追加ルールを初期状態にリセットしました。",
        en: "↩ Reset all timetable parameters and custom rules to their initial defaults.",
        zh: "↩ 已将所有排课参数与追加规则重置为初始状态。",
      })
    );
    void triggerSolve();
  });

  // Conflict banner buttons
  $("btn-clear-custom-conflicts").addEventListener("click", () => {
    // Remove only the custom rules that the solver actually reported as conflicting.
    const conflictingRuleIds = new Set(
      (lastSolveOutcome?.conflicts ?? [])
        .map((c) => c.relatedRuleId)
        .filter((id): id is string => typeof id === "string")
    );
    if (conflictingRuleIds.size === 0) {
      appendChatMessage(
        "system",
        pickTimetableLang(activeLang, {
          ja: "ℹ️ 衝突要因に追加ルールは含まれていません。条件・ルール設定タブで基本制約やパラメータを見直してください。",
          en: "ℹ️ No custom rules are among the conflicting constraints. Review the base constraints and parameters in the Rules tab.",
          zh: "ℹ️ 冲突因素中不包含追加规则。请在规则设置标签页中检查基本约束与参数。",
        })
      );
      return;
    }
    appState.customRules = appState.customRules.filter((r) => !conflictingRuleIds.has(r.id));
    appendChatMessage(
      "system",
      pickTimetableLang(activeLang, {
        ja: `✨ 衝突していた追加ルール ${conflictingRuleIds.size}件を解除し、時間割を再最適化しました。`,
        en: `✨ Removed ${conflictingRuleIds.size} conflicting custom rule(s) and re-optimized the timetable.`,
        zh: `✨ 已解除 ${conflictingRuleIds.size} 条发生冲突的追加规则并重新优化课表。`,
      })
    );
    void triggerSolve();
  });
  $("btn-ask-nano-conflict").addEventListener("click", () => {
    void handleChatSubmit(UI_TEXT_I18N[activeLang].conflictAskPrompt);
  });

  // Tabs
  document.querySelectorAll<HTMLButtonElement>(".results-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as "timetable" | "constraints" | "catalog";
      if (tab) switchTab(tab);
    });
  });

  // View mode switcher & toggles on Tab 1
  document.querySelectorAll<HTMLButtonElement>(".view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.viewMode as TimetableBoardViewMode | undefined;
      if (!mode) return;
      activeViewMode = mode;
      document.querySelectorAll<HTMLButtonElement>(".view-mode-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.viewMode === mode);
      });
      renderTimetableBoard();
    });
  });
  $("chk-highlight-diff").addEventListener("change", () => {
    renderTimetableBoard();
  });
  $("chk-preserve-timetable").addEventListener("change", (e) => {
    appState.config.preserveCurrentTimetable = (e.target as HTMLInputElement).checked;
  });

  // Tab 2 Config checkboxes & inputs
  const readConfigFromForm = () => {
    const c = appState.config;
    c.enforceRoomCapacity = $<HTMLInputElement>("cfg-enforceRoomCapacity").checked;
    c.enforceRoomEquipment = $<HTMLInputElement>("cfg-enforceRoomEquipment").checked;
    c.enforceCohortNoOverlap = $<HTMLInputElement>("cfg-enforceCohortNoOverlap").checked;
    c.forbidSameCourseSameDay = $<HTMLInputElement>("cfg-forbidSameCourseSameDay").checked;
    c.enforceAdjunctDayRestrictions = $<HTMLInputElement>(
      "cfg-enforceAdjunctDayRestrictions"
    ).checked;
    c.enforceProfessorAvailability = $<HTMLInputElement>(
      "cfg-enforceProfessorAvailability"
    ).checked;
    c.enforceMaxConsecutivePeriods = $<HTMLInputElement>(
      "cfg-enforceMaxConsecutivePeriods"
    ).checked;
    c.maxProfessorConsecutivePeriods = Number(
      $<HTMLInputElement>("cfg-maxProfessorConsecutivePeriods").value
    );
    c.maxProfessorSessionsPerDay = Number(
      $<HTMLInputElement>("cfg-maxProfessorSessionsPerDay").value
    );
    c.maxCohortCompulsoryPerDay = Number(
      $<HTMLInputElement>("cfg-maxCohortCompulsoryPerDay").value
    );
    c.weightCohortIdleGaps = Number($<HTMLInputElement>("cfg-weightCohortIdleGaps").value);
  };

  $("btn-apply-config-solve").addEventListener("click", () => {
    readConfigFromForm();
    void triggerSolve();
  });
  $("btn-reset-default-config").addEventListener("click", () => {
    appState = generateTimetableState();
    currentTimetable = null;
    void triggerSolve();
  });
  $("btn-diagnose-conflict").addEventListener("click", () => {
    $("btn-check-current").click();
  });

  // Custom rule builder on Tab 2
  $("btn-add-custom-rule").addEventListener("click", () => {
    const kind = $<HTMLSelectElement>("select-new-rule-kind").value as CustomRuleKind;
    const c1Id = $<HTMLSelectElement>("select-new-rule-course1").value;
    const c2Id = $<HTMLSelectElement>("select-new-rule-course2").value;
    const day = $<HTMLSelectElement>("select-new-rule-day").value as TimetableDay;
    const period = Number($<HTMLSelectElement>("select-new-rule-period").value) as TimetablePeriod;
    const roomId = $<HTMLSelectElement>("select-new-rule-room").value || undefined;

    if (kind === "pin_slot") {
      const res = applyTimetableChatOperationsToState(appState, [
        { op: "pin_course_slot", courseId: c1Id, days: [day], periods: [period], roomId, isHard: true },
      ]);
      appState = res.updatedState;
    } else if (kind === "forbid_slot") {
      const res = applyTimetableChatOperationsToState(appState, [
        { op: "forbid_course_slot", courseId: c1Id, days: [day], periods: [period], isHard: true },
      ]);
      appState = res.updatedState;
    } else if (
      kind === "course_no_overlap" ||
      kind === "course_consecutive" ||
      kind === "course_same_day"
    ) {
      const res = applyTimetableChatOperationsToState(appState, [
        {
          op: "add_course_relation_rule",
          kind,
          courseId: c1Id,
          secondCourseId:
            (kind === "course_no_overlap" ||
              kind === "course_consecutive" ||
              kind === "course_same_day") &&
            c2Id &&
            c2Id !== c1Id
              ? c2Id
              : undefined,
          isHard: true,
        },
      ]);
      appState = res.updatedState;
    }
    void triggerSolve();
  });

  // Slot Inspector Dialog actions
  $("btn-close-slot-dialog").addEventListener("click", () => {
    $<HTMLDialogElement>("slot-inspector-dialog").close();
  });
  $("btn-dialog-pin-course").addEventListener("click", () => {
    const courseId = $<HTMLSelectElement>("dialog-select-course").value;
    const day = $<HTMLSelectElement>("dialog-select-day").value as TimetableDay;
    const period = Number($<HTMLSelectElement>("dialog-select-period").value) as TimetablePeriod;
    const roomId = $<HTMLSelectElement>("dialog-select-room").value || undefined;
    const res = applyTimetableChatOperationsToState(appState, [
      { op: "pin_course_slot", courseId, days: [day], periods: [period], roomId, isHard: true },
    ]);
    appState = res.updatedState;
    $<HTMLDialogElement>("slot-inspector-dialog").close();
    void triggerSolve();
  });
  $("btn-dialog-forbid-course").addEventListener("click", () => {
    const courseId = $<HTMLSelectElement>("dialog-select-course").value;
    const day = $<HTMLSelectElement>("dialog-select-day").value as TimetableDay;
    const period = Number($<HTMLSelectElement>("dialog-select-period").value) as TimetablePeriod;
    const res = applyTimetableChatOperationsToState(appState, [
      { op: "forbid_course_slot", courseId, days: [day], periods: [period], isHard: true },
    ]);
    appState = res.updatedState;
    $<HTMLDialogElement>("slot-inspector-dialog").close();
    void triggerSolve();
  });
  $("btn-dialog-clear-course-rules").addEventListener("click", () => {
    const courseId = $<HTMLSelectElement>("dialog-select-course").value;
    appState.customRules = appState.customRules.filter((r) => r.courseId !== courseId);
    $<HTMLDialogElement>("slot-inspector-dialog").close();
    void triggerSolve();
  });

  // Chat events
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $<HTMLTextAreaElement>("chat-input").value;
    void handleChatSubmit(text);
  });
  $("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const text = $<HTMLTextAreaElement>("chat-input").value;
      void handleChatSubmit(text);
    }
  });
  $("btn-chat-abort").addEventListener("click", () => {
    activeChatAbortController?.abort();
  });

  // Nano setup modal
  const openNanoModal = () => $<HTMLDialogElement>("nano-setup-dialog").showModal();
  $("btn-nano-setup-help").addEventListener("click", openNanoModal);
  $("btn-open-nano-modal").addEventListener("click", openNanoModal);
  $("btn-close-nano-dialog").addEventListener("click", () =>
    $<HTMLDialogElement>("nano-setup-dialog").close()
  );
  $("btn-dialog-close-ok").addEventListener("click", () =>
    $<HTMLDialogElement>("nano-setup-dialog").close()
  );
  const recheckNano = async () => {
    updateNanoStatusUI("downloading", 0);
    const st = await nanoManager.initialize((pct) => updateNanoStatusUI("downloading", pct));
    updateNanoStatusUI(st);
  };
  $("btn-retry-nano").addEventListener("click", () => void recheckNano());
  $("btn-dialog-recheck-nano").addEventListener("click", () => void recheckNano());

  // Trajectory modal
  $("btn-open-trajectory").addEventListener("click", () => {
    syncTrajectoryUI();
    $<HTMLDialogElement>("trajectory-dialog").showModal();
  });
  $("btn-close-trajectory-dialog").addEventListener("click", () => {
    $<HTMLDialogElement>("trajectory-dialog").close();
  });
  $("btn-copy-trajectory").addEventListener("click", async () => {
    const json = JSON.stringify(buildTrajectoryExport(), null, 2);
    await navigator.clipboard.writeText(json);
  });
  $("btn-download-trajectory").addEventListener("click", () => {
    const json = JSON.stringify(buildTrajectoryExport(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `washi-ai-timetable-trajectory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $("btn-clear-trajectory").addEventListener("click", () => {
    trajectoryTurns.length = 0;
    syncTrajectoryUI();
  });
}

async function initApp(): Promise<void> {
  wireEvents();

  appendChatMessage(
    "assistant",
    UI_TEXT_I18N[activeLang].chatWelcomeMarkdown,
    undefined,
    true
  );

  applyTimetableLang(activeLang);

  void nanoManager
    .initialize((pct) => updateNanoStatusUI("downloading", pct))
    .then((status) => updateNanoStatusUI(status));

  await triggerSolve();
}

if (typeof document !== "undefined") {
  void initApp();
}
