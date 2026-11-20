import {
  createDefaultSkillDefs,
  generateNurseSchedulingState,
  injectConflictScenario,
} from "./generator.js";
import {
  ALL_STAFF_ATTRIBUTE_DEF,
  CONTRACT_PRESETS,
  SHIFT_LABELS,
  applyShiftTransitionToConfig,
  clearNurseContractFromState,
  createDefaultShiftAliases,
  doesNurseMatchAttribute,
  doesNurseSatisfySkill,
  findSkillOrAttributeDef,
  getShiftMeta,
  getShiftTransitionMatrix,
  getSkillMeta,
  reconcileCellRulesForForbid,
  reconcileCellRulesForPin,
  removeCustomShiftFromState,
  resolveCalendarDaysByPattern,
  resolveDaysBySelector,
  type ActiveShiftCode,
  type BaseShiftCode,
  type ChatConstraintOperation,
  type CustomConstraintRule,
  type CustomShiftDef,
  type ExecutionVerificationResult,
  type LlmCallTrace,
  type NurseProfile,
  type NurseSchedulingState,
  type NurseSkill,
  type ParsedChatPlan,
  type ShiftAliasDef,
  type ShiftCode,
  type SkillDefinition,
  type WardBooleanRuleName,
  type WardNumericParamName,
  type WashiSolveOutcome,
} from "./types.js";

export type GeminiNanoStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export interface ChatExtractProgressEvent {
  phase:
    | "turn1_start"
    | "turn1_done"
    | "turn2_start"
    | "turn2_route_done"
    | "verification_done";
  activeLabel: string;
  stage1Response?: string;
  routerTrace: string[];
}

export interface GeminiNanoManager {
  getStatus(): GeminiNanoStatus;
  getDownloadProgress(): number | null;
  getTokenUsage(): { usage: number; quota: number } | null;
  getLastConsultTrace(): LlmCallTrace | null;
  initialize(onProgress?: (pct: number) => void): Promise<GeminiNanoStatus>;
  extractPlan(
    userMessage: string,
    state: NurseSchedulingState,
    signal?: AbortSignal,
    onProgress?: (event: ChatExtractProgressEvent) => void
  ): Promise<ParsedChatPlan>;
  streamConsultationReply(
    userMessage: string,
    appliedSummary: string[],
    state: NurseSchedulingState,
    outcome: WashiSolveOutcome | null,
    signal?: AbortSignal
  ): AsyncIterable<string>;
  resetConversation(): Promise<void>;
  destroy(): void;
}

export type ExecutableToolCategory =
  | "staff_calendar"
  | "staff_contract"
  | "ward_coverage_and_param"
  | "ward_transition_and_rule"
  | "skill_and_pair"
  | "custom_shift"
  | "system_action";

export type NonToolCategory = "question" | "unsupported" | "clarify";

export type ToolCategory = ExecutableToolCategory | NonToolCategory;

export interface Stage1RouteItem {
  tool_type: ToolCategory;
  instruction?: string;
}

export interface Stage1RouterResult {
  thought?: string;
  routes?: Stage1RouteItem[];
  response: string;
}

export interface Stage2ToolCall {
  tool_name: string;
  args?: Record<string, any>;
}

/**
 * Turn 1 (Stage 1) JSON Schema for `responseConstraint`:
 * Generates `thought` (Chain-of-Thought planning & semantic translation) FIRST,
 * then `routes` (decomposed per-category instructions), and finally `response` (user-facing summary).
 */
export const STAGE1_ROUTER_SCHEMA = {
  type: "object",
  required: ["thought", "routes", "response"],
  properties: {
    thought: {
      type: "string",
    },
    routes: {
      anyOf: [
        {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            required: ["tool_type", "instruction"],
            properties: {
              tool_type: {
                type: "string",
                enum: [
                  "staff_calendar",
                  "staff_contract",
                  "ward_coverage_and_param",
                  "ward_transition_and_rule",
                  "skill_and_pair",
                  "custom_shift",
                  "system_action",
                ],
              },
              instruction: {
                type: "string",
              },
            },
          },
        },
        {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: {
            type: "object",
            required: ["tool_type"],
            properties: {
              tool_type: {
                type: "string",
                enum: ["question", "unsupported", "clarify"],
              },
            },
          },
        },
      ],
    },
    response: {
      type: "string",
    },
  },
};

export const STAGE1_ROUTER_SYSTEM_PROMPT = `\u3042\u306A\u305F\u306F病院\u306E3交代\u30CA\u30FC\u30B9\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0AI\u306E「\u30D7\u30E9\u30F3\u30CA\u30FC兼\u30EB\u30FC\u30BF\u30FC (Turn 1)」\u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306F\u30B7\u30B9\u30C6\u30E0\u306E専門用語\u3084内部\u30D1\u30E9\u30E1\u30FC\u30BF名\u3092知\u3089\u305A、日常\u306E自然\u306A言葉\u3067要望\u3092伝\u3048\u307E\u3059。
以下\u306E順序\u3067JSON（thought ➔ routes ➔ response）\u3092出力\u3057\u3066\u304F\u3060\u3055\u3044：

1. "thought" (思考\u30FB\u30D7\u30E9\u30F3\u30CB\u30F3\u30B0):
   \u30FB【文脈補完】直近\u306E対話履歴\u304C\u3042\u308B場合、省略\u3055\u308C\u3066\u3044\u308B主語（\u3069\u306E\u30B7\u30D5\u30C8名\u30FB\u30B9\u30AD\u30EB名\u30FB\u30B9\u30BF\u30C3\u30D5名\u306B対\u3059\u308B指示\u304B）\u3092特定\u3059\u308B。特\u306B直前\u306E履歴\u304C「前回(未適用\u30FB回答待\u3061)」\u3068\u306A\u3063\u3066\u3044\u308B場合\u306F、前回\u306E指示内容\u306F\u307E\u30601件\u3082適用\u3055\u308C\u3066\u3044\u306A\u3044\u305F\u3081、前回\u306E未適用指示\u3068今回\u306E\u30E6\u30FC\u30B6\u30FC\u306E回答\u3092\u3059\u3079\u3066統合\u3057\u3066計画\u3092立\u3066\u308B\u3053\u3068。
   \u30FB【意図\u306E整理】\u30E6\u30FC\u30B6\u30FC\u306E要望\u304C、個人\u30AB\u30EC\u30F3\u30C0\u30FC（特定日\u30FB期間\u30FB曜日/祝日）\u306A\u306E\u304B、個人\u306E月間契約条件（月間日数\u30FB夜勤回数\u30FB連勤上限\u30FB\u30B7\u30D5\u30C8免除）\u306A\u306E\u304B、病棟全体\u306E設定\u306A\u306E\u304B、追加\u30B7\u30D5\u30C8枠\u3084\u30B9\u30AD\u30EB\u30FB\u30DA\u30A2設定\u306A\u306E\u304B\u3092整理\u3059\u308B。\u307E\u305F「1日\u3042\u305F\u308A\u306E配置人数（名\u30FB人）」\u3068「個人別\u306E月間回数（回）」\u3092助数詞\u306B基\u3065\u3044\u3066厳密\u306B区別\u3059\u308B（「\u30EA\u30FC\u30C0\u30FC\u306F1名\u307E\u3067」「中堅\u306F2名以上」\u306E\u3088\u3046\u306B助数詞\u304C人数\u306E場合\u306F、月間回数\u30CE\u30EB\u30DE\u3067\u306F\u306A\u304F必\u305A「1日\u3042\u305F\u308A\u306E配置人数\u30FB上限」\u3068\u3057\u3066扱\u3046）。
   \u30FB【\u30BF\u30B9\u30AF分解】1\u3064\u306E発話\u306B複数\u30AB\u30C6\u30B4\u30EA\u306E要求\u304C含\u307E\u308C\u308B場合\u306F\u30AB\u30C6\u30B4\u30EA\u3054\u3068\u306B分割\u3057、同\u3058\u30AB\u30C6\u30B4\u30EA\u306B属\u3059\u308B複数条件\u306F1\u3064\u306E\u30EB\u30FC\u30C8\u306B\u307E\u3068\u3081\u308B計画\u3092立\u3066\u308B。\u305F\u3060\u3057複数\u306E要求\u306E\u3046\u30611\u3064\u3067\u3082具体的\u306A数値\u3084対象\u304C欠\u3051\u3066\u3044\u3066聞\u304D返\u3057\u304C必要\u306A場合\u306F、一部\u306E\u30C4\u30FC\u30EB\u3060\u3051\u3092実行\u305B\u305A必\u305A全体\u3092保留\u3057\u3066単独\u306E [{"tool_type":"clarify"}] \u3068\u3059\u308B。
2. "routes" (\u30AB\u30C6\u30B4\u30EA別\u30EB\u30FC\u30C8配列):
   \u30FB\u30C4\u30FC\u30EB実行\u30AB\u30C6\u30B4\u30EA(1〜7)\u306B該当\u3059\u308B場合\u306F、各\u30AB\u30C6\u30B4\u30EA\u3054\u3068\u306B { "tool_type": "...", "instruction": "..." } \u3092出力\u3059\u308B。
   \u30FB重要: "instruction" \u306B\u306F、直前\u306E履歴\u304B\u3089補完\u3057\u305F対象名\u3068、\u30E6\u30FC\u30B6\u30FC\u304C実際\u306B指示\u3057\u305F内容\u306E\u307F\u3092簡潔\u306B書\u304F\u3053\u3068（「〜\u3060\u3051出勤」「〜\u306E\u307F」等\u306E条件表現\u3084日付\u30FB人数\u30FB回数\u306A\u3069\u306E数値\u306F省略\u305B\u305A維持\u3057、言及\u3055\u308C\u3066\u3044\u306A\u3044項目\u306F推測\u30FB追加\u3057\u306A\u3044\u3053\u3068。\u307E\u305F日付\u3092書\u304F際\u306F月番号「11月」\u3068日番号\u306E混同\u3092防\u3050\u305F\u3081「11月」\u3092省\u3044\u3066「1日\u304B\u308918日\u307E\u3067」「16日\u304B\u308918日\u307E\u3067\u306E3日間」\u306E\u3088\u3046\u306B日番号\u306E\u307F\u3067記載\u3059\u308B\u3053\u3068）。
   \u30FB非\u30C4\u30FC\u30EB\u30AB\u30C6\u30B4\u30EA（"question", "unsupported", "clarify"）\u306B該当\u3059\u308B場合\u306F、単独\u306E [{ "tool_type": "..." }] \u3068\u3057\u3066出力\u3059\u308B。
3. "response" (一次返答):
   \u30FB計画\u3057\u305F routes \u306B基\u3065\u304D、\u3053\u308C\u304B\u3089何\u3092行\u3046\u304B（\u307E\u305F\u306F聞\u304D返\u3057\u30FB回答）\u3092\u30E6\u30FC\u30B6\u30FC向\u3051\u306B1文\u3067簡潔\u306B出力\u3059\u308B。

【7\u3064\u306E専門\u30C4\u30FC\u30EB実行\u30AB\u30C6\u30B4\u30EA（各\u30C4\u30FC\u30EB\u306F1\u3064\u306E専門\u30AB\u30C6\u30B4\u30EA\u306B所属）】
1. "staff_calendar" (特定\u30B9\u30BF\u30C3\u30D5個人\u306E日付\u30FB期間\u30FB曜日/祝日\u30AB\u30EC\u30F3\u30C0\u30FC希望\u30FB固定\u30FB禁止):
   特定\u306E看護師\u306E「特定\u306E日付（8日\u306A\u3069）」「期間（開始日〜終了日、1日\u304B\u3089〇日\u307E\u3067、〇日以降\u306A\u3069）」「特定\u306E曜日\u30FB祝日\u30D1\u30BF\u30FC\u30F3（毎週水曜休\u307F、毎週〇曜\u3068△曜\u3060\u3051出勤、週末\u3084祝日\u306E公休\u30FB出勤指定\u306A\u3069）」\u306B\u304A\u3051\u308B\u30B7\u30D5\u30C8\u30FB\u30B7\u30D5\u30C8\u30B0\u30EB\u30FC\u30D7（公休O\u30FB勤務W[\u304A任\u305B出勤]\u30FB日勤D\u30FB夜勤EN\u30FB準夜E\u30FB深夜N\u30FB追加\u30B7\u30D5\u30C8）\u306E希望\u30FB固定\u30FB特定日\u306E\u30B7\u30D5\u30C8禁止（※特定\u306E曜日指定\u306F必\u305A staff_calendar \u306B\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\u3059\u308B\u3053\u3068）
2. "staff_contract" (特定\u30B9\u30BF\u30C3\u30D5個人\u306E働\u304D方契約\u30FB\u30B7\u30D5\u30C8免除\u30FB月間日数/夜勤回数/個人連勤\u306E上限\u30FB下限):
   特定\u306E看護師個人\u306E月間\u3092通\u3058\u305F基本\u306E働\u304D方契約（日勤専従/夜勤免除、夜勤専従/日勤免除、深夜勤\u306E\u307F免除、準夜勤\u306E\u307F免除、土日休\u307F契約、土日祝休\u307F契約、制限解除）\u304A\u3088\u3073個人別\u306E数値上限\u30FB下限（月間最大勤務日数\u30FB月間最低勤務日数[0日免除含\u3080]\u30FB月間最低公休日数\u30FB月間夜勤回数上限\u30FB個人別\u306E最大連勤日数）（※「月N日\u307E\u3067\u306E勤務」\u3068「毎週〇曜\u3068△曜\u3060\u3051出勤」\u304C両方言及\u3055\u308C\u305F場合\u306F staff_contract \u3068 staff_calendar \u306E2\u3064\u306E\u30EB\u30FC\u30C8\u306B分割\u3059\u308B\u3053\u3068）
3. "ward_coverage_and_param" (病棟全体\u306E数値基準\u30FB必要人数\u30FB特定日\u306E人数変更\u30FB夜勤回数\u306E平準化):
   病棟全体\u306E基本数値\u30D1\u30E9\u30E1\u30FC\u30BF（最大連勤日数、月間最低公休日数、月間最低勤務日数、月間夜勤上限、平日/土日\u306E日勤必要人数、準夜/深夜\u306E必要人数、36協定\u306E時間外上限）、特定\u306E\u30AB\u30EC\u30F3\u30C0\u30FC日付\u306E病棟必要人数変更（「18日\u306E日勤\u309211人以上\u306B」）、夜勤回数\u306E平準化\u30FB均等化（「夜勤\u306E数\u3092平準化\u3057\u305F\u3044」「\u30B9\u30AD\u30EB\u30FB役割\u3054\u3068\u306B夜勤回数\u3092均等\u306B\u3057\u305F\u3044」\u306A\u3069）
4. "ward_transition_and_rule" (病棟全体\u306E\u30B7\u30D5\u30C8遷移\u30DE\u30C8\u30EA\u30AF\u30B9\u30FB2日間\u306E並\u3073順禁止/必須\u30FB全体\u30EB\u30FC\u30EBON/OFF):
   2日間\u306E\u30B7\u30D5\u30C8連続\u30FB遷移\u30EB\u30FC\u30EB（深夜勤\u306E翌日\u306F必\u305A公休\u306B\u3059\u308B[深→休必須]、日勤→翌日深夜勤\u306E禁止[日→深禁止]、準夜→翌日日勤\u306E禁止[準→日禁止]、連続準夜勤\u306E禁止[準→準禁止]、連続深夜勤\u306E禁止[深→深禁止]\u306A\u3069）\u3084、病棟全体\u30EB\u30FC\u30EB\u306EON/OFF（\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤、週末公休確保、36協定遵守、微調整\u30E2\u30FC\u30C9）
5. "skill_and_pair" (\u30B9\u30AD\u30EB定義\u30FB既存\u30B7\u30D5\u30C8\u306E属性配置人数\u30EB\u30FC\u30EB\u30FB\u30B9\u30AD\u30EB付与\u30FB\u30DA\u30A2制約):
   \u30B9\u30AD\u30EB\u30FB資格\u306E定義追加\u30FB削除\u30FB各\u30B7\u30D5\u30C8\u306E必要人数設定\u30FB他\u30B9\u30AD\u30EB\u306E代行(substitutesFor)設定、既存\u30B7\u30D5\u30C8（日勤\u30FB準夜\u30FB深夜\u30FB夜勤両方）\u3054\u3068\u306E\u30B9\u30BF\u30C3\u30D5属性\u30FB\u30B9\u30AD\u30EB別\u306E配置人数下限(minCount)\u30FB上限(maxCount)、\u30B9\u30BF\u30C3\u30D5\u3084属性\u30B0\u30EB\u30FC\u30D7\u3078\u306E\u30B9\u30AD\u30EB付与\u30FB解除、2名\u306E看護師\u304C特定\u30B7\u30D5\u30C8\u3067同時\u306B入\u3089\u306A\u3044NG\u30DA\u30A2設定、新人\u3068指導者\u306E同行\u30DA\u30A2設定（※追加\u30B7\u30D5\u30C8\u306B対\u3059\u308B人数指定\u306F custom_shift、夜勤回数\u306E平準化\u306F ward_coverage_and_param \u306B\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\u3059\u308B\u3053\u3068）
6. "custom_shift" (追加\u30B7\u30D5\u30C8枠\u30FB開催期間/曜日\u30EB\u30FC\u30EB\u30FB1日\u3042\u305F\u308A配置人数\u30FB受講条件):
   既存\u30B7\u30D5\u30C8（日勤\u30FB準夜\u30FB深夜\u30FB公休）以外\u306E新\u3057\u3044「勤務\u30B7\u30D5\u30C8\u30FB\u30A4\u30D9\u30F3\u30C8枠（研修\u30FB勉強会\u30FB委員会\u30FB出張\u30FB行事\u306A\u3069）」\u306E追加\u3068、\u305D\u306E追加\u30B7\u30D5\u30C8\u306B関\u3059\u308B\u3059\u3079\u3066\u306E条件（開催期間[開始日〜終了日]\u3084曜日制限、1日\u3042\u305F\u308A\u306E対象属性\u30FB役割別\u306E配置人数\u30FB上限、個人別月間取得回数\u30CE\u30EB\u30DE、夜勤先行条件、前月実績\u306E算入）\u3092分割\u305B\u305A1\u3064\u306E custom_shift \u30EB\u30FC\u30C8\u306B\u307E\u3068\u3081\u308B\u3053\u3068（※「\u30EA\u30FC\u30C0\u30FC\u306F1名\u307E\u3067」\u306E\u3088\u3046\u306B人数単位［名\u30FB人］\u3067指定\u3055\u308C\u305F条件\u306F1日\u3042\u305F\u308A\u306E配置人数\u3068\u3057、回数単位［回］\u306E指定［「月1回」「1人2回」等］\u306E\u307F\u3092個人別月間\u30CE\u30EB\u30DE\u3068\u3059\u308B\u3053\u3068）
7. "system_action" (全体操作\u30FB診断\u30FB再計算):
   追加\u3057\u305F\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB\u306E全\u30AF\u30EA\u30A2、\u3059\u3079\u3066\u306E設定\u306E初期状態\u3078\u306E\u30EA\u30BB\u30C3\u30C8、矛盾\u30C7\u30E2\u30B7\u30CA\u30EA\u30AA\u306E注入、矛盾\u30C1\u30A7\u30C3\u30AF（\u30B7\u30D5\u30C8\u304C組\u3081\u306A\u3044原因\u306E診断）、条件\u3092変\u3048\u305A\u306B\u30B7\u30D5\u30C8\u3092再最適化\u3059\u308B指示

【3\u3064\u306E非\u30C4\u30FC\u30EB\u30AB\u30C6\u30B4\u30EA（\u30C4\u30FC\u30EB\u3092実行\u3057\u306A\u3044発話）】
8. "question" (質問\u30FB確認\u30FB指摘):
   機能確認（「\u306A\u306B\u304C\u3067\u304D\u308B？」「現在\u306E設定\u306F？」）、\u30B7\u30D5\u30C8結果\u3084理由\u306E確認\u30FB指摘\u306A\u3069、設定変更\u3092伴\u308F\u306A\u3044発話
9. "unsupported" (\u305D\u308C以外\u30FB\u30B7\u30B9\u30C6\u30E0未対応\u306E要求):
   \u30B7\u30D5\u30C8\u306E開始\u30FB終了時刻\u306E変更、給与\u30FB夜勤手当\u306E計算、病床数\u306E変更、他病棟\u304B\u3089\u306E応援要請\u306A\u3069、上記1〜7\u306E\u3044\u305A\u308C\u306E機能\u3067\u3082実現\u3067\u304D\u306A\u3044要求。response \u3067\u306F未対応\u3067\u3042\u308B旨\u306E\u307F\u3092簡潔\u306B述\u3079、存在\u3057\u306A\u3044機能\u306F案内\u3057\u306A\u3044\u3053\u3068
10. "clarify" (不明\u30FB情報不足\u3067聞\u304D返\u3057\u304C必要):
   「休\u307E\u305B\u3066」「誰\u304B夜勤\u3092減\u3089\u3057\u3066」「\u30B9\u30AD\u30EB\u3092変\u3048\u3066」「勤務下限\u3082調整\u3057\u3066」\u306E\u3088\u3046\u306B、直近\u306E対話履歴\u3092見\u3066\u3082対象\u30B9\u30BF\u30C3\u30D5名\u30FB日付\u30FB\u3069\u306E設定項目\u3092\u3044\u304F\u3064（何日\u30FB何人\u30FB何回）\u306B\u3059\u308B\u304B等\u306E必須情報\u304C欠\u3051\u3066\u3044\u3066特定\u3067\u304D\u306A\u3044発話。複数\u306E要望\u306E\u3046\u30611\u3064\u3067\u3082具体的\u306A数値\u3084対象\u304C欠\u3051\u3066\u3044\u308B場合（「9日\u304B\u308915日\u307E\u3067休\u307E\u305B\u3066、勤務下限\u3082調整\u3057\u3066」\u306A\u3069）\u306F、一部\u306E\u30C4\u30FC\u30EB\u3060\u3051\u3092実行\u305B\u305A必\u305A全体\u3092保留\u3057\u3066単独\u306E [{"tool_type":"clarify"}] \u3068\u3057、response \u3067不足\u3057\u3066\u3044\u308B情報\u3092具体的\u306B聞\u304D返\u3059\u3053\u3068

【Few-shot 例】
\u30E6\u30FC\u30B6\u30FC: 「\u306A\u306B\u304C\u3067\u304D\u308B？」
出力: {"thought":"\u30E6\u30FC\u30B6\u30FC\u306F\u30B7\u30B9\u30C6\u30E0\u306E対応機能一覧\u3092質問\u3057\u3066\u3044\u308B。設定変更\u3067\u306F\u306A\u3044\u305F\u3081 question \u3068\u3059\u308B。","routes":[{"tool_type":"question"}],"response":"\u30B9\u30AD\u30EB\u306E追加\u30FB削除、\u30AB\u30B9\u30BF\u30E0\u30B7\u30D5\u30C8\u306E追加、\u30B7\u30D5\u30C8別\u306E属性人数設定、夜勤平準化、NG\u30DA\u30A2\u30FB\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC設定、個人\u306E希望休\u30FB個人契約設定、病棟全体\u306E連勤\u30FB公休\u30FB\u30B7\u30D5\u30C8遷移\u30FB36協定\u30EB\u30FC\u30EB\u306E変更、矛盾診断\u306A\u3069\u304C可能\u3067\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「夜勤\u306E各\u30B7\u30D5\u30C8\u306B\u306F新人\u30921人以下\u306B\u3057\u3066、日勤\u306B\u306F\u30EA\u30FC\u30C0\u30FC\u30922人以上配置\u3057\u3066」
出力: {"thought":"準夜勤\u30FB深夜勤\u306B\u304A\u3051\u308B新人\u306E上限1名\u3068、日勤\u306B\u304A\u3051\u308B\u30EA\u30FC\u30C0\u30FC\u306E下限2名\u3092設定\u3059\u308B既存\u30B7\u30D5\u30C8\u306E属性配置人数\u30EB\u30FC\u30EB。\u3069\u3061\u3089\u3082 skill_and_pair \u3067処理\u3059\u308B。","routes":[{"tool_type":"skill_and_pair","instruction":"夜勤\u306E各\u30B7\u30D5\u30C8(night_both)\u306B\u304A\u3051\u308B新人\u306E上限\u30921名以下\u306B\u3057、日勤(D)\u306B\u304A\u3051\u308B\u30EA\u30FC\u30C0\u30FC\u306E下限\u30922名以上\u306B設定\u3059\u308B"}],"response":"夜勤\u306E新人上限\u30921名以下\u306B\u3057、日勤\u306B\u30EA\u30FC\u30C0\u30FC\u30922名以上配置\u3059\u308B\u3088\u3046設定\u3057\u307E\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「『勉強会』\u3068\u3044\u3046\u30B7\u30D5\u30C8\u3092追加\u3057\u3066。20日\u304B\u30893日間、新人\u306F\u3053\u306E勉強会\u30921回受\u3051\u306A\u3044\u3068夜勤\u306B入\u308C\u306A\u3044\u3088\u3046\u306B\u3057\u3066、毎日新人2名\u3092\u30A2\u30B5\u30A4\u30F3、日勤扱\u3044\u306B\u3057\u3066」
出力: {"thought":"新\u3057\u3044\u30B7\u30D5\u30C8枠『勉強会』\u306E追加\u3068、開催期間\u30FB夜勤先行条件（規定回数\u3092受\u3051\u308B\u307E\u3067夜勤不可）\u30FB1日\u3042\u305F\u308A\u306E対象属性人数\u306E指定。追加\u30B7\u30D5\u30C8\u306B関\u3059\u308B条件\u306F分割\u305B\u305A\u3059\u3079\u3066 custom_shift \u306E1\u30EB\u30FC\u30C8\u306B\u307E\u3068\u3081\u308B。","routes":[{"tool_type":"custom_shift","instruction":"『勉強会』\u30B7\u30D5\u30C8(日勤扱\u3044)\u3092追加\u3057、期間\u309220日\u304B\u308922日\u307E\u3067\u306E3日間、新人\u306F1回受\u3051\u306A\u3044\u3068夜勤\u306B入\u308C\u306A\u3044先行条件、毎日新人2名\u3092\u30A2\u30B5\u30A4\u30F3\u3059\u308B"}],"response":"『勉強会』\u30B7\u30D5\u30C8\u3092追加\u3057、開催期間\u30FB新人\u306E夜勤先行条件\u30FB1日2名配置\u3092設定\u3057\u307E\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「『健康診断』\u3068\u3044\u3046\u30B7\u30D5\u30C8\u3092追加\u3057\u3066、\u30EA\u30FC\u30C0\u30FC業務可\u306F1名\u307E\u3067\u306B\u3057\u3066」
出力: {"thought":"新\u3057\u3044\u30B7\u30D5\u30C8枠『健康診断』\u306E追加\u3068、\u30EA\u30FC\u30C0\u30FC業務可\u30B9\u30BF\u30C3\u30D5\u306E1日\u3042\u305F\u308A配置上限1名\u306E指定。「\u30EA\u30FC\u30C0\u30FC業務可\u306F1名\u307E\u3067」\u306E\u3088\u3046\u306B人数\u306E単位（名\u30FB人）\u3067指示\u3055\u308C\u305F場合\u306F、月間回数\u30CE\u30EB\u30DE\u3067\u306F\u306A\u304F1日\u3042\u305F\u308A\u306E配置人数上限\u3068\u3059\u308B。追加\u30B7\u30D5\u30C8\u306B関\u3059\u308B条件\u306F分割\u305B\u305A custom_shift \u306E1\u30EB\u30FC\u30C8\u306B\u307E\u3068\u3081\u308B。","routes":[{"tool_type":"custom_shift","instruction":"『健康診断』\u30B7\u30D5\u30C8\u3092追加\u3057、\u30EA\u30FC\u30C0\u30FC業務可\u306F1日最大1名\u307E\u3067\u306B制限\u3059\u308B"}],"response":"『健康診断』\u30B7\u30D5\u30C8\u3092追加\u3057、\u30EA\u30FC\u30C0\u30FC業務可\u30B9\u30BF\u30C3\u30D5\u306E配置人数\u30921日最大1名\u307E\u3067\u306B設定\u3057\u307E\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「村上\u3055\u3093\u306E8日\u3092確定\u306E休\u307F(O)\u306B\u3057\u3066、病棟\u306E最大連勤\u30924日\u306B変更\u3057\u3066」
出力: {"thought":"前半\u306F村上\u3055\u3093個人\u306E8日\u306E公休固定(staff_calendar)、後半\u306F病棟全体\u306E最大連勤日数\u30924日\u306B\u3059\u308B変更(ward_coverage_and_param)\u306E2\u30AB\u30C6\u30B4\u30EA複合指示。","routes":[{"tool_type":"staff_calendar","instruction":"村上\u3055\u3093\u306E8日\u3092確定\u306E公休(O)\u306B固定\u3059\u308B"},{"tool_type":"ward_coverage_and_param","instruction":"病棟全体\u306E最大連勤日数\u30924日\u306B変更\u3059\u308B"}],"response":"村上\u3055\u3093\u306E8日\u3092公休\u306B固定\u3057、最大連勤日数\u30924日\u306B変更\u3057\u307E\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「高木\u3055\u3093\u306F月12日\u307E\u3067\u306E勤務\u3067、毎週月曜\u3068木曜\u3060\u3051出勤\u306B\u3057\u3066」
出力: {"thought":"前半\u306E月12日\u307E\u3067\u306E勤務上限\u306F個人契約(staff_contract)、後半\u306E毎週月曜\u30FB木曜\u306E\u307F出勤\u306F曜日\u30AB\u30EC\u30F3\u30C0\u30FC指定(staff_calendar)\u306E2\u30AB\u30C6\u30B4\u30EA複合指示。","routes":[{"tool_type":"staff_contract","instruction":"高木\u3055\u3093\u306E月間最大勤務日数\u309212日\u307E\u3067\u306B設定\u3059\u308B"},{"tool_type":"staff_calendar","instruction":"高木\u3055\u3093\u3092毎週月曜\u3068木曜\u3060\u3051出勤(W)\u306B設定\u3059\u308B"}],"response":"高木\u3055\u3093\u3092月12日\u307E\u3067\u306E勤務\u3068\u3057、毎週月曜\u3068木曜\u306E\u307F\u306E出勤\u306B設定\u3057\u307E\u3059。"}

\u30E6\u30FC\u30B6\u30FC: 「日勤\u306E開始時間\u30928時30分\u306B変更\u3057\u3066」
出力: {"thought":"\u30B7\u30D5\u30C8\u306E開始\u30FB終了時刻\u306E変更\u306F\u30B7\u30B9\u30C6\u30E0未対応\u306E\u305F\u3081 unsupported \u3068\u3059\u308B。","routes":[{"tool_type":"unsupported"}],"response":"\u30B7\u30D5\u30C8\u306E開始\u30FB終了時刻\u306E変更\u306B\u306F対応\u3057\u3066\u3044\u307E\u305B\u3093。"}

\u30E6\u30FC\u30B6\u30FC: 「来週休\u307E\u305B\u3066」
出力: {"thought":"誰\u306E\u30FB何月何日\u306E休\u307F希望\u304B\u304C不明\u3067履歴\u304B\u3089\u3082特定\u3067\u304D\u306A\u3044\u305F\u3081 clarify \u3067聞\u304D返\u3059。","routes":[{"tool_type":"clarify"}],"response":"\u3069\u306A\u305F\u306E\u30FB何月何日（\u307E\u305F\u306F何日〜何日）\u3092公休\u306B\u3059\u308B\u304B教\u3048\u3066\u3044\u305F\u3060\u3051\u307E\u3059\u304B？"}

\u30E6\u30FC\u30B6\u30FC: 「田中\u3055\u3093\u306F9日\u304B\u308915日\u307E\u3067休\u307E\u305B\u3066\u3042\u3052\u3066。勤務下限\u3082調整\u3057\u3066」
出力: {"thought":"前半\u306F田中\u3055\u3093\u306E9日〜15日\u306E公休指定\u3060\u304C、後半\u306E『勤務下限\u3082調整\u3057\u3066』\u306B具体的\u306A日数\u304C指定\u3055\u308C\u3066\u304A\u3089\u305A履歴\u304B\u3089\u3082特定\u3067\u304D\u306A\u3044。一部\u3060\u3051実行\u305B\u305A clarify \u3067具体的\u306A日数\u3092聞\u304D返\u3059。","routes":[{"tool_type":"clarify"}],"response":"田中\u3055\u3093\u306E9日\u304B\u308915日\u307E\u3067\u306E公休\u3068\u3042\u308F\u305B\u3066設定\u3059\u308B\u305F\u3081、月間最低勤務日数\u3092何日\u306B調整\u3059\u308B\u304B教\u3048\u3066\u3044\u305F\u3060\u3051\u307E\u3059\u304B？"}

（直近\u306E対話履歴\u306B「前回(未適用\u30FB回答待\u3061):「田中\u3055\u3093\u306F9日\u304B\u308915日\u307E\u3067休\u307E\u305B\u3066\u3042\u3052\u3066。勤務下限\u3082調整\u3057\u3066」」\u304C\u3042\u308B状態\u3067）
\u30E6\u30FC\u30B6\u30FC: 「勤務下限\u306F15日」
出力: {"thought":"直前\u306E履歴\u304C未適用\u30FB回答待\u3061\u3067\u3042\u308B\u305F\u3081、保留\u3055\u308C\u3066\u3044\u305F田中\u3055\u3093\u306E9日\u304B\u308915日\u307E\u3067\u306E公休(staff_calendar)\u3068、今回回答\u3055\u308C\u305F月間最低勤務日数15日\u3078\u306E変更(staff_contract)\u3092統合\u3057\u3066両方実行\u3059\u308B。","routes":[{"tool_type":"staff_calendar","instruction":"田中\u3055\u3093\u30929日\u304B\u308915日\u307E\u3067公休(O)\u306B\u3059\u308B"},{"tool_type":"staff_contract","instruction":"田中\u3055\u3093\u306E月間最低勤務日数\u309215日\u306B設定\u3059\u308B"}],"response":"田中\u3055\u3093\u306E9日\u304B\u308915日\u307E\u3067\u3092公休\u306B\u3057、月間最低勤務日数\u309215日\u306B設定\u3057\u307E\u3059。"}`;

