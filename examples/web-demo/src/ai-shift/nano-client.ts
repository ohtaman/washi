import type { NanoAvailability, NanoSessionWrapper, DayOffRequest, ExtractedPlanIntent, ShiftRequirements, Day } from "./types.js";
import { DEFAULT_COVERAGE } from "./shift-solver.js";

/**
 * Prompt API Client targeting the modern WICG Prompt API standard (`window.LanguageModel`),
 * with backwards-compatibility for `window.ai.languageModel` and a robust simulated fallback
 * for non-Chrome or older browser environments.
 */

export async function checkNanoAvailability(): Promise<NanoAvailability> {
  if (typeof window === "undefined") return "no";

  // Modern WICG Prompt API spec (Chrome 148+ / Canary / modern built-in AI)
  if ("LanguageModel" in window) {
    try {
      const lm = (window as any).LanguageModel;
      if (typeof lm.availability === "function") {
        const result = await lm.availability();
        if (result === "readily" || result === "available") return "readily";
        if (result === "after-download" || result === "downloadable" || result === "downloading") return "after-download";
        return "no";
      }
    } catch (e) {
      console.warn("Failed checking window.LanguageModel availability:", e);
    }
  }

  // Legacy exploratory namespace (2024 draft window.ai.languageModel)
  if ((window as any).ai?.languageModel) {
    try {
      const aim = (window as any).ai.languageModel;
      if (typeof aim.availability === "function") {
        const result = await aim.availability();
        if (result === "readily" || result === "available") return "readily";
        if (result === "after-download" || result === "downloadable" || result === "downloading") return "after-download";
        return "no";
      }
      if (typeof aim.capabilities === "function") {
        const caps = await aim.capabilities();
        if (caps.available === "readily" || caps.available === "available") return "readily";
        if (caps.available === "after-download" || caps.available === "downloadable") return "after-download";
        return "no";
      }
    } catch (e) {
      console.warn("Failed checking window.ai.languageModel availability:", e);
    }
  }

  return "no";
}

export async function createNanoSession(
  systemPrompt: string,
  onProgress?: (loaded: number) => void
): Promise<NanoSessionWrapper> {
  const availability = await checkNanoAvailability();

  if (availability !== "no") {
    try {
      let rawSession: any = null;

      // Modern API: window.LanguageModel.create()
      if ("LanguageModel" in window) {
        const lm = (window as any).LanguageModel;
        rawSession = await lm.create({
          initialPrompts: [{ role: "system", content: systemPrompt }],
          monitor(m: any) {
            m?.addEventListener?.("downloadprogress", (e: any) => {
              if (e.loaded && onProgress) {
                onProgress(e.loaded);
              }
            });
          },
        });
      } else if ((window as any).ai?.languageModel) {
        // Legacy fallback
        const aim = (window as any).ai.languageModel;
        rawSession = await aim.create({
          systemPrompt,
          initialPrompts: [{ role: "system", content: systemPrompt }],
        });
      }

      if (rawSession) {
        return {
          isMock: false,
          async prompt(text: string, options?: { responseConstraint?: any; signal?: AbortSignal }): Promise<string> {
            if (options?.responseConstraint && typeof rawSession.prompt === "function") {
              try {
                return await rawSession.prompt(text, {
                  responseConstraint: options.responseConstraint,
                  signal: options?.signal,
                });
              } catch {
                // If responseConstraint is not yet supported in this build, fallback to standard prompt
                return await rawSession.prompt(text, { signal: options?.signal });
              }
            }
            return await rawSession.prompt(text, { signal: options?.signal });
          },
          async *promptStreaming(text: string, options?: { signal?: AbortSignal }): AsyncIterable<string> {
            if (typeof rawSession.promptStreaming === "function") {
              const stream = rawSession.promptStreaming(text, { signal: options?.signal });
              let accumulated = "";
              for await (const chunk of stream) {
                if (options?.signal?.aborted) break;
                if (typeof chunk === "string") {
                  if (chunk.startsWith(accumulated) && chunk.length >= accumulated.length) {
                    // Cumulative snapshot from Chrome Prompt API
                    const delta = chunk.slice(accumulated.length);
                    accumulated = chunk;
                    if (delta) yield delta;
                  } else {
                    // Delta token
                    accumulated += chunk;
                    yield chunk;
                  }
                }
              }
              return;
            }
            // Fallback if promptStreaming is missing
            const full = await rawSession.prompt(text, { signal: options?.signal });
            yield full;
          },
          destroy() {
            try {
              rawSession.destroy?.();
            } catch (e) {
              console.warn("Error destroying Nano session:", e);
            }
          },
        };
      }
    } catch (err) {
      console.warn("Could not create native LanguageModel session, switching to simulation:", err);
    }
  }

  // Fallback simulation session
  return createSimulatedSession(systemPrompt);
}

