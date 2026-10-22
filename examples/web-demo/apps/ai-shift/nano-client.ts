import {
  generateNurseSchedulingState,
  injectConflictScenario,
} from "./generator.js";
import {
  CONTRACT_PRESETS,
  ROLE_LABELS,
  createDefaultShiftAliases,
  createDefaultSkillDefs,
  doesNurseMatchAttribute,
  doesNurseSatisfySkill,
  getShiftMeta,
  getSkillMeta,
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
  type NurseRole,
  type NurseSchedulingState,
  type NurseSkill,
  type ParsedChatPlan,
  type ShiftCode,
  type SkillDefinition,
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
  | "system_action"
  // Legacy umbrella categories retained for full backward compatibility
  | "staff_request"
  | "ward_config";

export type NonToolCategory = "question" | "unsupported" | "clarify";

export type ToolCategory =
  | ExecutableToolCategory
  | NonToolCategory
  // Legacy aliases accepted in normalizeToolCategories for backward compatibility
  | "staff_group"
  | "diagnose_conflict"
  | "solve_only"
  | "none";

export interface Stage1RouteItem {
  tool_type: ToolCategory;
  instruction?: string;
}

export interface Stage1RouterResult {
  thought?: string;
  routes?: Stage1RouteItem[];
  response: string;
  /** Legacy fields accepted for backward compatibility */
  tool_types?: ToolCategory[];
  tool_type?: ToolCategory;
  secondary_tool_type?: ToolCategory;
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
                  "staff_request",
                  "ward_config",
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

const STAGE1_ROUTER_SYSTEM_PROMPT = `あなたは病院の3交代ナーススケジューリングAIの「プランナー兼ルーター (Turn 1)」です。
ユーザーはシステムの専門用語や内部パラメータ名を知らず、日常の自然な言葉で要望を伝えます。
以下の順序でJSON（thought ➔ routes ➔ response）を出力してください：

1. "thought" (思考・プランニング):
   ・【文脈補完】直近の対話履歴がある場合、省略されている主語（どのシフト名・スキル名・スタッフ名に対する指示か）を特定する。
   ・【日常語からドメイン概念への翻訳】ユーザーの自然な表現（例:「働かなくていい／出勤ノルマなし／最小勤務日数をゼロに」＝個人の月間最低勤務日数を0日にする、「月10日まで」＝個人の月間最大勤務日数を10日にする、「昼間だけ／夜勤なし」＝個人の日勤専従契約、「夜勤専従」＝個人の夜勤専従契約、「深夜勤は免除／準夜勤は免除」＝個人の深夜勤・準夜勤免除契約、「3連勤まで」＝個人の最大連勤日数契約、「次の日は休ませる」＝明け公休ルール、「日勤の翌日に深夜はダメ」＝日深夜禁止、「X班は日Xにしか入れない」＝反対側のサブシフトに対するX班の配置上限0名[skill_and_pair で処理し、シフト遷移 ward_transition_and_rule にはしない]、「足りない時だけ応援」＝不足時ヘルプ上限、「毎日N名をアサイン」＝1日あたりの配置人数[個人の月間回数ノルマではない]など）が、どのスケジューリング概念に当たるかを整理する。
   ・【タスク分解】1つの発話に複数カテゴリの要求が含まれる場合はカテゴリごとに分割し、同じカテゴリに属する複数条件は1つのルートにまとめる計画を立てる。
2. "routes" (カテゴリ別ルート配列):
   ・ツール実行カテゴリ(1〜7)に該当する場合は、各カテゴリごとに { "tool_type": "...", "instruction": "..." } を出力する。
   ・重要: "instruction" には、直前の履歴から補完した対象名と、日常語を明確なスケジューリング用語に言い換えた完結した指示文（日付・人数・回数などの数値は正確に維持）を書くこと。
   ・非ツールカテゴリ（"question", "unsupported", "clarify"）に該当する場合は、単独の [{ "tool_type": "..." }] として出力する。
3. "response" (一次返答):
   ・計画した routes に基づき、これから何を行うか（または聞き返し・回答）をユーザー向けに1文で簡潔に出力する。

【7つの専門ツール実行カテゴリ（各ツールは1つの専門カテゴリに所属）】
1. "staff_calendar" (特定スタッフ個人の日付・期間・曜日/祝日カレンダー希望・固定・禁止):
   特定の看護師（例: 村上さん、福田さん、西村さん、三浦さん、N11）の「特定の日付（8日など）」「期間（11/6〜11/11、11/14まで、24日以降など）」「特定の曜日・祝日パターン（毎週水曜休み、火曜と金曜だけ勤務、土日は休みだけど祝日は出勤OK、祝日は日勤など）」におけるシフト・シフトグループ（公休O・勤務W[お任せ出勤]・日勤D[日A/日B]・夜勤EN・準夜E・深夜N・追加シフト）の希望・固定・特定日のシフト禁止
2. "staff_contract" (特定スタッフ個人の働き方契約・シフト免除・月間日数/夜勤回数/個人連勤の上限・下限):
   特定の看護師個人の月間を通じた基本の働き方契約（日勤専従/夜勤免除、夜勤専従/日勤免除、深夜勤のみ免除、準夜勤のみ免除、土日休み契約、土日祝休み契約、制限解除）および個人別の数値上限・下限（月間最大勤務日数・月間最低勤務日数[0日免除含む]・月間最低公休日数・月間夜勤回数上限・個人別の最大連勤日数）
3. "ward_coverage_and_param" (病棟全体の数値基準・必要人数・特定日の人数変更・夜勤回数の平準化):
   病棟全体の基本数値パラメータ（最大連勤日数、月間最低公休日数、月間最低勤務日数、月間夜勤上限、平日/土日の日勤必要人数、準夜/深夜の必要人数、スキル最低人数、36協定の時間外上限）、特定のカレンダー日付の病棟必要人数変更（「18日の日勤を11人以上に」）、スキル・役割ごとの月間夜勤回数の平準化（均等化）
4. "ward_transition_and_rule" (病棟全体のシフト遷移マトリクス・2日間の並び順禁止/必須・全体ルールON/OFF):
   2日間のシフト連続・遷移ルール（深夜勤の翌日は必ず公休にする[深→休必須]、日勤→翌日深夜勤の禁止[日→深禁止]、準夜→翌日日勤の禁止[準→日禁止]、連続準夜勤の禁止[準→準禁止]、連続深夜勤の禁止[深→深禁止]など）や、病棟全体ルールのON/OFF（プリセプター同行夜勤、固定チーム均等配置、週末公休確保、微調整モードなど）
5. "skill_and_pair" (スキル定義・サブシフト/グループ別の属性配置人数ルール・スキル付与・ペア制約):
   スキル・資格（リーダー・副リーダー・透析管理・認知症ケア・呼吸器管理・救急対応・感染管理など）の定義追加・削除・各シフトの必要人数設定・他スキルの代行(substitutesFor)設定、サブシフト（日勤Group A[日A]・日勤Group B[日B]・各グループ・準夜・深夜）ごとのスキルや属性（新人・中堅・A班・B班）の人数下限(minCount)・上限(maxCount)・不足時のみのヘルプ制限(onlyWhenShort)、スタッフやロールへのスキル付与・解除、2名の看護師が特定シフトで同時に入らないNGペア設定、新人と指導者の同行ペア設定
6. "custom_shift" (追加シフト枠・開催期間/曜日ルール・1日あたり配置人数・受講条件):
   既存シフト（日勤[日A/日B]・準夜・深夜・公休）以外の新しい「勤務シフト・イベント枠（オリエンテーション・研修・委員会・勉強会・出張・行事など）」の追加、その開催期間（開始日〜終了日）や曜日制限（平日のみ・週末のみ）、1日あたりの配置人数・上限、個人別の月間取得回数ノルマ、夜勤先行条件（「規定回数を受けるまで夜勤に入れない」）、前月実績の算入
7. "system_action" (全体操作・診断・再計算):
   追加したカスタムルールの全クリア、すべての設定の初期状態へのリセット、矛盾デモシナリオの注入、矛盾チェック（シフトが組めない原因の診断）、条件を変えずにシフトを再最適化する指示

【3つの非ツールカテゴリ（ツールを実行しない発話）】
8. "question" (質問・確認・指摘):
   機能確認（「なにができる？」「現在の設定は？」）、シフト結果や理由の確認・指摘など、設定変更を伴わない発話
9. "unsupported" (それ以外・システム未対応の要求):
   シフトの開始・終了時刻の変更、給与・夜勤手当の計算、病床数の変更、他病棟からの応援要請など、上記1〜7のいずれの機能でも実現できない要求。response では未対応である旨のみを簡潔に述べ、存在しない機能は案内しないこと
10. "clarify" (不明・情報不足で聞き返しが必要):
   「休ませて」「誰か夜勤を減らして」「スキルを変えて」のように、直近の対話履歴を見ても対象スタッフ名・日付・どの設定項目をいくつにするか等の必須情報が欠けていて特定できない発話。response で不足している情報を具体的に聞き返すこと

【Few-shot 例】
ユーザー: 「なにができる？」
出力: {"thought":"ユーザーはシステムの対応機能一覧を質問している。設定変更ではないため question とする。","routes":[{"tool_type":"question"}],"response":"スキルの追加・削除（シフト別の必要人数や代替スキル設定含む）、カスタムシフトや受講条件の追加、グループ分け、スキル別の夜勤平準化、NGペア・プリセプター設定、個人の希望休・期間休職・個人契約設定、病棟全体の連勤・公休・シフト遷移・36協定ルールの変更、矛盾診断などが可能です。"}

ユーザー: 「新しいスキルとして『感染管理』を追加して、救急・ICUの代わりになれるようにして」
出力: {"thought":"新しいスキル『感染管理』を追加し、救急・ICUスキルの代行(substitutesFor)として設定する要求。skill_and_pair で処理する。","routes":[{"tool_type":"skill_and_pair","instruction":"スキル『感染管理』を追加し、救急・ICUの代わりになれる(代行可)ように設定する"}],"response":"新しいスキル『感染管理』を救急・ICU代行可として追加します。"}

ユーザー: 「日勤のBグループにはリーダーを2人以上配置して、B班は日Bにしか入れないようにして」
出力: {"thought":"サブシフト日B(D_B)のリーダー下限2名と、B班スタッフを日B専任（反対側の日A[D_A]への配置上限0名）にする配置人数ルール。どちらもサブシフトの属性人数制限なので単一の skill_and_pair ルートにまとめる（シフト遷移ではない）。","routes":[{"tool_type":"skill_and_pair","instruction":"日勤Group B(D_B)にリーダーを2名以上配置し、反対側の日勤Group A(D_A)におけるB班スタッフの上限を0名(配置禁止)に設定する"}],"response":"日勤Group B(日B)にリーダーを2名以上配置し、B班のスタッフは日Bにのみ入るよう設定します。"}

ユーザー: 「日Aの人数が足りないときだけB班も日Aに応援で入れるけど、最大2名までにして」
出力: {"thought":"サブシフト日Aに対して、B班のスタッフは不足時のみヘルプ配置可(onlyWhenShort)とし、上限を2名以下にする配置ルール。skill_and_pair で処理する。","routes":[{"tool_type":"skill_and_pair","instruction":"日AにおけるB班スタッフの配置を不足時ヘルプのみとし、上限2名以下に設定する"}],"response":"B班の看護師が日Aにヘルプで入る場合の上限を2名までに制限し、不足時のみ配置するよう設定します。"}

ユーザー: 「オリエンテーションというシフトを追加して。新人は月3回受講必須で、3回受けるまで夜勤には入れないようにして、1日に3名までにして。」
出力: {"thought":"新規シフト枠『オリエンテーション』の追加、新人の月3回受講ノルマ、3回受講完了まで夜勤不可とする先行条件、および1日あたり最大3名までの人数上限。すべて custom_shift で処理する。","routes":[{"tool_type":"custom_shift","instruction":"オリエンテーションシフトを追加し、新人は月3回受講必須・3回受けるまで準夜勤や深夜勤に入れない・1日あたり最大3名までに設定する"}],"response":"オリエンテーションシフトを追加し、新人が3回受講するまで夜勤不可かつ1日3名までのルールを設定します。"}

【直近の対話履歴】
・前回:「委員会というシフトを追加して」➔ 適用済: 新しいシフト種別「委: 委員会 (09:00–17:00, 所属:D)」を追加しました
ユーザー: 「毎日リーダー2名をアサインだよ」
出力: {"thought":"直前の履歴で追加した『委員会』シフトに対する指示。1日あたりリーダー2名を配置するルールなので custom_shift に委員会を補完して渡す。","routes":[{"tool_type":"custom_shift","instruction":"委員会シフトに毎日リーダー2名をアサインする"}],"response":"委員会シフトに毎日リーダー2名をアサインします。"}

ユーザー: 「村上さんの8日を確定の休み(O)にして、病棟の最大連勤を3日に変更して」
出力: {"thought":"前半は村上さん個人の11/8の公休固定(staff_calendar)、後半は病棟全体の最大連勤日数を3日にする変更(ward_coverage_and_param)の2カテゴリ複合指示。","routes":[{"tool_type":"staff_calendar","instruction":"村上さんの8日を確定の公休(O)に固定する"},{"tool_type":"ward_coverage_and_param","instruction":"病棟全体の最大連勤日数を3日に変更する"}],"response":"村上さんの8日を公休に固定し、最大連勤日数を3日に変更します。"}

ユーザー: 「福田さんが体調不良で11/14まで出勤できないので休みにして」
出力: {"thought":"福田さん個人の11/1から11/14までの期間を公休(O)に固定するカレンダー指示。staff_calendar で処理する。","routes":[{"tool_type":"staff_calendar","instruction":"福田さんの11月1日から11月14日までを確定の公休(O)に固定する"}],"response":"福田さんの11月1日から11月14日までの期間を公休(O)に固定し、シフトを再計算します。"}

ユーザー: 「西村さんは育児休業中なので、月の最低勤務日数をゼロにして」
出力: {"thought":"西村さん個人の出勤日数下限（月間最低勤務日数）を0日（免除）に変更する個人契約の指示。staff_contract で処理する。","routes":[{"tool_type":"staff_contract","instruction":"西村さん個人の月間最低勤務日数(出勤日数下限)を0日に設定する"}],"response":"西村さんの個人別の月間最低勤務日数を0日に変更します。"}

ユーザー: 「準夜勤の翌日に日勤を入れるシフト並びを禁止して」
出力: {"thought":"標準シフトの準夜勤から翌日日勤へのシフト遷移を禁止する病棟全体ルール。ward_transition_and_rule で処理する。","routes":[{"tool_type":"ward_transition_and_rule","instruction":"準夜勤の翌日に日勤を入れるシフト遷移禁止ルールをONにする"}],"response":"準夜勤の翌日に日勤を入れるシフト遷移禁止ルールをONにします。"}

ユーザー: 「日勤の開始時間を8時30分に変更して」
出力: {"thought":"シフトの開始・終了時刻の変更はシステム未対応のため unsupported とする。","routes":[{"tool_type":"unsupported"}],"response":"シフトの開始・終了時刻の変更には対応していません。"}

ユーザー: 「来週休ませて」
出力: {"thought":"誰の・何月何日の休み希望かが不明で履歴からも特定できないため clarify で聞き返す。","routes":[{"tool_type":"clarify"}],"response":"どなたの・何月何日（または何日〜何日）を公休にするか教えていただけますか？"}`;

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
              baseShift: { type: "string", enum: ["D", "E", "N", "O"] },
            },
            ["shiftName"]
          ),
          toolBranch(
            "add_shift_quota",
            {
              shiftName: { type: "string" },
              targetRole: {
                type: "string",
                enum: ["newcomer", "mid", "leader", "all"],
              },
              count: { type: "number" },
            },
            ["shiftName", "targetRole", "count"]
          ),
          toolBranch(
            "add_shift_prerequisite",
            {
              shiftName: { type: "string" },
              targetRole: {
                type: "string",
                enum: ["newcomer", "mid", "leader", "all"],
              },
              count: { type: "number" },
            },
            ["shiftName", "targetRole", "count"]
          ),
          toolBranch(
            "add_shift_day_restriction",
            {
              shiftName: { type: "string" },
              dayRestriction: {
                type: "string",
                enum: ["weekday_only", "weekend_only"],
              },
              startDay: { type: "number" },
              endDay: { type: "number" },
            },
            ["shiftName"]
          ),
          toolBranch(
            "add_daily_shift_cap",
            {
              shiftName: { type: "string" },
              minStaffPerDay: { type: "number" },
              maxStaffPerDay: { type: "number" },
              targetRole: {
                type: "string",
                enum: ["newcomer", "mid", "leader", "all"],
              },
            },
            ["shiftName", "maxStaffPerDay"]
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

const CUSTOM_SHIFT_STAGE2_PROMPT = `あなたは「custom_shift (カレンダーの日付セルに割り当てる追加シフト枠・研修ルール)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（既存の日勤D・準夜E・深夜N・公休O以外の新しい「追加シフト枠（新人研修・勉強会・委員会・出張など）」およびその受講条件）に厳密に合致する指示のみを抽出してください。
・既存の公休・日勤・準夜・深夜に関する指示（個人の休み希望、深夜勤明けの公休必須ルール、最大連勤など）や他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【重要：「1人あたり月N回 (add_shift_quota)」と「毎日N名 (add_daily_shift_cap)」の区別】
・「1人あたり月N回ずつ受ける」「各自N回受講しないと夜勤に入れない」は、各スタッフ個人の月間取得回数ノルマ（"add_shift_quota"）です。
・「毎日N名をアサイン」「その期間、毎日N名ずつ配置」「1日に最大N名まで」は、1日あたりの配置人数枠（"add_daily_shift_cap"）です。
・注意: 「毎日N名をアサイン」という指示に対して、"add_shift_quota"（個人の月間回数ノルマ）を誤って追加しないでください。「毎日N名」と「各自月N回」は全く別の制約です（両方を出力するのは、「各自月N回受講し、かつ1日最大M名まで」のように両方が明示されている場合のみです）。

【custom_shift に属するツール一覧】
1. "add_custom_shift": 既存4シフト（日勤D・準夜E・深夜N・公休O）のいずれかに所属する新しい「タグ付きシフト枠（新人研修・勉強会・委員会・出張・院内イベントなど）」を追加する
   - 必須引数: shiftName (シフト名)
   - 任意引数: baseShift ("D" | "E" | "N" | "O"、省略時は "D" [日勤扱いの勤務]。休暇・休日の別名なら "O"、準夜帯なら "E"、深夜帯なら "N" を指定。指定した基本シフトの連勤・シフト遷移ルールを継承します)
   args: { "shiftName": "新人研修" }
2. "add_shift_quota": 指定ロールのスタッフ1人あたりが、そのカスタムシフトを月何回（「各自月N回ずつ」）取得するか設定する（※「毎日N名アサイン」のような1日あたりの人数指定には絶対に使わず、5の "add_daily_shift_cap" を使ってください）
   args: { "shiftName": "新人研修", "targetRole": "newcomer", "count": 2 }
3. "add_shift_prerequisite": そのカスタムシフトをN回受けるまで夜勤・準夜勤に入れない順序ルールを設定する
   args: { "shiftName": "新人研修", "targetRole": "newcomer", "count": 2 }
4. "add_shift_day_restriction": そのカスタムシフトを実施する「曜日」または「開催期間（開始日〜終了日）」を制限する（期間外・対象曜日外は配置禁止＝0名になります）
   - 曜日制限: dayRestriction に "weekday_only" (平日のみ) または "weekend_only" (土日のみ) を指定
   - 期間制限: startDay (開始日 1〜30) と endDay (終了日 1〜30) を指定
     ※対象月は11月です。「11月X日」「11/X」「11月Xから」は開始日 startDay: X を意味します。「X日からN日間」の場合は終了日を endDay = X + N - 1 として計算します（例: 5日から4日間 ➔ startDay: 5, endDay: 8）。
   args例: { "shiftName": "新人研修", "dayRestriction": "weekday_only" } / { "shiftName": "学会", "startDay": 20, "endDay": 22 }
5. "add_daily_shift_cap": そのカスタムシフトの「1日あたりの配置人数（毎日N名アサイン / 1日最大N名まで）」を設定する
   - 必須引数: shiftName, maxStaffPerDay (1日あたりの人数・上限人数)
   - 任意引数:
     * minStaffPerDay: 1日あたりの最低人数（「毎日N名をアサイン」のように毎日必ずN名配置する場合は minStaffPerDay と maxStaffPerDay に同じ人数を指定。「1日にN名まで」のような上限のみの場合は省略）
     * targetRole: 対象ロール ("newcomer"=新人, "mid"=中堅, "leader"=リーダー, "all"=全員)
   args例: { "shiftName": "新人研修", "maxStaffPerDay": 2 } / { "shiftName": "勉強会", "minStaffPerDay": 3, "maxStaffPerDay": 3, "targetRole": "mid" }
6. "allow_prev_month_shift": 前の月(前月)までに受けた回数も実績に含めてよいことにする
   args: { "shiftName": "新人研修" }
7. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「オリエンテーションというシフトを追加して」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"オリエンテーション"}}]}

指示: 「オリエンテーションシフトを追加して。新人はこのオリエンテーションを3回受けないと夜勤や準夜勤には入れないようにして、1日に3名までにして。」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"オリエンテーション"}},{"tool_name":"add_shift_quota","args":{"shiftName":"オリエンテーション","targetRole":"newcomer","count":3}},{"tool_name":"add_shift_prerequisite","args":{"shiftName":"オリエンテーション","targetRole":"newcomer","count":3}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"オリエンテーション","maxStaffPerDay":3}}]}

指示: 「委員会というシフトを日勤扱いで追加して。11月8日から3日間、毎日リーダー2名をアサインして。」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"委員会","baseShift":"D"}},{"tool_name":"add_shift_day_restriction","args":{"shiftName":"委員会","startDay":8,"endDay":10}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"委員会","minStaffPerDay":2,"maxStaffPerDay":2,"targetRole":"leader"}}]}

指示: 「委員会シフトに毎日中堅2名をアサインして」
出力: {"tools":[{"tool_name":"add_daily_shift_cap","args":{"shiftName":"委員会","minStaffPerDay":2,"maxStaffPerDay":2,"targetRole":"mid"}}]}

指示: 「学会は11月20日から22日までにして」
出力: {"tools":[{"tool_name":"add_shift_day_restriction","args":{"shiftName":"学会","startDay":20,"endDay":22}}]}

指示: 「オリエンテーションは前月までの受講分も含めてよいことにして」
出力: {"tools":[{"tool_name":"allow_prev_month_shift","args":{"shiftName":"オリエンテーション"}}]}

指示: 「オリエンテーションは1日に最大3名までしか受けられないようにして」
出力: {"tools":[{"tool_name":"add_daily_shift_cap","args":{"shiftName":"オリエンテーション","maxStaffPerDay":3}}]}

指示: 「オリエンテーションは平日のみ実施にして」
出力: {"tools":[{"tool_name":"add_shift_day_restriction","args":{"shiftName":"オリエンテーション","dayRestriction":"weekday_only"}}]}

指示: 「新しいスキルとして『感染管理』を追加して」
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
                items: { type: "string", enum: ["D", "D_A", "D_B", "E", "N"] },
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
                items: { type: "string", enum: ["D", "D_A", "D_B", "E", "N"] },
              },
            },
            ["newcomerNurse", "mentorNurse"]
          ),
          toolBranch(
            "set_staffing_rule",
            {
              targetShift: {
                type: "string",
              },
              attribute: { type: "string" },
              minCount: { type: "number" },
              maxCount: { type: "number" },
              onlyWhenShort: { type: "boolean" },
            },
            ["targetShift", "attribute"]
          ),
          NONE_ESCAPE_HATCH_BRANCH,
        ],
      },
    },
  },
};

/** Alias retained for backward compatibility */
export const STAFF_GROUP_TOOLS_SCHEMA = SKILL_AND_PAIR_TOOLS_SCHEMA;

const SKILL_AND_PAIR_STAGE2_PROMPT = `あなたは「skill_and_pair (スキル定義・サブシフト/グループ別の属性配置人数ルール・スキル付与・ペア制約)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（スキル・資格の追加/削除/付与・サブシフト/グループ別のスキルや属性の人数下限/上限/ヘルプ条件・ペア同時勤務制限/同行）に厳密に合致する指示のみを抽出してください。
・他カテゴリの指示や、一覧のツールで表現できない未対応の要求は無視し、該当する操作が1つもなければ "none" を出力してください。

【skill_and_pair に属するツール一覧】
1. "add_skill_def": 新しいスキル・資格（例: 「感染管理」「緩和ケア」「小児対応」「副リーダー」など）を追加・設定する
   - 必須引数: skillName (スキル名)
   - 任意引数 (指示がある場合のみ指定):
     * minDay / minEvening / minNight: 日勤 / 準夜 / 深夜の各シフトで必要な最低人数 (数値)
     * substitutesFor: このスキルが別スキル（例: "リーダー" や "救急・ICU"）の代わりになれる場合のみ、その対象スキル名を指定する
   args例: { "skillName": "感染管理" } / { "skillName": "小児対応", "minDay": 1 } / { "skillName": "救命サポート", "substitutesFor": "救急・ICU" }
2. "remove_skill_def": 既存のスキル（例: 「呼吸器管理」「救急・重症対応」など）を削除・削減する
   args: { "skillName": "呼吸器管理" }
3. "update_nurse_skill": 特定のスタッフまたはロール（"中堅", "リーダー", "新人", "村上" など）にスキルを付与("add")または解除("remove")する
   args: { "target": "村上", "skillName": "感染管理", "action": "add" }
4. "set_staffing_rule": シフト・サブシフト（日勤Group A[日A]="D_A"、日勤Group B[日B]="D_B"、日勤の各グループ="D_each_group"、日勤全体="D"、準夜="E"、深夜="N"、夜勤帯="night_both"）における、特定スキル・属性（スキル名、"新人"、"中堅"、所属グループ "A班" / "B班"）の配置人数の下限(minCount)・上限(maxCount)・不足時のみのヘルプ制限(onlyWhenShort)を設定する
   - 必須引数:
     * targetShift: 対象シフト記号（"D_A" = 日勤Group A / 日A, "D_B" = 日勤Group B / 日B, "D_each_group" = 日勤の各グループ両方, "D" = 日勤全体, "E" = 準夜勤, "N" = 深夜勤, "night_both" = 準夜・深夜の各シフト）
     * attribute: 対象のスタッフ属性名またはスキル名（例: "救急・ICU", "リーダー", "新人", "中堅", "A班", "B班" など。※注意: attribute に "日勤A" や "D_A" のようなシフト名を絶対に入れないでください）
   - 任意引数:
     * minCount: 下限人数（「y人以上」「最低y名」）
     * maxCount: 上限人数（「n人以下」「最大n名まで」「入れない/禁止なら 0」）
     * onlyWhenShort: 「足りないときだけ」「ヘルプとしてのみ」他グループに入ることを許可する場合は true（ソルバー側で調整済みのペナルティ重みを自動適用します）
   ※【重要】「〇〇班は自班の日勤にしか入れない（他班の日勤には入れない）」の表現ルール:
     自班のサブシフトに maxCount: 0 を指定すると「自班の日勤に0名しか入れない（＝自班配置禁止）」という逆の意味になってしまいます。必ず「入れない側（反対側）のサブシフト」を targetShift に指定し、attribute にその班名（"A班" または "B班"）、maxCount に 0 を指定してください（例: 「B班は日Bにしか入れない」➔ 日A("D_A")に "B班" が入るのを禁止するため {"targetShift":"D_A","attribute":"B班","maxCount":0}）。
   ※「一方の班が足りないときだけ他方の班から応援で入れるが上限k名」の場合は、応援に入る班を attribute に指定し、maxCount: k, onlyWhenShort: true とします。
5. "add_ng_pair": 2名の看護師(nurseA, nurseB)が同じシフト・同じグループに同時に入らないよう禁止する（相性NGペア）
   - 必須引数: nurseA, nurseB
   - 任意引数: shifts ("D" | "D_A" | "D_B" | "E" | "N" の配列。省略時は夜勤帯 ["E", "N"]。日勤も含めて同じチームにしない場合は ["D", "E", "N"]、日勤のみなら ["D"] を指定)
   args例: { "nurseA": "N11", "nurseB": "N18" } / { "nurseA": "村上", "nurseB": "福田", "shifts": ["D", "E", "N"] }
6. "add_preceptor_pair": 新人(newcomerNurse)と指導者(mentorNurse)が同じシフトに同行するよう設定する（プリセプターペア）
   - 必須引数: newcomerNurse, mentorNurse
   - 任意引数: shifts ("D" | "D_A" | "D_B" | "E" | "N" の配列。省略時は夜勤帯 ["E", "N"])
   args: { "newcomerNurse": "N25", "mentorNurse": "N01" }
7. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「新しいスキルとして『感染管理』を追加して」
出力: {"tools":[{"tool_name":"add_skill_def","args":{"skillName":"感染管理"}}]}

指示: 「新しいスキルとして『救命サポート』を追加して、救急・ICUの代わりになれるようにして」
出力: {"tools":[{"tool_name":"add_skill_def","args":{"skillName":"救命サポート","substitutesFor":"救急・ICU"}}]}

指示: 「小児対応スキルを追加して、日勤に最低1名配置して」
出力: {"tools":[{"tool_name":"add_skill_def","args":{"skillName":"小児対応","minDay":1}}]}

指示: 「緩和ケアのスキルを削除して」
出力: {"tools":[{"tool_name":"remove_skill_def","args":{"skillName":"緩和ケア"}}]}

指示: 「村上さんに感染管理スキルを付与して」
出力: {"tools":[{"tool_name":"update_nurse_skill","args":{"target":"村上","skillName":"感染管理","action":"add"}}]}

指示: 「日勤のBグループにはリーダーを2人以上配置して、B班は日Bにしか入れないようにして」
出力: {"tools":[{"tool_name":"set_staffing_rule","args":{"targetShift":"D_B","attribute":"リーダー","minCount":2}},{"tool_name":"set_staffing_rule","args":{"targetShift":"D_A","attribute":"B班","maxCount":0}}]}

指示: 「夜勤の各シフトには新人を1人以下にして」
出力: {"tools":[{"tool_name":"set_staffing_rule","args":{"targetShift":"night_both","attribute":"新人","maxCount":1}}]}

指示: 「日Aの人数が足りないときだけB班も日Aに応援で入れるけど、最大2名までにして」
出力: {"tools":[{"tool_name":"set_staffing_rule","args":{"targetShift":"D_A","attribute":"B班","maxCount":2,"onlyWhenShort":true}}]}

指示: 「N11とN18を相性NGペアにして」
出力: {"tools":[{"tool_name":"add_ng_pair","args":{"nurseA":"N11","nurseB":"N18"}}]}

指示: 「村上さんと福田さんは日勤でも夜勤でも同じシフトに入らないようにして」
出力: {"tools":[{"tool_name":"add_ng_pair","args":{"nurseA":"村上","nurseB":"福田","shifts":["D","E","N"]}}]}

指示: 「オリエンテーションというシフトを追加して」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_CALENDAR_BRANCHES = [
  toolBranch(
    "add_request",
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
    ["nurseNameOrId", "shift", "isHard"]
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
    ["nurseNameOrId", "shift"]
  ),
  toolBranch(
    "forbid_shift",
    {
      nurseNameOrId: { type: "string" },
      day: { type: "number" },
      shifts: {
        type: "array",
        items: { type: "string" },
      },
    },
    ["nurseNameOrId", "day"]
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
    ["nurseNameOrId"]
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
                "土日休み",
                "土日祝休み",
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

export const STAFF_REQUEST_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [...STAFF_CALENDAR_BRANCHES, SET_NURSE_CONTRACT_BRANCH, NONE_ESCAPE_HATCH_BRANCH],
      },
    },
  },
};

