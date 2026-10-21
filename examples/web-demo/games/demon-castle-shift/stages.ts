import { ALL_PAIR_RELATIONS, MONSTERS, getEffectivePower } from "./characters.js";
import {
  ALL_MONSTER_IDS,
  type ActiveShiftType,
  type DayIndex,
  type DifficultyTier,
  type MonsterId,
  type RequestedDayOff,
  type ShiftSlotRequirement,
  type StagePlayRecord,
  type StageScenario,
} from "./types.js";

const DAY_ENEMIES = [
  { raidTitle: "先遣隊の偵察", enemyName: "先遣隊・剣士＆弓兵班", enemyIcon: "🗡️", enemyQuote: "街の被害を止めるため、門の守りを確かめる。" },
  { raidTitle: "騎士団の進軍", enemyName: "王国軍・重装盾兵団", enemyIcon: "🛡️", enemyQuote: "正面から押し通る。退いてもらうぞ。" },
  { raidTitle: "魔導部隊の遠征", enemyName: "勇者軍・紅蓮魔導団", enemyIcon: "🔥", enemyQuote: "これ以上、街の近くに魔物を置くわけにはいかない。" },
  { raidTitle: "弓兵部隊の接近", enemyName: "森林部隊・長弓狙撃団", enemyIcon: "🏹", enemyQuote: "森の木立から狙い撃つ。隙は見逃さない。" },
  { raidTitle: "教国軍の進軍", enemyName: "教国軍・聖堂騎士団", enemyIcon: "✨", enemyQuote: "人々の暮らしを守るため、この砦を封じる。" },
];

const NIGHT_ENEMIES = [
  { raidTitle: "夜間の潜入", enemyName: "討伐軍・夜間斥候班", enemyIcon: "🗝️", enemyQuote: "夜陰に紛れて裏門の鍵を外すぞ。" },
  { raidTitle: "裏門への接近", enemyName: "裏門工作・隠密小隊", enemyIcon: "🥷", enemyQuote: "見張りの交代時を狙う。音を立てるな。" },
  { raidTitle: "月下の奇襲", enemyName: "勇者軍・月下狩猟団", enemyIcon: "🌕", enemyQuote: "月の明かりがあるうち一気に駆け抜ける。" },
  { raidTitle: "水路からの侵入", enemyName: "水路潜入・忍び分隊", enemyIcon: "🐾", enemyQuote: "水路の隙間から城内へ潜り込む。" },
  { raidTitle: "本隊の夜間強襲", enemyName: "勇者一行・精鋭本隊", enemyIcon: "👑", enemyQuote: "すべての決着をつける。門を開けてもらうぞ。" },
];

const HEAVY_POOL: readonly MonsterId[] = ["drago", "golem", "behemoth", "ifrit"];
const DAY_POOL: readonly MonsterId[] = ["fenrir", "garuda", "centaur", "griffon"];
const NIGHT_POOL: readonly MonsterId[] = ["carmilla", "lich", "morgan", "banshee"];
const KNIGHT_POOL: readonly MonsterId[] = ["dullahan", "gargoyle", "minotaur", "arachne"];
const ROOKIE_POOL: readonly MonsterId[] = ["pururu", "mandra", "mimic", "wisp"];

/**
 * 魔王城の暦名と年月計算（プレイ日時の1073年前を起点とし、ステージが進むごとに翌月へ進む）
 */
export const CALENDAR_ERA_NAME = "星月暦";
export const CALENDAR_YEAR_OFFSET = 1073;

export function getCastleCalendarYearMonth(
  monthNumberOneBased: number,
  refDate: Date = new Date()
): { eraName: string; year: number; month: number } {
  const baseYear = refDate.getFullYear() - CALENDAR_YEAR_OFFSET;
  const baseMonthIndex = refDate.getMonth(); // 0..11
  const totalMonths = baseYear * 12 + baseMonthIndex + Math.max(0, monthNumberOneBased - 1);
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { eraName: CALENDAR_ERA_NAME, year, month };
}

export function formatCastleCalendarMonth(
  monthNumberOneBased: number,
  includeEra = false,
  refDate: Date = new Date()
): string {
  const { eraName, year, month } = getCastleCalendarYearMonth(monthNumberOneBased, refDate);
  return includeEra ? `${eraName} ${year}年${month}月` : `${month}月`;
}

/**
 * エンドレス進行（STAGE 6〜）の難易度ティア別チューニングパラメータ
 * - `numDays`: シフト表の日数（3〜5日）
 * - `rosterSize`: 今週の正門当番として招集される人数（3〜7人。高難度では敵も強く6〜7人態勢になる）
 * - `slackPower`: 生成された見本シフトの防衛力からどれだけ差し引いて安全上限を作るか
 * - `maxPtoCount`: 指定休の最大人数
 * - `fullMoonCount`: 満月夜の発生数
 */
export const ENDLESS_TIER_CONFIG: Record<
  DifficultyTier,
  {
    label: string;
    numDays: number;
    rosterSize: number;
    slackPower: number;
    maxPtoCount: number;
    fullMoonCount: number;
  }