/**
 * Helper to build a single tool branch for `anyOf` in Stage 2 schemas.
 * Each tool defines its own strict `required` fields and `properties`, while the `"none"`
 * branch serves as the universal escape hatch with an empty `args: {}` object.
 */
function toolBranch(
  toolName: string,
  argsProperties: Record<string, unknown>,
  requiredArgs: string[] = []
) {
  return {
    type: "object",
    required: ["tool_name", "args"],
    properties: {
      tool_name: { type: "string", enum: [toolName] },
      args: {
        type: "object",
        ...(requiredArgs.length > 0 ? { required: requiredArgs } : {}),
        properties: argsProperties,
      },
    },
  };
}

const NONE_ESCAPE_HATCH_BRANCH = toolBranch("none", {}, []);

/**
 * Turn 2 (Stage 2) Category-Specific Schemas & System Prompts with Few-Shot Examples.
 * Every tool belongs to exactly ONE category schema so there is no cross-category duplication.
 * Each tool enforces its own strict `required` arguments via `anyOf`, with `"none"` as the universal escape hatch.
 */
export const CUSTOM_SHIFT_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [
          toolBranch(
            "add_custom_shift",
            {
              shiftName: { type: "string" },
              shortLabel: { type: "string" },
              baseShift: { type: "string", enum: ["D", "E", "N", "O"] },
            },
            ["shiftName"]
          ),
          toolBranch(
            "add_shift_quota",
            {
              shiftName: { type: "string" },
              attribute: { type: "string" },
              count: { type: "number" },
            },
            ["shiftName", "attribute", "count"]
          ),
          toolBranch(
            "add_shift_prerequisite",
            {
              shiftName: { type: "string" },
              attribute: { type: "string" },
              count: { type: "number" },
            },
            ["shiftName", "attribute", "count"]
          ),
          toolBranch(
            "add_shift_day_restriction",
            {
              shiftName: { type: "string" },
              startDay: { type: "number" },
              endDay: { type: "number" },
              dayRestriction: {
                type: "string",
                enum: ["weekday_only", "weekend_only"],
              },
            },
            ["shiftName"]
          ),
          toolBranch(
            "add_daily_shift_cap",
            {
              shiftName: { type: "string" },
              attribute: { type: "string" },
              boundType: {
                type: "string",
                enum: ["exact", "max", "min"],
              },
              staffCount: { type: "number" },
            },
            ["shiftName", "attribute", "boundType", "staffCount"]
          ),
          toolBranch(
            "allow_prev_month_shift",
            { shiftName: { type: "string" } },
            ["shiftName"]
          ),
          NONE_ESCAPE_HATCH_BRANCH,
        ],
      },
    },
  },
};

export const CUSTOM_SHIFT_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「custom_shift (追加\u30B7\u30D5\u30C8枠\u30FB開催期間/曜日\u30EB\u30FC\u30EB\u30FB1日\u3042\u305F\u308A配置人数\u30FB受講条件)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB既存4\u30B7\u30D5\u30C8（日勤D\u30FB準夜E\u30FB深夜N\u30FB公休O）以外\u306E新\u3057\u3044追加\u30B7\u30D5\u30C8枠（研修\u30FB勉強会\u30FB委員会\u30FB行事\u306A\u3069）\u3068\u305D\u306E実施\u30FB受講条件\u306B厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB他\u30AB\u30C6\u30B4\u30EA\u306E指示\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB対象月\u306F11月\u3067\u3059。「11月X日\u304B\u3089N日間」\u3068記載\u3055\u308C\u3066\u3044\u308B場合、「11」\u306F月番号\u306A\u306E\u3067 startDay \u306B 11 \u3092入\u308C\u305A、必\u305A日番号 X \u3092 startDay、X + N - 1 \u3092 endDay \u306B\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB助数詞（名\u30FB人 vs 回）\u306B\u3088\u308B配置人数\u3068月間\u30CE\u30EB\u30DE\u306E厳密\u306A区別：
  * 人数単位（「名」「人」。「1名」「中堅2名以上」「最大N名」「N名」等）、「1日」言葉省略絶対個人別月間("add_shift_quota")、必1日配置人数("add_daily_shift_cap")抽出（例: 「1名」➔ add_daily_shift_cap(attribute: "leader_cap", boundType: "max", staffCount: 1)）。
  * 回数単位（「回」。「月N回」「1人N回受」「月1回」等）指定、個人別月間("add_shift_quota")抽出。
  * 「N回受夜勤入」夜勤先行条件("add_shift_prerequisite")抽出。
  * 言及推測勝手追加。
\u30FB対象属性(attribute)\u306B\u306F、実行時\u306B注入\u3055\u308C\u308B【指定可能\u306A対象属性】辞書\u306B\u3042\u308B属性\u30B3\u30FC\u30C9\u30FB\u30E9\u30D9\u30EB\u304A\u3088\u3073登録済\u307F\u30B9\u30AD\u30EB名\u3092統一的\u306B指定\u3067\u304D\u307E\u3059。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "add_custom_shift": 新\u3057\u3044追加\u30B7\u30D5\u30C8枠\u3092定義\u3059\u308B
   - 必須引数:
     * shiftName: 追加枠名称（文字列、例: "委員会"）
   - 任意引数:
     * baseShift: 所属基本区分（"D"=日勤帯 | "E"=準夜帯 | "N"=深夜帯 | "O"=公休休暇扱、例: "D", 値: "D"）
   - 引数例: { "shiftName": "委員会", "baseShift": "D" }
2. "add_shift_quota": 対象属性\u306E\u30B9\u30BF\u30C3\u30D51人\u3042\u305F\u308A\u304C、\u305D\u306E追加\u30B7\u30D5\u30C8\u3092月何回取得\u3059\u308B\u304B（個人別\u306E月間回数\u30CE\u30EB\u30DE）\u3092設定\u3059\u308B（※「月N回」「1人N回受\u3051\u308B」\u306A\u3069回数単位\u306E指定専用\u3067\u3059。「N名\u307E\u3067」「N人」\u306A\u3069\u306E人数単位\u306E指定\u306B\u306F絶対\u306B使用\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044）
   - 必須引数:
     * shiftName: 対象追加名（文字列、例: "委員会"）
     * attribute: 対象属性（属性/名、例: "mid", "all"）
     * count: 1人月間取得回数（数値、数値例: 1）
   - 任意引数: \u306A\u3057
   - 引数例: { "shiftName": "委員会", "attribute": "mid", "count": 1 }
3. "add_shift_prerequisite": 対象属性\u306E\u30B9\u30BF\u30C3\u30D5\u304C、\u305D\u306E追加\u30B7\u30D5\u30C8\u3092規定回数受\u3051\u308B\u307E\u3067夜勤（準夜\u30FB深夜）\u306B入\u308C\u306A\u3044先行条件\u3092設定\u3059\u308B
   - 必須引数:
     * shiftName: 対象追加名（文字列、例: "勉強会"）
     * attribute: 対象属性（属性/名、例: "newcomer"）
     * count: 夜勤入前必要受講回数（数値、数値例: 1）
   - 任意引数: \u306A\u3057
   - 引数例: { "shiftName": "勉強会", "attribute": "newcomer", "count": 1 }
4. "add_shift_day_restriction": \u305D\u306E追加\u30B7\u30D5\u30C8\u3092実施\u3067\u304D\u308B開催期間（startDay〜endDay）\u307E\u305F\u306F曜日（dayRestriction）\u3092制限\u3059\u308B（期間\u30FB曜日外\u306E日\u306B\u306F0名\u306B制限\u3055\u308C\u307E\u3059）
   - 必須引数:
     * shiftName: 対象追加名（文字列、例: "委員会"）
     * 期間指定場合 startDay（開始日 1〜30 ※「11月」11日番号） endDay（終了日 1〜30。「X日N日間」 X + N - 1）両方必須
     * 曜日指定場合 dayRestriction（"weekday_only"=平日 | "weekend_only"=土日）必須
   - 引数例: { "shiftName": "委員会", "dayRestriction": "weekday_only" } / { "shiftName": "院内\u30A4\u30D9\u30F3\u30C8", "startDay": 20, "endDay": 22 }
5. "add_daily_shift_cap": \u305D\u306E追加\u30B7\u30D5\u30C8\u306E1日\u3042\u305F\u308A\u306E配置人数\u3068対象属性\u3092設定\u3059\u308B（※「毎日N名」「1日最大N名」\u3060\u3051\u3067\u306A\u304F、「\u30EA\u30FC\u30C0\u30FC\u306F1名\u307E\u3067」「中堅\u306F2名」「新人\u306F2名\u307E\u3067」\u306A\u3069日\u3054\u3068\u306E人数枠\u3092指定\u3059\u308B場合\u3082\u3059\u3079\u3066\u3053\u308C\u3092使用\u3057\u307E\u3059）
   - 必須引数（4項目\u3059\u3079\u3066必須）:
     * shiftName: 対象追加名（文字列、例: "勉強会"）
     * attribute: 対象属性（特定属性指定属性/［例: "leader_cap"］、属性指定 "all"）
     * boundType: 人数指定種別（"exact"=「毎日N名配置」固定人数 | "max"=「1日N名」「N名」「N名以下」上限 | "min"=「毎日N名以上」「最低N名」「N名以上」下限）
     * staffCount: 1日人数（数値 N、例: 2）
   - 任意引数: \u306A\u3057
   - 引数例: { "shiftName": "勉強会", "attribute": "all", "boundType": "max", "staffCount": 2 } / { "shiftName": "院内\u30A4\u30D9\u30F3\u30C8", "attribute": "newcomer", "boundType": "exact", "staffCount": 2 } / { "shiftName": "健康診断", "attribute": "leader_cap", "boundType": "max", "staffCount": 1 }
6. "allow_prev_month_shift": 前月\u307E\u3067\u306B受\u3051\u305F回数\u3082受講実績\u3068\u3057\u3066算入\u3067\u304D\u308B\u3088\u3046\u306B\u3059\u308B
   - 必須引数:
     * shiftName: 対象追加名（文字列、例: "勉強会"）
   - 任意引数: \u306A\u3057
   - 引数例: { "shiftName": "勉強会" }
7. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「『委員会』\u3068\u3044\u3046\u30B7\u30D5\u30C8枠\u3092追加\u3057\u3066。平日\u306E月〜金\u306E\u307F開催\u30671日2名\u307E\u3067\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"委員会","baseShift":"D"}},{"tool_name":"add_shift_day_restriction","args":{"shiftName":"委員会","dayRestriction":"weekday_only"}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"委員会","attribute":"all","boundType":"max","staffCount":2}}]}

指示: 「『院内\u30A4\u30D9\u30F3\u30C8』\u3068\u3044\u3046\u30B7\u30D5\u30C8\u3092追加\u3057\u3066。20日\u304B\u30893日間、毎日新人2名\u3092\u30A2\u30B5\u30A4\u30F3、日勤扱\u3044」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"院内\u30A4\u30D9\u30F3\u30C8","baseShift":"D"}},{"tool_name":"add_shift_day_restriction","args":{"shiftName":"院内\u30A4\u30D9\u30F3\u30C8","startDay":20,"endDay":22}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"院内\u30A4\u30D9\u30F3\u30C8","attribute":"newcomer","boundType":"exact","staffCount":2}}]}

指示: 「『健康診断』\u3068\u3044\u3046\u30B7\u30D5\u30C8\u3092追加\u3057\u3066、\u30EA\u30FC\u30C0\u30FC業務可\u306F1名\u307E\u3067\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"健康診断","baseShift":"D"}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"健康診断","attribute":"leader_cap","boundType":"max","staffCount":1}}]}

指示: 「新\u3057\u3044\u30B9\u30AD\u30EB\u3068\u3057\u3066『透析管理』\u3092追加\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

export const SKILL_AND_PAIR_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [
          toolBranch(
            "add_skill_def",
            {
              skillName: { type: "string" },
              minDay: { type: "number" },
              minEvening: { type: "number" },
              minNight: { type: "number" },
              substitutesFor: { type: "string" },
            },
            ["skillName"]
          ),
          toolBranch(
            "remove_skill_def",
            {
              skillName: { type: "string" },
            },
            ["skillName"]
          ),
          toolBranch(
            "update_nurse_skill",
            {
              target: { type: "string" },
              skillName: { type: "string" },
              action: { type: "string", enum: ["add", "remove"] },
            },
            ["target", "skillName", "action"]
          ),
          toolBranch(
            "add_ng_pair",
            {
              nurseA: { type: "string" },
              nurseB: { type: "string" },
              shifts: {
                type: "array",
                items: { type: "string" },
              },
            },
            ["nurseA", "nurseB"]
          ),
          toolBranch(
            "add_preceptor_pair",
            {
              newcomerNurse: { type: "string" },
              mentorNurse: { type: "string" },
              shifts: {
                type: "array",
                items: { type: "string" },
              },
            },
            ["newcomerNurse", "mentorNurse"]
          ),
          {
            type: "object",
            required: ["tool_name", "args"],
            properties: {
              tool_name: { type: "string", enum: ["set_staffing_rule"] },
              args: {
                anyOf: [
                  {
                    type: "object",
                    required: ["targetShift", "attribute", "minCount"],
                    properties: {
                      targetShift: { type: "string" },
                      attribute: { type: "string" },
                      minCount: { type: "number" },
                      maxCount: { type: "number" },
                    },
                  },
                  {
                    type: "object",
                    required: ["targetShift", "attribute", "maxCount"],
                    properties: {
                      targetShift: { type: "string" },
                      attribute: { type: "string" },
                      maxCount: { type: "number" },
                    },
                  },
                ],
              },
            },
          },
          NONE_ESCAPE_HATCH_BRANCH,
        ],
      },
    },
  },
};

const SKILL_AND_PAIR_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「skill_and_pair (\u30B9\u30AD\u30EB定義\u30FB\u30B7\u30D5\u30C8別\u306E属性配置人数\u30EB\u30FC\u30EB\u30FB\u30B9\u30AD\u30EB付与\u30FB\u30DA\u30A2制約)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB\u30B9\u30AD\u30EB\u30FB資格\u306E定義追加("add_skill_def")/削除("remove_skill_def")、\u30B9\u30BF\u30C3\u30D5\u3084属性\u3078\u306E\u30B9\u30AD\u30EB付与\u30FB解除("update_nurse_skill")、各\u30B7\u30D5\u30C8別\u306E属性配置人数\u30EB\u30FC\u30EB("set_staffing_rule")、\u30DA\u30A2制約("add_ng_pair" / "add_preceptor_pair")\u306B厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB他\u30AB\u30C6\u30B4\u30EA\u306E指示\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB「新\u3057\u3044\u30B9\u30AD\u30EB\u3092追加\u3057\u305F\u3044」「〇〇\u3068\u3044\u3046\u30B9\u30AD\u30EB\u3092定義\u3057、××\u306E代\u308F\u308A\u306B\u306A\u308C\u308B\u3088\u3046\u306B\u3059\u308B」\u306F\u30B9\u30AD\u30EB\u306E新規定義("add_skill_def")\u3067\u3042\u308A、「〇〇\u3055\u3093\u306B\u30B9\u30AD\u30EB\u3092付与\u3059\u308B」("update_nurse_skill")\u3068区別\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB\u30B9\u30BF\u30C3\u30D5属性\u306B\u306F、実行時\u306B注入\u3055\u308C\u308B【指定可能\u306A属性】辞書\u306B\u3042\u308B基本属性\u304A\u3088\u3073登録済\u307F\u30B9\u30AD\u30EB名\u3092統一的\u306B指定\u3067\u304D\u307E\u3059。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "add_skill_def": \u30B7\u30B9\u30C6\u30E0\u306B新\u3057\u3044\u30B9\u30AD\u30EB\u30FB資格\u306E定義自体\u3092新規登録\u3059\u308B
   - 必須引数:
     * skillName: 新規登録資格名称（文字列、例: "感染管理", "救急"）
   - 任意引数:
     * minDay: 日勤(D)毎日最低必要人数（数値、数値例: 1, 値: 0）
     * minEvening: 準夜勤(E)毎日最低必要人数（数値、数値例: 1, 値: 0）
     * minNight: 深夜勤(N)毎日最低必要人数（数値、数値例: 1, 値: 0）
     * substitutesFor: 保持者代替（）既存名（「〇〇代」指示場合指定。文字列、例: "", "救急重症対応", 値: ）
   - 引数例: { "skillName": "救急\u30B5\u30D6", "substitutesFor": "救急\u30FB重症対応" }
2. "remove_skill_def": 既存\u306E\u30B9\u30AD\u30EB定義\u3092\u30B7\u30B9\u30C6\u30E0\u304B\u3089削除\u3059\u308B
   - 必須引数:
     * skillName: 削除名（文字列、例: "人工呼吸器管理"）
   - 任意引数: \u306A\u3057
   - 引数例: { "skillName": "人工呼吸器管理" }
3. "update_nurse_skill": 特定\u306E\u30B9\u30BF\u30C3\u30D5個人\u307E\u305F\u306F属性\u30B0\u30EB\u30FC\u30D7\u306B既存\u30B9\u30AD\u30EB\u3092付与("add")\u307E\u305F\u306F解除("remove")\u3059\u308B
   - 必須引数:
     * target: 対象名/ID属性名（文字列、例: "村上", "中堅", "全員"）
     * skillName: 付与解除名（文字列、例: "感染管理"）
     * action: 操作種別（"add"=付与 | "remove"=解除、例: "add"）
   - 任意引数: \u306A\u3057
   - 引数例: { "target": "村上", "skillName": "感染管理", "action": "add" }
4. "set_staffing_rule": 指定\u30B7\u30D5\u30C8\u306B\u304A\u3051\u308B特定属性\u30B9\u30BF\u30C3\u30D5\u306E1日\u3042\u305F\u308A配置人数\u306E下限(minCount)\u307E\u305F\u306F上限(maxCount)\u3092設定\u3059\u308B
   - 必須引数:
     * targetShift: 対象記号（"D"=日勤, "E"=準夜勤, "N"=深夜勤, "night_both"=準夜勤深夜勤両方, 追加名。例: 日勤 "D"、準夜勤深夜勤両方 "night_both"）
     * attribute: 対象属性名名（【指定可能属性】辞書属性名名、例: "新人", "", "救急重症対応"。※名指定不可）
     * minCount  maxCount 必須:
       - minCount: 「最低N名」「N名以上」\u306E下限人数（数値、例: 2）
       - maxCount: 「N名以下」「配置\u3057\u306A\u3044(0)」\u306E上限人数（数値、例: 0）
   - 引数例: { "targetShift": "D", "attribute": "救急\u30FB重症対応", "minCount": 2 } / { "targetShift": "night_both", "attribute": "\u30EA\u30FC\u30C0\u30FC", "minCount": 1 }
5. "add_ng_pair": 2名\u306E看護師\u304C同\u3058\u30B7\u30D5\u30C8\u306B同時\u306B入\u3089\u306A\u3044\u3088\u3046禁止\u3059\u308B（相性NG\u30DA\u30A2）
   - 必須引数:
     * nurseA: 1人目看護師名ID（文字列、例: "村上"）
     * nurseB: 2人目看護師名ID（文字列、例: "福田"）
   - 任意引数:
     * shifts: 同時勤務禁止記号配列（例: ["D", "E", "N"], 値: ["E", "N"] [夜勤帯]）
   - 引数例: { "nurseA": "村上", "nurseB": "福田", "shifts": ["E", "N"] }
6. "add_preceptor_pair": 新人\u3068指導者\u304C同\u3058\u30B7\u30D5\u30C8\u306B同行\u3059\u308B\u3088\u3046設定\u3059\u308B（\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC\u30DA\u30A2）
   - 必須引数:
     * newcomerNurse: 新人看護師名ID（文字列、例: "N25"）
     * mentorNurse: 指導者看護師名ID（文字列、例: "N01"）
   - 任意引数:
     * shifts: 同行対象記号配列（例: ["E", "N"], 値: ["E", "N"] [夜勤帯]）
   - 引数例: { "newcomerNurse": "N25", "mentorNurse": "N01", "shifts": ["E", "N"] }
7. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「新\u3057\u3044\u30B9\u30AD\u30EB\u3068\u3057\u3066『救急\u30B5\u30D6』\u3092追加\u3057\u3066。救急\u30FB重症対応\u306E代\u308F\u308A\u306B\u306A\u308C\u308B\u3088\u3046\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_skill_def","args":{"skillName":"救急\u30B5\u30D6","substitutesFor":"救急\u30FB重症対応"}}]}

指示: 「村上\u3055\u3093\u306B感染管理\u30B9\u30AD\u30EB\u3092付与\u3057\u3066」
出力: {"tools":[{"tool_name":"update_nurse_skill","args":{"target":"村上","skillName":"感染管理","action":"add"}}]}

指示: 「日勤\u306B\u306F\u30EA\u30FC\u30C0\u30FC\u30922人以上配置\u3057\u3066、準夜勤\u3068深夜勤\u306B\u306F新人\u3092配置\u3057\u306A\u3044\u3088\u3046\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"set_staffing_rule","args":{"targetShift":"D","attribute":"\u30EA\u30FC\u30C0\u30FC","minCount":2}},{"tool_name":"set_staffing_rule","args":{"targetShift":"night_both","attribute":"新人","maxCount":0}}]}

指示: 「『院内勉強会』\u3068\u3044\u3046\u30B7\u30D5\u30C8枠\u3092追加\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_CALENDAR_BRANCHES = [
  toolBranch(
    "add_request_day",
    {
      nurseNameOrId: { type: "string" },
      day: { type: "number" },
      shift: { type: "string" },
      isHard: { type: "boolean" },
    },
    ["nurseNameOrId", "day", "shift", "isHard"]
  ),
  toolBranch(
    "add_request_range",
    {
      nurseNameOrId: { type: "string" },
      startDay: { type: "number" },
      endDay: { type: "number" },
      shift: { type: "string" },
      isHard: { type: "boolean" },
    },
    ["nurseNameOrId", "startDay", "endDay", "shift", "isHard"]
  ),
  toolBranch(
    "add_calendar_request",
    {
      nurseNameOrId: { type: "string" },
      daysOfWeek: {
        type: "array",
        items: {
          type: "string",
          enum: ["日", "月", "火", "水", "木", "金", "土"],
        },
      },
      holidays: {
        type: "string",
        enum: ["include", "exclude", "only"],
      },
      shift: { type: "string" },
      onlyMatchedDaysWork: { type: "boolean" },
    },
    ["nurseNameOrId", "daysOfWeek", "shift"]
  ),
  toolBranch(
    "forbid_shift_day",
    {
      nurseNameOrId: { type: "string" },
      day: { type: "number" },
      shifts: {
        type: "array",
        items: { type: "string" },
      },
    },
    ["nurseNameOrId", "day", "shifts"]
  ),
  toolBranch(
    "forbid_shift_range",
    {
      nurseNameOrId: { type: "string" },
      startDay: { type: "number" },
      endDay: { type: "number" },
      shifts: {
        type: "array",
        items: { type: "string" },
      },
    },
    ["nurseNameOrId", "startDay", "endDay", "shifts"]
  ),
];

const SET_NURSE_CONTRACT_BRANCH = {
  type: "object",
  required: ["tool_name", "args"],
  properties: {
    tool_name: { type: "string", enum: ["set_nurse_contract"] },
    args: {
      anyOf: [
        {
          type: "object",
          required: ["nurseNameOrId", "item", "value"],
          properties: {
            nurseNameOrId: { type: "string" },
            item: {
              type: "string",
              enum: [
                "maxWorkDays",
                "minWorkDays",
                "minDaysOff",
                "maxConsecutiveDays",
                "maxNight",
              ],
            },
            value: { type: "number" },
          },
        },
        {
          type: "object",
          required: ["nurseNameOrId", "item"],
          properties: {
            nurseNameOrId: { type: "string" },
            item: {
              type: "string",
              enum: [
                "日勤専従",
                "夜勤専従",
                "深夜勤免除",
                "準夜勤免除",
                "土日休\u307F",
                "土日祝休\u307F",
                "制限解除",
              ],
            },
          },
        },
      ],
    },
  },
};

export const STAFF_CALENDAR_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [...STAFF_CALENDAR_BRANCHES, NONE_ESCAPE_HATCH_BRANCH],
      },
    },
  },
};

export const STAFF_CONTRACT_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [SET_NURSE_CONTRACT_BRANCH, NONE_ESCAPE_HATCH_BRANCH],
      },
    },
  },
};

