import {
  generateTimetableState,
  injectTimetableConflictScenario,
} from "./generator.js";
import {
  COURSE_PROFILE_I18N,
  DAY_SHORT_I18N,
  PROFESSOR_PROFILE_I18N,
  ROOM_PROFILE_I18N,
  formatConstraintMetaI18n,
  formatCustomRuleI18n,
  formatDiffReasonI18n,
  formatPeriodI18n,
  getProfessorI18n,
  getTimetableLang,
  pickTimetableLang,
  type TimetableLang,
} from "./i18n.js";
import {
  DAYS_OF_WEEK,
  PERIODS,
  ROOM_TYPE_LABELS,
  formatSlotEn,
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

export const CHROME_SUPPORTED_TIMETABLE_LANGS = ["ja", "en"] as const;
export type ChromeSupportedTimetableLang = (typeof CHROME_SUPPORTED_TIMETABLE_LANGS)[number];

export function isChromeSupportedTimetableLang(
  lang: TimetableLang
): lang is ChromeSupportedTimetableLang {
  return (CHROME_SUPPORTED_TIMETABLE_LANGS as readonly string[]).includes(lang);
}

export function buildExtractorLanguageModelOptions() {
  return {
    expectedInputs: [{ type: "text", languages: ["en", "ja"] }],
    expectedOutputs: [{ type: "text", languages: ["ja", "en"] }],
  };
}

export function buildConsultLanguageModelOptions(lang: ChromeSupportedTimetableLang) {
  return {
    expectedInputs: [{ type: "text", languages: ["en", "ja"] }],
    expectedOutputs: [{ type: "text", languages: [lang] }],
  };
}

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

export async function checkGeminiNanoAvailability(
  lang: TimetableLang = getTimetableLang()
): Promise<GeminiNanoStatus> {
  if (!isChromeSupportedTimetableLang(lang)) {
    return "unavailable";
  }
  const api = getLanguageModelApi();
  if (!api) return "unavailable";

  if (typeof api.availability === "function") {
    try {
      const consultOptions = buildConsultLanguageModelOptions(lang);
      const statusConsult = normalizeAvailabilityString(
        await api.availability(consultOptions)
      );
      if (statusConsult === "unavailable") {
        return "unavailable";
      }

      const extractorOptions = buildExtractorLanguageModelOptions();
      const statusExtractor = normalizeAvailabilityString(
        await api.availability(extractorOptions)
      );
      if (statusExtractor === "unavailable") {
        return "unavailable";
      }

      if (statusConsult && statusExtractor) {
        if (statusConsult === "downloading" || statusExtractor === "downloading") {
          return "downloading";
        }
        if (statusConsult === "downloadable" || statusExtractor === "downloadable") {
          return "downloadable";
        }
        return "available";
      }
      if (statusConsult) return statusConsult;
      if (statusExtractor) return statusExtractor;
    } catch {
      // Fall through to legacy/default check on older Chrome
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

async function createLanguageModelSession(
  api: LanguageModelFactoryLike,
  systemPrompt: string,
  langOptions: {
    expectedInputs: readonly { type: string; languages: readonly string[] }[];
    expectedOutputs: readonly { type: string; languages: readonly string[] }[];
  },
  monitorFn?: (m: unknown) => void
): Promise<LanguageModelSessionLike> {
  const baseWithMonitor = monitorFn ? { monitor: monitorFn } : {};
  try {
    return await api.create({
      ...langOptions,
      temperature: 0.1,
      topK: 1,
      initialPrompts: [{ role: "system", content: systemPrompt }],
      ...baseWithMonitor,
    });
  } catch {
    return await api.create({
      ...langOptions,
      initialPrompts: [{ role: "system", content: systemPrompt }],
      ...baseWithMonitor,
    });
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
            i18nEntry.ja.title,
            i18nEntry.ja.shortTitle,
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
        /(?:\u51C6\u6559\u6388|\u975E\u5E38\u52E4\u8B1B\u5E2B|\u6559\u6388|\u8B1B\u5E2B|\u5148\u751F|\u3055\u3093|\u6C0F|\u526F\u6559\u6388|\u5916\u8058\u8BB2\u5E08|\u8BB2\u5E08|\u8001\u5E08|Prof\.|Professor|Dr\.)/gi,
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
  required: ["intentType", "toolCalls"],
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

const EXTRACTOR_SYSTEM_PROMPT = `You are the planner for the University Course Timetabling (UCTP) AI Copilot.
Parse natural language requests from academic affairs staff or faculty and convert them into structured toolCalls according to the JSON Schema.

[Available Tools]
1. "pin_course_slot": Pin a specific course to specific days, periods, and optional room.
   Example: "Pin C15 to Tue P2 in R101" -> tool_name:"pin_course_slot", args:{course:"C15", days:["Tue"], periods:[2], room:"R101", isHard:true}
   Example: "Pin both sessions of C15 to Tue P2 and Thu P2" -> tool_name:"pin_course_slot", args:{course:"C15", days:["Tue","Thu"], periods:[2], isHard:true}
2. "forbid_course_slot": Forbid scheduling a course on specific days/periods.
   Example: "Avoid Mon P1 and Fri P5 for C16" -> tool_name:"forbid_course_slot", args:{course:"C16", days:["Mon"], periods:[1], isHard:true}
3. "set_professor_unavailability": Set unavailable or exclusive available days/periods for a professor.
   - Morning = periods:[1,2], Afternoon = periods:[3,4,5], All Day = periods:[1,2,3,4,5]
   Example: "Adjunct Prof P09 is only available Tue and Thu afternoons (P3-P5)" -> tool_name:"set_professor_unavailability", args:{professor:"P09", days:["Tue","Thu"], periods:[3,4,5], exclusiveAvailable:true, isHard:true}
   Example: "Prof P01 cannot teach Fri afternoons (P3-P5)" -> tool_name:"set_professor_unavailability", args:{professor:"P01", days:["Fri"], periods:[3,4,5], exclusiveAvailable:false, isHard:true}
4. "set_professor_preference": Update professor preferences (avoidPeriod1, avoidPeriod5, maxSessionsPerDay).
5. "set_course_room_rule": Specify (mode:"require") or forbid (mode:"forbid") a room or roomType for a course.
   roomType: "large_hall", "medium_room", "pc_lab", "seminar_room"
6. "add_course_relation_rule": Add inter-course relation constraints.
   - relationKind:"course_no_overlap": Prevent two courses (course, secondCourse) from being scheduled in the same slot
   - relationKind:"course_consecutive": Schedule 2 sessions of course (or course + secondCourse) in adjacent consecutive periods on the same day
   - relationKind:"course_same_day": Schedule on the same day
   - relationKind:"course_precedence": Schedule course on the same day or earlier than secondCourse
7. "add_room_closure": Close a room for maintenance or events on specific days/periods.
8. "set_config_param": Update global configuration parameters (maxProfessorConsecutivePeriods, maxProfessorSessionsPerDay, etc.).
9. "inject_conflict_demo": Inject a deliberate conflict scenario ("room_double_book" | "prof_impossible_day" | "pc_lab_overload") for diagnosis.
10. "clear_custom_rules" / "reset_all" / "solve_or_diagnose"

[Strict Argument Rules]
- course / professor / room must use registered IDs (e.g., C15, P09, R101) or exact names.
- days must be an array from ["Mon","Tue","Wed","Thu","Fri"], periods an array of integers 1-5 (All Day = periods:[1,2,3,4,5]).
- isHard defaults to true if omitted.

[Token Economy Rules]
- Include only required tools matching the user request. Do not include duplicate or dummy calls.
- Keep thought and replyJa extremely brief (under 1 sentence) or omit to avoid output truncation.`;

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
  operations: readonly ChatTimetableOperation[],
  lang: TimetableLang = getTimetableLang()
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
      appliedLogs.push(
        pickTimetableLang(lang, {
          ja: "\u3059\u3079\u3066\u306E\u6642\u9593\u5272\u8A2D\u5B9A\u30FB\u8FFD\u52A0\u30EB\u30FC\u30EB\u3092\u521D\u671F\u72B6\u614B\u306B\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F",
          en: "Reset all timetable settings and custom rules to defaults",
          zh: "已将所有课表设置与自定义规则重置为初始状态",
        })
      );
      continue;
    }

    if (op.op === "clear_custom_rules") {
      nextState.customRules = [];
      appliedLogs.push(
        pickTimetableLang(lang, {
          ja: "\u500B\u5225\u306B\u8FFD\u52A0\u3055\u308C\u307F\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB\u3092\u3059\u3079\u3066\u89E3\u9664\u3057\u307E\u3057\u305F",
          en: "Cleared all custom timetable rules",
          zh: "已清除所有单独添加的自定义规则",
        })
      );
      continue;
    }

    if (op.op === "inject_conflict_demo") {
      const injected = injectTimetableConflictScenario(nextState, op.scenario);
      nextState = injected.updatedState;
      appliedLogs.push(
        pickTimetableLang(lang, {
          ja: injected.descriptionJa,
          en:
            op.scenario === "room_double_book"
              ? 'Pinned both large compulsory courses "Intro to CS (C01)" and "Linear Algebra I (C02)" (>130 students) to Tue P2 in Hall 101 (Large) (room & Y1 compulsory conflict).'
              : op.scenario === "prof_impossible_day"
                ? 'Pinned adjunct lecturer Mr. Kobayashi\'s (Tue/Thu only) course "Information Security (C18)" to Mon P3.'
                : "Pinned 3 PC-lab-required courses (C05, C06, C19) simultaneously to Mon P2 when only 2 PC labs (301 & 302) exist.",
          zh:
            op.scenario === "room_double_book"
              ? "已将两门超130人的大一必修课《计算机科学导论(C01)》与《线性代数I(C02)》同时强制固定在【周二第2节 101大阶梯教室】（教室冲突＆大一必修冲突）。"
              : op.scenario === "prof_impossible_day"
                ? "已将仅周二、周四可出勤的兼职讲师（小林老师）负责的《信息安全(C18)》强制固定在【周一第3节】。"
                : "在仅有2间PC机房(301/302)的情况下，将3门必须使用PC机房的课程（C05, C06, C19）同时强制固定在【周一第2节】。",
        })
      );
      continue;
    }

    if (op.op === "solve_or_diagnose") {
      appliedLogs.push(
        pickTimetableLang(lang, {
          ja: "\u73FE\u5728\u306E\u6761\u4EF6\u3067\u6642\u9593\u5272\u306E\u518D\u6700\u9069\u5316\u30FB\u6574\u5408\u6027\u30C1\u3087\u30C3\u30AF\u3092\u5B9F\u884C\u3057\u307E\u3059",
          en: "Re-optimizing and checking timetable consistency under current rules",
          zh: "按当前条件重新优化课表并执行一致性检查",
        })
      );
      continue;
    }

    if (op.op === "pin_course_slot") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course || op.days.length === 0 || op.periods.length === 0) continue;
      const room = op.roomId ? nextState.rooms.find((r) => r.id === op.roomId) : undefined;
      const roomText = room ? ` in ${room.name} (${room.id})` : "";
      const slotText =
        op.days.length === 1 && op.periods.length === 1
          ? formatSlotEn(op.days[0], op.periods[0])
          : `${op.days.join("/")} P${op.periods.join("/")}`;
      const desc = `Pin "${course.title} (${course.id})" to ${slotText}${roomText} (${op.isHard ? "Hard" : "Soft"})`;
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
      appliedLogs.push(formatCustomRuleI18n(rule, nextState, lang));
      continue;
    }

    if (op.op === "forbid_course_slot") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course) continue;
      const dayText = op.days.join("/");
      const periodText =
        op.periods.length === 5 ? "All Day" : `P${op.periods.join("/")}`;
      const desc = `Forbid "${course.title} (${course.id})" on ${dayText} ${periodText} (${op.isHard ? "Hard" : "Soft"})`;
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
      appliedLogs.push(formatCustomRuleI18n(rule, nextState, lang));
      continue;
    }

    if (op.op === "set_professor_unavailability") {
      const prof = nextState.professors.find((p) => p.id === op.professorId);
      if (!prof) continue;

      const dayText = op.days.join("/");
      const pText = op.periods.length === 5 ? "All Day" : `P${op.periods.join("/")}`;
      const profLabelI18n = `${getProfessorI18n(prof, lang).name} (${prof.id})`;
      const daysI18n = op.days.map((d) => DAY_SHORT_I18N[lang][d]).join("/");
      const periodsI18n =
        op.periods.length === 5
          ? lang === "en"
            ? "All Day"
            : "全天"
          : op.periods.map((p) => formatPeriodI18n(p, lang)).join("/");

      const pushProfessorForbidRules = (isHard: boolean, desc: string): void => {
        if (op.exclusiveAvailable) {
          const allowedDays = new Set(op.days);
          const allowedPeriods = new Set(op.periods);
          const disallowedDays = DAYS_OF_WEEK.filter((d) => !allowedDays.has(d));
          const disallowedPeriods = PERIODS.filter((p) => !allowedPeriods.has(p));
          if (disallowedDays.length > 0) {
            nextState.customRules.push({
              id: nextCustomRuleId(`forbid_prof_${prof.id}`, nextState.customRules),
              kind: "forbid_slot",
              enabled: true,
              isHard,
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
              isHard,
              professorId: prof.id,
              days: [...op.days],
              periods: disallowedPeriods,
              description: desc,
            });
          }
        } else {
          nextState.customRules.push({
            id: nextCustomRuleId(`forbid_prof_${prof.id}`, nextState.customRules),
            kind: "forbid_slot",
            enabled: true,
            isHard,
            professorId: prof.id,
            days: [...op.days],
            periods: [...op.periods],
            description: desc,
          });
        }
      };

      if (!op.isHard) {
        if (op.exclusiveAvailable) {
          const desc = `${prof.name} (${prof.id}): prefer only ${dayText} ${pText} (Soft)`;
          pushProfessorForbidRules(false, desc);
          appliedLogs.push(
            pickTimetableLang(lang, {
              ja: `${prof.name}(${prof.id}) \\u306E\\u51FA\\u8B1B\\u3092\\u306A\\u308B\\u3079\\u304F\\u3010${daysI18n} ${periodsI18n}\\u3011\\u306B\\u9650\\u5B9A(\\u30BD\\u30D5\\u30C8\\u5E0C\\u671B)`,
              en: `Prefer scheduling ${profLabelI18n} only on ${daysI18n} (${periodsI18n}) (soft preference)`,
              zh: `尽量将 ${profLabelI18n} 的授课限制在【${daysI18n} ${periodsI18n}】(软性偏好)`,
            })
          );
        } else {
          const desc = `${prof.name} (${prof.id}): avoid ${dayText} ${pText} (Soft)`;
          pushProfessorForbidRules(false, desc);
          appliedLogs.push(
            pickTimetableLang(lang, {
              ja: `${prof.name}(${prof.id}) \\u306E ${daysI18n} (${periodsI18n}) \\u306E\\u62C5\\u5F53\\u3092\\u306A\\u308B\\u3079\\u304F\\u56DE\\u907F(\\u30BD\\u30D5\\u30C8\\u5E0C\\u671B)`,
              en: `Prefer avoiding ${daysI18n} (${periodsI18n}) for ${profLabelI18n} (soft preference)`,
              zh: `尽量避免安排 ${profLabelI18n} 在 ${daysI18n} (${periodsI18n}) 授课(软性偏好)`,
            })
          );
        }
        continue;
      }

      if (!op.exclusiveAvailable) {
        const desc = `${prof.name} (${prof.id}): marked ${dayText} ${pText} as unavailable (NG)`;
        pushProfessorForbidRules(true, desc);
        appliedLogs.push(
          pickTimetableLang(lang, {
            ja: `${prof.name}(${prof.id}) \\u306E ${daysI18n} (${periodsI18n}) \\u3092\\u51FA\\u8B1B\\u4E0D\\u53EF(NG)\\u306B\\u8A2D\\u5B9A\\u3057\\u307E\\u3057\\u305F`,
            en: `Marked ${daysI18n} (${periodsI18n}) as unavailable (NG) for ${profLabelI18n}`,
            zh: `已将 ${profLabelI18n} 的 ${daysI18n} (${periodsI18n}) 设为不可出勤(NG)`,
          })
        );
      } else {
        const desc = `${prof.name} (${prof.id}): restricted to ${dayText} ${pText} only`;
        pushProfessorForbidRules(true, desc);
        appliedLogs.push(
          pickTimetableLang(lang, {
            ja: `${prof.name}(${prof.id}) \\u306E\\u51FA\\u8B1B\\u53EF\\u80FD\\u67A0\\u3092\\u3010${daysI18n} ${periodsI18n}\\u306E\\u307F\\u3011\\u306B\\u8A2D\\u5B9A\\u3057\\u307E\\u3057\\u305F`,
            en: `Restricted ${profLabelI18n}'s available slots to ${daysI18n} (${periodsI18n}) only`,
            zh: `已将 ${profLabelI18n} 的可出勤时段设为【仅限 ${daysI18n} ${periodsI18n}】`,
          })
        );
      }
      continue;
    }

    if (op.op === "set_professor_preference") {
      const prof = nextState.professors.find((p) => p.id === op.professorId);
      if (!prof) continue;
      const partsJa: string[] = [];
      const partsEn: string[] = [];
      const partsZh: string[] = [];
      if (typeof op.avoidPeriod1 === "boolean") {
        prof.avoidPeriod1 = op.avoidPeriod1;
        const flag = op.avoidPeriod1 ? "ON" : "OFF";
        partsJa.push(`1限回避=${flag}`);
        partsEn.push(`Avoid P1=${flag}`);
        partsZh.push(`避免第1节=${flag}`);
      }
      if (typeof op.avoidPeriod5 === "boolean") {
        prof.avoidPeriod5 = op.avoidPeriod5;
        const flag = op.avoidPeriod5 ? "ON" : "OFF";
        partsJa.push(`5限回避=${flag}`);
        partsEn.push(`Avoid P5=${flag}`);
        partsZh.push(`避免第5节=${flag}`);
      }
      if (typeof op.maxSessionsPerDay === "number") {
        prof.maxSessionsPerDay = op.maxSessionsPerDay;
        partsJa.push(`1\u65E5\u4E0A\u9650=${op.maxSessionsPerDay}\u30B3\u30DE`);
        partsEn.push(`Daily Max=${op.maxSessionsPerDay}`);
        partsZh.push(`单日上限=${op.maxSessionsPerDay}节`);
      }
      if (partsJa.length > 0) {
        const profI18n = getProfessorI18n(prof, lang);
        appliedLogs.push(
          pickTimetableLang(lang, {
            ja: `${prof.name}(${prof.id}) \u306E\u62C5\u5F53\u6761\u4EF6\u3092\u66F4\u65B0 (${partsJa.join(" / ")})`,
            en: `Updated preferences for ${profI18n.name} (${prof.id}) (${partsEn.join(" / ")})`,
            zh: `已更新 ${profI18n.name} (${prof.id}) 的授课偏好 (${partsZh.join(" / ")})`,
          })
        );
      }
      continue;
    }

    if (op.op === "set_course_room_rule") {
      const course = nextState.courses.find((c) => c.id === op.courseId);
      if (!course) continue;
      const room = op.roomId ? nextState.rooms.find((r) => r.id === op.roomId) : undefined;
      const targetName = room
        ? `${room.name} (${room.id})`
        : op.roomType
          ? (ROOM_TYPE_LABELS[op.roomType] || op.roomType)
          : "Designated Room";
      const desc =
        op.mode === "require"
          ? `Require room ${targetName} for "${course.title} (${course.id})"`
          : `Forbid room ${targetName} for "${course.title} (${course.id})"`;
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
      appliedLogs.push(formatCustomRuleI18n(rule, nextState, lang));
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
        desc = `No Time Overlap: Do not schedule "${c1.shortTitle} (${c1.id})" and "${c2.shortTitle} (${c2.id})" in the same slot`;
      } else if (op.kind === "course_consecutive") {
        desc = c2
          ? `Consecutive: Schedule "${c1.shortTitle}" & "${c2.shortTitle}" in adjacent periods`
          : `Consecutive: Schedule 2 sessions of "${c1.shortTitle} (${c1.id})" in adjacent periods`;
      } else if (op.kind === "course_same_day") {
        desc = c2
          ? `Same Day: Schedule "${c1.shortTitle}" & "${c2.shortTitle}" on the same day`
          : `Same Day: Schedule sessions of "${c1.shortTitle} (${c1.id})" on the same day`;
      } else if (op.kind === "course_precedence" && c2) {
        desc = `Curriculum Order: Schedule "${c1.shortTitle} (${c1.id})" on the same day or earlier than "${c2.shortTitle} (${c2.id})"`;
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
      appliedLogs.push(formatCustomRuleI18n(rule, nextState, lang));
      continue;
    }

    if (op.op === "add_room_closure") {
      const room = nextState.rooms.find((r) => r.id === op.roomId);
      if (!room) continue;
      const dayText = op.days.join("/");
      const pText = op.periods.length === 5 ? "All Day" : `P${op.periods.join("/")}`;
      const reasonText = op.reason ? ` (${op.reason})` : "";
      const desc = `Room Closure: ${room.name} (${room.id}) unavailable on ${dayText} ${pText}${reasonText}`;
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
      appliedLogs.push(formatCustomRuleI18n(rule, nextState, lang));
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
      const labels: Record<string, { ja: string; en: string; zh: string }> = {
        maxProfessorConsecutivePeriods: {
          ja: "\u6559\u54E1\u306E\u6700\u5927\u9023\u7D9A\u8B1B\u7FA9\u30B3\u30DE\u6570",
          en: "Max consecutive periods for faculty",
          zh: "教师最大连续授课节数",
        },
        maxProfessorSessionsPerDay: {
          ja: "\u6559\u54E1\u306E1\u65E5\u6700\u5927\u62C5\u5F53\u30B3\u30DE\u6570",
          en: "Max daily sessions for faculty",
          zh: "教师单日最大授课节数",
        },
        maxCohortCompulsoryPerDay: {
          ja: "\u5B66\u751F(\u5404\u5B66\u5E74)\u306E1\u65E5\u6700\u5927\u5FC5\u4FEE\u30FB\u9078\u629E\u5FC5\u4FEE\u30B3\u30DE\u6570",
          en: "Max daily compulsory/core sessions per cohort",
          zh: "各年级学生单日最大必修/限选节数",
        },
        enforceRoomCapacity: {
          ja: "\u6559\u5BA4\u5B9A\u54E1\u5236\u7D04\u306E\u53B3\u5288",
          en: "Enforce room capacity limits",
          zh: "严格遵守教室容量限制",
        },
        enforceRoomEquipment: {
          ja: "\u6559\u5BA4\u8A2D\u5099(PC\u6F14\u7FD2\u5BA4\u7B49)\u5236\u7D04\u306E\u53B3\u5288",
          en: "Enforce room equipment (PC lab) requirements",
          zh: "严格遵守教室设备(PC机房等)要求",
        },
        enforceCohortNoOverlap: {
          ja: "\u5B66\u5E74\u5225\u30AB\u30EA\u30AD\u30E5\u30E9\u30E0\u91CD\u8907\u7981\u6B62",
          en: "Enforce cohort curriculum no-overlap",
          zh: "禁止同年级必修课程时间重叠",
        },
        enforceProfessorAvailability: {
          ja: "\u6559\u54E1\u90FD\u5408NG\u67A0\u306E\u53B3\u5288",
          en: "Enforce faculty unavailable (NG) slots",
          zh: "严格遵守教师不可出勤(NG)时段",
        },
        forbidSameCourseSameDay: {
          ja: "\u90312\u30B3\u30DE\u79D1\u76EE\u306E\u540C\u65E5\u958B\u8B1B\u9632\u6B62",
          en: "Prevent multi-session courses on the same day",
          zh: "防止周2次课排在同一天",
        },
        enforceMaxConsecutivePeriods: {
          ja: "\u6559\u54E1\u9023\u7D9A\u8B1B\u7FA9\u4E0A\u9650\u306E\u9069\u7528",
          en: "Enforce faculty consecutive period limit",
          zh: "启用教师连续授课上限",
        },
        preserveCurrentTimetable: {
          ja: "\u5FAE\u8ABF\u6574\u30E2\u30FC\u30C9(\u65E2\u5B58\u6642\u9593\u5272\u306E\u7DAD\u6301)",
          en: "Minimal perturbation mode (preserve current timetable)",
          zh: "微调模式(尽量保持现有课表)",
        },
      };
      const labelObj = labels[pName];
      const labelText = labelObj ? pickTimetableLang(lang, labelObj) : pName;
      appliedLogs.push(
        pickTimetableLang(lang, {
          ja: `${labelText} \u3092 ${String(pVal)} \u306B\u5909\u66F4\u3057\u307E\u3057\u305F`,
          en: `Set ${labelText} to ${String(pVal)}`,
          zh: `已将「${labelText}」设为 ${String(pVal)}`,
        })
      );
      continue;
    }
  }

  return { updatedState: nextState, appliedLogs };
}