> = {
  1: { label: "穏やか（3人当番）", numDays: 3, rosterSize: 3, slackPower: 100, maxPtoCount: 0, fullMoonCount: 0 },
  2: { label: "控えめ（4人当番）", numDays: 4, rosterSize: 4, slackPower: 100, maxPtoCount: 1, fullMoonCount: 0 },
  3: { label: "標準（5人当番）", numDays: 5, rosterSize: 5, slackPower: 100, maxPtoCount: 2, fullMoonCount: 1 },
  4: { label: "熟練（6人拡大当番）", numDays: 5, rosterSize: 6, slackPower: 50, maxPtoCount: 2, fullMoonCount: 1 },
  5: { label: "極限（7人総力当番）", numDays: 5, rosterSize: 7, slackPower: 0, maxPtoCount: 3, fullMoonCount: 2 },
};

export const CAMPAIGN_STAGES: readonly StageScenario[] = [
  {
    id: "week-1",
    weekNumber: 1,
    numDays: 3,
    title: `${formatCastleCalendarMonth(1)}：先遣隊の偵察（3日間）`,
    subtitle: `${formatCastleCalendarMonth(1, true)} — まずは3日間、3人の警備メンバーを得意な時間帯へ配置して守る。`,
    newRuleTitle: "基本ルール：得意な時間帯とドラゴの休養",
    newRuleSummary:
      "フェンリルは昼（防衛力400）、カーミラは夜（防衛力400）が得意です。ドラゴ（防衛力500）は昼も夜も頼りになりますが、1日働いたら翌日は必ず「休」にする必要があります。",
    lilithIntro:
      "初めてのシフト編成ですので、最初は私と一緒に組んでみましょう。まずは月曜から水曜までの3日間、3名で敵の先遣部隊に備えます。",
    lilithHint:
      "手強い部隊が来る月曜の昼と水曜の夜にドラゴ（防衛力500）を配置し、間の火曜日はドラゴを休ませます。残りの昼をフェンリル（400）、夜をカーミラ（400）に任せれば盤石な守りになります。",
    availableMonsters: ["drago", "fenrir", "carmilla"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "月曜・昼 先遣重装隊", enemyName: "先遣隊・重装前衛群", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "人間の街を守るため、この森の砦を調査する。" },
      { day: 0, shift: "night", raidTitle: "月曜・夜 夜間偵察", enemyName: "先遣隊・夜間斥候班", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "夜のうちに城門の手薄な場所を探るぞ。" },
      { day: 1, shift: "day", raidTitle: "火曜・昼 森林調査", enemyName: "王国軍・歩兵巡回隊", enemyIcon: "🛡️", requiredPower: 400, minStaff: 1, enemyQuote: "日中の見回り隊だ。前方の門を突破する。" },
      { day: 1, shift: "night", raidTitle: "火曜・夜 隠密接近", enemyName: "討伐軍・夜襲工作班", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "足音を消して近づけ。見張りを抜くぞ。" },
      { day: 2, shift: "day", raidTitle: "水曜・昼 強行偵察", enemyName: "王国軍・森林弓兵団", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "矢の届く距離まで踏み込む。構えろ。" },
      { day: 2, shift: "night", raidTitle: "水曜・夜 魔導奇襲", enemyName: "勇者軍・紅蓮魔導団", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "魔導の火で夜の城門をこじ開ける。" },
    ],
    requestedDaysOff: [],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) => r.id === "drago_fenrir_train"),
    tutorialSteps: [
      {
        monsterId: "drago",
        day: 0,
        targetShift: "day",
        shortCallout: "まずは一緒に組みましょう。月曜・昼はドラゴの「昼」を押します",
        instruction: "最初は私と一緒に組んでみましょう（1/6）。月曜の昼は手強い「先遣隊・重装前衛群」が来ますので、防衛力500のドラゴの月曜のマスで「昼」を選んでみてください。",
      },
      {
        monsterId: "carmilla",
        day: 0,
        targetShift: "night",
        shortCallout: "次は月曜・夜です。夜番400のカーミラの「夜」を押しましょう",
        instruction: "いいですね（2/6）。月曜の夜は、夜番が得意なカーミラ（夜400）にお願いしましょう。カーミラの月曜のマスで「夜」を選んでみてください。",
      },
      {
        monsterId: "fenrir",
        day: 1,
        targetShift: "day",
        shortCallout: "火曜はドラゴのお休みです。昼400のフェンリルの「昼」を押しましょう",
        instruction: "順調です（3/6）。ドラゴは1日働くと翌日お休みが必要なので、火曜の昼は昼番が得意なフェンリル（昼400）の「昼」を選びましょう。",
      },
      {
        monsterId: "carmilla",
        day: 1,
        targetShift: "night",
        shortCallout: "火曜・夜もカーミラの「夜」を押しましょう",
        instruction: "その調子です（4/6）。火曜の夜も、引き続きカーミラに任せましょう。カーミラの火曜のマスで「夜」を選んでみてください。",
      },
      {
        monsterId: "fenrir",
        day: 2,
        targetShift: "day",
        shortCallout: "水曜・昼もフェンリルの「昼」を押しましょう",
        instruction: "あと少しです（5/6）。水曜の昼も、昼番が得意なフェンリルの水曜のマスで「昼」を選びましょう。",
      },
      {
        monsterId: "drago",
        day: 2,
        targetShift: "night",
        shortCallout: "仕上げに、火曜休んだドラゴの水曜「夜」を押せば完成です",
        instruction: "最後の仕上げです（6/6）。水曜の夜は手強い「勇者軍・紅蓮魔導団」が来ますので、火曜日に休んで体力が戻ったドラゴの水曜のマスで「夜」を選べば完成です。",
      },
    ],
    clearQuotes: {
      drago: "中日に休めたおかげで、古傷も痛まず最後まで体が持ったぞ。",
      fenrir: "昼間の見回りなら視界もいいし、落ち着いて対応できたよ。",
      carmilla: "夜の静かな時間帯に集中できましたわ。悪くない采配ですわね。",
    },
  },
  {
    id: "week-2",
    weekNumber: 2,
    numDays: 3,
    title: `${formatCastleCalendarMonth(2)}：夜襲部隊の接近（3日間）`,
    subtitle: "外郭からデュラハンが合流。相性ペア（+100）と「一緒に働きたくない相手（-150）」に注意する。",
    newRuleTitle: "追加ルール：夜番の翌朝は昼番不可・ペアの相性と同番拒否",
    newRuleSummary:
      "夜番に入ったメンバーは、翌朝すぐに昼番へ入ることができません（夜→夜は可能です）。また、仲の良い2人（フェンリル＋デュラハン）を同じ枠に並べると連携で防衛力が +100 上がりますが、「あの人とは一緒に働きたくない」という不仲ペア（カーミラ＋デュラハン）を同じ枠に入れると口論になり防衛力が -150 下がります。",
    lilithIntro:
      "今月はドラゴが裏門の当番へ回り、代わりに重装騎士デュラハンが正門当番に入りました。ただ、カーミラは堅物のデュラハンと同じ番に入るのを嫌がるので、別の時間帯に分けてあげてください。",
    lilithHint:
      "月曜の昼はフェンリル（昼400）とデュラハン（昼300）を並べると、連携ボーナス（+100）が加わって防衛力800になり余裕をもって守れます。",
    availableMonsters: ["fenrir", "carmilla", "dullahan"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "月曜・昼 正門への進軍", enemyName: "王国軍・重装歩兵団", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "正面から盾を並べて進む。門を開けろ。" },
      { day: 0, shift: "night", raidTitle: "月曜・夜 夜間潜入", enemyName: "討伐軍・夜間斥候班", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "夜番の隙を突いて城壁を越えるぞ。" },
      { day: 1, shift: "day", raidTitle: "火曜・昼 巡回部隊", enemyName: "王国軍・外縁巡回隊", enemyIcon: "🛡️", requiredPower: 400, minStaff: 1, enemyQuote: "森の外縁から順番に制圧していく。" },
      { day: 1, shift: "night", raidTitle: "火曜・夜 隠密接近", enemyName: "討伐軍・隠密工作小隊", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "今夜は吸血鬼が非番らしい。好機だ。" },
      { day: 2, shift: "day", raidTitle: "水曜・昼 斥候調査", enemyName: "討伐軍・前衛剣士隊", enemyIcon: "🗡️", requiredPower: 400, minStaff: 1, enemyQuote: "連日の攻防で城の守りも疲れているはずだ。" },
      { day: 2, shift: "night", raidTitle: "水曜・夜 夜間強襲", enemyName: "勇者軍・夜間強襲団", enemyIcon: "⚔️", requiredPower: 600, minStaff: 2, enemyQuote: "二方向から同時に仕掛ける。突破するぞ。" },
    ],
    requestedDaysOff: [
      { monsterId: "carmilla", day: 1, reason: "休息日" },
    ],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) =>
      ["fenrir_dullahan_patrol", "carmilla_dullahan_clash"].includes(r.id)
    ),
    clearQuotes: {
      dullahan: "夜番明けの休息が守られていれば、鎧の重みも苦にはならん。",
      fenrir: "デュラハンさんと一緒の見回りは、背中を預けられて安心だったよ。",
      carmilla: "堅苦しい騎士と顔を合わせずに済んで、快適に夜番ができましたわ。",
    },
  },
  {
    id: "week-3",
    weekNumber: 3,
    numDays: 4,
    title: `${formatCastleCalendarMonth(3)}：4日間の包囲（4日間）`,
    subtitle: "地下水路から新米スライムのプルルが合流。4日間のシフトを組む。",
    newRuleTitle: "追加ルール：新米の夜間配置と連続勤務の上限",
    newRuleSummary:
      "新米のプルル（防衛力200）は、夜番にひとりで配置することができません（他の仲間と同じ夜番に並べれば配置でき、カーミラと組むと連携で +100 上がります）。また、どのメンバーも最大3連勤までで、4日間のうち最低1日は休みが必要です。",
    lilithIntro:
      "敵の部隊が森の周囲に陣を張り、4日間の長期戦になりました。今月は地下水路の清掃当番から新米のプルルが応援に加わります。プルルを夜に出すときは、必ず先輩と一緒にしてあげてください。",
    lilithHint:
      "木曜の夜にカーミラ（夜400）とプルル（夜200）を一緒に配置すると、連携ボーナス（+100）も加わって防衛力700になり盤石です。",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "月曜・昼 先遣隊の進軍", enemyName: "王国軍・包囲歩兵団", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "4日かけて包囲を縮める。まずは正門からだ。" },
      { day: 0, shift: "night", raidTitle: "月曜・夜 精鋭の夜襲", enemyName: "勇者軍・精鋭夜襲隊", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "闇に紛れて一気に門番を討つ。" },
      { day: 1, shift: "day", raidTitle: "火曜・昼 斥候の接近", enemyName: "討伐軍・水路偵察班", enemyIcon: "🗡️", requiredPower: 200, minStaff: 1, enemyQuote: "水路の入り口を調べる。少人数でいい。" },
      { day: 1, shift: "night", raidTitle: "火曜・夜 水路の警戒", enemyName: "水路潜入・忍び分隊", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "地下水路から音もなく忍び込むぞ。" },
      { day: 2, shift: "day", raidTitle: "水曜・昼 魔導部隊の攻撃", enemyName: "勇者軍・攻城魔導団", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "全魔力を集中する。城門の結界を砕け。" },
      { day: 2, shift: "night", raidTitle: "水曜・夜 夜間の見回り", enemyName: "討伐軍・月下狩猟団", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "夜霧が濃い。今のうちに柵を越える。" },
      { day: 3, shift: "day", raidTitle: "木曜・昼 城門の防衛", enemyName: "王国軍・森林弓兵団", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "包囲の最終日だ。休む暇を与えるな。" },
      { day: 3, shift: "night", raidTitle: "木曜・夜 裏門の防衛", enemyName: "討伐軍・裏門突入隊", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "最後の夜だ。裏門へ総員で突入する。" },
    ],
    requestedDaysOff: [
      { monsterId: "fenrir", day: 1, reason: "休息日" },
      { monsterId: "pururu", day: 2, reason: "水辺での休養" },
    ],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) =>
      ["carmilla_pururu_love", "drago_fenrir_train"].includes(r.id)
    ),
    clearQuotes: {
      pururu: "カーミラさんや先輩方が近くにいてくださったので、夜も落ち着いて見張れました。",
      carmilla: "プルルは素直で助かりますわ。夜の見回りも退屈しませんでした。",
      drago: "4日間となると休みの配分が肝心だな。いい回り方だったぞ。",
    },
  },
  {
    id: "week-4",
    weekNumber: 4,
    numDays: 5,
    title: `${formatCastleCalendarMonth(4)}：満月の攻防（5日間・5名当番）`,
    subtitle: "5名態勢で5日間のシフトへ。水曜の満月とメンバー間の相性・不仲に対処する。",
    newRuleTitle: "追加ルール：満月の夜と週の出勤上限",
    newRuleSummary:
      "満月の夜（水曜・夜）は、フェンリルを夜番に配置できません（水曜の昼は配置可能です）。また5日間のうち、ドラゴは最大3回、他のメンバーは最大4回までが出勤上限となります。",
    lilithIntro:
      "今月の正門当番は5名です。水曜の夜は満月のため、フェンリルは夜番に出られません。カーミラとデュラハンの不仲（-150）を避けつつ、それぞれの指定休も確認しながら組み立てましょう。",
    lilithHint:
      "水曜の満月夜はフェンリルが出られないため、カーミラ・デュラハン・プルル・ドラゴの中から2人を充てます。カーミラとデュラハンを同じシフトに入れると防衛力が -150 下がるので、プルルをうまく組み合わせるのが要です。",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu", "dullahan"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "月曜・昼 正門防衛", enemyName: "王国軍・白銀歩兵団", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "第一陣、前へ。人間の街にこれ以上被害は出させない。" },
      { day: 0, shift: "night", raidTitle: "月曜・夜 裏門夜警", enemyName: "討伐軍・夜間斥候隊", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "夜の森を抜けて裏門へ回り込め。" },
      { day: 1, shift: "day", raidTitle: "火曜・昼 攻城部隊接近", enemyName: "勇者軍・重装破城団", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "破城槌を運べ。門を押し開けるぞ。" },
      { day: 1, shift: "night", raidTitle: "火曜・夜 夜間奇襲", enemyName: "討伐軍・隠密工作隊", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "静かに進め。見張りの死角を突く。" },
      { day: 2, shift: "day", raidTitle: "水曜・昼 魔導射撃", enemyName: "王国軍・魔導砲撃隊", enemyIcon: "✨", requiredPower: 300, minStaff: 1, enemyQuote: "遠距離から牽制する。夜の本隊に繋ぐぞ。" },
      { day: 2, shift: "night", raidTitle: "水曜・夜 満月の攻防", enemyName: "勇者軍・月下狩猟団", enemyIcon: "🌕", requiredPower: 600, minStaff: 2, isFullMoon: true, isBossRaid: true, enemyQuote: "満月の夜なら人狼は出られないはずだ。今が好機だ。" },
      { day: 3, shift: "day", raidTitle: "木曜・昼 大橋の防衛", enemyName: "王国軍・大橋狙撃隊", enemyIcon: "🏹", requiredPower: 600, minStaff: 2, enemyQuote: "渓流の大橋を渡り切るぞ。援護せよ。" },
      { day: 3, shift: "night", raidTitle: "木曜・夜 水路の警戒", enemyName: "討伐軍・水路工作班", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "水路の鉄格子を狙う。手早く済ませるぞ。" },
      { day: 4, shift: "day", raidTitle: "金曜・昼 先鋒部隊の突撃", enemyName: "勇者軍・先鋒騎士団", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "我が槍で道を切り開く。総員、続け。" },
      { day: 4, shift: "night", raidTitle: "金曜・夜 夜間包囲戦", enemyName: "討伐軍・夜間包囲隊", enemyIcon: "⚔️", requiredPower: 600, minStaff: 2, enemyQuote: "週の終わりで守備兵も疲弊しているはずだ。" },
    ],
    requestedDaysOff: [
      { monsterId: "drago", day: 0, reason: "古傷の療養日" },
      { monsterId: "carmilla", day: 3, reason: "休息日" },
      { monsterId: "dullahan", day: 1, reason: "武具の手入れ" },
    ],
    activeRelations: [...ALL_PAIR_RELATIONS],
    clearQuotes: {
      fenrir: "満月の夜を外してもらえて助かったよ。その分、昼の見回りに集中できた。",
      dullahan: "5人の役割がはっきりしていて、長丁場でも乱れのない守りだった。",
      pururu: "5日間のシフトでも、お休みがあると最後まで元気にお仕事できますね。",
    },
  },
  {
    id: "week-5",
    weekNumber: 5,
    numDays: 5,
    title: `${formatCastleCalendarMonth(5)}：勇者本隊の進軍（5日間・6名拡大当番）`,
    subtitle: "勇者本隊の接近に伴い、地下書庫からリッチが加わり6名態勢へ。不仲ペアを避けて総力防衛する。",
    newRuleTitle: "決戦の月：6名拡大シフトと不仲ペアの調整",
    newRuleSummary:
      "敵の本隊に対抗するため、地下書庫から司書長リッチ（夜400）が応援に加わり6名態勢になります。ただしリッチは大雑把なドラゴと同じ番に入るのを嫌がり（-150）、カーミラもデュラハンとの同番を嫌がります（-150）。金曜・夜の勇者本隊（必要人数3人）に主力を残せるよう配分してください。",
    lilithIntro:
      "敵の本隊がついに動き出しました。今月は特別に地下書庫からリッチも呼び、6名で正門を守ります。ドラゴとリッチ、カーミラとデュラハンがそれぞれ同じ番にならないよう配慮しつつ、金曜の夜を3人で守り抜きましょう。",
    lilithHint:
      "夜番が得意なメンバーがカーミラ・デュラハン・リッチの3人に増えています。ドラゴを月曜（昼）・水曜（昼）・金曜（夜）の3枠に充て、金曜の夜はドラゴ＋カーミラ＋プルル（またはデュラハン＋プルル）で組むとリッチとドラゴの反発を避けられます。",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu", "dullahan", "lich"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "月曜・昼 本隊先鋒の進軍", enemyName: "勇者軍・先鋒重装団", enemyIcon: "🔥", requiredPower: 800, minStaff: 2, isBossRaid: true, enemyQuote: "勇者本隊の先鋒、推して参る。" },
      { day: 0, shift: "night", raidTitle: "月曜・夜 夜間魔導砲撃", enemyName: "勇者軍・高位魔導団", enemyIcon: "✨", requiredPower: 700, minStaff: 2, enemyQuote: "夜空から魔導弾を撃ち込む。ひるむな。" },
      { day: 1, shift: "day", raidTitle: "火曜・昼 弓兵部隊の斉射", enemyName: "王国軍・精鋭弓騎団", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "足並みを乱させろ。本隊の到着まで圧力をかけ続ける。" },
      { day: 1, shift: "night", raidTitle: "火曜・夜 隠密部隊の潜入", enemyName: "討伐軍・隠密本隊", enemyIcon: "🥷", requiredPower: 700, minStaff: 2, enemyQuote: "裏門と水路の双方から同時に揺さぶりをかける。" },
      { day: 2, shift: "day", raidTitle: "水曜・昼 親衛隊の進軍", enemyName: "教国軍・聖堂親衛隊", enemyIcon: "🔥", requiredPower: 800, minStaff: 2, isBossRaid: true, enemyQuote: "人間の街の平穏のため、この森の城を落とす。" },
      { day: 2, shift: "night", raidTitle: "水曜・夜 満月の夜襲", enemyName: "勇者軍・月下狩猟団", enemyIcon: "🌕", requiredPower: 600, minStaff: 2, isFullMoon: true, enemyQuote: "満月の光の下、守りの薄い所を突く。" },
      { day: 3, shift: "day", raidTitle: "木曜・昼 攻城部隊の接近", enemyName: "王国軍・攻城重砲隊", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "城門の前まで陣を押し上げろ。" },
      { day: 3, shift: "night", raidTitle: "木曜・夜 水路の最終警戒", enemyName: "討伐軍・夜間工兵隊", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "明日の決戦に備えて城壁の足場を崩す。" },
      { day: 4, shift: "day", raidTitle: "金曜・昼 前衛部隊の突破", enemyName: "勇者軍・前衛突破隊", enemyIcon: "🔥", requiredPower: 400, minStaff: 1, enemyQuote: "夜には勇者本隊が着く。門番を引きつけろ。" },
      { day: 4, shift: "night", raidTitle: "金曜・夜 勇者本隊の総攻撃", enemyName: "勇者一行・決戦本隊", enemyIcon: "👑", requiredPower: 1000, minStaff: 3, isBossRaid: true, enemyQuote: "これが最後の攻防だ。全軍、正門へ突撃する。" },
    ],
    requestedDaysOff: [
      { monsterId: "carmilla", day: 2, reason: "休息日" },
      { monsterId: "dullahan", day: 1, reason: "武具の点検" },
      { monsterId: "lich", day: 4, reason: "書庫の目録整理" },
    ],
    activeRelations: [...ALL_PAIR_RELATIONS],
    clearQuotes: {
      drago: "金曜の夜まで力を温存できたおかげで、本隊相手にも一歩も引かずに済んだぞ。",
      carmilla: "誰ひとり倒れることなく、静かな夜を取り戻せましたわね。",
      fenrir: "みんなの力が噛み合って、最後まで気持ちよく守れたよ。",
      dullahan: "見事な采配だった。この城と森の平穏は守られた。",
      pururu: "私たちの魔王城、みんなで守り切れましたね。",
      lich: "ドラゴ殿と鉢合わせしないシフトのおかげで、落ち着いて障壁を展開できましたよ。",
    },
  },
];

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFromPool<T>(pool: readonly T[], rng: () => number, exclude: Set<T> = new Set()): T {
  const candidates = pool.filter((item) => !exclude.has(item));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(rng() * source.length)];
}

