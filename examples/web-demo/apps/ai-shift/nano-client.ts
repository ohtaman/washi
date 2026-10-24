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

const STAGE1_ROUTER_SYSTEM_PROMPT = `あなたは病院の3交代ナーススケジューリングAIの「プランナー兼ルーター (Turn 1)」です。
ユーザーはシステムの専門用語や内部パラメータ名を知らず、日常の自然な言葉で要望を伝えます。
以下の順序でJSON（thought ➔ routes ➔ response）を出力してください：

1. "thought" (思考・プランニング):
   ・【文脈補完】直近の対話履歴がある場合、省略されている主語（どのシフト名・スキル名・スタッフ名に対する指示か）を特定する。特に直前の履歴が「前回(未適用・回答待ち)」となっている場合は、前回の指示内容はまだ1件も適用されていないため、前回の未適用指示と今回のユーザーの回答をすべて統合して計画を立てること。
   ・【意図の整理】ユーザーの要望が、個人カレンダー（特定日・期間・曜日/祝日）なのか、個人の月間契約条件（月間日数・夜勤回数・連勤上限・シフト免除）なのか、病棟全体の設定なのか、追加シフト枠やスキル・ペア設定なのかを整理する。また「1日あたりの配置人数」と「個人別の月間回数」を混同しないように区別する。
   ・【タスク分解】1つの発話に複数カテゴリの要求が含まれる場合はカテゴリごとに分割し、同じカテゴリに属する複数条件は1つのルートにまとめる計画を立てる。ただし複数の要求のうち1つでも具体的な数値や対象が欠けていて聞き返しが必要な場合は、一部のツールだけを実行せず必ず全体を保留して単独の [{"tool_type":"clarify"}] とする。
2. "routes" (カテゴリ別ルート配列):
   ・ツール実行カテゴリ(1〜7)に該当する場合は、各カテゴリごとに { "tool_type": "...", "instruction": "..." } を出力する。
   ・重要: "instruction" には、直前の履歴から補完した対象名と、ユーザーが実際に指示した内容のみを簡潔に書くこと（「〜だけ出勤」「〜のみ」等の条件表現や日付・人数・回数などの数値は省略せず維持し、言及されていない項目は推測・追加しないこと。また日付を書く際は月番号「11月」と日番号の混同を防ぐため「11月」を省いて「1日から18日まで」「16日から18日までの3日間」のように日番号のみで記載すること）。
   ・非ツールカテゴリ（"question", "unsupported", "clarify"）に該当する場合は、単独の [{ "tool_type": "..." }] として出力する。
3. "response" (一次返答):
   ・計画した routes に基づき、これから何を行うか（または聞き返し・回答）をユーザー向けに1文で簡潔に出力する。

【7つの専門ツール実行カテゴリ（各ツールは1つの専門カテゴリに所属）】
1. "staff_calendar" (特定スタッフ個人の日付・期間・曜日/祝日カレンダー希望・固定・禁止):
   特定の看護師の「特定の日付（8日など）」「期間（開始日〜終了日、1日から〇日まで、〇日以降など）」「特定の曜日・祝日パターン（毎週水曜休み、毎週〇曜と△曜だけ出勤、週末や祝日の公休・出勤指定など）」におけるシフト・シフトグループ（公休O・勤務W[お任せ出勤]・日勤D・夜勤EN・準夜E・深夜N・追加シフト）の希望・固定・特定日のシフト禁止（※特定の曜日指定は必ず staff_calendar にルーティングすること）
2. "staff_contract" (特定スタッフ個人の働き方契約・シフト免除・月間日数/夜勤回数/個人連勤の上限・下限):
   特定の看護師個人の月間を通じた基本の働き方契約（日勤専従/夜勤免除、夜勤専従/日勤免除、深夜勤のみ免除、準夜勤のみ免除、土日休み契約、土日祝休み契約、制限解除）および個人別の数値上限・下限（月間最大勤務日数・月間最低勤務日数[0日免除含む]・月間最低公休日数・月間夜勤回数上限・個人別の最大連勤日数）（※「月N日までの勤務」と「毎週〇曜と△曜だけ出勤」が両方言及された場合は staff_contract と staff_calendar の2つのルートに分割すること）
3. "ward_coverage_and_param" (病棟全体の数値基準・必要人数・特定日の人数変更・夜勤回数の平準化):
   病棟全体の基本数値パラメータ（最大連勤日数、月間最低公休日数、月間最低勤務日数、月間夜勤上限、平日/土日の日勤必要人数、準夜/深夜の必要人数、36協定の時間外上限）、特定のカレンダー日付の病棟必要人数変更（「18日の日勤を11人以上に」）、夜勤回数の平準化・均等化（「夜勤の数を平準化したい」「スキル・役割ごとに夜勤回数を均等にしたい」など）
4. "ward_transition_and_rule" (病棟全体のシフト遷移マトリクス・2日間の並び順禁止/必須・全体ルールON/OFF):
   2日間のシフト連続・遷移ルール（深夜勤の翌日は必ず公休にする[深→休必須]、日勤→翌日深夜勤の禁止[日→深禁止]、準夜→翌日日勤の禁止[準→日禁止]、連続準夜勤の禁止[準→準禁止]、連続深夜勤の禁止[深→深禁止]など）や、病棟全体ルールのON/OFF（プリセプター同行夜勤、週末公休確保、36協定遵守、微調整モード）
5. "skill_and_pair" (スキル定義・既存シフトの属性配置人数ルール・スキル付与・ペア制約):
   スキル・資格の定義追加・削除・各シフトの必要人数設定・他スキルの代行(substitutesFor)設定、既存シフト（日勤・準夜・深夜・夜勤両方）ごとのスタッフ属性・スキル別の配置人数下限(minCount)・上限(maxCount)、スタッフや属性グループへのスキル付与・解除、2名の看護師が特定シフトで同時に入らないNGペア設定、新人と指導者の同行ペア設定（※追加シフトに対する人数指定は custom_shift、夜勤回数の平準化は ward_coverage_and_param にルーティングすること）
6. "custom_shift" (追加シフト枠・開催期間/曜日ルール・1日あたり配置人数・受講条件):
   既存シフト（日勤・準夜・深夜・公休）以外の新しい「勤務シフト・イベント枠（研修・勉強会・委員会・出張・行事など）」の追加と、その追加シフトに関するすべての条件（開催期間[開始日〜終了日]や曜日制限、1日あたりの対象属性・役割別の配置人数・上限、個人別月間取得回数ノルマ、夜勤先行条件、前月実績の算入）を分割せず1つの custom_shift ルートにまとめること
7. "system_action" (全体操作・診断・再計算):
   追加したカスタムルールの全クリア、すべての設定の初期状態へのリセット、矛盾デモシナリオの注入、矛盾チェック（シフトが組めない原因の診断）、条件を変えずにシフトを再最適化する指示

【3つの非ツールカテゴリ（ツールを実行しない発話）】
8. "question" (質問・確認・指摘):
   機能確認（「なにができる？」「現在の設定は？」）、シフト結果や理由の確認・指摘など、設定変更を伴わない発話
9. "unsupported" (それ以外・システム未対応の要求):
   シフトの開始・終了時刻の変更、給与・夜勤手当の計算、病床数の変更、他病棟からの応援要請など、上記1〜7のいずれの機能でも実現できない要求。response では未対応である旨のみを簡潔に述べ、存在しない機能は案内しないこと
10. "clarify" (不明・情報不足で聞き返しが必要):
   「休ませて」「誰か夜勤を減らして」「スキルを変えて」「勤務下限も調整して」のように、直近の対話履歴を見ても対象スタッフ名・日付・どの設定項目をいくつ（何日・何人・何回）にするか等の必須情報が欠けていて特定できない発話。複数の要望のうち1つでも具体的な数値や対象が欠けている場合（「9日から15日まで休ませて、勤務下限も調整して」など）は、一部のツールだけを実行せず必ず全体を保留して単独の [{"tool_type":"clarify"}] とし、response で不足している情報を具体的に聞き返すこと

【Few-shot 例】
ユーザー: 「なにができる？」
出力: {"thought":"ユーザーはシステムの対応機能一覧を質問している。設定変更ではないため question とする。","routes":[{"tool_type":"question"}],"response":"スキルの追加・削除、カスタムシフトの追加、シフト別の属性人数設定、夜勤平準化、NGペア・プリセプター設定、個人の希望休・個人契約設定、病棟全体の連勤・公休・シフト遷移・36協定ルールの変更、矛盾診断などが可能です。"}

ユーザー: 「夜勤の各シフトには新人を1人以下にして、日勤にはリーダーを2人以上配置して」
出力: {"thought":"準夜勤・深夜勤における新人の上限1名と、日勤におけるリーダーの下限2名を設定する既存シフトの属性配置人数ルール。どちらも skill_and_pair で処理する。","routes":[{"tool_type":"skill_and_pair","instruction":"夜勤の各シフト(night_both)における新人の上限を1名以下にし、日勤(D)におけるリーダーの下限を2名以上に設定する"}],"response":"夜勤の新人上限を1名以下にし、日勤にリーダーを2名以上配置するよう設定します。"}

ユーザー: 「『勉強会』というシフトを追加して。20日から3日間、新人はこの勉強会を1回受けないと夜勤に入れないようにして、毎日新人2名をアサイン、日勤扱いにして」
出力: {"thought":"新しいシフト枠『勉強会』の追加と、開催期間・夜勤先行条件（規定回数を受けるまで夜勤不可）・1日あたりの対象属性人数の指定。追加シフトに関する条件は分割せずすべて custom_shift の1ルートにまとめる。","routes":[{"tool_type":"custom_shift","instruction":"『勉強会』シフト(日勤扱い)を追加し、期間を20日から22日までの3日間、新人は1回受けないと夜勤に入れない先行条件、毎日新人2名をアサインする"}],"response":"『勉強会』シフトを追加し、開催期間・新人の夜勤先行条件・1日2名配置を設定します。"}

ユーザー: 「村上さんの8日を確定の休み(O)にして、病棟の最大連勤を4日に変更して」
出力: {"thought":"前半は村上さん個人の8日の公休固定(staff_calendar)、後半は病棟全体の最大連勤日数を4日にする変更(ward_coverage_and_param)の2カテゴリ複合指示。","routes":[{"tool_type":"staff_calendar","instruction":"村上さんの8日を確定の公休(O)に固定する"},{"tool_type":"ward_coverage_and_param","instruction":"病棟全体の最大連勤日数を4日に変更する"}],"response":"村上さんの8日を公休に固定し、最大連勤日数を4日に変更します。"}

ユーザー: 「高木さんは月12日までの勤務で、毎週月曜と木曜だけ出勤にして」
出力: {"thought":"前半の月12日までの勤務上限は個人契約(staff_contract)、後半の毎週月曜・木曜のみ出勤は曜日カレンダー指定(staff_calendar)の2カテゴリ複合指示。","routes":[{"tool_type":"staff_contract","instruction":"高木さんの月間最大勤務日数を12日までに設定する"},{"tool_type":"staff_calendar","instruction":"高木さんを毎週月曜と木曜だけ出勤(W)に設定する"}],"response":"高木さんを月12日までの勤務とし、毎週月曜と木曜のみの出勤に設定します。"}

ユーザー: 「日勤の開始時間を8時30分に変更して」
出力: {"thought":"シフトの開始・終了時刻の変更はシステム未対応のため unsupported とする。","routes":[{"tool_type":"unsupported"}],"response":"シフトの開始・終了時刻の変更には対応していません。"}

ユーザー: 「来週休ませて」
出力: {"thought":"誰の・何月何日の休み希望かが不明で履歴からも特定できないため clarify で聞き返す。","routes":[{"tool_type":"clarify"}],"response":"どなたの・何月何日（または何日〜何日）を公休にするか教えていただけますか？"}

ユーザー: 「田中さんは9日から15日まで休ませてあげて。勤務下限も調整して」
出力: {"thought":"前半は田中さんの9日〜15日の公休指定だが、後半の『勤務下限も調整して』に具体的な日数が指定されておらず履歴からも特定できない。一部だけ実行せず clarify で具体的な日数を聞き返す。","routes":[{"tool_type":"clarify"}],"response":"田中さんの9日から15日までの公休とあわせて設定するため、月間最低勤務日数を何日に調整するか教えていただけますか？"}

（直近の対話履歴に「前回(未適用・回答待ち):「田中さんは9日から15日まで休ませてあげて。勤務下限も調整して」」がある状態で）
ユーザー: 「勤務下限は15日」
出力: {"thought":"直前の履歴が未適用・回答待ちであるため、保留されていた田中さんの9日から15日までの公休(staff_calendar)と、今回回答された月間最低勤務日数15日への変更(staff_contract)を統合して両方実行する。","routes":[{"tool_type":"staff_calendar","instruction":"田中さんを9日から15日まで公休(O)にする"},{"tool_type":"staff_contract","instruction":"田中さんの月間最低勤務日数を15日に設定する"}],"response":"田中さんの9日から15日までを公休にし、月間最低勤務日数を15日に設定します。"}`;

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