const STAFF_CALENDAR_STAGE2_PROMPT = `あなたは「staff_calendar (特定スタッフ個人の日付・期間・曜日/祝日カレンダー希望・固定・禁止)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（特定スタッフ個人の単日・期間・曜日/祝日におけるシフト希望・固定・特定日のシフト禁止）に厳密に合致する指示のみを抽出してください。
・日付・曜日・祝日の指定がない月間契約条件（日勤専従、深夜勤免除、月間夜勤上限、月間勤務日数上限/下限など）や他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【単日指定と期間指定の使い分けルール】
・対象月は11月(1日〜30日)です。「11/17」のような表記は「11月17日 (17日)」を意味します。
・1日だけの指定（例:「12日を休みに」「11/12を休みに」）には単日用の "add_request" / "forbid_shift" (引数: day) を使います。
・「〜まで」「〜から〜まで」「〜以降」のような複数日の期間指定には期間用の "add_request_range" / "forbid_shift_range" (引数: startDay, endDay ※片方のみの指定も可) を使います。
  - 開始日の記載がない「11/17まで動けない」「10日まで休み」は endDay のみ指定 (endDay: 17)
  - 終了日の記載がない「20日以降休み」は startDay のみ指定 (startDay: 20)
  - 「11/5から11/10まで休み」は両方指定 (startDay: 5, endDay: 10)

【staff_calendar に属するツール一覧】
※シフト・シフトエイリアス記号の対応（任意の粒度で指定可）:
  - "O": 休み・公休
  - "W": 勤務（日勤・準夜・深夜などシフト種別お任せで出勤）
  - "D": 日勤（日A・日Bを含む日勤帯） / "D_A": 日勤A / "D_B": 日勤B
  - "EN": 夜勤（準夜または深夜の夜勤帯）
  - "E": 準夜・準夜勤
  - "N": 深夜・深夜勤
  - カスタムシフト名・エイリアス記号（例: "新人研修", "勉強会", "DE" など）もそのまま shift に指定可能
1. "add_request": 特定の看護師の「単日(day=1〜30)」を指定シフト("O" | "W" | "D" | "D_A" | "D_B" | "EN" | "E" | "N" または追加シフト名)に固定(isHard: true)またはソフト希望(isHard: false)として設定する
   args: { "nurseNameOrId": "村上", "day": 8, "shift": "O", "isHard": true }
2. "add_request_range": 特定の看護師の「複数日の期間(startDay〜endDay、片方省略可)」を指定シフトに一括で固定または希望追加する
   args例: { "nurseNameOrId": "福田", "endDay": 14, "shift": "O", "isHard": true } / { "nurseNameOrId": "三浦", "startDay": 24, "shift": "O", "isHard": true } / { "nurseNameOrId": "村上", "startDay": 6, "endDay": 11, "shift": "O", "isHard": true }
3. "add_calendar_request": 特定の看護師の「特定の曜日（日〜土）」または「祝日（11/3文化の日・11/23勤労感謝の日）」のシフトを一括で固定・指定する
   - 必須引数: nurseNameOrId, shift ("O" | "W" | "D" | "EN" | "E" | "N" 等)
   - 任意引数:
     * daysOfWeek: 対象曜日の配列（"日" | "月" | "火" | "水" | "木" | "金" | "土"）
     * holidays: 祝日の扱い ("include"=祝日も含める, "exclude"=祝日を除外する, "only"=祝日のみ対象)
     * onlyMatchedDaysWork: 「〇〇曜日だけ勤務」「〇〇曜日のみ出勤（それ以外の曜日はすべて休み）」のように指定日以外をすべて公休(O)にする場合は true を指定
   args例: { "nurseNameOrId": "村上", "daysOfWeek": ["火", "金"], "shift": "W", "onlyMatchedDaysWork": true } / { "nurseNameOrId": "西村", "daysOfWeek": ["日", "土"], "holidays": "include", "shift": "O" }
4. "forbid_shift": 特定の看護師の「特定の単日(day=1〜30が明示されている場合のみ)」の指定シフト（省略時は夜勤 ["E", "N"]）を禁止する
   args: { "nurseNameOrId": "原田", "day": 19 }
5. "forbid_shift_range": 特定の看護師の「複数日の期間(startDay〜endDayが明示されている場合のみ)」の指定シフト（省略時は夜勤 ["E", "N"]）を禁止する
   args: { "nurseNameOrId": "原田", "startDay": 19, "endDay": 23 }
6. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「村上さんの8日を確定の休み(O)にして」
出力: {"tools":[{"tool_name":"add_request","args":{"nurseNameOrId":"村上","day":8,"shift":"O","isHard":true}}]}

指示: 「西村さんの3日を日勤に固定して」
出力: {"tools":[{"tool_name":"add_request","args":{"nurseNameOrId":"西村","day":3,"shift":"D","isHard":true}}]}

指示: 「福田さんが体調不良で11/14まで出勤できないので休みにして」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"福田","endDay":14,"shift":"O","isHard":true}}]}

指示: 「三浦さんは24日以降休みにして」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"三浦","startDay":24,"shift":"O","isHard":true}}]}

指示: 「村上さんは11/6から11/11までリフレッシュ休暇で休みにして」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"村上","startDay":6,"endDay":11,"shift":"O","isHard":true}}]}

指示: 「三浦さんは火曜と金曜だけ勤務にして」
出力: {"tools":[{"tool_name":"add_calendar_request","args":{"nurseNameOrId":"三浦","daysOfWeek":["火","金"],"shift":"W","onlyMatchedDaysWork":true}}]}

指示: 「原田さんは土日は休みだけど祝日は出勤OKにして」
出力: {"tools":[{"tool_name":"add_calendar_request","args":{"nurseNameOrId":"原田","daysOfWeek":["日","土"],"holidays":"exclude","shift":"O"}}]}

指示: 「原田さんの19日は夜勤不可にして」
出力: {"tools":[{"tool_name":"forbid_shift","args":{"nurseNameOrId":"原田","day":19}}]}

指示: 「西村さんを日勤専従にして」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_CONTRACT_STAGE2_PROMPT = `あなたは「staff_contract (特定スタッフ個人の働き方契約・シフト免除・月間日数/夜勤回数/個人連勤の上限・下限)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（特定スタッフ個人の月間契約条件・シフト免除・月間日数や夜勤回数の上限/下限）に厳密に合致する指示のみを抽出してください。
・特定の日付指定（例:「8日を休みに」）や病棟全体のルール変更は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【staff_contract に属するツール一覧】
1. "set_nurse_contract": 特定の看護師個人の月間を通じた基本の働き方・勤務契約条件を変更する
   - 必須引数:
     * nurseNameOrId: 看護師名またはID
     * item: 変更する契約項目（以下から1つ選択）
       - "maxWorkDays": 個人の月間最大勤務日数上限（パート等の「月N日までの勤務」「最大N日以内」の上限。value: N）
       - "minWorkDays": 個人の月間最低勤務日数下限（「最低N日以上」「最小勤務日数をN日に」の下限。免除・下限なし・ゼロにする場合は value: 0）
       - "minDaysOff": 個人の月間最低公休日数（月の休日数の下限。value: N）
       - "maxConsecutiveDays": 個人の最大連続勤務日数（「〇連勤まで」の上限。value: N）
       - "maxNight": 個人の月間夜勤回数上限（準夜＋深夜の最大回数。value: N）
       - "日勤専従": 日勤専従（昼間のみ勤務・夜勤免除・夜勤なし）に設定
       - "夜勤専従": 夜勤専従（夜勤のみ勤務・日勤なし）に設定
       - "深夜勤免除": 深夜勤(N)のみ免除（深夜勤は入れない）に設定
       - "準夜勤免除": 準夜勤(E)のみ免除（準夜勤は入れない）に設定
       - "土日休み": 平日のみ勤務契約（土日休み・祝日は勤務可）に設定
       - "土日祝休み": 土日および祝日をすべて休みにする契約に設定
       - "制限解除": 日勤専従・夜勤専従・シフト免除等を解除して通常勤務に戻す
   - 任意引数:
     * value: 日数または回数（"maxWorkDays" / "minWorkDays" / "minDaysOff" / "maxConsecutiveDays" / "maxNight" の数値。下限をなくす・ゼロにする場合は 0）
   args例: { "nurseNameOrId": "西村", "item": "日勤専従" } / { "nurseNameOrId": "福田", "item": "maxNight", "value": 3 }
2. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「西村さんを日勤専従にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"日勤専従"}}]}

指示: 「村上さんは夜勤専従にして、月の勤務日数は11日以内にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"村上","item":"夜勤専従"}},{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"村上","item":"maxWorkDays","value":11}}]}

指示: 「西村さんは育児休業中なので、月の最低勤務日数をゼロにして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"minWorkDays","value":0}}]}

指示: 「福田さんの月間夜勤上限を3回までにして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"福田","item":"maxNight","value":3}}]}

指示: 「原田さんは月の休みを11日以上にして、準夜勤は免除にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"原田","item":"minDaysOff","value":11}},{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"原田","item":"準夜勤免除"}}]}

指示: 「三浦さんは3連勤までにして、深夜勤は免除にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"三浦","item":"maxConsecutiveDays","value":3}},{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"三浦","item":"深夜勤免除"}}]}

指示: 「村上さんの8日を確定の休みにして」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_REQUEST_STAGE2_PROMPT = `あなたは「staff_request (特定スタッフ個人の希望休・期間休職・シフト固定・特定シフト禁止・個人契約条件)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（特定スタッフ個人の日別/期間シフト希望・シフト禁止・個人契約条件）に厳密に合致する指示のみを抽出してください。
・他カテゴリの指示は無視し、このカテゴリに該当する操作が1つもなければ "none" を出力してください。

【単日指定と期間指定の使い分けルール】
・対象月は11月(1日〜30日)です。「11/14」のような表記は「11月14日 (14日)」を意味します。
・1日だけの指定（例:「8日を休みに」「11/8を休みに」）には単日用の "add_request" / "forbid_shift" (引数: day) を使います。
・「〜まで」「〜から〜まで」「〜以降」のような複数日の期間指定には期間用の "add_request_range" / "forbid_shift_range" (引数: startDay, endDay ※片方のみの指定も可) を使います。
  - 開始日の記載がない「11/14まで出勤できない」「10日まで休み」は endDay のみ指定 (endDay: 14)
  - 終了日の記載がない「24日以降休み」は startDay のみ指定 (startDay: 24)
  - 「11/6から11/11まで休み」は両方指定 (startDay: 6, endDay: 11)

【staff_request に属するツール一覧】
※シフト・シフトグループ記号の対応:
  - "O": 休み・公休
  - "W": 勤務（日勤・準夜・深夜などシフト種別お任せで出勤）
  - "D": 日勤
  - "EN": 夜勤（準夜または深夜の夜勤帯）
  - "E": 準夜・準夜勤
  - "N": 深夜・深夜勤
1. "add_request": 特定の看護師の「単日(day=1〜30)」を公休("O")・勤務("W")・日勤("D")・夜勤("EN")・準夜("E")・深夜("N")に固定または希望追加する
   args: { "nurseNameOrId": "村上", "day": 8, "shift": "O", "isHard": true }
2. "add_request_range": 特定の看護師の「複数日の期間(startDay〜endDay、片方省略可)」を公休("O")・勤務("W")・日勤("D")・夜勤("EN")・準夜("E")・深夜("N")に一括で固定または希望追加する
   - 必須引数: nurseNameOrId, shift ("O" | "W" | "D" | "EN" | "E" | "N"), isHard
   - 任意引数:
     * startDay: 開始日
     * endDay: 終了日
   args例: { "nurseNameOrId": "福田", "endDay": 14, "shift": "O", "isHard": true } / { "nurseNameOrId": "三浦", "startDay": 24, "shift": "O", "isHard": true } / { "nurseNameOrId": "村上", "startDay": 6, "endDay": 11, "shift": "O", "isHard": true }
3. "add_calendar_request": 特定の看護師の「特定の曜日（日〜土）」または「祝日（11/3文化の日・11/23勤労感謝の日）」のシフトを一括で固定・指定する
   - 必須引数: nurseNameOrId, shift ("O" | "W" | "D" | "EN" | "E" | "N")
   - 任意引数:
     * daysOfWeek: 対象曜日の配列（"日" | "月" | "火" | "水" | "木" | "金" | "土"）
     * holidays: 祝日の扱い ("include" | "exclude" | "only")
     * onlyMatchedDaysWork: 指定日以外をすべて公休(O)にする場合は true を指定
   args例: { "nurseNameOrId": "村上", "daysOfWeek": ["火", "金"], "shift": "W", "onlyMatchedDaysWork": true } / { "nurseNameOrId": "西村", "daysOfWeek": ["日", "土"], "holidays": "include", "shift": "O" }
4. "forbid_shift": 特定の看護師の「特定の単日(day=1〜30が明示されている場合のみ)」の指定シフト（省略時は夜勤 ["E", "N"]）を禁止する
   args: { "nurseNameOrId": "原田", "day": 19 }
5. "forbid_shift_range": 特定の看護師の「複数日の期間(startDay〜endDayが明示されている場合のみ)」の指定シフト（省略時は夜勤 ["E", "N"]）を禁止する
   args: { "nurseNameOrId": "原田", "startDay": 19, "endDay": 23 }
6. "set_nurse_contract": 特定の看護師個人の月間を通じた基本の働き方・勤務契約条件を変更する
   args例: { "nurseNameOrId": "西村", "item": "日勤専従" } / { "nurseNameOrId": "福田", "item": "maxNight", "value": 3 }
7. "none": 上記ツールの定義に合致しない場合、または対象スタッフ名・日付が不明な場合
   args: {}

【Few-shot 例】
指示: 「村上さんの8日を確定の休み(O)にして」
出力: {"tools":[{"tool_name":"add_request","args":{"nurseNameOrId":"村上","day":8,"shift":"O","isHard":true}}]}

指示: 「西村さんの3日を日勤に固定して」
出力: {"tools":[{"tool_name":"add_request","args":{"nurseNameOrId":"西村","day":3,"shift":"D","isHard":true}}]}

指示: 「福田さんが体調不良で11/14まで出勤できないので休みにして」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"福田","endDay":14,"shift":"O","isHard":true}}]}

指示: 「三浦さんは火曜と金曜だけ勤務にして」
出力: {"tools":[{"tool_name":"add_calendar_request","args":{"nurseNameOrId":"三浦","daysOfWeek":["火","金"],"shift":"W","onlyMatchedDaysWork":true}}]}

指示: 「西村さんを日勤専従にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"日勤専従"}}]}

指示: 「最大連勤を3日に変更して」
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
          "minLeadersDay",
          "minLeadersEvening",
          "minLeadersNight",
          "minIcuDay",
          "minIcuEvening",
          "minIcuNight",
          "maxNewcomersNight",
          "minTeamMembersDay",
          "maxMonthlyOvertimeHours",
          "maxAnnualOvertimeHours",
          "staffCount",
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
        enum: ["role_and_skill", "role", "skill", "all"],
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
          "forbidNightToDay",
          "forbidEveningToDay",
          "forbidEveningToNight",
          "forbidNightToEvening",
          "forbidDayToNight",
          "forbidEveningToEvening",
          "forbidNightToNight",
          "maxConsecutiveNight2",
          "requireOffAfterNight",
          "enforcePrevMonthCarryover",
          "enforceSkillCoverage",
          "enforceNewcomerNightLimit",
          "requireWeekendOff",
          "enforceNgPairs",
          "enforcePreceptorPairs",
          "enforceTeamBalance",
          "enforceHardRequests",
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

export const WARD_CONFIG_TOOLS_SCHEMA = {
  type: "object",
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        anyOf: [
          ...WARD_COVERAGE_AND_PARAM_BRANCHES,
          ...WARD_TRANSITION_AND_RULE_BRANCHES,
          NONE_ESCAPE_HATCH_BRANCH,
        ],
      },
    },
  },
};

const WARD_COVERAGE_AND_PARAM_STAGE2_PROMPT = `あなたは「ward_coverage_and_param (病棟全体の数値パラメータ・必要人数・特定日の人数変更・夜勤回数の平準化)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（病棟全体の数値パラメータ・特定日の必要人数変更・夜勤平準化）に厳密に合致し、ユーザーが明示的に指示した項目のみを抽出してください。
・個人名のシフト・契約変更や、2日間のシフト遷移ルールは無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【ward_coverage_and_param に属するツール一覧】
1. "set_param": 病棟全体の数値設定を変更する
   - "maxConsecutiveWorkDays": 最大連勤日数（何日連続まで働けるかの上限。例: 4）
   - "minMonthlyDaysOff": 月間最低公休日数（月あたりの休みの最低日数。例: 10）
   - "minMonthlyWorkDays": 月間最低勤務日数（月あたりの出勤の最低日数・ノルマ。例: 10）
   - "maxMonthlyNightShifts": 月間夜勤回数上限（月あたりの夜勤の最大回数。例: 7）
   - "weekdayDayStaff": 平日日勤の必要人数 (例: 11)
   - "weekendDayStaff": 土日日勤の必要人数 (例: 8)
   - "eveningStaff": 準夜勤の必要人数 (例: 3)
   - "nightStaff": 深夜勤の必要人数 (例: 3)
   - "minLeadersDay" / "minLeadersEvening" / "minLeadersNight": 日勤/準夜/深夜のリーダー最低人数
   - "minIcuDay" / "minIcuEvening" / "minIcuNight": 日勤/準夜/深夜の救急・重症対応最低人数
   - "minTeamMembersDay": 固定チームナーシング(A班・B班)の日勤最低人数 (例: 3)
   - "maxAnnualOvertimeHours": 36協定の年間時間外（残業）上限 (例: 360)
   - "maxMonthlyOvertimeHours": 36協定の月間時間外（残業）上限 (例: 45)
2. "level_night_shifts": スキル毎・役割毎に月間の夜勤回数(準夜・深夜)を平準化（均等化）する
   args: { "groupBy": "role_and_skill" }
3. "add_date_coverage": 特定のカレンダー日付(day=1〜30)の病棟全体の必要人数(minStaff名以上)を変更する
   args: { "day": 15, "shift": "D", "minStaff": 12 }
4. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「病棟全体の最大連勤を3日に変更して」
出力: {"tools":[{"tool_name":"set_param","args":{"paramName":"maxConsecutiveWorkDays","paramValue":3}}]}

指示: 「役割やスキルグループごとの月間夜勤回数の偏りをなくして均等化して」
出力: {"tools":[{"tool_name":"level_night_shifts","args":{"groupBy":"role_and_skill"}}]}

指示: 「18日の日勤の必要人数を11人以上にして」
出力: {"tools":[{"tool_name":"add_date_coverage","args":{"day":18,"shift":"D","minStaff":11}}]}

指示: 「準夜勤の翌日に日勤を入れるシフト並びを禁止して」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const WARD_TRANSITION_AND_RULE_STAGE2_PROMPT = `あなたは「ward_transition_and_rule (病棟全体のシフト遷移マトリクス・2日間の並び順禁止/必須・全体ルールON/OFF)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（2日間のシフト並び順・連続可能性の禁止/許可/必須、および病棟全体ルールのON/OFF）に厳密に合致する指示のみを抽出してください。
・数値パラメータの変更や個人別の指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【ward_transition_and_rule に属するツール一覧】
1. "set_shift_transition": 2日間のシフト並び順・連続可能性（前日 fromShift ➔ 翌日 toShift）を汎用的に禁止("forbid")・許可("allow")・必須("require")に設定する
   - fromShift: "D" (日勤), "E" (準夜勤), "N" (深夜勤)
   - toShift: "D" (日勤), "E" (準夜勤), "N" (深夜勤), "O" (公休・休み)
   - policy: "forbid" (禁止する), "allow" (許可する/禁止解除), "require" (必須にする、例: N ➔ O を require)
   args例: { "fromShift": "N", "toShift": "O", "policy": "require" } / { "fromShift": "D", "toShift": "N", "policy": "forbid" } / { "fromShift": "E", "toShift": "E", "policy": "forbid" }
2. "toggle_rule": 病棟全体ルールを有効(true)・無効(false)に切り替える
   - "requireOffAfterNight": 深夜勤の翌日は必ず休みにするルール
   - "forbidDayToNight": 日勤→翌日深夜勤（日深夜）の禁止ルール
   - "forbidEveningToEvening": 連続準夜勤（準夜→翌日準夜 E→E）の禁止ルール
   - "forbidNightToNight": 連続深夜勤（深夜→翌日深夜 N→N）の禁止ルール
   - "forbidNightToDay" / "forbidEveningToDay" / "forbidEveningToNight" / "forbidNightToEvening": 各シフト遷移禁止ルール
   - "maxConsecutiveNight2": 深夜勤3連続の禁止(2連続まで)
   - "enforcePreceptorPairs": プリセプター同行夜勤ルール
   - "enforceTeamBalance": 固定チームナーシング / 固定チーム均等配置ルール
   - "requireWeekendOff": 週末休みの確保ルール
   - "enforceNgPairs": 相性NGペアの同シフト禁止ルール
   - "enforceSkillCoverage": スキルごとの最低配置人数必須ルール
   - "enforceNewcomerNightLimit": 夜勤の新人人数上限ルール
   - "enforcePrevMonthCarryover": 前月末シフトからの連続性引き継ぎルール
   - "enforce36Agreement": 36協定（残業時間上限）の遵守ルール
   - "preserveCurrentSchedule": 微調整モード（既存シフト表からの変更最小化）
3. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「深夜勤の翌日は必ず公休にするルールを有効にして」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"N","toShift":"O","policy":"require"}}]}

指示: 「準夜勤の翌日に日勤を入れるシフト並びを禁止して」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"E","toShift":"D","policy":"forbid"}}]}

指示: 「連続深夜勤を禁止して1回ずつにして」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"N","toShift":"N","policy":"forbid"}}]}

指示: 「固定チーム均等配置を有効にして」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"enforceTeamBalance","ruleEnabled":true}}]}

指示: 「週末休みの確保ルールをOFFにして」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"requireWeekendOff","ruleEnabled":false}}]}

指示: 「病棟全体の最大連勤を3日に変更して」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const WARD_CONFIG_STAGE2_PROMPT = `あなたは「ward_config (病棟全体の数値パラメータ・シフト遷移ルール・全体ルールON/OFF・夜勤平準化・特定日の必要人数)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【抽出の基本原則】
・下記ツール一覧の定義（病棟全体の数値パラメータ・シフト遷移ルール・全体ルールのON/OFF・夜勤平準化・特定日の必要人数）に厳密に合致し、ユーザーが明示的に指示した項目のみを抽出してください。
・他カテゴリの指示（特定スタッフ個人の休日・シフト指定など）は無視し、このカテゴリに該当する操作が1つもなければ "none" を出力してください。

【ward_config に属するツール一覧】
1. "set_param": 病棟全体の数値設定を変更する
   - "maxConsecutiveWorkDays": 最大連勤日数
   - "minMonthlyDaysOff": 月間最低公休日数
   - "minMonthlyWorkDays": 月間最低勤務日数
   - "maxMonthlyNightShifts": 月間夜勤回数上限
   - "weekdayDayStaff" / "weekendDayStaff" / "eveningStaff" / "nightStaff": 各シフトの必要人数
   - "minLeadersDay" / "minLeadersEvening" / "minLeadersNight": リーダー最低人数
   - "minIcuDay" / "minIcuEvening" / "minIcuNight": 救急・重症対応最低人数
   - "minTeamMembersDay": 固定チームナーシング(A班・B班)の日勤最低人数
   - "maxAnnualOvertimeHours" / "maxMonthlyOvertimeHours": 36協定の時間外上限
2. "toggle_rule": 病棟全体ルールを有効(true)・無効(false)に切り替える
   - "requireOffAfterNight" / "forbidDayToNight" / "forbidEveningToEvening" / "forbidNightToNight" / "forbidNightToDay" / "forbidEveningToDay" / "forbidEveningToNight" / "forbidNightToEvening" / "maxConsecutiveNight2" / "enforcePreceptorPairs" / "enforceTeamBalance" / "requireWeekendOff" / "enforceNgPairs" / "enforceSkillCoverage" / "enforceNewcomerNightLimit" / "enforcePrevMonthCarryover" / "enforce36Agreement" / "preserveCurrentSchedule"
3. "set_shift_transition": 2日間のシフト並び順・連続可能性（前日 fromShift ➔ 翌日 toShift）を禁止("forbid")・許可("allow")・必須("require")に設定する
4. "level_night_shifts": スキル毎・役割毎に月間の夜勤回数(準夜・深夜)を平準化（均等化）する
   args: { "groupBy": "role_and_skill" }
5. "add_date_coverage": 特定のカレンダー日付(day=1〜30)の病棟全体の必要人数(minStaff名以上)を変更する
   args: { "day": 18, "shift": "D", "minStaff": 11 }
6. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「役割やスキルグループごとの月間夜勤回数の偏りをなくして均等化して」
出力: {"tools":[{"tool_name":"level_night_shifts","args":{"groupBy":"role_and_skill"}}]}

指示: 「深夜勤の翌日は必ず公休にするルールを有効にして」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"requireOffAfterNight","ruleEnabled":true}}]}

指示: 「固定チーム均等配置を有効にして」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"enforceTeamBalance","ruleEnabled":true}}]}

指示: 「病棟全体の最大連勤を3日に変更して」
出力: {"tools":[{"tool_name":"set_param","args":{"paramName":"maxConsecutiveWorkDays","paramValue":3}}]}

指示: 「18日の日勤の必要人数を11人以上にして」
出力: {"tools":[{"tool_name":"add_date_coverage","args":{"day":18,"shift":"D","minStaff":11}}]}

指示: 「オリエンテーションというシフトを追加して」
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