export function getDifficultyLabel(tier: DifficultyTier): string {
  return ENDLESS_TIER_CONFIG[tier].label;
}

/**
 * Computes an adaptive difficulty tier (1..5) from the player's recent performance history
 * (ranks achieved, hints used, and failed attempts).
 */
export function computeAdaptiveDifficultyTier(
  history: readonly StagePlayRecord[],
  weekNumber = 6
): DifficultyTier {
  if (history.length === 0) {
    return 3;
  }
  const recent = history.slice(-4);
  let perfSum = 0;
  for (const rec of recent) {
    const rankScore = rec.rank === "S" ? 0.9 : rec.rank === "A" ? 0.2 : -0.6;
    const hintPenalty = Math.min(1.2, rec.hintsUsed * 0.35);
    const failPenalty = Math.min(1.2, rec.failedAttempts * 0.4);
    perfSum += rankScore - hintPenalty - failPenalty;
  }
  const avgPerf = perfSum / recent.length;
  const weekProgression = Math.min(0.75, Math.max(0, weekNumber - 6) * 0.15);
  const rawTier = Math.round(2.8 + weekProgression + avgPerf);
  return Math.max(1, Math.min(5, rawTier)) as DifficultyTier;
}

/**
 * Generates a guaranteed-solvable endless stage tailored to the player's adaptive difficulty tier.
 * Selects 3 to 7 on-duty monsters from the 20-character roster, constructs a strictly valid witness schedule
 * that avoids incompatible (-150) pairs, and derives requirements and requested days off from it.
 */