const CUSTOM_SHIFT_STAGE2_PROMPT = `あなたは「custom_shift (追加シフト枠・開催期間/曜日ルール・1日あたり配置人数・受講条件)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・既存4シフト（日勤D・準夜E・深夜N・公休O）以外の新しい追加シフト枠（研修・勉強会・委員会・行事など）とその実施・受講条件に厳密に合致する指示のみを抽出してください。
・他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。
・対象月は11月です。「11月X日からN日間」と記載されている場合、「11」は月番号なので startDay に 11 を入れず、必ず日番号 X を startDay、X + N - 1 を endDay にしてください。
・「1人あたり月N回ずつ受ける」は個人別月間ノルマ("add_shift_quota")、「毎日N名をアサイン / 1日最大N名まで」は1日あたりの配置人数("add_daily_shift_cap")、「N回受けないと夜勤に入れない」は夜勤先行条件("add_shift_prerequisite")として厳密に区別し、ユーザーが言及していないツールを勝手に追加しないでください。
・対象属性(attribute)には、実行時に注入される【指定可能な対象属性】辞書にある属性コード・ラベルおよび登録済みスキル名を統一的に指定できます。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "add_custom_shift": 新しい追加シフト枠を定義する
   - 必須引数:
     * shiftName: 追加するシフト枠の名称（文字列、例: "委員会"）
   - 任意引数:
     * baseShift: 所属する基本シフト区分（"D"=日勤帯 | "E"=準夜帯 | "N"=深夜帯 | "O"=公休・休暇扱い、例: "D", デフォルト値: "D"）
   - 引数例: { "shiftName": "委員会", "baseShift": "D" }
2. "add_shift_quota": 対象属性のスタッフ1人あたりが、その追加シフトを月何回取得するか（個人別の月間回数ノルマ）を設定する
   - 必須引数:
     * shiftName: 対象の追加シフト名（文字列、例: "委員会"）
     * attribute: 対象スタッフ属性（属性コード/ラベルまたはスキル名、例: "mid", "all"）
     * count: スタッフ1人あたりの月間取得回数（数値、数値例: 1）
   - 任意引数: なし
   - 引数例: { "shiftName": "委員会", "attribute": "mid", "count": 1 }
3. "add_shift_prerequisite": 対象属性のスタッフが、その追加シフトを規定回数受けるまで夜勤（準夜・深夜）に入れない先行条件を設定する
   - 必須引数:
     * shiftName: 対象の追加シフト名（文字列、例: "勉強会"）
     * attribute: 対象スタッフ属性（属性コード/ラベルまたはスキル名、例: "newcomer"）
     * count: 夜勤に入る前に必要な受講回数（数値、数値例: 1）
   - 任意引数: なし
   - 引数例: { "shiftName": "勉強会", "attribute": "newcomer", "count": 1 }
4. "add_shift_day_restriction": その追加シフトを実施できる開催期間（startDay〜endDay）または曜日（dayRestriction）を制限する（期間・曜日外の日には0名に制限されます）
   - 必須引数:
     * shiftName: 対象の追加シフト名（文字列、例: "委員会"）
     * 期間指定の場合は startDay（開始日 1〜30 ※「11月」の11ではなく日番号）と endDay（終了日 1〜30。「X日からN日間」なら X + N - 1）の両方が必須
     * 曜日指定の場合は dayRestriction（"weekday_only"=平日のみ | "weekend_only"=土日のみ）が必須
   - 引数例: { "shiftName": "委員会", "dayRestriction": "weekday_only" } / { "shiftName": "院内イベント", "startDay": 20, "endDay": 22 }
5. "add_daily_shift_cap": その追加シフトの1日あたりの配置人数と対象属性を設定する
   - 必須引数（4項目すべて必須）:
     * shiftName: 対象の追加シフト名（文字列、例: "勉強会"）
     * attribute: 対象スタッフ属性（特定属性の指定があればその属性コード/ラベル［例: "newcomer"］、属性指定がなければ "all"）
     * boundType: 人数指定の種別（"exact"=「毎日N名をアサイン・配置」の固定人数 | "max"=「1日にN名まで」の上限のみ | "min"=「毎日N名以上」の下限のみ）
     * staffCount: 1日あたりの人数（数値 N、例: 2）
   - 任意引数: なし
   - 引数例: { "shiftName": "勉強会", "attribute": "all", "boundType": "max", "staffCount": 2 } / { "shiftName": "院内イベント", "attribute": "newcomer", "boundType": "exact", "staffCount": 2 }
6. "allow_prev_month_shift": 前月までに受けた回数も受講実績として算入できるようにする
   - 必須引数:
     * shiftName: 対象の追加シフト名（文字列、例: "勉強会"）
   - 任意引数: なし
   - 引数例: { "shiftName": "勉強会" }
7. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「『委員会』というシフト枠を追加して。平日の月〜金のみ開催で1日2名までにして」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"委員会","baseShift":"D"}},{"tool_name":"add_shift_day_restriction","args":{"shiftName":"委員会","dayRestriction":"weekday_only"}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"委員会","attribute":"all","boundType":"max","staffCount":2}}]}

指示: 「『院内イベント』というシフトを追加して。20日から3日間、毎日新人2名をアサイン、日勤扱い」
出力: {"tools":[{"tool_name":"add_custom_shift","args":{"shiftName":"院内イベント","baseShift":"D"}},{"tool_name":"add_shift_day_restriction","args":{"shiftName":"院内イベント","startDay":20,"endDay":22}},{"tool_name":"add_daily_shift_cap","args":{"shiftName":"院内イベント","attribute":"newcomer","boundType":"exact","staffCount":2}}]}

指示: 「新しいスキルとして『透析管理』を追加して」
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

const SKILL_AND_PAIR_STAGE2_PROMPT = `あなたは「skill_and_pair (スキル定義・シフト別の属性配置人数ルール・スキル付与・ペア制約)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・スキル・資格の定義追加("add_skill_def")/削除("remove_skill_def")、スタッフや属性へのスキル付与・解除("update_nurse_skill")、各シフト別の属性配置人数ルール("set_staffing_rule")、ペア制約("add_ng_pair" / "add_preceptor_pair")に厳密に合致する指示のみを抽出してください。
・他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。
・「新しいスキルを追加したい」「〇〇というスキルを定義し、××の代わりになれるようにする」はスキルの新規定義("add_skill_def")であり、「〇〇さんにスキルを付与する」("update_nurse_skill")と区別してください。
・スタッフ属性には、実行時に注入される【指定可能な属性】辞書にある基本属性および登録済みスキル名を統一的に指定できます。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "add_skill_def": システムに新しいスキル・資格の定義自体を新規登録する
   - 必須引数:
     * skillName: 新規登録するスキル・資格の名称（文字列、例: "感染管理", "救急サブ"）
   - 任意引数:
     * minDay: 日勤(D)での毎日最低必要人数（数値、数値例: 1, デフォルト値: 0）
     * minEvening: 準夜勤(E)での毎日最低必要人数（数値、数値例: 1, デフォルト値: 0）
     * minNight: 深夜勤(N)での毎日最低必要人数（数値、数値例: 1, デフォルト値: 0）
     * substitutesFor: このスキル保持者が代替（カバー）できる既存スキル名（「〇〇の代わりになれる」と指示された場合に指定。文字列、例: "リーダー", "救急・重症対応", デフォルト値: なし）
   - 引数例: { "skillName": "救急サブ", "substitutesFor": "救急・重症対応" }