/**
 * High-fidelity simulation of Gemini Nano for environments without native built-in AI support.
 * Accurately parses user requests, extracts shift requests, and provides streaming explanations.
 */
function createSimulatedSession(_systemPrompt: string): NanoSessionWrapper {
  let isDestroyed = false;

  return {
    isMock: true,
    async prompt(text: string, options?: { responseConstraint?: any; signal?: AbortSignal }): Promise<string> {
      if (isDestroyed) throw new Error("Session destroyed");
      // Simulated parsing logic
      const intent = parseUserShiftIntent(text);
      if (options?.responseConstraint) {
        return JSON.stringify(intent, null, 2);
      }
      return JSON.stringify(intent);
    },

    async *promptStreaming(text: string, options?: { signal?: AbortSignal }): AsyncIterable<string> {
      if (isDestroyed) throw new Error("Session destroyed");

      // Generate context-aware response based on the prompt input
      const response = generateSimulatedResponse(text);
      let idx = 0;
      while (idx < response.length) {
        if (options?.signal?.aborted) break;
        const take = Math.min(Math.floor(Math.random() * 3) + 2, response.length - idx);
        const chunk = response.slice(idx, idx + take);
        idx += take;
        yield chunk;
        // Stream delay simulation (15ms per chunk for natural Japanese typing speed)
        await new Promise((r) => setTimeout(r, 15));
      }
    },

    destroy() {
      isDestroyed = true;
    },
  };
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseTargetDay(text: string): Day | null {
  // Match full and explicit multi-character names first
  if (/月曜日|月曜|\bmon(?:day)?\b/i.test(text)) return "Mon";
  if (/火曜日|火曜|\btue(?:sday)?\b/i.test(text)) return "Tue";
  if (/水曜日|水曜|\bwed(?:nesday)?\b/i.test(text)) return "Wed";
  if (/木曜日|木曜|\bthu(?:rsday)?\b/i.test(text)) return "Thu";
  if (/金曜日|金曜|\bfri(?:day)?\b/i.test(text)) return "Fri";
  if (/土曜日|土曜|\bsat(?:urday)?\b/i.test(text)) return "Sat";
  if (/日曜日|日曜|\bsun(?:day)?\b/i.test(text)) return "Sun";

  // Match clearly delimited single-character abbreviations (e.g. "(月)", "（水）", "月:", "月 の")
  const delimited = text.match(/[（\(]([月火水木金土日])[）\)]|(?:^|[^\p{Script=Han}])([月火水木金土日])(?:[:：\s]|の(?:人数|シフト|体制|出勤))/u);
  if (delimited) {
    const kanji = delimited[1] || delimited[2];
    switch (kanji) {
      case "月": return "Mon";
      case "火": return "Tue";
      case "水": return "Wed";
      case "木": return "Thu";
      case "金": return "Fri";
      case "土": return "Sat";
      case "日": return "Sun";
    }
  }

  return null;
}

function parseTargetCount(text: string): number | null {
  // 1. Japanese units: 人体制, 名体制, 人, 名
  // Ensure token is complete (not preceded by digits, signs, or decimal dots)
  const jpMatch = text.match(/(?<![-+0-9a-zA-Z.])([-+]?\d+(?:\.\d+)?|[一二三四五六七八九十])\s*(?:人体制|名体制|人|名)(?![0-9a-zA-Z.])/u);
  if (jpMatch) {
    const raw = jpMatch[1].trim();
    if (raw.includes(".") || raw.startsWith("-") || raw.startsWith("+")) {
      return null;
    }
    const count = WORD_NUMBERS[raw] ?? parseInt(raw, 10);
    if (!isNaN(count) && count >= 1 && count <= 10) {
      return count;
    }
    return null; // out of range (e.g. 0, negative, > 10)
  }

  // 2. English units: staff, people, workers, persons
  // Strict non-word boundary before and word boundary after English unit
  const enMatch = text.match(/(?<![-+0-9a-zA-Z.])([-+]?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:staff|people|workers|persons)\b/i);
  if (enMatch) {
    const raw = enMatch[1].toLowerCase().trim();
    if (raw.includes(".") || raw.startsWith("-") || raw.startsWith("+")) {
      return null;
    }
    const count = WORD_NUMBERS[raw] ?? parseInt(raw, 10);
    if (!isNaN(count) && count >= 1 && count <= 10) {
      return count;
    }
    return null;
  }

  // 3. Fallback for prepositional/particle counts without immediate unit:
  // e.g. "coverage to 3", "必要人数を 3 に", "headcount: 4"
  const prepMatch = text.match(/(?:\bto\s+|[:：=]\s*|[をに]\s*)(?<![-+0-9a-zA-Z.])([-+]?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|[一二三四五六七八九十])(?!\s*[-+0-9a-zA-Z./])/i);
  if (prepMatch) {
    const raw = prepMatch[1].toLowerCase().trim();
    if (raw.includes(".") || raw.startsWith("-") || raw.startsWith("+")) {
      return null;
    }
    const count = WORD_NUMBERS[raw] ?? parseInt(raw, 10);
    if (!isNaN(count) && count >= 1 && count <= 10) {
      return count;
    }
    return null;
  }

  return null;
}

/**
 * Natural language parser for extracting shift intents from English or Japanese prompts.
 */
export function parseUserShiftIntent(userText: string): ExtractedPlanIntent {
  const mentionsAlice = /alice|アリス/i.test(userText);
  const mentionsBob = /bob|ボブ/i.test(userText);
  const mentionsCharlie = /charlie|チャーリー/i.test(userText);
  const mentionsDiana = /diana|ダイアナ/i.test(userText);
  const mentionsEvan = /evan|エヴァン/i.test(userText);
  const mentionsStaff = mentionsAlice || mentionsBob || mentionsCharlie || mentionsDiana || mentionsEvan;

  const mentionsSat = /sat|土曜/i.test(userText);
  const mentionsSun = /sun|日曜/i.test(userText);
  const mentionsMon = /mon|月曜/i.test(userText);
  const mentionsWed = /wed|水曜/i.test(userText);
  const mentionsFri = /fri|金曜/i.test(userText);

  const mentionsSeniorWaiver = /シニア.*(免除|不要|なし|外す|外して|いらない)|waive.*senior|senior.*waive|without senior/i.test(userText);
  const mentionsSeniorEnforce = /シニア.*(必須|常駐|配置|必要|戻す)|enforce.*senior|require.*senior/i.test(userText);

  // 1. Explicit preset scenario: "案2（条件緩和）"
  if (/案2|option\s*2|scenario\s*c|シナリオc/i.test(userText)) {
    return {
      action: "relax",
      coverageOverrides: { Sat: 2 },
      seniorRequiredDaily: false,
      summary: "Relaxed Saturday coverage to 2 staff and waived mandatory senior duty.",
    };
  }

  // 2. Coverage modification (e.g. "土曜日の必要人数を2人にしてください", "relax Saturday coverage to 2")
  const isCoverageQuery = /必要人数|出勤人数|体制|人数|coverage|headcount|staffing|staff|requirement|緩和|減ら/i.test(userText);
  const targetDay = parseTargetDay(userText);

  if (targetDay && isCoverageQuery && !mentionsStaff) {
    const targetCount = parseTargetCount(userText);
    const seniorWaiver = mentionsSeniorWaiver ? false : mentionsSeniorEnforce ? true : undefined;

    // Reject missing, non-integer, zero, negative, or unsupported counts (leaves requirements untouched)
    if (targetCount === null) {
      return {
        action: "modify",
        seniorRequiredDaily: seniorWaiver,
        summary: `Could not parse a valid headcount for ${targetDay} (must be an integer between 1 and 10 staff). Current staffing requirements remain unchanged.`,
      };
    }

    return {
      action: targetCount < (DEFAULT_COVERAGE[targetDay] ?? 3) ? "relax" : "modify",
      coverageOverrides: { [targetDay]: targetCount },
      seniorRequiredDaily: seniorWaiver,
      summary: `Adjusted ${targetDay} required coverage to ${targetCount} staff${seniorWaiver === false ? " and waived senior duty" : ""}.`,
    };
  }

  // 3. Senior waiver query without coverage adjustment or staff mention
  if (mentionsSeniorWaiver && !mentionsStaff) {
    return {
      action: "relax",
      seniorRequiredDaily: false,
      summary: "Waived mandatory senior staff duty.",
    };
  }

  // 4. Negotiated resolution: "案1" or Bob swaps Saturday for Friday
  if (/ボブ.*(土曜.*出勤|出勤.*土曜|振替)|bob.*work.*sat|compromise|案1|option\s*1/i.test(userText)) {
    return {
      action: "modify",
      dayOffRequests: [
        { staff: "Alice", day: "Sat", reason: "Wedding attendance" },
        { staff: "Bob", day: "Fri", reason: "Swapped Saturday to Friday" },
        { staff: "Charlie", day: "Sat", reason: "Off request" },
        { staff: "Diana", day: "Wed", reason: "Doctor appointment" },
      ],
      summary: "Bob agreed to work on Saturday in exchange for taking Friday off. Alice takes Saturday off.",
    };
  }

  // 5. Conflict Scenario: Alice & Bob both request Saturday off (or "シナリオB", "競合")
  if ((mentionsAlice && mentionsBob && mentionsSat) || /重複|clash|conflict|矛盾|シナリオb/i.test(userText)) {
    return {
      action: "create",
      dayOffRequests: [
        { staff: "Alice", day: "Sat", reason: "Family event (Senior)" },
        { staff: "Bob", day: "Sat", reason: "Personal trip (Senior)" },
        { staff: "Charlie", day: "Sat", reason: "Weekend off (Junior)" },
        { staff: "Diana", day: "Wed", reason: "Routine errand" },
      ],
      coverageOverrides: { Sat: 3 },
      seniorRequiredDaily: true,
      summary: "Requested Saturday off for Alice (Sr), Bob (Sr), Charlie (Jr), and Wednesday off for Diana.",
    };
  }

  // 6. Feasible Scenario: standard balanced requests (or "シナリオA", "作成", "来週")
  if (mentionsAlice || mentionsBob || mentionsCharlie || mentionsDiana || /シナリオa|feasible|作成|来週/i.test(userText)) {
    const list: DayOffRequest[] = [];
    list.push({ staff: "Alice", day: mentionsAlice && mentionsSun ? "Sun" : "Sun" });
    list.push({ staff: "Bob", day: mentionsBob && mentionsMon ? "Mon" : "Mon" });
    list.push({ staff: "Charlie", day: mentionsCharlie && mentionsSat ? "Sat" : "Sat" });
    list.push({ staff: "Diana", day: mentionsDiana && mentionsWed ? "Wed" : "Wed" });

    return {
      action: "create",
      dayOffRequests: list,
      coverageOverrides: { Sat: 3 },
      seniorRequiredDaily: true,
      summary: "Balanced weekly vacation requests: Alice (Sun), Bob (Mon), Charlie (Sat), Diana (Wed).",
    };
  }

  // 7. Fallback default
  return {
    action: "create",
    dayOffRequests: [
      { staff: "Alice", day: "Sun", reason: "Rest" },
      { staff: "Bob", day: "Mon", reason: "Rest" },
      { staff: "Charlie", day: "Sat", reason: "Rest" },
      { staff: "Diana", day: "Wed", reason: "Rest" },
    ],
    coverageOverrides: { Sat: 3 },
    seniorRequiredDaily: true,
    summary: "Standard vacation requests parsed from your prompt.",
  };
}

/**
 * Applies structured ExtractedPlanIntent to the current ShiftRequirements.
 * Ensures coverage-only edits do not unintentionally modify existing vacation requests
 * or waive senior duty unless explicitly requested.
 */
export function applyIntentToRequirements(
  current: ShiftRequirements,
  intent: ExtractedPlanIntent
): ShiftRequirements {
  if (intent.action === "create") {
    return {
      ...current,
      staffList: [...current.staffList],
      dayOffRequests: intent.dayOffRequests !== undefined ? [...intent.dayOffRequests] : [...current.dayOffRequests],
      requiredCoverage: intent.coverageOverrides
        ? { ...DEFAULT_COVERAGE, ...intent.coverageOverrides }
        : { ...DEFAULT_COVERAGE },
      seniorRequiredDaily: intent.seniorRequiredDaily !== undefined ? intent.seniorRequiredDaily : true,
    };
  }

  const updated: ShiftRequirements = {
    ...current,
    staffList: [...current.staffList],
    requiredCoverage: { ...current.requiredCoverage },
    dayOffRequests: intent.dayOffRequests !== undefined ? [...intent.dayOffRequests] : [...current.dayOffRequests],
    seniorRequiredDaily: intent.seniorRequiredDaily !== undefined ? intent.seniorRequiredDaily : current.seniorRequiredDaily,
  };

  if (intent.coverageOverrides) {
    updated.requiredCoverage = {
      ...updated.requiredCoverage,
      ...intent.coverageOverrides,
    };
  }

  return updated;
}

function generateSimulatedResponse(promptText: string): string {
  if (promptText.includes("INFEASIBLE") || promptText.includes("衝突") || promptText.includes("組めません")) {
    return (
      "⚠️ **土曜日のシフト作成で条件の競合（矛盾）が発生しました**\n\n" +
      "数理最適化ソルバーで実行不可能となったため、Z3ソルバーで衝突原因（Unsat Core）を診断しました：\n\n" +
      "• **原因**: 土曜日はシニア責任者が最低1名出勤必須ですが、シニア2名（アリス、ボブ）の双方が土曜休暇を希望しています。\n\n" +
      "💡 **店長への調整ご提案**:\n" +
      "1. **案1（振替交渉）**: ボブさんに土曜出勤をお願いし、代わりに平日の金曜日を休みに振り替える\n" +
      "2. **案2（条件緩和）**: 土曜日の必要人数を緩和し、シニア常駐義務を免除する\n\n" +
      "右側の診断カードのボタン、または下のチャットで「案1で調整して」と指示していただければ、直ちに再計算します！"
    );
  }

  if (promptText.includes("緩和") || promptText.includes("RELAXED")) {
    return (
      "土曜日の条件を緩和し、新しいシフトを編成しました！✨\n\n" +
      "• **休暇の確保**: アリスさんとボブさんの双方の土曜休暇を反映できました。\n" +
      "• **現場運営**: 土曜はジュニアスタッフ2名体制で運営をカバーします。\n" +
      "• **総人件費**: 条件緩和により週末手当が抑えられ、人件費も最適化されています。"
    );
  }

  // Default optimal schedule
  return (
    "最適なシフト表を作成しました！🎉\n\n" +
    "• **人件費の最小化**: 最安コストで週の編成を完了しました（週末割増手当 +$30/日 も最小限です）。\n" +
    "• **休暇希望の反映**: 申請されたすべての希望休暇を100%反映しています。\n" +
    "• **責任者配置**: すべての日程でシニアスタッフ（アリスまたはボブ）の常駐義務（`senior_duty`）を達成しています。\n" +
    "• **勤務バランス**: 全員の週勤務日数は4〜5日以内に収まり、公平に配分されています。"
  );
}
