import {
  generateTimetableState,
  injectTimetableConflictScenario,
} from "./generator.js";
import {
  COURSE_PROFILE_I18N,
  PROFESSOR_PROFILE_I18N,
  ROOM_PROFILE_I18N,
  formatConstraintMetaI18n,
  pickTimetableLang,
  type TimetableLang,
} from "./i18n.js";
import {
  DAYS_OF_WEEK,
  DAY_FULL_LABELS_JA,
  DAY_LABELS_JA,
  PERIODS,
  ROOM_TYPE_LABELS_JA,
  formatSlotJa,
  resolveDayToken,
  resolvePeriodNumbers,
  type ChatTimetableOperation,
  type CourseProfile,
  type CustomTimetableRule,
  type LlmCallTrace,
  type ParsedTimetableChatPlan,
  type ProfessorProfile,
  type RoomProfile,
  type RoomType,
  type TimetableDay,
  type TimetablePeriod,
  type TimetableState,
  type WashiTimetableSolveOutcome,
} from "./types.js";

export type GeminiNanoStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export interface ChatExtractProgressEvent {
  phase: "turn1_start" | "turn1_done" | "turn2_start" | "turn2_done";
  activeLabel: string;
}

export interface TimetableGeminiNanoManager {
  getStatus(): GeminiNanoStatus;
  getDownloadProgress(): number | null;
  getLastConsultTrace(): LlmCallTrace | null;
  initialize(onProgress?: (pct: number) => void, lang?: TimetableLang): Promise<GeminiNanoStatus>;
  extractPlan(
    userMessage: string,
    state: TimetableState,
    signal?: AbortSignal,
    onProgress?: (event: ChatExtractProgressEvent) => void,
    lang?: TimetableLang
  ): Promise<ParsedTimetableChatPlan>;
  streamConsultationReply(
    userMessage: string,
    appliedSummary: string[],
    state: TimetableState,
    outcome: WashiTimetableSolveOutcome | null,
    signal?: AbortSignal,
    lang?: TimetableLang
  ): AsyncIterable<string>;
  resetConversation(): Promise<void>;
  destroy(): void;
}

function buildLanguageModelOptions(lang: TimetableLang = "ja") {
  const outputs = Array.from(new Set([lang, "ja", "en", "zh"]));
  return {
    expectedInputs: [{ type: "text", languages: ["ja", "en", "zh"] }],
    expectedOutputs: [{ type: "text", languages: outputs }],
  };
}

const LANGUAGE_MODEL_JA_OPTIONS = buildLanguageModelOptions("ja");