const STAFF_CALENDAR_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「staff_calendar (特定\u30B9\u30BF\u30C3\u30D5個人\u306E日付\u30FB期間\u30FB曜日/祝日\u30AB\u30EC\u30F3\u30C0\u30FC希望\u30FB固定\u30FB禁止)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB特定\u30B9\u30BF\u30C3\u30D5個人\u306E単日(day)\u30FB複数日期間(startDay〜endDay)\u30FB曜日/祝日\u306B\u304A\u3051\u308B\u30B7\u30D5\u30C8希望\u30FB固定\u30FB特定日\u306E\u30B7\u30D5\u30C8禁止\u306B厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB日付\u30FB曜日\u30FB祝日\u306E指定\u304C\u306A\u3044月間契約条件（月間勤務日数、月間夜勤上限、日勤専従\u306A\u3069）\u3084他\u30AB\u30C6\u30B4\u30EA\u306E指示\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB対象月\u306F11月(1日〜30日)\u3067\u3059。1日\u3060\u3051\u306E指定\u306B\u306F単日用("add_request_day" / "forbid_shift_day")、「〇日\u307E\u3067」「〇日\u304B\u3089△日\u307E\u3067」「〇日以降」\u306E期間指定\u306B\u306F必\u305A期間用("add_request_range" / "forbid_shift_range")、「毎週〇曜」「〇曜\u3068△曜\u3060\u3051出勤」「祝日」\u306E\u30D1\u30BF\u30FC\u30F3指定\u306B\u306F "add_calendar_request" \u3092使用\u3057\u307E\u3059。
\u30FB公休（休\u307F\u30FB療養\u30FB動\u3051\u306A\u3044等）\u306B\u3059\u308B場合\u306F、単日\u306A\u3089 "add_request_day"(shift: "O")、期間（「〇日\u307E\u3067休\u307F」「〇日〜△日休\u307F」）\u306A\u3089 "add_request_range"(shift: "O") \u3092使用\u3057\u3066\u304F\u3060\u3055\u3044（"forbid_shift_day" / "forbid_shift_range" \u306F夜勤等\u306E勤務\u30B7\u30D5\u30C8禁止専用\u3067\u3059）。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "add_request_day": 特定\u306E看護師\u306E単日（1日\u3060\u3051）\u3092指定\u30B7\u30D5\u30C8\u306B確定固定(isHard: true)\u307E\u305F\u306F\u30BD\u30D5\u30C8希望(isHard: false)\u3068\u3057\u3066設定\u3059\u308B（※「〇日\u307E\u3067」「1日〜〇日」等\u306E複数日期間\u306B\u306F使\u308F\u305A必\u305A "add_request_range" \u3092使\u3046\u3053\u3068）
   - 必須引数:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "村上", "N18"）
     * day: 対象日（数値 1〜30、数値例: 8）
     * shift: 指定記号（"O"=公休[休], "W"=勤務[任出勤], "D"=日勤, "EN"=夜勤帯, "E"=準夜勤, "N"=深夜勤, 追加名、例: "O"）
     * isHard: 確定固定条件 true、「」等希望 false（真偽値、例: true, 値: true）
   - 任意引数: \u306A\u3057
   - 引数例: { "nurseNameOrId": "村上", "day": 8, "shift": "O", "isHard": true }
2. "add_request_range": 特定\u306E看護師\u306E複数日\u306E期間（開始日 startDay 〜 終了日 endDay、「〇日\u307E\u3067」「1日\u304B\u3089〇日\u307E\u3067」「〇日以降」）\u3092指定\u30B7\u30D5\u30C8\u306B一括\u3067固定\u307E\u305F\u306F希望設定\u3059\u308B
   - 必須引数（5項目\u3059\u3079\u3066必須）:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "村上"）
     * startDay: 期間開始日（数値 1〜30。「〇日休」開始日省略場合必月初 1 指定、数値例: 1）
     * endDay: 期間終了日（数値 1〜30。「〇日以降休」終了日省略場合必月末 30 指定、数値例: 10）
     * shift: 期間中設定記号（"O"=公休[休], "W"=勤務, "D"=日勤 等、例: "O"）
     * isHard: 確定固定 true、希望 false（真偽値、例: true, 値: true）
   - 任意引数: \u306A\u3057
   - 引数例: { "nurseNameOrId": "村上", "startDay": 1, "endDay": 10, "shift": "O", "isHard": true } / { "nurseNameOrId": "村上", "startDay": 6, "endDay": 10, "shift": "O", "isHard": true }
3. "add_calendar_request": 特定\u306E看護師\u306E曜日（日〜土）\u307E\u305F\u306F祝日\u306E\u30B7\u30D5\u30C8\u3092一括\u3067固定\u30FB指定\u3059\u308B
   - 必須引数:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "高木"）
     * daysOfWeek: 対象曜日配列（"日","月","火","水","木","金","土" 選択、祝日対象 []、例: ["月", "木"], 値: []）
     * shift: 該当日設定記号（"O"=公休[休], "W"=勤務[出勤], "D"=日勤, "EN"=夜勤帯 等、例: "W"）
   - 任意引数:
     * holidays: 祝日扱（"include"=指定曜日祝日両方含 | "exclude"=指定曜日祝日除外 | "only"=祝日対象、例: "include", 値: 曜日指定場合省略）
     * onlyMatchedDaysWork: 指定曜日祝日以外日公休("O")固定（「毎週〇曜△曜出勤」「〇曜日勤務」指定曜日以外出勤禁止場合 true、単対象曜日休出勤 false、真偽値、例: true, 値: false）
   - 引数例: { "nurseNameOrId": "高木", "daysOfWeek": ["月", "木"], "shift": "W", "onlyMatchedDaysWork": true }
4. "forbid_shift_day": 特定\u306E看護師\u306E単日（1日\u3060\u3051）\u306B\u304A\u3044\u3066、特定\u306E勤務\u30B7\u30D5\u30C8（夜勤\u3084日勤\u306A\u3069）\u3078\u306E配置\u3092禁止\u3059\u308B（※公休O\u306B\u3059\u308B場合\u306F "add_request_day" \u3092使\u3046\u3053\u3068）
   - 必須引数（3項目\u3059\u3079\u3066必須）:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "原田"）
     * day: 対象日（数値 1〜30、数値例: 19）
     * shifts: 禁止勤務記号配列（"D", "E", "N" 等、夜勤禁止 ["E", "N"]）
   - 任意引数: \u306A\u3057
   - 引数例: { "nurseNameOrId": "原田", "day": 19, "shifts": ["E", "N"] }
5. "forbid_shift_range": 特定\u306E看護師\u306E複数日\u306E期間（開始日〜終了日）\u306B\u304A\u3044\u3066、特定\u306E勤務\u30B7\u30D5\u30C8（夜勤\u306A\u3069）\u3078\u306E配置\u3092禁止\u3059\u308B（※期間中\u305A\u3063\u3068公休O\u306B\u3059\u308B場合\u306F "add_request_range" \u3092使\u3046\u3053\u3068）
   - 必須引数（4項目\u3059\u3079\u3066必須）:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "原田"）
     * startDay: 期間開始日（数値 1〜30、省略時 1、数値例: 19）
     * endDay: 期間終了日（数値 1〜30、省略時 30、数値例: 23）
     * shifts: 禁止勤務記号配列（夜勤禁止 ["E", "N"]）
   - 任意引数: \u306A\u3057
   - 引数例: { "nurseNameOrId": "原田", "startDay": 19, "endDay": 23, "shifts": ["E", "N"] }
6. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「村上\u3055\u3093\u306E8日\u3092確定\u306E休\u307F(O)\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_request_day","args":{"nurseNameOrId":"村上","day":8,"shift":"O","isHard":true}}]}

指示: 「村上\u3055\u3093\u306F10日\u307E\u3067動\u3051\u306A\u3044\u306E\u3067休\u307F\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"村上","startDay":1,"endDay":10,"shift":"O","isHard":true}}]}

指示: 「高木\u3055\u3093\u306F毎週月曜\u3068木曜\u3060\u3051出勤\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"add_calendar_request","args":{"nurseNameOrId":"高木","daysOfWeek":["月","木"],"shift":"W","onlyMatchedDaysWork":true}}]}

指示: 「西村\u3055\u3093\u3092日勤専従\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_CONTRACT_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「staff_contract (特定\u30B9\u30BF\u30C3\u30D5個人\u306E働\u304D方契約\u30FB\u30B7\u30D5\u30C8免除\u30FB月間日数/夜勤回数/個人連勤\u306E上限\u30FB下限)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB特定\u30B9\u30BF\u30C3\u30D5個人\u306E月間契約条件\u30FB\u30B7\u30D5\u30C8免除\u30FB月間日数\u3084夜勤回数\u306E上限/下限\u306B厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB特定\u306E日付\u3084曜日\u306E指定、病棟全体\u306E\u30EB\u30FC\u30EB変更\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB「勤務日数（働\u304F日数）」\u3068「公休日数（休\u3080日数）」\u3092混同\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044：
  * 勤務日数上限（「月N日勤務」「月N日以下勤務」）➔ item: "maxWorkDays"
  * 勤務日数下限（「月間最小勤務日数N日」「最低勤務日数0日」）➔ item: "minWorkDays"
  * 公休日数下限（「月N日以上休」「最低公休日数N日」）➔ item: "minDaysOff"

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "set_nurse_contract": 特定\u306E看護師個人\u306E月間\u3092通\u3058\u305F働\u304D方契約\u30FB個人別数値条件\u3092変更\u3059\u308B
   - 必須引数:
     * nurseNameOrId: 対象看護師氏名ID（文字列、例: "西村", "N15"）
     * item: 変更契約項目（以下数値項目5種契約7種1選択）
       - "maxWorkDays": 月間最大【勤務】日数\u306E上限（「月N日\u307E\u3067\u306E勤務」「月N日以下」\u306E制限。value 数値例: 10, \u30C7\u30D5\u30A9\u30EB\u30C8値: 個別上限\u306A\u3057）
       - "minWorkDays": 月間最低【勤務】日数\u306E下限（「月間最小勤務日数\u3092N日\u306B」「月N日以上勤務」、最低勤務日数\u306E免除\u30FB\u30BC\u30ED化\u306A\u3089 0。value 数値例: 0, \u30C7\u30D5\u30A9\u30EB\u30C8値: 病棟全体\u306E最低勤務日数14日）
       - "minDaysOff": 月間最低【公休（休\u307F）】日数\u306E下限（「月N日以上休\u307F」「最低公休\u3092N日\u306B」。value 数値例: 12, \u30C7\u30D5\u30A9\u30EB\u30C8値: 病棟全体\u306E最低公休日数9日）
       - "maxConsecutiveDays": 個人別\u306E最大連続勤務日数\u306E上限（「N連勤\u307E\u3067」。value 数値例: 3, \u30C7\u30D5\u30A9\u30EB\u30C8値: 病棟全体\u306E最大連勤日数5日）
       - "maxNight": 個人別\u306E月間夜勤回数\u306E上限（「月N回\u307E\u3067\u306E夜勤」。value 数値例: 4, \u30C7\u30D5\u30A9\u30EB\u30C8値: 病棟全体\u306E月間夜勤上限8回）
       - "日勤専従": 日勤\u306E\u307F勤務（準夜\u30FB深夜免除、value 不要）
       - "夜勤専従": 夜勤\u306E\u307F勤務（日勤免除、value 不要）
       - "深夜勤免除": 深夜勤(N)\u306E\u307F免除（value 不要）
       - "準夜勤免除": 準夜勤(E)\u306E\u307F免除（value 不要）
       - "土日休\u307F": 平日\u306E\u307F勤務契約\u30FB土日公休固定（value 不要）
       - "土日祝休\u307F": 土日\u304A\u3088\u3073祝日公休固定契約（value 不要）
       - "制限解除": \u30B7\u30D5\u30C8免除\u3084個人日数制限\u3092解除\u3057\u3066標準契約\u306B戻\u3059（value 不要）
   - 任意引数:
     * value: 数値項目（"maxWorkDays" | "minWorkDays" | "minDaysOff" | "maxConsecutiveDays" | "maxNight"）選択場合設定数値（数値、数値例: 10, 値: 選択時不要）
   - 引数例: { "nurseNameOrId": "西村", "item": "maxWorkDays", "value": 12 } / { "nurseNameOrId": "西村", "item": "minWorkDays", "value": 0 } / { "nurseNameOrId": "西村", "item": "日勤専従" }
2. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「西村\u3055\u3093\u3092日勤専従\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"日勤専従"}}]}

指示: 「西村\u3055\u3093\u306F月12日\u307E\u3067\u306E勤務\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"maxWorkDays","value":12}}]}

指示: 「西村\u3055\u3093\u306E月間最低勤務日数\u30928日\u306B変更\u3057\u3066」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"minWorkDays","value":8}}]}

指示: 「村上\u3055\u3093\u306E8日\u3092確定\u306E休\u307F\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const WARD_COVERAGE_AND_PARAM_BRANCHES = [
  toolBranch(
    "set_param",
    {
      paramName: {
        type: "string",
        enum: [
          "weekdayDayStaff",
          "weekendDayStaff",
          "eveningStaff",
          "nightStaff",
          "maxConsecutiveWorkDays",
          "minMonthlyDaysOff",
          "minMonthlyWorkDays",
          "maxMonthlyNightShifts",
          "maxMonthlyOvertimeHours",
          "maxAnnualOvertimeHours",
        ],
      },
      paramValue: { type: "number" },
    },
    ["paramName", "paramValue"]
  ),
  toolBranch(
    "level_night_shifts",
    {
      groupBy: {
        type: "string",
        enum: ["skill", "all"],
      },
    },
    ["groupBy"]
  ),
  toolBranch(
    "add_date_coverage",
    {
      day: { type: "number" },
      shift: {
        type: "string",
        enum: ["D", "E", "N"],
      },
      minStaff: { type: "number" },
    },
    ["day", "shift", "minStaff"]
  ),
];

const WARD_TRANSITION_AND_RULE_BRANCHES = [
  toolBranch(
    "toggle_rule",
    {
      ruleName: {
        type: "string",
        enum: [
          "requireWeekendOff",
          "enforcePreceptorPairs",
          "enforcePrevMonthCarryover",
          "enforce36Agreement",
          "preserveCurrentSchedule",
        ],
      },
      ruleEnabled: { type: "boolean" },
    },
    ["ruleName", "ruleEnabled"]
  ),
  toolBranch(
    "set_shift_transition",
    {
      fromShift: {
        type: "string",
        enum: ["D", "E", "N"],
      },
      toShift: {
        type: "string",
        enum: ["D", "E", "N", "O"],
      },
      policy: {
        type: "string",
        enum: ["forbid", "allow", "require"],
      },
    },
    ["fromShift", "toShift", "policy"]
  ),
];

export const WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [...WARD_COVERAGE_AND_PARAM_BRANCHES, NONE_ESCAPE_HATCH_BRANCH],
      },
    },
  },
};

export const WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [...WARD_TRANSITION_AND_RULE_BRANCHES, NONE_ESCAPE_HATCH_BRANCH],
      },
    },
  },
};

const WARD_COVERAGE_AND_PARAM_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「ward_coverage_and_param (病棟全体\u306E数値\u30D1\u30E9\u30E1\u30FC\u30BF\u30FB必要人数\u30FB特定日\u306E人数変更\u30FB夜勤回数\u306E平準化)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB病棟全体\u306E数値\u30D1\u30E9\u30E1\u30FC\u30BF\u30FB特定日\u306E必要人数変更\u30FB夜勤平準化\u306B厳密\u306B合致\u3057、\u30E6\u30FC\u30B6\u30FC\u304C明示的\u306B指示\u3057\u305F項目\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB個人別\u306E\u30B7\u30D5\u30C8\u3084契約変更、2日間\u306E\u30B7\u30D5\u30C8遷移\u30EB\u30FC\u30EB、特定属性\u3084\u30B9\u30AD\u30EB別\u306E人数指定\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "set_param": 病棟全体\u306E基本数値\u30D1\u30E9\u30E1\u30FC\u30BF\u3092変更\u3059\u308B
   - 必須引数:
     * paramName: 変更名（以下1選択）
       - "maxConsecutiveWorkDays": 最大連勤日数（数値例: 4, \u30C7\u30D5\u30A9\u30EB\u30C8値: 5）
       - "minMonthlyDaysOff": 月間最低公休日数（数値例: 10, \u30C7\u30D5\u30A9\u30EB\u30C8値: 9）
       - "minMonthlyWorkDays": 月間最低勤務日数（数値例: 14, \u30C7\u30D5\u30A9\u30EB\u30C8値: 14）
       - "maxMonthlyNightShifts": 月間夜勤回数上限（数値例: 6, \u30C7\u30D5\u30A9\u30EB\u30C8値: 8）
       - "weekdayDayStaff": 平日日勤\u306E必要人数（数値例: 12, \u30C7\u30D5\u30A9\u30EB\u30C8値: 10）
       - "weekendDayStaff": 土日日勤\u306E必要人数（数値例: 7, \u30C7\u30D5\u30A9\u30EB\u30C8値: 6）
       - "eveningStaff": 準夜勤\u306E必要人数（数値例: 4, \u30C7\u30D5\u30A9\u30EB\u30C8値: 4）
       - "nightStaff": 深夜勤\u306E必要人数（数値例: 4, \u30C7\u30D5\u30A9\u30EB\u30C8値: 4）
       - "maxAnnualOvertimeHours": 36協定\u306E年間時間外（残業）上限時間（数値例: 300, \u30C7\u30D5\u30A9\u30EB\u30C8値: 360）
       - "maxMonthlyOvertimeHours": 36協定\u306E月間時間外（残業）上限時間（数値例: 40, \u30C7\u30D5\u30A9\u30EB\u30C8値: 45）
     * paramValue: 設定数値（数値、数値例: 4）
   - 任意引数: \u306A\u3057
   - 引数例: { "paramName": "maxConsecutiveWorkDays", "paramValue": 4 }
2. "level_night_shifts": \u30B9\u30AD\u30EB\u30FB属性\u3054\u3068\u306B月間\u306E夜勤回数(準夜\u30FB深夜)\u3092平準化（均等化）\u3059\u308B
   - 必須引数:
     * groupBy: 平準化単位（"skill"=属性 | "all"=全員一律、例: "skill", 値: "skill"）
   - 任意引数: \u306A\u3057
   - 引数例: { "groupBy": "skill" }
3. "add_date_coverage": 特定\u306E\u30AB\u30EC\u30F3\u30C0\u30FC日付(day=1〜30)\u306B\u304A\u3051\u308B病棟全体\u306E必要人数(minStaff名以上)\u3092変更\u3059\u308B
   - 必須引数:
     * day: 対象日（数値 1〜30、数値例: 15）
     * shift: 対象（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤、例: "D"）
     * minStaff: 日最低必要人数（数値、数値例: 12）
   - 任意引数: \u306A\u3057
   - 引数例: { "day": 15, "shift": "D", "minStaff": 12 }
4. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「病棟全体\u306E最大連勤\u30924日\u306B変更\u3057\u3066」
出力: {"tools":[{"tool_name":"set_param","args":{"paramName":"maxConsecutiveWorkDays","paramValue":4}}]}

指示: 「準夜勤\u306E翌日\u306B日勤\u3092入\u308C\u308B\u30B7\u30D5\u30C8並\u3073\u3092禁止\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const WARD_TRANSITION_AND_RULE_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「ward_transition_and_rule (病棟全体\u306E\u30B7\u30D5\u30C8遷移\u30DE\u30C8\u30EA\u30AF\u30B9\u30FB2日間\u306E並\u3073順禁止/必須\u30FB全体\u30EB\u30FC\u30EBON/OFF)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB2日間\u306E\u30B7\u30D5\u30C8並\u3073順（前日➔翌日\u306E禁止\u30FB許可\u30FB必須）\u306B\u306F "set_shift_transition"、病棟全体\u30EB\u30FC\u30EB\u306EON/OFF\u306B\u306F "toggle_rule" \u3092使用\u3057、厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB数値\u30D1\u30E9\u30E1\u30FC\u30BF\u306E変更\u3084個人別\u306E指示\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "set_shift_transition": 2日間\u306E\u30B7\u30D5\u30C8並\u3073順（前日 fromShift ➔ 翌日 toShift）\u3092禁止("forbid")\u30FB許可("allow")\u30FB必須("require")\u306B設定\u3059\u308B
   - 必須引数:
     * fromShift: 前日記号（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤、例: "E"）
     * toShift: 翌日記号（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤 | "O"=公休、例: "D"）
     * policy: 遷移（"forbid"=禁止 | "allow"=許可 | "require"=必須［例: 深夜勤翌日必公休場合 fromShift:"N", toShift:"O", policy:"require"］、例: "forbid"）
   - 任意引数: \u306A\u3057
   - 引数例: { "fromShift": "E", "toShift": "D", "policy": "forbid" } / { "fromShift": "N", "toShift": "O", "policy": "require" }
2. "toggle_rule": 病棟全体\u30EB\u30FC\u30EB\u3092有効(true)\u307E\u305F\u306F無効(false)\u306B切\u308A替\u3048\u308B
   - 必須引数:
     * ruleName: 切替名（以下1選択）
       - "requireWeekendOff": 週末公休\u306E確保\u30EB\u30FC\u30EB（\u30C7\u30D5\u30A9\u30EB\u30C8値: true）
       - "enforcePreceptorPairs": \u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤\u30EB\u30FC\u30EB（\u30C7\u30D5\u30A9\u30EB\u30C8値: false）
       - "enforcePrevMonthCarryover": 前月末\u30B7\u30D5\u30C8\u304B\u3089\u306E連続性引\u304D継\u304E\u30EB\u30FC\u30EB（\u30C7\u30D5\u30A9\u30EB\u30C8値: true）
       - "enforce36Agreement": 36協定（残業時間上限）\u306E遵守\u30EB\u30FC\u30EB（\u30C7\u30D5\u30A9\u30EB\u30C8値: true）
       - "preserveCurrentSchedule": 微調整\u30E2\u30FC\u30C9\u30FB既存\u30B7\u30D5\u30C8表\u304B\u3089\u306E変更最小化（\u30C7\u30D5\u30A9\u30EB\u30C8値: true）
     * ruleEnabled: 有効化 true、無効化 false（真偽値、例: true）
   - 任意引数: \u306A\u3057
   - 引数例: { "ruleName": "enforcePreceptorPairs", "ruleEnabled": true }
3. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「準夜勤\u306E翌日\u306B日勤\u3092入\u308C\u308B\u30B7\u30D5\u30C8並\u3073\u3092禁止\u3057\u3066」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"E","toShift":"D","policy":"forbid"}}]}

指示: 「深夜勤\u306E翌日\u306F必\u305A休\u307F\u306B\u3059\u308B\u30EB\u30FC\u30EB\u3092有効\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"N","toShift":"O","policy":"require"}}]}

指示: 「\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤\u30EB\u30FC\u30EB\u3092有効\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"enforcePreceptorPairs","ruleEnabled":true}}]}

指示: 「病棟全体\u306E最大連勤\u30924日\u306B変更\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

export const SYSTEM_ACTION_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        anyOf: [
          toolBranch("clear_custom_rules", {}, []),
          toolBranch("reset_default", {}, []),
          toolBranch("inject_conflict_demo", {}, []),
          toolBranch("diagnose_conflict", {}, []),
          toolBranch("solve_only", {}, []),
          NONE_ESCAPE_HATCH_BRANCH,
        ],
      },
    },
  },
};