export function generateAdaptiveStage(
  weekNumber: number,
  history: readonly StagePlayRecord[] = [],
  seed = weekNumber * 7919 + history.length * 101,
  overrideTier?: DifficultyTier
): StageScenario {
  const tier = overrideTier ?? computeAdaptiveDifficultyTier(history, weekNumber);
  const tierCfg = ENDLESS_TIER_CONFIG[tier];
  const rng = createSeededRng(seed);

  const numDays = tierCfg.numDays;
  const chosen = new Set<MonsterId>();

  // Always pick 1 Heavy, 1 Daylight, 1 Nocturnal as core
  const heavy1 = pickFromPool(HEAVY_POOL, rng, chosen);
  chosen.add(heavy1);
  const day1 = pickFromPool(DAY_POOL, rng, chosen);
  chosen.add(day1);
  const night1 = pickFromPool(NIGHT_POOL, rng, chosen);
  chosen.add(night1);

  let rookie1: MonsterId | null = null;
  let knight1: MonsterId | null = null;
  let extraDayOrKnight: MonsterId | null = null;
  let extraNight: MonsterId | null = null;

  if (tierCfg.rosterSize >= 4) {
    rookie1 = pickFromPool(ROOKIE_POOL, rng, chosen);
    chosen.add(rookie1);
  }
  if (tierCfg.rosterSize >= 5) {
    knight1 = pickFromPool(KNIGHT_POOL, rng, chosen);
    chosen.add(knight1);
  }
  if (tierCfg.rosterSize >= 6) {
    extraDayOrKnight = pickFromPool([...DAY_POOL, ...KNIGHT_POOL], rng, chosen);
    chosen.add(extraDayOrKnight);
  }
  if (tierCfg.rosterSize >= 7) {
    extraNight = pickFromPool(NIGHT_POOL, rng, chosen);
    chosen.add(extraNight);
  }

  const availableMonsters = Array.from(chosen);

  const witness = {} as Record<MonsterId, ("off" | "day" | "night")[]>;
  for (const mId of ALL_MONSTER_IDS) {
    witness[mId] = Array.from({ length: numDays }, () => "off");
  }

  if (numDays === 3) {
    // 3-day witness for Tier 1 (3 monsters: heavy1, day1, night1)
    witness[heavy1][0] = rng() < 0.5 ? "day" : "night";
    witness[heavy1][2] = rng() < 0.5 ? "night" : "day";
    for (let d = 0 as DayIndex; d < 3; d = (d + 1) as DayIndex) {
      witness[day1][d] = d === 1 && witness[heavy1][1] === "day" ? "off" : "day";
      witness[night1][d] = "night";
    }
  } else if (numDays === 4) {
    // 4-day witness for Tier 2 (4 monsters: heavy1, night1, day1, rookie1)
    const heavyDays: DayIndex[] = rng() < 0.5 ? [0, 2] : [1, 3];
    const nightRest: DayIndex = heavyDays.includes(1 as DayIndex) ? 1 : 2;
    for (const d of heavyDays) {
      witness[heavy1][d] = d === nightRest ? "night" : rng() < 0.5 ? "day" : "night";
    }
    const dayRest = (1 + Math.floor(rng() * 2)) as DayIndex;
    const rookieRest = (dayRest === 1 ? 2 : 1) as DayIndex;
    for (let d = 0 as DayIndex; d < 4; d = (d + 1) as DayIndex) {
      witness[day1][d] = d === dayRest ? "off" : "day";
      if (rookie1) {
        witness[rookie1][d] = d === rookieRest ? "off" : "day";
      }
      witness[night1][d] = d === nightRest ? "off" : "night";
    }
  } else {
    // 5-day witness for Tiers 3 (5名), 4 (6名), 5 (7名)
    const dayRests: DayIndex[] = [1, 2, 3].sort(() => rng() - 0.5) as DayIndex[];
    const nightRests: DayIndex[] = [1, 2, 3].sort(() => rng() - 0.5) as DayIndex[];
    const day1Rest = dayRests[0];
    const rookie1Rest = dayRests[1];
    const extraDayRest = dayRests[2];
    const night1Rest = nightRests[0];
    const knight1Rest = nightRests[1];
    const extraNightRest = nightRests[2];

    const heavyDays: DayIndex[] = tier >= 4 || rng() < 0.75 ? [0, 2, 4] : [1, 3];
    for (const d of heavyDays) {
      witness[heavy1][d] = rng() < 0.5 ? "day" : "night";
    }

    for (let d = 0 as DayIndex; d < 5; d = (d + 1) as DayIndex) {
      witness[day1][d] = d === day1Rest ? "off" : "day";
      if (rookie1) {
        witness[rookie1][d] = d === rookie1Rest ? "off" : "day";
      }
      witness[night1][d] = d === night1Rest ? "off" : "night";
      if (knight1) {
        witness[knight1][d] = d === knight1Rest ? "off" : "night";
      }
      if (extraDayOrKnight) {
        witness[extraDayOrKnight][d] = d === extraDayRest || d === 0 ? "off" : "day";
      }
      if (extraNight) {
        witness[extraNight][d] = d === extraNightRest || d === 4 ? "off" : "night";
      }
    }
  }

  // If any assigned pair in a slot has a -150 conflict in witness, let one rest on that day as long as >= 2 remain
  for (let d = 0 as DayIndex; d < numDays; d = (d + 1) as DayIndex) {
    for (const rel of ALL_PAIR_RELATIONS) {
      if (rel.moraleDelta >= 0) continue;
      if (
        availableMonsters.includes(rel.monsterA) &&
        availableMonsters.includes(rel.monsterB) &&
        witness[rel.monsterA][d] !== "off" &&
        witness[rel.monsterA][d] === witness[rel.monsterB][d]
      ) {
        const shift = witness[rel.monsterB][d];
        const countInSlot = availableMonsters.filter((m) => witness[m][d] === shift).length;
        if (countInSlot >= 2) {
          witness[rel.monsterB][d] = "off";
        }
      }
    }
  }

  const fullMoonDays = new Set<DayIndex>();
  if (tierCfg.fullMoonCount > 0 && numDays >= 5) {
    const firstMoon = (1 + Math.floor(rng() * 3)) as DayIndex;
    fullMoonDays.add(firstMoon);
    if (tierCfg.fullMoonCount >= 2) {
      fullMoonDays.add(((firstMoon + 2) % 5) as DayIndex);
    }
  }

  const requirements: ShiftSlotRequirement[] = [];
  const shifts: ActiveShiftType[] = ["day", "night"];

  for (let d = 0 as DayIndex; d < numDays; d = (d + 1) as DayIndex) {
    for (const s of shifts) {
      const isFullMoon = s === "night" && fullMoonDays.has(d);
      if (isFullMoon) {
        for (const mId of availableMonsters) {
          if (MONSTERS[mId].fullMoonNightForbidden && witness[mId][d] === "night") {
            witness[mId][d] = "off";
          }
        }
      }

      const assigned = availableMonsters.filter((m) => witness[m][d] === s);

      let witnessPower = assigned.reduce((acc, m) => acc + getEffectivePower(m, s), 0);
      for (const rel of ALL_PAIR_RELATIONS) {
        if (assigned.includes(rel.monsterA) && assigned.includes(rel.monsterB)) {
          witnessPower += rel.moraleDelta;
        }
      }

      let slack = 0;
      if (tier <= 2) {
        slack = witnessPower >= 500 ? tierCfg.slackPower : 0;
      } else if (tier === 3) {
        slack = witnessPower >= 600 ? tierCfg.slackPower : 0;
      } else if (tier === 4) {
        slack = witnessPower >= 800 && rng() < 0.4 ? tierCfg.slackPower : 0;
      } else {
        slack = tierCfg.slackPower;
      }

      const reqPower = Math.min(
        witnessPower,
        Math.max(200, Math.floor((witnessPower - slack) / 100) * 100)
      );
      const maxMinStaff = tier >= 4 ? 3 : 2;
      const minStaff = Math.max(1, Math.min(maxMinStaff, assigned.length));
      const isBossRaid = reqPower >= 700 || (numDays === 3 && reqPower >= 500);

      const pool = s === "day" ? DAY_ENEMIES : NIGHT_ENEMIES;
      const enemy = pool[(d + Math.floor(rng() * pool.length)) % pool.length];

      requirements.push({
        day: d,
        shift: s,
        raidTitle: isFullMoon ? "満月の夜間警戒" : enemy.raidTitle,
        enemyName: enemy.enemyName,
        enemyIcon: isFullMoon ? "🌕" : isBossRaid ? "🔥" : enemy.enemyIcon,
        enemyQuote: enemy.enemyQuote,
        requiredPower: reqPower,
        minStaff,
        isFullMoon,
        isBossRaid,
      });
    }
  }

  const candidateOffs: RequestedDayOff[] = [];
  for (const mId of availableMonsters) {
    const postReason = MONSTERS[mId].usualPost
      ? `${MONSTERS[mId].usualPost.split("・")[0]}の当番・休養`
      : "休息日";
    for (let d = 0 as DayIndex; d < numDays; d = (d + 1) as DayIndex) {
      if (witness[mId][d] === "off") {
        candidateOffs.push({ monsterId: mId, day: d, reason: postReason });
      }
    }
  }

  const maxOffCount = tierCfg.maxPtoCount;
  const requestedDaysOff: RequestedDayOff[] = [];
  const usedMonsters = new Set<MonsterId>();
  for (const cand of candidateOffs.sort(() => rng() - 0.5)) {
    if (!usedMonsters.has(cand.monsterId) && requestedDaysOff.length < maxOffCount) {
      usedMonsters.add(cand.monsterId);
      requestedDaysOff.push(cand);
    }
  }

  const diffLabel = getDifficultyLabel(tier);
  const rosterNames = availableMonsters.map((id) => MONSTERS[id].name).join("・");
  const calendarLabel = formatCastleCalendarMonth(weekNumber);
  return {
    id: `week-${weekNumber}-${seed}`,
    weekNumber,
    numDays,
    difficultyTier: tier,
    difficultyLabel: diffLabel,
    title: `${calendarLabel}：正門防衛シフト（${numDays}日間・${availableMonsters.length}名当番）`,
    subtitle: `今月の正門当番：${rosterNames}（難易度：${diffLabel}）`,
    newRuleTitle: `${calendarLabel} 正門当番（${availableMonsters.length}名編成・${diffLabel}）`,
    newRuleSummary:
      history.length > 0
        ? `直近の警備結果をもとに、今月は城内20名の中から${availableMonsters.length}名（${rosterNames}）が正門当番に招集されました。仲良しペア（+100）を活かし、同番拒否ペア（-150）を避けて組みましょう。`
        : `城内20名の中から今月の正門当番として選ばれた${availableMonsters.length}名（${rosterNames}）で守る${numDays}日間の警備スケジュールです。`,
    lilithIntro:
      history.length > 0
        ? `${calendarLabel}の進軍予測が届きました。今月の正門当番は ${rosterNames} の${availableMonsters.length}名です。それぞれの得意時間帯と「一緒に働きたくない相手」に気をつけて配置していきましょう。`
        : `${calendarLabel}の進軍予測が届きました。今月の正門当番である${availableMonsters.length}名で、無理なく守れるシフトを組んでいきましょう。`,
    lilithHint:
      `まずは指定休と満月の夜を確認し、1日おきにしか出られない${MONSTERS[heavy1].name}をどの強敵枠に充てるかから決めると組み立てやすくなります。`,
    availableMonsters,
    requirements,
    requestedDaysOff,
    activeRelations: [...ALL_PAIR_RELATIONS],
  };
}