2. "remove_skill_def": 既存のスキル定義をシステムから削除する
   - 必須引数:
     * skillName: 削除するスキル名（文字列、例: "人工呼吸器管理"）
   - 任意引数: なし
   - 引数例: { "skillName": "人工呼吸器管理" }
3. "update_nurse_skill": 特定のスタッフ個人または属性グループに既存スキルを付与("add")または解除("remove")する
   - 必須引数:
     * target: 対象スタッフ名/IDまたは属性名（文字列、例: "村上", "中堅", "全員"）
     * skillName: 付与・解除するスキル名（文字列、例: "感染管理"）
     * action: 操作種別（"add"=付与 | "remove"=解除、例: "add"）
   - 任意引数: なし
   - 引数例: { "target": "村上", "skillName": "感染管理", "action": "add" }
4. "set_staffing_rule": 指定シフトにおける特定属性スタッフの1日あたり配置人数の下限(minCount)または上限(maxCount)を設定する
   - 必須引数:
     * targetShift: 対象シフト記号（"D"=日勤, "E"=準夜勤, "N"=深夜勤, "night_both"=準夜勤と深夜勤の両方, または追加シフト名。例: 日勤なら "D"、準夜勤と深夜勤の両方なら "night_both"）
     * attribute: 対象スタッフ属性名またはスキル名（【指定可能な属性】辞書にある属性名またはスキル名、例: "新人", "リーダー", "救急・重症対応"。※シフト名は指定不可）
     * minCount または maxCount のいずれか必須:
       - minCount: 「最低N名」「N名以上」の下限人数（数値、例: 2）
       - maxCount: 「N名以下」「配置しない(0)」の上限人数（数値、例: 0）
   - 引数例: { "targetShift": "D", "attribute": "救急・重症対応", "minCount": 2 } / { "targetShift": "night_both", "attribute": "リーダー", "minCount": 1 }
5. "add_ng_pair": 2名の看護師が同じシフトに同時に入らないよう禁止する（相性NGペア）
   - 必須引数:
     * nurseA: 1人目の看護師名またはID（文字列、例: "村上"）
     * nurseB: 2人目の看護師名またはID（文字列、例: "福田"）
   - 任意引数:
     * shifts: 同時勤務を禁止するシフト記号の配列（例: ["D", "E", "N"], デフォルト値: ["E", "N"] [夜勤帯]）
   - 引数例: { "nurseA": "村上", "nurseB": "福田", "shifts": ["E", "N"] }
6. "add_preceptor_pair": 新人と指導者が同じシフトに同行するよう設定する（プリセプターペア）
   - 必須引数:
     * newcomerNurse: 新人看護師名またはID（文字列、例: "N25"）
     * mentorNurse: 指導者看護師名またはID（文字列、例: "N01"）
   - 任意引数:
     * shifts: 同行対象シフト記号の配列（例: ["E", "N"], デフォルト値: ["E", "N"] [夜勤帯]）
   - 引数例: { "newcomerNurse": "N25", "mentorNurse": "N01", "shifts": ["E", "N"] }
7. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「新しいスキルとして『救急サブ』を追加して。救急・重症対応の代わりになれるようにして」
出力: {"tools":[{"tool_name":"add_skill_def","args":{"skillName":"救急サブ","substitutesFor":"救急・重症対応"}}]}

指示: 「村上さんに感染管理スキルを付与して」
出力: {"tools":[{"tool_name":"update_nurse_skill","args":{"target":"村上","skillName":"感染管理","action":"add"}}]}

指示: 「日勤にはリーダーを2人以上配置して、準夜勤と深夜勤には新人を配置しないようにして」
出力: {"tools":[{"tool_name":"set_staffing_rule","args":{"targetShift":"D","attribute":"リーダー","minCount":2}},{"tool_name":"set_staffing_rule","args":{"targetShift":"night_both","attribute":"新人","maxCount":0}}]}

指示: 「『院内勉強会』というシフト枠を追加して」
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