const SYSTEM_ACTION_STAGE2_PROMPT = `あなたは「system_action (ルール全クリア・初期状態リセット・矛盾デモ注入・矛盾診断・再計算)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、実行すべきツール(tool_name)をJSONで出力してください。

【system_action に属するツール一覧】
1. "clear_custom_rules": 追加したカスタムルールをすべて解除する
   args: {}
2. "reset_default": すべての設定を初期状態にリセットする
   args: {}
3. "inject_conflict_demo": 矛盾デモシナリオを注入する
   args: {}
4. "diagnose_conflict": 矛盾チェック・シフトが組めない原因の診断を行う
   args: {}
5. "solve_only": 条件を変えずにシフトを再最適化する
   args: {}
6. "none": 上記ツールの定義に合致しない場合
   args: {}

【Few-shot 例】
指示: 「追加したカスタム制約をすべてクリアして」
出力: {"tools":[{"tool_name":"clear_custom_rules","args":{}}]}

指示: 「初期設定にリセットして」
出力: {"tools":[{"tool_name":"reset_default","args":{}}]}

指示: 「矛盾をチェックして」
出力: {"tools":[{"tool_name":"diagnose_conflict","args":{}}]}

指示: 「今の条件で再計算して」
出力: {"tools":[{"tool_name":"solve_only","args":{}}]}

指示: 「村上さんの8日を休みにして」
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
  staff_request: {
    schema: STAFF_REQUEST_TOOLS_SCHEMA,
    systemPrompt: STAFF_REQUEST_STAGE2_PROMPT,
  },
  ward_config: {
    schema: WARD_CONFIG_TOOLS_SCHEMA,
    systemPrompt: WARD_CONFIG_STAGE2_PROMPT,
  },
  system_action: {
    schema: SYSTEM_ACTION_TOOLS_SCHEMA,
    systemPrompt: SYSTEM_ACTION_STAGE2_PROMPT,
  },
};

/**
 * Builds a concise, category-specific dynamic dictionary (active shifts, shift aliases, custom shifts,
 * registered skills, and matched nurse profiles) to inject into Turn 2 prompts so Gemini Nano has
 * exact domain context without polluting the static system prompt.
 */
export function buildCategoryDynamicDictionary(
  category: ExecutableToolCategory,
  state: NurseSchedulingState,
  instruction = ""
): string {
  const aliases = state.shiftAliases ?? createDefaultShiftAliases();
  const customShifts = state.customShiftDefs ?? [];
  const skills = state.skillDefs ?? createDefaultSkillDefs(state.config);

  const shiftEntries = [
    `O:公休`,
    `W:勤務(全出勤お任せ)`,
    `D:日勤(日A/日B含む)`,
    `D_A:日勤A`,
    `D_B:日勤B`,
    `EN:夜勤(準夜・深夜)`,
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
      ? `対象スタッフ候補: ${matchedNurses
          .map((n) => `${n.id}:${n.name}(${ROLE_LABELS[n.role]})`)
          .join(", ")}`
      : "";

  if (
    category === "staff_calendar" ||
    category === "staff_contract" ||
    category === "staff_request"
  ) {
    const presetLine =
      category === "staff_contract" || category === "staff_request"
        ? `契約プリセット: ${CONTRACT_PRESETS.map((p) => p.label).join(" / ")}`
        : "";
    return [
      `【利用可能なシフト・シフトエイリアス辞書】 ${shiftEntries.join(", ")}`,
      presetLine,
      nurseLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (category === "skill_and_pair") {
    return [
      `【対象シフト記号(targetShift)】 D_A:日勤Group A(日A), D_B:日勤Group B(日B), D_each_group:日勤の各グループ両方, D:日勤全体, E:準夜勤, N:深夜勤, night_both:夜勤両方`,
      `【指定可能な属性(attribute)】 所属班: A班, B班 / 役割: 新人, 中堅, リーダー / 登録済みスキル: ${skills
        .map((s) => `${s.label}(${s.shortLabel ?? s.code})`)
        .join(", ")}`,
      nurseLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (category === "custom_shift") {
    return customShifts.length > 0
      ? `【登録済み追加シフト辞書】 ${customShifts
          .map((cs) => `${cs.label}(${cs.shortLabel}, 所属:${cs.baseShift ?? "D"})`)
          .join(", ")}`
      : `【登録済み追加シフト辞書】 なし`;
  }

  return "";
}

function getSiblingFallbackCategory(
  category: ExecutableToolCategory
): ExecutableToolCategory | null {
  if (category === "staff_calendar") return "staff_contract";
  if (category === "staff_contract") return "staff_calendar";
  if (category === "ward_coverage_and_param") return "ward_transition_and_rule";
  if (category === "ward_transition_and_rule") return "ward_coverage_and_param";
  return null;
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
    ? repairedRoutes.length > 0
      ? `✅ 依頼内容の整合確認OK（カテゴリ自動補完 ${repairedRoutes.length}件 ➔ 適用 ${appliedLogs.length}件）`
      : `✅ 依頼内容の整合確認OK（計画 ${routes.length}ルート ➔ 適用 ${appliedLogs.length}件）`
    : `⚠️ 依頼内容の一部または全部が未反映（計画 ${routes.length}ルート / 適用 ${appliedLogs.length}件 / 未対応 ${missingRoutes.length}件）`;

  return {
    verified,
    checkedRoutesCount: routes.length,
    appliedCount: appliedLogs.length,
    repairedRoutes,
    missingRoutes,
    summaryJa,
  };
}

function resolveDaysFromToolArgs(a: Record<string, any>, numDays: number): number[] {
  if (typeof a.startDay === "number" || typeof a.endDay === "number") {
    const rawS =
      typeof a.startDay === "number"
        ? a.startDay
        : typeof a.day === "number"
          ? a.day
          : 1;
    const rawE =
      typeof a.endDay === "number"
        ? a.endDay
        : typeof a.day === "number"
          ? a.day
          : numDays;
    const start = Math.max(1, Math.min(numDays, Math.round(Math.min(rawS, rawE))));
    const end = Math.max(1, Math.min(numDays, Math.round(Math.max(rawS, rawE))));
    const out: number[] = [];
    for (let d = start; d <= end; d++) out.push(d);
    return out;
  }
  if (typeof a.day === "number" && a.day >= 1 && a.day <= numDays) {
    return [Math.round(a.day)];
  }
  return [];
}

function normalizeActiveShifts(
  raw: unknown,
  state?: NurseSchedulingState
): ShiftCode[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const customDefs = state?.customShiftDefs ?? [];
  const valid = raw
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      if (s === "D" || s === "D_A" || s === "D_B" || s === "E" || s === "N") return s;
      const custom = customDefs.find(
        (d) => d.code === s || d.label === s || d.shortLabel === s
      );
      if (custom) return custom.code;
      return s;
    });
  return valid.length > 0 ? Array.from(new Set(valid)) : undefined;
}

function resolveTargetShiftsFromArg(
  rawTargetShift: unknown,
  rawShifts: unknown,
  state?: NurseSchedulingState
): {
  targetShift: string;
  shifts: ShiftCode[];
} {
  const fromArray = normalizeActiveShifts(rawShifts, state);
  if (fromArray && fromArray.length > 0) {
    return {
      targetShift:
        fromArray.length === 2 && fromArray.includes("D_A") && fromArray.includes("D_B")
          ? "D_each_group"
          : fromArray.length === 2 && fromArray.includes("E") && fromArray.includes("N")
            ? "night_both"
            : fromArray[0]!,
      shifts: fromArray,
    };
  }
  const s = String(rawTargetShift || "D")
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/シフト$/g, "")
    .trim();
  if (/^D_A$|日A|Group\s*A|グループ\s*A|日勤\s*A/i.test(s)) {
    return { targetShift: "D_A", shifts: ["D_A"] };
  }
  if (/^D_B$|日B|Group\s*B|グループ\s*B|日勤\s*B/i.test(s)) {
    return { targetShift: "D_B", shifts: ["D_B"] };
  }
  if (/^D_each_group$|各グループ|各班/i.test(s)) {
    return { targetShift: "D_each_group", shifts: ["D_A", "D_B"] };
  }
  if (/^night_both$|夜勤両方|準夜・深夜/i.test(s)) {
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
  if (s) {
    const customDefs = state?.customShiftDefs ?? [];
    const existing = customDefs.find(
      (d) =>
        d.code === s ||
        d.label === s ||
        d.shortLabel === s ||
        d.label.includes(s) ||
        s.includes(d.label)
    );
    if (existing) {
      return { targetShift: existing.code, shifts: [existing.code] };
    }
    const inferred = inferShortLabelAndCode(s, customDefs);
    return { targetShift: inferred.code, shifts: [inferred.code] };
  }
  return { targetShift: "D", shifts: ["D"] };
}

function resolveShiftCodeOrAliasFromInput(
  rawShift: unknown,
  state: NurseSchedulingState
): ShiftCode {
  if (!rawShift) return "O";
  const s = String(rawShift)
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/シフト$/g, "")
    .trim();
  if (!s) return "O";
  if (
    s === "O" ||
    s === "W" ||
    s === "D" ||
    s === "D_A" ||
    s === "D_B" ||
    s === "EN" ||
    s === "E" ||
    s === "N"
  ) {
    return s;
  }
  if (/^公休$|^休み$|^休$/i.test(s)) return "O";
  if (/^勤務$|^出勤$/i.test(s)) return "W";
  if (/^日勤$/i.test(s)) return "D";
  if (/^日A$|^日勤A$/i.test(s)) return "D_A";
  if (/^日B$|^日勤B$/i.test(s)) return "D_B";
  if (/^夜勤$|^準深$/i.test(s)) return "EN";
  if (/^準夜$|^準夜勤$/i.test(s)) return "E";
  if (/^深夜$|^深夜勤$/i.test(s)) return "N";

  for (const cs of state.customShiftDefs ?? []) {
    if (
      cs.code === s ||
      cs.label === s ||
      cs.shortLabel === s ||
      s.includes(cs.label)
    ) {
      return cs.code;
    }
  }
  for (const al of state.shiftAliases ?? createDefaultShiftAliases()) {
    if (al.code === s || al.label === s || al.shortLabel === s) {
      return al.code;
    }
  }
  return s as ShiftCode;
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
  const defaultCustomShiftName =
    a.shiftName || state.customShiftDefs?.[0]?.label || "新人研修";

  switch (name) {
    case "add_custom_shift": {
      const baseShift: BaseShiftCode | undefined =
        a.baseShift === "D" || a.baseShift === "E" || a.baseShift === "N" || a.baseShift === "O"
          ? a.baseShift
          : undefined;
      return {
        op: "add_custom_shift",
        shiftName: defaultCustomShiftName,
        shortLabel: typeof a.shortLabel === "string" ? a.shortLabel : undefined,
        baseShift,
      };
    }
    case "add_shift_quota": {
      const cnt = typeof a.count === "number" ? a.count : 2;
      return {
        op: "add_shift_quota",
        shiftName: defaultCustomShiftName,
        targetRole: a.targetRole || "newcomer",
        minCount: cnt,
        maxCount: cnt,
      };
    }
    case "add_shift_prerequisite": {
      const cnt = typeof a.count === "number" ? a.count : 2;
      return {
        op: "add_shift_prerequisite",
        shiftName: defaultCustomShiftName,
        targetRole: a.targetRole || "newcomer",
        prereqMinCount: cnt,
        restrictedShifts: ["E", "N"],
      };
    }
    case "add_shift_day_restriction": {
      const hasDateRange = typeof a.startDay === "number" || typeof a.endDay === "number";
      const rawStart =
        typeof a.startDay === "number"
          ? a.startDay
          : typeof a.endDay === "number"
            ? a.endDay
            : undefined;
      const rawEnd =
        typeof a.endDay === "number"
          ? a.endDay
          : typeof a.startDay === "number"
            ? a.startDay
            : undefined;
      const allowedDays =
        a.dayRestriction === "weekend_only"
          ? [0, 6]
          : a.dayRestriction === "weekday_only" || !hasDateRange
            ? [1, 2, 3, 4, 5]
            : undefined;
      return {
        op: "add_shift_day_restriction",
        shiftName: defaultCustomShiftName,
        allowedDaysOfWeek: allowedDays,
        startDay: rawStart !== undefined ? Math.min(rawStart, rawEnd!) : undefined,
        endDay: rawEnd !== undefined ? Math.max(rawStart!, rawEnd) : undefined,
      };
    }
    case "add_daily_shift_cap": {
      const cap =
        typeof a.maxStaffPerDay === "number"
          ? a.maxStaffPerDay
          : typeof a.minStaffPerDay === "number"
            ? a.minStaffPerDay
            : 2;
      const minStaff =
        typeof a.minStaffPerDay === "number" ? a.minStaffPerDay : undefined;
      const targetRole: NurseRole | "all" | undefined =
        a.targetRole === "newcomer" ||
        a.targetRole === "mid" ||
        a.targetRole === "leader" ||
        a.targetRole === "all"
          ? a.targetRole
          : undefined;
      return {
        op: "add_daily_shift_cap",
        shiftName: defaultCustomShiftName,
        minStaff,
        maxStaff: cap,
        targetRole,
      };
    }
    case "allow_prev_month_shift":
      return {
        op: "allow_prev_month_shift",
        shiftName: defaultCustomShiftName,
        includePrevMonth: true,
      };
    case "level_night_shifts":
      return {
        op: "level_night_shifts",
        levelGroupBy: a.groupBy || "role_and_skill",
      };
    case "none":
      return null;
    case "add_ng_pair":
      if (!a.nurseA || !a.nurseB) return null;
      return {
        op: "add_ng_pair",
        nurseNameOrId: String(a.nurseA),
        nurseBNameOrId: String(a.nurseB),
        shifts: normalizeActiveShifts(a.shifts),
      };
    case "add_preceptor_pair": {
      if (!a.newcomerNurse || !a.mentorNurse) return null;
      return {
        op: "add_preceptor_pair",
        nurseNameOrId: String(a.newcomerNurse),
        nurseBNameOrId: String(a.mentorNurse),
        shifts: normalizeActiveShifts(a.shifts),
      };
    }
    case "add_skill_def": {
      if (!a.skillName) return null;
      let substitutesFor: NurseSkill | undefined;
      if (typeof a.substitutesFor === "string" && a.substitutesFor.trim()) {
        const activeSkills = state.skillDefs ?? createDefaultSkillDefs(state.config);
        substitutesFor = inferSkillCodeAndLabel(a.substitutesFor, activeSkills).code;
      } else if (a.substitutesForLeader === true) {
        substitutesFor = "leader_cap";
      }
      return {
        op: "add_skill_def",
        skillName: String(a.skillName).trim(),
        substitutesFor,
        skillMinDay: typeof a.minDay === "number" ? a.minDay : undefined,
        skillMinEvening: typeof a.minEvening === "number" ? a.minEvening : undefined,
        skillMinNight: typeof a.minNight === "number" ? a.minNight : undefined,
      };
    }
    case "remove_skill_def":
      if (!a.skillName) return null;
      return {
        op: "remove_skill_def",
        skillName: String(a.skillName).trim(),
      };
    case "update_nurse_skill": {
      if (!a.skillName) return null;
      const rawTarget = String(a.target || "").trim();
      let targetRole: NurseRole | "all" | undefined;
      let nurseNameOrId: string | undefined;
      if (rawTarget) {
        const cleanedRole = rawTarget.replace(/スタッフ|看護師|全員|層|たち/g, "").trim();
        if (/^中堅$|^mid$/i.test(cleanedRole)) targetRole = "mid";
        else if (/^リーダー$|^leader$/i.test(cleanedRole)) targetRole = "leader";
        else if (/^新人$|^newcomer$/i.test(cleanedRole)) targetRole = "newcomer";
        else if (/^全員$|^all$|^全$/i.test(rawTarget)) targetRole = "all";
        else nurseNameOrId = rawTarget;
      }
      return {
        op: "update_nurse_skill",
        skillName: String(a.skillName).trim(),
        skillAction: a.action === "remove" ? "remove" : "add",
        nurseNameOrId,
        targetRole,
      };
    }
    case "set_staffing_rule": {
      if (!a.attribute && !a.skillName && !a.targetRole) return null;
      const rawAttr = String(a.attribute || a.skillName || a.targetRole || "all").trim();
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs(state.config);
      const resolvedAttr = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const attrValue = resolvedAttr.isUnknownCustomSkill ? rawAttr : resolvedAttr.code;
      const { targetShift, shifts } = resolveTargetShiftsFromArg(
        a.targetShift || a.shiftName || a.shift,
        a.shifts,
        state
      );
      const minCount = typeof a.minCount === "number" ? a.minCount : undefined;
      const maxCount = typeof a.maxCount === "number" ? a.maxCount : undefined;
      const onlyWhenShort = a.onlyWhenShort === true ? true : undefined;

      return {
        op: "set_staffing_rule",
        targetShift,
        shifts,
        attribute: attrValue,
        minCount,
        maxCount,
        onlyWhenShort,
      };
    }
    case "set_nurse_contract": {
      if (!a.nurseNameOrId) return null;
      const item = typeof a.item === "string" ? a.item : undefined;
      const val = typeof a.value === "number" ? a.value : undefined;
      const isDayShiftOnly = item === "dayShiftOnly" || item === "日勤専従";
      const isNightShiftOnly = item === "nightShiftOnly" || item === "夜勤専従";
      const isForbidLateNight = item === "forbidLateNight" || item === "深夜勤免除";
      const isForbidEvening = item === "forbidEvening" || item === "準夜勤免除";
      const isWeekdayOnly =
        item === "weekdayOnly" || item === "土日休み" || item === "土日祝休み";
      const isHolidaysOff = item === "土日祝休み";
      const isAllowAll = item === "allowNightShift" || item === "制限解除";
      const isMaxNight = item === "maxNight" || item === "月間夜勤上限";
      const isMinDaysOff = item === "minDaysOff" || item === "月間最低公休日数";
      const isMinWorkDays = item === "minWorkDays" || item === "月間最低勤務日数";
      const isMaxWorkDays = item === "maxWorkDays" || item === "月間最大勤務日数";
      const isMaxConsecDays = item === "maxConsecutiveDays" || item === "最大連勤日数";

      const forbiddenShifts: ActiveShiftCode[] | undefined =
        isNightShiftOnly
          ? ["D"]
          : isForbidLateNight
            ? ["N"]
            : isForbidEvening
              ? ["E"]
              : isAllowAll || isDayShiftOnly
                ? []
                : normalizeActiveShifts(a.forbiddenShifts)?.filter(
                    (s): s is ActiveShiftCode =>
                      s === "D" || s === "D_A" || s === "D_B" || s === "E" || s === "N"
                  );
      return {
        op: "set_nurse_contract",
        nurseNameOrId: String(a.nurseNameOrId),
        nightOk:
          isDayShiftOnly
            ? false
            : isAllowAll || isNightShiftOnly
              ? true
              : typeof a.nightOk === "boolean"
                ? a.nightOk
                : undefined,
        maxMonthlyNightShifts:
          isMaxNight
            ? (val ?? 0)
            : typeof a.maxNight === "number"
              ? a.maxNight
              : undefined,
        minMonthlyDaysOff:
          isMinDaysOff
            ? val
            : typeof a.minDaysOff === "number"
              ? a.minDaysOff
              : undefined,
        minMonthlyWorkDays:
          isMinWorkDays
            ? (val ?? 0)
            : typeof a.minWorkDays === "number"
              ? a.minWorkDays
              : undefined,
        maxMonthlyWorkDays:
          isMaxWorkDays
            ? (val ?? 10)
            : typeof a.maxWorkDays === "number"
              ? a.maxWorkDays
              : undefined,
        maxConsecutiveWorkDays:
          isMaxConsecDays
            ? (val ?? 3)
            : typeof a.maxConsecutiveDays === "number"
              ? a.maxConsecutiveDays
              : undefined,
        forbiddenShifts,
        weekdayOnly:
          isWeekdayOnly
            ? true
            : isAllowAll
              ? false
              : typeof a.weekdayOnly === "boolean"
                ? a.weekdayOnly
                : undefined,
        holidaysOff: isHolidaysOff ? true : isAllowAll ? false : undefined,
      };
    }
    case "set_shift_transition": {
      if (!a.fromShift || !a.toShift || !a.policy) return null;
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
    case "add_request":
    case "add_request_range": {
      if (!a.nurseNameOrId) return null;
      const days = resolveDaysFromToolArgs(a, state.config.numDays);
      if (days.length === 0) return null;
      return {
        op: "add_request",
        nurseNameOrId: String(a.nurseNameOrId),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        shift: resolveShiftCodeOrAliasFromInput(a.shift, state),
        isHard: a.isHard !== false,
      };
    }
    case "add_calendar_request": {
      if (!a.nurseNameOrId) return null;
      const dowMap: Record<string, number> = {
        日: 0,
        月: 1,
        火: 2,
        水: 3,
        木: 4,
        金: 5,
        土: 6,
      };
      const rawDows: string[] = Array.isArray(a.daysOfWeek) ? a.daysOfWeek : [];
      const mappedDows = rawDows
        .map((k) => dowMap[String(k).replace(/曜日?$/, "")] ?? -1)
        .filter((d) => d >= 0 && d <= 6);
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
      const dowLabel = rawDows.length > 0 ? `${rawDows.join("・")}曜` : "";
      const holLabel =
        holMode === "only"
          ? "祝日"
          : holMode === "include"
            ? `${dowLabel ? "＋" : ""}祝日`
            : holMode === "exclude"
              ? "（祝日除く）"
              : "";
      const onlyMatched = a.onlyMatchedDaysWork === true;
      const reason = `${dowLabel}${holLabel}${onlyMatched ? "のみ勤務" : "カレンダー指定"}`;
      return {
        op: "add_request",
        nurseNameOrId: String(a.nurseNameOrId),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        shift: resolveShiftCodeOrAliasFromInput(a.shift, state),
        isHard: true,
        onlyMatchedDaysWork: onlyMatched,
        isCalendarPattern: true,
        reason,
      };
    }
    case "forbid_shift":
    case "forbid_shift_range": {
      if (!a.nurseNameOrId) return null;
      const days = resolveDaysFromToolArgs(a, state.config.numDays);
      if (days.length === 0) return null;
      const forbidShifts = normalizeActiveShifts(a.shifts) ?? ["E", "N"];
      return {
        op: "forbid_shift",
        nurseNameOrId: String(a.nurseNameOrId),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        forbidShifts,
      };
    }
    case "add_date_coverage":
      if (typeof a.day !== "number") return null;
      return {
        op: "add_date_coverage",
        day: a.day,
        shift: a.shift || "D",
        minStaff: typeof a.minStaff === "number" ? a.minStaff : 10,
      };
    case "set_param":
      if (!a.paramName || typeof a.paramValue !== "number") return null;
      return {
        op: "set_param",
        paramName: a.paramName,
        paramValue: a.paramValue,
      };
    case "toggle_rule":
      if (!a.ruleName || typeof a.ruleEnabled !== "boolean") return null;
      return {
        op: "toggle_rule",
        ruleName: a.ruleName,
        ruleEnabled: a.ruleEnabled,
      };
    default:
      return null;
  }
}

const CONSULT_SYSTEM_PROMPT = `あなたは病棟のシフト作成を支援する「AIナーススケジューリング・コパイロット」です。
師長・看護師に向けて、プロンプトで渡された実行ステータスと事実に厳密に基づき、簡潔でわかりやすい日本語の Markdown（箇条書き中心、3〜6行程度）で回答してください。
・シフト再計算（ソルバー実行）が行われた場合は、今回反映した変更内容、希望休や条件の充足状況、前回シフトからの変更箇所、追加シフトの配置先、または競合している条件と解決案のみを簡潔に伝えてください。
・設定変更やシフト再計算がスキップ（未実行）された場合（システム未対応の要求・情報不足の確認・機能質問など）は、架空のシフト作成結果やスタッフ名の変更報告を絶対に捏造せず、未対応である旨や聞き返し・質問への回答のみを出力してください。
・架空の病棟名（「〇〇病棟」など）は書かず、結果の要点から直接書き始めてください。
・数理ソルバーの内部情報（変数数・制約数・求解時間・アルゴリズム名など）は記載しないでください。`;

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
  if (typeof window !== "undefined" && (window as any).ai?.languageModel) {
    return (window as any).ai.languageModel;
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
 * Checks whether Chrome Built-in AI (`LanguageModel`) is available on this device/browser.
 * Passes `expectedInputs` / `expectedOutputs` first (per Chrome 148+ Prompt API spec) and falls back
 * to no-arg `availability()` if the browser build does not accept language option objects yet.
 */
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
      // Fall through to no-arg availability check
    }

    try {
      const statusDefault = normalizeAvailabilityString(await api.availability());
      if (statusDefault) {
        return statusDefault;
      }
    } catch (err) {
      console.warn("LanguageModel.availability() check failed:", err);
    }
  }

  if (typeof api.capabilities === "function") {
    try {
      const caps = await api.capabilities();
      const mapped = normalizeAvailabilityString(caps?.available);
      if (mapped) return mapped;
    } catch {
      // Ignore legacy capabilities error
    }
  }

  // If `LanguageModel.create` exists on global scope even when availability() had unexpected signature, allow trying on demand
  if (typeof api.create === "function") {
    return "available";
  }

  return "unavailable";
}

async function createLanguageModelSessionWithFallback(
  api: any,
  systemPrompt: string,
  monitorFn?: (m: any) => void
): Promise<any> {
  const baseWithMonitor = monitorFn ? { monitor: monitorFn } : {};

  // 1a. Standard Chrome 148+ call with greedy decoding (topK: 1, temperature: 0.1) + Japanese language options
  try {
    return await api.create({
      ...LANGUAGE_MODEL_JA_OPTIONS,
      temperature: 0.1,
      topK: 1,
      initialPrompts: [{ role: "system", content: systemPrompt }],
      ...baseWithMonitor,
    });
  } catch {
    // 1b. Try temperature: 0, topK: 1
    try {
      return await api.create({
        ...LANGUAGE_MODEL_JA_OPTIONS,
        temperature: 0,
        topK: 1,
        initialPrompts: [{ role: "system", content: systemPrompt }],
        ...baseWithMonitor,
      });
    } catch {
      // 1c. Standard Chrome 148+ call without explicit temperature/topK
      try {
        return await api.create({
          ...LANGUAGE_MODEL_JA_OPTIONS,
          initialPrompts: [{ role: "system", content: systemPrompt }],
          ...baseWithMonitor,
        });
      } catch {
      // 2. Fallback: expectedOutputs ["ja"] without expectedInputs
      try {
        return await api.create({
          expectedOutputs: [{ type: "text", languages: ["ja"] }],
          initialPrompts: [{ role: "system", content: systemPrompt }],
          ...baseWithMonitor,
        });
      } catch {
        // 3. Fallback: initialPrompts only (without language tags)
        try {
          return await api.create({
            initialPrompts: [{ role: "system", content: systemPrompt }],
            ...baseWithMonitor,
          });
        } catch {
          // 4. Final fallback: bare create()
          return await api.create(baseWithMonitor);
        }
      }
      }
    }
  }
}

/**
 * Resolves a nurse by ID ("N01"), full name ("佐藤 美咲"), family name ("佐藤"), or kana.
 */
export function resolveNurseFromText(
  query: string | undefined,
  nurses: readonly NurseProfile[]
): NurseProfile | null {
  if (!query) return null;
  const cleaned = query
    .trim()
    .replace(/さん|看護師|師長|主任|先生|スタッフ/g, "")
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

  for (const n of nurses) {
    const noSpaceName = n.name.replace(/\s+/g, "");
    const familyName = n.name.split(" ")[0];
    const givenName = n.name.split(" ")[1] ?? "";
    const noSpaceKana = n.kana.replace(/\s+/g, "");
    if (
      noSpaceName === cleaned ||
      noSpaceName.includes(cleaned) ||
      cleaned.includes(familyName) ||
      (givenName && cleaned.includes(givenName)) ||
      noSpaceKana.includes(cleaned)
    ) {
      return n;
    }
  }
  return null;
}

/**
 * Builds a compact, low-token state overview for Gemini Nano to minimize prompt latency.
 */
function buildCompactStatePrompt(state: NurseSchedulingState): string {
  const { config, nurses, customRules } = state;
  const activeSkills = state.skillDefs ?? createDefaultSkillDefs(config);
  const sampleNurses = nurses
    .slice(0, 12)
    .map((n) => `${n.id}:${n.name}(${n.role === "leader" ? "リーダー" : n.role === "newcomer" ? "新人" : "中堅"})`)
    .join(", ");
  const skillSummary = activeSkills
    .map(
      (s) =>
        `${s.label}(${s.shortLabel}${s.substitutesFor === "leader_cap" ? ":リーダー代行可" : ""})`
    )
    .join(", ");

  return [
    `対象月:${config.year}年${config.month}月(1〜${config.numDays}日), 看護師:${nurses.length}名(${sampleNurses} 他)`,
    `現在の設定: 平日日勤=${config.weekdayDayStaff}名, 土日日勤=${config.weekendDayStaff}名, 準夜=${config.eveningStaff}名, 深夜=${config.nightStaff}名`,
    `最大連勤=${config.maxConsecutiveWorkDays}日, 月間最低公休=${config.minMonthlyDaysOff}日, 月間夜勤上限=${config.maxMonthlyNightShifts}回`,
    `前月引継=${config.enforcePrevMonthCarryover ? "ON" : "OFF"}, スキル配置必須=${config.enforceSkillCoverage ? "ON" : "OFF"}, 深夜明け公休必須=${config.requireOffAfterNight ? "ON" : "OFF"}, プリセプター同行夜勤=${config.enforcePreceptorPairs ? "ON" : "OFF"}, 固定チーム均等=${config.enforceTeamBalance ? "ON" : "OFF"}, 相性NGペア禁止=${config.enforceNgPairs ? "ON" : "OFF"}, 週末公休=${config.requireWeekendOff ? "ON" : "OFF"}`,
    `登録済みスキル定義: ${skillSummary || "なし"}`,
    `追加カスタムルール数:${customRules.filter((r) => r.enabled).length}件`,
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
  return `${sortedDays.map((d) => `${month}/${d}`).join("・")} (計${sortedDays.length}日間)`;
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
      `  * ${formatDaySpanLabel(state.config.month, days)}: ${nurseLabel} を「${shiftName}」に固定`
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
      `  * ${formatDaySpanLabel(state.config.month, days)}: ${nurseLabel} の [${shifts}] シフト配置を禁止`
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
  let hadCustomState = false;

  function appendTurnHistory(line: string): void {
    recentTurnHistory.push(line);
    if (recentTurnHistory.length > 2) {
      recentTurnHistory = recentTurnHistory.slice(-2);
    }
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
      throw new Error("Gemini Nano (LanguageModel API) が利用できません。");
    }
    const cfg = STAGE2_CATEGORY_CONFIGS[category];
    const s = await createLanguageModelSessionWithFallback(api, cfg.systemPrompt);
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
      const availability = await checkGeminiNanoAvailability();
      currentStatus = availability;

      // Do not call create() when unavailable — the model cannot run on this device.
      if (availability === "unavailable") {
        return "unavailable";
      }

      const api = getLanguageModelApi();
      if (!api || typeof api.create !== "function") {
        currentStatus = "unavailable";
        return "unavailable";
      }

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
          routerBaseSession = await createLanguageModelSessionWithFallback(
            api,
            STAGE1_ROUTER_SYSTEM_PROMPT,
            monitorFn
          );
        }

        if (!consultBaseSession) {
          consultBaseSession = await createLanguageModelSessionWithFallback(
            api,
            CONSULT_SYSTEM_PROMPT,
            monitorFn
          );
        }

        if (!activeConsultSession && consultBaseSession) {
          activeConsultSession =
            typeof consultBaseSession.clone === "function"
              ? await consultBaseSession.clone()
              : consultBaseSession;
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
      state: NurseSchedulingState,
      signal?: AbortSignal,
      onProgress?: (event: ChatExtractProgressEvent) => void
    ): Promise<ParsedChatPlan> {
      if (!routerBaseSession) {
        const initRes = await this.initialize();
        if (initRes !== "available" || !routerBaseSession) {
          throw new Error("Gemini Nano (LanguageModel API) が利用できません。");
        }
      }

      const routerTrace: string[] = [];
      const llmCalls: LlmCallTrace[] = [];

      const hasCurrentCustom =
        (state.customShiftDefs?.length ?? 0) > 0 || state.customRules.length > 0;
      if (hadCustomState && !hasCurrentCustom) {
        recentTurnHistory = [];
        hadCustomState = false;
      } else if (hasCurrentCustom) {
        hadCustomState = true;
      }

      // ==================== TURN 1: STAGE 1 ROUTER (tool_types + response) ====================
      onProgress?.({
        phase: "turn1_start",
        activeLabel: "⏳ 指示を解析しています…",
        routerTrace: [...routerTrace],
      });
      const routerBranch =
        typeof routerBaseSession.clone === "function"
          ? await routerBaseSession.clone()
          : routerBaseSession;

      let stage1: Stage1RouterResult;
      try {
        const routerContextLines = [
          `対象月:${state.config.year}年${state.config.month}月(1〜${state.config.numDays}日)`,
          ...(recentTurnHistory.length > 0
            ? [`【直近の対話履歴】`, ...recentTurnHistory]
            : []),
        ];
        const routerPrompt = `${routerContextLines.join("\n")}\n\nユーザーの発話: 「${userMessage}」`;
        const t1Start = performance.now();
        let rawStage1 = "";
        let parseErr: string | undefined;
        try {
          rawStage1 = await routerBranch.prompt(routerPrompt, {
            responseConstraint: STAGE1_ROUTER_SCHEMA,
            signal,
          });
          stage1 = JSON.parse(rawStage1.trim()) as Stage1RouterResult;
        } catch (err: any) {
          parseErr = err?.message ?? String(err);
          stage1 = { response: rawStage1 || userMessage, routes: [{ tool_type: "question" }] };
        }
        const t1Duration = Math.max(1, Math.round(performance.now() - t1Start));
        llmCalls.push({
          step: "turn1_router",
          systemPrompt: STAGE1_ROUTER_SYSTEM_PROMPT,
          userPrompt: routerPrompt,
          responseConstraintSchema: STAGE1_ROUTER_SCHEMA,
          rawOutput: rawStage1,
          parsedOutput: stage1,
          parseError: parseErr,
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

      const rawRoutes: Stage1RouteItem[] =
        Array.isArray(stage1.routes) && stage1.routes.length > 0
          ? stage1.routes
          : Array.isArray(stage1.tool_types) && stage1.tool_types.length > 0
            ? stage1.tool_types.map((t) => ({ tool_type: t, instruction: userMessage }))
            : [
                {
                  tool_type: stage1.tool_type || "question",
                  instruction: userMessage,
                },
                ...(stage1.secondary_tool_type && stage1.secondary_tool_type !== "none"
                  ? [{ tool_type: stage1.secondary_tool_type, instruction: userMessage }]
                  : []),
              ];

      const stage1Thought = stage1.thought?.trim() || undefined;
      const stage1Response = stage1.response || userMessage;
      lastStage1Response = stage1Response;

      const activeRoutes: Array<{ category: ExecutableToolCategory; instruction: string }> = [];
      const nonToolCategories: NonToolCategory[] = [];
      const unsupportedRouteInstructions: string[] = [];
      let directSystemIntent: "diagnose_conflict" | "solve_only" | null = null;

      for (const routeItem of rawRoutes) {
        const rawCat = routeItem.tool_type;
        const mappedCat = rawCat === "staff_group" ? "skill_and_pair" : rawCat;
        const routeInstruction = routeItem.instruction?.trim() || userMessage;
        if (
          mappedCat === "staff_calendar" ||
          mappedCat === "staff_contract" ||
          mappedCat === "ward_coverage_and_param" ||
          mappedCat === "ward_transition_and_rule" ||
          mappedCat === "custom_shift" ||
          mappedCat === "skill_and_pair" ||
          mappedCat === "staff_request" ||
          mappedCat === "ward_config" ||
          mappedCat === "system_action"
        ) {
          activeRoutes.push({
            category: mappedCat,
            instruction: routeInstruction,
          });
        } else if (mappedCat === "diagnose_conflict" || mappedCat === "solve_only") {
          directSystemIntent = mappedCat;
        } else if (mappedCat === "unsupported" || mappedCat === "clarify") {
          nonToolCategories.push(mappedCat);
          if (mappedCat === "unsupported" && routeItem.instruction?.trim()) {
            unsupportedRouteInstructions.push(routeItem.instruction.trim());
          }
        } else if (mappedCat === "question" || mappedCat === "none") {
          nonToolCategories.push("question");
        }
      }

      const traceLabels =
        activeRoutes.length > 0
          ? activeRoutes.map((r) => `${r.category}("${r.instruction}")`)
          : directSystemIntent
            ? [directSystemIntent]
            : nonToolCategories.length > 0
              ? nonToolCategories
              : ["question"];
      const thoughtPrefix = stage1Thought ? `💭 ${stage1Thought} ➔ ` : "";
      routerTrace.push(`🧭 Turn 1 (Planner): ${thoughtPrefix}routes=${JSON.stringify(traceLabels)}`);
      onProgress?.({
        phase: "turn1_done",
        activeLabel:
          activeRoutes.length > 0
            ? "⏳ 設定を更新しています…"
            : "⏳ 結果をまとめています…",
        stage1Response,
        routerTrace: [...routerTrace],
      });

      if (activeRoutes.length === 0 && directSystemIntent) {
        lastNonToolReason = null;
        return {
          intentType: directSystemIntent,
          operations: [],
          summaryJa: stage1Response,
          stage1Thought,
          stage1Response,
          routerTrace,
          llmCalls,
        };
      }

      if (activeRoutes.length === 0) {
        const reason: NonToolCategory = nonToolCategories.includes("unsupported")
          ? "unsupported"
          : nonToolCategories.includes("clarify")
            ? "clarify"
            : "question";
        lastNonToolReason = reason;
        if (reason === "clarify") {
          appendTurnHistory(`・前回:「${userMessage}」➔ 聞き返し: ${stage1Response}`);
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
      let stage2SystemIntent: "diagnose_conflict" | "solve_only" | null = directSystemIntent;
      const repairedRoutes: string[] = [];
      const missingRouteLabels: string[] = [
        ...unsupportedRouteInstructions.map((inst) => `unsupported("${inst}")`),
      ];

      const runTurn2CategoryExtractor = async (
        category: ExecutableToolCategory,
        instruction: string
      ): Promise<ChatConstraintOperation[]> => {
        onProgress?.({
          phase: "turn2_start",
          activeLabel: "⏳ 設定を更新しています…",
          stage1Response,
          routerTrace: [...routerTrace],
        });
        const baseCatSession = await getOrCreateStage2BaseSession(category);
        const catBranch =
          typeof baseCatSession.clone === "function"
            ? await baseCatSession.clone()
            : baseCatSession;

        const routeOps: ChatConstraintOperation[] = [];
        try {
          const catConfig = STAGE2_CATEGORY_CONFIGS[category];
          const dynamicDict = buildCategoryDynamicDictionary(category, state, instruction);
          const dictNote = dynamicDict ? `${dynamicDict}\n` : "";
          const historyNote =
            recentTurnHistory.length > 0
              ? `【直近の対話履歴】\n${recentTurnHistory.join("\n")}\n`
              : "";
          const effectiveInstruction =
            activeRoutes.length > 1
              ? instruction
              : Array.isArray(stage1.routes) && instruction && instruction !== userMessage
                ? `${userMessage}（計画: ${instruction}）`
                : userMessage;
          const stage2Input = `${dictNote}${historyNote}ユーザーの指示: 「${effectiveInstruction}」`;
          const t2Start = performance.now();
          let rawStage2 = "";
          let parsedStage2: any = null;
          let parseErr: string | undefined;
          try {
            rawStage2 = await catBranch.prompt(stage2Input, {
              responseConstraint: catConfig.schema,
              signal,
            });
            parsedStage2 = JSON.parse(rawStage2.trim());
          } catch (err: any) {
            parseErr = err?.message ?? String(err);
          }
          const t2Duration = Math.max(1, Math.round(performance.now() - t2Start));
          llmCalls.push({
            step: "turn2_extractor",
            category,
            systemPrompt: catConfig.systemPrompt,
            userPrompt: stage2Input,
            responseConstraintSchema: catConfig.schema,
            rawOutput: rawStage2,
            parsedOutput: parsedStage2,
            parseError: parseErr,
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

            const mappedOp = convertStage2ToolToOperation(tc, state);
            if (mappedOp) {
              routeOps.push(mappedOp);
              operations.push(mappedOp);
              routerTrace.push(
                `🛠️ Turn 2 (${category}): ${tc.tool_name}(${JSON.stringify(tc.args ?? {})})`
              );
            }
          }
          onProgress?.({
            phase: "turn2_route_done",
            activeLabel: "⏳ 設定を更新しています…",
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

        // ==================== STEP 3: POST-TURN-2 VERIFICATION & SIBLING RECOVERY ====================
        if (extractedForRoute.length === 0 && !stage2SystemIntent) {
          let recovered = false;
          const siblingCategory = getSiblingFallbackCategory(category);
          if (
            siblingCategory &&
            !activeRoutes.some((r) => r.category === siblingCategory)
          ) {
            const recoveredOps = await runTurn2CategoryExtractor(
              siblingCategory,
              instruction
            );
            if (recoveredOps.length > 0) {
              recovered = true;
              repairedRoutes.push(
                `${category} ➔ ${siblingCategory} ("${instruction}")`
              );
            }
          }
          if (!recovered) {
            missingRouteLabels.push(`${category}("${instruction}")`);
            unsupportedRouteInstructions.push(instruction);
          }
        }
      }

      if (operations.length > 0) {
        let previewAppliedLogs: string[] = [];
        if (operations.some((o) => o.op === "reset_default" || o.op === "clear_custom_rules")) {
          recentTurnHistory = [];
          hadCustomState = false;
          previewAppliedLogs = ["リセット/クリア実行"];
        } else {
          const previewApplied = applyChatOperationsToState(state, operations);
          previewAppliedLogs = previewApplied.appliedLogs;
          if (previewApplied.appliedLogs.length > 0) {
            appendTurnHistory(
              `・前回:「${userMessage}」➔ 適用済: ${previewApplied.appliedLogs.join(" / ")}`
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
            .flatMap((o) => [o.nurseNameOrId, o.nurseBNameOrId])
            .filter((q): q is string => Boolean(q && !resolveNurseFromText(q, state.nurses)));
          const refusalMsg =
            unresolvedNurses.length > 0
              ? `指定されたスタッフ名（「${Array.from(new Set(unresolvedNurses)).join("・")}」）が病棟名簿に存在しないため、設定を変更できません。`
              : `ご指定の操作（「${userMessage}」）は適用対象が見つからないか本システムでは未対応のため、設定を変更できません。`;
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
            `⚠️ Step 3 (Verification): 一部未対応の指示を除外 (${unsupportedRouteInstructions.join(" / ")})`
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
          ? `ご指定の操作（「${userMessage}」）に対応する設定項目・ツールがないため、本システムでは未対応です。`
          : stage1Response;
      if (fallbackReason === "unsupported" && activeRoutes.length > 0) {
        lastStage1Response = finalSummaryJa;
        routerTrace.push(
          `⚠️ Step 3 (Verification): 対応するツールが存在しないため未対応(unsupported)と判定`
        );
      } else if (fallbackReason === "clarify") {
        appendTurnHistory(`・前回:「${userMessage}」➔ 聞き返し: ${stage1Response}`);
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
          throw new Error("Gemini Nano (LanguageModel API) が利用できません。");
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
      const turnSession =
        typeof consultBaseSession.clone === "function"
          ? await consultBaseSession.clone()
          : consultBaseSession;
      activeConsultSession = turnSession;

      let fullPrompt: string;

      if (!outcome) {
        if (appliedSummary.length === 0) {
          const capabilitiesBlock = [
            `【このAIアシスタントでできること（対応機能と指示例）】`,
            `1. スキル・資格の追加・削除・リーダー代行設定・スタッフへの付与:`,
            `   例: 「感染管理スキルを追加して救急の代わりになれるようにして」「小児対応スキルを追加して日勤に1名以上配置して」「緩和ケアスキルを削除して」「村上さんに感染管理スキルを付与して」`,
            `2. カスタムシフト・研修ルールの追加: 新シフトの追加、必要回数、夜勤の先行条件、曜日・期間制限、1日あたり配置人数、前月実績の算入`,
            `   例: 「オリエンテーションを追加して、新人は3回受けるまで夜勤不可にして」「平日のみで1日最大3名まで」「前月までの受講分も含めてよい」`,
            `3. サブシフト/グループ別の配置人数ルール・夜勤回数の平準化・ペア制限（相性NG / プリセプター同行夜勤）:`,
            `   例: 「日勤Group Bにリーダーを2人以上にして」「役割やスキルごとに夜勤回数を均等化して」「N11とN18をNGペアにして」「プリセプター同行夜勤をONにして」`,
            `4. 個別スタッフの希望休・期間休職・曜日パターン・個人契約（日勤専従・夜勤専従・個人別夜勤上限・公休数）・特定日の人数変更:`,
            `   例: 「村上さんの8日を確定の休みにして」「西村さんを日勤専従にして」「福田さんの月間夜勤上限を3回にして」「18日の日勤を11人以上にして」`,
            `5. 病棟全体の基本ルール・シフト遷移マトリクス設定: 最大連勤日数、深夜明け公休必須、2日間のシフト並び順禁止、固定チームナーシング均等配置(A班/B班)、36協定上限`,
            `   例: 「深夜明けは必ず公休にして」「準夜勤の翌日の日勤を禁止して」「最大連勤を3日に変更して」`,
            `6. 矛盾診断・シフト再最適化: ルール衝突の原因特定（HiGHS 弾性制約緩和）やシフト再計算（HiGHS MILP）`,
            `   例: 「矛盾をチェックして」「シフトを再計算して」`,
          ].join("\n");

          const activeCustomShifts =
            (state.customShiftDefs ?? []).length > 0
              ? `登録済み追加シフト: ${state.customShiftDefs
                  .map((d) => `${d.label}(${d.shortLabel}: ${d.timeRange})`)
                  .join(", ")}`
              : `登録済み追加シフト: なし`;
          const activeCustomRuleLines = summarizeActiveCustomRules(state);
          const activeCustomRules =
            activeCustomRuleLines.length > 0
              ? `現在有効な追加ルール (${activeCustomRuleLines.length}件):\n${activeCustomRuleLines.join("\n")}`
              : `現在有効な追加ルール: なし`;

          if (lastNonToolReason === "unsupported") {
            fullPrompt = [
              `【システム未対応の要求に対する回答指示】`,
              `実行ステータス: 設定変更 0件（未適用） / シフト再計算（ソルバー実行）: スキップ（未実行）`,
              `ユーザーの発言: 「${userMessage}」`,
              `一次判定メモ: ${lastStage1Response || "ご指定の操作は本システムでは未対応です。"}`,
              ``,
              `【本システムで対応可能な機能カテゴリ】`,
              `・スキル定義の追加/削除/代行設定、およびサブシフト・グループ別の配置人数ルール`,
              `・追加シフト（研修・委員会等）の定義、開催期間・曜日制限、1日あたり配置人数、受講回数・夜勤先行条件`,
              `・個人別の希望休・期間休職・曜日パターン、および個人別の勤務契約（日勤専従・夜勤専従・連勤上限・月間勤務日数や夜勤回数の上限/下限）`,
              `・病棟全体の必要人数、最大連勤日数、シフト遷移禁止/必須ルール、夜勤回数の平準化、矛盾診断`,
              ``,
              `【出力ルール（厳守）】`,
              `・今回はシステム未対応の要求のため、設定変更もシフト再計算（ソルバー実行）もスキップしました。`,
              `・「希望休を反映した」「シフトを調整した」といった架空のシフト作成結果や回答例は絶対に書かないでください。`,
              `・まず1行目で「${lastStage1Response || "ご指定の操作には対応していません。"}」（そのためシフト再計算も行っていない旨）を率直に伝え、続けて上記の対応可能な機能カテゴリを簡潔に案内してください。`,
            ].join("\n");
          } else if (lastNonToolReason === "clarify") {
            fullPrompt = [
              `【情報不足・確認が必要な指示に対する回答指示】`,
              `実行ステータス: 設定変更 0件（未適用） / シフト再計算（ソルバー実行）: スキップ（未実行）`,
              `ユーザーの発言: 「${userMessage}」`,
              `一次判定メモ: ${lastStage1Response || "設定変更に必要な対象・日付・数値が不足しています。"}`,
              ``,
              `【現在の病棟設定】`,
              buildCompactStatePrompt(state),
              ``,
              `ユーザーの指示には、設定を変更するために必要な情報（誰の・何月何日の希望か、どの設定項目をいくつにするか等）が不足しているため、設定変更およびシフト再計算（ソルバー実行）をスキップしました。どの情報を教えてもらえれば設定できるかを簡潔に聞き返してください。`,
            ].join("\n");
          } else {
            fullPrompt = [
              `実行ステータス: 設定変更 0件 / シフト再計算（ソルバー実行）: スキップ（質問・確認への回答）`,
              capabilitiesBlock,
              ``,
              `【現在の病棟設定】`,
              buildCompactStatePrompt(state),
              activeCustomShifts,
              activeCustomRules,
              ``,
              `ユーザーの質問・発言: 「${userMessage}」`,
              `上記の情報から、ユーザーの質問に対して直接・わかりやすく簡潔な箇条書きで回答してください。`,
            ].join("\n");
          }
        } else {
          // Rules were modified, but solver did not run (e.g. auto-solve unchecked)
          const unappliedNote =
            lastUnappliedInstructions.length > 0
              ? [
                  ``,
                  `【⚠️ 未対応のため適用できなかった指示】`,
                  `以下の指示は本システムの対応機能外であるため適用していません（対応できない旨も必ず正直に伝えてください）：`,
                  ...lastUnappliedInstructions.map((s) => `・${s}`),
                ]
              : [];
          fullPrompt = [
            `実行ステータス: ルール変更 ${appliedSummary.length}件適用済 / シフト再計算（ソルバー実行）: スキップ（未実行）`,
            `【今回適用されたルール変更 (${appliedSummary.length}件)】`,
            ...appliedSummary.map((s) => `・${s}`),
            ...unappliedNote,
            ``,
            `ユーザーの発言: 「${userMessage}」`,
            `上記の適用されたルール変更内容（および未対応の指示がある場合はその旨、まだシフト再計算は実行していない旨）を簡潔な箇条書きで回答してください。`,
          ].join("\n");
        }
      } else {
        const appliedBlock =
          appliedSummary.length > 0
            ? `【今回反映した変更内容 (${appliedSummary.length}件)】\n${appliedSummary
                .map((s) => `・${s}`)
                .join("\n")}\n`
            : `【シフト表の再作成完了】\n現在のルール設定に基づき、シフト表全体を再作成しました。\n`;

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
                    const groupTag = n.subRoleLabel ? `[${n.subRoleLabel}]` : "";
                    const shownDays =
                      csDays.length > 4
                        ? `${csDays.slice(0, 3).join("・")}他(計${csDays.length}回)`
                        : csDays.join("・");
                    samplePlacements.push(
                      `${n.name}${groupTag}(${cs.shortLabel}:${shownDays})`
                    );
                  }
                }
              }
            }
            const prevNote =
              prevCompletedNurseCount > 0
                ? ` / 前月実績あり:${prevCompletedNurseCount}名`
                : "";
            const zeroNote =
              totalAssigned === 0 && prevCompletedNurseCount === 0
                ? "（※まだ配置人数や対象期間のルールが設定されていないため配置は0回です）"
                : "";
            customShiftLines.push(
              `・追加シフト「${cs.label}(${cs.shortLabel})」配置状況: 当月${nursesAssigned}名に計${totalAssigned}回配置 (1日最大${maxDailyAssigned}名${prevNote})${zeroNote}${
                samplePlacements.length > 0 ? ` [配置先: ${samplePlacements.join(" / ")}]` : ""
              }`
            );
          }

          const diff = outcome.diffFromPrevious;
          const diffLine =
            diff && diff.totalCells > 0
              ? diff.changedCellsCount === 0
                ? `・前回のシフトからの変更: 変更なし（既存のシフト表を100%維持）`
                : `・前回のシフトからの変更: ${diff.affectedNursesCount}名のスタッフ・計${diff.changedCellsCount}マスのみ最小限で調整（既存シフト維持率 ${diff.retentionRatePct}%）`
              : "";

          const violationLine =
            ev && ev.violations.length > 0
              ? `・注意点（ソフト条件の妥協・未達 ${ev.violations.length}件）: ${ev.violations
                  .slice(0, 3)
                  .map((v) => v.message)
                  .join(" / ")}`
              : `・病棟の必要人数・スキル配置・連勤上限: すべて充足`;

          outcomeBlock = [
            `【シフト表の更新結果（看護師向けサマリー）】`,
            ev
              ? `・希望達成状況: 確定希望休 ${ev.hardRequestSatisfactionRate}% 達成 / 希望シフト ${ev.softRequestSatisfactionRate}% 達成`
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
            `【⚠️ シフトを作成できませんでした（条件の競合）】`,
            `・ぶつかっている条件 (${outcome.conflicts.length}件):`,
            conflictLines || "  - 複数の条件を同時に満たすシフトが存在しません",
          ].join("\n");
        }

        const unappliedBlock =
          lastUnappliedInstructions.length > 0
            ? `\n【⚠️ 未対応のため適用できなかった指示】\n以下の指示は本システムの対応機能外であるため適用していません（適用できた変更とあわせて、この指示には対応できない旨も必ず正直に伝えてください）：\n${lastUnappliedInstructions
                .map((s) => `・${s}`)
                .join("\n")}\n`
            : "";

        fullPrompt = `${appliedBlock}${unappliedBlock}${outcomeBlock}\n\n上記の「今回反映した変更内容」に記載されている項目（および「未対応のため適用できなかった指示」がある場合はその旨）と「シフト表の更新結果」のみを、看護師・師長にとってわかりやすい簡潔な箇条書きで報告してください（※記載されていない条件を適用済みであるかのように書き足したり、数理ソルバーの内部用語を出したりしないでください）。`;
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
            if (signal?.aborted) break;
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
        } catch (err: any) {
          if (!accumulated) {
            const fallbackMsg = lastStage1Response || "応答の生成中に上限に達しました。";
            accumulated = fallbackMsg;
            yield fallbackMsg;
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
      } catch {
        full = lastStage1Response || "応答の生成中に上限に達しました。";
      }
      lastConsultTrace = {
        step: "turn3_consultation_stream",
        systemPrompt: CONSULT_SYSTEM_PROMPT,
        userPrompt: fullPrompt,
        rawOutput: full,
        durationMs: Math.max(1, Math.round(performance.now() - t3Start)),
        tokenUsage: readSessionTokenUsage(turnSession),
      };
      yield full;
    },

    async resetConversation(): Promise<void> {
      recentTurnHistory = [];
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
      if (consultBaseSession && typeof consultBaseSession.clone === "function") {
        activeConsultSession = await consultBaseSession.clone();
      }
    },

    destroy() {
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
    .replace(/シフト$/g, "")
    .trim();
  const label = clean || "研修";

  let shortLabel = "研";
  let preferredCode = "T";
  if (/新人研修|研修/.test(label)) {
    shortLabel = "研";
    preferredCode = "T";
  } else if (/委員会/.test(label)) {
    shortLabel = "委";
    preferredCode = "C";
  } else if (/勉強会|学習/.test(label)) {
    shortLabel = "勉";
    preferredCode = "S";
  } else if (/出張|学会/.test(label)) {
    shortLabel = "出";
    preferredCode = "B";
  } else if (/オリエン/.test(label)) {
    shortLabel = "オリ";
    preferredCode = "OR";
  } else {
    shortLabel = label.slice(0, 1);
    preferredCode = `CS${existingDefs.length + 1}`;
  }

  const existing = existingDefs.find(
    (d) => d.label === label || d.shortLabel === shortLabel || d.code === preferredCode
  );
  if (existing) {
    return { code: existing.code, shortLabel: existing.shortLabel, label: existing.label };
  }

  let code = preferredCode;
  let seq = 1;
  while (
    ["D", "E", "N", "O"].includes(code) ||
    existingDefs.some((d) => d.code === code)
  ) {
    code = `CS${seq++}`;
  }

  return { code, shortLabel, label };
}

function inferSkillCodeAndLabel(
  rawSkillName: string,
  existingDefs: readonly SkillDefinition[]
): { code: NurseSkill; shortLabel: string; label: string; defaultSubstitutesFor?: NurseSkill } {
  const clean = rawSkillName
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/スキル|資格/g, "")
    .trim();
  const label = clean || "追加スキル";

  const byExisting = existingDefs.find(
    (d) => d.code === clean || d.label === label || d.shortLabel === label
  );
  if (byExisting) {
    return {
      code: byExisting.code,
      shortLabel: byExisting.shortLabel ?? byExisting.label.slice(0, 2),
      label: byExisting.label,
      defaultSubstitutesFor: byExisting.substitutesFor,
    };
  }

  if (/副リーダー|サブリーダー|準リーダー|リーダー代行|^sub_leader$/i.test(label)) {
    return {
      code: "sub_leader",
      shortLabel: "副リ",
      label: "副リーダー",
      defaultSubstitutesFor: "leader_cap",
    };
  }
  if (/^リーダー$|リーダー可|^leader(_cap)?$/i.test(label)) {
    return { code: "leader_cap", shortLabel: "リ", label: "リーダー" };
  }
  if (/救急|ICU|\bER\b|^icu_er$/i.test(label)) {
    return { code: "icu_er", shortLabel: "救", label: "救急・ICU" };
  }
  if (/呼吸器|^ventilator$/i.test(label)) {
    return { code: "ventilator", shortLabel: "呼", label: "人工呼吸器" };
  }
  if (/透析/.test(label)) {
    return { code: "dialysis", shortLabel: "透", label: "透析管理" };
  }
  if (/小児/.test(label)) {
    return { code: "pediatric", shortLabel: "小", label: "小児対応" };
  }
  if (/認知症/.test(label)) {
    return { code: "dementia", shortLabel: "認", label: "認知症ケア" };
  }
  if (/感染/.test(label)) {
    return { code: "infection", shortLabel: "感", label: "感染管理" };
  }
  if (/緩和|看取り/.test(label)) {
    return { code: "palliative", shortLabel: "緩", label: "緩和ケア" };
  }

  const shortLabel = label.slice(0, 2);
  let seq = existingDefs.length + 1;
  let code = `skill_${seq}`;
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
  const s = rawAttribute.trim();
  if (/^team_A$|^A$|^A班$|^Group\s*A$|^グループ\s*A$|^A\s*グループ$|^属性A/i.test(s)) {
    return {
      code: "team_A",
      label: "A班(Group A)",
      shortLabel: "A班",
      isSkill: false,
      isUnknownCustomSkill: false,
    };
  }
  if (/^team_B$|^B$|^B班$|^Group\s*B$|^グループ\s*B$|^B\s*グループ$|^属性B/i.test(s)) {
    return {
      code: "team_B",
      label: "B班(Group B)",
      shortLabel: "B班",
      isSkill: false,
      isUnknownCustomSkill: false,
    };
  }
  if (/^newcomer$|^新人$|新人スタッフ|新人看護師/i.test(s)) {
    return {
      code: "newcomer",
      label: "新人",
      shortLabel: "新",
      isSkill: false,
      isUnknownCustomSkill: false,
    };
  }
  if (/^mid$|^中堅$|中堅スタッフ|中堅看護師/i.test(s)) {
    return {
      code: "mid",
      label: "中堅",
      shortLabel: "中",
      isSkill: false,
      isUnknownCustomSkill: false,
    };
  }
  if (/^all$|^全員$|^全体$/i.test(s)) {
    return {
      code: "all",
      label: "全スタッフ",
      shortLabel: "全",
      isSkill: false,
      isUnknownCustomSkill: false,
    };
  }

  const existing = existingSkillDefs.find(
    (d) => d.code === s || d.label === s || d.shortLabel === s
  );
  if (existing) {
    return {
      code: existing.code,
      label: existing.label,
      shortLabel: existing.shortLabel ?? existing.label.slice(0, 2),
      isSkill: true,
      isUnknownCustomSkill: false,
    };
  }

  const inferred = inferSkillCodeAndLabel(s, existingSkillDefs);
  const isKnownPreset = !inferred.code.startsWith("skill_");
  return {
    code: inferred.code,
    label: inferred.label,
    shortLabel: inferred.shortLabel,
    isSkill: true,
    isUnknownCustomSkill: !isKnownPreset,
  };
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
} {
  let nextState: NurseSchedulingState = {
    config: { ...state.config },
    nurses: [...state.nurses],
    relations: [...state.relations],
    preferences: [...state.preferences],
    customRules: [...state.customRules],
    customShiftDefs: [...(state.customShiftDefs ?? [])],
    shiftAliases: [...(state.shiftAliases ?? createDefaultShiftAliases())],
    skillDefs: [...(state.skillDefs ?? createDefaultSkillDefs(state.config))],
  };
  const appliedLogs: string[] = [];

  for (const op of operations) {
    if (op.op === "reset_default") {
      nextState = generateNurseSchedulingState({
        year: nextState.config.year,
        month: nextState.config.month,
        staffCount: nextState.config.staffCount,
      });
      appliedLogs.push("すべての制約と設定を初期状態にリセットしました");
      continue;
    }

    if (op.op === "add_skill_def" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs(nextState.config);
      const { code, shortLabel, label, defaultSubstitutesFor } = inferSkillCodeAndLabel(
        op.skillName,
        activeSkills
      );
      const substitutesFor = op.substitutesFor
        ? inferSkillCodeAndLabel(op.substitutesFor, activeSkills).code
        : defaultSubstitutesFor;
      const minDay = typeof op.skillMinDay === "number" ? Math.max(0, Math.round(op.skillMinDay)) : 0;
      const minEvening =
        typeof op.skillMinEvening === "number" ? Math.max(0, Math.round(op.skillMinEvening)) : 0;
      const minNight =
        typeof op.skillMinNight === "number" ? Math.max(0, Math.round(op.skillMinNight)) : 0;

      const existingIdx = activeSkills.findIndex(
        (s) => s.code === code || s.label === label
      );
      const newSkillDef: SkillDefinition = {
        code,
        label,
        shortLabel: op.skillShortLabel?.trim() || shortLabel,
        substitutesFor,
        minDay,
        minEvening,
        minNight,
        builtIn: code === "leader_cap" || code === "icu_er" || code === "ventilator",
      };
      if (existingIdx >= 0) {
        activeSkills[existingIdx] = {
          ...activeSkills[existingIdx],
          ...newSkillDef,
        };
      } else {
        activeSkills.push(newSkillDef);
      }
      nextState.skillDefs = activeSkills;

      const subTargetMeta = substitutesFor
        ? getSkillMeta(substitutesFor, activeSkills)
        : null;
      const subDesc = subTargetMeta
        ? ` / 「${subTargetMeta.label}」の代行可（配置必要人数にカウント）`
        : "";
      const minDesc =
        minDay > 0 || minEvening > 0 || minNight > 0
          ? ` / 最低配置(日:${minDay}・準:${minEvening}・深:${minNight}名)`
          : "";
      appliedLogs.push(
        `スキル追加: 「${newSkillDef.label} (${newSkillDef.shortLabel})」を登録しました${subDesc}${minDesc}`
      );
      continue;
    }

    if (op.op === "remove_skill_def" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs(nextState.config);
      const { code, label } = inferSkillCodeAndLabel(op.skillName, activeSkills);
      const targetDef = activeSkills.find(
        (s) => s.code === code || s.label === label || s.label.includes(op.skillName!)
      );
      const targetCode = targetDef?.code ?? code;
      const targetLabel = targetDef?.label ?? label;

      nextState.skillDefs = activeSkills.filter((s) => s.code !== targetCode);
      nextState.nurses = nextState.nurses.map((n) =>
        n.skills.includes(targetCode)
          ? { ...n, skills: n.skills.filter((sk) => sk !== targetCode) }
          : n
      );
      appliedLogs.push(
        `スキル削除: 「${targetLabel}」をスキル定義および全スタッフの保有スキルから削除しました`
      );
      continue;
    }

    if (op.op === "update_nurse_skill" && op.skillName) {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs(nextState.config);
      const { code, shortLabel, label, defaultSubstitutesFor } = inferSkillCodeAndLabel(
        op.skillName,
        activeSkills
      );
      if (!activeSkills.some((s) => s.code === code)) {
        activeSkills.push({
          code,
          label,
          shortLabel,
          substitutesFor: defaultSubstitutesFor,
          minDay: 0,
          minEvening: 0,
          minNight: 0,
        });
        nextState.skillDefs = activeSkills;
      }
      const action = op.skillAction === "remove" ? "remove" : "add";
      const targetNurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      let countChanged = 0;

      nextState.nurses = nextState.nurses.map((n) => {
        const isMatch = targetNurse
          ? n.id === targetNurse.id
          : op.targetRole === "all"
            ? true
            : op.targetRole
              ? n.role === op.targetRole
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

      const whoLabel = targetNurse
        ? `${targetNurse.name}(${targetNurse.id})`
        : op.targetRole === "all"
          ? `スタッフ全員(${countChanged}名)`
          : op.targetRole
            ? `${ROLE_LABELS[op.targetRole]}(${countChanged}名)`
            : `対象スタッフ(${countChanged}名)`;
      appliedLogs.push(
        `スタッフスキル変更: ${whoLabel} にスキル「${label}(${shortLabel})」を${
          action === "add" ? "付与" : "解除"
        }しました`
      );
      continue;
    }

    if (op.op === "set_staffing_rule") {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs(nextState.config);
      const rawAttr = op.attribute || op.skillName || op.targetRole || "all";
      const resolved = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const { targetShift, shifts } = resolveTargetShiftsFromArg(
        op.targetShift || op.shiftName || op.shift,
        op.shifts,
        nextState
      );
      const minCount =
        typeof op.minCount === "number" ? Math.max(0, Math.round(op.minCount)) : undefined;
      const maxCount =
        typeof op.maxCount === "number" ? Math.max(0, Math.round(op.maxCount)) : undefined;
      const onlyWhenShort = op.onlyWhenShort === true ? true : undefined;

      if (resolved.isSkill && !activeSkills.some((s) => s.code === resolved.code)) {
        activeSkills.push({
          code: resolved.code,
          label: resolved.label,
          shortLabel: resolved.shortLabel,
          minDay: 0,
          minEvening: 0,
          minNight: 0,
        });
        nextState.skillDefs = activeSkills;
      }

      const shiftLabels = shifts
        .map((s) => getShiftMeta(s, nextState.customShiftDefs, nextState.shiftAliases).label)
        .join("・");
      const boundParts: string[] = [];
      if (typeof minCount === "number") boundParts.push(`下限${minCount}名以上`);
      if (typeof maxCount === "number") {
        boundParts.push(maxCount === 0 ? "上限0名(配置禁止)" : `上限${maxCount}名以下`);
      }
      if (onlyWhenShort) {
        boundParts.push("不足時ヘルプのみ(調整済ペナルティ適用)");
      }
      const boundDesc = boundParts.length > 0 ? boundParts.join(" / ") : "配置ルール";

      // Replace any previous staffing_rule with the same shifts and attribute
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
        onlyWhenShort,
        description: `グループ/スキル人数ルール: [${shiftLabels}] の「${resolved.label}」を ${boundDesc} に設定`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "set_nurse_contract" && op.nurseNameOrId) {
      const targetNurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      if (targetNurse) {
        const changes: string[] = [];
        nextState.nurses = nextState.nurses.map((n) => {
          if (n.id !== targetNurse.id) return n;
          const updated = { ...n };
          if (typeof op.nightOk === "boolean") {
            updated.nightOk = op.nightOk;
            changes.push(op.nightOk ? "夜勤可" : "日勤専従(夜勤免除)");
          }
          if (typeof op.maxMonthlyNightShifts === "number") {
            updated.maxMonthlyNightShifts = Math.max(0, Math.round(op.maxMonthlyNightShifts));
            changes.push(`月間夜勤上限=${updated.maxMonthlyNightShifts}回`);
          }
          if (typeof op.minMonthlyDaysOff === "number") {
            updated.minMonthlyDaysOff = Math.max(4, Math.round(op.minMonthlyDaysOff));
            changes.push(`月間最低公休=${updated.minMonthlyDaysOff}日`);
          }
          if (typeof op.minMonthlyWorkDays === "number") {
            updated.minMonthlyWorkDays = Math.max(0, Math.round(op.minMonthlyWorkDays));
            changes.push(`月間最低勤務=${updated.minMonthlyWorkDays}日`);
          }
          if (typeof op.maxMonthlyWorkDays === "number") {
            updated.maxMonthlyWorkDays = Math.max(0, Math.round(op.maxMonthlyWorkDays));
            changes.push(`月間最大勤務=${updated.maxMonthlyWorkDays}日`);
          }
          if (typeof op.maxConsecutiveWorkDays === "number") {
            updated.maxConsecutiveWorkDays = Math.max(1, Math.round(op.maxConsecutiveWorkDays));
            changes.push(`最大連勤=${updated.maxConsecutiveWorkDays}連勤`);
          }
          if (Array.isArray(op.forbiddenShifts)) {
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
          if (typeof op.weekdayOnly === "boolean") {
            updated.weekdayOnly = op.weekdayOnly || undefined;
            if (op.weekdayOnly && !op.holidaysOff) {
              changes.push("平日のみ勤務(土日休)");
            }
          }
          if (typeof op.holidaysOff === "boolean") {
            updated.holidaysOff = op.holidaysOff || undefined;
          }
          return updated;
        });
        if (op.holidaysOff === true) {
          const holidayDays = resolveDaysBySelector(
            nextState.config.year,
            nextState.config.month,
            nextState.config.numDays,
            { kind: "pattern", holidays: "only" }
          );
          if (holidayDays.length > 0) {
            const holSet = new Set(holidayDays);
            nextState.customRules = nextState.customRules.filter(
              (r) =>
                !(
                  r.kind === "pin_shift" &&
                  r.nurseId === targetNurse.id &&
                  r.day &&
                  holSet.has(r.day)
                )
            );
            for (const d of holidayDays) {
              nextState.customRules.push({
                id: `contract_hol_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
                kind: "pin_shift",
                enabled: true,
                nurseId: targetNurse.id,
                day: d,
                shift: "O",
                description: `${nextState.config.month}/${d}(祝): ${targetNurse.name}(${targetNurse.id}) を「公休(O)」に固定 (土日祝休み契約)`,
              });
            }
          }
          changes.push(
            `土日祝休み(祝日:${holidayDays.map((d) => `${nextState.config.month}/${d}`).join("・")}休)`
          );
        } else if (op.holidaysOff === false) {
          nextState.customRules = nextState.customRules.filter(
            (r) => !(r.id.startsWith("contract_hol_") && r.nurseId === targetNurse.id)
          );
        }
        if (changes.length > 0) {
          appliedLogs.push(
            `個別勤務契約変更: ${targetNurse.name}(${targetNurse.id}) を [${changes.join(" / ")}] に設定しました`
          );
        }
      }
      continue;
    }

    if (op.op === "set_shift_transition" && op.fromShift && op.toShift && op.transitionPolicy) {
      const from = op.fromShift;
      const to = op.toShift;
      const policy = op.transitionPolicy;
      const forbid = policy === "forbid";
      const require = policy === "require";
      let desc = "";

      if (from === "N" && to === "O") {
        nextState.config.requireOffAfterNight = require || forbid;
        desc = `「深夜勤の翌日は必ず公休にする(深→休必須)」を ${nextState.config.requireOffAfterNight ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "N" && to === "D") {
        nextState.config.forbidNightToDay = forbid;
        desc = `「深夜勤→翌日日勤の禁止(深→日)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "E" && to === "D") {
        nextState.config.forbidEveningToDay = forbid;
        desc = `「準夜勤→翌日日勤の禁止(準→日)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "E" && to === "N") {
        nextState.config.forbidEveningToNight = forbid;
        desc = `「準夜勤→翌日深夜勤の禁止(準→深)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "N" && to === "E") {
        nextState.config.forbidNightToEvening = forbid;
        desc = `「深夜勤→翌日準夜勤の禁止(深→準)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "D" && to === "N") {
        nextState.config.forbidDayToNight = forbid;
        desc = `「日勤→翌日深夜勤(日深夜)の禁止(日→深)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "E" && to === "E") {
        nextState.config.forbidEveningToEvening = forbid;
        desc = `「連続準夜勤の禁止(準→準)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      } else if (from === "N" && to === "N") {
        nextState.config.forbidNightToNight = forbid;
        desc = `「連続深夜勤の禁止(深→深)」を ${forbid ? "有効(ON)" : "無効(OFF)"} に変更しました`;
      }
      if (desc) {
        appliedLogs.push(desc);
      }
      continue;
    }

    if (op.op === "add_preceptor_pair" && op.nurseNameOrId && op.nurseBNameOrId) {
      const nA = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const nB = resolveNurseFromText(op.nurseBNameOrId, nextState.nurses);
      if (nA && nB && nA.id !== nB.id) {
        const targetShifts: ShiftCode[] = op.shifts?.length ? op.shifts : ["E", "N"];
        nextState.relations.push({
          nurseA: nA.id,
          nurseB: nB.id,
          type: "preceptor",
          shifts: targetShifts,
          isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
          penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
          reason: "チャット指示によるプリセプター指導ペア設定",
        });
        nextState.config.enforcePreceptorPairs = true;
        appliedLogs.push(
          `プリセプター指導ペア追加: ${nA.name}(${nA.id}) × ${nB.name}(${nB.id}) の同行シフト([${targetShifts.join("/")}])を有効化しました`
        );
      }
      continue;
    }

    if (op.op === "inject_conflict_demo") {
      const injected = injectConflictScenario(nextState, "leader_shortage");
      nextState = injected.updatedState;
      appliedLogs.push(injected.descriptionJa);
      continue;
    }

    if (op.op === "clear_custom_rules") {
      nextState.customRules = [];
      nextState.customShiftDefs = [];
      nextState.nurses = nextState.nurses.map((n) => ({
        ...n,
        minMonthlyWorkDays: undefined,
        maxMonthlyWorkDays: undefined,
        minMonthlyDaysOff: undefined,
        maxMonthlyNightShifts: undefined,
        maxConsecutiveWorkDays: undefined,
        forbiddenShifts: undefined,
        weekdayOnly: undefined,
      }));
      appliedLogs.push("追加された個別カスタム制約および追加シフト種別をすべて解除しました");
      continue;
    }

    if (op.op === "add_custom_shift" && (op.shiftName || op.shift)) {
      const rawName = op.shiftName || op.shift || "新人研修";
      const { code: inferredCode, shortLabel, label } = inferShortLabelAndCode(
        rawName,
        nextState.customShiftDefs
      );
      const code =
        op.shiftName &&
        op.shift &&
        op.shift.trim().length > 0 &&
        op.shift.trim() !== op.shiftName.trim() &&
        /^[A-Za-z0-9_]+$/.test(op.shift.trim())
          ? op.shift.trim()
          : inferredCode;
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
      const existing = nextState.customShiftDefs.find(
        (d) => d.code === code || d.label === label
      );
      if (!existing) {
        nextState.customShiftDefs.push({
          code,
          shortLabel: finalShort,
          label,
          baseShift,
          includedInAliases,
          timeRange,
          colorClass: "shift-custom",
          countsAsWorkDay: baseShift !== "O",
          overtimeHoursPerShift: baseShift === "O" ? 0 : 0.5,
        });
        nextState.shiftAliases = createDefaultShiftAliases(nextState.customShiftDefs);
        appliedLogs.push(
          `新しいシフト種別「${finalShort}: ${label} (${timeRange}, 所属:${baseShift})」を追加しました`
        );
      } else {
        existing.baseShift = baseShift;
        if (includedInAliases !== undefined) {
          existing.includedInAliases = includedInAliases;
        }
        nextState.shiftAliases = createDefaultShiftAliases(nextState.customShiftDefs);
      }
      continue;
    }

    if (op.op === "add_shift_quota") {
      const rawShiftName = op.shiftName || op.shift || "新人研修";
      let shiftCode: ShiftCode = "D";
      if (["D", "E", "N", "O"].includes(rawShiftName)) {
        shiftCode = rawShiftName as ShiftCode;
      } else {
        const { code, shortLabel, label } = inferShortLabelAndCode(
          rawShiftName,
          nextState.customShiftDefs
        );
        if (!nextState.customShiftDefs.some((d) => d.code === code)) {
          nextState.customShiftDefs.push({
            code,
            shortLabel,
            label,
            timeRange: "09:00–17:00",
            colorClass: "shift-custom",
            countsAsWorkDay: true,
            overtimeHoursPerShift: 0.5,
          });
          appliedLogs.push(
            `新しいシフト種別「${shortLabel}: ${label} (09:00–17:00)」を追加しました`
          );
        }
        shiftCode = code;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const nurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      const targetRole: NurseRole | "all" | undefined = nurse
        ? undefined
        : op.targetRole || "newcomer";

      const minCount = typeof op.minCount === "number" ? Math.round(op.minCount) : undefined;
      const maxCount = typeof op.maxCount === "number" ? Math.round(op.maxCount) : undefined;
      const countText =
        minCount !== undefined && maxCount !== undefined && minCount === maxCount
          ? `ちょうど${minCount}回`
          : minCount !== undefined && maxCount !== undefined
            ? `${minCount}〜${maxCount}回`
            : minCount !== undefined
              ? `${minCount}回以上`
              : maxCount !== undefined
                ? `${maxCount}回以下`
                : "2回";

      const targetLabel = nurse
        ? `${nurse.name}(${nurse.id})`
        : targetRole === "all"
          ? "スタッフ全員"
          : `${ROLE_LABELS[targetRole ?? "newcomer"]}全員`;

      // Replace any previous quota rule for the same target and shift
      nextState.customRules = nextState.customRules.filter(
        (r) =>
          !(
            r.kind === "shift_count_quota" &&
            r.shift === shiftCode &&
            r.targetRole === targetRole &&
            r.nurseId === nurse?.id
          )
      );

      const rule: CustomConstraintRule = {
        id: `quota_${shiftCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "shift_count_quota",
        enabled: true,
        nurseId: nurse?.id,
        targetRole,
        shift: shiftCode,
        minCount: minCount ?? (maxCount === undefined ? 2 : undefined),
        maxCount: maxCount ?? (minCount === undefined ? 2 : undefined),
        description: `${targetLabel}は「${meta.label}」を月${countText}取得する`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(`シフト回数ルール追加: ${rule.description}`);
      continue;
    }

    if (op.op === "add_shift_day_restriction") {
      const rawShiftName =
        op.shiftName ||
        op.shift ||
        nextState.customShiftDefs[0]?.label ||
        "新人研修";
      let shiftCode: ShiftCode = "D";
      if (["D", "E", "N", "O"].includes(rawShiftName)) {
        shiftCode = rawShiftName as ShiftCode;
      } else {
        const { code, shortLabel, label } = inferShortLabelAndCode(
          rawShiftName,
          nextState.customShiftDefs
        );
        if (!nextState.customShiftDefs.some((d) => d.code === code)) {
          nextState.customShiftDefs.push({
            code,
            shortLabel,
            label,
            timeRange: "09:00–17:00",
            colorClass: "shift-custom",
            countsAsWorkDay: true,
            overtimeHoursPerShift: 0.5,
          });
          appliedLogs.push(
            `新しいシフト種別「${shortLabel}: ${label} (09:00–17:00)」を追加しました`
          );
        }
        shiftCode = code;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const hasDateBounds =
        typeof op.startDay === "number" || typeof op.endDay === "number";
      const startDay =
        typeof op.startDay === "number"
          ? Math.max(1, Math.min(nextState.config.numDays, Math.round(op.startDay)))
          : undefined;
      const endDay =
        typeof op.endDay === "number"
          ? Math.max(1, Math.min(nextState.config.numDays, Math.round(op.endDay)))
          : undefined;
      const allowedDays =
        op.allowedDaysOfWeek && op.allowedDaysOfWeek.length > 0
          ? op.allowedDaysOfWeek
          : !hasDateBounds
            ? [1, 2, 3, 4, 5]
            : undefined;
      const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
      const descParts: string[] = [];
      if (startDay !== undefined || endDay !== undefined) {
        const s = startDay ?? 1;
        const e = endDay ?? nextState.config.numDays;
        const spanDays = Math.max(1, e - s + 1);
        descParts.push(
          s === e
            ? `${nextState.config.month}/${s}のみ`
            : `${nextState.config.month}/${s}〜${nextState.config.month}/${e} (計${spanDays}日間) のみ`
        );
      }
      if (allowedDays && allowedDays.length > 0) {
        const isWeekdays =
          allowedDays.length === 5 &&
          [1, 2, 3, 4, 5].every((d) => allowedDays.includes(d));
        descParts.push(
          isWeekdays
            ? "平日(月〜金)のみ（土日不可）"
            : `${allowedDays.map((d) => `${dowNames[d]}曜`).join("・")}のみ`
        );
      }
      const restrictionLabel = descParts.join("・") || "平日(月〜金)のみ";

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
        description: `${hasDateBounds ? "シフト期間制限" : "シフト曜日制限"}: 「${meta.label}」は${restrictionLabel}に配置する（期間外は配置不可）`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "add_shift_prerequisite") {
      const rawShiftName =
        op.shiftName ||
        op.prereqShift ||
        op.shift ||
        nextState.customShiftDefs[0]?.label ||
        "新人研修";
      let prereqCode: ShiftCode = "T";
      if (["D", "E", "N", "O"].includes(rawShiftName)) {
        prereqCode = rawShiftName as ShiftCode;
      } else {
        const { code, shortLabel, label } = inferShortLabelAndCode(
          rawShiftName,
          nextState.customShiftDefs
        );
        if (!nextState.customShiftDefs.some((d) => d.code === code)) {
          nextState.customShiftDefs.push({
            code,
            shortLabel,
            label,
            timeRange: "09:00–17:00",
            colorClass: "shift-custom",
            countsAsWorkDay: true,
            overtimeHoursPerShift: 0.5,
          });
          appliedLogs.push(
            `新しいシフト種別「${shortLabel}: ${label} (09:00–17:00)」を追加しました`
          );
        }
        prereqCode = code;
      }

      const meta = getShiftMeta(prereqCode, nextState.customShiftDefs);
      const targetRole: NurseRole | "all" = op.targetRole || "newcomer";
      const kReq =
        typeof op.prereqMinCount === "number"
          ? Math.max(1, Math.round(op.prereqMinCount))
          : typeof op.minCount === "number"
            ? Math.max(1, Math.round(op.minCount))
            : 2;
      const restricted: ShiftCode[] =
        op.restrictedShifts && op.restrictedShifts.length > 0
          ? op.restrictedShifts
          : ["E", "N"];
      const targetLabel =
        targetRole === "all" ? "スタッフ全員" : `${ROLE_LABELS[targetRole]}全員`;

      nextState.customRules = nextState.customRules.filter(
        (r) =>
          !(
            r.kind === "shift_prerequisite" &&
            r.prereqShift === prereqCode &&
            r.targetRole === targetRole
          )
      );

      const rule: CustomConstraintRule = {
        id: `prereq_${prereqCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "shift_prerequisite",
        enabled: true,
        targetRole,
        prereqShift: prereqCode,
        prereqMinCount: kReq,
        restrictedShifts: restricted,
        description: `先行条件ルール: ${targetLabel}は「${meta.label}」を${kReq}回受けた翌営業日以降でないと夜勤(準夜・深夜)に入れない`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "add_daily_shift_cap") {
      const rawShiftName =
        op.shiftName ||
        op.shift ||
        nextState.customShiftDefs[0]?.label ||
        "新人研修";
      let shiftCode: ShiftCode = "T";
      if (["D", "E", "N", "O"].includes(rawShiftName)) {
        shiftCode = rawShiftName as ShiftCode;
      } else {
        const { code, shortLabel, label } = inferShortLabelAndCode(
          rawShiftName,
          nextState.customShiftDefs
        );
        if (!nextState.customShiftDefs.some((d) => d.code === code)) {
          nextState.customShiftDefs.push({
            code,
            shortLabel,
            label,
            timeRange: "09:00–17:00",
            colorClass: "shift-custom",
            countsAsWorkDay: true,
            overtimeHoursPerShift: 0.5,
          });
          appliedLogs.push(
            `新しいシフト種別「${shortLabel}: ${label} (09:00–17:00)」を追加しました`
          );
        }
        shiftCode = code;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const maxStaff =
        typeof op.maxStaff === "number" ? Math.max(1, Math.round(op.maxStaff)) : 2;
      const minStaff =
        typeof op.minStaff === "number" ? Math.max(0, Math.round(op.minStaff)) : undefined;
      const targetRole = op.targetRole;
      const rolePrefix =
        targetRole && targetRole !== "all" ? `${ROLE_LABELS[targetRole]}` : "";

      nextState.customRules = nextState.customRules.filter(
        (r) => !(r.kind === "daily_shift_cap" && r.shift === shiftCode)
      );

      const desc =
        typeof minStaff === "number" && minStaff > 0
          ? minStaff === maxStaff
            ? `1日あたり配置人数ルール: 「${meta.label}」に毎日${rolePrefix}${maxStaff}名をアサイン`
            : `1日あたり配置人数ルール: 「${meta.label}」に毎日${rolePrefix}${minStaff}〜${maxStaff}名を配置`
          : `1日あたり人数上限ルール: 「${meta.label}」は1日に${rolePrefix}最大${maxStaff}名まで`;

      const rule: CustomConstraintRule = {
        id: `daily_cap_${shiftCode}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: "daily_shift_cap",
        enabled: true,
        shift: shiftCode,
        targetRole,
        minStaff,
        maxStaff,
        description: desc,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "allow_prev_month_shift") {
      const rawShiftName =
        op.shiftName ||
        op.shift ||
        nextState.customShiftDefs[0]?.label ||
        "新人研修";
      let shiftCode: ShiftCode = "T";
      if (["D", "E", "N", "O"].includes(rawShiftName)) {
        shiftCode = rawShiftName as ShiftCode;
      } else {
        const { code, shortLabel, label } = inferShortLabelAndCode(
          rawShiftName,
          nextState.customShiftDefs
        );
        if (!nextState.customShiftDefs.some((d) => d.code === code)) {
          nextState.customShiftDefs.push({
            code,
            shortLabel,
            label,
            timeRange: "09:00–17:00",
            colorClass: "shift-custom",
            countsAsWorkDay: true,
            overtimeHoursPerShift: 0.5,
          });
          appliedLogs.push(
            `新しいシフト種別「${shortLabel}: ${label} (09:00–17:00)」を追加しました`
          );
        }
        shiftCode = code;
      }

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      nextState.customRules = nextState.customRules.map((r) => {
        if (
          (r.kind === "shift_count_quota" && r.shift === shiftCode) ||
          (r.kind === "shift_prerequisite" && r.prereqShift === shiftCode)
        ) {
          const suffix = "（前月までの受講実績を含む）";
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

      appliedLogs.push(
        `前月実績の算入ルール適用: 「${meta.label}」の必要回数および先行条件に前月までの受講実績を算入可能にしました`
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
        levelGroupBy: op.levelGroupBy || "role_and_skill",
        description:
          "夜勤平準化ルール: スキル・役割グループ（リーダー・中堅・新人・救急スキル等）ごとに月間の夜勤回数(準夜・深夜)のばらつきを最小化して均等化する",
      };
      nextState.customRules.push(rule);
      appliedLogs.push(rule.description);
      continue;
    }

    if (op.op === "set_param" && op.paramName && typeof op.paramValue === "number") {
      const val = Math.round(op.paramValue);
      if (op.paramName === "staffCount") {
        const clamped = Math.min(36, Math.max(15, val));
        nextState = generateNurseSchedulingState({
          ...nextState.config,
          staffCount: clamped,
          seed: nextState.config.seed + 1,
        });
        appliedLogs.push(`スタッフ人数を ${clamped}名 に変更し、プロフィール・前月シフト・希望を再生成しました`);
      } else {
        (nextState.config as any)[op.paramName] = val;
        if (nextState.skillDefs) {
          nextState.skillDefs = nextState.skillDefs.map((s) => {
            if (s.code === "leader_cap") {
              return {
                ...s,
                minDay: nextState.config.minLeadersDay,
                minEvening: nextState.config.minLeadersEvening,
                minNight: nextState.config.minLeadersNight,
              };
            }
            if (s.code === "icu_er") {
              return {
                ...s,
                minDay: nextState.config.minIcuDay,
                minEvening: nextState.config.minIcuEvening,
                minNight: nextState.config.minIcuNight,
              };
            }
            return s;
          });
        }
        const paramLabels: Record<string, string> = {
          weekdayDayStaff: "平日・日勤の必要人数",
          weekendDayStaff: "土日・日勤の必要人数",
          eveningStaff: "準夜勤の必要人数",
          nightStaff: "深夜勤の必要人数",
          maxConsecutiveWorkDays: "最大連続勤務日数",
          minMonthlyDaysOff: "月間最低公休日数",
          minMonthlyWorkDays: "月間最低勤務日数",
          maxMonthlyNightShifts: "月間夜勤(準夜+深夜)上限回数",
          minLeadersDay: "日勤リーダー最低人数",
          minLeadersEvening: "準夜勤リーダー最低人数",
          minLeadersNight: "深夜勤リーダー最低人数",
          minIcuDay: "日勤 救急・ICUスキル最低人数",
          minIcuEvening: "準夜勤 救急・ICUスキル最低人数",
          minIcuNight: "深夜勤 救急・ICUスキル最低人数",
          minTeamMembersDay: "日勤の各チーム(A班・B班)最低人数",
          maxNewcomersNight: "夜勤帯の新人上限人数",
          maxMonthlyOvertimeHours: "36協定 当月時間外労働上限(h)",
          maxAnnualOvertimeHours: "36協定 年間(12ヶ月)時間外労働上限(h)",
        };
        appliedLogs.push(`${paramLabels[op.paramName] ?? op.paramName} を ${val} に変更しました`);
      }
      continue;
    }

    if (op.op === "toggle_rule" && op.ruleName && typeof op.ruleEnabled === "boolean") {
      (nextState.config as any)[op.ruleName] = op.ruleEnabled;
      const ruleLabels: Record<string, string> = {
        forbidNightToDay: "深夜勤→翌日日勤の禁止",
        forbidEveningToDay: "準夜勤→翌日日勤の禁止",
        forbidEveningToNight: "準夜勤→翌日深夜勤の禁止",
        forbidNightToEvening: "深夜勤→翌日準夜勤の禁止",
        forbidDayToNight: "日勤→翌日深夜勤(日深夜)の禁止",
        forbidEveningToEvening: "連続準夜勤(準→準)の禁止",
        forbidNightToNight: "連続深夜勤(深→深)の禁止",
        maxConsecutiveNight2: "深夜勤3連続の禁止(2連続まで)",
        requireOffAfterNight: "深夜勤の翌日は必ず公休にする(連続深夜勤禁止)",
        enforcePrevMonthCarryover: "前月末シフトからの連続性・連勤引き継ぎ",
        enforceSkillCoverage: "スキルごとの最低配置人数必須ルール",
        enforceNewcomerNightLimit: "準夜・深夜の新人人数上限ルール",
        enforcePreceptorPairs: "プリセプター同行夜勤(新人の夜勤時に指導者も同シフト配置)",
        enforceTeamBalance: "固定チームナーシング均等配置(日勤にA班・B班それぞれ最低人数確保)",
        requireWeekendOff: "週末(土日)最低2日公休確保ルール",
        enforceNgPairs: "相性NGペアの同シフト回避ルール",
        enforceHardRequests: "確定希望休(ハード制約)の厳守",
        enforce36Agreement: "36協定（月45h・年360h 時間外上限）の遵守",
        preserveCurrentSchedule: "微調整モード（既存シフト表からの変更最小化）",
      };
      appliedLogs.push(
        `「${ruleLabels[op.ruleName] ?? op.ruleName}」を ${op.ruleEnabled ? "有効(ON)" : "無効(OFF)"} に変更しました`
      );
      continue;
    }

    if (op.op === "add_request" && op.nurseNameOrId) {
      const nurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const rawDays = op.days?.length ? op.days : op.day ? [op.day] : [];
      const days = Array.from(
        new Set(rawDays.filter((d) => d >= 1 && d <= nextState.config.numDays))
      ).sort((a, b) => a - b);
      const shift: ShiftCode = resolveShiftCodeOrAliasFromInput(op.shift ?? "O", nextState);
      const isHard = op.isHard !== false;
      if (nurse && days.length > 0) {
        const customOrAliasMeta = getShiftMeta(
          shift,
          nextState.customShiftDefs,
          nextState.shiftAliases
        );
        const shiftName =
          shift === "O"
            ? "公休(O)"
            : shift === "W"
              ? "勤務(シフトお任せ)"
              : shift === "D"
                ? "日勤(D)"
                : shift === "D_A"
                  ? "日勤A(日A)"
                  : shift === "D_B"
                    ? "日勤B(日B)"
                    : shift === "EN"
                      ? "夜勤(準夜・深夜)"
                      : shift === "E"
                        ? "準夜勤(E)"
                        : shift === "N"
                          ? "深夜勤(N)"
                          : `${customOrAliasMeta.label}(${customOrAliasMeta.shortLabel})`;
        const reasonLabel = op.reason || "チャット指示";
        if (isHard) {
          // Remove any existing pin_shift rules for the same nurse on those days so re-pinning replaces cleanly
          const daySet = new Set(days);
          nextState.customRules = nextState.customRules.filter(
            (r) => !(r.kind === "pin_shift" && r.nurseId === nurse.id && r.day && daySet.has(r.day))
          );
          for (const d of days) {
            const rule: CustomConstraintRule = {
              id: `chat_pin_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
              kind: "pin_shift",
              enabled: true,
              nurseId: nurse.id,
              day: d,
              shift,
              description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) を「${shiftName}」に固定 (${reasonLabel})`,
            };
            nextState.customRules.push(rule);
          }

          if (op.onlyMatchedDaysWork && shift !== "O") {
            const otherDays: number[] = [];
            for (let d = 1; d <= nextState.config.numDays; d++) {
              if (!daySet.has(d)) otherDays.push(d);
            }
            const otherSet = new Set(otherDays);
            nextState.customRules = nextState.customRules.filter(
              (r) =>
                !(r.kind === "pin_shift" && r.nurseId === nurse.id && r.day && otherSet.has(r.day))
            );
            for (const d of otherDays) {
              nextState.customRules.push({
                id: `chat_pin_off_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
                kind: "pin_shift",
                enabled: true,
                nurseId: nurse.id,
                day: d,
                shift: "O",
                description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) を「公休(O)」に固定 (${reasonLabel}の指定曜日外)`,
              });
            }
            appliedLogs.push(
              `${formatDaySpanLabel(nextState.config.month, days)} (計${days.length}日): ${nurse.name}(${nurse.id}) を「${shiftName}」に固定し、それ以外の曜日(${otherDays.length}日)を「公休(O)」に固定 (${reasonLabel})`
            );
          } else {
            if (days.length === 1) {
              appliedLogs.push(
                `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) を「${shiftName}」に固定 (${reasonLabel})`
              );
            } else {
              appliedLogs.push(
                `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) を「${shiftName}」に固定 (${reasonLabel})`
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
              reason: op.reason || "チャット希望追加",
            });
          }
          if (days.length === 1) {
            appliedLogs.push(
              `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) にソフト希望「${shiftName}」を追加しました`
            );
          } else {
            appliedLogs.push(
              `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) にソフト希望「${shiftName}」を追加しました`
            );
          }
        }
      }
      continue;
    }

    if (op.op === "forbid_shift" && op.nurseNameOrId) {
      const nurse = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const rawDays = op.days?.length ? op.days : op.day ? [op.day] : [];
      const days = Array.from(
        new Set(rawDays.filter((d) => d >= 1 && d <= nextState.config.numDays))
      ).sort((a, b) => a - b);
      if (nurse && days.length > 0) {
        const shifts: ShiftCode[] = op.forbidShifts?.length ? op.forbidShifts : ["E", "N"];
        const daySet = new Set(days);
        nextState.customRules = nextState.customRules.filter(
          (r) => !(r.kind === "forbid_shift" && r.nurseId === nurse.id && r.day && daySet.has(r.day))
        );
        for (const d of days) {
          const rule: CustomConstraintRule = {
            id: `chat_forbid_${Date.now()}_${d}_${Math.random().toString(36).slice(2, 6)}`,
            kind: "forbid_shift",
            enabled: true,
            nurseId: nurse.id,
            day: d,
            forbidShifts: shifts,
            description: `${nextState.config.month}/${d}: ${nurse.name}(${nurse.id}) の [${shifts.join("/")}] シフト配置を禁止`,
          };
          nextState.customRules.push(rule);
        }
        if (days.length === 1) {
          appliedLogs.push(
            `${nextState.config.month}/${days[0]}: ${nurse.name}(${nurse.id}) の [${shifts.join("/")}] シフト配置を禁止`
          );
        } else {
          appliedLogs.push(
            `${formatDaySpanLabel(nextState.config.month, days)}: ${nurse.name}(${nurse.id}) の [${shifts.join("/")}] シフト配置を禁止`
          );
        }
      }
      continue;
    }

    if (op.op === "add_date_coverage" && op.day && typeof op.minStaff === "number") {
      if (op.day >= 1 && op.day <= nextState.config.numDays) {
        const shift: ShiftCode =
          op.shift === "E" || op.shift === "N" ? op.shift : "D";
        const shiftLabel = shift === "D" ? "日勤(D)" : shift === "E" ? "準夜勤(E)" : "深夜勤(N)";
        const rule: CustomConstraintRule = {
          id: `chat_cov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "date_coverage",
          enabled: true,
          day: op.day,
          shift,
          minStaff: Math.max(1, Math.round(op.minStaff)),
          description: `${nextState.config.month}/${op.day} の${shiftLabel}必要人数を ${Math.round(op.minStaff)}名以上 に設定`,
        };
        nextState.customRules.push(rule);
        appliedLogs.push(rule.description);
      }
      continue;
    }

    if (op.op === "add_ng_pair" && op.nurseNameOrId && op.nurseBNameOrId) {
      const nA = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const nB = resolveNurseFromText(op.nurseBNameOrId, nextState.nurses);
      if (nA && nB && nA.id !== nB.id) {
        const targetShifts: ShiftCode[] = op.shifts?.length ? op.shifts : ["E", "N"];
        const shiftDesc =
          targetShifts.length === 3
            ? "全シフト(日勤・準夜・深夜)"
            : targetShifts.length === 2 &&
                targetShifts.includes("E") &&
                targetShifts.includes("N")
              ? "同夜勤(準夜・深夜)"
              : `[${targetShifts.join("/")}] シフト`;
        const rule: CustomConstraintRule = {
          id: `chat_ng_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "ng_pair_custom",
          enabled: true,
          isHard: typeof op.isHard === "boolean" ? op.isHard : undefined,
          penaltyWeight: typeof op.penaltyWeight === "number" ? op.penaltyWeight : undefined,
          nurseId: nA.id,
          nurseBId: nB.id,
          shifts: targetShifts,
          description: `相性NGペア追加: ${nA.name}(${nA.id}) × ${nB.name}(${nB.id}) の${shiftDesc}同時配置を禁止`,
        };
        nextState.customRules.push(rule);
        appliedLogs.push(rule.description);
      }
    }
  }

  return { updatedState: nextState, appliedLogs };
}