/**
 * Generates a freshly randomized, guaranteed-solvable variant of a campaign stage (STAGE 1..5)
 * after a defense failure, so the player cannot copy the previously revealed optimal solution.
 */
export function generateRetryCampaignStage(
  stageIndex: number,
  retryCount: number,
  seed = (stageIndex + 1) * 104729 + Math.max(1, retryCount) * 7919
): StageScenario {
  const clampedIdx = Math.max(0, Math.min(CAMPAIGN_STAGES.length - 1, stageIndex));
  const base = CAMPAIGN_STAGES[clampedIdx];
  const tierMap: readonly DifficultyTier[] = [1, 1, 2, 3, 4];
  const tier = tierMap[clampedIdx] ?? 3;
  const generated = generateAdaptiveStage(base.weekNumber, [], seed, tier);
  const rosterNames = generated.availableMonsters.map((id) => MONSTERS[id].name).join("・");

  return {
    ...generated,
    id: base.id,
    weekNumber: base.weekNumber,
    title: base.title,
    subtitle: `今週の正門当番：${rosterNames}（新編成）`,
    newRuleTitle: base.newRuleTitle,
    newRuleSummary: `前回のシフトから当番メンバーと敵の進軍編成が新たに組み直されました。今週の正門当番は ${rosterNames} の${generated.availableMonsters.length}名です。`,
    lilithIntro: `新たな進軍予測が届きました。今回の正門当番は ${rosterNames} の${generated.availableMonsters.length}名です。敵の戦力とみんなの勤務条件を見極めてシフトを組みましょう。`,
  };
}

/**
 * Generates a guaranteed-solvable random weekly challenge.
 */
export function generateRandomStage(seed = Date.now()): StageScenario {
  const weekNum = 6 + (Math.abs(seed) % 90);
  return generateAdaptiveStage(weekNum, [], seed);
}