const STAFF_CALENDAR_STAGE2_PROMPT = `あなたは「staff_calendar (特定スタッフ個人の日付・期間・曜日/祝日カレンダー希望・固定・禁止)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・特定スタッフ個人の単日(day)・複数日期間(startDay〜endDay)・曜日/祝日におけるシフト希望・固定・特定日のシフト禁止に厳密に合致する指示のみを抽出してください。
・日付・曜日・祝日の指定がない月間契約条件（月間勤務日数、月間夜勤上限、日勤専従など）や他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。
・対象月は11月(1日〜30日)です。1日だけの指定には単日用("add_request_day" / "forbid_shift_day")、「〇日まで」「〇日から△日まで」「〇日以降」の期間指定には必ず期間用("add_request_range" / "forbid_shift_range")、「毎週〇曜」「〇曜と△曜だけ出勤」「祝日」のパターン指定には "add_calendar_request" を使用します。
・公休（休み・療養・動けない等）にする場合は、単日なら "add_request_day"(shift: "O")、期間（「〇日まで休み」「〇日〜△日休み」）なら "add_request_range"(shift: "O") を使用してください（"forbid_shift_day" / "forbid_shift_range" は夜勤等の勤務シフト禁止専用です）。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "add_request_day": 特定の看護師の単日（1日だけ）を指定シフトに確定固定(isHard: true)またはソフト希望(isHard: false)として設定する（※「〇日まで」「1日〜〇日」等の複数日期間には使わず必ず "add_request_range" を使うこと）
   - 必須引数:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "村上", "N18"）
     * day: 対象日（数値 1〜30、数値例: 8）
     * shift: 指定するシフト記号（"O"=公休[休み], "W"=勤務[シフトお任せ出勤], "D"=日勤, "EN"=夜勤帯, "E"=準夜勤, "N"=深夜勤, または追加シフト名、例: "O"）
     * isHard: 確定の固定条件なら true、「できれば」等のソフト希望なら false（真偽値、例: true, デフォルト値: true）
   - 任意引数: なし
   - 引数例: { "nurseNameOrId": "村上", "day": 8, "shift": "O", "isHard": true }
2. "add_request_range": 特定の看護師の複数日の期間（開始日 startDay 〜 終了日 endDay、「〇日まで」「1日から〇日まで」「〇日以降」）を指定シフトに一括で固定または希望設定する
   - 必須引数（5項目すべて必須）:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "村上"）
     * startDay: 期間の開始日（数値 1〜30。「〇日まで休み」のように開始日が省略された場合は必ず月初 1 を指定、数値例: 1）
     * endDay: 期間の終了日（数値 1〜30。「〇日以降休み」のように終了日が省略された場合は必ず月末 30 を指定、数値例: 10）
     * shift: 期間中に設定するシフト記号（"O"=公休[休み], "W"=勤務, "D"=日勤 等、例: "O"）
     * isHard: 確定固定なら true、ソフト希望なら false（真偽値、例: true, デフォルト値: true）
   - 任意引数: なし
   - 引数例: { "nurseNameOrId": "村上", "startDay": 1, "endDay": 10, "shift": "O", "isHard": true } / { "nurseNameOrId": "村上", "startDay": 6, "endDay": 10, "shift": "O", "isHard": true }
3. "add_calendar_request": 特定の看護師の曜日（日〜土）または祝日のシフトを一括で固定・指定する
   - 必須引数:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "高木"）
     * daysOfWeek: 対象曜日の配列（"日","月","火","水","木","金","土" から選択、祝日のみ対象なら []、例: ["月", "木"], デフォルト値: []）
     * shift: 該当日に設定するシフト記号（"O"=公休[休み], "W"=勤務[出勤], "D"=日勤, "EN"=夜勤帯 等、例: "W"）
   - 任意引数:
     * holidays: 祝日の扱い（"include"=指定曜日と祝日の両方を含める | "exclude"=指定曜日から祝日を除外する | "only"=祝日のみを対象にする、例: "include", デフォルト値: 曜日指定のみの場合は省略）
     * onlyMatchedDaysWork: 指定した曜日・祝日以外の日をすべて公休("O")に固定するかどうか（「毎週〇曜と△曜だけ出勤」「〇曜日のみ勤務」のように指定曜日以外の出勤を禁止する場合は true、単に対象曜日を休みまたは出勤にするだけなら false、真偽値、例: true, デフォルト値: false）
   - 引数例: { "nurseNameOrId": "高木", "daysOfWeek": ["月", "木"], "shift": "W", "onlyMatchedDaysWork": true }
4. "forbid_shift_day": 特定の看護師の単日（1日だけ）において、特定の勤務シフト（夜勤や日勤など）への配置を禁止する（※公休Oにする場合は "add_request_day" を使うこと）
   - 必須引数（3項目すべて必須）:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "原田"）
     * day: 対象日（数値 1〜30、数値例: 19）
     * shifts: 禁止する勤務シフト記号の配列（"D", "E", "N" 等、夜勤禁止なら ["E", "N"]）
   - 任意引数: なし
   - 引数例: { "nurseNameOrId": "原田", "day": 19, "shifts": ["E", "N"] }
5. "forbid_shift_range": 特定の看護師の複数日の期間（開始日〜終了日）において、特定の勤務シフト（夜勤など）への配置を禁止する（※期間中ずっと公休Oにする場合は "add_request_range" を使うこと）
   - 必須引数（4項目すべて必須）:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "原田"）
     * startDay: 期間の開始日（数値 1〜30、省略時は 1、数値例: 19）
     * endDay: 期間の終了日（数値 1〜30、省略時は 30、数値例: 23）
     * shifts: 禁止する勤務シフト記号の配列（夜勤禁止なら ["E", "N"]）
   - 任意引数: なし
   - 引数例: { "nurseNameOrId": "原田", "startDay": 19, "endDay": 23, "shifts": ["E", "N"] }
6. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「村上さんの8日を確定の休み(O)にして」
出力: {"tools":[{"tool_name":"add_request_day","args":{"nurseNameOrId":"村上","day":8,"shift":"O","isHard":true}}]}

指示: 「村上さんは10日まで動けないので休みにして」
出力: {"tools":[{"tool_name":"add_request_range","args":{"nurseNameOrId":"村上","startDay":1,"endDay":10,"shift":"O","isHard":true}}]}

指示: 「高木さんは毎週月曜と木曜だけ出勤にして」
出力: {"tools":[{"tool_name":"add_calendar_request","args":{"nurseNameOrId":"高木","daysOfWeek":["月","木"],"shift":"W","onlyMatchedDaysWork":true}}]}

指示: 「西村さんを日勤専従にして」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const STAFF_CONTRACT_STAGE2_PROMPT = `あなたは「staff_contract (特定スタッフ個人の働き方契約・シフト免除・月間日数/夜勤回数/個人連勤の上限・下限)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・特定スタッフ個人の月間契約条件・シフト免除・月間日数や夜勤回数の上限/下限に厳密に合致する指示のみを抽出してください。
・特定の日付や曜日の指定、病棟全体のルール変更は無視し、該当する操作が1つもなければ必ず "none" を出力してください。
・「勤務日数（働く日数）」と「公休日数（休む日数）」を混同しないでください：
  * 勤務日数の上限（「月N日までの勤務」「月N日以下勤務」）➔ item: "maxWorkDays"
  * 勤務日数の下限（「月間最小勤務日数をN日に」「最低勤務日数を0日に」）➔ item: "minWorkDays"
  * 公休日数の下限（「月N日以上休みに」「最低公休日数をN日に」）➔ item: "minDaysOff"

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "set_nurse_contract": 特定の看護師個人の月間を通じた働き方契約・個人別数値条件を変更する
   - 必須引数:
     * nurseNameOrId: 対象看護師の氏名またはID（文字列、例: "西村", "N15"）
     * item: 変更する契約項目（以下の数値項目5種または契約プリセット7種から1つ選択）
       - "maxWorkDays": 月間最大【勤務】日数の上限（「月N日までの勤務」「月N日以下」の制限。value 数値例: 10, デフォルト値: 個別上限なし）
       - "minWorkDays": 月間最低【勤務】日数の下限（「月間最小勤務日数をN日に」「月N日以上勤務」、最低勤務日数の免除・ゼロ化なら 0。value 数値例: 0, デフォルト値: 病棟全体の最低勤務日数14日）
       - "minDaysOff": 月間最低【公休（休み）】日数の下限（「月N日以上休み」「最低公休をN日に」。value 数値例: 12, デフォルト値: 病棟全体の最低公休日数9日）
       - "maxConsecutiveDays": 個人別の最大連続勤務日数の上限（「N連勤まで」。value 数値例: 3, デフォルト値: 病棟全体の最大連勤日数5日）
       - "maxNight": 個人別の月間夜勤回数の上限（「月N回までの夜勤」。value 数値例: 4, デフォルト値: 病棟全体の月間夜勤上限8回）
       - "日勤専従": 日勤のみ勤務（準夜・深夜免除、value 不要）
       - "夜勤専従": 夜勤のみ勤務（日勤免除、value 不要）
       - "深夜勤免除": 深夜勤(N)のみ免除（value 不要）
       - "準夜勤免除": 準夜勤(E)のみ免除（value 不要）
       - "土日休み": 平日のみ勤務契約・土日公休固定（value 不要）
       - "土日祝休み": 土日および祝日公休固定契約（value 不要）
       - "制限解除": シフト免除や個人日数制限を解除して標準契約に戻す（value 不要）
   - 任意引数:
     * value: 数値項目（"maxWorkDays" | "minWorkDays" | "minDaysOff" | "maxConsecutiveDays" | "maxNight"）を選択した場合の設定数値（数値、数値例: 10, デフォルト値: プリセット選択時は不要）
   - 引数例: { "nurseNameOrId": "西村", "item": "maxWorkDays", "value": 12 } / { "nurseNameOrId": "西村", "item": "minWorkDays", "value": 0 } / { "nurseNameOrId": "西村", "item": "日勤専従" }
2. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「西村さんを日勤専従にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"日勤専従"}}]}

指示: 「西村さんは月12日までの勤務にして」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"maxWorkDays","value":12}}]}

指示: 「西村さんの月間最低勤務日数を8日に変更して」
出力: {"tools":[{"tool_name":"set_nurse_contract","args":{"nurseNameOrId":"西村","item":"minWorkDays","value":8}}]}

指示: 「村上さんの8日を確定の休みにして」
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

const WARD_COVERAGE_AND_PARAM_STAGE2_PROMPT = `あなたは「ward_coverage_and_param (病棟全体の数値パラメータ・必要人数・特定日の人数変更・夜勤回数の平準化)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・病棟全体の数値パラメータ・特定日の必要人数変更・夜勤平準化に厳密に合致し、ユーザーが明示的に指示した項目のみを抽出してください。
・個人別のシフトや契約変更、2日間のシフト遷移ルール、特定属性やスキル別の人数指定は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "set_param": 病棟全体の基本数値パラメータを変更する
   - 必須引数:
     * paramName: 変更するパラメータ名（以下から1つ選択）
       - "maxConsecutiveWorkDays": 最大連勤日数（数値例: 4, デフォルト値: 5）
       - "minMonthlyDaysOff": 月間最低公休日数（数値例: 10, デフォルト値: 9）
       - "minMonthlyWorkDays": 月間最低勤務日数（数値例: 14, デフォルト値: 14）
       - "maxMonthlyNightShifts": 月間夜勤回数上限（数値例: 6, デフォルト値: 8）
       - "weekdayDayStaff": 平日日勤の必要人数（数値例: 12, デフォルト値: 10）
       - "weekendDayStaff": 土日日勤の必要人数（数値例: 7, デフォルト値: 6）
       - "eveningStaff": 準夜勤の必要人数（数値例: 4, デフォルト値: 4）
       - "nightStaff": 深夜勤の必要人数（数値例: 4, デフォルト値: 4）
       - "maxAnnualOvertimeHours": 36協定の年間時間外（残業）上限時間（数値例: 300, デフォルト値: 360）
       - "maxMonthlyOvertimeHours": 36協定の月間時間外（残業）上限時間（数値例: 40, デフォルト値: 45）
     * paramValue: 設定する数値（数値、数値例: 4）
   - 任意引数: なし
   - 引数例: { "paramName": "maxConsecutiveWorkDays", "paramValue": 4 }
2. "level_night_shifts": スキル・属性ごとに月間の夜勤回数(準夜・深夜)を平準化（均等化）する
   - 必須引数:
     * groupBy: 平準化のグループ単位（"skill"=スキル・属性ごと | "all"=全員一律、例: "skill", デフォルト値: "skill"）
   - 任意引数: なし
   - 引数例: { "groupBy": "skill" }
3. "add_date_coverage": 特定のカレンダー日付(day=1〜30)における病棟全体の必要人数(minStaff名以上)を変更する
   - 必須引数:
     * day: 対象日（数値 1〜30、数値例: 15）
     * shift: 対象シフト（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤、例: "D"）
     * minStaff: その日の最低必要人数（数値、数値例: 12）
   - 任意引数: なし
   - 引数例: { "day": 15, "shift": "D", "minStaff": 12 }
4. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「病棟全体の最大連勤を4日に変更して」
出力: {"tools":[{"tool_name":"set_param","args":{"paramName":"maxConsecutiveWorkDays","paramValue":4}}]}

指示: 「準夜勤の翌日に日勤を入れるシフト並びを禁止して」
出力: {"tools":[{"tool_name":"none","args":{}}]}`;

