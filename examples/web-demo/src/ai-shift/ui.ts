import {
  DAYS,
  type Day,
  type ShiftRequirements,
  type ShiftSolveResult,
  type ExtractedPlanIntent,
  type NanoSessionWrapper,
} from "./types.js";
import {
  checkNanoAvailability,
  createNanoSession,
  parseUserShiftIntent,
  applyIntentToRequirements,
} from "./nano-client.js";
import {
  DEFAULT_STAFF,
  DEFAULT_COVERAGE,
  solveShiftSchedule,
} from "./shift-solver.js";

const SYSTEM_PROMPT = `
あなたはカフェ＆レストラン『和紙』の親切で優秀なAIシフト調整アシスタントです。
店長（ユーザー）に対して、自然で温かみのある丁寧な日本語で会話・アドバイスしてください。

【厳格な禁止事項】
・絶対に JSON やプログラムコード、Markdown のコードブロック（\`\`\`）を出力しないでください。
・回答はすべて店長に語りかける自然な日本語の文章（箇条書きや太字は可）だけで作成してください。
`;

export class AIShiftApp {
  private session: NanoSessionWrapper | null = null;
  private currentRequirements: ShiftRequirements;
  private isProcessing = false;

  // DOM Elements
  private chatContainer!: HTMLElement;
  private chatInput!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private nanoStatusBadge!: HTMLElement;
  private metricsContainer!: HTMLElement;
  private rosterContainer!: HTMLElement;
  private conflictContainer!: HTMLElement;
  private codePreviewContainer!: HTMLElement;
  private negotiationChipsContainer!: HTMLElement;

  constructor() {
    this.currentRequirements = {
      staffList: [...DEFAULT_STAFF],
      requiredCoverage: { ...DEFAULT_COVERAGE },
      seniorRequiredDaily: true,
      dayOffRequests: [],
    };
  }

  public async init() {
    this.bindDom();
    this.bindEvents();
    await this.initNano();

    // Show initial welcome onboarding in chat
    this.showWelcomeMessage();

    // Silently solve & render baseline optimal schedule in the right pane
    const initialResult = await solveShiftSchedule(this.currentRequirements);
    this.renderMetrics(initialResult);
    this.renderRoster(initialResult);
    this.renderConflict(initialResult);
    this.renderCodePreview(initialResult);
  }

  private showWelcomeMessage() {
    this.chatContainer.innerHTML = "";
    this.appendAssistantMessage(
      "こんにちは！**カフェ＆レストラン『和紙』の AI Shift Copilot** へようこそ。☕\n\n" +
      "店長（あなた）からのご要望をもとに、数理最適化ソルバー（HiGHS）で**人件費が一番安くなるシフト表**を自動作成します。\n\n" +
      "🏪 **当店のスタッフと運営ルール（シチュエーション）**:\n" +
      "・**シニア責任者（毎日1名以上出勤必須）**:\n" +
      "  - 👤 **Alice**（店長代理 / 日給$220）\n" +
      "  - 👤 **Bob**（副店長 / 日給$210）\n" +
      "・**一般スタッフ**:\n" +
      "  - 👤 **Charlie** ($160), **Diana** ($160), **Evan** ($150)\n" +
      "・**基本ルール**: 各自週最大5日勤務 / 土曜は3名体制（週末手当+$30/日）\n\n" +
      "👇 まずは下の **「① 通常のシフト自動作成」** または **「② 希望重複トラブル＆AI交渉」** を押して体験してみてください！"
    );
  }

  public async reset() {
    if (this.isProcessing) return;
    this.currentRequirements = {
      staffList: [...DEFAULT_STAFF],
      requiredCoverage: { ...DEFAULT_COVERAGE },
      seniorRequiredDaily: true,
      dayOffRequests: [],
    };
    if (this.negotiationChipsContainer) {
      this.negotiationChipsContainer.style.display = "none";
    }
    this.showWelcomeMessage();

    const initialResult = await solveShiftSchedule(this.currentRequirements);
    this.renderMetrics(initialResult);
    this.renderRoster(initialResult);
    this.renderConflict(initialResult);
    this.renderCodePreview(initialResult);
  }