interface LanguageModelSessionLike {
  prompt(input: string, options?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>;
  promptStreaming?(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  clone?(): Promise<LanguageModelSessionLike>;
  destroy?(): void;
}

interface LanguageModelFactoryLike {
  availability?(options?: unknown): Promise<unknown>;
  capabilities?(): Promise<{ available?: unknown }>;
  create(options?: unknown): Promise<LanguageModelSessionLike>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelFactoryLike;
  }
}

function getLanguageModelApi(): LanguageModelFactoryLike | null {
  const g = globalThis as { LanguageModel?: LanguageModelFactoryLike };
  if (typeof g.LanguageModel !== "undefined" && g.LanguageModel) {
    return g.LanguageModel;
  }
  if (typeof window !== "undefined" && window.LanguageModel) {
    return window.LanguageModel;
  }
  return null;
}

function normalizeAvailabilityString(raw: unknown): GeminiNanoStatus | null {
  if (raw === "available" || raw === "readily") return "available";
  if (raw === "downloadable" || raw === "after-download") return "downloadable";
  if (raw === "downloading") return "downloading";
  if (raw === "unavailable" || raw === "no") return "unavailable";
  return null;
}

export async function checkGeminiNanoAvailability(): Promise<GeminiNanoStatus> {
  const api = getLanguageModelApi();
  if (!api) return "unavailable";

  if (typeof api.availability === "function") {
    try {
      const statusWithLang = normalizeAvailabilityString(
        await api.availability(LANGUAGE_MODEL_JA_OPTIONS)
      );
      if (statusWithLang && statusWithLang !== "unavailable") {
        return statusWithLang;
      }
    } catch {
      // Fall through
    }
    try {
      const statusDefault = normalizeAvailabilityString(await api.availability());
      if (statusDefault) return statusDefault;
    } catch {
      // Ignore
    }
  }

  if (typeof api.capabilities === "function") {
    try {
      const caps = await api.capabilities();
      const mapped = normalizeAvailabilityString(caps?.available);
      if (mapped) return mapped;
    } catch {
      // Ignore
    }
  }

  if (typeof api.create === "function") {
    return "available";
  }
  return "unavailable";
}

async function createSessionWithFallback(
  api: LanguageModelFactoryLike,
  systemPrompt: string,
  monitorFn?: (m: unknown) => void,
  lang: TimetableLang = "ja"
): Promise<LanguageModelSessionLike> {
  const baseWithMonitor = monitorFn ? { monitor: monitorFn } : {};
  const langOptions = buildLanguageModelOptions(lang);
  try {
    return await api.create({
      ...langOptions,
      temperature: 0.1,
      topK: 1,
      initialPrompts: [{ role: "system", content: systemPrompt }],
      ...baseWithMonitor,
    });
  } catch {
    try {
      return await api.create({
        ...langOptions,
        initialPrompts: [{ role: "system", content: systemPrompt }],
        ...baseWithMonitor,
      });
    } catch {
      return await api.create({
        initialPrompts: [{ role: "system", content: systemPrompt }],
        ...baseWithMonitor,
      });
    }
  }
}

/**
 * Normalizes free text for exact entity-name comparison:
 * trims, strips surrounding quotes, removes whitespace, and lower-cases.
 */
function normalizeEntityText(raw: string): string {
  return raw
    .trim()
    .replace(/^[「『《"']+|[」』》"']+$/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Resolves an entity strictly:
 * 1. An explicit ID token (e.g. `C15`, `P09`, `R101`) contained in the text, or
 * 2. An exact (normalized) match against one of the entity's registered names / aliases / translations.
 * Returns `null` if nothing matches or if the name matches more than one distinct entity.
 * There is no substring / fuzzy matching.
 */
function resolveEntityStrict<T extends { id: string }>(
  query: string | undefined,
  entities: readonly T[],
  idPattern: RegExp,
  namesOf: (entity: T) => readonly string[],
  preprocess: (text: string) => string = (t) => t
): T | null {
  if (!query) return null;
  const idMatch = query.match(idPattern);
  if (idMatch) {
    const byId = entities.find((e) => e.id.toUpperCase() === idMatch[1].toUpperCase());
    if (byId) return byId;
  }
  const target = normalizeEntityText(preprocess(query));
  if (!target) return null;
  const matches = entities.filter((e) =>
    namesOf(e).some((n) => normalizeEntityText(n) === target)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function resolveCourseFromText(
  query: string | undefined,
  courses: readonly CourseProfile[]
): CourseProfile | null {
  return resolveEntityStrict(query, courses, /\b(C\d{2})\b/i, (c) => {
    const i18nEntry = COURSE_PROFILE_I18N[c.id];
    return [
      c.title,
      c.shortTitle,
      ...c.aliases,
      ...(i18nEntry
        ? [
            i18nEntry.en.title,
            i18nEntry.en.shortTitle,
            i18nEntry.zh.title,
            i18nEntry.zh.shortTitle,
          ]
        : []),
    ];
  });
}

export function resolveProfessorFromText(
  query: string | undefined,
  professors: readonly ProfessorProfile[]
): ProfessorProfile | null {
  return resolveEntityStrict(
    query,
    professors,
    /\b(P\d{2})\b/i,
    (p) => {
      const i18nEntry = PROFESSOR_PROFILE_I18N[p.id];
      return [
        p.name,
        p.kana,
        ...(i18nEntry
          ? [
              i18nEntry.ja.name,
              i18nEntry.ja.shortName,
              i18nEntry.en.name,
              i18nEntry.en.shortName,
              i18nEntry.zh.name,
              i18nEntry.zh.shortName,
            ]
          : []),
      ];
    },
    // Honorific titles are not part of a person's name.
    (text) =>
      text.replace(
        /准教授|非常勤講師|教授|講師|先生|さん|氏|副教授|外聘讲师|讲师|老师|Prof\.|Professor|Dr\./gi,
        ""
      )
  );
}

export function resolveRoomFromText(
  query: string | undefined,
  rooms: readonly RoomProfile[]
): RoomProfile | null {
  return resolveEntityStrict(query, rooms, /\b(R\d{3})\b/i, (r) => {
    const i18nEntry = ROOM_PROFILE_I18N[r.id];
    return [
      r.name,
      r.shortName,
      ...r.aliases,
      ...(i18nEntry
        ? [i18nEntry.en.name, i18nEntry.en.shortName, i18nEntry.zh.name, i18nEntry.zh.shortName]
        : []),
    ];
  });
}

/**
 * Strictly validates a list of days. Accepts only a non-empty array whose every element
 * resolves to Mon–Fri. Returns `null` otherwise — no implicit fallback to "all days".
 */
export function resolveDaysFromInput(raw: unknown): TimetableDay[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: TimetableDay[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const d = resolveDayToken(item);
    if (!d) return null;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

export const TIMETABLE_EXTRACTION_SCHEMA = {
  type: "object",
  required: ["thought", "intentType", "toolCalls", "replyJa"],
  properties: {
    thought: { type: "string" },
    intentType: {
      type: "string",
      enum: ["modify_and_solve", "consult_only", "clarify", "unsupported"],
    },
    toolCalls: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        required: ["tool_name", "args"],
        properties: {
          tool_name: {
            type: "string",
            enum: [
              "pin_course_slot",
              "forbid_course_slot",
              "set_professor_unavailability",
              "set_professor_preference",
              "set_course_room_rule",
              "add_course_relation_rule",
              "add_room_closure",
              "set_config_param",
              "inject_conflict_demo",
              "clear_custom_rules",
              "reset_all",
              "solve_or_diagnose",
            ],
          },
          args: {
            type: "object",
            properties: {
              course: { type: "string" },
              secondCourse: { type: "string" },
              professor: { type: "string" },
              room: { type: "string" },
              roomType: {
                type: "string",
                enum: ["large_hall", "medium_room", "pc_lab", "seminar_room"],
              },
              days: {
                type: "array",
                items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
              },
              periods: {
                type: "array",
                items: { type: "integer", minimum: 1, maximum: 5 },
              },
              exclusiveAvailable: { type: "boolean" },
              avoidPeriod1: { type: "boolean" },
              avoidPeriod5: { type: "boolean" },
              maxSessionsPerDay: { type: "integer", minimum: 1, maximum: 5 },
              relationKind: {
                type: "string",
                enum: [
                  "course_no_overlap",
                  "course_same_day",
                  "course_consecutive",
                  "course_precedence",
                ],
              },
              mode: { type: "string", enum: ["require", "forbid"] },
              isHard: { type: "boolean" },
              paramName: {
                type: "string",
                enum: [
                  "maxProfessorConsecutivePeriods",
                  "maxProfessorSessionsPerDay",
                  "maxCohortCompulsoryPerDay",
                  "enforceRoomCapacity",
                  "enforceRoomEquipment",
                  "enforceCohortNoOverlap",
                  "enforceProfessorAvailability",
                  "forbidSameCourseSameDay",
                  "enforceMaxConsecutivePeriods",
                  "preserveCurrentTimetable",
                ],
              },
              paramValueNumber: { type: "integer" },
              paramValueBoolean: { type: "boolean" },
              scenario: {
                type: "string",
                enum: ["room_double_book", "prof_impossible_day", "pc_lab_overload"],
              },
              reason: { type: "string" },
            },
          },
        },
      },
    },
    replyJa: { type: "string" },
  },
};

const EXTRACTOR_SYSTEM_PROMPT = `あなたは大学の時間割編成（University Course Timetabling）AIコパイロットのプランナーです。
教務課スタッフや教員からの自然言語の要望を解析し、JSON Schemaに従って toolCalls に変換してください。

【利用可能なツール一覧】
1. "pin_course_slot": 特定の科目(course)を特定の曜日(days)・時限(periods)、および任意の教室(room)に固定する。
   例: 「数理最適化(C15)を火曜2限の101大講義室(R101)に固定して」 -> tool_name:"pin_course_slot", args:{course:"C15", days:["Tue"], periods:[2], room:"R101", isHard:true}
   例: 「数理最適化(C15)の2コマを火曜2限と木曜2限に固定して」 -> tool_name:"pin_course_slot", args:{course:"C15", days:["Tue","Thu"], periods:[2], isHard:true}
2. "forbid_course_slot": 特定の科目(course)を特定の曜日(days)・時限(periods)に配置禁止にする。
   例: 「機械学習(C16)は月曜1限と金曜5限を避けて」 -> tool_name:"forbid_course_slot", args:{course:"C16", days:["Mon"], periods:[1], isHard:true} 等
3. "set_professor_unavailability": 特定の教員(professor)のNG曜日・NG時限を設定、または「火曜と木曜だけ出講可能(exclusiveAvailable:true)」を設定する。
   ・午前 = periods:[1,2]、午後 = periods:[3,4,5]、終日 = periods:[1,2,3,4,5]
   例: 「非常勤の小林先生(P09)は火曜と木曜の午後(3〜5限)しか来られないようにして」 -> tool_name:"set_professor_unavailability", args:{professor:"P09", days:["Tue","Thu"], periods:[3,4,5], exclusiveAvailable:true, isHard:true}
   例: 「佐藤先生(P01)は金曜の午後(3〜5限)をNGにして」 -> tool_name:"set_professor_unavailability", args:{professor:"P01", days:["Fri"], periods:[3,4,5], exclusiveAvailable:false, isHard:true}
4. "set_professor_preference": 教員の1限回避(avoidPeriod1)・5限回避(avoidPeriod5)・1日最大担当コマ数(maxSessionsPerDay)を変更する。
5. "set_course_room_rule": 科目の使用教室・教室種別を指定(mode:"require")または禁止(mode:"forbid")する。
   roomType: "large_hall"(大講義室), "medium_room"(中講義室), "pc_lab"(PC演習室), "seminar_room"(ゼミ室)
6. "add_course_relation_rule": 科目間の関係制約を追加する。
   ・relationKind:"course_no_overlap": 2つの科目(course, secondCourse)を同じ曜日・時限に被せない（裏番組禁止）
   ・relationKind:"course_consecutive": 週2コマの科目(course)または2科目を同じ曜日の連続する時限(例:2-3限, 3-4限)に連続配置する
   ・relationKind:"course_same_day": 同じ曜日に配置する
   ・relationKind:"course_precedence": course を secondCourse より前の曜日（または同日）に配置する
7. "add_room_closure": 特定の教室(room)を特定の曜日(days)・時限(periods)にメンテナンスや行事で閉鎖(使用不可)にする。
8. "set_config_param": 全体設定パラメータを変更する（maxProfessorConsecutivePeriods, maxProfessorSessionsPerDay 等）。
9. "inject_conflict_demo": わざと矛盾シナリオ（"room_double_book" | "prof_impossible_day" | "pc_lab_overload"）を注入して診断する。
10. "clear_custom_rules" / "reset_all" / "solve_or_diagnose"

【引数の厳密なルール（満たさない toolCall は適用されずに破棄されます）】
・course / professor / room は登録一覧のID（例: C15, P09, R101）または登録名をそのまま指定する。
・days は ["Mon","Tue","Wed","Thu","Fri"] の配列、periods は 1〜5 の整数配列で、どちらも必ず明示する（終日なら periods:[1,2,3,4,5]、全曜日なら days に5曜日すべてを列挙）。
・set_course_room_rule の mode、add_course_relation_rule の relationKind、inject_conflict_demo の scenario は必須。
・course_no_overlap と course_precedence では secondCourse が必須。
・isHard を省略した場合はハード制約(true)として扱われる。`;

const CONSULT_SYSTEM_PROMPT = `You are the "University Course Timetabling AI Copilot" assisting academic affairs staff and faculty.
Based on the execution summary provided in the prompt (applied rule changes, WaSHI × HiGHS solver optimization outcome, or conflicting constraint diagnosis), reply concisely in Markdown (bullet points, 3–6 lines) in the language explicitly requested at the end of the prompt (Japanese, English, or Simplified Chinese).
- Do not expose internal solver variable names; always refer to courses, professors, rooms, days, and periods by their human-readable names.`;

export interface RawStage2ToolCall {
  tool_name: string;
  args?: Record<string, unknown>;
}

const NUMERIC_CONFIG_PARAMS = [
  "maxProfessorConsecutivePeriods",
  "maxProfessorSessionsPerDay",
  "maxCohortCompulsoryPerDay",
] as const;

const BOOLEAN_CONFIG_PARAMS = [
  "enforceRoomCapacity",
  "enforceRoomEquipment",
  "enforceCohortNoOverlap",
  "enforceProfessorAvailability",
  "forbidSameCourseSameDay",
  "enforceMaxConsecutivePeriods",
  "preserveCurrentTimetable",
] as const;

type NumericConfigParam = (typeof NUMERIC_CONFIG_PARAMS)[number];
type BooleanConfigParam = (typeof BOOLEAN_CONFIG_PARAMS)[number];

function isNumericConfigParam(v: unknown): v is NumericConfigParam {
  return typeof v === "string" && (NUMERIC_CONFIG_PARAMS as readonly string[]).includes(v);
}

function isBooleanConfigParam(v: unknown): v is BooleanConfigParam {
  return typeof v === "string" && (BOOLEAN_CONFIG_PARAMS as readonly string[]).includes(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * `isHard` contract (documented in the extractor prompt): omitted -> `true` (hard rule).
 * Any non-boolean value is invalid.
 */
function readIsHard(a: Record<string, unknown>): boolean | null {
  if (a.isHard === undefined) return true;
  return typeof a.isHard === "boolean" ? a.isHard : null;
}

/**
 * Converts one LLM tool call into a `ChatTimetableOperation` with strict argument fidelity.
 * Arguments are applied as-is; any missing, unresolvable, or out-of-contract argument makes the
 * whole call invalid and `null` is returned. There are no implicit defaults such as
 * "all days", "all periods", "first element of a list", or a substitute enum value.
 */
export function convertToolCallToTimetableOperation(
  call: RawStage2ToolCall,
  state: TimetableState
): ChatTimetableOperation | null {
  const a = call.args ?? {};
  switch (call.tool_name) {
    case "pin_course_slot": {
      const course = resolveCourseFromText(typeof a.course === "string" ? a.course : "", state.courses);
      const days = resolveDaysFromInput(a.days);
      const periods = resolvePeriodNumbers(a.periods);
      const isHard = readIsHard(a);
      if (!course || !days || !periods || isHard === null) return null;
      let roomId: string | undefined;
      if (a.room !== undefined) {
        const room = resolveRoomFromText(typeof a.room === "string" ? a.room : "", state.rooms);
        if (!room) return null;
        roomId = room.id;
      }
      return {
        op: "pin_course_slot",
        courseId: course.id,
        days,
        periods,
        roomId,
        isHard,
      };
    }
    case "forbid_course_slot": {
      const course = resolveCourseFromText(typeof a.course === "string" ? a.course : "", state.courses);
      const days = resolveDaysFromInput(a.days);
      const periods = resolvePeriodNumbers(a.periods);
      const isHard = readIsHard(a);
      if (!course || !days || !periods || isHard === null) return null;
      return {
        op: "forbid_course_slot",
        courseId: course.id,
        days,
        periods,
        isHard,
      };
    }
    case "set_professor_unavailability": {
      const prof = resolveProfessorFromText(
        typeof a.professor === "string" ? a.professor : "",
        state.professors
      );
      const days = resolveDaysFromInput(a.days);
      const periods = resolvePeriodNumbers(a.periods);
      const isHard = readIsHard(a);
      if (!prof || !days || !periods || isHard === null) return null;
      if (a.exclusiveAvailable !== undefined && typeof a.exclusiveAvailable !== "boolean") {
        return null;
      }
      return {
        op: "set_professor_unavailability",
        professorId: prof.id,
        days,
        periods,
        exclusiveAvailable: a.exclusiveAvailable === true,
        isHard,
      };
    }
    case "set_professor_preference": {
      const prof = resolveProfessorFromText(
        typeof a.professor === "string" ? a.professor : "",
        state.professors
      );
      if (!prof) return null;
      if (a.avoidPeriod1 !== undefined && typeof a.avoidPeriod1 !== "boolean") return null;
      if (a.avoidPeriod5 !== undefined && typeof a.avoidPeriod5 !== "boolean") return null;
      if (a.maxSessionsPerDay !== undefined && !isIntInRange(a.maxSessionsPerDay, 1, 5)) {
        return null;
      }
      const avoidPeriod1 = typeof a.avoidPeriod1 === "boolean" ? a.avoidPeriod1 : undefined;
      const avoidPeriod5 = typeof a.avoidPeriod5 === "boolean" ? a.avoidPeriod5 : undefined;
      const maxSessionsPerDay =
        typeof a.maxSessionsPerDay === "number" ? a.maxSessionsPerDay : undefined;
      if (avoidPeriod1 === undefined && avoidPeriod5 === undefined && maxSessionsPerDay === undefined) {
        return null;
      }
      return {
        op: "set_professor_preference",
        professorId: prof.id,
        avoidPeriod1,
        avoidPeriod5,
        maxSessionsPerDay,
      };
    }
    case "set_course_room_rule": {
      const course = resolveCourseFromText(typeof a.course === "string" ? a.course : "", state.courses);
      const isHard = readIsHard(a);
      if (!course || isHard === null) return null;
      if (a.mode !== "require" && a.mode !== "forbid") return null;
      let roomId: string | undefined;
      if (a.room !== undefined) {
        const room = resolveRoomFromText(typeof a.room === "string" ? a.room : "", state.rooms);
        if (!room) return null;
        roomId = room.id;
      }
      let roomType: RoomType | undefined;
      if (a.roomType !== undefined) {
        if (
          a.roomType !== "large_hall" &&
          a.roomType !== "medium_room" &&
          a.roomType !== "pc_lab" &&
          a.roomType !== "seminar_room"
        ) {
          return null;
        }
        roomType = a.roomType;
      }
      if (!roomId && !roomType) return null;
      return {
        op: "set_course_room_rule",
        courseId: course.id,
        roomId,
        roomType,
        mode: a.mode,
        isHard,
      };
    }
    case "add_course_relation_rule": {
      const course = resolveCourseFromText(typeof a.course === "string" ? a.course : "", state.courses);
      const isHard = readIsHard(a);
      if (!course || isHard === null) return null;
      const kind = a.relationKind;
      if (
        kind !== "course_no_overlap" &&
        kind !== "course_same_day" &&
        kind !== "course_consecutive" &&
        kind !== "course_precedence"
      ) {
        return null;
      }
      let secondCourseId: string | undefined;
      if (a.secondCourse !== undefined) {
        const second = resolveCourseFromText(
          typeof a.secondCourse === "string" ? a.secondCourse : "",
          state.courses
        );
        if (!second) return null;
        secondCourseId = second.id;
      }
      // Pairwise relations need two distinct courses.
      if ((kind === "course_no_overlap" || kind === "course_precedence") && !secondCourseId) {
        return null;
      }
      if (secondCourseId === course.id) return null;
      return {
        op: "add_course_relation_rule",
        kind,
        courseId: course.id,
        secondCourseId,
        isHard,
      };
    }
    case "add_room_closure": {
      const room = resolveRoomFromText(typeof a.room === "string" ? a.room : "", state.rooms);
      const days = resolveDaysFromInput(a.days);
      const periods = resolvePeriodNumbers(a.periods);
      if (!room || !days || !periods) return null;
      if (a.reason !== undefined && typeof a.reason !== "string") return null;
      return {
        op: "add_room_closure",
        roomId: room.id,
        days,
        periods,
        reason: typeof a.reason === "string" && a.reason.trim() ? a.reason : undefined,
      };
    }
    case "set_config_param": {
      if (isNumericConfigParam(a.paramName)) {
        if (!isIntInRange(a.paramValueNumber, 1, 5)) return null;
        return { op: "set_config_param", paramName: a.paramName, paramValue: a.paramValueNumber };
      }
      if (isBooleanConfigParam(a.paramName)) {
        if (typeof a.paramValueBoolean !== "boolean") return null;
        return { op: "set_config_param", paramName: a.paramName, paramValue: a.paramValueBoolean };
      }
      return null;
    }
    case "inject_conflict_demo": {
      if (
        a.scenario !== "room_double_book" &&
        a.scenario !== "prof_impossible_day" &&
        a.scenario !== "pc_lab_overload"
      ) {
        return null;
      }
      return { op: "inject_conflict_demo", scenario: a.scenario };
    }
    case "clear_custom_rules":
      return { op: "clear_custom_rules" };
    case "reset_all":
      return { op: "reset_all" };
    case "solve_or_diagnose":
      return { op: "solve_or_diagnose" };
    default:
      return null;
  }
}

let customRuleSeq = 0;
function nextCustomRuleId(
  prefix: string,
  existingRules: readonly CustomTimetableRule[]
): string {
  const existingIds = new Set(existingRules.map((r) => r.id));
  let candidate = "";
  do {
    customRuleSeq += 1;
    candidate = `${prefix}_${Date.now()}_${customRuleSeq}`;
  } while (existingIds.has(candidate));
  return candidate;
}

/**
 * Applies a list of `ChatTimetableOperation` items to `TimetableState` with strict argument fidelity.
 */
export function applyTimetableChatOperationsToState(
  state: TimetableState,
  operations: readonly ChatTimetableOperation[]
): { updatedState: TimetableState; appliedLogs: string[] } {
  let nextState: TimetableState = {
    ...state,
    config: { ...state.config },
    rooms: state.rooms.map((r) => ({ ...r, equipment: [...r.equipment], aliases: [...r.aliases] })),
    professors: state.professors.map((p) => ({
      ...p,
      unavailableDays: [...p.unavailableDays],
      unavailableSlots: p.unavailableSlots.map((s) => ({ ...s })),
    })),
    courses: state.courses.map((c) => ({
      ...c,
      cohorts: [...c.cohorts],
      requiredEquipment: [...c.requiredEquipment],
      preferredRoomIds: c.preferredRoomIds ? [...c.preferredRoomIds] : undefined,
      aliases: [...c.aliases],
    })),
    customRules: state.customRules.map((r) => ({ ...r })),
  };

  const appliedLogs: string[] = [];

  for (const op of operations) {
    if (op.op === "reset_all") {
      nextState = generateTimetableState({ seed: nextState.config.seed });
      appliedLogs.push("すべての時間割設定・追加ルールを初期状態にリセットしました");
      continue;
    }

    if (op.op === "clear_custom_rules") {
      nextState.customRules = [];
      appliedLogs.push("個別に追加されたカスタムルールをすべて解除しました");
      continue;
    }

    if (op.op === "inject_conflict_demo") {
      const injected = injectTimetableConflictScenario(nextState, op.scenario);
      nextState = injected.updatedState;
      appliedLogs.push(injected.descriptionJa);
      continue;
    }

    if (op.op === "solve_or_diagnose") {
      appliedLogs.push("現在の条件で時間割の再最適化・整合性チェックを実行します");
      continue;
    }

    if (op.op === "pin_course_slot") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course || op.days.length === 0 || op.periods.length === 0) continue;
      const room = op.roomId ? nextState.rooms.find((r) => r.id === op.roomId) : undefined;
      const roomText = room ? `・${room.name}(${room.id})` : "";
      const slotText =
        op.days.length === 1 && op.periods.length === 1
          ? formatSlotJa(op.days[0], op.periods[0])
          : `${op.days.map((d) => DAY_LABELS_JA[d]).join("・")}曜 ${op.periods.join("・")}限`;
      const desc = `「${course.title}(${course.id})」を ${slotText}${roomText} に${op.isHard ? "固定" : "希望配置"}`;
      const rule: CustomTimetableRule = {
        id: nextCustomRuleId(
          `pin_${course.id}_${op.days.join("-")}_P${op.periods.join("-")}`,
          nextState.customRules
        ),
        kind: "pin_slot",
        enabled: true,
        isHard: op.isHard,
        courseId: course.id,
        days: [...op.days],
        periods: [...op.periods],
        roomId: room?.id,
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(desc);
      continue;
    }

    if (op.op === "forbid_course_slot") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course) continue;
      const dayText = op.days.map((d) => DAY_LABELS_JA[d]).join("・") + "曜";
      const periodText =
        op.periods.length === 5 ? "終日" : `${op.periods.join("・")}限`;
      const desc = `「${course.title}(${course.id})」の ${dayText} ${periodText} 配置を${op.isHard ? "禁止" : "なるべく回避"}`;
      const rule: CustomTimetableRule = {
        id: nextCustomRuleId(`forbid_${course.id}`, nextState.customRules),
        kind: "forbid_slot",
        enabled: true,
        isHard: op.isHard,
        courseId: course.id,
        days: [...op.days],
        periods: [...op.periods],
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(desc);
      continue;
    }

    if (op.op === "set_professor_unavailability") {
      const prof = nextState.professors.find((p) => p.id === op.professorId);
      if (!prof) continue;

      const dayText = op.days.map((d) => DAY_LABELS_JA[d]).join("・") + "曜";
      const pText = op.periods.length === 5 ? "終日" : `${op.periods.join("・")}限`;

      if (!op.isHard) {
        if (op.exclusiveAvailable) {
          const allowedDays = new Set(op.days);
          const allowedPeriods = new Set(op.periods);
          const disallowedDays = DAYS_OF_WEEK.filter((d) => !allowedDays.has(d));
          const disallowedPeriods = PERIODS.filter((p) => !allowedPeriods.has(p));
          const desc = `${prof.name}(${prof.id}) の出講をなるべく【${dayText}の${pText}】に限定(ソフト希望)`;
          if (disallowedDays.length > 0) {
            nextState.customRules.push({
              id: nextCustomRuleId(`forbid_prof_${prof.id}`, nextState.customRules),
              kind: "forbid_slot",
              enabled: true,
              isHard: false,
              professorId: prof.id,
              days: disallowedDays,
              periods: [...PERIODS],
              description: desc,
            });
          }
          if (disallowedPeriods.length > 0) {
            nextState.customRules.push({
              id: nextCustomRuleId(`forbid_prof_${prof.id}`, nextState.customRules),
              kind: "forbid_slot",
              enabled: true,
              isHard: false,
              professorId: prof.id,
              days: [...op.days],
              periods: disallowedPeriods,
              description: desc,
            });
          }
          appliedLogs.push(desc);
        } else {
          const desc = `${prof.name}(${prof.id}) の ${dayText}${pText} の担当をなるべく回避(ソフト希望)`;
          nextState.customRules.push({
            id: nextCustomRuleId(`forbid_prof_${prof.id}`, nextState.customRules),
            kind: "forbid_slot",
            enabled: true,
            isHard: false,
            professorId: prof.id,
            days: [...op.days],
            periods: [...op.periods],
            description: desc,
          });
          appliedLogs.push(desc);
        }
        continue;
      }

      if (!op.exclusiveAvailable) {
        if (op.periods.length === 5) {
          for (const d of op.days) {
            if (!prof.unavailableDays.includes(d)) {
              prof.unavailableDays.push(d);
            }
          }
        } else {
          for (const d of op.days) {
            for (const p of op.periods) {
              if (!prof.unavailableSlots.some((s) => s.day === d && s.period === p)) {
                prof.unavailableSlots.push({
                  day: d,
                  period: p,
                  reason: "チャットNG指定",
                });
              }
            }
          }
        }
        appliedLogs.push(`${prof.name}(${prof.id}) の ${dayText}${pText} を出講不可(NG)に設定しました`);
      } else {
        const allowedDays = new Set(op.days);
        const allowedPeriods = new Set(op.periods);
        prof.unavailableDays = DAYS_OF_WEEK.filter((d) => !allowedDays.has(d));
        prof.unavailableSlots = [];
        for (const d of op.days) {
          for (const p of PERIODS) {
            if (!allowedPeriods.has(p)) {
              prof.unavailableSlots.push({
                day: d,
                period: p,
                reason: "出講可能枠外(チャット設定)",
              });
            }
          }
        }
        appliedLogs.push(
          `${prof.name}(${prof.id}) の出講可能枠を【${dayText}の${pText}のみ】に設定しました`
        );
      }
      continue;
    }

    if (op.op === "set_professor_preference") {
      const prof = nextState.professors.find((p) => p.id === op.professorId);
      if (!prof) continue;
      const parts: string[] = [];
      if (typeof op.avoidPeriod1 === "boolean") {
        prof.avoidPeriod1 = op.avoidPeriod1;
        parts.push(`1限回避=${op.avoidPeriod1 ? "ON" : "OFF"}`);
      }
      if (typeof op.avoidPeriod5 === "boolean") {
        prof.avoidPeriod5 = op.avoidPeriod5;
        parts.push(`5限回避=${op.avoidPeriod5 ? "ON" : "OFF"}`);
      }
      if (typeof op.maxSessionsPerDay === "number") {
        prof.maxSessionsPerDay = op.maxSessionsPerDay;
        parts.push(`1日上限=${op.maxSessionsPerDay}コマ`);
      }
      if (parts.length > 0) {
        appliedLogs.push(`${prof.name}(${prof.id}) の担当条件を更新 (${parts.join(" / ")})`);
      }
      continue;
    }

    if (op.op === "set_course_room_rule") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course) continue;
      const room = op.roomId ? nextState.rooms.find((r) => r.id === op.roomId) : undefined;
      const targetName = room
        ? `${room.name}(${room.id})`
        : op.roomType
          ? ROOM_TYPE_LABELS_JA[op.roomType]
          : "指定教室";
      const desc =
        op.mode === "require"
          ? `「${course.title}(${course.id})」の使用教室を ${targetName} に限定`
          : `「${course.title}(${course.id})」での ${targetName} の使用を禁止`;
      const rule: CustomTimetableRule = {
        id: nextCustomRuleId(`room_${op.mode}_${course.id}`, nextState.customRules),
        kind: op.mode === "require" ? "require_room" : "forbid_room",
        enabled: true,
        isHard: op.isHard,
        courseId: course.id,
        roomId: room?.id,
        roomType: op.roomType,
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(desc);
      continue;
    }

    if (op.op === "add_course_relation_rule") {
      const c1 = nextState.courses.find((c) => c.id === op.courseId);
      if (!c1) continue;
      const c2 = op.secondCourseId
        ? nextState.courses.find((c) => c.id === op.secondCourseId)
        : undefined;

      let desc = "";
      if (op.kind === "course_no_overlap" && c2) {
        desc = `同時開講禁止: 「${c1.shortTitle}(${c1.id})」と「${c2.shortTitle}(${c2.id})」を同じ曜日・時限に被せない`;
      } else if (op.kind === "course_consecutive") {
        desc = c2
          ? `連続コマ指定: 「${c1.shortTitle}」と「${c2.shortTitle}」を同日の連続時限に開講`
          : `連続コマ指定: 「${c1.shortTitle}(${c1.id})」の2コマを同じ曜日の連続時限にまとめて開講`;
      } else if (op.kind === "course_same_day") {
        desc = c2
          ? `同日開講指定: 「${c1.shortTitle}」と「${c2.shortTitle}」を同じ曜日に開講`
          : `同日開講指定: 「${c1.shortTitle}(${c1.id})」の複数コマを同じ曜日に開講`;
      } else if (op.kind === "course_precedence" && c2) {
        desc = `カリキュラム順序: 「${c1.shortTitle}(${c1.id})」を「${c2.shortTitle}(${c2.id})」より前の曜日(または同日)に開講`;
      } else {
        continue;
      }

      const rule: CustomTimetableRule = {
        id: nextCustomRuleId(`rel_${op.kind}_${c1.id}`, nextState.customRules),
        kind: op.kind,
        enabled: true,
        isHard: op.isHard,
        courseId: c1.id,
        secondCourseId: c2?.id,
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(desc);
      continue;
    }

    if (op.op === "add_room_closure") {
      const room = nextState.rooms.find((r) => r.id === op.roomId);
      if (!room) continue;
      const dayText = op.days.map((d) => DAY_LABELS_JA[d]).join("・") + "曜";
      const pText = op.periods.length === 5 ? "終日" : `${op.periods.join("・")}限`;
      const reasonText = op.reason ? ` (${op.reason})` : "";
      const desc = `教室閉鎖: ${room.name}(${room.id}) は ${dayText}${pText} 使用不可${reasonText}`;
      const rule: CustomTimetableRule = {
        id: nextCustomRuleId(`closure_${room.id}`, nextState.customRules),
        kind: "room_closure",
        enabled: true,
        isHard: true,
        roomId: room.id,
        days: [...op.days],
        periods: [...op.periods],
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(desc);
      continue;
    }

    if (op.op === "set_config_param") {
      const pName = op.paramName;
      const pVal = op.paramValue;
      if (isNumericConfigParam(pName) && typeof pVal === "number") {
        nextState.config[pName] = pVal;
      } else if (isBooleanConfigParam(pName) && typeof pVal === "boolean") {
        nextState.config[pName] = pVal;
      } else {
        continue;
      }
      const labels: Record<string, string> = {
        maxProfessorConsecutivePeriods: "教員の最大連続講義コマ数",
        maxProfessorSessionsPerDay: "教員の1日最大担当コマ数",
        maxCohortCompulsoryPerDay: "学生(各学年)の1日最大必修・選択必修コマ数",
        enforceRoomCapacity: "教室定員制約の厳守",
        enforceRoomEquipment: "教室設備(PC演習室等)制約の厳守",
        enforceCohortNoOverlap: "学年別カリキュラム重複禁止",
        enforceProfessorAvailability: "教員都合NG枠の厳守",
        forbidSameCourseSameDay: "週2コマ科目の同日開講防止",
        enforceMaxConsecutivePeriods: "教員連続講義上限の適用",
        preserveCurrentTimetable: "微調整モード(既存時間割の維持)",
      };
      appliedLogs.push(`${labels[pName] ?? pName} を ${String(pVal)} に変更しました`);
      continue;
    }
  }

  return { updatedState: nextState, appliedLogs };
}

function buildCompactStateCatalogPrompt(state: TimetableState): string {
  const courseList = state.courses
    .map(
      (c) =>
        `${c.id}:${c.title}(${c.cohorts.join("/")},週${c.sessionsPerWeek}コマ,履修${c.enrollment}名,担当:${c.professorId})`
    )
    .join(", ");
  const profList = state.professors
    .map(
      (p) =>
        `${p.id}:${p.name}(${p.title}${p.unavailableDays.length > 0 ? `,不可:${p.unavailableDays.map((d) => DAY_LABELS_JA[d]).join("")}` : ""})`
    )
    .join(", ");
  const roomList = state.rooms
    .map((r) => `${r.id}:${r.name}(定員${r.capacity},${ROOM_TYPE_LABELS_JA[r.roomType]})`)
    .join(", ");

  return [
    `【登録科目一覧】${courseList}`,
    `【教員一覧】${profList}`,
    `【教室一覧】${roomList}`,
    `【現在の全体設定】教員連続上限=${state.config.maxProfessorConsecutivePeriods}コマ, 教員1日上限=${state.config.maxProfessorSessionsPerDay}コマ, 週2コマ同日禁止=${state.config.forbidSameCourseSameDay ? "ON" : "OFF"}`,
  ].join("\n");
}

export function createTimetableGeminiNanoManager(): TimetableGeminiNanoManager {
  let currentStatus: GeminiNanoStatus = "unavailable";
  let downloadProgress: number | null = null;
  let extractorBaseSession: LanguageModelSessionLike | null = null;
  let consultBaseSession: LanguageModelSessionLike | null = null;
  let consultSessionLang: TimetableLang = "ja";
  let lastConsultTrace: LlmCallTrace | null = null;

  return {
    getStatus() {
      return currentStatus;
    },
    getDownloadProgress() {
      return downloadProgress;
    },
    getLastConsultTrace() {
      return lastConsultTrace;
    },

    async initialize(
      onProgress?: (pct: number) => void,
      lang: TimetableLang = "ja"
    ): Promise<GeminiNanoStatus> {
      const avail = await checkGeminiNanoAvailability();
      currentStatus = avail;
      if (avail === "unavailable") return "unavailable";

      const api = getLanguageModelApi();
      if (!api) {
        currentStatus = "unavailable";
        return "unavailable";
      }

      try {
        const monitorFn = (m: unknown) => {
          const emitter = m as {
            addEventListener?: (
              ev: string,
              cb: (e: { loaded?: number }) => void
            ) => void;
          };
          emitter?.addEventListener?.("downloadprogress", (e) => {
            if (typeof e?.loaded === "number") {
              currentStatus = "downloading";
              const pct = Math.round(e.loaded * 100);
              downloadProgress = pct;
              onProgress?.(pct);
            }
          });
        };

        if (!extractorBaseSession) {
          extractorBaseSession = await createSessionWithFallback(
            api,
            EXTRACTOR_SYSTEM_PROMPT,
            monitorFn,
            lang
          );
        }
        if (!consultBaseSession || consultSessionLang !== lang) {
          if (consultBaseSession && typeof consultBaseSession.destroy === "function") {
            try {
              consultBaseSession.destroy();
            } catch {
              // Ignore
            }
          }
          consultBaseSession = await createSessionWithFallback(
            api,
            CONSULT_SYSTEM_PROMPT,
            monitorFn,
            lang
          );
          consultSessionLang = lang;
        }

        currentStatus = "available";
        downloadProgress = 100;
        return "available";
      } catch (err) {
        console.warn("Failed to initialize Gemini Nano session:", err);
        currentStatus = await checkGeminiNanoAvailability();
        return currentStatus;
      }
    },

    async extractPlan(
      userMessage: string,
      state: TimetableState,
      signal?: AbortSignal,
      onProgress?: (event: ChatExtractProgressEvent) => void,
      lang: TimetableLang = "ja"
    ): Promise<ParsedTimetableChatPlan> {
      if (!extractorBaseSession) {
        const initStatus = await this.initialize(undefined, lang);
        if (initStatus !== "available" || !extractorBaseSession) {
          throw new Error(
            pickTimetableLang(lang, {
              ja: "Gemini Nano (LanguageModel API) が利用できません。",
              en: "Gemini Nano (LanguageModel API) is unavailable.",
              zh: "Gemini Nano (LanguageModel API) 不可用。",
            })
          );
        }
      }

      onProgress?.({
        phase: "turn1_start",
        activeLabel: pickTimetableLang(lang, {
          ja: "⏳ Gemini Nano で時間割条件を構造化しています…",
          en: "⏳ Structuring timetable constraints with Gemini Nano…",
          zh: "⏳ 正在通过 Gemini Nano 结构化排课条件…",
        }),
      });

      const session =
        typeof extractorBaseSession.clone === "function"
          ? await extractorBaseSession.clone()
          : extractorBaseSession;

      const t0 = performance.now();
      const userPrompt = `${buildCompactStateCatalogPrompt(state)}\n\nユーザーの指示: 「${userMessage}」`;
      try {
        const rawJson = await session.prompt(userPrompt, {
          responseConstraint: TIMETABLE_EXTRACTION_SCHEMA,
          signal,
        });
        const durationMs = Math.max(1, Math.round(performance.now() - t0));
        const parsed = JSON.parse(rawJson.trim()) as {
          thought?: string;
          intentType?: ParsedTimetableChatPlan["intentType"];
          toolCalls?: RawStage2ToolCall[];
          replyJa?: string;
        };

        const operations: ChatTimetableOperation[] = [];
        const rejectedToolCalls: RawStage2ToolCall[] = [];
        for (const tc of parsed.toolCalls ?? []) {
          const op = convertToolCallToTimetableOperation(tc, state);
          if (op) {
            operations.push(op);
          } else {
            rejectedToolCalls.push(tc);
          }
        }

        const trace: LlmCallTrace = {
          stage: "structured_extraction",
          systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
          userPrompt,
          schema: TIMETABLE_EXTRACTION_SCHEMA,
          rawOutput: rawJson,
          durationMs,
        };

        onProgress?.({
          phase: "turn2_done",
          activeLabel: pickTimetableLang(lang, {
            ja: `✅ ${operations.length}件の時間割条件を抽出しました`,
            en: `✅ Extracted ${operations.length} timetable operation(s)`,
            zh: `✅ 已提取 ${operations.length} 项排课条件`,
          }),
        });

        const intentType: ParsedTimetableChatPlan["intentType"] =
          parsed.intentType === "modify_and_solve" ||
          parsed.intentType === "consult_only" ||
          parsed.intentType === "clarify" ||
          parsed.intentType === "unsupported"
            ? parsed.intentType
            : "unsupported";

        return {
          intentType,
          thoughtJa: parsed.thought ?? "",
          replyJa: parsed.replyJa ?? "",
          operations,
          rejectedToolCalls,
          llmTraces: [trace],
        };
      } finally {
        if (session !== extractorBaseSession && typeof session.destroy === "function") {
          try {
            session.destroy();
          } catch {
            // Ignore
          }
        }
      }
    },

    async *streamConsultationReply(
      userMessage: string,
      appliedSummary: string[],
      state: TimetableState,
      outcome: WashiTimetableSolveOutcome | null,
      signal?: AbortSignal,
      lang: TimetableLang = "ja"
    ): AsyncIterable<string> {
      const summaryLines: string[] = [];
      if (appliedSummary.length > 0) {
        summaryLines.push(
          pickTimetableLang(lang, {
            ja: `【適用した条件変更 (${appliedSummary.length}件)】`,
            en: `[Applied Constraint Changes (${appliedSummary.length})]`,
            zh: `【已应用的条件变更 (${appliedSummary.length}项)】`,
          })
        );
        for (const s of appliedSummary) summaryLines.push(`・${s}`);
      }
      if (outcome) {
        if (outcome.status === "Optimal" || outcome.status === "Feasible") {
          const ev = outcome.evaluation;
          const diff = outcome.diffFromPrevious;
          const sessionCount = outcome.timetable?.sessions.length ?? 0;
          summaryLines.push(
            pickTimetableLang(lang, {
              ja: `【求解結果】ステータス=${outcome.status} (${outcome.solveTimeMs}ms), 対象=${state.courses.length}科目(計${sessionCount}コマ)`,
              en: `[Solve Result] Status=${outcome.status} (${outcome.solveTimeMs}ms), Courses=${state.courses.length} (${sessionCount} sessions)`,
              zh: `【求解结果】状态=${outcome.status} (${outcome.solveTimeMs}ms), 课程=${state.courses.length}门(共${sessionCount}节)`,
            })
          );
          if (ev) {
            summaryLines.push(
              pickTimetableLang(lang, {
                ja: `・ハード制約違反: ${ev.hardViolationCount}件 / 学生の空きコマ(中空き)合計: ${ev.softPenaltyCount}コマ`,
                en: `・Hard violations: ${ev.hardViolationCount} / Student hollow gaps: ${ev.softPenaltyCount}`,
                zh: `・硬约束违反: ${ev.hardViolationCount}项 / 学生空堂合计: ${ev.softPenaltyCount}节`,
              })
            );
          }
          if (diff && diff.totalSessions > 0) {
            summaryLines.push(
              pickTimetableLang(lang, {
                ja: `・前回の時間割からの変更: ${diff.changedSessionsCount}コマのみ変更 (維持率 ${diff.retentionRatePct}%)`,
                en: `・Changes from previous timetable: ${diff.changedSessionsCount} session(s) moved (retention ${diff.retentionRatePct}%)`,
                zh: `・较上一版课表变动: 仅调整 ${diff.changedSessionsCount} 节课 (保留率 ${diff.retentionRatePct}%)`,
              })
            );
          }
        } else if (outcome.status === "Infeasible") {
          summaryLines.push(
            pickTimetableLang(lang, {
              ja: `【⚠️ 時間割を組めません (Infeasible)】衝突している制約 (${outcome.conflicts.length}件):`,
              en: `[⚠️ Timetable Infeasible] Conflicting constraints (${outcome.conflicts.length}):`,
              zh: `【⚠️ 无法排出课表 (Infeasible)】冲突约束 (${outcome.conflicts.length}项):`,
            })
          );
          for (const c of outcome.conflicts.slice(0, 6)) {
            const loc = formatConstraintMetaI18n(c, state, lang);
            const hintPrefix = pickTimetableLang(lang, {
              ja: "解決案",
              en: "Suggestion",
              zh: "解决建议",
            });
            summaryLines.push(
              `・${loc.label}${loc.relaxSuggestion ? ` (${hintPrefix}: ${loc.relaxSuggestion})` : ""}`
            );
          }
        }
      }

      const fullPrompt = pickTimetableLang(lang, {
        ja: `${summaryLines.join("\n")}\n\nユーザーの発言: 「${userMessage}」\n上記の結果に基づき、教務担当者・教員にわかりやすく簡潔に日本語で回答してください。`,
        en: `${summaryLines.join("\n")}\n\nUser request: "${userMessage}"\nBased on the results above, reply concisely and clearly in English for academic affairs staff and faculty.`,
        zh: `${summaryLines.join("\n")}\n\n用户指令: “${userMessage}”\n请根据上述结果，用简体中文向教务人员与教师简洁清晰地说明。`,
      });

      const api = getLanguageModelApi();
      if (api && (!consultBaseSession || consultSessionLang !== lang)) {
        try {
          if (consultBaseSession && typeof consultBaseSession.destroy === "function") {
            consultBaseSession.destroy();
          }
          consultBaseSession = await createSessionWithFallback(
            api,
            CONSULT_SYSTEM_PROMPT,
            undefined,
            lang
          );
          consultSessionLang = lang;
        } catch {
          // Keep existing or null
        }
      }

      if (!consultBaseSession) {
        yield summaryLines.join("\n");
        return;
      }

      const session =
        typeof consultBaseSession.clone === "function"
          ? await consultBaseSession.clone()
          : consultBaseSession;
      const t0 = performance.now();
      let accumulated = "";
      try {
        if (typeof session.promptStreaming === "function") {
          const stream = session.promptStreaming(fullPrompt, { signal });
          for await (const chunk of stream) {
            if (signal?.aborted) break;
            if (typeof chunk === "string") {
              if (chunk.startsWith(accumulated) && chunk.length >= accumulated.length) {
                const delta = chunk.slice(accumulated.length);
                accumulated = chunk;
                if (delta) yield delta;
              } else {
                accumulated += chunk;
                yield chunk;
              }
            }
          }
        } else {
          accumulated = await session.prompt(fullPrompt, { signal });
          yield accumulated;
        }
      } catch {
        if (!accumulated) {
          accumulated = summaryLines.join("\n");
          yield accumulated;
        }
      } finally {
        lastConsultTrace = {
          stage: "consultation_reply",
          systemPrompt: CONSULT_SYSTEM_PROMPT,
          userPrompt: fullPrompt,
          rawOutput: accumulated,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
        };
        if (session !== consultBaseSession && typeof session.destroy === "function") {
          try {
            session.destroy();
          } catch {
            // Ignore
          }
        }
      }
    },

    async resetConversation(): Promise<void> {
      lastConsultTrace = null;
    },

    destroy() {
      for (const s of [extractorBaseSession, consultBaseSession]) {
        if (s && typeof s.destroy === "function") {
          try {
            s.destroy();
          } catch {
            // Ignore
          }
        }
      }
      extractorBaseSession = null;
      consultBaseSession = null;
    },
  };
}