/**
 * Attempts to repair JSON truncated by LLM output limits (e.g. unclosed quotes, brackets, dangling keys).
 */
export function repairTruncatedJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "{}";
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Attempt repair below
  }

  let inString = false;
  let escape = false;
  const stack: ("{" | "[")[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{" || ch === "[") {
        stack.push(ch);
      } else if (ch === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === "{") {
          stack.pop();
        }
      } else if (ch === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === "[") {
          stack.pop();
        }
      }
    }
  }

  let repaired = trimmed;
  if (inString) {
    repaired += '"';
  }

  // Clean trailing commas or incomplete key-value pairs before closing containers
  repaired = repaired.replace(/,\s*$/, "").replace(/:\s*$/, ": null");

  while (stack.length > 0) {
    const last = stack.pop();
    repaired = repaired.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
    if (last === "{") {
      repaired += "}";
    } else if (last === "[") {
      repaired += "]";
    }
  }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return "{}";
  }
}

export function buildCompactStateCatalogPrompt(state: TimetableState): string {
  const courseList =
    state.courses.length > 0
      ? state.courses
          .map((c) => `${c.id}:${c.title}(${c.sessionsPerWeek}/wk, Prof:${c.professorId})`)
          .join(", ")
      : "(None)";
  const profList =
    state.professors.length > 0
      ? state.professors
          .map(
            (p) =>
              `${p.id}:${p.name}(${p.title}${p.unavailableDays.length > 0 ? `, unavail:${p.unavailableDays.join("")}` : ""})`
          )
          .join(", ")
      : "(None)";
  const roomList =
    state.rooms.length > 0
      ? state.rooms
          .map((r) => `${r.id}:${r.name}(${ROOM_TYPE_LABELS[r.roomType] || r.roomType})`)
          .join(", ")
      : "(None)";

  return [
    `[Courses] ${courseList}`,
    `[Faculty] ${profList}`,
    `[Rooms] ${roomList}`,
    `[Current Configuration] Max consec=${state.config.maxProfessorConsecutivePeriods}, Max daily=${state.config.maxProfessorSessionsPerDay}, Forbid same-day=${state.config.forbidSameCourseSameDay ? "ON" : "OFF"}`,
  ].join("\n");
}