const SYSTEM_ACTION_STAGE2_PROMPT = `\u3042\u306A\u305F\u306F「system_action (\u30EB\u30FC\u30EB全\u30AF\u30EA\u30A2\u30FB初期状態\u30EA\u30BB\u30C3\u30C8\u30FB矛盾\u30C7\u30E2注入\u30FB矛盾診断\u30FB再計算)」専用\u306E\u30C4\u30FC\u30EB抽出AI (Turn 2) \u3067\u3059。
\u30E6\u30FC\u30B6\u30FC\u306E指示\u304B\u3089、\u3053\u306E\u30AB\u30C6\u30B4\u30EA\u306B該当\u3059\u308B\u30C4\u30FC\u30EB(tool_name)\u3068引数(args)\u306E\u30EA\u30B9\u30C8\u3092JSON\u3067出力\u3057\u3066\u304F\u3060\u3055\u3044。

【基本\u30EB\u30FC\u30EB】
\u30FB\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB\u306E全\u30AF\u30EA\u30A2\u30FB初期設定\u3078\u306E\u30EA\u30BB\u30C3\u30C8\u30FB矛盾\u30C7\u30E2注入\u30FB矛盾診断\u30FB\u30B7\u30D5\u30C8再最適化\u306B厳密\u306B合致\u3059\u308B指示\u306E\u307F\u3092抽出\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB他\u30AB\u30C6\u30B4\u30EA\u306E指示\u306F無視\u3057、該当\u3059\u308B操作\u304C1\u3064\u3082\u306A\u3051\u308C\u3070必\u305A "none" \u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。

【\u30C4\u30FC\u30EB一覧（各引数\u306E意味\u30FB数値例\u30FB\u30C7\u30D5\u30A9\u30EB\u30C8値）】
1. "clear_custom_rules": 追加\u3057\u305F\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB\u304A\u3088\u3073追加\u30B7\u30D5\u30C8枠\u3092\u3059\u3079\u3066解除\u3059\u308B
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}
2. "reset_default": \u3059\u3079\u3066\u306E設定\u3092初期状態\u306B\u30EA\u30BB\u30C3\u30C8\u3059\u308B
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}
3. "inject_conflict_demo": 矛盾\u30C7\u30E2\u30B7\u30CA\u30EA\u30AA\u3092注入\u3059\u308B
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}
4. "diagnose_conflict": 矛盾\u30C1\u30A7\u30C3\u30AF\u30FB\u30B7\u30D5\u30C8\u304C組\u3081\u306A\u3044原因\u306E診断\u3092行\u3046
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}
5. "solve_only": 条件\u3092変\u3048\u305A\u306B\u30B7\u30D5\u30C8\u3092再最適化\u3059\u308B
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}
6. "none": 上記\u30C4\u30FC\u30EB\u306E定義\u306B合致\u3057\u306A\u3044場合
   - 必須引数: \u306A\u3057 / 任意引数: \u306A\u3057 / 引数例: {}

【Few-shot 例】
指示: 「追加\u3057\u305F\u30AB\u30B9\u30BF\u30E0制約\u3092\u3059\u3079\u3066\u30AF\u30EA\u30A2\u3057\u3066」
出力: {"tools":[{"tool_name":"clear_custom_rules","args":{}}]}

指示: 「初期設定\u306B\u30EA\u30BB\u30C3\u30C8\u3057\u3066」
出力: {"tools":[{"tool_name":"reset_default","args":{}}]}

指示: 「矛盾\u3092\u30C1\u30A7\u30C3\u30AF\u3057\u3066」
出力: {"tools":[{"tool_name":"diagnose_conflict","args":{}}]}

指示: 「今\u306E条件\u3067再計算\u3057\u3066」
出力: {"tools":[{"tool_name":"solve_only","args":{}}]}

指示: 「村上\u3055\u3093\u306E8日\u3092休\u307F\u306B\u3057\u3066」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAGE2_CATEGORY_CONFIGS: Record<
  ExecutableToolCategory,
  { schema: Record<string, any>; systemPrompt: string }
> = {
  staff_calendar: {
    schema: STAFF_CALENDAR_TOOLS_SCHEMA,
    systemPrompt: STAFF_CALENDAR_STAGE2_PROMPT,
  },
  staff_contract: {
    schema: STAFF_CONTRACT_TOOLS_SCHEMA,
    systemPrompt: STAFF_CONTRACT_STAGE2_PROMPT,
  },
  ward_coverage_and_param: {
    schema: WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA,
    systemPrompt: WARD_COVERAGE_AND_PARAM_STAGE2_PROMPT,
  },
  ward_transition_and_rule: {
    schema: WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
    systemPrompt: WARD_TRANSITION_AND_RULE_STAGE2_PROMPT,
  },
  custom_shift: {
    schema: CUSTOM_SHIFT_TOOLS_SCHEMA,
    systemPrompt: CUSTOM_SHIFT_STAGE2_PROMPT,
  },
  skill_and_pair: {
    schema: SKILL_AND_PAIR_TOOLS_SCHEMA,
    systemPrompt: SKILL_AND_PAIR_STAGE2_PROMPT,
  },
  system_action: {
    schema: SYSTEM_ACTION_TOOLS_SCHEMA,
    systemPrompt: SYSTEM_ACTION_STAGE2_PROMPT,
  },
};

/**
 * Builds a concise, category-specific dynamic dictionary (active shifts, shift aliases, custom shifts,
 * default attributes + registered skills, and matched nurse profiles) to inject into Turn 2 prompts so Gemini Nano has
 * exact domain context without polluting the static system prompt.
 */
export function buildCategoryDynamicDictionary(
  category: ExecutableToolCategory,
  state: NurseSchedulingState,
  instruction = ""
): string {
  const aliases = state.shiftAliases ?? createDefaultShiftAliases();
  const customShifts = state.customShiftDefs ?? [];
  const skills = state.skillDefs ?? createDefaultSkillDefs();

  const defaultAttributeSummary = `指定可能\u306A属性\u30FB\u30B9\u30AD\u30EB: ${ALL_STAFF_ATTRIBUTE_DEF.label}(${ALL_STAFF_ATTRIBUTE_DEF.code}), ${skills
    .map((s) => `${s.label}(${s.code})`)
    .join(", ")}`;

  const shiftEntries = [
    `O:公休`,
    `W:勤務(全出勤\u304A任\u305B)`,
    `D:日勤`,
    `EN:夜勤(準夜\u30FB深夜)`,
    `E:準夜勤`,
    `N:深夜勤`,
    ...customShifts.map((cs) => `${cs.code}:${cs.label}(${cs.shortLabel})`),
    ...aliases
      .filter((a) => !a.builtIn)
      .map((a) => `${a.code}:${a.label}(${a.shortLabel}=[${a.shifts.join("|")}])`),
  ];

  const matchedNurses = state.nurses.filter((n) => {
    const family = n.name.split(" ")[0] ?? "";
    const noSpace = n.name.replace(/\s+/g, "");
    return (
      instruction.includes(n.id) ||
      (family && instruction.includes(family)) ||
      (noSpace && instruction.includes(noSpace))
    );
  });
  const nurseLine =
    matchedNurses.length > 0
      ? `対象\u30B9\u30BF\u30C3\u30D5候補: ${matchedNurses
          .map((n) => {
            const roleSkill =
              skills.find((s) => s.category === "role" && n.skills.includes(s.code))?.label ??
              "一般";
            return `${n.id}:${n.name}(${roleSkill})`;
          })
          .join(", ")}`
      : "";

  if (category === "staff_calendar" || category === "staff_contract") {
    const presetLine =
      category === "staff_contract"
        ? `契約\u30D7\u30EA\u30BB\u30C3\u30C8: ${CONTRACT_PRESETS.map((p) => p.label).join(" / ")}`
        : "";
    return [
      `【利用可能\u306A\u30B7\u30D5\u30C8\u30FB\u30B7\u30D5\u30C8\u30A8\u30A4\u30EA\u30A2\u30B9辞書】 ${shiftEntries.join(", ")}`,
      presetLine,
      nurseLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (category === "skill_and_pair") {
    const targetShiftEntries = [
      `D:日勤`,
      `E:準夜勤`,
      `N:深夜勤`,
      `night_both:夜勤両方`,
      ...customShifts.map((cs) => `${cs.code}:${cs.label}(${cs.shortLabel})`),
    ];
    return [
      `【対象\u30B7\u30D5\u30C8記号(targetShift)】 ${targetShiftEntries.join(", ")}`,
      `【指定可能\u306A属性(attribute / target)】 ${defaultAttributeSummary}`,
      nurseLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (category === "custom_shift") {
    const shiftDict =
      customShifts.length > 0
        ? `【登録済\u307F追加\u30B7\u30D5\u30C8辞書】 ${customShifts
            .map((cs) => `${cs.label}(${cs.shortLabel}, 所属:${cs.baseShift ?? "D"})`)
            .join(", ")}`
        : `【登録済\u307F追加\u30B7\u30D5\u30C8辞書】 \u306A\u3057`;
    return [shiftDict, `【指定可能\u306A対象属性(attribute)】 ${defaultAttributeSummary}`].join("\n");
  }

  return "";
}

/**
 * Step 3 of the 5-step pipeline (`Turn 1` -> `Turn 2` -> `Verification` -> `Optimization` -> `Summarize`):
 * Verifies whether the extracted operations and applied state changes fulfill the planned routes.
 */
export function verifyExecutionAgainstRequest(params: {
  userMessage: string;
  routes: ReadonlyArray<{ category: ExecutableToolCategory; instruction: string }>;
  operations: readonly ChatConstraintOperation[];
  state: NurseSchedulingState;
  repairedRoutes?: readonly string[];
  missingRoutes?: readonly string[];
  appliedLogs?: readonly string[];
}): ExecutionVerificationResult {
  const { routes, operations, state } = params;
  const repairedRoutes = [...(params.repairedRoutes ?? [])];
  const appliedLogs =
    params.appliedLogs ?? applyChatOperationsToState(state, operations).appliedLogs;

  const missingRoutes: string[] = [...(params.missingRoutes ?? [])];
  if (routes.length > 0 && (operations.length === 0 || appliedLogs.length === 0) && missingRoutes.length === 0) {
    for (const r of routes) {
      missingRoutes.push(`${r.category}("${r.instruction}")`);
    }
  }

  const verified =
    routes.length > 0 &&
    operations.length > 0 &&
    appliedLogs.length > 0 &&
    missingRoutes.length === 0;

  const summaryJa = verified
    ? `✅ 依頼内容\u306E整合確認OK（計画 ${routes.length}\u30EB\u30FC\u30C8 ➔ 適用 ${appliedLogs.length}件）`
    : `⚠️ 依頼内容\u306E一部\u307E\u305F\u306F全部\u304C未反映（計画 ${routes.length}\u30EB\u30FC\u30C8 / 適用 ${appliedLogs.length}件 / 未対応 ${missingRoutes.length}件）`;

  return {
    verified,
    checkedRoutesCount: routes.length,
    appliedCount: appliedLogs.length,
    repairedRoutes,
    missingRoutes,
    summaryJa,
  };
}

function resolveDaysFromToolArgs(
  a: Record<string, any>,
  numDays: number,
  mode: "day" | "range"
): number[] {
  if (mode === "range") {
    if (a.day !== undefined) return [];
    const s = a.startDay;
    const e = a.endDay;
    if (
      typeof s !== "number" ||
      typeof e !== "number" ||
      !Number.isInteger(s) ||
      !Number.isInteger(e) ||
      s < 1 ||
      e > numDays ||
      s > e
    ) {
      return [];
    }
    const out: number[] = [];
    for (let d = s; d <= e; d++) out.push(d);
    return out;
  }
  if (a.startDay !== undefined || a.endDay !== undefined) return [];
  const d = a.day;
  if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > numDays) {
    return [];
  }
  return [d];
}

function normalizeActiveShifts(
  raw: unknown,
  state?: NurseSchedulingState
): ShiftCode[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const resolved: ShiftCode[] = [];
  for (const rawItem of raw) {
    if (typeof rawItem !== "string") return null;
    const item = rawItem.trim();
    if (!item) return null;
    if (/^night_both$|夜勤両方|準夜\u30FB深夜/i.test(item)) {
      resolved.push("E", "N");
      continue;
    }
    const code = resolveShiftCodeOrAliasFromInput(item, state);
    if (!code) return null;
    resolved.push(code);
  }
  return resolved.length > 0 ? Array.from(new Set(resolved)) : null;
}

function resolveTargetShiftsFromArg(
  rawTargetShift: unknown,
  rawShifts: unknown,
  state?: NurseSchedulingState
): {
  targetShift: string;
  shifts: ShiftCode[];
} | null {
  const fromArray = normalizeActiveShifts(rawShifts, state);
  if (fromArray === null) return null;
  if (fromArray && fromArray.length > 0) {
    return {
      targetShift:
        fromArray.length === 2 && fromArray.includes("E") && fromArray.includes("N")
          ? "night_both"
          : fromArray[0]!,
      shifts: fromArray,
    };
  }
  if (typeof rawTargetShift !== "string") return null;
  const s = rawTargetShift
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/\u30B7\u30D5\u30C8$/g, "")
    .trim();
  if (!s) return null;
  if (/^night_both$|夜勤両方|準夜\u30FB深夜/i.test(s)) {
    return { targetShift: "night_both", shifts: ["E", "N"] };
  }
  if (/^E$|準夜/i.test(s)) {
    return { targetShift: "E", shifts: ["E"] };
  }
  if (/^N$|深夜/i.test(s)) {
    return { targetShift: "N", shifts: ["N"] };
  }
  if (/^D$|^日勤$|^日$/i.test(s)) {
    return { targetShift: "D", shifts: ["D"] };
  }
  if (/^O$|^公休$|^休\u307F$|^休$/i.test(s)) {
    return { targetShift: "O", shifts: ["O"] };
  }
  const customDefs = state?.customShiftDefs ?? [];
  const existing = customDefs.find(
    (d) => d.code === s || d.label === s || d.shortLabel === s
  );
  if (existing) {
    return { targetShift: existing.code, shifts: [existing.code] };
  }
  const aliases = state?.shiftAliases ?? createDefaultShiftAliases(customDefs);
  const matchedAlias = aliases.find(
    (al) => al.code === s || al.label === s || al.shortLabel === s
  );
  if (matchedAlias) {
    return { targetShift: matchedAlias.code, shifts: [...matchedAlias.shifts] };
  }
  return null;
}

function resolveShiftCodeOrAliasFromInput(
  rawShift: unknown,
  state?: NurseSchedulingState
): ShiftCode | null {
  if (typeof rawShift !== "string") return null;
  const s = rawShift
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/\u30B7\u30D5\u30C8$/g, "")
    .trim();
  if (!s) return null;
  if (
    s === "O" ||
    s === "W" ||
    s === "D" ||
    s === "EN" ||
    s === "E" ||
    s === "N"
  ) {
    return s;
  }
  if (/^公休$|^休\u307F$|^休$/i.test(s)) return "O";
  if (/^勤務$|^出勤$/i.test(s)) return "W";
  if (/^日勤$|^日$/i.test(s)) return "D";
  if (/^夜勤$|^準深$/i.test(s)) return "EN";
  if (/^準夜$|^準夜勤$/i.test(s)) return "E";
  if (/^深夜$|^深夜勤$/i.test(s)) return "N";

  const customDefs = state?.customShiftDefs ?? [];
  for (const cs of customDefs) {
    if (cs.code === s || cs.label === s || cs.shortLabel === s) {
      return cs.code;
    }
  }
  for (const al of state?.shiftAliases ?? createDefaultShiftAliases(customDefs)) {
    if (al.code === s || al.label === s || al.shortLabel === s) {
      return al.code;
    }
  }
  return null;
}

const VALID_WARD_NUMERIC_PARAMS: ReadonlySet<WardNumericParamName> = new Set([
  "weekdayDayStaff",
  "weekendDayStaff",
  "eveningStaff",
  "nightStaff",
  "maxConsecutiveWorkDays",
  "minMonthlyDaysOff",
  "minMonthlyWorkDays",
  "maxMonthlyNightShifts",
  "maxMonthlyOvertimeHours",
  "maxAnnualOvertimeHours",
  "staffCount",
]);

function isWardNumericParamName(val: unknown): val is WardNumericParamName {
  return typeof val === "string" && VALID_WARD_NUMERIC_PARAMS.has(val as WardNumericParamName);
}

const VALID_WARD_BOOLEAN_RULES: ReadonlySet<WardBooleanRuleName> = new Set([
  "enforcePrevMonthCarryover",
  "enforceSkillCoverage",
  "enforcePreceptorPairs",
  "requireWeekendOff",
  "enforceNgPairs",
  "enforceHardRequests",
  "enforce36Agreement",
  "preserveCurrentSchedule",
]);

function isWardBooleanRuleName(val: unknown): val is WardBooleanRuleName {
  return typeof val === "string" && VALID_WARD_BOOLEAN_RULES.has(val as WardBooleanRuleName);
}

/**
 * Converts a Stage 2 `{ tool_name, args }` object returned by Gemini Nano into a `ChatConstraintOperation`.
 * Maps strictly from the `responseConstraint` JSON Schema properties for each tool.
 */
export function convertStage2ToolToOperation(
  toolCall: Stage2ToolCall,
  state: NurseSchedulingState
): ChatConstraintOperation | null {
  const name = toolCall.tool_name;
  const a = toolCall.args ?? {};
  const rawShiftName =
    typeof a.shiftName === "string" && a.shiftName.trim().length > 0
      ? a.shiftName.trim()
      : undefined;

  switch (name) {
    case "add_custom_shift": {
      if (!rawShiftName) return null;
      let baseShift: BaseShiftCode | undefined;
      if (a.baseShift !== undefined) {
        if (
          a.baseShift === "D" ||
          a.baseShift === "E" ||
          a.baseShift === "N" ||
          a.baseShift === "O"
        ) {
          baseShift = a.baseShift;
        } else {
          return null;
        }
      }
      let shortLabel: string | undefined;
      if (a.shortLabel !== undefined) {
        if (typeof a.shortLabel !== "string" || a.shortLabel.trim().length === 0) {
          return null;
        }
        shortLabel = a.shortLabel.trim();
      }
      return {
        op: "add_custom_shift",
        shiftName: rawShiftName,
        shortLabel,
        baseShift,
      };
    }
    case "add_shift_quota": {
      if (!rawShiftName) return null;
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const rawTargetAttr =
        typeof a.attribute === "string" && a.attribute.trim().length > 0
          ? a.attribute.trim()
          : undefined;
      if (!rawTargetAttr) return null;
      const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
      const attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      if (
        typeof a.count !== "number" ||
        !Number.isInteger(a.count) ||
        a.count < 0
      ) {
        return null;
      }
      return {
        op: "add_shift_quota",
        shiftName: rawShiftName,
        attribute,
        minCount: a.count,
        maxCount: a.count,
      };
    }
    case "add_shift_prerequisite": {
      if (!rawShiftName) return null;
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const rawTargetAttr =
        typeof a.attribute === "string" && a.attribute.trim().length > 0
          ? a.attribute.trim()
          : undefined;
      if (!rawTargetAttr) return null;
      const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
      const attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      if (
        typeof a.count !== "number" ||
        !Number.isInteger(a.count) ||
        a.count < 1
      ) {
        return null;
      }
      return {
        op: "add_shift_prerequisite",
        shiftName: rawShiftName,
        attribute,
        prereqMinCount: a.count,
        restrictedShifts: ["E", "N"],
      };
    }
    case "add_shift_day_restriction": {
      if (!rawShiftName) return null;
      const hasDateArg = a.startDay !== undefined || a.endDay !== undefined;
      let startDay: number | undefined;
      let endDay: number | undefined;
      if (hasDateArg) {
        if (
          typeof a.startDay !== "number" ||
          typeof a.endDay !== "number" ||
          !Number.isInteger(a.startDay) ||
          !Number.isInteger(a.endDay) ||
          a.startDay < 1 ||
          a.endDay > state.config.numDays ||
          a.startDay > a.endDay
        ) {
          return null;
        }
        startDay = a.startDay;
        endDay = a.endDay;
      }
      let allowedDays: number[] | undefined;
      if (a.dayRestriction !== undefined) {
        if (a.dayRestriction === "weekend_only") {
          allowedDays = [0, 6];
        } else if (a.dayRestriction === "weekday_only") {
          allowedDays = [1, 2, 3, 4, 5];
        } else {
          return null;
        }
      }
      if (!hasDateArg && !allowedDays) return null;
      return {
        op: "add_shift_day_restriction",
        shiftName: rawShiftName,
        allowedDaysOfWeek: allowedDays,
        startDay,
        endDay,
      };
    }
    case "add_daily_shift_cap": {
      if (!rawShiftName) return null;
      const rawTargetAttr =
        typeof a.attribute === "string" && a.attribute.trim().length > 0
          ? a.attribute.trim()
          : undefined;
      if (!rawTargetAttr) return null;
      if (a.boundType !== "exact" && a.boundType !== "max" && a.boundType !== "min") {
        return null;
      }
      if (
        typeof a.staffCount !== "number" ||
        !Number.isInteger(a.staffCount) ||
        a.staffCount < 0
      ) {
        return null;
      }
      const cnt = a.staffCount;
      const minStaff = a.boundType === "exact" || a.boundType === "min" ? cnt : undefined;
      const maxStaff = a.boundType === "exact" || a.boundType === "max" ? cnt : undefined;
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
      const attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      return {
        op: "add_daily_shift_cap",
        shiftName: rawShiftName,
        minStaff,
        maxStaff,
        attribute,
      };
    }
    case "allow_prev_month_shift":
      if (!rawShiftName) return null;
      return {
        op: "allow_prev_month_shift",
        shiftName: rawShiftName,
        includePrevMonth: true,
      };
    case "level_night_shifts":
      if (a.groupBy !== "skill" && a.groupBy !== "all") return null;
      return {
        op: "level_night_shifts",
        levelGroupBy: a.groupBy,
      };
    case "none":
      return null;
    case "add_ng_pair": {
      if (
        typeof a.nurseA !== "string" ||
        a.nurseA.trim().length === 0 ||
        typeof a.nurseB !== "string" ||
        a.nurseB.trim().length === 0
      ) {
        return null;
      }
      const shifts = normalizeActiveShifts(a.shifts, state);
      if (shifts === null) return null;
      return {
        op: "add_ng_pair",
        nurseNameOrId: a.nurseA.trim(),
        nurseBNameOrId: a.nurseB.trim(),
        shifts: shifts ?? ["E", "N"],
      };
    }
    case "add_preceptor_pair": {
      if (
        typeof a.newcomerNurse !== "string" ||
        a.newcomerNurse.trim().length === 0 ||
        typeof a.mentorNurse !== "string" ||
        a.mentorNurse.trim().length === 0
      ) {
        return null;
      }
      const shifts = normalizeActiveShifts(a.shifts, state);
      if (shifts === null) return null;
      return {
        op: "add_preceptor_pair",
        nurseNameOrId: a.newcomerNurse.trim(),
        nurseBNameOrId: a.mentorNurse.trim(),
        shifts: shifts ?? ["E", "N"],
      };
    }
    case "add_skill_def": {
      if (typeof a.skillName !== "string" || a.skillName.trim().length === 0) return null;
      for (const boundVal of [a.minDay, a.minEvening, a.minNight]) {
        if (
          boundVal !== undefined &&
          (typeof boundVal !== "number" || !Number.isInteger(boundVal) || boundVal < 0)
        ) {
          return null;
        }
      }
      let substitutesFor: NurseSkill | undefined;
      if (a.substitutesFor !== undefined) {
        if (typeof a.substitutesFor !== "string" || a.substitutesFor.trim().length === 0) {
          return null;
        }
        const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
        substitutesFor = inferSkillCodeAndLabel(a.substitutesFor, activeSkills).code;
      }
      return {
        op: "add_skill_def",
        skillName: a.skillName.trim(),
        substitutesFor,
        skillMinDay: a.minDay,
        skillMinEvening: a.minEvening,
        skillMinNight: a.minNight,
      };
    }
    case "remove_skill_def":
      if (typeof a.skillName !== "string" || a.skillName.trim().length === 0) return null;
      return {
        op: "remove_skill_def",
        skillName: a.skillName.trim(),
      };
    case "update_nurse_skill": {
      if (
        typeof a.skillName !== "string" ||
        a.skillName.trim().length === 0 ||
        typeof a.target !== "string" ||
        a.target.trim().length === 0 ||
        (a.action !== "add" && a.action !== "remove")
      ) {
        return null;
      }
      const rawTarget = a.target.trim();
      let attribute: string | undefined;
      let nurseNameOrId: string | undefined;
      if (/^全員$|^all$|^全$/i.test(rawTarget)) {
        attribute = "all";
      } else {
        const cleanedAttr = rawTarget
          .replace(/\u30B9\u30BF\u30C3\u30D5|看護師|全員|層|\u305F\u3061/g, "")
          .trim();
        const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
        const resolved = resolveAttributeCodeAndLabel(cleanedAttr || rawTarget, activeSkills);
        if (!resolved.isUnknownCustomSkill && !resolveNurseFromText(rawTarget, state.nurses)) {
          attribute = resolved.code;
        } else {
          nurseNameOrId = rawTarget;
        }
      }
      return {
        op: "update_nurse_skill",
        skillName: a.skillName.trim(),
        skillAction: a.action,
        nurseNameOrId,
        attribute,
      };
    }
    case "set_staffing_rule": {
      if (
        typeof a.attribute !== "string" ||
        a.attribute.trim().length === 0 ||
        typeof a.targetShift !== "string" ||
        a.targetShift.trim().length === 0
      ) {
        return null;
      }
      const rawAttr = a.attribute.trim();
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const resolvedAttr = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const attrValue = resolvedAttr.isUnknownCustomSkill ? rawAttr : resolvedAttr.code;
      const resolvedTarget = resolveTargetShiftsFromArg(a.targetShift, undefined, state);
      if (!resolvedTarget) return null;
      const { targetShift, shifts } = resolvedTarget;
      if (
        a.minCount !== undefined &&
        (typeof a.minCount !== "number" || !Number.isInteger(a.minCount) || a.minCount < 0)
      ) {
        return null;
      }
      if (
        a.maxCount !== undefined &&
        (typeof a.maxCount !== "number" || !Number.isInteger(a.maxCount) || a.maxCount < 0)
      ) {
        return null;
      }
      const minCount = a.minCount;
      const maxCount = a.maxCount;
      if (minCount === undefined && maxCount === undefined) return null;

      return {
        op: "set_staffing_rule",
        targetShift,
        shifts,
        attribute: attrValue,
        minCount,
        maxCount,
      };
    }
    case "set_nurse_contract": {
      if (
        typeof a.nurseNameOrId !== "string" ||
        a.nurseNameOrId.trim().length === 0 ||
        typeof a.item !== "string"
      ) {
        return null;
      }
      const item = a.item;
      const isDayShiftOnly = item === "dayShiftOnly" || item === "日勤専従";
      const isNightShiftOnly = item === "nightShiftOnly" || item === "夜勤専従";
      const isForbidLateNight = item === "forbidLateNight" || item === "深夜勤免除";
      const isForbidEvening = item === "forbidEvening" || item === "準夜勤免除";
      const isWeekdayOnly =
        item === "weekdayOnly" || item === "土日休\u307F" || item === "土日祝休\u307F";
      const isHolidaysOff = item === "土日祝休\u307F";
      const isAllowAll = item === "allowNightShift" || item === "制限解除";
      const isMaxNight = item === "maxNight" || item === "月間夜勤上限";
      const isMinDaysOff = item === "minDaysOff" || item === "月間最低公休日数";
      const isMinWorkDays = item === "minWorkDays" || item === "月間最低勤務日数";
      const isMaxWorkDays = item === "maxWorkDays" || item === "月間最大勤務日数";
      const isMaxConsecDays = item === "maxConsecutiveDays" || item === "最大連勤日数";

      const isNumericItem =
        isMaxNight || isMinDaysOff || isMinWorkDays || isMaxWorkDays || isMaxConsecDays;
      const isBooleanItem =
        isDayShiftOnly ||
        isNightShiftOnly ||
        isForbidLateNight ||
        isForbidEvening ||
        isWeekdayOnly ||
        isAllowAll;
      if (!isNumericItem && !isBooleanItem) {
        return null;
      }
      if (isNumericItem) {
        const minAllowed = isMaxConsecDays ? 1 : 0;
        if (
          typeof a.value !== "number" ||
          !Number.isInteger(a.value) ||
          a.value < minAllowed
        ) {
          return null;
        }
      }
      const val = typeof a.value === "number" ? a.value : undefined;
      const forbiddenShifts: ActiveShiftCode[] | undefined =
        isNightShiftOnly
          ? ["D"]
          : isForbidLateNight
            ? ["N"]
            : isForbidEvening
              ? ["E"]
              : isAllowAll || isDayShiftOnly
                ? []
                : undefined;
      return {
        op: "set_nurse_contract",
        nurseNameOrId: a.nurseNameOrId.trim(),
        resetContract: isAllowAll ? true : undefined,
        nightOk: isDayShiftOnly ? false : isAllowAll || isNightShiftOnly ? true : undefined,
        maxMonthlyNightShifts: isMaxNight ? val : undefined,
        minMonthlyDaysOff: isMinDaysOff ? val : undefined,
        minMonthlyWorkDays: isMinWorkDays ? val : undefined,
        maxMonthlyWorkDays: isMaxWorkDays ? val : undefined,
        maxConsecutiveWorkDays: isMaxConsecDays ? val : undefined,
        forbiddenShifts,
        weekdayOnly: isWeekdayOnly ? true : isAllowAll ? false : undefined,
        holidaysOff: isHolidaysOff ? true : isAllowAll ? false : undefined,
      };
    }
    case "set_shift_transition": {
      if (
        (a.fromShift !== "D" && a.fromShift !== "E" && a.fromShift !== "N") ||
        (a.toShift !== "D" && a.toShift !== "E" && a.toShift !== "N" && a.toShift !== "O") ||
        (a.policy !== "forbid" && a.policy !== "allow" && a.policy !== "require")
      ) {
        return null;
      }
      return {
        op: "set_shift_transition",
        fromShift: a.fromShift,
        toShift: a.toShift,
        transitionPolicy: a.policy,
      };
    }
    case "clear_custom_rules":
      return { op: "clear_custom_rules" };
    case "inject_conflict_demo":
      return { op: "inject_conflict_demo" };
    case "reset_default":
      return { op: "reset_default" };
    case "add_request_day":
    case "add_request_range": {
      if (typeof a.nurseNameOrId !== "string" || a.nurseNameOrId.trim().length === 0) {
        return null;
      }
      if (typeof a.isHard !== "boolean") return null;
      const days = resolveDaysFromToolArgs(
        a,
        state.config.numDays,
        name === "add_request_range" ? "range" : "day"
      );
      if (days.length === 0) return null;
      const shift = resolveShiftCodeOrAliasFromInput(a.shift, state);
      if (!shift) return null;
      return {
        op: "add_request",
        nurseNameOrId: a.nurseNameOrId.trim(),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        shift,
        isHard: a.isHard,
      };
    }
    case "add_calendar_request": {
      if (typeof a.nurseNameOrId !== "string" || a.nurseNameOrId.trim().length === 0) {
        return null;
      }
      if (!Array.isArray(a.daysOfWeek)) return null;
      if (
        a.onlyMatchedDaysWork !== undefined &&
        typeof a.onlyMatchedDaysWork !== "boolean"
      ) {
        return null;
      }
      if (
        a.holidays !== undefined &&
        a.holidays !== "include" &&
        a.holidays !== "exclude" &&
        a.holidays !== "only"
      ) {
        return null;
      }
      const shift = resolveShiftCodeOrAliasFromInput(a.shift, state);
      if (!shift) return null;
      const dowMap: Record<string, number> = {
        日: 0,
        月: 1,
        火: 2,
        水: 3,
        木: 4,
        金: 5,
        土: 6,
      };
      const mappedDows: number[] = [];
      const rawDows: string[] = [];
      for (const rawDow of a.daysOfWeek) {
        if (typeof rawDow !== "string") return null;
        const cleaned = rawDow.trim().replace(/曜日?$/, "");
        const idx = dowMap[cleaned];
        if (idx === undefined) return null;
        rawDows.push(cleaned);
        mappedDows.push(idx);
      }
      const holMode = a.holidays;
      const effectiveHolMode =
        holMode === "only" || (mappedDows.length === 0 && holMode === "include")
          ? "only"
          : holMode === "include"
            ? "include"
            : holMode === "exclude"
              ? "exclude"
              : "ignore";
      const days = resolveDaysBySelector(
        state.config.year,
        state.config.month,
        state.config.numDays,
        {
          kind: "pattern",
          daysOfWeek: mappedDows,
          holidays: effectiveHolMode,
        }
      );
      if (days.length === 0) return null;
      const dowLabel = rawDows.length > 0 ? `${rawDows.join("\u30FB")}曜` : "";
      const holLabel =
        holMode === "only"
          ? "祝日"
          : holMode === "include"
            ? `${dowLabel ? "＋" : ""}祝日`
            : holMode === "exclude"
              ? "（祝日除\u304F）"
              : "";
      const onlyMatched = a.onlyMatchedDaysWork === true;
      const reason = `${dowLabel}${holLabel}${onlyMatched ? "\u306E\u307F勤務" : "\u30AB\u30EC\u30F3\u30C0\u30FC指定"}`;
      return {
        op: "add_request",
        nurseNameOrId: a.nurseNameOrId.trim(),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        shift,
        isHard: true,
        onlyMatchedDaysWork: onlyMatched,
        isCalendarPattern: true,
        reason,
      };
    }
    case "forbid_shift_day":
    case "forbid_shift_range": {
      if (typeof a.nurseNameOrId !== "string" || a.nurseNameOrId.trim().length === 0) {
        return null;
      }
      const days = resolveDaysFromToolArgs(
        a,
        state.config.numDays,
        name === "forbid_shift_range" ? "range" : "day"
      );
      if (days.length === 0) return null;
      const forbidShifts = normalizeActiveShifts(a.shifts, state);
      if (!forbidShifts || forbidShifts.length === 0) return null;
      return {
        op: "forbid_shift",
        nurseNameOrId: a.nurseNameOrId.trim(),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        forbidShifts,
      };
    }
    case "add_date_coverage":
      if (
        typeof a.day !== "number" ||
        !Number.isInteger(a.day) ||
        a.day < 1 ||
        a.day > state.config.numDays ||
        typeof a.minStaff !== "number" ||
        !Number.isInteger(a.minStaff) ||
        a.minStaff < 1 ||
        (a.shift !== "D" && a.shift !== "E" && a.shift !== "N")
      ) {
        return null;
      }
      return {
        op: "add_date_coverage",
        day: a.day,
        shift: a.shift,
        minStaff: a.minStaff,
      };
    case "set_param":
      if (
        !isWardNumericParamName(a.paramName) ||
        typeof a.paramValue !== "number" ||
        !Number.isInteger(a.paramValue) ||
        a.paramValue < 0
      ) {
        return null;
      }
      return {
        op: "set_param",
        paramName: a.paramName,
        paramValue: a.paramValue,
      };
    case "toggle_rule":
      if (
        !isWardBooleanRuleName(a.ruleName) ||
        typeof a.ruleEnabled !== "boolean"
      ) {
        return null;
      }
      return {
        op: "toggle_rule",
        ruleName: a.ruleName,
        ruleEnabled: a.ruleEnabled,
      };
    default:
      return null;
  }
}

const CONSULT_SYSTEM_PROMPT = `\u3042\u306A\u305F\u306F病棟\u306E\u30B7\u30D5\u30C8作成\u3092支援\u3059\u308B「AI\u30CA\u30FC\u30B9\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0\u30FB\u30B3\u30D1\u30A4\u30ED\u30C3\u30C8」\u3067\u3059。
師長\u30FB看護師\u306B向\u3051\u3066、\u30D7\u30ED\u30F3\u30D7\u30C8\u3067渡\u3055\u308C\u305F実行\u30B9\u30C6\u30FC\u30BF\u30B9\u3068事実\u306B厳密\u306B基\u3065\u304D、簡潔\u3067\u308F\u304B\u308A\u3084\u3059\u3044日本語\u306E Markdown（箇条書\u304D中心、3〜6行程度）\u3067回答\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB\u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）\u304C行\u308F\u308C\u305F場合\u306F、今回反映\u3057\u305F変更内容、希望休\u3084条件\u306E充足状況、前回\u30B7\u30D5\u30C8\u304B\u3089\u306E変更箇所、追加\u30B7\u30D5\u30C8\u306E配置先、\u307E\u305F\u306F競合\u3057\u3066\u3044\u308B条件\u3068解決案\u306E\u307F\u3092簡潔\u306B伝\u3048\u3066\u304F\u3060\u3055\u3044。
\u30FB設定変更\u3084\u30B7\u30D5\u30C8再計算\u304C\u30B9\u30AD\u30C3\u30D7（未実行）\u3055\u308C\u305F場合（\u30B7\u30B9\u30C6\u30E0未対応\u306E要求\u30FB情報不足\u306E確認\u30FB機能質問\u306A\u3069）\u306F、架空\u306E\u30B7\u30D5\u30C8作成結果\u3084\u30B9\u30BF\u30C3\u30D5名\u306E変更報告\u3092絶対\u306B捏造\u305B\u305A、未対応\u3067\u3042\u308B旨\u3084聞\u304D返\u3057\u30FB質問\u3078\u306E回答\u306E\u307F\u3092出力\u3057\u3066\u304F\u3060\u3055\u3044。
\u30FB架空\u306E病棟名（「〇〇病棟」\u306A\u3069）\u306F書\u304B\u305A、結果\u306E要点\u304B\u3089直接書\u304D始\u3081\u3066\u304F\u3060\u3055\u3044。
\u30FB数理\u30BD\u30EB\u30D0\u30FC\u306E内部情報（変数数\u30FB制約数\u30FB求解時間\u30FB\u30A2\u30EB\u30B4\u30EA\u30BA\u30E0名\u306A\u3069）\u306F記載\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044。`;

/**
 * Standard language configuration for Chrome 140–148+ Prompt API (`LanguageModel`).
 * Explicitly declaring `expectedInputs` and `expectedOutputs` with `languages: ["ja"]`
 * prevents `"No output language was specified in a LanguageModel API request"` errors.
 */
const LANGUAGE_MODEL_JA_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["ja", "en"] }],
  expectedOutputs: [{ type: "text", languages: ["ja"] }],
};

/**
 * Resolves the browser's Built-in AI `LanguageModel` constructor (`window.LanguageModel` / `self.LanguageModel` in Chrome 148+).
 */
function getLanguageModelApi(): any | null {
  const g = globalThis as any;
  if (typeof g.LanguageModel !== "undefined" && g.LanguageModel) {
    return g.LanguageModel;
  }
  if (typeof window !== "undefined" && (window as any).LanguageModel) {
    return (window as any).LanguageModel;
  }
  if (typeof self !== "undefined" && (self as any).LanguageModel) {
    return (self as any).LanguageModel;
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

/**
 * Checks whether Chrome Built-in AI (`LanguageModel`) is available on this device/browser
 * using strict Prompt API `availability(LANGUAGE_MODEL_JA_OPTIONS)`.
 */
export async function checkGeminiNanoAvailability(): Promise<GeminiNanoStatus> {
  const api = getLanguageModelApi();
  if (!api || typeof api.availability !== "function") return "unavailable";

  try {
    const statusWithLang = normalizeAvailabilityString(
      await api.availability(LANGUAGE_MODEL_JA_OPTIONS)
    );
    return statusWithLang ?? "unavailable";
  } catch (err) {
    console.warn("LanguageModel.availability() check failed:", err);
    return "unavailable";
  }
}

async function createLanguageModelSession(
  api: any,
  systemPrompt: string,
  monitorFn?: (m: any) => void
): Promise<any> {
  return await api.create({
    ...LANGUAGE_MODEL_JA_OPTIONS,
    initialPrompts: [{ role: "system", content: systemPrompt }],
    ...(monitorFn ? { monitor: monitorFn } : {}),
  });
}

/**
 * Resolves a nurse strictly by ID ("N01"), exact full name ("佐藤 美咲"), exact full kana, or unique family name.
 */
export function resolveNurseFromText(
  query: string | undefined,
  nurses: readonly NurseProfile[]
): NurseProfile | null {
  if (!query) return null;
  const cleaned = query
    .trim()
    .replace(/\u3055\u3093|看護師|師長|主任|先生|\u30B9\u30BF\u30C3\u30D5/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();
  const byId = nurses.find((n) => n.id.toUpperCase() === upper);
  if (byId) return byId;

  const numMatch = cleaned.match(/^N?0*(\d{1,2})$/i);
  if (numMatch) {
    const padded = `N${String(Number(numMatch[1])).padStart(2, "0")}`;
    const found = nurses.find((n) => n.id === padded);
    if (found) return found;
  }

  const byExactName = nurses.filter((n) => n.name.replace(/\s+/g, "") === cleaned);
  if (byExactName.length === 1) return byExactName[0]!;
  if (byExactName.length > 1) return null;

  const byExactKana = nurses.filter((n) => n.kana.replace(/\s+/g, "") === cleaned);
  if (byExactKana.length === 1) return byExactKana[0]!;
  if (byExactKana.length > 1) return null;

  const byFamilyName = nurses.filter((n) => n.name.trim().split(/\s+/)[0] === cleaned);
  if (byFamilyName.length === 1) return byFamilyName[0]!;

  return null;
}

/**
 * Builds a compact, low-token state overview for Gemini Nano to minimize prompt latency.
 */
function buildCompactStatePrompt(state: NurseSchedulingState): string {
  const { config, nurses, customRules } = state;
  const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
  const transMatrix = getShiftTransitionMatrix(config);
  const sampleNurses = nurses
    .slice(0, 12)
    .map((n) => {
      const roleSkill =
        activeSkills.find((s) => s.category === "role" && n.skills.includes(s.code))?.label ??
        "一般";
      return `${n.id}:${n.name}(${roleSkill})`;
    })
    .join(", ");
  const skillSummary = activeSkills
    .map((s) => {
      const subTarget = s.substitutesFor
        ? getSkillMeta(s.substitutesFor, activeSkills).label
        : null;
      return `${s.label}(${s.shortLabel}${subTarget ? `:${subTarget}代行可` : ""})`;
    })
    .join(", ");

  return [
    `対象月:${config.year}年${config.month}月(1〜${config.numDays}日), 看護師:${nurses.length}名(${sampleNurses} 他)`,
    `現在\u306E設定: 平日日勤=${config.weekdayDayStaff}名, 土日日勤=${config.weekendDayStaff}名, 準夜=${config.eveningStaff}名, 深夜=${config.nightStaff}名`,
    `最大連勤=${config.maxConsecutiveWorkDays}日, 月間最低公休=${config.minMonthlyDaysOff}日, 月間夜勤上限=${config.maxMonthlyNightShifts}回`,
    `前月引継=${config.enforcePrevMonthCarryover ? "ON" : "OFF"}, \u30B9\u30AD\u30EB配置必須=${config.enforceSkillCoverage ? "ON" : "OFF"}, 深夜明\u3051公休必須=${transMatrix.N.O === "require" ? "ON" : "OFF"}, \u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤=${config.enforcePreceptorPairs ? "ON" : "OFF"}, 相性NG\u30DA\u30A2禁止=${config.enforceNgPairs ? "ON" : "OFF"}, 週末公休=${config.requireWeekendOff ? "ON" : "OFF"}`,
    `登録済\u307F\u30B9\u30AD\u30EB定義: ${skillSummary || "\u306A\u3057"}`,
    `追加\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB数:${customRules.filter((r) => r.enabled).length}件`,
  ].join("\n");
}

function formatDaySpanLabel(month: number, sortedDays: number[]): string {
  if (sortedDays.length === 0) return "";
  if (sortedDays.length === 1) return `${month}/${sortedDays[0]}`;
  const isContiguous =
    sortedDays[sortedDays.length - 1] - sortedDays[0] + 1 === sortedDays.length;
  if (isContiguous) {
    return `${month}/${sortedDays[0]}〜${month}/${sortedDays[sortedDays.length - 1]} (計${sortedDays.length}日間)`;
  }
  return `${sortedDays.map((d) => `${month}/${d}`).join("\u30FB")} (計${sortedDays.length}日間)`;
}

/**
 * Summarizes active custom rules concisely so multi-day `pin_shift` or `forbid_shift` ranges
 * for the same nurse are collapsed into a single line instead of flooding the prompt with 17+ lines.
 */
function summarizeActiveCustomRules(state: NurseSchedulingState): string[] {
  const enabledRules = state.customRules.filter((r) => r.enabled);
  const lines: string[] = [];
  const pinGroups = new Map<string, CustomConstraintRule[]>();
  const forbidGroups = new Map<string, CustomConstraintRule[]>();

  for (const r of enabledRules) {
    if (r.kind === "pin_shift" && r.nurseId && typeof r.day === "number" && r.shift) {
      const key = `${r.nurseId}::${r.shift}`;
      const list = pinGroups.get(key) ?? [];
      list.push(r);
      pinGroups.set(key, list);
    } else if (r.kind === "forbid_shift" && r.nurseId && typeof r.day === "number") {
      const key = `${r.nurseId}::${(r.forbidShifts ?? []).join("/")}`;
      const list = forbidGroups.get(key) ?? [];
      list.push(r);
      forbidGroups.set(key, list);
    } else {
      lines.push(`  * ${r.description}`);
    }
  }

  for (const [, group] of pinGroups) {
    if (group.length === 1) {
      lines.push(`  * ${group[0].description}`);
      continue;
    }
    const r0 = group[0];
    const nurse = state.nurses.find((n) => n.id === r0.nurseId);
    const nurseLabel = nurse ? `${nurse.name}(${nurse.id})` : r0.nurseId;
    const shift = r0.shift ?? "O";
    const shiftName =
      shift === "O"
        ? "公休(O)"
        : shift === "D"
          ? "日勤(D)"
          : shift === "E"
            ? "準夜勤(E)"
            : shift === "N"
              ? "深夜勤(N)"
              : shift;
    const days = Array.from(new Set(group.map((g) => g.day!))).sort((a, b) => a - b);
    lines.push(
      `  * ${formatDaySpanLabel(state.config.month, days)}: ${nurseLabel} \u3092「${shiftName}」\u306B固定`
    );
  }

  for (const [, group] of forbidGroups) {
    if (group.length === 1) {
      lines.push(`  * ${group[0].description}`);
      continue;
    }
    const r0 = group[0];
    const nurse = state.nurses.find((n) => n.id === r0.nurseId);
    const nurseLabel = nurse ? `${nurse.name}(${nurse.id})` : r0.nurseId;
    const shifts = (r0.forbidShifts ?? ["E", "N"]).join("/");
    const days = Array.from(new Set(group.map((g) => g.day!))).sort((a, b) => a - b);
    lines.push(
      `  * ${formatDaySpanLabel(state.config.month, days)}: ${nurseLabel} \u306E [${shifts}] \u30B7\u30D5\u30C8配置\u3092禁止`
    );
  }

  for (const n of state.nurses) {
    const overrides: string[] = [];
    if (typeof n.minMonthlyWorkDays === "number") {
      overrides.push(`月間最低勤務=${n.minMonthlyWorkDays}日`);
    }
    if (typeof n.minMonthlyDaysOff === "number") {
      overrides.push(`月間最低公休=${n.minMonthlyDaysOff}日`);
    }
    if (typeof n.maxMonthlyNightShifts === "number") {
      overrides.push(`月間夜勤上限=${n.maxMonthlyNightShifts}回`);
    }
    if (overrides.length > 0) {
      lines.push(`  * 個別契約変更: ${n.name}(${n.id}) [${overrides.join(" / ")}]`);
    }
  }

  return lines;
}

/**
 * Creates a Gemini Nano session manager adhering strictly to Chrome's `LanguageModel` API best practices:
 * - Pre-warms base sessions with `initialPrompts`
 * - Uses `clone()` + `destroy()` for stateless structured JSON extraction (`responseConstraint`)
 * - Streams consultation responses and writes via `textContent`
 */
export function createGeminiNanoManager(): GeminiNanoManager {
  let currentStatus: GeminiNanoStatus = "unavailable";
  let downloadProgress: number | null = null;
  let routerBaseSession: any | null = null;
  const stage2BaseSessions: Partial<Record<ExecutableToolCategory, any>> = {};
  let consultBaseSession: any | null = null;
  let activeConsultSession: any | null = null;
  let lastConsultTrace: LlmCallTrace | null = null;
  let lastNonToolReason: NonToolCategory | null = null;
  let lastStage1Response: string = "";
  let lastUnappliedInstructions: string[] = [];
  let recentTurnHistory: string[] = [];
  let pendingClarification: { messages: string[]; lastQuestion: string } | null = null;
  // Chrome Built-in AI (Gemini Nano / LanguageModel API) default contextWindow is 9,216 tokens.
  const GEMINI_NANO_CONTEXT_WINDOW_TOKENS = 9216;
  const RESERVED_PROMPT_AND_OUTPUT_TOKENS = 2216;
  let hadCustomState = false;

  function appendTurnHistory(line: string): void {
    recentTurnHistory.push(line);
    if (recentTurnHistory.length > 2) {
      recentTurnHistory = recentTurnHistory.slice(-2);
    }
  }

  function getPendingClarificationCharBudget(): number {
    const tokenInfo = readSessionTokenUsage(routerBaseSession);
    if (tokenInfo && tokenInfo.quota > tokenInfo.usage) {
      return Math.max(1000, tokenInfo.quota - tokenInfo.usage - 500);
    }
    return GEMINI_NANO_CONTEXT_WINDOW_TOKENS - RESERVED_PROMPT_AND_OUTPUT_TOKENS;
  }

  function recordPendingClarification(msg: string, question: string): void {
    const budget = getPendingClarificationCharBudget();
    if (pendingClarification) {
      pendingClarification.messages.push(msg);
      while (
        pendingClarification.messages.length > 1 &&
        pendingClarification.messages.join(" / ").length > budget
      ) {
        pendingClarification.messages.shift();
      }
      pendingClarification.lastQuestion = question;
    } else {
      pendingClarification = {
        messages: [msg],
        lastQuestion: question,
      };
    }
  }

  function getCombinedHistoryLines(): string[] {
    if (!pendingClarification) {
      return [...recentTurnHistory];
    }
    const pendingLine = `\u30FB前回(未適用\u30FB回答待\u3061):「${pendingClarification.messages.join(" / ")}」➔ 聞\u304D返\u3057: ${pendingClarification.lastQuestion}`;
    return [...recentTurnHistory, pendingLine];
  }

  function readSessionTokenUsage(session: any): { usage: number; quota: number } | null {
    if (!session) return null;
    const usage =
      typeof session.contextUsage === "number"
        ? session.contextUsage
        : typeof session.tokensSoFar === "number"
          ? session.tokensSoFar
          : null;
    const quota =
      typeof session.contextWindow === "number"
        ? session.contextWindow
        : typeof session.maxTokens === "number"
          ? session.maxTokens
          : null;
    if (usage !== null && quota !== null && quota > 0) {
      return { usage, quota };
    }
    return null;
  }

  async function getOrCreateStage2BaseSession(
    category: ExecutableToolCategory
  ): Promise<any> {
    if (stage2BaseSessions[category]) {
      return stage2BaseSessions[category];
    }
    // Evict previously cached Stage 2 base sessions to keep GPU KV-cache session count strictly bounded
    for (const k of Object.keys(stage2BaseSessions) as Array<keyof typeof stage2BaseSessions>) {
      const oldS = stage2BaseSessions[k];
      if (oldS && typeof oldS.destroy === "function") {
        try {
          oldS.destroy();
        } catch (_) {}
      }
      delete stage2BaseSessions[k];
    }
    const api = getLanguageModelApi();
    if (!api || typeof api.create !== "function") {
      throw new Error("Gemini Nano (LanguageModel API) \u304C利用\u3067\u304D\u307E\u305B\u3093。");
    }
    const cfg = STAGE2_CATEGORY_CONFIGS[category];
    const s = await createLanguageModelSession(api, cfg.systemPrompt);
    stage2BaseSessions[category] = s;
    return s;
  }

  return {
    getStatus() {
      return currentStatus;
    },

    getDownloadProgress() {
      return downloadProgress;
    },

    getTokenUsage() {
      return readSessionTokenUsage(activeConsultSession);
    },

    getLastConsultTrace() {
      return lastConsultTrace;
    },

    async initialize(onProgress?: (pct: number) => void): Promise<GeminiNanoStatus> {
      const api = getLanguageModelApi();
      if (!api || typeof api.create !== "function") {
        currentStatus = "unavailable";
        return "unavailable";
      }

      const hadRouterBefore = Boolean(routerBaseSession);
      const hadConsultBefore = Boolean(consultBaseSession);
      try {
        const monitorFn = (m: any) => {
          m?.addEventListener?.("downloadprogress", (e: any) => {
            if (typeof e?.loaded === "number") {
              currentStatus = "downloading";
              const pct = Math.round(e.loaded * 100);
              downloadProgress = pct;
              onProgress?.(pct);
            }
          });
        };

        if (!routerBaseSession) {
          routerBaseSession = await createLanguageModelSession(
            api,
            STAGE1_ROUTER_SYSTEM_PROMPT,
            monitorFn
          );
        }

        if (!consultBaseSession) {
          consultBaseSession = await createLanguageModelSession(
            api,
            CONSULT_SYSTEM_PROMPT,
            monitorFn
          );
        }

        if (!activeConsultSession && consultBaseSession) {
          if (typeof consultBaseSession.clone !== "function") {
            throw new Error("LanguageModel consult session does not support clone().");
          }
          activeConsultSession = await consultBaseSession.clone();
        }

        currentStatus = "available";
        downloadProgress = 100;
        return "available";
      } catch (err) {
        if (!hadRouterBefore && routerBaseSession) {
          try {
            routerBaseSession.destroy?.();
          } catch (_) {}
          routerBaseSession = null;
        }
        if (!hadConsultBefore && consultBaseSession) {
          try {
            consultBaseSession.destroy?.();
          } catch (_) {}
          consultBaseSession = null;
        }
        currentStatus = "unavailable";
        throw err;
      }
    },

    async extractPlan(
      userMessage: string,
      state: NurseSchedulingState,
      signal?: AbortSignal,
      onProgress?: (event: ChatExtractProgressEvent) => void
    ): Promise<ParsedChatPlan> {
      if (!routerBaseSession) {
        const initRes = await this.initialize();
        if (initRes !== "available" || !routerBaseSession) {
          throw new Error("Gemini Nano (LanguageModel API) \u304C利用\u3067\u304D\u307E\u305B\u3093。");
        }
      }

      const routerTrace: string[] = [];
      const llmCalls: LlmCallTrace[] = [];

      const hasCurrentCustom =
        (state.customShiftDefs?.length ?? 0) > 0 || state.customRules.length > 0;
      if (hadCustomState && !hasCurrentCustom) {
        recentTurnHistory = [];
        pendingClarification = null;
        hadCustomState = false;
      } else if (hasCurrentCustom) {
        hadCustomState = true;
      }

      const historyLinesForTurn = getCombinedHistoryLines();

      // ==================== TURN 1: STAGE 1 ROUTER (tool_types + response) ====================
      onProgress?.({
        phase: "turn1_start",
        activeLabel: "⏳ 指示\u3092解析\u3057\u3066\u3044\u307E\u3059…",
        routerTrace: [...routerTrace],
      });
      if (typeof routerBaseSession.clone !== "function") {
        throw new Error("LanguageModel router session does not support clone().");
      }
      const routerBranch = await routerBaseSession.clone();

      let stage1: Stage1RouterResult;
      try {
        const routerContextLines = [
          `対象月:${state.config.year}年${state.config.month}月(1〜${state.config.numDays}日)`,
          ...(historyLinesForTurn.length > 0
            ? [`【直近\u306E対話履歴】`, ...historyLinesForTurn]
            : []),
        ];
        const routerPrompt = `${routerContextLines.join("\n")}\n\n\u30E6\u30FC\u30B6\u30FC\u306E発話: 「${userMessage}」`;
        const t1Start = performance.now();
        const rawStage1 = await routerBranch.prompt(routerPrompt, {
          responseConstraint: STAGE1_ROUTER_SCHEMA,
          signal,
        });
        stage1 = JSON.parse(String(rawStage1).trim()) as Stage1RouterResult;
        if (!stage1 || !Array.isArray(stage1.routes) || stage1.routes.length === 0) {
          throw new Error("Stage 1 router returned an invalid or empty routes array.");
        }
        const t1Duration = Math.max(1, Math.round(performance.now() - t1Start));
        llmCalls.push({
          step: "turn1_router",
          systemPrompt: STAGE1_ROUTER_SYSTEM_PROMPT,
          userPrompt: routerPrompt,
          responseConstraintSchema: STAGE1_ROUTER_SCHEMA,
          rawOutput: rawStage1,
          parsedOutput: stage1,
          durationMs: t1Duration,
          tokenUsage: readSessionTokenUsage(routerBranch),
        });
      } finally {
        if (
          routerBranch &&
          routerBranch !== routerBaseSession &&
          typeof routerBranch.destroy === "function"
        ) {
          try {
            routerBranch.destroy();
          } catch (_) {}
        }
      }

      const rawRoutes: Stage1RouteItem[] = stage1.routes;

      const stage1Thought = stage1.thought?.trim() || undefined;
      const stage1Response = stage1.response || userMessage;
      lastStage1Response = stage1Response;

      const activeRoutes: Array<{ category: ExecutableToolCategory; instruction: string }> = [];
      const nonToolCategories: NonToolCategory[] = [];
      const unsupportedRouteInstructions: string[] = [];

      for (const routeItem of rawRoutes) {
        const cat = routeItem.tool_type;
        const routeInstruction = routeItem.instruction?.trim() || userMessage;
        if (
          cat === "staff_calendar" ||
          cat === "staff_contract" ||
          cat === "ward_coverage_and_param" ||
          cat === "ward_transition_and_rule" ||
          cat === "custom_shift" ||
          cat === "skill_and_pair" ||
          cat === "system_action"
        ) {
          activeRoutes.push({
            category: cat,
            instruction: routeInstruction,
          });
        } else if (cat === "unsupported" || cat === "clarify") {
          nonToolCategories.push(cat);
          if (cat === "unsupported" && routeItem.instruction?.trim()) {
            unsupportedRouteInstructions.push(routeItem.instruction.trim());
          }
        } else if (cat === "question") {
          nonToolCategories.push("question");
        } else {
          throw new Error(`Stage 1 router returned unknown tool_type "${String(cat)}".`);
        }
      }

      const traceLabels =
        activeRoutes.length > 0
          ? activeRoutes.map((r) => `${r.category}("${r.instruction}")`)
          : nonToolCategories;
      const thoughtPrefix = stage1Thought ? `💭 ${stage1Thought} ➔ ` : "";
      routerTrace.push(`🧭 Turn 1 (Planner): ${thoughtPrefix}routes=${JSON.stringify(traceLabels)}`);
      onProgress?.({
        phase: "turn1_done",
        activeLabel:
          activeRoutes.length > 0
            ? "⏳ 設定\u3092更新\u3057\u3066\u3044\u307E\u3059…"
            : "⏳ 結果\u3092\u307E\u3068\u3081\u3066\u3044\u307E\u3059…",
        stage1Response,
        routerTrace: [...routerTrace],
      });

      if (activeRoutes.length === 0) {
        const reason: NonToolCategory = nonToolCategories.includes("unsupported")
          ? "unsupported"
          : nonToolCategories.includes("clarify")
            ? "clarify"
            : "question";
        lastNonToolReason = reason;
        if (reason === "clarify") {
          recordPendingClarification(userMessage, stage1Response);
        } else {
          pendingClarification = null;
        }
        return {
          intentType: "consult_only",
          nonToolReason: reason,
          operations: [],
          summaryJa: stage1Response,
          stage1Thought,
          stage1Response,
          routerTrace,
          llmCalls,
        };
      }

      // ==================== TURN 2: CATEGORY-SPECIFIC TOOL EXTRACTION (tool_name + args) ====================
      const operations: ChatConstraintOperation[] = [];
      let stage2SystemIntent: "diagnose_conflict" | "solve_only" | null = null;
      const repairedRoutes: string[] = [];
      const missingRouteLabels: string[] = [
        ...unsupportedRouteInstructions.map((inst) => `unsupported("${inst}")`),
      ];

      let workingState = state;
      const runTurn2CategoryExtractor = async (
        category: ExecutableToolCategory,
        instruction: string
      ): Promise<ChatConstraintOperation[]> => {
        onProgress?.({
          phase: "turn2_start",
          activeLabel: "⏳ 設定\u3092更新\u3057\u3066\u3044\u307E\u3059…",
          stage1Response,
          routerTrace: [...routerTrace],
        });
        const baseCatSession = await getOrCreateStage2BaseSession(category);
        if (typeof baseCatSession.clone !== "function") {
          throw new Error(`LanguageModel Stage 2 session (${category}) does not support clone().`);
        }
        const catBranch = await baseCatSession.clone();

        const routeOps: ChatConstraintOperation[] = [];
        try {
          const catConfig = STAGE2_CATEGORY_CONFIGS[category];
          const dynamicDict = buildCategoryDynamicDictionary(
            category,
            workingState,
            `${userMessage} ${instruction} ${historyLinesForTurn.join(" ")}`
          );
          const dictNote = dynamicDict ? `${dynamicDict}\n` : "";
          const historyNote =
            historyLinesForTurn.length > 0
              ? `【直近\u306E対話履歴】\n${historyLinesForTurn.join("\n")}\n`
              : "";
          const effectiveInstruction =
            activeRoutes.length > 1
              ? instruction
              : historyLinesForTurn.length > 0 && instruction && instruction !== userMessage
                ? `${userMessage}（文脈補完: ${instruction}）`
                : userMessage;
          const stage2Input = `${dictNote}${historyNote}\u30E6\u30FC\u30B6\u30FC\u306E指示: 「${effectiveInstruction}」`;
          const t2Start = performance.now();
          const rawStage2 = await catBranch.prompt(stage2Input, {
            responseConstraint: catConfig.schema,
            signal,
          });
          const parsedStage2 = JSON.parse(String(rawStage2).trim());
          const t2Duration = Math.max(1, Math.round(performance.now() - t2Start));
          llmCalls.push({
            step: "turn2_extractor",
            category,
            systemPrompt: catConfig.systemPrompt,
            userPrompt: stage2Input,
            responseConstraintSchema: catConfig.schema,
            rawOutput: rawStage2,
            parsedOutput: parsedStage2,
            durationMs: t2Duration,
            tokenUsage: readSessionTokenUsage(catBranch),
          });

          const toolList: Stage2ToolCall[] = Array.isArray(parsedStage2?.tools)
            ? parsedStage2.tools
            : parsedStage2?.tool_name
              ? [parsedStage2 as Stage2ToolCall]
              : [];

          for (const tc of toolList) {
            if (!tc || tc.tool_name === "none") continue;
            if (tc.tool_name === "diagnose_conflict" || tc.tool_name === "solve_only") {
              stage2SystemIntent = tc.tool_name;
              routerTrace.push(`🛠️ Turn 2 (${category}): ${tc.tool_name}()`);
              continue;
            }

            const mappedOp = convertStage2ToolToOperation(tc, workingState);
            if (mappedOp) {
              routeOps.push(mappedOp);
              operations.push(mappedOp);
              if (mappedOp.op === "add_custom_shift" || mappedOp.op === "add_skill_def") {
                workingState = applyChatOperationsToState(workingState, [mappedOp]).updatedState;
              }
              routerTrace.push(
                `🛠️ Turn 2 (${category}): ${tc.tool_name}(${JSON.stringify(tc.args ?? {})})`
              );
            }
          }
          onProgress?.({
            phase: "turn2_route_done",
            activeLabel: "⏳ 設定\u3092更新\u3057\u3066\u3044\u307E\u3059…",
            stage1Response,
            routerTrace: [...routerTrace],
          });
        } finally {
          if (
            catBranch &&
            catBranch !== baseCatSession &&
            typeof catBranch.destroy === "function"
          ) {
            try {
              catBranch.destroy();
            } catch (_) {}
          }
        }
        return routeOps;
      };

      for (let rIdx = 0; rIdx < activeRoutes.length; rIdx++) {
        const route = activeRoutes[rIdx]!;
        const { category, instruction } = route;
        const extractedForRoute = await runTurn2CategoryExtractor(category, instruction);

        // ==================== STEP 3: POST-TURN-2 VERIFICATION ====================
        if (extractedForRoute.length === 0 && !stage2SystemIntent) {
          missingRouteLabels.push(`${category}("${instruction}")`);
          unsupportedRouteInstructions.push(instruction);
        }
      }

      if (operations.length > 0) {
        let previewAppliedLogs: string[] = [];
        if (operations.some((o) => o.op === "reset_default" || o.op === "clear_custom_rules")) {
          recentTurnHistory = [];
          pendingClarification = null;
          hadCustomState = false;
          previewAppliedLogs = ["\u30EA\u30BB\u30C3\u30C8/\u30AF\u30EA\u30A2実行"];
        } else {
          const previewApplied = applyChatOperationsToState(state, operations);
          previewAppliedLogs = previewApplied.appliedLogs;
          if (previewApplied.rejectedLogs.length > 0) {
            routerTrace.push(`⚠️ Step 3 (Excluded): ${previewApplied.rejectedLogs.join(" / ")}`);
          }
          if (previewApplied.appliedLogs.length > 0) {
            pendingClarification = null;
            appendTurnHistory(
              `\u30FB前回:「${userMessage}」➔ 適用済: ${previewApplied.appliedLogs.join(" / ")}`
            );
          }
          if (
            (previewApplied.updatedState.customShiftDefs?.length ?? 0) > 0 ||
            previewApplied.updatedState.customRules.length > 0
          ) {
            hadCustomState = true;
          }
        }

        const verificationResult = verifyExecutionAgainstRequest({
          userMessage,
          routes: activeRoutes,
          operations,
          state,
          repairedRoutes,
          missingRoutes: missingRouteLabels,
          appliedLogs: previewAppliedLogs,
        });
        onProgress?.({
          phase: "verification_done",
          activeLabel: verificationResult.summaryJa,
          stage1Response,
          routerTrace: [...routerTrace],
        });

        // If extracted operations produced zero applicable changes (e.g. non-existent nurse name in roster),
        // treat as unsupported/unapplicable and convey clearly why it cannot be done.
        if (previewAppliedLogs.length === 0) {
          const unresolvedNurses = operations
            .flatMap((o) => {
              const names: Array<string | undefined> = [];
              if ("nurseNameOrId" in o) names.push(o.nurseNameOrId);
              if ("nurseBNameOrId" in o) names.push(o.nurseBNameOrId);
              return names;
            })
            .filter((q): q is string => Boolean(q && !resolveNurseFromText(q, state.nurses)));
          const refusalMsg =
            unresolvedNurses.length > 0
              ? `指定\u3055\u308C\u305F\u30B9\u30BF\u30C3\u30D5名（「${Array.from(new Set(unresolvedNurses)).join("\u30FB")}」）\u304C病棟名簿\u306B存在\u3057\u306A\u3044\u305F\u3081、設定\u3092変更\u3067\u304D\u307E\u305B\u3093。`
              : `\u3054指定\u306E操作（「${userMessage}」）\u306F適用対象\u304C見\u3064\u304B\u3089\u306A\u3044\u304B本\u30B7\u30B9\u30C6\u30E0\u3067\u306F未対応\u306E\u305F\u3081、設定\u3092変更\u3067\u304D\u307E\u305B\u3093。`;
          pendingClarification = null;
          lastNonToolReason = "unsupported";
          lastStage1Response = refusalMsg;
          lastUnappliedInstructions = [...unsupportedRouteInstructions];
          routerTrace.push(`⚠️ Step 3 (Verification): ${refusalMsg}`);
          return {
            intentType: "consult_only",
            nonToolReason: "unsupported",
            operations: [],
            summaryJa: refusalMsg,
            stage1Thought,
            stage1Response: refusalMsg,
            routerTrace,
            verificationResult,
            llmCalls,
          };
        }

        lastNonToolReason = null;
        lastUnappliedInstructions = [...unsupportedRouteInstructions];
        if (unsupportedRouteInstructions.length > 0) {
          routerTrace.push(
            `⚠️ Step 3 (Verification): 一部未対応\u306E指示\u3092除外 (${unsupportedRouteInstructions.join(" / ")})`
          );
        }

        return {
          intentType: "modify_and_solve",
          operations,
          summaryJa: stage1Response,
          stage1Thought,
          stage1Response,
          routerTrace,
          verificationResult,
          llmCalls,
        };
      }

      if (stage2SystemIntent) {
        pendingClarification = null;
        lastNonToolReason = null;
        lastUnappliedInstructions = [];
        return {
          intentType: stage2SystemIntent,
          operations: [],
          summaryJa: stage1Response,
          stage1Thought,
          stage1Response,
          routerTrace,
          llmCalls,
        };
      }

      // All Stage 2 tool extractors chose "none": preserve "clarify" or "question" if Turn 1 also flagged it, otherwise "unsupported"
      const fallbackReason: NonToolCategory = nonToolCategories.includes("clarify")
        ? "clarify"
        : nonToolCategories.includes("question")
          ? "question"
          : "unsupported";
      lastNonToolReason = fallbackReason;
      lastUnappliedInstructions = [...unsupportedRouteInstructions];
      const verificationResult = verifyExecutionAgainstRequest({
        userMessage,
        routes: activeRoutes,
        operations: [],
        state,
        repairedRoutes,
        missingRoutes: missingRouteLabels,
        appliedLogs: [],
      });
      const finalSummaryJa =
        fallbackReason === "unsupported" && activeRoutes.length > 0
          ? `\u3054指定\u306E操作（「${userMessage}」）\u306B対応\u3059\u308B設定項目\u30FB\u30C4\u30FC\u30EB\u304C\u306A\u3044\u305F\u3081、本\u30B7\u30B9\u30C6\u30E0\u3067\u306F未対応\u3067\u3059。`
          : stage1Response;
      if (fallbackReason === "unsupported" && activeRoutes.length > 0) {
        pendingClarification = null;
        lastStage1Response = finalSummaryJa;
        routerTrace.push(
          `⚠️ Step 3 (Verification): 対応\u3059\u308B\u30C4\u30FC\u30EB\u304C存在\u3057\u306A\u3044\u305F\u3081未対応(unsupported)\u3068判定`
        );
      } else if (fallbackReason === "clarify") {
        recordPendingClarification(userMessage, stage1Response);
      } else {
        pendingClarification = null;
      }
      return {
        intentType: "consult_only",
        nonToolReason: fallbackReason,
        operations: [],
        summaryJa: finalSummaryJa,
        stage1Thought,
        stage1Response: finalSummaryJa,
        routerTrace,
        verificationResult,
        llmCalls,
      };
    },

    async *streamConsultationReply(
      userMessage: string,
      appliedSummary: string[],
      state: NurseSchedulingState,
      outcome: WashiSolveOutcome | null,
      signal?: AbortSignal
    ): AsyncIterable<string> {
      if (!consultBaseSession) {
        const initRes = await this.initialize();
        if (initRes !== "available" || !consultBaseSession) {
          throw new Error("Gemini Nano (LanguageModel API) \u304C利用\u3067\u304D\u307E\u305B\u3093。");
        }
      }

      // Clone a fresh session per turn from consultBaseSession so the 3B model never parrots
      // a refusal sentence from an earlier turn when new changes ARE applied.
      if (
        activeConsultSession &&
        activeConsultSession !== consultBaseSession &&
        typeof activeConsultSession.destroy === "function"
      ) {
        try {
          activeConsultSession.destroy();
        } catch (_) {}
      }
      if (typeof consultBaseSession.clone !== "function") {
        throw new Error("LanguageModel consult session does not support clone().");
      }
      const turnSession = await consultBaseSession.clone();
      activeConsultSession = turnSession;

      let fullPrompt: string;

      if (!outcome) {
        if (appliedSummary.length === 0) {
          const capabilitiesBlock = [
            `【\u3053\u306EAI\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3067\u304D\u308B\u3053\u3068（対応機能\u3068指示例）】`,
            `1. \u30B9\u30AD\u30EB\u30FB資格\u306E追加\u30FB削除\u30FB\u30EA\u30FC\u30C0\u30FC代行設定\u30FB\u30B9\u30BF\u30C3\u30D5\u3078\u306E付与:`,
            `   例: 「感染管理\u30B9\u30AD\u30EB\u3092追加\u3057\u3066救急\u306E代\u308F\u308A\u306B\u306A\u308C\u308B\u3088\u3046\u306B\u3057\u3066」「小児対応\u30B9\u30AD\u30EB\u3092追加\u3057\u3066日勤\u306B1名以上配置\u3057\u3066」「緩和\u30B1\u30A2\u30B9\u30AD\u30EB\u3092削除\u3057\u3066」「村上\u3055\u3093\u306B感染管理\u30B9\u30AD\u30EB\u3092付与\u3057\u3066」`,
            `2. \u30AB\u30B9\u30BF\u30E0\u30B7\u30D5\u30C8\u30FB研修\u30EB\u30FC\u30EB\u306E追加: 新\u30B7\u30D5\u30C8\u306E追加、必要回数、夜勤\u306E先行条件、曜日\u30FB期間制限、1日\u3042\u305F\u308A配置人数、前月実績\u306E算入`,
            `   例: 「安全講習\u3092追加\u3057\u3066、新人\u306F1回受\u3051\u308B\u307E\u3067夜勤不可\u306B\u3057\u3066」「院内勉強会\u3092平日\u306E\u307F\u30671日最大2名\u307E\u3067」`,
            `3. \u30B7\u30D5\u30C8別\u306E属性配置人数\u30EB\u30FC\u30EB\u30FB夜勤回数\u306E平準化\u30FB\u30DA\u30A2制限（相性NG / \u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤）:`,
            `   例: 「日勤\u306BA班\u30923人以上配置\u3057\u3066」「役割\u3084\u30B9\u30AD\u30EB\u3054\u3068\u306B夜勤回数\u3092均等化\u3057\u3066」「N11\u3068N18\u3092NG\u30DA\u30A2\u306B\u3057\u3066」「\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤\u3092ON\u306B\u3057\u3066」`,
            `4. 個別\u30B9\u30BF\u30C3\u30D5\u306E希望休\u30FB期間休職\u30FB曜日\u30D1\u30BF\u30FC\u30F3\u30FB個人契約（日勤専従\u30FB夜勤専従\u30FB個人別夜勤上限\u30FB公休数）\u30FB特定日\u306E人数変更:`,
            `   例: 「村上\u3055\u3093\u306E8日\u3092確定\u306E休\u307F\u306B\u3057\u3066」「西村\u3055\u3093\u3092日勤専従\u306B\u3057\u3066」「福田\u3055\u3093\u306E月間夜勤上限\u30923回\u306B\u3057\u3066」「18日\u306E日勤\u309211人以上\u306B\u3057\u3066」`,
            `5. 病棟全体\u306E基本\u30EB\u30FC\u30EB\u30FB\u30B7\u30D5\u30C8遷移\u30DE\u30C8\u30EA\u30AF\u30B9設定: 最大連勤日数、深夜明\u3051公休必須、2日間\u306E\u30B7\u30D5\u30C8並\u3073順禁止、固定\u30C1\u30FC\u30E0\u30CA\u30FC\u30B7\u30F3\u30B0均等配置(A班/B班)、36協定上限`,
            `   例: 「深夜明\u3051\u306F必\u305A公休\u306B\u3057\u3066」「準夜勤\u306E翌日\u306E日勤\u3092禁止\u3057\u3066」「最大連勤\u30923日\u306B変更\u3057\u3066」`,
            `6. 矛盾診断\u30FB\u30B7\u30D5\u30C8再最適化: \u30EB\u30FC\u30EB衝突\u306E原因特定（HiGHS 弾性制約緩和）\u3084\u30B7\u30D5\u30C8再計算（HiGHS MILP）`,
            `   例: 「矛盾\u3092\u30C1\u30A7\u30C3\u30AF\u3057\u3066」「\u30B7\u30D5\u30C8\u3092再計算\u3057\u3066」`,
          ].join("\n");

          const activeCustomShifts =
            (state.customShiftDefs ?? []).length > 0
              ? `登録済\u307F追加\u30B7\u30D5\u30C8: ${state.customShiftDefs
                  .map((d) => `${d.label}(${d.shortLabel}: ${d.timeRange})`)
                  .join(", ")}`
              : `登録済\u307F追加\u30B7\u30D5\u30C8: \u306A\u3057`;
          const activeCustomRuleLines = summarizeActiveCustomRules(state);
          const activeCustomRules =
            activeCustomRuleLines.length > 0
              ? `現在有効\u306A追加\u30EB\u30FC\u30EB (${activeCustomRuleLines.length}件):\n${activeCustomRuleLines.join("\n")}`
              : `現在有効\u306A追加\u30EB\u30FC\u30EB: \u306A\u3057`;

          if (lastNonToolReason === "unsupported") {
            fullPrompt = [
              `【\u30B7\u30B9\u30C6\u30E0未対応\u306E要求\u306B対\u3059\u308B回答指示】`,
              `実行\u30B9\u30C6\u30FC\u30BF\u30B9: 設定変更 0件（未適用） / \u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）: \u30B9\u30AD\u30C3\u30D7（未実行）`,
              `\u30E6\u30FC\u30B6\u30FC\u306E発言: 「${userMessage}」`,
              `一次判定\u30E1\u30E2: ${lastStage1Response || "\u3054指定\u306E操作\u306F本\u30B7\u30B9\u30C6\u30E0\u3067\u306F未対応\u3067\u3059。"}`,
              ``,
              `【本\u30B7\u30B9\u30C6\u30E0\u3067対応可能\u306A機能\u30AB\u30C6\u30B4\u30EA】`,
              `\u30FB\u30B9\u30AD\u30EB定義\u306E追加/削除/代行設定、\u304A\u3088\u3073\u30B7\u30D5\u30C8別\u306E\u30B9\u30AD\u30EB\u30FB属性配置人数\u30EB\u30FC\u30EB`,
              `\u30FB追加\u30B7\u30D5\u30C8（研修\u30FB委員会等）\u306E定義、開催期間\u30FB曜日制限、1日\u3042\u305F\u308A配置人数、受講回数\u30FB夜勤先行条件`,
              `\u30FB個人別\u306E希望休\u30FB期間休職\u30FB曜日\u30D1\u30BF\u30FC\u30F3、\u304A\u3088\u3073個人別\u306E勤務契約（日勤専従\u30FB夜勤専従\u30FB連勤上限\u30FB月間勤務日数\u3084夜勤回数\u306E上限/下限）`,
              `\u30FB病棟全体\u306E必要人数、最大連勤日数、\u30B7\u30D5\u30C8遷移禁止/必須\u30EB\u30FC\u30EB、夜勤回数\u306E平準化、矛盾診断`,
              ``,
              `【出力\u30EB\u30FC\u30EB（厳守）】`,
              `\u30FB今回\u306F\u30B7\u30B9\u30C6\u30E0未対応\u306E要求\u306E\u305F\u3081、設定変更\u3082\u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）\u3082\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F。`,
              `\u30FB「希望休\u3092反映\u3057\u305F」「\u30B7\u30D5\u30C8\u3092調整\u3057\u305F」\u3068\u3044\u3063\u305F架空\u306E\u30B7\u30D5\u30C8作成結果\u3084回答例\u306F絶対\u306B書\u304B\u306A\u3044\u3067\u304F\u3060\u3055\u3044。`,
              `\u30FB\u307E\u305A1行目\u3067「${lastStage1Response || "\u3054指定\u306E操作\u306B\u306F対応\u3057\u3066\u3044\u307E\u305B\u3093。"}」（\u305D\u306E\u305F\u3081\u30B7\u30D5\u30C8再計算\u3082行\u3063\u3066\u3044\u306A\u3044旨）\u3092率直\u306B伝\u3048、続\u3051\u3066上記\u306E対応可能\u306A機能\u30AB\u30C6\u30B4\u30EA\u3092簡潔\u306B案内\u3057\u3066\u304F\u3060\u3055\u3044。`,
            ].join("\n");
          } else if (lastNonToolReason === "clarify") {
            fullPrompt = [
              `【情報不足\u30FB確認\u304C必要\u306A指示\u306B対\u3059\u308B回答指示】`,
              `実行\u30B9\u30C6\u30FC\u30BF\u30B9: 設定変更 0件（回答待\u3061\u306E\u305F\u3081一括保留） / \u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）: \u30B9\u30AD\u30C3\u30D7（未実行）`,
              `\u30E6\u30FC\u30B6\u30FC\u306E発言: 「${userMessage}」`,
              `一次判定\u30E1\u30E2: ${lastStage1Response || "設定変更\u306B必要\u306A対象\u30FB日付\u30FB数値\u304C不足\u3057\u3066\u3044\u307E\u3059。"}`,
              ``,
              `【現在\u306E病棟設定】`,
              buildCompactStatePrompt(state),
              ``,
              `\u30E6\u30FC\u30B6\u30FC\u306E指示\u306B\u306F、設定\u3092変更\u3059\u308B\u305F\u3081\u306B必要\u306A情報（誰\u306E\u30FB何月何日\u306E希望\u304B、\u3069\u306E設定項目\u3092\u3044\u304F\u3064\u306B\u3059\u308B\u304B等）\u304C不足\u3057\u3066\u3044\u308B\u305F\u3081、\u3059\u3079\u3066\u306E設定変更\u304A\u3088\u3073\u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）\u3092一旦保留\u3057\u307E\u3057\u305F。「一次判定\u30E1\u30E2」\u306E内容\u306B沿\u3063\u3066、不足\u3057\u3066\u3044\u308B情報\u3092教\u3048\u3066\u3044\u305F\u3060\u3051\u308C\u3070今回\u306E要望\u3068\u3042\u308F\u305B\u3066一括\u3067設定\u30FB再計算\u3059\u308B旨\u3092簡潔\u306B聞\u304D返\u3057\u3066\u304F\u3060\u3055\u3044。`,
            ].join("\n");
          } else {
            fullPrompt = [
              `実行\u30B9\u30C6\u30FC\u30BF\u30B9: 設定変更 0件 / \u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）: \u30B9\u30AD\u30C3\u30D7（質問\u30FB確認\u3078\u306E回答）`,
              capabilitiesBlock,
              ``,
              `【現在\u306E病棟設定】`,
              buildCompactStatePrompt(state),
              activeCustomShifts,
              activeCustomRules,
              ``,
              `\u30E6\u30FC\u30B6\u30FC\u306E質問\u30FB発言: 「${userMessage}」`,
              `上記\u306E情報\u304B\u3089、\u30E6\u30FC\u30B6\u30FC\u306E質問\u306B対\u3057\u3066直接\u30FB\u308F\u304B\u308A\u3084\u3059\u304F簡潔\u306A箇条書\u304D\u3067回答\u3057\u3066\u304F\u3060\u3055\u3044。`,
            ].join("\n");
          }
        } else {
          // Rules were modified, but solver did not run (e.g. auto-solve unchecked)
          const unappliedNote =
            lastUnappliedInstructions.length > 0
              ? [
                  ``,
                  `【⚠️ 未対応\u306E\u305F\u3081適用\u3067\u304D\u306A\u304B\u3063\u305F指示】`,
                  `以下\u306E指示\u306F本\u30B7\u30B9\u30C6\u30E0\u306E対応機能外\u3067\u3042\u308B\u305F\u3081適用\u3057\u3066\u3044\u307E\u305B\u3093（対応\u3067\u304D\u306A\u3044旨\u3082必\u305A正直\u306B伝\u3048\u3066\u304F\u3060\u3055\u3044）：`,
                  ...lastUnappliedInstructions.map((s) => `\u30FB${s}`),
                ]
              : [];
          fullPrompt = [
            `実行\u30B9\u30C6\u30FC\u30BF\u30B9: \u30EB\u30FC\u30EB変更 ${appliedSummary.length}件適用済 / \u30B7\u30D5\u30C8再計算（\u30BD\u30EB\u30D0\u30FC実行）: \u30B9\u30AD\u30C3\u30D7（未実行）`,
            `【今回適用\u3055\u308C\u305F\u30EB\u30FC\u30EB変更 (${appliedSummary.length}件)】`,
            ...appliedSummary.map((s) => `\u30FB${s}`),
            ...unappliedNote,
            ``,
            `\u30E6\u30FC\u30B6\u30FC\u306E発言: 「${userMessage}」`,
            `上記\u306E適用\u3055\u308C\u305F\u30EB\u30FC\u30EB変更内容（\u304A\u3088\u3073未対応\u306E指示\u304C\u3042\u308B場合\u306F\u305D\u306E旨、\u307E\u3060\u30B7\u30D5\u30C8再計算\u306F実行\u3057\u3066\u3044\u306A\u3044旨）\u3092簡潔\u306A箇条書\u304D\u3067回答\u3057\u3066\u304F\u3060\u3055\u3044。`,
          ].join("\n");
        }
      } else {
        const appliedBlock =
          appliedSummary.length > 0
            ? `【今回反映\u3057\u305F変更内容 (${appliedSummary.length}件)】\n${appliedSummary
                .map((s) => `\u30FB${s}`)
                .join("\n")}\n`
            : `【\u30B7\u30D5\u30C8表\u306E再作成完了】\n現在\u306E\u30EB\u30FC\u30EB設定\u306B基\u3065\u304D、\u30B7\u30D5\u30C8表全体\u3092再作成\u3057\u307E\u3057\u305F。\n`;

        let outcomeBlock = "";
        if (outcome.status === "Optimal" || outcome.status === "Feasible") {
          const ev = outcome.evaluation;
          const customShiftLines: string[] = [];
          for (const cs of state.customShiftDefs ?? []) {
            let totalAssigned = 0;
            let nursesAssigned = 0;
            let maxDailyAssigned = 0;
            let prevCompletedNurseCount = 0;
            const samplePlacements: string[] = [];
            if (ev && outcome.schedule) {
              for (const ds of ev.dailySummaries) {
                const dayCnt = ds.counts[cs.code] ?? 0;
                if (dayCnt > maxDailyAssigned) maxDailyAssigned = dayCnt;
              }
              for (const n of state.nurses) {
                const prevDone =
                  n.prevCompletedShifts?.[cs.code] ??
                  n.prevMonthShifts.filter((s) => s === cs.code).length;
                if (prevDone > 0) {
                  prevCompletedNurseCount++;
                }
                const c = ev.nurseSummaries[n.id]?.counts[cs.code] ?? 0;
                if (c > 0) {
                  totalAssigned += c;
                  nursesAssigned++;
                  if (samplePlacements.length < 3) {
                    const row = outcome.schedule[n.id] ?? [];
                    const csDays: string[] = [];
                    for (let d = 1; d <= state.config.numDays; d++) {
                      if (row[d - 1] === cs.code) csDays.push(`${state.config.month}/${d}`);
                    }
                    const shownDays =
                      csDays.length > 4
                        ? `${csDays.slice(0, 3).join("\u30FB")}他(計${csDays.length}回)`
                        : csDays.join("\u30FB");
                    samplePlacements.push(
                      `${n.name}(${cs.shortLabel}:${shownDays})`
                    );
                  }
                }
              }
            }
            const prevNote =
              prevCompletedNurseCount > 0
                ? ` / 前月実績\u3042\u308A:${prevCompletedNurseCount}名`
                : "";
            const zeroNote =
              totalAssigned === 0 && prevCompletedNurseCount === 0
                ? "（※\u307E\u3060配置人数\u3084対象期間\u306E\u30EB\u30FC\u30EB\u304C設定\u3055\u308C\u3066\u3044\u306A\u3044\u305F\u3081配置\u306F0回\u3067\u3059）"
                : "";
            customShiftLines.push(
              `\u30FB追加\u30B7\u30D5\u30C8「${cs.label}(${cs.shortLabel})」配置状況: 当月${nursesAssigned}名\u306B計${totalAssigned}回配置 (1日最大${maxDailyAssigned}名${prevNote})${zeroNote}${
                samplePlacements.length > 0 ? ` [配置先: ${samplePlacements.join(" / ")}]` : ""
              }`
            );
          }

          const diff = outcome.diffFromPrevious;
          const diffLine =
            diff && diff.totalCells > 0
              ? diff.changedCellsCount === 0
                ? `\u30FB前回\u306E\u30B7\u30D5\u30C8\u304B\u3089\u306E変更: 変更\u306A\u3057（既存\u306E\u30B7\u30D5\u30C8表\u3092100%維持）`
                : `\u30FB前回\u306E\u30B7\u30D5\u30C8\u304B\u3089\u306E変更: ${diff.affectedNursesCount}名\u306E\u30B9\u30BF\u30C3\u30D5\u30FB計${diff.changedCellsCount}\u30DE\u30B9\u306E\u307F最小限\u3067調整（既存\u30B7\u30D5\u30C8維持率 ${diff.retentionRatePct}%）`
              : "";

          const violationLine =
            ev && ev.violations.length > 0
              ? `\u30FB注意点（\u30BD\u30D5\u30C8条件\u306E妥協\u30FB未達 ${ev.violations.length}件）: ${ev.violations
                  .slice(0, 3)
                  .map((v) => v.message)
                  .join(" / ")}`
              : `\u30FB病棟\u306E必要人数\u30FB\u30B9\u30AD\u30EB配置\u30FB連勤上限: \u3059\u3079\u3066充足`;

          outcomeBlock = [
            `【\u30B7\u30D5\u30C8表\u306E更新結果（看護師向\u3051\u30B5\u30DE\u30EA\u30FC）】`,
            ev
              ? `\u30FB希望達成状況: 確定希望休 ${ev.hardRequestSatisfactionRate}% 達成 / 希望\u30B7\u30D5\u30C8 ${ev.softRequestSatisfactionRate}% 達成`
              : "",
            violationLine,
            diffLine,
            ...customShiftLines,
          ]
            .filter(Boolean)
            .join("\n");
        } else if (outcome.status === "Infeasible") {
          const conflictLines = outcome.conflicts
            .slice(0, 6)
            .map(
              (c) =>
                `  - ${c.labelJa}${c.relaxSuggestion ? ` (解決案: ${c.relaxSuggestion})` : ""}`
            )
            .join("\n");
          outcomeBlock = [
            `【⚠️ \u30B7\u30D5\u30C8\u3092作成\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F（条件\u306E競合）】`,
            `\u30FB\u3076\u3064\u304B\u3063\u3066\u3044\u308B条件 (${outcome.conflicts.length}件):`,
            conflictLines || "  - 複数\u306E条件\u3092同時\u306B満\u305F\u3059\u30B7\u30D5\u30C8\u304C存在\u3057\u307E\u305B\u3093",
          ].join("\n");
        }

        const unappliedBlock =
          lastUnappliedInstructions.length > 0
            ? `\n【⚠️ 未対応\u306E\u305F\u3081適用\u3067\u304D\u306A\u304B\u3063\u305F指示】\n以下\u306E指示\u306F本\u30B7\u30B9\u30C6\u30E0\u306E対応機能外\u3067\u3042\u308B\u305F\u3081適用\u3057\u3066\u3044\u307E\u305B\u3093（適用\u3067\u304D\u305F変更\u3068\u3042\u308F\u305B\u3066、\u3053\u306E指示\u306B\u306F対応\u3067\u304D\u306A\u3044旨\u3082必\u305A正直\u306B伝\u3048\u3066\u304F\u3060\u3055\u3044）：\n${lastUnappliedInstructions
                .map((s) => `\u30FB${s}`)
                .join("\n")}\n`
            : "";

        fullPrompt = `${appliedBlock}${unappliedBlock}${outcomeBlock}\n\n上記\u306E「今回反映\u3057\u305F変更内容」\u306B記載\u3055\u308C\u3066\u3044\u308B項目（\u304A\u3088\u3073「未対応\u306E\u305F\u3081適用\u3067\u304D\u306A\u304B\u3063\u305F指示」\u304C\u3042\u308B場合\u306F\u305D\u306E旨）\u3068「\u30B7\u30D5\u30C8表\u306E更新結果」\u306E\u307F\u3092、看護師\u30FB師長\u306B\u3068\u3063\u3066\u308F\u304B\u308A\u3084\u3059\u3044簡潔\u306A箇条書\u304D\u3067報告\u3057\u3066\u304F\u3060\u3055\u3044（※記載\u3055\u308C\u3066\u3044\u306A\u3044条件\u3092適用済\u307F\u3067\u3042\u308B\u304B\u306E\u3088\u3046\u306B書\u304D足\u3057\u305F\u308A、数理\u30BD\u30EB\u30D0\u30FC\u306E内部用語\u3092出\u3057\u305F\u308A\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044）。`;
      }
      const t3Start = performance.now();
      lastConsultTrace = {
        step: "turn3_consultation_stream",
        systemPrompt: CONSULT_SYSTEM_PROMPT,
        userPrompt: fullPrompt,
        rawOutput: "",
        durationMs: 0,
      };

      if (typeof turnSession.promptStreaming === "function") {
        let accumulated = "";
        try {
          const stream = turnSession.promptStreaming(fullPrompt, { signal });
          for await (const chunk of stream) {
            if (signal?.aborted) {
              const abortErr = new Error("Aborted");
              abortErr.name = "AbortError";
              throw abortErr;
            }
            if (typeof chunk === "string") {
              // Handle both delta chunks and cumulative chunks smoothly
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
        } finally {
          lastConsultTrace = {
            step: "turn3_consultation_stream",
            systemPrompt: CONSULT_SYSTEM_PROMPT,
            userPrompt: fullPrompt,
            rawOutput: accumulated,
            durationMs: Math.max(1, Math.round(performance.now() - t3Start)),
            tokenUsage: readSessionTokenUsage(turnSession),
          };
        }
        return;
      }

      let full = "";
      try {
        full = await turnSession.prompt(fullPrompt, { signal });
      } finally {
        lastConsultTrace = {
          step: "turn3_consultation_stream",
          systemPrompt: CONSULT_SYSTEM_PROMPT,
          userPrompt: fullPrompt,
          rawOutput: full,
          durationMs: Math.max(1, Math.round(performance.now() - t3Start)),
          tokenUsage: readSessionTokenUsage(turnSession),
        };
      }
      yield full;
    },

    async resetConversation(): Promise<void> {
      recentTurnHistory = [];
      pendingClarification = null;
      hadCustomState = false;
      if (
        activeConsultSession &&
        activeConsultSession !== consultBaseSession &&
        typeof activeConsultSession.destroy === "function"
      ) {
        try {
          activeConsultSession.destroy();
        } catch (_) {}
      }
      if (consultBaseSession) {
        if (typeof consultBaseSession.clone !== "function") {
          throw new Error("LanguageModel consult session does not support clone().");
        }
        activeConsultSession = await consultBaseSession.clone();
      }
    },

    destroy() {
      recentTurnHistory = [];
      pendingClarification = null;
      const allSessions = [
        activeConsultSession,
        consultBaseSession,
        routerBaseSession,
        ...Object.values(stage2BaseSessions),
      ];
      for (const s of allSessions) {
        if (s && typeof s.destroy === "function") {
          try {
            s.destroy();
          } catch (_) {}
        }
      }
      activeConsultSession = null;
      consultBaseSession = null;
      routerBaseSession = null;
      for (const k of Object.keys(stage2BaseSessions) as Array<keyof typeof stage2BaseSessions>) {
        delete stage2BaseSessions[k];
      }
    },
  };
}

function inferShortLabelAndCode(
  shiftName: string,
  existingDefs: readonly CustomShiftDef[]
): { code: string; shortLabel: string; label: string } {
  const clean = shiftName
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/\u30B7\u30D5\u30C8$/g, "")
    .trim();
  const label = clean;

  const existing = existingDefs.find(
    (d) => d.code === clean || d.label === label || d.shortLabel === label
  );
  if (existing) {
    return { code: existing.code, shortLabel: existing.shortLabel, label: existing.label };
  }

  const shortLabel = label.slice(0, 1) || "C";
  const preferredCode =
    /^[A-Za-z0-9_]+$/.test(clean) && !["D", "E", "N", "O", "W", "EN"].includes(clean)
      ? clean
      : `CS${existingDefs.length + 1}`;

  let code = preferredCode;
  let seq = 1;
  while (
    ["D", "E", "N", "O", "W", "EN"].includes(code) ||
    existingDefs.some((d) => d.code === code)
  ) {
    code = `CS${seq++}`;
  }

  return { code, shortLabel, label };
}

function resolveExistingShiftCode(
  rawShiftName: string | undefined,
  existingDefs: readonly CustomShiftDef[]
): ShiftCode | null {
  if (!rawShiftName) return null;
  const clean = rawShiftName
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/\u30B7\u30D5\u30C8$/g, "")
    .trim();
  if (!clean) return null;
  if (clean === "D" || clean === "E" || clean === "N" || clean === "O") {
    return clean;
  }
  const existing = existingDefs.find(
    (d) => d.code === clean || d.label === clean || d.shortLabel === clean
  );
  return existing ? existing.code : null;
}

function inferSkillCodeAndLabel(
  rawSkillName: string,
  existingDefs: readonly SkillDefinition[]
): { code: NurseSkill; shortLabel: string; label: string } {
  const clean = rawSkillName
    .trim()
    .replace(/^[「『"']|[」』"']$/g, "")
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/\u30B9\u30AD\u30EB|資格/g, "")
    .trim();
  const label = clean;

  const byExisting = findSkillOrAttributeDef(clean, existingDefs);
  if (byExisting && byExisting.code !== "all") {
    return {
      code: byExisting.code,
      shortLabel: byExisting.shortLabel ?? byExisting.label.slice(0, 2),
      label: byExisting.label,
    };
  }

  const shortLabel = label.slice(0, 2);
  let seq = existingDefs.length + 1;
  let code = /^[a-z0-9_]+$/i.test(clean) ? clean : `skill_${seq}`;
  while (existingDefs.some((d) => d.code === code)) {
    seq++;
    code = `skill_${seq}`;
  }
  return { code, shortLabel, label };
}

function resolveAttributeCodeAndLabel(
  rawAttribute: string,
  existingSkillDefs: readonly SkillDefinition[]
): {
  code: string;
  label: string;
  shortLabel: string;
  isSkill: boolean;
  isUnknownCustomSkill: boolean;
} {
  const rawTrimmed = rawAttribute
    .trim()
    .replace(/^[「『"']|[」』"']$/g, "")
    .trim();
  const s = rawTrimmed.replace(/\([^)]*\)|（[^）]*）/g, "").trim() || rawTrimmed;

  const matched =
    findSkillOrAttributeDef(rawTrimmed, existingSkillDefs) ??
    findSkillOrAttributeDef(s, existingSkillDefs);
  if (matched) {
    const isSkill =
      matched.code !== "all" &&
      ("category" in matched ? (matched.category ?? "skill") === "skill" : true);
    return {
      code: matched.code,
      label: matched.label,
      shortLabel: matched.shortLabel ?? matched.label.slice(0, 2),
      isSkill,
      isUnknownCustomSkill: false,
    };
  }

  const inferred = inferSkillCodeAndLabel(s, existingSkillDefs);
  return {
    code: inferred.code,
    label: inferred.label,
    shortLabel: inferred.shortLabel,
    isSkill: true,
    isUnknownCustomSkill: true,
  };
}

function mergeBuiltInAndCustomShiftAliases(
  customShiftDefs: readonly CustomShiftDef[],
  existingAliases?: readonly ShiftAliasDef[]
): ShiftAliasDef[] {
  const builtInAliases = createDefaultShiftAliases(customShiftDefs);
  const builtInCodes = new Set(builtInAliases.map((a) => a.code));
  const customAliases = (existingAliases ?? []).filter((a) => !builtInCodes.has(a.code));
  return [...builtInAliases, ...customAliases];
}

/**
 * Applies structured operations extracted by Gemini Nano to the current `NurseSchedulingState`.
 */
export function applyChatOperationsToState(
  state: NurseSchedulingState,
  operations: readonly ChatConstraintOperation[]
): {
  updatedState: NurseSchedulingState;
  appliedLogs: string[];
  rejectedLogs: string[];
} {
  let nextState: NurseSchedulingState = {
    config: { ...state.config },
    nurses: [...state.nurses],
    relations: [...state.relations],
    preferences: [...state.preferences],
    customRules: [...state.customRules],
    customShiftDefs: [...(state.customShiftDefs ?? [])],
    shiftAliases: [...(state.shiftAliases ?? createDefaultShiftAliases())],
    skillDefs: [...(state.skillDefs ?? createDefaultSkillDefs())],
  };
  const appliedLogs: string[] = [];
  const rejectedLogs: string[] = [];

  for (const op of operations) {
    if (op.op === "reset_default") {
      nextState = generateNurseSchedulingState({
        year: nextState.config.year,
        month: nextState.config.month,
        staffCount: nextState.config.staffCount,
      });
      appliedLogs.push("\u3059\u3079\u3066\u306E制約\u3068設定\u3092初期状態\u306B\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F");
      continue;
    }

    if (op.op === "add_skill_def" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const { code, shortLabel, label } = inferSkillCodeAndLabel(
        op.skillName,
        activeSkills
      );
      if (!label) {
        rejectedLogs.push(`\u30b9\u30ad\u30eb名 "${op.skillName}" \u304c空\u307e\u305f\u306f不正\u3067\u3059`);
        continue;
      }
      const existingIdx = activeSkills.findIndex(
        (s) => s.code === code || s.label === label
      );
      if (existingIdx >= 0 || findSkillOrAttributeDef(op.skillName, activeSkills)) {
        rejectedLogs.push(`\u30b9\u30ad\u30eb「${label}」\u306f既\u306b登録\u3055\u308c\u3066\u3044\u307e\u3059`);
        continue;
      }
      if (
        (op.skillMinDay !== undefined &&
          (typeof op.skillMinDay !== "number" ||
            !Number.isInteger(op.skillMinDay) ||
            op.skillMinDay < 0)) ||
        (op.skillMinEvening !== undefined &&
          (typeof op.skillMinEvening !== "number" ||
            !Number.isInteger(op.skillMinEvening) ||
            op.skillMinEvening < 0)) ||
        (op.skillMinNight !== undefined &&
          (typeof op.skillMinNight !== "number" ||
            !Number.isInteger(op.skillMinNight) ||
            op.skillMinNight < 0))
      ) {
        rejectedLogs.push(`\u30b9\u30ad\u30eb「${label}」\u306e最低配置人数\u304c不正\u3067\u3059`);
        continue;
      }
      const substitutesFor = op.substitutesFor
        ? inferSkillCodeAndLabel(op.substitutesFor, activeSkills).code
        : undefined;
      const minDay = op.skillMinDay ?? 0;
      const minEvening = op.skillMinEvening ?? 0;
      const minNight = op.skillMinNight ?? 0;

      const newSkillDef: SkillDefinition = {
        code,
        label,
        shortLabel: op.skillShortLabel?.trim() || shortLabel,
        category: "skill",
        substitutesFor,
        minDay,
        minEvening,
        minNight,
        builtIn: false,
      };
      activeSkills.push(newSkillDef);
      nextState.skillDefs = activeSkills;

      const subTargetMeta = substitutesFor
        ? getSkillMeta(substitutesFor, activeSkills)
        : null;
      const subDesc = subTargetMeta
        ? ` / 「${subTargetMeta.label}」\u306E代行可（配置必要人数\u306B\u30AB\u30A6\u30F3\u30C8）`
        : "";
      const minDesc =
        minDay > 0 || minEvening > 0 || minNight > 0
          ? ` / 最低配置(日:${minDay}\u30FB準:${minEvening}\u30FB深:${minNight}名)`
          : "";
      appliedLogs.push(
        `\u30B9\u30AD\u30EB追加: 「${newSkillDef.label} (${newSkillDef.shortLabel})」\u3092登録\u3057\u307E\u3057\u305F${subDesc}${minDesc}`
      );
      continue;
    }

    if (op.op === "remove_skill_def" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawName = op.skillName.trim();
      const matchedDef = findSkillOrAttributeDef(rawName, activeSkills);
      const { code, label } = inferSkillCodeAndLabel(rawName, activeSkills);
      const targetDef =
        (matchedDef && matchedDef.code !== "all"
          ? activeSkills.find((s) => s.code === matchedDef.code)
          : undefined) ??
        activeSkills.find((s) => s.code === code || s.label === label || s.label === rawName);
      if (!targetDef) {
        rejectedLogs.push(`削除対象\u30b9\u30ad\u30eb "${op.skillName}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      const targetCode = targetDef.code;
      const targetLabel = targetDef.label;

      nextState.skillDefs = activeSkills
        .filter((s) => s.code !== targetCode)
        .map((s) =>
          s.substitutesFor === targetCode ? { ...s, substitutesFor: undefined } : s
        );
      nextState.nurses = nextState.nurses.map((n) =>
        n.skills.includes(targetCode)
          ? { ...n, skills: n.skills.filter((sk) => sk !== targetCode) }
          : n
      );
      appliedLogs.push(
        `\u30B9\u30AD\u30EB削除: 「${targetLabel}」\u3092\u30B9\u30AD\u30EB定義\u304A\u3088\u3073全\u30B9\u30BF\u30C3\u30D5\u306E保有\u30B9\u30AD\u30EB\u304B\u3089削除\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "update_nurse_skill" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const { code, shortLabel, label } = inferSkillCodeAndLabel(
        op.skillName,
        activeSkills
      );
      if (!activeSkills.some((s) => s.code === code)) {
        rejectedLogs.push(`\u30b9\u30ad\u30eb "${op.skillName}" \u306f登録\u3055\u308c\u3066\u3044\u307e\u305b\u3093`);
        continue;
      }
      if (op.skillAction !== "add" && op.skillAction !== "remove") {
        rejectedLogs.push(`\u30b9\u30ad\u30eb操作種別 "${String(op.skillAction)}" \u304c不正\u3067\u3059`);
        continue;
      }
      const action = op.skillAction;
      const targetNurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      const targetAttr = op.attribute;
      if (!targetNurse && !targetAttr) {
        rejectedLogs.push(`\u30b9\u30ad\u30eb変更対象 "${op.nurseNameOrId ?? ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      let countChanged = 0;

      nextState.nurses = nextState.nurses.map((n) => {
        const isMatch = targetNurse
          ? n.id === targetNurse.id
          : targetAttr === "all"
            ? true
            : targetAttr
              ? doesNurseMatchAttribute(n, targetAttr, activeSkills)
              : false;
        if (!isMatch) return n;
        if (action === "add" && !n.skills.includes(code)) {
          countChanged++;
          return { ...n, skills: [...n.skills, code] };
        }
        if (action === "remove" && n.skills.includes(code)) {
          countChanged++;
          return { ...n, skills: n.skills.filter((sk) => sk !== code) };
        }
        return n;
      });

      const resolvedTargetMeta = targetAttr
        ? resolveAttributeCodeAndLabel(targetAttr, activeSkills)
        : null;
      const whoLabel = targetNurse
        ? `${targetNurse.name}(${targetNurse.id})`
        : targetAttr === "all"
          ? `\u30B9\u30BF\u30C3\u30D5全員(${countChanged}名)`
          : resolvedTargetMeta
            ? `${resolvedTargetMeta.label}(${countChanged}名)`
            : `対象\u30B9\u30BF\u30C3\u30D5(${countChanged}名)`;
      appliedLogs.push(
        `\u30B9\u30BF\u30C3\u30D5\u30B9\u30AD\u30EB変更: ${whoLabel} \u306B\u30B9\u30AD\u30EB「${label}(${shortLabel})」\u3092${
          action === "add" ? "付与" : "解除"
        }\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "set_staffing_rule") {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = op.attribute;
      if (!rawAttr) {
        rejectedLogs.push("配置\u30eb\u30fc\u30eb\u306e対象属性\u304c指定\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
        continue;
      }
      const resolved = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const resolvedTarget = resolveTargetShiftsFromArg(
        op.targetShift,
        op.shifts,
        nextState
      );
      if (!resolvedTarget) {
        rejectedLogs.push(`配置\u30eb\u30fc\u30eb\u306e対象\u30b7\u30d5\u30c8 "${op.targetShift ?? ""}" \u304c不正\u3067\u3059`);
        continue;
      }
      const { shifts } = resolvedTarget;
      const validMin =
        op.minCount === undefined ||
        (typeof op.minCount === "number" && Number.isInteger(op.minCount) && op.minCount >= 0);
      const validMax =
        op.maxCount === undefined ||
        (typeof op.maxCount === "number" && Number.isInteger(op.maxCount) && op.maxCount >= 0);
      if (!validMin || !validMax || (op.minCount === undefined && op.maxCount === undefined)) {
        rejectedLogs.push("配置\u30eb\u30fc\u30eb\u306e人数範囲\u304c不正\u3067\u3059");
        continue;
      }
      const minCount = op.minCount;
      const maxCount = op.maxCount;

      const shiftLabels = shifts
        .map((s) => getShiftMeta(s, nextState.customShiftDefs, nextState.shiftAliases).label)
        .join("\u30FB");
      const boundParts: string[] = [];
      if (typeof minCount === "number") boundParts.push(`下限${minCount}名以上`);
      if (typeof maxCount === "number") {
        boundParts.push(maxCount === 0 ? "上限0名(配置禁止)" : `上限${maxCount}名以下`);
      }
      const boundDesc = boundParts.join(" / ");

      const shiftsKey = shifts.join(",");
      nextState.customRules = nextState.customRules.filter(
        (r) =>
          !(
            r.kind === "staffing_rule" &&
            r.attribute === resolved.code &&
            (r.shifts ?? []).join(",") === shiftsKey
          )
      );

      const rule: CustomConstraintRule = {
        id: `staffing_${resolved.code}_${shifts.join("_")}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "staffing_rule",
        enabled: true,
        isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
        penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
        shifts,
        attribute: resolved.code,
        minCount,
        maxCount,
        description: `\u30B0\u30EB\u30FC\u30D7/\u30B9\u30AD\u30EB人数\u30EB\u30FC\u30EB: [${shiftLabels}] \u306E「${resolved.label}」\u3092 ${boundDesc} \u306B設定`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "set_nurse_contract" && op.nurseNameOrId) {
      const targetNurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      if (!targetNurse) {
        rejectedLogs.push(`契約変更対象\u30b9\u30bf\u30c3\u30d5 "${op.nurseNameOrId}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      const invalidNumeric =
        (op.maxMonthlyNightShifts !== undefined &&
          (!Number.isInteger(op.maxMonthlyNightShifts) || op.maxMonthlyNightShifts < 0)) ||
        (op.minMonthlyDaysOff !== undefined &&
          (!Number.isInteger(op.minMonthlyDaysOff) || op.minMonthlyDaysOff < 0)) ||
        (op.minMonthlyWorkDays !== undefined &&
          (!Number.isInteger(op.minMonthlyWorkDays) || op.minMonthlyWorkDays < 0)) ||
        (op.maxMonthlyWorkDays !== undefined &&
          (!Number.isInteger(op.maxMonthlyWorkDays) || op.maxMonthlyWorkDays < 0)) ||
        (op.maxConsecutiveWorkDays !== undefined &&
          (!Number.isInteger(op.maxConsecutiveWorkDays) || op.maxConsecutiveWorkDays < 1));
      if (invalidNumeric) {
        rejectedLogs.push(`\u30b9\u30bf\u30c3\u30d5 "${targetNurse.name}" \u306e契約数値\u304c範囲外\u307e\u305f\u306f整数\u3067\u306f\u3042\u308a\u307e\u305b\u3093`);
        continue;
      }
      const changes: string[] = [];
      if (op.resetContract) {
        nextState = clearNurseContractFromState(nextState, targetNurse.id);
        changes.push("制限解除(標準契約\u306B復帰)");
      }
      nextState.nurses = nextState.nurses.map((n) => {
        if (n.id !== targetNurse.id) return n;
        const updated = { ...n };
        if (typeof op.nightOk === "boolean" && !op.resetContract) {
          updated.nightOk = op.nightOk;
          changes.push(op.nightOk ? "夜勤可" : "日勤専従(夜勤免除)");
        }
        if (typeof op.maxMonthlyNightShifts === "number") {
          updated.maxMonthlyNightShifts = op.maxMonthlyNightShifts;
          changes.push(`月間夜勤上限=${updated.maxMonthlyNightShifts}回`);
        }
        if (typeof op.minMonthlyDaysOff === "number") {
          updated.minMonthlyDaysOff = op.minMonthlyDaysOff;
          changes.push(`月間最低公休=${updated.minMonthlyDaysOff}日`);
        }
        if (typeof op.minMonthlyWorkDays === "number") {
          updated.minMonthlyWorkDays = op.minMonthlyWorkDays;
          changes.push(`月間最低勤務=${updated.minMonthlyWorkDays}日`);
        }
        if (typeof op.maxMonthlyWorkDays === "number") {
          updated.maxMonthlyWorkDays = op.maxMonthlyWorkDays;
          changes.push(`月間最大勤務=${updated.maxMonthlyWorkDays}日`);
        }
        if (typeof op.maxConsecutiveWorkDays === "number") {
          updated.maxConsecutiveWorkDays = op.maxConsecutiveWorkDays;
          changes.push(`最大連勤=${updated.maxConsecutiveWorkDays}連勤`);
        }
        if (Array.isArray(op.forbiddenShifts) && !op.resetContract) {
          if (op.forbiddenShifts.length === 0) {
            updated.forbiddenShifts = undefined;
          } else {
            updated.forbiddenShifts = op.forbiddenShifts;
            if (op.forbiddenShifts.includes("D")) {
              changes.push("夜勤専従(日勤免除)");
            } else if (op.forbiddenShifts.includes("N")) {
              changes.push("深夜勤免除");
            } else if (op.forbiddenShifts.includes("E")) {
              changes.push("準夜勤免除");
            }
          }
        }
        if (typeof op.weekdayOnly === "boolean" && !op.resetContract) {
          updated.weekdayOnly = op.weekdayOnly || undefined;
          if (op.weekdayOnly && !op.holidaysOff) {
            changes.push("平日\u306E\u307F勤務(土日休)");
          }
        }
        if (typeof op.holidaysOff === "boolean" && !op.resetContract) {
          updated.holidaysOff = op.holidaysOff || undefined;
          if (op.holidaysOff) {
            changes.push(op.weekdayOnly ? "土日祝休\u307F" : "祝日休\u307F");
          } else {
            changes.push("祝日休\u307F解除");
          }
        }
        return updated;
      });
      if (changes.length > 0) {
        appliedLogs.push(
          `個別勤務契約変更: ${targetNurse.name}(${targetNurse.id}) \u3092 [${changes.join(" / ")}] \u306B設定\u3057\u307E\u3057\u305F`
        );
      } else {
        rejectedLogs.push(`\u30b9\u30bf\u30c3\u30d5 "${targetNurse.name}" \u3078\u306e契約変更内容\u304c空\u3067\u3059`);
      }
      continue;
    }

    if (op.op === "set_shift_transition" && op.fromShift && op.toShift && op.transitionPolicy) {
      const from = op.fromShift;
      const to = op.toShift;
      const policy = op.transitionPolicy;
      nextState.config = applyShiftTransitionToConfig(nextState.config, from, to, policy);
      const policyLabel =
        policy === "forbid" ? "禁止" : policy === "require" ? "必須" : "許可";
      appliedLogs.push(
        `\u30B7\u30D5\u30C8遷移設定: 「${SHIFT_LABELS[from]}(${from}) → 翌日${SHIFT_LABELS[to]}(${to})」\u3092 ${policyLabel} \u306B変更\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "add_preceptor_pair" && op.nurseNameOrId && op.nurseBNameOrId) {
      const nA = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const nB = resolveNurseFromText(op.nurseBNameOrId, nextState.nurses);
      if (!nA || !nB || nA.id === nB.id) {
        rejectedLogs.push(
          `\u30d7\u30ea\u30bb\u30d7\u30bf\u30fc\u30da\u30a2\u306e対象\u30b9\u30bf\u30c3\u30d5 (${op.nurseNameOrId} / ${op.nurseBNameOrId}) \u304c見\u3064\u304b\u3089\u306a\u3044\u304b同一人物\u3067\u3059`
        );
        continue;
      }
      const resolvedShifts = normalizeActiveShifts(op.shifts, nextState);
      if (resolvedShifts === null) {
        rejectedLogs.push("\u30d7\u30ea\u30bb\u30d7\u30bf\u30fc\u30da\u30a2\u306e対象\u30b7\u30d5\u30c8\u304c不正\u307e\u305f\u306f空\u3067\u3059");
        continue;
      }
      const targetShifts: ShiftCode[] = resolvedShifts ?? ["E", "N"];
      nextState.relations.push({
        id: `chat_preceptor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nurseA: nA.id,
        nurseB: nB.id,
        type: "preceptor",
        enabled: true,
        shifts: targetShifts,
        isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
        penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
        reason: "\u30C1\u30E3\u30C3\u30C8指示\u306B\u3088\u308B\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC指導\u30DA\u30A2設定",
      });
      appliedLogs.push(
        `\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC指導\u30DA\u30A2追加: ${nA.name}(${nA.id}) × ${nB.name}(${nB.id}) \u306E同行\u30B7\u30D5\u30C8([${targetShifts.join("/")}])\u3092有効化\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "inject_conflict_demo") {
      const injected = injectConflictScenario(nextState, "leader_shortage");
      nextState = injected.updatedState;
      appliedLogs.push(injected.descriptionJa);
      continue;
    }

    if (op.op === "clear_custom_rules") {
      for (const cs of [...nextState.customShiftDefs]) {
        nextState = removeCustomShiftFromState(nextState, cs.code);
      }
      nextState.customRules = [];
      nextState.customShiftDefs = [];
      nextState.relations = nextState.relations.filter(
        (r) =>
          !r.id?.startsWith("chat_ng_") &&
          !r.id?.startsWith("chat_preceptor_") &&
          r.reason !== "\u30C1\u30E3\u30C3\u30C8指示\u306B\u3088\u308B\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC指導\u30DA\u30A2設定"
      );
      appliedLogs.push("追加\u3055\u308C\u305F個別\u30AB\u30B9\u30BF\u30E0制約\u304A\u3088\u3073追加\u30B7\u30D5\u30C8種別\u3092\u3059\u3079\u3066解除\u3057\u307E\u3057\u305F");
      continue;
    }

    if (op.op === "add_custom_shift" && (op.shiftName || op.shift)) {
      const rawName = (op.shiftName || op.shift || "").trim();
      if (!rawName) {
        rejectedLogs.push("追加\u30b7\u30d5\u30c8名\u304c空\u3067\u3059");
        continue;
      }
      const { code: inferredCode, shortLabel, label } = inferShortLabelAndCode(
        rawName,
        nextState.customShiftDefs
      );
      const reservedCodes = new Set([
        "D",
        "E",
        "N",
        "O",
        "W",
        "EN",
        ...(nextState.shiftAliases ?? []).flatMap((a) => [a.code, a.code.toUpperCase()]),
      ]);
      if (reservedCodes.has(label) || reservedCodes.has(label.toUpperCase())) {
        rejectedLogs.push(`\u30b7\u30d5\u30c8名 "${label}" \u306f予約語\u3068重複\u3057\u3066\u3044\u307e\u3059`);
        continue;
      }
      const existingByLabel = nextState.customShiftDefs.find((d) => d.label === label);
      const rawExplicit = op.shiftName ? (op.shift?.trim() ?? "") : "";
      if (rawExplicit.length > 0) {
        const isInvalidOrReserved =
          !/^[A-Za-z0-9_]+$/.test(rawExplicit) ||
          reservedCodes.has(rawExplicit) ||
          reservedCodes.has(rawExplicit.toUpperCase());
        const collidesWithOtherCustomShift = nextState.customShiftDefs.some(
          (d) => d.code.toUpperCase() === rawExplicit.toUpperCase() && d.label !== label
        );
        const conflictsWithExistingLabelCode =
          Boolean(existingByLabel) &&
          existingByLabel!.code.toUpperCase() !== rawExplicit.toUpperCase();
        if (
          isInvalidOrReserved ||
          collidesWithOtherCustomShift ||
          conflictsWithExistingLabelCode
        ) {
          rejectedLogs.push(`\u30ab\u30b9\u30bf\u30e0\u30b7\u30d5\u30c8\u30b3\u30fc\u30c9 "${rawExplicit}" \u306f無効\u307e\u305f\u306f重複\u3057\u3066\u3044\u307e\u3059`);
          continue;
        }
      }
      let code = rawExplicit.length > 0 ? rawExplicit : (existingByLabel?.code ?? inferredCode);
      const finalShort = op.shortLabel?.trim() || shortLabel;
      const baseShift: BaseShiftCode = op.baseShift ?? "D";
      const includedInAliases = Array.isArray(op.includedInAliases)
        ? op.includedInAliases
        : undefined;
      const timeRange =
        baseShift === "E"
          ? "16:30–01:00"
          : baseShift === "N"
            ? "00:30–09:00"
            : baseShift === "O"
              ? "終日 (休暇)"
              : "09:00–17:00";
      const countsAsWorkDay =
        typeof op.countsAsWorkDay === "boolean" ? op.countsAsWorkDay : baseShift !== "O";
      const overtimeHoursPerShift = baseShift === "O" ? 0 : 0.5;
      if (!existingByLabel) {
        let seq = 1;
        while (
          reservedCodes.has(code) ||
          reservedCodes.has(code.toUpperCase()) ||
          nextState.customShiftDefs.some((d) => d.code.toUpperCase() === code.toUpperCase())
        ) {
          code = `CS${nextState.customShiftDefs.length + seq}`;
          seq++;
        }
        nextState.customShiftDefs.push({
          code,
          shortLabel: finalShort,
          label,
          baseShift,
          includedInAliases,
          timeRange,
          colorClass: "shift-custom",
          countsAsWorkDay,
          overtimeHoursPerShift,
        });
        nextState.shiftAliases = mergeBuiltInAndCustomShiftAliases(
          nextState.customShiftDefs,
          nextState.shiftAliases
        );
        appliedLogs.push(
          `新\u3057\u3044\u30B7\u30D5\u30C8種別「${finalShort}: ${label} (${timeRange}, 所属:${baseShift})」\u3092追加\u3057\u307E\u3057\u305F`
        );
      } else {
        existingByLabel.baseShift = baseShift;
        existingByLabel.timeRange = timeRange;
        existingByLabel.countsAsWorkDay = countsAsWorkDay;
        existingByLabel.overtimeHoursPerShift = overtimeHoursPerShift;
        if (op.shortLabel?.trim()) {
          existingByLabel.shortLabel = op.shortLabel.trim();
        }
        if (includedInAliases !== undefined) {
          existingByLabel.includedInAliases = includedInAliases;
        }
        nextState.shiftAliases = mergeBuiltInAndCustomShiftAliases(
          nextState.customShiftDefs,
          nextState.shiftAliases
        );
        appliedLogs.push(
          `\u30B7\u30D5\u30C8種別「${existingByLabel.shortLabel}: ${existingByLabel.label} (${existingByLabel.timeRange}, 所属:${baseShift})」\u3092更新\u3057\u307E\u3057\u305F`
        );
      }
      continue;
    }

    if (op.op === "add_shift_quota") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) {
        rejectedLogs.push(`\u30b7\u30d5\u30c8 "${op.shiftName || op.shift || ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const nurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = nurse ? undefined : op.attribute;
      if (op.nurseNameOrId && !nurse) {
        rejectedLogs.push(`\u30ce\u30eb\u30de対象\u30b9\u30bf\u30c3\u30d5 "${op.nurseNameOrId}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      if (!nurse && !rawAttr) {
        rejectedLogs.push("\u30b7\u30d5\u30c8回数\u30eb\u30fc\u30eb\u306e対象\u30b9\u30bf\u30c3\u30d5\u307e\u305f\u306f属性\u304c指定\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
        continue;
      }

      const resolvedAttr = rawAttr
        ? resolveAttributeCodeAndLabel(rawAttr, activeSkills)
        : null;
      const attribute = nurse
        ? undefined
        : rawAttr === "all"
          ? "all"
          : resolvedAttr && !resolvedAttr.isUnknownCustomSkill
            ? resolvedAttr.code
            : rawAttr;

      const validMin =
        op.minCount === undefined ||
        (typeof op.minCount === "number" && Number.isInteger(op.minCount) && op.minCount >= 0);
      const validMax =
        op.maxCount === undefined ||
        (typeof op.maxCount === "number" && Number.isInteger(op.maxCount) && op.maxCount >= 0);
      if (!validMin || !validMax || (op.minCount === undefined && op.maxCount === undefined)) {
        rejectedLogs.push("\u30b7\u30d5\u30c8回数\u30eb\u30fc\u30eb\u306e回数\u304c不正\u3067\u3059");
        continue;
      }
      const minCount = op.minCount;
      const maxCount = op.maxCount;

      const countText =
        minCount !== undefined && maxCount !== undefined && minCount === maxCount
          ? `\u3061\u3087\u3046\u3069${minCount}回`
          : minCount !== undefined && maxCount !== undefined
            ? `${minCount}〜${maxCount}回`
            : minCount !== undefined
              ? `${minCount}回以上`
              : `${maxCount}回以下`;

      const targetLabel = nurse
        ? `${nurse.name}(${nurse.id})`
        : attribute === "all"
          ? "\u30B9\u30BF\u30C3\u30D5全員"
          : `${resolvedAttr?.label ?? getSkillMeta(String(attribute), activeSkills).label}全員`;

      nextState.customRules = nextState.customRules.filter(
        (r) =>
          !(
            r.kind === "shift_count_quota" &&
            r.shift === shiftCode &&
            r.attribute === attribute &&
            r.nurseId === nurse?.id
          )
      );

      const rule: CustomConstraintRule = {
        id: `quota_${shiftCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "shift_count_quota",
        enabled: true,
        nurseId: nurse?.id,
        attribute,
        shift: shiftCode,
        minCount,
        maxCount,
        description: `${targetLabel}\u306F「${meta.label}」\u3092月${countText}取得\u3059\u308B`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(`\u30B7\u30D5\u30C8回数\u30EB\u30FC\u30EB追加: ${rule.description}`);
      continue;
    }

    if (op.op === "add_shift_day_restriction") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) {
        rejectedLogs.push(`\u30b7\u30d5\u30c8 "${op.shiftName || op.shift || ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const hasDateBounds = op.startDay !== undefined || op.endDay !== undefined;
      let startDay: number | undefined;
      let endDay: number | undefined;
      if (hasDateBounds) {
        if (
          typeof op.startDay !== "number" ||
          typeof op.endDay !== "number" ||
          !Number.isInteger(op.startDay) ||
          !Number.isInteger(op.endDay) ||
          op.startDay < 1 ||
          op.endDay > nextState.config.numDays ||
          op.startDay > op.endDay
        ) {
          rejectedLogs.push(
            `期間制限\u306e日付範囲 (${String(op.startDay)}〜${String(op.endDay)}) \u304c不正\u3067\u3059`
          );
          continue;
        }
        startDay = op.startDay;
        endDay = op.endDay;
      }
      const allowedDays =
        op.allowedDaysOfWeek && op.allowedDaysOfWeek.length > 0
          ? op.allowedDaysOfWeek
          : undefined;
      if (!hasDateBounds && !allowedDays) {
        rejectedLogs.push("期間\u30fb曜日\u306e\u3044\u305a\u308c\u3082指定\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
        continue;
      }

      const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
      const descParts: string[] = [];
      if (startDay !== undefined && endDay !== undefined) {
        const spanDays = endDay - startDay + 1;
        descParts.push(
          startDay === endDay
            ? `${nextState.config.month}/${startDay}\u306E\u307F`
            : `${nextState.config.month}/${startDay}〜${nextState.config.month}/${endDay} (計${spanDays}日間) \u306E\u307F`
        );
      }
      if (allowedDays && allowedDays.length > 0) {
        const isWeekdays =
          allowedDays.length === 5 &&
          [1, 2, 3, 4, 5].every((d) => allowedDays.includes(d));
        descParts.push(
          isWeekdays
            ? "平日(月〜金)\u306E\u307F（土日不可）"
            : `${allowedDays.map((d) => `${dowNames[d]}曜`).join("\u30FB")}\u306E\u307F`
        );
      }
      const restrictionLabel = descParts.join("\u30FB");

      nextState.customRules = nextState.customRules.filter(
        (r) => !(r.kind === "shift_day_restriction" && r.shift === shiftCode)
      );

      const rule: CustomConstraintRule = {
        id: `day_restrict_${shiftCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "shift_day_restriction",
        enabled: true,
        shift: shiftCode,
        allowedDaysOfWeek: allowedDays,
        startDay,
        endDay,
        description: `${hasDateBounds ? "\u30B7\u30D5\u30C8期間制限" : "\u30B7\u30D5\u30C8曜日制限"}: 「${meta.label}」\u306F${restrictionLabel}\u306B配置\u3059\u308B（期間外\u306F配置不可）`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "add_shift_prerequisite") {
      const prereqCode = resolveExistingShiftCode(
        op.shiftName || op.prereqShift || op.shift,
        nextState.customShiftDefs
      );
      if (!prereqCode) {
        rejectedLogs.push(`先行条件\u30b7\u30d5\u30c8 "${op.shiftName || op.prereqShift || op.shift || ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }

      const meta = getShiftMeta(prereqCode, nextState.customShiftDefs);
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = op.attribute;
      const rawK = op.prereqMinCount;
      if (!rawAttr || typeof rawK !== "number" || !Number.isInteger(rawK) || rawK < 1) {
        rejectedLogs.push("先行条件\u306e対象属性\u307e\u305f\u306f必要回数(1以上)\u304c不正\u3067\u3059");
        continue;
      }
      const resolvedAttr = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const attribute =
        rawAttr === "all"
          ? "all"
          : !resolvedAttr.isUnknownCustomSkill
            ? resolvedAttr.code
            : rawAttr;
      const kReq = rawK;
      const resolvedRestricted = normalizeActiveShifts(op.restrictedShifts, nextState);
      if (resolvedRestricted === null) {
        rejectedLogs.push("先行条件\u306e対象夜勤\u30b7\u30d5\u30c8指定\u304c不正\u3067\u3059");
        continue;
      }
      const restricted: ShiftCode[] = resolvedRestricted ?? ["E", "N"];
      const targetLabel =
        attribute === "all"
          ? "\u30B9\u30BF\u30C3\u30D5全員"
          : `${resolvedAttr.label || getSkillMeta(attribute, activeSkills).label}全員`;

      nextState.customRules = nextState.customRules.filter(
        (r) =>
          !(
            r.kind === "shift_prerequisite" &&
            r.prereqShift === prereqCode &&
            r.attribute === attribute
          )
      );

      const rule: CustomConstraintRule = {
        id: `prereq_${prereqCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "shift_prerequisite",
        enabled: true,
        attribute,
        prereqShift: prereqCode,
        prereqMinCount: kReq,
        restrictedShifts: restricted,
        description: `先行条件\u30EB\u30FC\u30EB: ${targetLabel}\u306F「${meta.label}」\u3092${kReq}回受\u3051\u305F翌営業日以降\u3067\u306A\u3044\u3068夜勤(準夜\u30FB深夜)\u306B入\u308C\u306A\u3044`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "add_daily_shift_cap") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) {
        rejectedLogs.push(`1日配置\u30eb\u30fc\u30eb対象\u30b7\u30d5\u30c8 "${op.shiftName || op.shift || ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }

      const validMin =
        op.minStaff === undefined ||
        (typeof op.minStaff === "number" && Number.isInteger(op.minStaff) && op.minStaff >= 0);
      const validMax =
        op.maxStaff === undefined ||
        (typeof op.maxStaff === "number" && Number.isInteger(op.maxStaff) && op.maxStaff >= 0);
      if (!validMin || !validMax || (op.minStaff === undefined && op.maxStaff === undefined)) {
        rejectedLogs.push("1日配置人数\u306e上限\u30fb下限指定\u304c不正\u3067\u3059");
        continue;
      }
      if (op.startDay !== undefined || op.endDay !== undefined) {
        const s = op.startDay;
        const e = op.endDay;
        if (
          typeof s !== "number" ||
          typeof e !== "number" ||
          !Number.isInteger(s) ||
          !Number.isInteger(e) ||
          s < 1 ||
          e > nextState.config.numDays ||
          s > e
        ) {
          rejectedLogs.push(`1日配置\u30eb\u30fc\u30eb\u306e日付範囲 (${String(s)}〜${String(e)}) \u304c不正\u3067\u3059`);
          continue;
        }
      }
      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const maxStaff = op.maxStaff;
      const minStaff = op.minStaff;
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = op.attribute;
      const resolvedAttr = rawAttr
        ? resolveAttributeCodeAndLabel(rawAttr, activeSkills)
        : null;
      const attribute = !rawAttr
        ? undefined
        : rawAttr === "all"
          ? "all"
          : resolvedAttr && !resolvedAttr.isUnknownCustomSkill
            ? resolvedAttr.code
            : rawAttr;
      const rolePrefix =
        attribute && attribute !== "all"
          ? `${resolvedAttr?.label ?? getSkillMeta(attribute, activeSkills).label}`
          : "";

      const normalizedCapTarget = attribute && attribute !== "all" ? attribute : "all";
      nextState.customRules = nextState.customRules.filter((r) => {
        if (r.kind !== "daily_shift_cap" || r.shift !== shiftCode) return true;
        const rAttr = r.attribute;
        const rTarget = rAttr && rAttr !== "all" ? rAttr : "all";
        return rTarget !== normalizedCapTarget;
      });

      const desc =
        typeof minStaff === "number" && minStaff > 0
          ? maxStaff !== undefined && minStaff === maxStaff
            ? `1日\u3042\u305F\u308A配置人数\u30EB\u30FC\u30EB: 「${meta.label}」\u306B毎日${rolePrefix}${maxStaff}名\u3092\u30A2\u30B5\u30A4\u30F3`
            : maxStaff !== undefined
              ? `1日\u3042\u305F\u308A配置人数\u30EB\u30FC\u30EB: 「${meta.label}」\u306B毎日${rolePrefix}${minStaff}〜${maxStaff}名\u3092配置`
              : `1日\u3042\u305F\u308A配置人数\u30EB\u30FC\u30EB: 「${meta.label}」\u306B毎日${rolePrefix}${minStaff}名以上\u3092配置`
          : `1日\u3042\u305F\u308A人数上限\u30EB\u30FC\u30EB: 「${meta.label}」\u306F1日\u306B${rolePrefix}最大${maxStaff}名\u307E\u3067`;

      const rule: CustomConstraintRule = {
        id: `daily_cap_${shiftCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "daily_shift_cap",
        enabled: true,
        isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
        penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
        shift: shiftCode,
        attribute,
        minStaff,
        maxStaff,
        startDay: op.startDay,
        endDay: op.endDay,
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "allow_prev_month_shift") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) {
        rejectedLogs.push(`前月実績算入\u306e対象\u30b7\u30d5\u30c8 "${op.shiftName || op.shift || ""}" \u304c見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      let matchedCount = 0;
      nextState.customRules = nextState.customRules.map((r) => {
        if (
          (r.kind === "shift_count_quota" && r.shift === shiftCode) ||
          (r.kind === "shift_prerequisite" && r.prereqShift === shiftCode)
        ) {
          matchedCount++;
          const suffix = "（前月\u307E\u3067\u306E受講実績\u3092含\u3080）";
          return {
            ...r,
            includePrevMonth: true,
            description: r.description.includes("前月")
              ? r.description
              : `${r.description}${suffix}`,
          };
        }
        return r;
      });

      if (matchedCount === 0) {
        rejectedLogs.push(
          `\u30b7\u30d5\u30c8「${meta.label}」\u306b対応\u3059\u308b回数\u30ce\u30eb\u30de\u30fb先行条件\u30eb\u30fc\u30eb\u304c存在\u3057\u306a\u3044\u305f\u3081、前月実績算入\u3092適用\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f`
        );
        continue;
      }

      appliedLogs.push(
        `前月実績\u306E算入\u30EB\u30FC\u30EB適用: 「${meta.label}」\u306E必要回数\u304A\u3088\u3073先行条件\u306B前月\u307E\u3067\u306E受講実績\u3092算入可能\u306B\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "level_night_shifts") {
      nextState.customRules = nextState.customRules.filter(
        (r) => r.kind !== "level_night_shifts"
      );
      const rule: CustomConstraintRule = {
        id: `level_night_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "level_night_shifts",
        enabled: true,
        levelGroupBy: op.levelGroupBy ?? "skill",
        description:
          "夜勤平準化\u30EB\u30FC\u30EB: \u30B9\u30AD\u30EB\u30FB属性\u30B0\u30EB\u30FC\u30D7（\u30EA\u30FC\u30C0\u30FC\u30FB中堅\u30FB新人\u30FB救急\u30B9\u30AD\u30EB等）\u3054\u3068\u306B月間\u306E夜勤回数(準夜\u30FB深夜)\u306E\u3070\u3089\u3064\u304D\u3092最小化\u3057\u3066均等化\u3059\u308B",
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "set_param" && op.paramName && typeof op.paramValue === "number") {
      if (!Number.isInteger(op.paramValue)) {
        rejectedLogs.push(`\u30d1\u30e9\u30e1\u30fc\u30bf "${op.paramName}" \u306e値 ${op.paramValue} \u306f整数\u3067\u3042\u308b必要\u304c\u3042\u308a\u307e\u3059`);
        continue;
      }
      const val = op.paramValue;
      if (op.paramName === "staffCount") {
        if (val < 15 || val > 36) {
          rejectedLogs.push(`\u30b9\u30bf\u30c3\u30d5人数 ${val} \u306f 15〜36 \u306e範囲\u3067指定\u3057\u3066\u304f\u3060\u3055\u3044`);
          continue;
        }
        nextState = generateNurseSchedulingState({
          ...nextState.config,
          staffCount: val,
          seed: nextState.config.seed + 1,
        });
        appliedLogs.push(`\u30B9\u30BF\u30C3\u30D5人数\u3092 ${val}名 \u306B変更\u3057、\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u30FB前月\u30B7\u30D5\u30C8\u30FB希望\u3092再生成\u3057\u307E\u3057\u305F`);
      } else {
        const minAllowed = op.paramName === "maxConsecutiveWorkDays" ? 1 : 0;
        if (val < minAllowed) {
          rejectedLogs.push(`\u30d1\u30e9\u30e1\u30fc\u30bf "${op.paramName}" \u306e値 ${val} \u306f ${minAllowed} 以上\u3092指定\u3057\u3066\u304f\u3060\u3055\u3044`);
          continue;
        }
        (nextState.config as any)[op.paramName] = val;
        const paramLabels: Record<string, string> = {
          weekdayDayStaff: "平日\u30FB日勤\u306E必要人数",
          weekendDayStaff: "土日\u30FB日勤\u306E必要人数",
          eveningStaff: "準夜勤\u306E必要人数",
          nightStaff: "深夜勤\u306E必要人数",
          maxConsecutiveWorkDays: "最大連続勤務日数",
          minMonthlyDaysOff: "月間最低公休日数",
          minMonthlyWorkDays: "月間最低勤務日数",
          maxMonthlyNightShifts: "月間夜勤(準夜+深夜)上限回数",
          maxMonthlyOvertimeHours: "36協定 当月時間外労働上限(h)",
          maxAnnualOvertimeHours: "36協定 年間(12\u30F6月)時間外労働上限(h)",
        };
        appliedLogs.push(`${paramLabels[op.paramName] ?? op.paramName} \u3092 ${val} \u306B変更\u3057\u307E\u3057\u305F`);
      }
      continue;
    }

    if (op.op === "toggle_rule" && op.ruleName && typeof op.ruleEnabled === "boolean") {
      (nextState.config as any)[op.ruleName] = op.ruleEnabled;
      const ruleLabels: Record<string, string> = {
        enforcePrevMonthCarryover: "前月末\u30B7\u30D5\u30C8\u304B\u3089\u306E連続性\u30FB連勤引\u304D継\u304E",
        enforceSkillCoverage: "\u30B9\u30AD\u30EB\u30FB属性\u3054\u3068\u306E配置人数\u30EB\u30FC\u30EB",
        enforcePreceptorPairs: "\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC同行夜勤(新人\u306E夜勤時\u306B指導者\u3082同\u30B7\u30D5\u30C8配置)",
        requireWeekendOff: "週末(土日)最低2日公休確保\u30EB\u30FC\u30EB",
        enforceNgPairs: "相性NG\u30DA\u30A2\u306E同\u30B7\u30D5\u30C8回避\u30EB\u30FC\u30EB",
        enforceHardRequests: "確定希望休(\u30CF\u30FC\u30C9制約)\u306E厳守",
        enforce36Agreement: "36協定（月45h\u30FB年360h 時間外上限）\u306E遵守",
        preserveCurrentSchedule: "微調整\u30E2\u30FC\u30C9（既存\u30B7\u30D5\u30C8表\u304B\u3089\u306E変更最小化）",
      };
      appliedLogs.push(
        `「${ruleLabels[op.ruleName] ?? op.ruleName}」\u3092 ${op.ruleEnabled ? "有効(ON)" : "無効(OFF)"} \u306B変更\u3057\u307E\u3057\u305F`
      );
      continue;
    }

    if (op.op === "add_request" && op.nurseNameOrId) {
      const nurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      if (!nurse) {
        rejectedLogs.push(`対象\u30b9\u30bf\u30c3\u30d5 "${op.nurseNameOrId}" \u304c名簿\u306b見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      const rawDays = op.days?.length ? op.days : op.day !== undefined ? [op.day] : [];
      if (
        rawDays.length === 0 ||
        rawDays.some(
          (d) =>
            typeof d !== "number" ||
            !Number.isInteger(d) ||
            d < 1 ||
            d > nextState.config.numDays
        )
      ) {
        rejectedLogs.push(`対象日付\u304c不正\u307e\u305f\u306f月\u306e範囲外(1〜${nextState.config.numDays})\u3067\u3059`);
        continue;
      }
      const days = Array.from(new Set(rawDays)).sort((a, b) => a - b);
      const resolvedShift = resolveShiftCodeOrAliasFromInput(op.shift, nextState);
      if (!resolvedShift) {
        rejectedLogs.push(`\u30b7\u30d5\u30c8\u30b3\u30fc\u30c9 "${String(op.shift)}" \u304c無効\u307e\u305f\u306f未登録\u3067\u3059`);
        continue;
      }
      const shift: ShiftCode = resolvedShift;
      const isHard = op.isHard !== false;
      const customOrAliasMeta = getShiftMeta(
        shift,
        nextState.customShiftDefs,
        nextState.shiftAliases
      );
      const shiftName =
        shift === "O"
          ? "公休(O)"
          : shift === "W"
            ? "勤務(\u30B7\u30D5\u30C8\u304A任\u305B)"
            : shift === "D"
              ? "日勤(D)"
              : shift === "EN"
                ? "夜勤(準夜\u30FB深夜)"
                : shift === "E"
                  ? "準夜勤(E)"
                  : shift === "N"
                    ? "深夜勤(N)"
                    : `${customOrAliasMeta.label}(${customOrAliasMeta.shortLabel})`;
      const reasonLabel = op.reason || "\u30C1\u30E3\u30C3\u30C8指示";
      if (isHard) {
        const daySet = new Set(days);
        const reconciledPin = reconcileCellRulesForPin(nextState, nurse.id, daySet, shift);
        nextState.customRules = reconciledPin.customRules;
        nextState.preferences = reconciledPin.preferences;
        for (const d of days) {
          const rule: CustomConstraintRule = {
            id: `chat_pin_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
            kind: "pin_shift",
            enabled: true,
            nurseId: nurse.id,
            day: d,
            shift,
            description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) \u3092「${shiftName}」\u306B固定 (${reasonLabel})`,
          };
          nextState.customRules.push(rule);
        }

        if (op.onlyMatchedDaysWork && shift !== "O") {
          const otherDays: number[] = [];
          for (let d = 1; d <= nextState.config.numDays; d++) {
            if (!daySet.has(d)) otherDays.push(d);
          }
          const otherSet = new Set(otherDays);
          const reconciledOther = reconcileCellRulesForPin(nextState, nurse.id, otherSet, "O");
          nextState.customRules = reconciledOther.customRules;
          nextState.preferences = reconciledOther.preferences;
          for (const d of otherDays) {
            nextState.customRules.push({
              id: `chat_pin_off_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
              kind: "pin_shift",
              enabled: true,
              nurseId: nurse.id,
              day: d,
              shift: "O",
              description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) \u3092「公休(O)」\u306B固定 (${reasonLabel}\u306E指定曜日外)`,
            });
          }
          appliedLogs.push(
            `${formatDaySpanLabel(nextState.config.month, days)} (計${days.length}日): ${nurse.name}(${nurse.id}) \u3092「${shiftName}」\u306B固定\u3057、\u305D\u308C以外\u306E曜日(${otherDays.length}日)\u3092「公休(O)」\u306B固定 (${reasonLabel})`
          );
        } else {
          if (days.length === 1) {
            appliedLogs.push(
              `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) \u3092「${shiftName}」\u306B固定 (${reasonLabel})`
            );
          } else {
            appliedLogs.push(
              `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) \u3092「${shiftName}」\u306B固定 (${reasonLabel})`
            );
          }
        }
      } else {
        for (const d of days) {
          nextState.preferences.push({
            id: `chat_pref_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
            nurseId: nurse.id,
            day: d,
            shift,
            isHard: false,
            reason: op.reason || "\u30C1\u30E3\u30C3\u30C8希望追加",
          });
        }
        if (days.length === 1) {
          appliedLogs.push(
            `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) \u306B\u30BD\u30D5\u30C8希望「${shiftName}」\u3092追加\u3057\u307E\u3057\u305F`
          );
        } else {
          appliedLogs.push(
            `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) \u306B\u30BD\u30D5\u30C8希望「${shiftName}」\u3092追加\u3057\u307E\u3057\u305F`
          );
        }
      }
      continue;
    }

    if (op.op === "forbid_shift" && op.nurseNameOrId) {
      const nurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      if (!nurse) {
        rejectedLogs.push(`配置禁止\u306e対象\u30b9\u30bf\u30c3\u30d5 "${op.nurseNameOrId}" \u304c名簿\u306b見\u3064\u304b\u308a\u307e\u305b\u3093`);
        continue;
      }
      const rawDays = op.days?.length ? op.days : op.day !== undefined ? [op.day] : [];
      if (
        rawDays.length === 0 ||
        rawDays.some(
          (d) =>
            typeof d !== "number" ||
            !Number.isInteger(d) ||
            d < 1 ||
            d > nextState.config.numDays
        )
      ) {
        rejectedLogs.push(`配置禁止\u306e日付\u304c不正\u307e\u305f\u306f月\u306e範囲外(1〜${nextState.config.numDays})\u3067\u3059`);
        continue;
      }
      const days = Array.from(new Set(rawDays)).sort((a, b) => a - b);
      const resolvedShifts = normalizeActiveShifts(op.forbidShifts, nextState);
      if (!resolvedShifts || resolvedShifts.length === 0) {
        rejectedLogs.push("配置禁止\u306e\u30b7\u30d5\u30c8指定\u304c空\u307e\u305f\u306f無効\u3067\u3059");
        continue;
      }
      const shifts: ShiftCode[] = resolvedShifts;
      const daySet = new Set(days);
      const reconciledForbid = reconcileCellRulesForForbid(nextState, nurse.id, daySet, shifts);
      nextState.customRules = reconciledForbid.customRules;
      nextState.preferences = reconciledForbid.preferences;
      for (const d of days) {
        const rule: CustomConstraintRule = {
          id: `chat_forbid_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "forbid_shift",
          enabled: true,
          nurseId: nurse.id,
          day: d,
          forbidShifts: shifts,
          description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) \u306E [${shifts.join("/")}] \u30B7\u30D5\u30C8配置\u3092禁止`,
        };
        nextState.customRules.push(rule);
      }
      if (days.length === 1) {
        appliedLogs.push(
          `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) \u306E [${shifts.join("/")}] \u30B7\u30D5\u30C8配置\u3092禁止`
        );
      } else {
        appliedLogs.push(
          `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) \u306E [${shifts.join("/")}] \u30B7\u30D5\u30C8配置\u3092禁止`
        );
      }
      continue;
    }

    if (op.op === "add_date_coverage") {
      if (
        typeof op.day !== "number" ||
        !Number.isInteger(op.day) ||
        op.day < 1 ||
        op.day > nextState.config.numDays ||
        (op.shift !== "D" && op.shift !== "E" && op.shift !== "N") ||
        typeof op.minStaff !== "number" ||
        !Number.isInteger(op.minStaff) ||
        op.minStaff < 1
      ) {
        rejectedLogs.push(
          `日別必要人数設定 (${String(op.day)}日 / ${String(op.shift)} / ${String(op.minStaff)}名) \u304c不正\u3067\u3059`
        );
        continue;
      }
      const shiftLabel = op.shift === "D" ? "日勤(D)" : op.shift === "E" ? "準夜勤(E)" : "深夜勤(N)";
      const rule: CustomConstraintRule = {
        id: `chat_cov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: "date_coverage",
        enabled: true,
        day: op.day,
        shift: op.shift,
        minStaff: op.minStaff,
        description: `${nextState.config.month}/${op.day} \u306E${shiftLabel}必要人数\u3092 ${op.minStaff}名以上 \u306B設定`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "add_ng_pair" && op.nurseNameOrId && op.nurseBNameOrId) {
      const nA = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const nB = resolveNurseFromText(op.nurseBNameOrId, nextState.nurses);
      if (!nA || !nB || nA.id === nB.id) {
        rejectedLogs.push(
          `相性NG\u30da\u30a2\u306e対象\u30b9\u30bf\u30c3\u30d5 (${op.nurseNameOrId} / ${op.nurseBNameOrId}) \u304c見\u3064\u304b\u3089\u306a\u3044\u304b同一人物\u3067\u3059`
        );
        continue;
      }
      const resolvedShifts = normalizeActiveShifts(op.shifts, nextState);
      if (resolvedShifts === null) {
        rejectedLogs.push("相性NG\u30da\u30a2\u306e対象\u30b7\u30d5\u30c8\u304c不正\u307e\u305f\u306f空\u3067\u3059");
        continue;
      }
      const targetShifts: ShiftCode[] = resolvedShifts ?? ["E", "N"];
      const shiftDesc =
        targetShifts.length === 3
          ? "全\u30B7\u30D5\u30C8(日勤\u30FB準夜\u30FB深夜)"
          : targetShifts.length === 2 &&
              targetShifts.includes("E") &&
              targetShifts.includes("N")
            ? "同夜勤(準夜\u30FB深夜)"
            : `[${targetShifts.join("/")}] \u30B7\u30D5\u30C8`;
      nextState.relations = nextState.relations.filter(
        (r) =>
          !(
            r.type === "ng_pair" &&
            ((r.nurseA === nA.id && r.nurseB === nB.id) ||
              (r.nurseA === nB.id && r.nurseB === nA.id))
          )
      );
      const description = `相性NG\u30DA\u30A2追加: ${nA.name}(${nA.id}) × ${nB.name}(${nB.id}) \u306E${shiftDesc}同時配置\u3092禁止`;
      nextState.relations.push({
        id: `chat_ng_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "ng_pair",
        enabled: true,
        nurseA: nA.id,
        nurseB: nB.id,
        shifts: targetShifts,
        isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
        penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
        reason: description,
      });
      appliedLogs.push(description);
      continue;
    }

    rejectedLogs.push(`無効\u307e\u305f\u306f\u30d1\u30e9\u30e1\u30fc\u30bf不足\u306e操作 (${op.op}) \u3092\u30b9\u30ad\u30c3\u30d7\u3057\u307e\u3057\u305f`);
  }

  return { updatedState: nextState, appliedLogs, rejectedLogs };
}