  private bindDom() {
    this.chatContainer = document.getElementById("chat-messages")!;
    this.chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;
    this.sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
    this.resetBtn = document.getElementById("btn-reset-chat") as HTMLButtonElement;
    this.nanoStatusBadge = document.getElementById("nano-status-badge")!;
    this.metricsContainer = document.getElementById("metrics-container")!;
    this.rosterContainer = document.getElementById("roster-table-container")!;
    this.conflictContainer = document.getElementById("conflict-container")!;
    this.codePreviewContainer = document.getElementById("code-preview")!;
    this.negotiationChipsContainer = document.getElementById("negotiation-chips")!;
  }

  private bindEvents() {
    this.sendBtn.addEventListener("click", () => this.onSend());
    this.resetBtn?.addEventListener("click", () => this.reset());
    this.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.onSend();
      }
    });

    // Quick prompt buttons (Primary scenario cards and negotiation chips)
    document.querySelectorAll(".quick-prompt-btn").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const text = (e.currentTarget as HTMLElement).getAttribute("data-prompt");
        if (text) {
          this.chatInput.value = text;
          this.onSend();
        }
      });
    });
  }

  private async initNano() {
    const availability = await checkNanoAvailability();
    if (availability === "readily") {
      this.nanoStatusBadge.className = "ai-badge ready";
      this.nanoStatusBadge.innerHTML = "🟢 Gemini Nano (On-Device)";
      this.nanoStatusBadge.title = "Chrome Built-in AI Prompt API is active on this device.";
    } else if (availability === "after-download") {
      this.nanoStatusBadge.className = "ai-badge simulated";
      this.nanoStatusBadge.innerHTML = "⏳ Gemini Nano (Downloading)";
    } else {
      this.nanoStatusBadge.className = "ai-badge simulated";
      this.nanoStatusBadge.innerHTML = "💡 Simulated Nano (Demo)";
      this.nanoStatusBadge.title = "Running on high-fidelity simulation mode for browsers without native Prompt API.";
    }

    try {
      this.session = await createNanoSession(SYSTEM_PROMPT);
    } catch (e) {
      console.warn("Failed creating Nano session, falling back:", e);
    }
  }

  private async onSend() {
    const text = this.chatInput.value.trim();
    if (!text || this.isProcessing) return;

    this.chatInput.value = "";
    await this.handleUserQuery(text);
  }

  public async handleUserQuery(userText: string) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.sendBtn.disabled = true;

    // 1. Add User Message
    this.appendUserMessage(userText);

    // 2. Extract structured constraints from user natural language prompt
    const intent: ExtractedPlanIntent = parseUserShiftIntent(userText);

    // 3. Update current requirements
    this.currentRequirements = applyIntentToRequirements(this.currentRequirements, intent);

    // 4. Solve or diagnose with WaSHI
    const solveResult = await solveShiftSchedule(this.currentRequirements);

    // 5. Render right pane visualizers
    this.renderMetrics(solveResult);
    this.renderRoster(solveResult);
    this.renderConflict(solveResult);
    this.renderCodePreview(solveResult);

    // Show or hide left pane negotiation chips based on conflict status
    if (solveResult.status === "Infeasible") {
      if (this.negotiationChipsContainer) {
        this.negotiationChipsContainer.style.display = "flex";
      }
    } else {
      if (this.negotiationChipsContainer) {
        this.negotiationChipsContainer.style.display = "none";
      }
    }

    // 6. Generate natural language explanation with Gemini Nano (Streaming)
    await this.streamAssistantExplanation(solveResult, userText);

    this.isProcessing = false;
    this.sendBtn.disabled = false;
  }

  private appendUserMessage(text: string) {
    const row = document.createElement("div");
    row.className = "message-row user";
    row.innerHTML = `
      <div class="avatar user-avatar" title="あなた">👤</div>
      <div class="message-bubble">${this.escapeHtml(text)}</div>
    `;
    this.chatContainer.appendChild(row);
    this.scrollToBottom();
  }

  private appendAssistantMessage(textMarkdown: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.innerHTML = `
      <div class="avatar ai" title="Gemini Nano">🤖</div>
      <div class="message-bubble">${this.renderMarkdown(textMarkdown)}</div>
    `;
    this.chatContainer.appendChild(row);
    this.scrollToBottom();
    return row.querySelector(".message-bubble")!;
  }

  private async streamAssistantExplanation(
    result: ShiftSolveResult,
    userPrompt: string
  ) {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.innerHTML = `
      <div class="avatar ai" title="Gemini Nano">🤖</div>
      <div class="message-bubble streaming-cursor"></div>
    `;
    this.chatContainer.appendChild(row);
    const bubble = row.querySelector(".message-bubble") as HTMLElement;
    this.scrollToBottom();

    let promptContext = "";
    if (result.status === "Optimal") {
      promptContext = `
店長から「${userPrompt}」という依頼を受け、数理最適化ソルバーで最適なシフトを計算しました（総人件費: $${result.objectiveValue}）。
店長に向けて、以下の点を温かく親しみやすい自然な日本語で報告してください：
1. 最適なシフトが完成したこと
2. 申請された休暇希望がすべて反映されたこと
3. シニアスタッフ（アリスまたはボブ）が毎日現場リーダーとして配置されていること
4. 特定のスタッフに過度な負荷なく、公平に組まれていること

※【最重要】JSONやコードブロック（\`\`\`）は一切使わず、自然な日本語の会話文章のみで答えてください。
`.trim();
    } else if (result.status === "Infeasible") {
      promptContext = `
店長から「${userPrompt}」という依頼を受けましたが、条件が衝突したためシフトが作成できませんでした。
Z3ソルバーによる診断結果：土曜日にはシニア責任者が1名出勤必須ですが、シニア2名（アリス、ボブ）の双方が土曜休暇を希望したため矛盾が発生しました。

店長に向けて、以下の内容を分かりやすく温かい日本語で伝えてください：
1. 土曜日のシニア責任者配置と休暇希望が競合したため組めなかったこと
2. 以下の2つの解決案の提案：
   ・案1: ボブさんに土曜出勤をお願いし、代わりに平日の金曜日を休みに振り替える
   ・案2: 土曜日の必要人数を緩和し、シニア常駐義務を免除する
3. 店長が判断しやすいよう、どちらの案で進めるか尋ねる

※【最重要】JSONやコードブロック（\`\`\`）は一切使わず、自然な日本語の会話文章のみで答えてください。
`.trim();
    } else {
      promptContext = `店長から「${userPrompt}」という依頼を受けました。結果を日本語でわかりやすく伝えてください。JSONやコードブロックは一切使用禁止です。`;
    }

    let fullText = "";
    if (this.session) {
      try {
        const stream = this.session.promptStreaming(promptContext);
        for await (const chunk of stream) {
          fullText += chunk;
          bubble.innerHTML = this.renderMarkdown(fullText);
          this.scrollToBottom();
        }
      } catch (err) {
        console.warn("Streaming failed, using static text:", err);
        fullText = result.status === "Optimal"
          ? "最適なシフト表を作成しました！人件費最小化および休暇希望の反映が完了しています。"
          : "⚠️ 土曜日の希望が衝突してシフトを作成できませんでした。Z3の診断結果をご確認ください。";
        bubble.innerHTML = this.renderMarkdown(fullText);
      }
    }

    bubble.classList.remove("streaming-cursor");
    this.scrollToBottom();
  }

  private renderMetrics(result: ShiftSolveResult) {
    const isOpt = result.status === "Optimal";
    const statusClass = isOpt ? "optimal" : "infeasible";
    const statusText = isOpt ? "OPTIMAL" : "INFEASIBLE (UNSAT)";

    const costText = isOpt && result.objectiveValue ? `$${result.objectiveValue}` : "—";
    const timeText = `${(result.buildTimeMs + result.solveTimeMs).toFixed(1)}ms`;

    const totalReqs = this.currentRequirements.dayOffRequests.length;
    const reqText = isOpt ? `${totalReqs}/${totalReqs} (100%)` : `⚠️ 衝突あり`;

    this.metricsContainer.innerHTML = `
      <div class="metric-card ${statusClass}">
        <span class="metric-label">Status</span>
        <span class="metric-val" style="color: ${isOpt ? "var(--color-seiji)" : "var(--color-beni)"};">${statusText}</span>
        <span class="metric-sub">${isOpt ? "全制約充足・最適編成" : "Z3 UnsatCore で競合特定"}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Weekly Payroll</span>
        <span class="metric-val">${costText}</span>
        <span class="metric-sub">週末割増手当 (+$30/日) 込み</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Solve Time</span>
        <span class="metric-val">${timeText}</span>
        <span class="metric-sub">WASM (HiGHS & Z3)</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Vacation Satisfaction</span>
        <span class="metric-val">${reqText}</span>
        <span class="metric-sub">希望休暇ハード制約</span>
      </div>
    `;
  }

  private renderRoster(result: ShiftSolveResult) {
    if (result.status !== "Optimal" || !result.assignments) {
      this.rosterContainer.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--text-sumi-muted);">
          <div style="font-size: 2rem; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 600; color: var(--text-sumi);">シフト表を生成できません（制約競合中）</div>
          <div style="font-size: 0.82rem; margin-top: 4px;">下の診断カードまたはAIのアドバイスを確認し、条件を調整してください。</div>
        </div>
      `;
      return;
    }

    const dayHeaders = DAYS.map((d) => `<th>${d}</th>`).join("");

    const rows = result.assignments
      .map((a) => {
        const cells = DAYS.map((d) => {
          const isOn = a.schedule[d];
          const isReqOff = this.currentRequirements.dayOffRequests.some(
            (r) => r.staff === a.staff && r.day === d
          );

          if (isOn) {
            return `<td><span class="shift-badge work">ON</span></td>`;
          }
          if (isReqOff) {
            return `<td><span class="shift-badge off-req" title="希望休暇">OFF (希望)</span></td>`;
          }
          return `<td><span class="shift-badge off">OFF</span></td>`;
        }).join("");

        const roleBadge = a.isSenior
          ? `<span class="role-badge sr">Senior</span>`
          : `<span class="role-badge jr">Junior</span>`;

        const staffMetaInfo: Record<string, string> = {
          Alice: "店長代理・日給$220",
          Bob: "副店長・日給$210",
          Charlie: "一般・日給$160",
          Diana: "一般・日給$160",
          Evan: "一般・日給$150",
        };
        const metaText = staffMetaInfo[a.staff] ?? "";

        return `
          <tr>
            <td class="staff-col">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 700;">${a.staff}</span>
                ${roleBadge}
              </div>
              <div class="staff-meta">${metaText} • 週人件費: $${a.cost} (勤務 ${a.totalDays}/${a.maxShifts}日)</div>
            </td>
            ${cells}
          </tr>
        `;
      })
      .join("");

    // Bottom summary row: Coverage
    const coverageCells = DAYS.map((d) => {
      const cov = result.dailyCoverage?.[d];
      const cur = cov?.current ?? 0;
      const req = cov?.required ?? 0;
      const sCount = cov?.seniors ?? 0;
      const ok = cur >= req;
      return `
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">
          <div style="font-weight: 700; color: ${ok ? "var(--color-seiji)" : "var(--color-beni)"};">${cur}/${req}人</div>
          <div style="font-size: 0.7rem; color: var(--text-sumi-muted);">Sr: ${sCount}人</div>
        </td>
      `;
    }).join("");

    this.rosterContainer.innerHTML = `
      <table class="roster-table">
        <thead>
          <tr>
            <th class="staff-col">スタッフ</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background: var(--bg-surface-elevated); font-weight: 600;">
            <td class="staff-col">必要人員充足</td>
            ${coverageCells}
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderConflict(result: ShiftSolveResult) {
    if (result.status !== "Infeasible" || !result.conflictDetails) {
      this.conflictContainer.innerHTML = "";
      this.conflictContainer.style.display = "none";
      return;
    }

    this.conflictContainer.style.display = "flex";
    const coreTags = (result.unsatCore ?? [])
      .map((c) => `<span class="conflict-tag">❌ ${c}</span>`)
      .join("");

    this.conflictContainer.innerHTML = `
      <div class="conflict-alert-header">
        <span>⚡ Z3 SMT 競合診断 (Unsat Core Pinpointed)</span>
      </div>
      <p style="font-size: 0.88rem; line-height: 1.6; color: var(--text-sumi);">
        ${this.escapeHtml(result.conflictDetails.explanation)}
      </p>
      <div>
        <span style="font-size: 0.76rem; font-weight: 600; text-transform: uppercase; color: var(--text-sumi-muted);">衝突している制約サブセット:</span>
        <div class="conflict-core-tags">${coreTags}</div>
      </div>
      <div class="conflict-actions">
        <button type="button" class="btn-negotiate" id="btn-resolve-compromise">
          🤝 案1: Bobに土曜出勤を依頼し金曜振替で解決
        </button>
        <button type="button" class="btn-negotiate" id="btn-resolve-relax">
          ⚙️ 案2: 土曜の必要人数を2人に緩和
        </button>
      </div>
    `;

    document.getElementById("btn-resolve-compromise")?.addEventListener("click", () => {
      this.chatInput.value = "案1で調整して。Bobさんに土曜出勤を依頼して代わりに金曜休みにして。";
      this.onSend();
    });

    document.getElementById("btn-resolve-relax")?.addEventListener("click", () => {
      this.chatInput.value = "土曜日の必要人数を2人に緩和して、シニア制限を外して再計算して。";
      this.onSend();
    });
  }

  private renderCodePreview(result: ShiftSolveResult) {
    if (!result.modelCodePreview) return;
    this.codePreviewContainer.textContent = result.modelCodePreview;
  }

  private cleanAssistantResponse(raw: string): string {
    let text = raw.trim();

    // 1. If wrapped in markdown code fence (```json ... ``` or ``` ... ```)
    const fenceMatch = text.match(/^```(?:json|markdown|text)?\s*([\s\S]*?)(?:```)?$/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    // 2. Remove any remaining ``` fences
    text = text.replace(/```(?:json|markdown|text)?/gi, "").replace(/```/g, "").trim();

    // 3. If raw output is a JSON object or stringified JSON
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const obj = JSON.parse(text);
        const parts: string[] = [];
        if (obj.message) parts.push(obj.message);
        if (obj.summary) parts.push(obj.summary);
        if (obj.explanation) parts.push(obj.explanation);
        if (obj.advice) parts.push(obj.advice);
        if (obj.details) parts.push(obj.details);
        if (parts.length > 0) {
          return parts.join("\n\n");
        }
      } catch {
        // Incomplete JSON during streaming: extract values from common keys
        const match = text.match(/"(?:summary|explanation|message|advice)":\s*"([^"]+)"/);
        if (match) {
          return match[1];
        }
      }
    }

    // 4. If during streaming it starts with partial JSON object like {"summary": "...
    if (text.startsWith("{") && text.includes('"')) {
      const match = text.match(/"(?:summary|explanation|message|advice)":\s*"([^"]*)/);
      if (match) {
        return match[1];
      }
      if (!text.includes("\n")) {
        return "...";
      }
    }

    return text;
  }

  private renderMarkdown(rawMd: string): string {
    const md = this.cleanAssistantResponse(rawMd);
    if (!md) return "";

    const lines = md.split("\n");
    let inList = false;
    const out: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const isBullet = /^[•\-\*]\s+(.*)$/.test(trimmed) || /^\d+\.\s+(.*)$/.test(trimmed);

      if (isBullet) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        const content = trimmed.replace(/^[•\-\*]\s+/, "").replace(/^\d+\.\s+/, "");
        out.push(`<li>${this.formatInline(content)}</li>`);
      } else {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        if (trimmed === "") {
          out.push("<br>");
        } else {
          out.push(`<p>${this.formatInline(line)}</p>`);
        }
      }
    }
    if (inList) {
      out.push("</ul>");
    }

    return out.join("");
  }

  private formatInline(text: string): string {
    let s = this.escapeHtml(text);
    // Bold **text**
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Inline code `code`
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
}