export function buildUltraCompactCatalogPrompt(state: TimetableState): string {
  const courseList =
    state.courses.length > 0
      ? state.courses.map((c) => `${c.id}:${c.title}(${c.professorId})`).join(", ")
      : "(None)";
  const profList =
    state.professors.length > 0
      ? state.professors.map((p) => `${p.id}:${p.name}`).join(", ")
      : "(None)";
  const roomList =
    state.rooms.length > 0 ? state.rooms.map((r) => `${r.id}:${r.name}`).join(", ") : "(None)";

  return [
    `[Courses] ${courseList}`,
    `[Faculty] ${profList}`,
    `[Rooms] ${roomList}`,
  ].join("\n");
}

export function createTimetableGeminiNanoManager(): TimetableGeminiNanoManager {
  let currentStatus: GeminiNanoStatus = "unavailable";
  let downloadProgress: number | null = null;
  let extractorBaseSession: LanguageModelSessionLike | null = null;
  let extractorSessionLang: TimetableLang = getTimetableLang();
  let consultBaseSession: LanguageModelSessionLike | null = null;
  let consultSessionLang: TimetableLang = getTimetableLang();
  let lastConsultTrace: LlmCallTrace | null = null;
  let initSeq = 0;
  let initChain: Promise<GeminiNanoStatus> = Promise.resolve("unavailable");

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
      lang: TimetableLang = getTimetableLang()
    ): Promise<GeminiNanoStatus> {
      const runInit = async (): Promise<GeminiNanoStatus> => {
        const mySeq = ++initSeq;
        if (!isChromeSupportedTimetableLang(lang)) {
          currentStatus = "unavailable";
          return "unavailable";
        }

        const avail = await checkGeminiNanoAvailability(lang);
        if (mySeq !== initSeq) return currentStatus;
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
            const nextExtractor = await createLanguageModelSession(
              api,
              EXTRACTOR_SYSTEM_PROMPT,
              buildExtractorLanguageModelOptions(),
              monitorFn
            );
            if (mySeq !== initSeq) {
              try {
                nextExtractor.destroy?.();
              } catch {
                // Ignore
              }
              return currentStatus;
            }
            if (extractorBaseSession && typeof extractorBaseSession.destroy === "function") {
              try {
                extractorBaseSession.destroy();
              } catch {
                // Ignore
              }
            }
            extractorBaseSession = nextExtractor;
          }
          if (!consultBaseSession || consultSessionLang !== lang) {
            const nextConsult = await createLanguageModelSession(
              api,
              CONSULT_SYSTEM_PROMPT,
              buildConsultLanguageModelOptions(lang),
              monitorFn
            );
            if (mySeq !== initSeq) {
              try {
                nextConsult.destroy?.();
              } catch {
                // Ignore
              }
              return currentStatus;
            }
            if (consultBaseSession && typeof consultBaseSession.destroy === "function") {
              try {
                consultBaseSession.destroy();
              } catch {
                // Ignore
              }
            }
            consultBaseSession = nextConsult;
            consultSessionLang = lang;
          }

          currentStatus = "available";
          downloadProgress = 100;
          return "available";
        } catch (err) {
          console.warn("Failed to initialize Gemini Nano session:", err);
          currentStatus = "unavailable";
          return "unavailable";
        }
      };

      initChain = initChain.catch(() => "unavailable").then(runInit);
      return await initChain;
    },

    async extractPlan(
      userMessage: string,
      state: TimetableState,
      signal?: AbortSignal,
      onProgress?: (event: ChatExtractProgressEvent) => void,
      lang: TimetableLang = getTimetableLang()
    ): Promise<ParsedTimetableChatPlan> {
      if (!extractorBaseSession || currentStatus !== "available") {
        const initStatus = await this.initialize(undefined, lang);
        if (initStatus !== "available" || !extractorBaseSession) {
          throw new Error(
            pickTimetableLang(lang, {
              ja: "Gemini Nano (LanguageModel API) \u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002",
              en: "Gemini Nano (LanguageModel API) is unavailable.",
              zh: "Gemini Nano (LanguageModel API) 不可用。",
            })
          );
        }
      }

      onProgress?.({
        phase: "turn1_start",
        activeLabel: pickTimetableLang(lang, {
          ja: "\u23F3 Gemini Nano \u3067\u6642\u9593\u5272\u6761\u4EF6\u3092\u69CB\u9020\u5316\u3057\u3066\u3044\u307E\u3059\u2026",
          en: "⏳ Structuring timetable constraints with Gemini Nano…",
          zh: "⏳ 正在通过 Gemini Nano 结构化排课条件…",
        }),
      });

      const getFreshExtractorSession = async (): Promise<{
        session: LanguageModelSessionLike;
        shouldDestroy: boolean;
      }> => {
        if (extractorBaseSession && typeof extractorBaseSession.clone === "function") {
          try {
            const cloned = await extractorBaseSession.clone();
            if (cloned !== extractorBaseSession) {
              return { session: cloned, shouldDestroy: true };
            }
            return { session: cloned, shouldDestroy: false };
          } catch {
            // Clone failed, fall back to fresh session
          }
        }
        const api = getLanguageModelApi();
        if (!api) {
          throw new Error("LanguageModel API is unavailable");
        }
        const fresh = await createLanguageModelSession(
          api,
          EXTRACTOR_SYSTEM_PROMPT,
          buildExtractorLanguageModelOptions()
        );
        return { session: fresh, shouldDestroy: true };
      };

      let { session, shouldDestroy } = await getFreshExtractorSession();
      const t0 = performance.now();
      let usedPrompt = `${buildCompactStateCatalogPrompt(state)}\n\nUser Request: "${userMessage}"`;
      let rawJson = "";

      try {
        try {
          rawJson = await session.prompt(usedPrompt, {
            responseConstraint: TIMETABLE_EXTRACTION_SCHEMA,
            signal,
          });
        } catch (promptErr: unknown) {
          const errStr = String(promptErr).toLowerCase();
          const isTruncated =
            errStr.includes("exceeded output limits") ||
            errStr.includes("truncated") ||
            errStr.includes("quota");
          if (isTruncated && !signal?.aborted) {
            if (shouldDestroy && typeof session.destroy === "function") {
              try {
                session.destroy();
              } catch {
                // Ignore
              }
            }
            const fresh = await getFreshExtractorSession();
            session = fresh.session;
            shouldDestroy = fresh.shouldDestroy;
            usedPrompt = `${buildUltraCompactCatalogPrompt(state)}\n\n指示: 「${userMessage}」`;
            rawJson = await session.prompt(usedPrompt, {
              responseConstraint: TIMETABLE_EXTRACTION_SCHEMA,
              signal,
            });
          } else {
            throw promptErr;
          }
        }

        const durationMs = Math.max(1, Math.round(performance.now() - t0));
        let parsed: {
          thought?: string;
          intentType?: ParsedTimetableChatPlan["intentType"];
          toolCalls?: RawStage2ToolCall[];
          replyJa?: string;
        };

        try {
          parsed = JSON.parse(rawJson.trim());
        } catch {
          // If initial output was truncated or invalid JSON, attempt a clean retry with ultra-compact catalog.
          // Never execute a repaired partial prefix of tool calls, as it silently drops requested operations.
          const isInitialAttempt = usedPrompt !== `${buildUltraCompactCatalogPrompt(state)}\n\n指示: 「${userMessage}」`;
          if (isInitialAttempt && !signal?.aborted) {
            if (shouldDestroy && typeof session.destroy === "function") {
              try {
                session.destroy();
              } catch {
                // Ignore
              }
            }
            const fresh = await getFreshExtractorSession();
            session = fresh.session;
            shouldDestroy = fresh.shouldDestroy;
            usedPrompt = `${buildUltraCompactCatalogPrompt(state)}\n\n指示: 「${userMessage}」`;
            rawJson = await session.prompt(usedPrompt, {
              responseConstraint: TIMETABLE_EXTRACTION_SCHEMA,
              signal,
            });
            parsed = JSON.parse(rawJson.trim());
          } else {
            throw new Error(
              pickTimetableLang(lang, {
                ja: "\u30E2\u30C7\u30EB\u306E\u51FA\u529B\u304C\u9014\u4E2D\u3067\u9014\u5207\u308C\u307E\u3057\u305F\u3002\u6307\u793A\u3092\u77ED\u304F\u5206\u5272\u3057\u3066\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
                en: "The model response was truncated or invalid. Please split your request into shorter prompts.",
                zh: "模型输出被截断或格式无效。请将指令缩短或拆分后重试。",
              })
            );
          }
        }

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
          userPrompt: usedPrompt,
          schema: TIMETABLE_EXTRACTION_SCHEMA,
          rawOutput: rawJson,
          durationMs,
        };

        onProgress?.({
          phase: "turn2_done",
          activeLabel: pickTimetableLang(lang, {
            ja: `\u2705 ${operations.length}\u4EF6\u306E\u6642\u9593\u5272\u6761\u4EF6\u3092\u62BD\u51FA\u3057\u307E\u3057\u305F`,
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
        if (shouldDestroy && typeof session.destroy === "function") {
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
      lang: TimetableLang = getTimetableLang()
    ): AsyncIterable<string> {
      const summaryLines: string[] = [];
      if (appliedSummary.length > 0) {
        summaryLines.push(
          pickTimetableLang(lang, {
            ja: `\u3010\u9069\u7528\u3057\u305F\u6761\u4EF6\u5909\u66F4 (${appliedSummary.length}\u4EF6)\u3011`,
            en: `[Applied Constraint Changes (${appliedSummary.length})]`,
            zh: `【已应用的条件变更 (${appliedSummary.length}项)】`,
          })
        );
        for (const s of appliedSummary) summaryLines.push(`- ${s}`);
      }
      if (outcome) {
        if (outcome.status === "Optimal" || outcome.status === "Feasible") {
          const ev = outcome.evaluation;
          const diff = outcome.diffFromPrevious;
          const sessionCount = outcome.timetable?.sessions.length ?? 0;
          summaryLines.push(
            pickTimetableLang(lang, {
              ja: `\u3010\u6C42\u89E3\u7D50\u679C\u3011\u30B9\u30C6\u30FC\u30BF\u30B9=${outcome.status} (${outcome.solveTimeMs}ms), \u5BFE\u8C61=${state.courses.length}\u79D1\u76EE(\u8A08${sessionCount}\u30B3\u30DE)`,
              en: `[Solve Result] Status=${outcome.status} (${outcome.solveTimeMs}ms), Courses=${state.courses.length} (${sessionCount} sessions)`,
              zh: `【求解结果】状态=${outcome.status} (${outcome.solveTimeMs}ms), 课程=${state.courses.length}门(共${sessionCount}节)`,
            })
          );
          if (ev) {
            summaryLines.push(
              pickTimetableLang(lang, {
                ja: `- \u30CF\u30FC\u30C9\u5236\u7D04\u9055\u53CD: ${ev.hardViolationCount}\u4EF6 / \u7A7A\u304D\u30B3\u30DE\u5408\u8A08: ${ev.softPenaltyCount}\u30B3\u30DE`,
                en: `- Hard violations: ${ev.hardViolationCount} / Student hollow gaps: ${ev.softPenaltyCount}`,
                zh: `- 硬约束违反: ${ev.hardViolationCount}项 / 学生空堂合计: ${ev.softPenaltyCount}节`,
              })
            );
          }
          if (diff && diff.totalSessions > 0) {
            summaryLines.push(
              pickTimetableLang(lang, {
                ja: `- \u524D\u56DE\u306E\u6642\u9593\u5272\u304B\u3089\u306E\u5909\u66F4: ${diff.changedSessionsCount}\u30B3\u30DE\u306E\u307F\u5909\u66F4 (\u7DAD\u6301\u7387 ${diff.retentionRatePct}%)`,
                en: `- Changes from previous timetable: ${diff.changedSessionsCount} session(s) moved (retention ${diff.retentionRatePct}%)`,
                zh: `- 较上一版课表变动: 仅调整 ${diff.changedSessionsCount} 节课 (保留率 ${diff.retentionRatePct}%)`,
              })
            );
            for (const ch of diff.changes.slice(0, 5)) {
              const reasonStr = formatDiffReasonI18n(ch.reason, state, lang);
              const reasonSuffix = reasonStr ? ` (${reasonStr})` : "";
              summaryLines.push(`  * ${ch.courseTitle}: ${ch.prevDay}P${ch.prevPeriod} -> ${ch.nextDay}P${ch.nextPeriod}${reasonSuffix}`);
            }
          }
        } else if (outcome.status === "Infeasible") {
          summaryLines.push(
            pickTimetableLang(lang, {
              ja: `\u3010\u26A0\uFE0F \u6642\u9593\u5272\u3092\u7D44\u3081\u307E\u305B\u3093 (Infeasible)\u3011\u885D\u7A81\u3057\u3066\u3044\u308B\u5236\u7D04 (${outcome.conflicts.length}\u4EF6):`,
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
              `- ${loc.label}${loc.relaxSuggestion ? ` (${hintPrefix}: ${loc.relaxSuggestion})` : ""}`
            );
          }
        }
      }

      const fullPrompt = pickTimetableLang(lang, {
        ja: `${summaryLines.join("\n")}\n\nUser query: "${userMessage}"\nReply concisely in Japanese based on the above result.`,
        en: `${summaryLines.join("\n")}\n\nUser request: "${userMessage}"\nBased on the results above, reply concisely and clearly in English for academic affairs staff and faculty.`,
        zh: `${summaryLines.join("\n")}\n\n用户指令: “${userMessage}”\n请根据上述结果，用简体中文向教务人员与教师简洁清晰地说明。`,
      });

      if (!isChromeSupportedTimetableLang(lang)) {
        yield summaryLines.join("\n");
        return;
      }

      const api = getLanguageModelApi();
      if (api && (!consultBaseSession || consultSessionLang !== lang)) {
        try {
          const nextConsult = await createLanguageModelSession(
            api,
            CONSULT_SYSTEM_PROMPT,
            buildConsultLanguageModelOptions(lang),
            undefined
          );
          if (consultBaseSession && typeof consultBaseSession.destroy === "function") {
            try {
              consultBaseSession.destroy();
            } catch {
              // Ignore
            }
          }
          consultBaseSession = nextConsult;
          consultSessionLang = lang;
        } catch {
          // Keep existing or null
        }
      }

      if (!consultBaseSession || consultSessionLang !== lang) {
        yield summaryLines.join("\n");
        return;
      }

      const getFreshConsultSession = async (): Promise<{
        session: LanguageModelSessionLike;
        shouldDestroy: boolean;
      }> => {
        if (consultBaseSession && typeof consultBaseSession.clone === "function") {
          try {
            const cloned = await consultBaseSession.clone();
            if (cloned !== consultBaseSession) {
              return { session: cloned, shouldDestroy: true };
            }
            return { session: cloned, shouldDestroy: false };
          } catch {
            // Clone failed, fall back
          }
        }
        if (!api) {
          return { session: consultBaseSession, shouldDestroy: false };
        }
        try {
          const fresh = await createLanguageModelSession(
            api,
            CONSULT_SYSTEM_PROMPT,
            buildConsultLanguageModelOptions(lang)
          );
          return { session: fresh, shouldDestroy: true };
        } catch {
          return { session: consultBaseSession, shouldDestroy: false };
        }
      };

      const { session, shouldDestroy } = await getFreshConsultSession();
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
        if (shouldDestroy && typeof session.destroy === "function") {
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
      initSeq += 1;
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
      currentStatus = "unavailable";
      downloadProgress = null;
    },
  };
}