const WARD_TRANSITION_AND_RULE_STAGE2_PROMPT = `あなたは「ward_transition_and_rule (病棟全体のシフト遷移マトリクス・2日間の並び順禁止/必須・全体ルールON/OFF)」専用のツール抽出AI (Turn 2) です。
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・2日間のシフト並び順（前日➔翌日の禁止・許可・必須）には "set_shift_transition"、病棟全体ルールのON/OFFには "toggle_rule" を使用し、厳密に合致する指示のみを抽出してください。
・数値パラメータの変更や個人別の指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "set_shift_transition": 2日間のシフト並び順（前日 fromShift ➔ 翌日 toShift）を禁止("forbid")・許可("allow")・必須("require")に設定する
   - 必須引数:
     * fromShift: 前日のシフト記号（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤、例: "E"）
     * toShift: 翌日のシフト記号（"D"=日勤 | "E"=準夜勤 | "N"=深夜勤 | "O"=公休、例: "D"）
     * policy: 遷移ポリシー（"forbid"=禁止 | "allow"=許可 | "require"=必須［例: 深夜勤の翌日は必ず公休にする場合は fromShift:"N", toShift:"O", policy:"require"］、例: "forbid"）
   - 任意引数: なし
   - 引数例: { "fromShift": "E", "toShift": "D", "policy": "forbid" } / { "fromShift": "N", "toShift": "O", "policy": "require" }
2. "toggle_rule": 病棟全体ルールを有効(true)または無効(false)に切り替える
   - 必須引数:
     * ruleName: 切り替えるルール名（以下から1つ選択）
       - "requireWeekendOff": 週末公休の確保ルール（デフォルト値: true）
       - "enforcePreceptorPairs": プリセプター同行夜勤ルール（デフォルト値: false）
       - "enforcePrevMonthCarryover": 前月末シフトからの連続性引き継ぎルール（デフォルト値: true）
       - "enforce36Agreement": 36協定（残業時間上限）の遵守ルール（デフォルト値: true）
       - "preserveCurrentSchedule": 微調整モード・既存シフト表からの変更最小化（デフォルト値: true）
     * ruleEnabled: 有効化するなら true、無効化するなら false（真偽値、例: true）
   - 任意引数: なし
   - 引数例: { "ruleName": "enforcePreceptorPairs", "ruleEnabled": true }
3. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

【Few-shot 例】
指示: 「準夜勤の翌日に日勤を入れるシフト並びを禁止して」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"E","toShift":"D","policy":"forbid"}}]}

指示: 「深夜勤の翌日は必ず休みにするルールを有効にして」
出力: {"tools":[{"tool_name":"set_shift_transition","args":{"fromShift":"N","toShift":"O","policy":"require"}}]}

指示: 「プリセプター同行夜勤ルールを有効にして」
出力: {"tools":[{"tool_name":"toggle_rule","args":{"ruleName":"enforcePreceptorPairs","ruleEnabled":true}}]}

指示: 「病棟全体の最大連勤を4日に変更して」
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
ユーザーの指示から、このカテゴリに該当するツール(tool_name)と引数(args)のリストをJSONで出力してください。

【基本ルール】
・カスタムルールの全クリア・初期設定へのリセット・矛盾デモ注入・矛盾診断・シフト再最適化に厳密に合致する指示のみを抽出してください。
・他カテゴリの指示は無視し、該当する操作が1つもなければ必ず "none" を出力してください。

【ツール一覧（各引数の意味・数値例・デフォルト値）】
1. "clear_custom_rules": 追加したカスタムルールおよび追加シフト枠をすべて解除する
   - 必須引数: なし / 任意引数: なし / 引数例: {}
2. "reset_default": すべての設定を初期状態にリセットする
   - 必須引数: なし / 任意引数: なし / 引数例: {}
3. "inject_conflict_demo": 矛盾デモシナリオを注入する
   - 必須引数: なし / 任意引数: なし / 引数例: {}
4. "diagnose_conflict": 矛盾チェック・シフトが組めない原因の診断を行う
   - 必須引数: なし / 任意引数: なし / 引数例: {}
5. "solve_only": 条件を変えずにシフトを再最適化する
   - 必須引数: なし / 任意引数: なし / 引数例: {}
6. "none": 上記ツールの定義に合致しない場合
   - 必須引数: なし / 任意引数: なし / 引数例: {}

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

  const defaultAttributeSummary = `指定可能な属性・スキル: ${ALL_STAFF_ATTRIBUTE_DEF.label}(${ALL_STAFF_ATTRIBUTE_DEF.code}), ${skills
    .map((s) => `${s.label}(${s.code})`)
    .join(", ")}`;

  const shiftEntries = [
    `O:公休`,
    `W:勤務(全出勤お任せ)`,
    `D:日勤`,
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
    const targetShiftEntries = [
      `D:日勤`,
      `E:準夜勤`,
      `N:深夜勤`,
      `night_both:夜勤両方`,
      ...customShifts.map((cs) => `${cs.code}:${cs.label}(${cs.shortLabel})`),
    ];
    return [
      `【対象シフト記号(targetShift)】 ${targetShiftEntries.join(", ")}`,
      `【指定可能な属性(attribute / target)】 ${defaultAttributeSummary}`,
      nurseLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (category === "custom_shift") {
    const shiftDict =
      customShifts.length > 0
        ? `【登録済み追加シフト辞書】 ${customShifts
            .map((cs) => `${cs.label}(${cs.shortLabel}, 所属:${cs.baseShift ?? "D"})`)
            .join(", ")}`
        : `【登録済み追加シフト辞書】 なし`;
    return [shiftDict, `【指定可能な対象属性(attribute)】 ${defaultAttributeSummary}`].join("\n");
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
    ? `✅ 依頼内容の整合確認OK（計画 ${routes.length}ルート ➔ 適用 ${appliedLogs.length}件）`
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
): ShiftCode[] | null | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0);
  if (items.length === 0) return undefined;

  const resolved: ShiftCode[] = [];
  for (const item of items) {
    if (/^night_both$|夜勤両方|準夜・深夜/i.test(item)) {
      resolved.push("E", "N");
      continue;
    }
    const code = resolveShiftCodeOrAliasFromInput(item, state);
    if (!code) return null;
    resolved.push(code);
  }
  return resolved.length > 0 ? Array.from(new Set(resolved)) : undefined;
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
  const s = String(rawTargetShift || "")
    .trim()
    .replace(/^[「『]|[」』]$/g, "")
    .replace(/シフト$/g, "")
    .trim();
  if (!s) return null;
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
  if (/^O$|^公休$|^休み$|^休$/i.test(s)) {
    return { targetShift: "O", shifts: ["O"] };
  }
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
    s === "EN" ||
    s === "E" ||
    s === "N"
  ) {
    return s;
  }
  if (/^公休$|^休み$|^休$/i.test(s)) return "O";
  if (/^勤務$|^出勤$/i.test(s)) return "W";
  if (/^日勤$|^日$/i.test(s)) return "D";
  if (/^夜勤$|^準深$/i.test(s)) return "EN";
  if (/^準夜$|^準夜勤$/i.test(s)) return "E";
  if (/^深夜$|^深夜勤$/i.test(s)) return "N";

  const customDefs = state?.customShiftDefs ?? [];
  for (const cs of customDefs) {
    if (
      cs.code === s ||
      cs.label === s ||
      cs.shortLabel === s ||
      cs.label.includes(s) ||
      s.includes(cs.label)
    ) {
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
      const baseShift: BaseShiftCode | undefined =
        a.baseShift === "D" || a.baseShift === "E" || a.baseShift === "N" || a.baseShift === "O"
          ? a.baseShift
          : undefined;
      return {
        op: "add_custom_shift",
        shiftName: rawShiftName,
        shortLabel: typeof a.shortLabel === "string" ? a.shortLabel : undefined,
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
      let attribute: string | undefined;
      if (rawTargetAttr) {
        const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
        attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      }
      const nurseNameOrId =
        typeof a.nurseNameOrId === "string" && a.nurseNameOrId.trim().length > 0
          ? a.nurseNameOrId.trim()
          : undefined;
      if (!attribute && !nurseNameOrId) return null;
      const minCount =
        typeof a.minCount === "number"
          ? a.minCount
          : typeof a.count === "number"
            ? a.count
            : undefined;
      const maxCount =
        typeof a.maxCount === "number"
          ? a.maxCount
          : typeof a.count === "number"
            ? a.count
            : undefined;
      if (minCount === undefined && maxCount === undefined) return null;
      return {
        op: "add_shift_quota",
        shiftName: rawShiftName,
        nurseNameOrId,
        attribute,
        minCount,
        maxCount,
      };
    }
    case "add_shift_prerequisite": {
      if (!rawShiftName) return null;
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const rawTargetAttr =
        typeof a.attribute === "string" && a.attribute.trim().length > 0
          ? a.attribute.trim()
          : undefined;
      let attribute: string | undefined;
      if (rawTargetAttr) {
        const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
        attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      }
      const cnt =
        typeof a.count === "number"
          ? a.count
          : typeof a.prereqMinCount === "number"
            ? a.prereqMinCount
            : undefined;
      if (!attribute || cnt === undefined) return null;
      const restrictedShifts = normalizeActiveShifts(a.restrictedShifts, state);
      if (restrictedShifts === null) return null;
      return {
        op: "add_shift_prerequisite",
        shiftName: rawShiftName,
        attribute,
        prereqMinCount: cnt,
        restrictedShifts: restrictedShifts ?? ["E", "N"],
      };
    }
    case "add_shift_day_restriction": {
      if (!rawShiftName) return null;
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
          : a.dayRestriction === "weekday_only"
            ? [1, 2, 3, 4, 5]
            : undefined;
      if (!hasDateRange && !allowedDays) return null;
      return {
        op: "add_shift_day_restriction",
        shiftName: rawShiftName,
        allowedDaysOfWeek: allowedDays,
        startDay: rawStart !== undefined ? Math.min(rawStart, rawEnd!) : undefined,
        endDay: rawEnd !== undefined ? Math.max(rawStart!, rawEnd) : undefined,
      };
    }
    case "add_daily_shift_cap": {
      if (!rawShiftName) return null;
      let minStaff: number | undefined;
      let maxStaff: number | undefined;
      if (typeof a.staffCount === "number") {
        const cnt = a.staffCount;
        if (a.boundType === "exact") {
          minStaff = cnt;
          maxStaff = cnt;
        } else if (a.boundType === "min") {
          minStaff = cnt;
        } else {
          maxStaff = cnt;
        }
      } else {
        const rawMin =
          typeof a.minStaffPerDay === "number"
            ? a.minStaffPerDay
            : typeof a.minStaff === "number"
              ? a.minStaff
              : undefined;
        minStaff = rawMin !== undefined && rawMin > 0 ? rawMin : undefined;
        maxStaff =
          typeof a.maxStaffPerDay === "number"
            ? a.maxStaffPerDay
            : typeof a.maxStaff === "number"
              ? a.maxStaff
              : undefined;
      }
      if (minStaff === undefined && maxStaff === undefined) return null;
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const rawTargetAttr =
        typeof a.attribute === "string" && a.attribute.trim().length > 0
          ? a.attribute.trim()
          : undefined;
      let attribute: string | undefined;
      if (rawTargetAttr) {
        const resolved = resolveAttributeCodeAndLabel(rawTargetAttr, activeSkills);
        attribute = resolved.isUnknownCustomSkill ? rawTargetAttr : resolved.code;
      }
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
      return {
        op: "level_night_shifts",
        levelGroupBy: a.groupBy === "all" ? "all" : "skill",
      };
    case "none":
      return null;
    case "add_ng_pair": {
      if (!a.nurseA || !a.nurseB) return null;
      const shifts = normalizeActiveShifts(a.shifts, state);
      if (shifts === null) return null;
      return {
        op: "add_ng_pair",
        nurseNameOrId: String(a.nurseA),
        nurseBNameOrId: String(a.nurseB),
        shifts,
      };
    }
    case "add_preceptor_pair": {
      if (!a.newcomerNurse || !a.mentorNurse) return null;
      const shifts = normalizeActiveShifts(a.shifts, state);
      if (shifts === null) return null;
      return {
        op: "add_preceptor_pair",
        nurseNameOrId: String(a.newcomerNurse),
        nurseBNameOrId: String(a.mentorNurse),
        shifts,
      };
    }
    case "add_skill_def": {
      if (!a.skillName) return null;
      let substitutesFor: NurseSkill | undefined;
      if (typeof a.substitutesFor === "string" && a.substitutesFor.trim()) {
        const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
        substitutesFor = inferSkillCodeAndLabel(a.substitutesFor, activeSkills).code;
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
      let attribute: string | undefined;
      let nurseNameOrId: string | undefined;
      if (rawTarget) {
        if (/^全員$|^all$|^全$/i.test(rawTarget)) {
          attribute = "all";
        } else {
          const cleanedAttr = rawTarget.replace(/スタッフ|看護師|全員|層|たち/g, "").trim();
          const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
          const resolved = resolveAttributeCodeAndLabel(cleanedAttr || rawTarget, activeSkills);
          if (!resolved.isUnknownCustomSkill && !resolveNurseFromText(rawTarget, state.nurses)) {
            attribute = resolved.code;
          } else {
            nurseNameOrId = rawTarget;
          }
        }
      }
      return {
        op: "update_nurse_skill",
        skillName: String(a.skillName).trim(),
        skillAction: a.action === "remove" ? "remove" : "add",
        nurseNameOrId,
        attribute,
      };
    }
    case "set_staffing_rule": {
      if (!a.attribute && !a.skillName) return null;
      const rawAttr = String(a.attribute || a.skillName || "all").trim();
      const activeSkills = state.skillDefs ?? createDefaultSkillDefs();
      const resolvedAttr = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const attrValue = resolvedAttr.isUnknownCustomSkill ? rawAttr : resolvedAttr.code;
      const resolvedTarget = resolveTargetShiftsFromArg(
        a.targetShift || a.shiftName || a.shift,
        a.shifts,
        state
      );
      if (!resolvedTarget) return null;
      const { targetShift, shifts } = resolvedTarget;
      const minCount = typeof a.minCount === "number" ? a.minCount : undefined;
      const maxCount = typeof a.maxCount === "number" ? a.maxCount : undefined;
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

      if (
        (isMaxNight || isMinDaysOff || isMinWorkDays || isMaxWorkDays || isMaxConsecDays) &&
        val === undefined
      ) {
        return null;
      }

      const rawForbiddenShifts =
        isNightShiftOnly || isForbidLateNight || isForbidEvening || isAllowAll || isDayShiftOnly
          ? undefined
          : normalizeActiveShifts(a.forbiddenShifts, state);
      if (rawForbiddenShifts === null) return null;
      const forbiddenShifts: ActiveShiftCode[] | undefined =
        isNightShiftOnly
          ? ["D"]
          : isForbidLateNight
            ? ["N"]
            : isForbidEvening
              ? ["E"]
              : isAllowAll || isDayShiftOnly
                ? []
                : rawForbiddenShifts?.filter(
                    (s): s is ActiveShiftCode => s === "D" || s === "E" || s === "N"
                  );
      return {
        op: "set_nurse_contract",
        nurseNameOrId: String(a.nurseNameOrId),
        resetContract: isAllowAll ? true : undefined,
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
            ? val
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
            ? val
            : typeof a.minWorkDays === "number"
              ? a.minWorkDays
              : undefined,
        maxMonthlyWorkDays:
          isMaxWorkDays
            ? val
            : typeof a.maxWorkDays === "number"
              ? a.maxWorkDays
              : undefined,
        maxConsecutiveWorkDays:
          isMaxConsecDays
            ? val
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
    case "add_request_day":
    case "add_request":
    case "add_request_range": {
      if (!a.nurseNameOrId) return null;
      const days = resolveDaysFromToolArgs(a, state.config.numDays);
      if (days.length === 0) return null;
      const shift = resolveShiftCodeOrAliasFromInput(a.shift, state);
      if (!shift) return null;
      return {
        op: "add_request",
        nurseNameOrId: String(a.nurseNameOrId),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        shift,
        isHard: a.isHard !== false,
      };
    }
    case "add_calendar_request": {
      if (!a.nurseNameOrId) return null;
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
        shift,
        isHard: true,
        onlyMatchedDaysWork: onlyMatched,
        isCalendarPattern: true,
        reason,
      };
    }
    case "forbid_shift_day":
    case "forbid_shift":
    case "forbid_shift_range": {
      if (!a.nurseNameOrId) return null;
      const days = resolveDaysFromToolArgs(a, state.config.numDays);
      if (days.length === 0) return null;
      const forbidShifts = normalizeActiveShifts(a.shifts, state);
      if (forbidShifts === null) return null;
      return {
        op: "forbid_shift",
        nurseNameOrId: String(a.nurseNameOrId),
        day: days[0],
        days: days.length > 1 ? days : undefined,
        forbidShifts: forbidShifts ?? ["E", "N"],
      };
    }
    case "add_date_coverage":
      if (
        typeof a.day !== "number" ||
        typeof a.minStaff !== "number" ||
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
    `現在の設定: 平日日勤=${config.weekdayDayStaff}名, 土日日勤=${config.weekendDayStaff}名, 準夜=${config.eveningStaff}名, 深夜=${config.nightStaff}名`,
    `最大連勤=${config.maxConsecutiveWorkDays}日, 月間最低公休=${config.minMonthlyDaysOff}日, 月間夜勤上限=${config.maxMonthlyNightShifts}回`,
    `前月引継=${config.enforcePrevMonthCarryover ? "ON" : "OFF"}, スキル配置必須=${config.enforceSkillCoverage ? "ON" : "OFF"}, 深夜明け公休必須=${transMatrix.N.O === "require" ? "ON" : "OFF"}, プリセプター同行夜勤=${config.enforcePreceptorPairs ? "ON" : "OFF"}, 相性NGペア禁止=${config.enforceNgPairs ? "ON" : "OFF"}, 週末公休=${config.requireWeekendOff ? "ON" : "OFF"}`,
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
    const boundedQuestion = question.length > budget ? question.slice(-budget) : question;
    if (pendingClarification) {
      const original = pendingClarification.messages[0]!;
      const followUpBudget = Math.max(1, budget - original.length - 3);
      const boundedFollowUp =
        msg.length > followUpBudget ? msg.slice(-followUpBudget) : msg;
      pendingClarification.messages.push(boundedFollowUp);
      while (
        pendingClarification.messages.length > 2 &&
        pendingClarification.messages.join(" / ").length > budget
      ) {
        pendingClarification.messages.splice(1, 1);
      }
      pendingClarification.lastQuestion = boundedQuestion;
    } else {
      const maxInitialLen = Math.floor(budget / 2);
      const boundedInitial = msg.length > maxInitialLen ? msg.slice(-maxInitialLen) : msg;
      pendingClarification = {
        messages: [boundedInitial],
        lastQuestion: boundedQuestion,
      };
    }
  }

  function getCombinedHistoryLines(): string[] {
    if (!pendingClarification) {
      return [...recentTurnHistory];
    }
    const pendingLine = `・前回(未適用・回答待ち):「${pendingClarification.messages.join(" / ")}」➔ 聞き返し: ${pendingClarification.lastQuestion}`;
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
        pendingClarification = null;
        hadCustomState = false;
      } else if (hasCurrentCustom) {
        hadCustomState = true;
      }

      const historyLinesForTurn = getCombinedHistoryLines();

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
      let stage1RoutingFailed = false;
      try {
        const routerContextLines = [
          `対象月:${state.config.year}年${state.config.month}月(1〜${state.config.numDays}日)`,
          ...(historyLinesForTurn.length > 0
            ? [`【直近の対話履歴】`, ...historyLinesForTurn]
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
          stage1RoutingFailed = true;
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
          : [{ tool_type: "question", instruction: userMessage }];

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
        }
      }

      const traceLabels =
        activeRoutes.length > 0
          ? activeRoutes.map((r) => `${r.category}("${r.instruction}")`)
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

      if (activeRoutes.length === 0) {
        const reason: NonToolCategory = nonToolCategories.includes("unsupported")
          ? "unsupported"
          : nonToolCategories.includes("clarify")
            ? "clarify"
            : "question";
        lastNonToolReason = reason;
        if (reason === "clarify") {
          recordPendingClarification(userMessage, stage1Response);
        } else if (!stage1RoutingFailed) {
          // Only a genuine intent switch abandons the held request; a failed/aborted/unparseable
          // Stage 1 call synthesizes a fallback `question` route and must keep it for a retry.
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
          const dynamicDict = buildCategoryDynamicDictionary(
            category,
            workingState,
            `${userMessage} ${instruction} ${historyLinesForTurn.join(" ")}`
          );
          const dictNote = dynamicDict ? `${dynamicDict}\n` : "";
          const historyNote =
            historyLinesForTurn.length > 0
              ? `【直近の対話履歴】\n${historyLinesForTurn.join("\n")}\n`
              : "";
          const effectiveInstruction =
            activeRoutes.length > 1
              ? instruction
              : historyLinesForTurn.length > 0 && instruction && instruction !== userMessage
                ? `${userMessage}（文脈補完: ${instruction}）`
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
          previewAppliedLogs = ["リセット/クリア実行"];
        } else {
          const previewApplied = applyChatOperationsToState(state, operations);
          previewAppliedLogs = previewApplied.appliedLogs;
          if (previewApplied.appliedLogs.length > 0) {
            pendingClarification = null;
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
            .flatMap((o) => {
              const names: Array<string | undefined> = [];
              if ("nurseNameOrId" in o) names.push(o.nurseNameOrId);
              if ("nurseBNameOrId" in o) names.push(o.nurseBNameOrId);
              return names;
            })
            .filter((q): q is string => Boolean(q && !resolveNurseFromText(q, state.nurses)));
          const refusalMsg =
            unresolvedNurses.length > 0
              ? `指定されたスタッフ名（「${Array.from(new Set(unresolvedNurses)).join("・")}」）が病棟名簿に存在しないため、設定を変更できません。`
              : `ご指定の操作（「${userMessage}」）は適用対象が見つからないか本システムでは未対応のため、設定を変更できません。`;
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
          ? `ご指定の操作（「${userMessage}」）に対応する設定項目・ツールがないため、本システムでは未対応です。`
          : stage1Response;
      if (fallbackReason === "unsupported" && activeRoutes.length > 0) {
        pendingClarification = null;
        lastStage1Response = finalSummaryJa;
        routerTrace.push(
          `⚠️ Step 3 (Verification): 対応するツールが存在しないため未対応(unsupported)と判定`
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
            `   例: 「安全講習を追加して、新人は1回受けるまで夜勤不可にして」「院内勉強会を平日のみで1日最大2名まで」`,
            `3. シフト別の属性配置人数ルール・夜勤回数の平準化・ペア制限（相性NG / プリセプター同行夜勤）:`,
            `   例: 「日勤にA班を3人以上配置して」「役割やスキルごとに夜勤回数を均等化して」「N11とN18をNGペアにして」「プリセプター同行夜勤をONにして」`,
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
              `・スキル定義の追加/削除/代行設定、およびシフト別のスキル・属性配置人数ルール`,
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
              `実行ステータス: 設定変更 0件（回答待ちのため一括保留） / シフト再計算（ソルバー実行）: スキップ（未実行）`,
              `ユーザーの発言: 「${userMessage}」`,
              `一次判定メモ: ${lastStage1Response || "設定変更に必要な対象・日付・数値が不足しています。"}`,
              ``,
              `【現在の病棟設定】`,
              buildCompactStatePrompt(state),
              ``,
              `ユーザーの指示には、設定を変更するために必要な情報（誰の・何月何日の希望か、どの設定項目をいくつにするか等）が不足しているため、すべての設定変更およびシフト再計算（ソルバー実行）を一旦保留しました。「一次判定メモ」の内容に沿って、不足している情報を教えていただければ今回の要望とあわせて一括で設定・再計算する旨を簡潔に聞き返してください。`,
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
                    const shownDays =
                      csDays.length > 4
                        ? `${csDays.slice(0, 3).join("・")}他(計${csDays.length}回)`
                        : csDays.join("・");
                    samplePlacements.push(
                      `${n.name}(${cs.shortLabel}:${shownDays})`
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
      if (consultBaseSession && typeof consultBaseSession.clone === "function") {
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
    .replace(/シフト$/g, "")
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
    .replace(/シフト$/g, "")
    .trim();
  if (!clean) return null;
  if (clean === "D" || clean === "E" || clean === "N" || clean === "O") {
    return clean;
  }
  const existing = existingDefs.find(
    (d) =>
      d.code === clean ||
      d.label === clean ||
      d.shortLabel === clean ||
      d.label.includes(clean) ||
      clean.includes(d.label)
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
    .replace(/スキル|資格/g, "")
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
    skillDefs: [...(state.skillDefs ?? createDefaultSkillDefs())],
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
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const { code, shortLabel, label } = inferSkillCodeAndLabel(
        op.skillName,
        activeSkills
      );
      if (!label) continue;
      const existingIdx = activeSkills.findIndex(
        (s) => s.code === code || s.label === label
      );
      if (existingIdx >= 0 || findSkillOrAttributeDef(op.skillName, activeSkills)) {
        continue;
      }
      const substitutesFor = op.substitutesFor
        ? inferSkillCodeAndLabel(op.substitutesFor, activeSkills).code
        : undefined;
      const minDay =
        typeof op.skillMinDay === "number" ? Math.max(0, Math.round(op.skillMinDay)) : 0;
      const minEvening =
        typeof op.skillMinEvening === "number"
          ? Math.max(0, Math.round(op.skillMinEvening))
          : 0;
      const minNight =
        typeof op.skillMinNight === "number" ? Math.max(0, Math.round(op.skillMinNight)) : 0;

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
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const { code, label } = inferSkillCodeAndLabel(op.skillName, activeSkills);
      const targetDef = activeSkills.find(
        (s) => s.code === code || s.label === label || s.label.includes(op.skillName!)
      );
      if (!targetDef) continue;
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
        `スキル削除: 「${targetLabel}」をスキル定義および全スタッフの保有スキルから削除しました`
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
        continue;
      }
      const action = op.skillAction === "remove" ? "remove" : "add";
      const targetNurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      const targetAttr = op.attribute;
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
          ? `スタッフ全員(${countChanged}名)`
          : resolvedTargetMeta
            ? `${resolvedTargetMeta.label}(${countChanged}名)`
            : `対象スタッフ(${countChanged}名)`;
      appliedLogs.push(
        `スタッフスキル変更: ${whoLabel} にスキル「${label}(${shortLabel})」を${
          action === "add" ? "付与" : "解除"
        }しました`
      );
      continue;
    }

    if (op.op === "set_staffing_rule") {
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = op.attribute;
      if (!rawAttr) continue;
      const resolved = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const resolvedTarget = resolveTargetShiftsFromArg(
        op.targetShift,
        op.shifts,
        nextState
      );
      if (!resolvedTarget) continue;
      const { shifts } = resolvedTarget;
      const minCount =
        typeof op.minCount === "number" ? Math.max(0, Math.round(op.minCount)) : undefined;
      const maxCount =
        typeof op.maxCount === "number" ? Math.max(0, Math.round(op.maxCount)) : undefined;
      if (minCount === undefined && maxCount === undefined) continue;

      const shiftLabels = shifts
        .map((s) => getShiftMeta(s, nextState.customShiftDefs, nextState.shiftAliases).label)
        .join("・");
      const boundParts: string[] = [];
      if (typeof minCount === "number") boundParts.push(`下限${minCount}名以上`);
      if (typeof maxCount === "number") {
        boundParts.push(maxCount === 0 ? "上限0名(配置禁止)" : `上限${maxCount}名以下`);
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
        if (op.resetContract) {
          nextState = clearNurseContractFromState(nextState, targetNurse.id);
          changes.push("制限解除(標準契約に復帰)");
        }
        nextState.nurses = nextState.nurses.map((n) => {
          if (n.id !== targetNurse.id) return n;
          const updated = { ...n };
          if (typeof op.nightOk === "boolean" && !op.resetContract) {
            updated.nightOk = op.nightOk;
            changes.push(op.nightOk ? "夜勤可" : "日勤専従(夜勤免除)");
          }
          if (typeof op.maxMonthlyNightShifts === "number") {
            updated.maxMonthlyNightShifts = Math.max(0, Math.round(op.maxMonthlyNightShifts));
            changes.push(`月間夜勤上限=${updated.maxMonthlyNightShifts}回`);
          }
          if (typeof op.minMonthlyDaysOff === "number") {
            updated.minMonthlyDaysOff = Math.max(0, Math.round(op.minMonthlyDaysOff));
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
              changes.push("平日のみ勤務(土日休)");
            }
          }
          if (typeof op.holidaysOff === "boolean" && !op.resetContract) {
            updated.holidaysOff = op.holidaysOff || undefined;
            if (op.holidaysOff) {
              changes.push(op.weekdayOnly ? "土日祝休み" : "祝日休み");
            } else {
              changes.push("祝日休み解除");
            }
          }
          return updated;
        });
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
      nextState.config = applyShiftTransitionToConfig(nextState.config, from, to, policy);
      const policyLabel =
        policy === "forbid" ? "禁止" : policy === "require" ? "必須" : "許可";
      appliedLogs.push(
        `シフト遷移設定: 「${SHIFT_LABELS[from]}(${from}) → 翌日${SHIFT_LABELS[to]}(${to})」を ${policyLabel} に変更しました`
      );
      continue;
    }

    if (op.op === "add_preceptor_pair" && op.nurseNameOrId && op.nurseBNameOrId) {
      const nA = resolveNurseFromText(op.nurseNameOrId, nextState.nurses);
      const nB = resolveNurseFromText(op.nurseBNameOrId, nextState.nurses);
      if (nA && nB && nA.id !== nB.id) {
        const resolvedShifts = normalizeActiveShifts(op.shifts, nextState);
        if (resolvedShifts === null) continue;
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
          reason: "チャット指示によるプリセプター指導ペア設定",
        });
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
      for (const cs of [...nextState.customShiftDefs]) {
        nextState = removeCustomShiftFromState(nextState, cs.code);
      }
      nextState.customRules = [];
      nextState.customShiftDefs = [];
      nextState.relations = nextState.relations.filter(
        (r) =>
          !r.id?.startsWith("chat_ng_") &&
          !r.id?.startsWith("chat_preceptor_") &&
          r.reason !== "チャット指示によるプリセプター指導ペア設定"
      );
      appliedLogs.push("追加された個別カスタム制約および追加シフト種別をすべて解除しました");
      continue;
    }

    if (op.op === "add_custom_shift" && (op.shiftName || op.shift)) {
      const rawName = (op.shiftName || op.shift || "").trim();
      if (!rawName) continue;
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
        nextState.shiftAliases = createDefaultShiftAliases(nextState.customShiftDefs);
        appliedLogs.push(
          `新しいシフト種別「${finalShort}: ${label} (${timeRange}, 所属:${baseShift})」を追加しました`
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
        nextState.shiftAliases = createDefaultShiftAliases(nextState.customShiftDefs);
        appliedLogs.push(
          `シフト種別「${existingByLabel.shortLabel}: ${existingByLabel.label} (${existingByLabel.timeRange}, 所属:${baseShift})」を更新しました`
        );
      }
      continue;
    }

    if (op.op === "add_shift_quota") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) continue;

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const nurse = op.nurseNameOrId
        ? resolveNurseFromText(op.nurseNameOrId, nextState.nurses)
        : null;
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = nurse ? undefined : op.attribute;
      if (!nurse && !rawAttr) continue;

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

      const minCount = typeof op.minCount === "number" ? Math.round(op.minCount) : undefined;
      const maxCount = typeof op.maxCount === "number" ? Math.round(op.maxCount) : undefined;
      if (minCount === undefined && maxCount === undefined) continue;

      const countText =
        minCount !== undefined && maxCount !== undefined && minCount === maxCount
          ? `ちょうど${minCount}回`
          : minCount !== undefined && maxCount !== undefined
            ? `${minCount}〜${maxCount}回`
            : minCount !== undefined
              ? `${minCount}回以上`
              : `${maxCount}回以下`;

      const targetLabel = nurse
        ? `${nurse.name}(${nurse.id})`
        : attribute === "all"
          ? "スタッフ全員"
          : `${resolvedAttr?.label ?? getSkillMeta(String(attribute), activeSkills).label}全員`;

      // Replace any previous quota rule for the same target and shift
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
        description: `${targetLabel}は「${meta.label}」を月${countText}取得する`,
      };
      nextState.customRules.push(rule);
      appliedLogs.push(`シフト回数ルール追加: ${rule.description}`);
      continue;
    }

    if (op.op === "add_shift_day_restriction") {
      const shiftCode = resolveExistingShiftCode(
        op.shiftName || op.shift,
        nextState.customShiftDefs
      );
      if (!shiftCode) continue;

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
          : undefined;
      if (!hasDateBounds && !allowedDays) continue;

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
      const restrictionLabel = descParts.join("・");

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
      const prereqCode = resolveExistingShiftCode(
        op.shiftName || op.prereqShift || op.shift,
        nextState.customShiftDefs
      );
      if (!prereqCode) continue;

      const meta = getShiftMeta(prereqCode, nextState.customShiftDefs);
      const activeSkills = nextState.skillDefs ?? createDefaultSkillDefs();
      const rawAttr = op.attribute;
      const rawK = typeof op.prereqMinCount === "number" ? op.prereqMinCount : undefined;
      if (!rawAttr || rawK === undefined) continue;
      const resolvedAttr = resolveAttributeCodeAndLabel(rawAttr, activeSkills);
      const attribute =
        rawAttr === "all"
          ? "all"
          : !resolvedAttr.isUnknownCustomSkill
            ? resolvedAttr.code
            : rawAttr;
      const kReq = Math.max(1, Math.round(rawK));
      const resolvedRestricted = normalizeActiveShifts(op.restrictedShifts, nextState);
      if (resolvedRestricted === null) continue;
      const restricted: ShiftCode[] = resolvedRestricted ?? ["E", "N"];
      const targetLabel =
        attribute === "all"
          ? "スタッフ全員"
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
        description: `先行条件ルール: ${targetLabel}は「${meta.label}」を${kReq}回受けた翌営業日以降でないと夜勤(準夜・深夜)に入れない`,
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
      if (!shiftCode) continue;

      const meta = getShiftMeta(shiftCode, nextState.customShiftDefs);
      const maxStaff =
        typeof op.maxStaff === "number" ? Math.max(0, Math.round(op.maxStaff)) : undefined;
      const minStaff =
        typeof op.minStaff === "number" ? Math.max(0, Math.round(op.minStaff)) : undefined;
      if (minStaff === undefined && maxStaff === undefined) continue;
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
            ? `1日あたり配置人数ルール: 「${meta.label}」に毎日${rolePrefix}${maxStaff}名をアサイン`
            : maxStaff !== undefined
              ? `1日あたり配置人数ルール: 「${meta.label}」に毎日${rolePrefix}${minStaff}〜${maxStaff}名を配置`
              : `1日あたり配置人数ルール: 「${meta.label}」に毎日${rolePrefix}${minStaff}名以上を配置`
          : `1日あたり人数上限ルール: 「${meta.label}」は1日に${rolePrefix}最大${maxStaff}名まで`;

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
        startDay: typeof op.startDay === "number" ? op.startDay : undefined,
        endDay: typeof op.endDay === "number" ? op.endDay : undefined,
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
      if (!shiftCode) continue;

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
        levelGroupBy: op.levelGroupBy || "skill",
        description:
          "夜勤平準化ルール: スキル・属性グループ（リーダー・中堅・新人・救急スキル等）ごとに月間の夜勤回数(準夜・深夜)のばらつきを最小化して均等化する",
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
        const paramLabels: Record<string, string> = {
          weekdayDayStaff: "平日・日勤の必要人数",
          weekendDayStaff: "土日・日勤の必要人数",
          eveningStaff: "準夜勤の必要人数",
          nightStaff: "深夜勤の必要人数",
          maxConsecutiveWorkDays: "最大連続勤務日数",
          minMonthlyDaysOff: "月間最低公休日数",
          minMonthlyWorkDays: "月間最低勤務日数",
          maxMonthlyNightShifts: "月間夜勤(準夜+深夜)上限回数",
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
        enforcePrevMonthCarryover: "前月末シフトからの連続性・連勤引き継ぎ",
        enforceSkillCoverage: "スキル・属性ごとの配置人数ルール",
        enforcePreceptorPairs: "プリセプター同行夜勤(新人の夜勤時に指導者も同シフト配置)",
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
      const resolvedShift = resolveShiftCodeOrAliasFromInput(op.shift ?? "O", nextState);
      if (!resolvedShift) continue;
      const shift: ShiftCode = resolvedShift;
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
                : shift === "EN"
                  ? "夜勤(準夜・深夜)"
                  : shift === "E"
                    ? "準夜勤(E)"
                    : shift === "N"
                      ? "深夜勤(N)"
                      : `${customOrAliasMeta.label}(${customOrAliasMeta.shortLabel})`;
        const reasonLabel = op.reason || "チャット指示";
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
        const resolvedShifts = normalizeActiveShifts(op.forbidShifts, nextState);
        if (resolvedShifts === null) continue;
        const shifts: ShiftCode[] = resolvedShifts ?? ["E", "N"];
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
        const resolvedShifts = normalizeActiveShifts(op.shifts, nextState);
        if (resolvedShifts === null) continue;
        const targetShifts: ShiftCode[] = resolvedShifts ?? ["E", "N"];
        const shiftDesc =
          targetShifts.length === 3
            ? "全シフト(日勤・準夜・深夜)"
            : targetShifts.length === 2 &&
                targetShifts.includes("E") &&
                targetShifts.includes("N")
              ? "同夜勤(準夜・深夜)"
              : `[${targetShifts.join("/")}] シフト`;
        nextState.relations = nextState.relations.filter(
          (r) =>
            !(
              r.type === "ng_pair" &&
              ((r.nurseA === nA.id && r.nurseB === nB.id) ||
                (r.nurseA === nB.id && r.nurseB === nA.id))
            )
        );
        const description = `相性NGペア追加: ${nA.name}(${nA.id}) × ${nB.name}(${nB.id}) の${shiftDesc}同時配置を禁止`;
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
      }
    }
  }

  return { updatedState: nextState, appliedLogs };
}
