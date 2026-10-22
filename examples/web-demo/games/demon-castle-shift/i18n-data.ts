import { pickLang, type GameLang } from "../i18n.js";
import { LILITH_PROFILE, MONSTERS } from "./characters.js";
import { getCastleCalendarYearMonth, getDifficultyLabel } from "./stages.js";
import {
  DAY_LABELS,
  type ActiveShiftType,
  type DayIndex,
  type DifficultyTier,
  type MonsterId,
  type MonsterProfile,
  type PairRelation,
  type RuleViolation,
  type ShiftSlotRequirement,
  type StageScenario,
} from "./types.js";

const DAY_LABELS_I18N: Record<GameLang, readonly string[]> = {
  ja: DAY_LABELS,
  en: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  zh: ["周一", "周二", "周三", "周四", "周五"],
};

const DAY_FULL_LABELS_I18N: Record<GameLang, readonly string[]> = {
  ja: ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  zh: ["星期一", "星期二", "星期三", "星期四", "星期五"],
};

export function getDayLabel(day: DayIndex, lang: GameLang): string {
  return DAY_LABELS_I18N[lang][day] ?? DAY_LABELS[day];
}

export function getDayFullLabel(day: DayIndex, lang: GameLang): string {
  return DAY_FULL_LABELS_I18N[lang][day] ?? `${DAY_LABELS[day]}曜日`;
}

const MONTH_NAMES_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatCastleCalendarMonthLocalized(
  monthNumberOneBased: number,
  includeEra: boolean,
  lang: GameLang,
  refDate: Date = new Date()
): string {
  const { eraName, year, month } = getCastleCalendarYearMonth(monthNumberOneBased, refDate);
  if (lang === "en") {
    const mName = MONTH_NAMES_EN[(month - 1) % 12];
    return includeEra ? `Star-Moon Era ${mName} ${year}` : mName;
  }
  if (lang === "zh") {
    return includeEra ? `星月历 ${year}年${month}月` : `${month}月`;
  }
  return includeEra ? `${eraName} ${year}年${month}月` : `${month}月`;
}

export function getDifficultyLabelLocalized(tier: DifficultyTier, lang: GameLang): string {
  if (lang === "ja") return getDifficultyLabel(tier);
  const map: Record<DifficultyTier, { en: string; zh: string }> = {
    1: { en: "Gentle (3 Guards)", zh: "温和（3人值班）" },
    2: { en: "Moderate (4 Guards)", zh: "适中（4人值班）" },
    3: { en: "Standard (5 Guards)", zh: "标准（5人值班）" },
    4: { en: "Veteran (6 Guards)", zh: "熟练（6人扩编值班）" },
    5: { en: "Extreme (7 Guards)", zh: "极限（7人全力值班）" },
  };
  return map[tier][lang];
}

export function getLilithProfileLocalized(lang: GameLang): {
  name: string;
  title: string;
  portrait: string;
  defaultQuote: string;
} {
  if (lang === "ja") return LILITH_PROFILE;
  if (lang === "en") {
    return {
      name: "Lilith",
      title: "Chief Tactician",
      portrait: LILITH_PROFILE.portrait,
      defaultQuote:
        "Let us build the shift while respecting each guard's best hours, rest days, and who they get along with or refuse to work alongside.",
    };
  }
  return {
    name: "莉莉丝",
    title: "警备参谋",
    portrait: LILITH_PROFILE.portrait,
    defaultQuote: "请兼顾每位成员擅长的时间段、休息日，以及彼此的搭档默契与同班排斥来编排班表吧。",
  };
}

interface LocalizedMonsterFields {
  name: string;
  title: string;
  race: string;
  usualPost: string;
  traitTitle: string;
  traitSummary: string;
  quotes: MonsterProfile["quotes"];
}

const MONSTER_I18N: Record<MonsterId, { en: LocalizedMonsterFields; zh: LocalizedMonsterFields }> = {
  drago: {
    en: {
      name: "Drago",
      title: "Veteran Gatekeeper",
      race: "Elder Dragon",
      usualPost: "Main Gate · Lead Warden",
      traitTitle: "No consecutive days (must rest next day) · Max 3/wk",
      traitSummary:
        "Day 500 / Night 500. High defense power, but an old wound prevents working 2 days in a row (max 1 consecutive day, 3 shifts/week). Dislikes sharing a shift with fussy Lich (-150).",
      quotes: {
        intro: "Schedule me every other day, and I will handle the toughest enemies.",
        dayAssign: "Day gate duty, understood. Tomorrow I will take a full rest.",
        nightAssign: "Night gate duty. My flames will light up the dark road.",
        offAssign: "Phew, nothing beats resting old bones on a day off.",
        happy: "Resting mid-week kept my old wound from acting up.",
        angry: "I told you I cannot work two days in a row with this old wound.",
      },
    },
    zh: {
      name: "德拉戈",
      title: "资深门卫",
      race: "古龙",
      usualPost: "正门・首席门卫",
      traitTitle: "不可连勤（出勤次日必须休息）・每周最多3次",
      traitSummary:
        "昼500 / 夜500。拥有极高的防卫力，但因旧伤无法连续两天出勤（最多连上1天・每周最多3次）。不愿与唠叨的巫妖同班（-150）。",
      quotes: {
        intro: "要派我上场的话请隔天安排，相对地强敌就包在我身上。",
        dayAssign: "白天的门卫是吧，结束后明天可得让我好好歇息。",
        nightAssign: "夜里的城门啊，就用龙焰照亮夜路吧。",
        offAssign: "呼，休息日最适合养精蓄锐了。",
        happy: "多亏中途有休息，旧伤没犯，顺利撑到了最后。",
        angry: "我应该说过不能连续工作两天，旧伤会作痛的。",
      },
    },
  },
  golem: {
    en: {
      name: "Golem",
      title: "Forge Colossus",
      race: "Rune Golem",
      usualPost: "Castle Forge · Armor Smith",
      traitTitle: "No consecutive days (cooling rest required) · Max 3/wk",
      traitSummary:
        "Day 500 / Night 500. Usually forges gate fittings. Its mana core requires cooling, so it can only work every other day (max 3/wk). Pairs well with Minotaur and Mandra.",
      quotes: {
        intro: "...Mana furnace operates every other day. I shall be the gate's shield.",
        dayAssign: "...Daytime gate defense acknowledged.",
        nightAssign: "...Nighttime gate defense. Watching by furnace light.",
        offAssign: "...Entering cooling standby mode.",
        happy: "...Mana furnace temperature normal. Mission completed.",
        angry: "...Continuous operation causes core overheating.",
      },
    },
    zh: {
      name: "魔像",
      title: "锻造场巨兵",
      race: "符文魔像",
      usualPost: "城内锻造场・装甲工匠",
      traitTitle: "不可连勤（出勤次日需冷却休息）・每周最多3次",
      traitSummary:
        "昼500 / 夜500。平时在锻造场打造城门铁件的巨兵。因魔力炉需要冷却，只能隔天出勤・每周最多3次。与米诺陶洛斯及曼德拉十分合拍。",
      quotes: {
        intro: "……魔力炉仅限隔日运转，愿作城门之盾。",
        dayAssign: "……白昼城门防卫，收到。",
        nightAssign: "……夜间城门防卫，以炉火照明警戒。",
        offAssign: "……转入冷却休眠模式。",
        happy: "……魔力炉温度正常，任务顺利完成。",
        angry: "……连续运转会导致魔力炉过热。",
      },
    },
  },
  behemoth: {
    en: {
      name: "Behemoth",
      title: "Forest Horned Brute",
      race: "Behemoth",
      usualPost: "North Woods · Outer Patrol",
      traitTitle: "No consecutive days (Day 550 / Night 450) · Heavy Brawler",
      traitSummary:
        "Day 550 / Night 450. Patrols the northern forest with unmatched strength, but needs a full day's nap after going all out (max 1 consecutive day, 3/wk). Clashes with trap-weaver Arachne (-150).",
      quotes: {
        intro: "Leave the heavy lifting to me, as long as I get my nap the next day.",
        dayAssign: "Daytime battles get my blood pumping. I will push them right back.",
        nightAssign: "Night shift, huh. Good exercise after dinner.",
        offAssign: "Eat well and sleep well, that is the best.",
        happy: "Fought hard and slept plenty. What a great week.",
        angry: "Hey now, going all out two days in a row is asking too much.",
      },
    },
    zh: {
      name: "贝希摩斯",
      title: "森林刚角兽",
      race: "巨兽",
      usualPost: "北之森・外围哨戒",
      traitTitle: "不可连勤（昼550 / 夜450）・豪迈强攻",
      traitSummary:
        "昼550 / 夜450。平时巡视北之森的怪力重战士。全力作战后次日必须午睡休息（最多连上1天・每周最多3次）。布置精密丝网的阿拉克涅嫌弃与他同班（-150）。",
      quotes: {
        intro: "力气活尽管交给我，不过全力大闹一场后的第二天可得让我睡个好觉。",
        dayAssign: "阳光下的战斗最让人热血沸腾，看我把他们通通顶回去。",
        nightAssign: "夜班啊，正好当成饭后消食运动。",
        offAssign: "吃饱睡足，这才是最棒的。",
        happy: "痛快打了一场又睡得饱饱的，真是充实的一周。",
        angry: "喂喂，连续两天全力作战实在吃不消啊。",
      },
    },
  },
  ifrit: {
    en: {
      name: "Ifrit",
      title: "Underground Furnace Spirit",
      race: "Ifrit",
      usualPost: "Boiler Room · Fire Keeper",
      traitTitle: "No consecutive days (Day 450 / Night 550) · Night Firewall",
      traitSummary:
        "Day 450 / Night 550. Manages the castle's underground heating furnace. Burns mana rapidly, so only works every other day (max 3/wk). Flying sparks scare plant-type Mandra (-150).",
      quotes: {
        intro: "Here from the boiler room. My flames burn fuel fast, so schedule me every other day.",
        dayAssign: "Day shift, got it. I will burn brighter than the sun.",
        nightAssign: "Dark nights are where my flames shine. No torches needed.",
        offAssign: "Heading back to the furnace to rest my embers today.",
        happy: "Burned at a great pace, and the castle bathwater is right on temperature.",
        angry: "I will run out of fuel if you work me two days straight.",
      },
    },
    zh: {
      name: "伊弗利特",
      title: "地下炉炎精",
      race: "炎之魔人",
      usualPost: "地下锅炉室・司炉",
      traitTitle: "不可连勤（昼450 / 夜550）・夜间火墙",
      traitSummary:
        "昼450 / 夜550。平时管理魔王城热水炉的炎之魔人。魔力消耗剧烈，只能隔天出勤・每周最多3次。飞溅的火星会让草木系的曼德拉不敢同班（-150）。",
      quotes: {
        intro: "我从地下炉过来支援了。我的火焰消耗大，请务必隔天排班。",
        dayAssign: "白班是吧，看我燃起不输太阳的热度。",
        nightAssign: "漆黑的夜晚正是我火焰的舞台，连火把都省了。",
        offAssign: "今天回地下炉养一养火种。",
        happy: "燃烧的节奏刚刚好，城里的热水温度也完美无缺。",
        angry: "燃料会耗尽的，饶了我别让我连上两天吧。",
      },
    },
  },
  carmilla: {
    en: {
      name: "Carmilla",
      title: "Night Shift Ace",
      race: "Vampire",
      usualPost: "Castle Salon · Night Watch",
      traitTitle: "Night Specialist (Night 400 / Day 200) · Dislikes rigid types",
      traitSummary:
        "Day 200 / Night 400. Excels at night watch but dislikes bright sunlight. Gets along well with Pururu and Banshee, but refuses to share a shift with rigid Dullahan or sweaty Minotaur (-150).",
      quotes: {
        intro: "Strong sunlight is not my forte. Leave the night watch to me.",
        dayAssign: "Daytime patrol... It is rather taxing without my parasol.",
        nightAssign: "Under the moonlight, I can hear footsteps from afar.",
        offAssign: "I shall rest quietly in my chamber today.",
        happy: "A calm and composed night watch in the quiet darkness.",
        angry: "Harsh sunlight or an incompatible partner is terribly exhausting.",
      },
    },
    zh: {
      name: "卡蜜拉",
      title: "夜班主力",
      race: "吸血鬼",
      usualPost: "城内沙龙・夜间警备",
      traitTitle: "擅长夜班（夜400 / 昼200）・厌恶死板之人",
      traitSummary:
        "昼200 / 夜400。夜间警备能发挥真正实力，但白天怕晒。与普露露、班西关系融洽，却嫌弃死板的杜拉汉与满身汗味的米诺陶洛斯（-150）。",
      quotes: {
        intro: "我可受不了强烈的日晒，夜间的警备就交给我吧。",
        dayAssign: "白天的巡逻吗……没有阳伞实在有些难受呢。",
        nightAssign: "在月光之下，连远处的脚步声都听得一清二楚。",
        offAssign: "今天就在房间里静静休息了。",
        happy: "在静谧的夜色中从容完成了巡视，不错的调度。",
        angry: "烈日当空的时段或是与合不来的人同班，真是令人疲惫。",
      },
    },
  },
  lich: {
    en: {
      name: "Lich",
      title: "Chief Librarian",
      race: "Elder Lich",
      usualPost: "Grand Archive · Record Keeper",
      traitTitle: "Night Specialist (Night 400 / Day 200) · Meticulous Scholar",
      traitSummary:
        "Day 200 / Night 400. Chief librarian of the underground archives. Deploys strong magic barriers at night. Works well with Wisp and Gargoyle, but dislikes rough Drago (-150).",
      quotes: {
        intro: "Cataloging archives is my main duty, but I can maintain the night barriers.",
        dayAssign: "Daytime air is harsh on old books and bones, though I shall manage.",
        nightAssign: "A quiet night. I shall maintain the ward while reading my tome.",
        offAssign: "Today I return to the archives to organize the catalog.",
        happy: "An orderly schedule. Both my reading and guard duty went smoothly.",
        angry: "Sharing a post with someone boisterous disrupts my incantations.",
      },
    },
    zh: {
      name: "巫妖",
      title: "地下书库馆长",
      race: "高阶巫妖",
      usualPost: "地下大书库・文献管理",
      traitTitle: "擅长夜班（夜400 / 昼200）・一丝不苟的古魔导师",
      traitSummary:
        "昼200 / 夜400。平时在地下书库整理古籍的馆长，夜间张开魔导障壁可发挥高防卫力。与威斯普、石像鬼合得来，但讨厌粗枝大叶的德拉戈（-150）。",
      quotes: {
        intro: "整理书库才是我的本职，不过夜间维持结界倒也可以代劳。",
        dayAssign: "白昼的外界空气对古书和骨头都不太友好……但也只能尽力了。",
        nightAssign: "静谧的夜晚，就一边研读书籍一边张开结界吧。",
        offAssign: "今日回书库整理目录。",
        happy: "井然有序的班表，读书与警备都进展得十分顺利。",
        angry: "和吵闹的家伙分在同一岗位，会打乱我的咏唱节奏。",
      },
    },
  },
  morgan: {
    en: {
      name: "Morgan",
      title: "Stargazer Witch",
      race: "Night Witch",
      usualPost: "Observatory · Star Tower",
      traitTitle: "Night Specialist (Night 400 / Day 200) · Astral Mage",
      traitSummary:
        "Day 200 / Night 400. Observes the night sky from the Star Tower. Sleepy by day, but wields 400 astral power at night. Dislikes strict timekeeper Centaur (-150).",
      quotes: {
        intro: "Yawn... I am sleepy during the day. Leave the starlit hours to me.",
        dayAssign: "Day shift... I will pull my hat brim down and try not to doze off.",
        nightAssign: "The stars are clear tonight. I can foresee every approaching shadow.",
        offAssign: "A day off. I will take a long nap in the observatory.",
        happy: "Guarding at my own pace under the night sky suited me well.",
        angry: "Working beside someone who nags every minute makes it hard to breathe.",
      },
    },
    zh: {
      name: "摩根",
      title: "观星塔魔女",
      race: "夜之魔女",
      usualPost: "天文台・观星塔",
      traitTitle: "擅长夜班（夜400 / 昼200）・占星魔术师",
      traitSummary:
        "昼200 / 夜400。平时在观星塔观测夜空的魔女。白天总是睡眼惺忪，夜间则能以星灵术发挥400防卫力。讨厌严守时间的半人马（-150）。",
      quotes: {
        intro: "呼啊……白天好困呀，星光亮起之后的巡视就交给我吧。",
        dayAssign: "白班呀……得把帽檐压低些，当心别打瞌睡才行。",
        nightAssign: "今晚星色真美，靠近的敌影全都一目了然。",
        offAssign: "休息日呢，去天文台美美地睡个午觉吧。",
        happy: "能一边眺望夜空一边按自己的节奏守卫，很棒的安排呢。",
        angry: "和按分钟催促人的家伙同班，简直让人喘不过气。",
      },
    },
  },
  banshee: {
    en: {
      name: "Banshee",
      title: "Moonlit Diva",
      race: "Frost Spirit",
      usualPost: "Courtyard Music Hall · Night Watch",
      traitTitle: "Night Specialist (Night 400 / Day 200) · Loves Quiet",
      traitSummary:
        "Day 200 / Night 400. Frost spirit guarding the quiet night corridors. Synergizes with Carmilla and Wisp (+100), but avoids loud, energetic Fenrir (-150).",
      quotes: {
        intro: "I love quiet nights... Please schedule me apart from noisy companions.",
        dayAssign: "Daylight is a bit dazzling... I will watch quietly from the shade.",
        nightAssign: "The night chill feels pleasant. Sound ripples will alert us to enemies.",
        offAssign: "Today I will quietly tune my strings in the music hall.",
        happy: "Peaceful night shifts allowed me to serve with a calm heart.",
        angry: "Loud voices right beside my ear disturb my frost barrier...",
      },
    },
    zh: {
      name: "班西",
      title: "月影歌姬",
      race: "冰霜精灵",
      usualPost: "中庭音乐堂・夜间哨戒",
      traitTitle: "擅长夜班（夜400 / 昼200）・喜静之冰灵",
      traitSummary:
        "昼200 / 夜400。守护静谧夜廊的冰之精灵。与卡蜜拉或威斯普搭档默契十足（+100），但害怕大嗓门的芬里尔（-150）。",
      quotes: {
        intro: "我喜欢安静的夜晚……请把我嗓门大的同伴排在不同时段吧。",
        dayAssign: "白天稍微有些刺眼……我会在阴凉处静静警戒。",
        nightAssign: "夜晚的凉意很舒适，声波的涟漪会替我们察觉敌踪。",
        offAssign: "今天在音乐堂安静地调音度过。",
        happy: "全都是宁静的夜班，得以安心履行职责。",
        angry: "在耳边大声嚷嚷的话，寒冰结界会被震乱的……",
      },
    },
  },
  fenrir: {
    en: {
      name: "Fenrir",
      title: "Day Shift Ace",
      race: "Werewolf",
      usualPost: "Outer Forest · Day Scout",
      traitTitle: "Day Specialist (Day 400) · Cannot work Full Moon nights",
      traitSummary:
        "Day 400 / Night 200. Excels at daytime forest patrols. Cannot be assigned to night shift on a Full Moon night. Quiet-loving Banshee avoids her (-150).",
      quotes: {
        intro: "Leave daytime patrols to me. Just remember I cannot go out on a Full Moon night.",
        dayAssign: "In daylight my nose can track anything from afar.",
        nightAssign: "I get a bit sleepy at night, but I will keep watch.",
        offAssign: "Day off today. I will relax out in the forest.",
        happy: "Working mostly daytime shifts made it super easy to move around. Thanks.",
        angry: "On a Full Moon night I lose control, so I cannot take night duty.",
      },
    },
    zh: {
      name: "芬里尔",
      title: "白班主力",
      race: "狼人",
      usualPost: "外围森林・昼间斥候",
      traitTitle: "擅长白班（昼400）・满月之夜不可出击",
      traitSummary:
        "昼400 / 夜200。白天巡逻能发挥高防卫力。满月之夜难以控制兽性，无法安排夜班。喜静的班西对她敬而远之（-150）。",
      quotes: {
        intro: "白天的巡逻包在我身上，只是满月之夜我没法外出，还请多留意。",
        dayAssign: "白天视野好、嗅觉也灵敏，我会牢牢盯紧城门的。",
        nightAssign: "到了晚上有点犯困，不过巡逻还是会认真完成的。",
        offAssign: "今天休息呢，我去森林里悠闲散个步。",
        happy: "以白班为主的安排活动起来很顺手，谢谢啦。",
        angry: "满月之夜无法控制力量，不能上夜班啦。",
      },
    },
  },
  garuda: {
    en: {
      name: "Garuda",
      title: "Gale Harpy Lancer",
      race: "Harpy Lancer",
      usualPost: "Valley Sky · Aerial Scout",
      traitTitle: "Day Specialist (Day 400) · Cannot fly on Full Moon nights",
      traitSummary:
        "Day 400 / Night 200. Aerial scout watching from high above the valley. Strong visibility by day (400), grounded on Full Moon nights. Clashes with motionless Gargoyle (-150).",
      quotes: {
        intro: "In clear daylight I can spot everything from the sky. Just do not pair me with a still statue.",
        dayAssign: "Good wind today. I will track every enemy movement from above.",
        nightAssign: "Cold night air keeps me on the ground, but I will do my part.",
        offAssign: "I will preen my wings and nap on a high branch.",
        happy: "A breezy shift where I could ride the wind freely.",
        angry: "Working beside someone motionless throws off my flying rhythm.",
      },
    },
    zh: {
      name: "迦楼罗",
      title: "疾风鸟人",
      race: "鹰身枪兵",
      usualPost: "溪谷高空・广域侦察",
      traitTitle: "擅长白班（昼400）・满月夜气流紊乱不可出击",
      traitSummary:
        "昼400 / 夜200。平时从溪谷高空俯瞰警戒的鸟人斥候。白天视野开阔可达400，满月夜无法升空。嫌弃纹丝不动的石像鬼节奏不合（-150）。",
      quotes: {
        intro: "晴朗的白天就由我从空中一网打尽吧，只是别把我排在石像旁边。",
        dayAssign: "风向正好，我会从高空把敌人的动向全部捕捉下来。",
        nightAssign: "夜里翅膀发冷只能打地面战，不过我也会尽力的。",
        offAssign: "去梳理一下羽毛，在高高的树枝上午睡一会儿。",
        happy: "能痛快乘风翱翔的班表，下次也叫上我吧。",
        angry: "和一动不动的家伙搭档，飞行的节奏都被打乱了。",
      },
    },
  },
  centaur: {
    en: {
      name: "Centaur",
      title: "Forest Cavalry Archer",
      race: "Centaur",
      usualPost: "West Road · Forest Defense Line",
      traitTitle: "Day Specialist (Day 400) · Disciplined Marksman",
      traitSummary:
        "Day 400 / Night 200. Guards the western forest road with long-range archery (400 by day). Strictly punctual, so arguing breaks out if paired with laid-back Morgan (-150).",
      quotes: {
        intro: "Reporting from the western woods. In daylight, my arrows never miss.",
        dayAssign: "Clear visibility and favorable wind. My bow shall guard the main gate.",
        nightAssign: "Aiming at night is harder, yet I will not falter in close combat.",
        offAssign: "Off duty. I shall tend to my hooves and replenish my arrows.",
        happy: "A punctual and orderly schedule. Most satisfactory.",
        angry: "Sharing a post with someone unpunctual disrupts unit discipline.",
      },
    },
    zh: {
      name: "半人马",
      title: "森林弓骑兵",
      race: "半人马",
      usualPost: "西侧街道・森林防线",
      traitTitle: "擅长白班（昼400）・重守纪律的射手",
      traitSummary:
        "昼400 / 夜200。平时驻守西之森街道的弓骑兵，白天远距离射击可达400。因严守纪律，若与随性的摩根同班会发生争执（-150）。",
      quotes: {
        intro: "从西之森前来支援，白昼的狙击绝不会偏离分毫。",
        dayAssign: "视野良好、风向适宜，白天的正门就由我的弓箭守护。",
        nightAssign: "夜间虽然难以瞄准，但近身战也绝不落于人后。",
        offAssign: "休班日，去保养马蹄并补充箭矢。",
        happy: "守时而整肃的排班，令人心情舒畅。",
        angry: "与不守时的散漫之人同班，会扰乱整支队伍的纪律。",
      },
    },
  },
  griffon: {
    en: {
      name: "Griffon",
      title: "Watchtower Winged Sentinel",
      race: "Royal Griffon",
      usualPost: "Central Watchtower · Upper Guard",
      traitTitle: "Day Specialist (Day 400) · Proud Sentinel",
      traitSummary:
        "Day 400 / Night 200. Keeps watch from the central tower peak. Synergizes with Garuda and Dullahan (+100), but gets distracted by shiny coins next to Mimic (-150).",
      quotes: {
        intro: "Descended from the watchtower. Leave the daylight vigil to me.",
        dayAssign: "Under the sun is my pride. No scout shall slip past my eyes.",
        nightAssign: "Night vision is tougher for avian eyes, yet none shall pass.",
        offAssign: "Returning to my watchtower nest to rest my wings.",
        happy: "Fulfilled my duty with pride. Fine command indeed.",
        angry: "Glittering gold coins right beside me distract my instincts.",
      },
    },
    zh: {
      name: "狮鹫",
      title: "瞭望塔翼兽",
      race: "皇家狮鹫",
      usualPost: "中央瞭望塔・上层卫士",
      traitTitle: "擅长白班（昼400）・高傲的哨兵",
      traitSummary:
        "昼400 / 夜200。平时在中央瞭望塔顶巡视的翼兽骑士。与迦楼罗、杜拉汉搭档默契（+100），但在金币叮当作响的宝箱怪身旁无法集中精神（-150）。",
      quotes: {
        intro: "自瞭望塔降临，白昼的警戒就交给我吧。",
        dayAssign: "骄阳之下正是我的荣耀，任何斥候都逃不过我的眼睛。",
        nightAssign: "鸟类在夜间视力受限，但绝不会放敌人踏入城门。",
        offAssign: "回瞭望塔的巢穴歇息羽翼了。",
        happy: "高傲而圆满地完成了任务，出色的指挥。",
        angry: "眼前金光闪闪的话，本能会让我分心。",
      },
    },
  },
  dullahan: {
    en: {
      name: "Dullahan",
      title: "Heavy Spectral Knight",
      race: "Spectral Knight",
      usualPost: "Outer Rampart · Patrol Captain",
      traitTitle: "Day 300 / Night 400 · Synergizes with Fenrir & Pururu",
      traitSummary:
        "Day 300 / Night 400. Dependable knight day or night. Gains +100 defense when paired with Fenrir or Pururu, but clashes with Carmilla (-150).",
      quotes: {
        intro: "This shield exists for the peace of the Demon Castle. I shall fulfill my duty at any post.",
        dayAssign: "Daytime gate guard. I will keep a vigilant watch.",
        nightAssign: "Night patrol. Nothing in the shadows shall escape me.",
        offAssign: "Off duty. I will spend the day maintaining my armor.",
        happy: "A well-balanced deployment. The castle defense was solid.",
        angry: "This deployment is strained. It leaves gaps in our defense.",
      },
    },
    zh: {
      name: "杜拉汉",
      title: "重装骑士",
      race: "幽灵骑士",
      usualPost: "外郭城墙・巡逻队长",
      traitTitle: "昼300 / 夜400・与芬里尔及普露露合拍",
      traitSummary:
        "昼300 / 夜400。无论昼夜都能稳定发挥防卫力的重装骑士。与芬里尔或普露露同班可提升100防卫力，但与卡蜜拉方针不合（-150）。",
      quotes: {
        intro: "此盾只为守护魔王城的安宁，无论何处岗位定当尽职。",
        dayAssign: "白昼的城门警备，定会严密把守。",
        nightAssign: "夜间巡逻吗，暗处的动静也逃不过我的感知。",
        offAssign: "休班日，正好用来保养武具。",
        happy: "合理而稳健的部署，城防固若金汤。",
        angry: "排班似乎有些勉强，这样会让防线出现破绽。",
      },
    },
  },
  gargoyle: {
    en: {
      name: "Gargoyle",
      title: "Rampart Stone Sentry",
      race: "Stone Gargoyle",
      usualPost: "Main Gate Arch · Statue Mimic",
      traitTitle: "Day 350 / Night 350 · Steady All-Hour Shield",
      traitSummary:
        "Day 350 / Night 350. Silent sentry disguised as a roof statue. Steady 350 defense day or night. Gets along with quiet Lich (+100), but clashes with restless Garuda (-150).",
      quotes: {
        intro: "...Guarding the gate without moving an inch is my way, day or night.",
        dayAssign: "...By day I shall stand poised like a stone statue.",
        nightAssign: "...Blending into the dark to watch from above the arch.",
        offAssign: "...Returning to my pedestal to rest as stone.",
        happy: "...A quiet and solid defense. Not a single crack.",
        angry: "...Someone darting around beside me ruins my stone disguise.",
      },
    },
    zh: {
      name: "石像鬼",
      title: "城墙石像兵",
      race: "石像鬼",
      usualPost: "正门拱顶・石像拟态",
      traitTitle: "昼350 / 夜350・昼夜皆宜的不动之盾",
      traitSummary:
        "昼350 / 夜350。平时伪装成屋顶石像的沉默卫兵，无论昼夜都能稳定发挥350防卫力。与同样安静的巫妖很合拍（+100），但与急性子的迦楼罗合不来（-150）。",
      quotes: {
        intro: "……纹丝不动地守卫城门便是我的作风，昼夜皆可。",
        dayAssign: "……白天就像普通石像一样伫立警戒。",
        nightAssign: "……融入夜色，从城门上方俯视戒备。",
        offAssign: "……回到底座化作石头歇息。",
        happy: "……安静而稳固的防守，没有一丝裂痕。",
        angry: "……身旁有人蹿来蹿去的话，石像伪装就露馅了。",
      },
    },
  },
  minotaur: {
    en: {
      name: "Minotaur",
      title: "Armory Warden",
      race: "Minotaur",
      usualPost: "Underground Armory · Gear Smith",
      traitTitle: "Day 400 / Night 300 · Honest Craftsman Warrior",
      traitSummary:
        "Day 400 / Night 300. Maintains shields and spears in the armory. Gains +100 with fellow crafters Golem and Mimic, but aristocratic Carmilla refuses to share a shift (-150).",
      quotes: {
        intro: "Helping at the gate between armory duties. My sharpened greataxe is ready.",
        dayAssign: "Daytime main gate. I will plant my feet and push them back.",
        nightAssign: "Night watch. Better make sure the torch oil is full.",
        offAssign: "On my day off I will hammer out the dents in everyone's shields.",
        happy: "Good shift. Kept wear and tear on our gear to a minimum.",
        angry: "Hard to work beside someone complaining about forge sweat and dust.",
      },
    },
    zh: {
      name: "米诺陶洛斯",
      title: "武器库守卫",
      race: "牛头人",
      usualPost: "地下武器库・武具管理",
      traitTitle: "昼400 / 夜300・踏实的工匠战士",
      traitSummary:
        "昼400 / 夜300。平时在地下武器库维护盾牌与长枪的工匠战士。与工匠同伴魔像或宝箱怪搭档可+100，但被讲究贵族派头的卡蜜拉嫌弃（-150）。",
      quotes: {
        intro: "趁整理武器库的间隙来帮忙看门，让你见识打磨好的巨斧吧。",
        dayAssign: "白天的正门是吧，我会稳稳架起巨斧挡住他们。",
        nightAssign: "夜班啊，得留神别让火把的灯油烧干了。",
        offAssign: "休班日就去帮大家修补盾牌上的凹痕。",
        happy: "很合理的排班，武具的损耗也很小。",
        angry: "被人嫌弃有汗味和铁锈味，实在没法舒心干活。",
      },
    },
  },
  arachne: {
    en: {
      name: "Arachne",
      title: "Silver-Thread Trap Weaver",
      race: "Arachne",
      usualPost: "Tailor Room · Rear Gate Traps",
      traitTitle: "Day 300 / Night 400 · Tactical Wire Defense",
      traitSummary:
        "Day 300 / Night 400. Tailors uniforms and strings silver detection threads. Synergizes with Morgan and Mandra (+100), but refuses to work with Behemoth who tramples her webs (-150).",
      quotes: {
        intro: "From mending uniforms to rigging gate traps, leave it to me. Just keep clumsy brawlers away.",
        dayAssign: "Day shift. I will string subtle silver threads between the trees.",
        nightAssign: "At night my silver threads are invisible, snaring intruders cleanly.",
        offAssign: "A day off. I will mend the frayed hems on everyone's uniforms.",
        happy: "A graceful defense with not a single thread out of place.",
        angry: "I cannot work beside someone who stomps right through my freshly strung sensor threads.",
      },
    },
    zh: {
      name: "阿拉克涅",
      title: "银丝陷阱师",
      race: "蜘蛛娘",
      usualPost: "城内裁缝室・后门陷阱管理",
      traitTitle: "昼300 / 夜400・智略丝网防卫",
      traitSummary:
        "昼300 / 夜400。平时缝制警备队制服并在后门布设警戒银丝的智略派。与摩根、曼德拉合拍（+100），但绝不愿与踩坏丝网的贝希摩斯同班（-150）。",
      quotes: {
        intro: "从缝补制服到布置城门陷阱都包在我身上，只是别把粗鲁莽撞的家伙排给我。",
        dayAssign: "白班呢，先在树林间拉起隐蔽的银丝吧。",
        nightAssign: "夜色中银丝完全看不见，能漂亮地缠住靠近的敌人。",
        offAssign: "休息日就帮大家把制服开线的地方缝好吧。",
        happy: "连一根丝线都没乱的优美防卫，干得漂亮。",
        angry: "真是的，把我刚拉好的感知丝踩得乱七八糟的人可没法合作。",
      },
    },
  },
  pururu: {
    en: {
      name: "Pururu",
      title: "Rookie Guard",
      race: "Slime",
      usualPost: "Aqueduct · Cleaning & Watch",
      traitTitle: "No solo night shift (+100 synergy with seniors)",
      traitSummary:
        "Day 200 / Night 200. Maintains the underground waterways. Modest solo power, but adds +100 synergy when paired with Carmilla or Dullahan. Cannot guard night shifts alone.",
      quotes: {
        intro: "I am still a rookie, so I will do my best. I just cannot handle night watch all by myself...",
        dayAssign: "Heading out for daytime patrol and waterway inspection.",
        nightAssign: "Night watch. As long as a senior is with me, I can stay calm.",
        offAssign: "On my day off I will rest by the clean stream.",
        happy: "Guarding alongside my seniors taught me so much.",
        angry: "When left alone in the pitch-black night, I get too scared to see around me...",
      },
    },
    zh: {
      name: "普露露",
      title: "新晋警备员",
      race: "史莱姆",
      usualPost: "地下水路・清扫兼巡视",
      traitTitle: "夜间不可单独值勤（与前辈搭档+100）",
      traitSummary:
        "昼200 / 夜200。平时负责净化地下水路。单人防卫力虽低，但与卡蜜拉或杜拉汉同班可激发+100连携加成。夜间无法独自看守。",
      quotes: {
        intro: "虽然还是新人但我会全力以赴，只是夜晚独自值班还是会害怕……",
        dayAssign: "白天的巡逻和水路检查，我会认真完成的。",
        nightAssign: "夜间的警备呢，只要有前辈在身边就能安心行动。",
        offAssign: "休息日就去清澈的水边放松身体。",
        happy: "能在前辈们身边一起警备，学到了好多。",
        angry: "漆黑的夜里只剩自己一个人的话，会害怕得看不清四周……",
      },
    },
  },
  mandra: {
    en: {
      name: "Mandra",
      title: "Herb Garden Apprentice",
      race: "Mandragora",
      usualPost: "Greenhouse · Medicinal Herb Garden",
      traitTitle: "No solo night shift (Day 250 / Night 200 · Soothing Aroma)",
      traitSummary:
        "Day 250 / Night 200. Prepares salves in the greenhouse. Gains +100 with Golem, Arachne, or Centaur, but fears Ifrit's flying sparks (-150). Cannot guard night shifts alone.",
      quotes: {
        intro: "Here to help from the herb garden. I do great in warm sunlight and beside kind seniors.",
        dayAssign: "Warm sunshine today. I will ready my sleep-herb powder.",
        nightAssign: "Night is a little dark, so I will follow right behind my senior.",
        offAssign: "Back to the greenhouse for water and fertilizer.",
        happy: "Even the leaf on my head stayed perky all week.",
        angry: "Staying next to scorching flames will singe my leaves...",
      },
    },
    zh: {
      name: "曼德拉",
      title: "药草园见习生",
      race: "曼德拉草",
      usualPost: "城内温室・救护药草园",
      traitTitle: "夜间不可单独值勤（昼250 / 夜200・治愈香气）",
      traitSummary:
        "昼250 / 夜200。平时在药草园调配伤药的植物少女。与魔像、阿拉克涅、半人马同班可获+100加成，但害怕火星飞溅的伊弗利特（-150）。夜间不可单独配置。",
      quotes: {
        intro: "从药草园来帮忙啦，在暖洋洋的阳光下和温柔的前辈身旁就能努力加油。",
        dayAssign: "阳光真暖和，准备好催眠香草粉来站岗啰。",
        nightAssign: "夜里有点黑，我会紧紧跟在前辈后面的。",
        offAssign: "回温室补充水分和肥料啦。",
        happy: "头顶的叶片直到周末都精神抖擞呢。",
        angry: "哇，站在烈火熊熊的人旁边，叶子会被烤焦的……",
      },
    },
  },
  mimic: {
    en: {
      name: "Mimic",
      title: "Treasury Chest Keeper",
      race: "Mimic Girl",
      usualPost: "Underground Treasury · Decoy Guard",
      traitTitle: "No solo night shift (Day 200 / Night 200 · Surprise Box)",
      traitSummary:
        "Day 200 / Night 200. Shy guard hiding in a chest. Gains +100 with Minotaur or Morgan, but fears Griffon who stares at shiny gold (-150). Cannot guard night shifts alone.",
      quotes: {
        intro: "Watching from inside my box is my specialty... Just do not leave me alone at night...",
        dayAssign: "I will pretend to be a roadside crate and surprise the scouts.",
        nightAssign: "With a senior beside me, I can open my lid even at night.",
        offAssign: "Tucking myself in the corner of the treasury with the lock shut.",
        happy: "My hinges stayed smooth and the surprise trap worked well.",
        angry: "When a bird senior stares at my gold from above, I am too scared to open the lid...",
      },
    },
    zh: {
      name: "宝箱怪",
      title: "宝物库箱番",
      race: "拟态少女",
      usualPost: "地下宝物库・拟态守卫",
      traitTitle: "夜间不可单独值勤（昼200 / 夜200・惊喜箱陷阱）",
      traitSummary:
        "昼200 / 夜200。平时躲在宝物库角落箱子里的害羞少女。与米诺陶洛斯或摩根搭档+100，但害怕对闪亮物品敏感的狮鹫（-150）。夜间不可单独配置。",
      quotes: {
        intro: "从、从箱子里面观察我最拿手了……但夜里只有一个人会不敢打开盖子……",
        dayAssign: "伪装成路边的木箱，给敌方斥候一个大惊喜吧。",
        nightAssign: "只要有前辈在旁边，晚上我也能鼓起勇气打开箱盖。",
        offAssign: "回到宝物库角落锁好盖子休息。",
        happy: "箱子的合页很顺滑，惊喜战术圆满成功。",
        angry: "被鸟系前辈从上方死死盯着金币看，会害怕得不敢出箱子……",
      },
    },
  },
  wisp: {
    en: {
      name: "Wisp",
      title: "Corridor Lantern Spirit",
      race: "Will-o'-Wisp",
      usualPost: "Castle Corridors · Night Guide Light",
      traitTitle: "No solo night shift (Day 200 / Night 250 · Foxfire Light)",
      traitSummary:
        "Day 200 / Night 250. Guides dark hallways. Gains +100 with Lich, Banshee, or Ifrit, but Golem's dry furnace exhaust scatters her flame (-150). Cannot guard night shifts alone.",
      quotes: {
        intro: "I am good at lighting the way, so pair me with someone who can hold the gate.",
        dayAssign: "My light is fainter by day, so I will use ground mist as cover.",
        nightAssign: "I will light up every step in the dark. Seniors, handle the rest.",
        offAssign: "Curling up inside my lantern to rest.",
        happy: "Floating and shining beside everyone was fun.",
        angry: "Golem's dry exhaust wind nearly blows out my foxfire...",
      },
    },
    zh: {
      name: "威斯普",
      title: "回廊提灯精灵",
      race: "鬼火精灵",
      usualPost: "城内回廊・夜间引导灯",
      traitTitle: "夜间不可单独值勤（昼200 / 夜250・狐火照明）",
      traitSummary:
        "昼200 / 夜250。平时在昏暗走廊担任照明的小精灵。与巫妖、班西、伊弗利特同班可增强火光+100，但与魔像干燥的炉热相斥（-150）。夜间不可单独配置。",
      quotes: {
        intro: "轻飘飘地照明是我的强项，但一个人守不住城门，请一定要安排同伴和我一起哦。",
        dayAssign: "白天火光不太显眼，我就用脚边的薄雾遮蔽视线吧。",
        nightAssign: "夜里的脚下就由我照亮，剩下的就拜托前辈啦。",
        offAssign: "缩在提灯里团成一团休息啰。",
        happy: "在大家身旁摇曳照亮，真是开心的一周。",
        angry: "吹到魔像先生干燥的热风，狐火都快要熄灭了……",
      },
    },
  },
};

export function getMonsterLocalized(monsterId: MonsterId, lang: GameLang): MonsterProfile {
  const base = MONSTERS[monsterId];
  if (lang === "ja") return base;
  const loc = MONSTER_I18N[monsterId][lang];
  return {
    ...base,
    ...loc,
  };
}

const RELATION_I18N: Record<
  string,
  { en: { title: string; description: string }; zh: { title: string; description: string } }
> = {
  carmilla_pururu_love: {
    en: {
      title: "Caring Night Pair",
      description: "When Carmilla and Pururu share a shift, teamwork adds +100 defense.",
    },
    zh: {
      title: "夜班关照搭档",
      description: "卡蜜拉与普露露同班时，默契配合使防卫力 +100。",
    },
  },
  drago_fenrir_train: {
    en: {
      title: "Master & Pupil Duo",
      description: "When Drago and Fenrir share a shift, coordinated defense adds +100.",
    },
    zh: {
      title: "师徒连携组合",
      description: "德拉戈与芬里尔同班时，呼吸一致的防守使防卫力 +100。",
    },
  },
  fenrir_dullahan_patrol: {
    en: {
      title: "Steadfast Patrol Pair",
      description: "When Fenrir and Dullahan share a shift, steady patrolling adds +100.",
    },
    zh: {
      title: "稳健巡逻搭档",
      description: "芬里尔与杜拉汉同班时，扎实的巡视使防卫力 +100。",
    },
  },
  dullahan_pururu_mentor: {
    en: {
      title: "Senior Knight's Guidance",
      description: "When Dullahan and Pururu share a shift, attentive mentoring adds +100.",
    },
    zh: {
      title: "前辈骑士的支援",
      description: "杜拉汉与普露露同班时，细心指导使防卫力 +100。",
    },
  },
  golem_minotaur_forge: {
    en: {
      title: "Forge Artisans",
      description: "When Golem and Minotaur share a shift, craftsman synergy adds +100.",
    },
    zh: {
      title: "锻造场工匠组合",
      description: "魔像与米诺陶洛斯同班时，默契协作使防卫力 +100。",
    },
  },
  golem_mandra_moss: {
    en: {
      title: "Mossy Giant & Flora",
      description: "When Golem and Mandra share a shift, gentle harmony adds +100.",
    },
    zh: {
      title: "苔藓巨兵与花草",
      description: "魔像与曼德拉同班时，温和的配合使防卫力 +100。",
    },
  },
  behemoth_garuda_wild: {
    en: {
      title: "Sky & Earth Assault",
      description: "When Behemoth and Garuda share a shift, air-ground pincer adds +100.",
    },
    zh: {
      title: "天地强袭组合",
      description: "贝希摩斯与迦楼罗同班时，地面与高空夹击使防卫力 +100。",
    },
  },
  ifrit_wisp_flame: {
    en: {
      title: "Twin Flames",
      description: "When Ifrit and Wisp share a shift, flame resonance adds +100.",
    },
    zh: {
      title: "大小灯火组合",
      description: "伊弗利特与威斯普同班时，火焰共鸣使防卫力 +100。",
    },
  },
  lich_wisp_library: {
    en: {
      title: "Archive Reading Light",
      description: "When Lich and Wisp share a shift, quiet mana support adds +100.",
    },
    zh: {
      title: "书库阅读灯搭档",
      description: "巫妖与威斯普同班时，安静的魔力辅助使防卫力 +100。",
    },
  },
  lich_gargoyle_silent: {
    en: {
      title: "Silent Guardians",
      description: "When Lich and Gargoyle share a shift, wordless coordination adds +100.",
    },
    zh: {
      title: "静寂守护者搭档",
      description: "巫妖与石像鬼同班时，无言的默契使防卫力 +100。",
    },
  },
  morgan_arachne_weave: {
    en: {
      title: "Starlight Web Trap",
      description: "When Morgan and Arachne share a shift, astral silver webs add +100.",
    },
    zh: {
      title: "星丝魔导陷阱",
      description: "摩根与阿拉克涅同班时，魔术与银丝陷阱使防卫力 +100。",
    },
  },
  morgan_mimic_mystery: {
    en: {
      title: "Illusion Surprise Box",
      description: "When Morgan and Mimic share a shift, illusion decoys add +100.",
    },
    zh: {
      title: "幻惑惊喜箱",
      description: "摩根与宝箱怪同班时，幻术诱导使防卫力 +100。",
    },
  },
  carmilla_banshee_nocturne: {
    en: {
      title: "Moonlight Nocturne",
      description: "When Carmilla and Banshee share a shift, elegant night harmony adds +100.",
    },
    zh: {
      title: "月下夜想曲搭档",
      description: "卡蜜拉与班西同班时，优雅的夜间配合使防卫力 +100。",
    },
  },
  banshee_wisp_mist: {
    en: {
      title: "Night Mist & Foxfire",
      description: "When Banshee and Wisp share a shift, illusory mist adds +100.",
    },
    zh: {
      title: "夜雾与狐火幻想",
      description: "班西与威斯普同班时，幻想般的扰敌使防卫力 +100。",
    },
  },
  garuda_griffon_sky: {
    en: {
      title: "Air Superiority Patrol",
      description: "When Garuda and Griffon share a shift, aerial teamwork adds +100.",
    },
    zh: {
      title: "制空哨戒组合",
      description: "迦楼罗与狮鹫同班时，空中连携使防卫力 +100。",
    },
  },
  centaur_mandra_forest: {
    en: {
      title: "Forest Blessing Duo",
      description: "When Centaur and Mandra share a shift, herbal arrows add +100.",
    },
    zh: {
      title: "森林恩惠组合",
      description: "半人马与曼德拉同班时，箭矢与药草配合使防卫力 +100。",
    },
  },
  griffon_dullahan_honor: {
    en: {
      title: "Chivalrous Knights",
      description: "When Griffon and Dullahan share a shift, honorable formation adds +100.",
    },
    zh: {
      title: "高洁骑士道搭档",
      description: "狮鹫与杜拉汉同班时，铁壁礼节使防卫力 +100。",
    },
  },
  minotaur_mimic_craft: {
    en: {
      title: "Chest Hinge Maintenance",
      description: "When Minotaur and Mimic share a shift, sturdy craftsmanship adds +100.",
    },
    zh: {
      title: "宝箱金具保养",
      description: "米诺陶洛斯与宝箱怪同班时，坚固的防守使防卫力 +100。",
    },
  },
  arachne_mandra_garden: {
    en: {
      title: "Greenhouse Pest Ward",
      description: "When Arachne and Mandra share a shift, smooth teamwork adds +100.",
    },
    zh: {
      title: "温室防虫搭档",
      description: "阿拉克涅与曼德拉同班时，默契配合使防卫力 +100。",
    },
  },
  carmilla_dullahan_clash: {
    en: {
      title: "Incompatible: Stoic Knight & Night Noble",
      description: "Carmilla and Dullahan clash over stiff lectures, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：死板骑士与夜贵族",
      description: "卡蜜拉与杜拉汉互相排斥，同班时防卫力 -150。",
    },
  },
  drago_lich_clash: {
    en: {
      title: "Incompatible: Elder Dragon & Fussy Librarian",
      description: "Drago and Lich bicker over stray sparks and nagging, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：豪迈古龙与唠叨馆长",
      description: "德拉戈与巫妖彼此嫌弃，同班时防卫力 -150。",
    },
  },
  fenrir_banshee_clash: {
    en: {
      title: "Incompatible: Loud Howl & Quiet Spirit",
      description: "Banshee cannot stand Fenrir's loud howling, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：大嗓门与喜静之灵",
      description: "班西受不了芬里尔的嚎叫，同班时防卫力 -150。",
    },
  },
  ifrit_mandra_clash: {
    en: {
      title: "Incompatible: Scorching Flame & Flora",
      description: "Mandra fears Ifrit's heat singeing her leaves, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：灼热之炎与草木",
      description: "曼德拉害怕被伊弗利特的热气烤焦叶子，同班时防卫力 -150。",
    },
  },
  behemoth_arachne_clash: {
    en: {
      title: "Incompatible: Web Traps & Rampaging Brute",
      description: "Arachne hates Behemoth trampling her silver threads, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：丝网陷阱与怪力巨兽",
      description: "阿拉克涅嫌弃贝希摩斯踩坏银丝，同班时防卫力 -150。",
    },
  },
  garuda_gargoyle_clash: {
    en: {
      title: "Incompatible: Gale Flyer & Still Statue",
      description: "Garuda and Gargoyle have opposite paces, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：疾风与不动石像",
      description: "迦楼罗与石像鬼节奏完全不合，同班时防卫力 -150。",
    },
  },
  morgan_centaur_clash: {
    en: {
      title: "Incompatible: Free Spirit & Strict Timekeeper",
      description: "Punctual Centaur and night-owl Morgan argue, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：随性魔女与严守时间",
      description: "严守时间的半人马与夜猫子摩根争执不断，同班时防卫力 -150。",
    },
  },
  griffon_mimic_clash: {
    en: {
      title: "Incompatible: Shiny Gold & Chest Keeper",
      description: "Mimic fears Griffon's gaze on her gold coins, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：闪亮金币与箱番",
      description: "宝箱怪害怕紧盯闪亮物品的狮鹫，同班时防卫力 -150。",
    },
  },
  golem_wisp_clash: {
    en: {
      title: "Incompatible: Furnace Exhaust & Foxfire",
      description: "Golem's dry heat scatters Wisp's lantern flame, reducing defense by -150 when sharing a shift.",
    },
    zh: {
      title: "同班排斥：干燥炉热与狐火",
      description: "魔像的排热会吹乱威斯普的狐火，同班时防卫力 -150。",
    },
  },
  carmilla_minotaur_clash: {
    en: {
      title: "Incompatible: Noble's Disdain",
      description: "Carmilla refuses to share a waiting room with sweaty Minotaur, reducing defense by -150.",
    },
    zh: {
      title: "同班排斥：贵族的挑剔",
      description: "卡蜜拉嫌弃刚出锻造场的米诺陶洛斯汗味重，同班时防卫力 -150。",
    },
  },
};

export function getRelationLocalized(rel: PairRelation, lang: GameLang): PairRelation {
  if (lang === "ja") return rel;
  const loc = RELATION_I18N[rel.id]?.[lang];
  if (!loc) return rel;
  return {
    ...rel,
    title: loc.title,
    description: loc.description,
  };
}

const ENEMY_NAME_I18N: Record<string, { en: string; zh: string; quoteEn: string; quoteZh: string }> = {
  "先遣隊・重装前衛群": {
    en: "Vanguard Heavy Frontline",
    zh: "先遣队・重装前卫群",
    quoteEn: "To protect the human towns, we will survey this forest fortress.",
    quoteZh: "为了守护人类的城镇，我们要调查这座森林要塞。",
  },
  "先遣隊・夜間斥候班": {
    en: "Vanguard Night Scouts",
    zh: "先遣队・夜间斥候班",
    quoteEn: "Under cover of night, we will probe weak points at the gate.",
    quoteZh: "趁着夜色探查城门防守薄弱的地方。",
  },
  "王国軍・歩兵巡回隊": {
    en: "Royal Infantry Patrol",
    zh: "王国军・步兵巡逻队",
    quoteEn: "Daytime patrol squad. Push through the front gate.",
    quoteZh: "日间巡逻队，突破前方的城门。",
  },
  "討伐軍・夜襲工作班": {
    en: "Expedition Night Saboteurs",
    zh: "讨伐军・夜袭工兵班",
    quoteEn: "Approach without a sound and slip past the sentries.",
    quoteZh: "放轻脚步靠近，绕过哨兵。",
  },
  "王国軍・森林弓兵団": {
    en: "Royal Forest Archers",
    zh: "王国军・森林弓兵团",
    quoteEn: "Advance within bowshot and ready your arrows.",
    quoteZh: "推进到弓箭射程之内，做好准备。",
  },
  "勇者軍・紅蓮魔導団": {
    en: "Hero's Crimson Mage Corps",
    zh: "勇者军・红莲魔导团",
    quoteEn: "Pry open the night gate with arcane fire.",
    quoteZh: "用魔导之火撬开夜间的城门。",
  },
  "王国軍・重装歩兵団": {
    en: "Royal Heavy Infantry",
    zh: "王国军・重装步兵团",
    quoteEn: "Line up shields and advance from the front.",
    quoteZh: "从正面列盾推进，打开城门。",
  },
  "討伐軍・夜間斥候班": {
    en: "Expedition Night Scouts",
    zh: "讨伐军・夜间斥候班",
    quoteEn: "Scale the ramparts when the night watch leaves a gap.",
    quoteZh: "趁夜班出现空隙翻越城墙。",
  },
  "王国軍・外縁巡回隊": {
    en: "Royal Perimeter Patrol",
    zh: "王国军・外围巡逻队",
    quoteEn: "Secure the forest perimeter step by step.",
    quoteZh: "从森林外围依次压制。",
  },
  "討伐軍・隠密工作小隊": {
    en: "Expedition Stealth Platoon",
    zh: "讨伐军・隐密工作小队",
    quoteEn: "The vampire is off duty tonight. Now is our chance.",
    quoteZh: "今晚吸血鬼似乎休班，正是好机会。",
  },
  "討伐軍・前衛剣士隊": {
    en: "Expedition Vanguard Swordsmen",
    zh: "讨伐军・前卫剑士队",
    quoteEn: "Days of skirmishes must have tired the castle guards.",
    quoteZh: "连日攻防之下，城里的守军应该已经疲惫了。",
  },
  "勇者軍・夜間強襲団": {
    en: "Hero's Night Assault Corps",
    zh: "勇者军・夜间强袭团",
    quoteEn: "Strike from two directions at once and break through.",
    quoteZh: "从两个方向同时发动奇袭，一举突破。",
  },
  "王国軍・包囲歩兵団": {
    en: "Royal Siege Infantry",
    zh: "王国军・包围步兵团",
    quoteEn: "Tighten the siege over four days, starting with the main gate.",
    quoteZh: "用四天时间缩小包围圈，先从正门开始。",
  },
  "勇者軍・精鋭夜襲隊": {
    en: "Hero's Elite Night Raiders",
    zh: "勇者军・精锐夜袭队",
    quoteEn: "Strike the gatekeepers under cover of darkness.",
    quoteZh: "借着夜色一举击破门卫。",
  },
  "討伐軍・水路偵察班": {
    en: "Expedition Aqueduct Recon",
    zh: "讨伐军・水路侦察班",
    quoteEn: "Inspect the aqueduct entrance with a small team.",
    quoteZh: "调查水路入口，小股人马即可。",
  },
  "水路潜入・忍び分隊": {
    en: "Aqueduct Stealth Squad",
    zh: "水路潜入・忍者分队",
    quoteEn: "Slip silently into the castle through the underground waterway.",
    quoteZh: "从地下水路悄无声息地潜入城内。",
  },
  "勇者軍・攻城魔導団": {
    en: "Hero's Siege Mage Corps",
    zh: "勇者军・攻城魔导团",
    quoteEn: "Focus all mana to shatter the gate barrier.",
    quoteZh: "集中全部魔力，击碎城门结界。",
  },
  "討伐軍・月下狩猟団": {
    en: "Expedition Moonlit Hunters",
    zh: "讨伐军・月下狩猎团",
    quoteEn: "The night fog is thick. Cross the palisade now.",
    quoteZh: "夜雾正浓，趁现在翻越栅栏。",
  },
  "討伐軍・裏門突入隊": {
    en: "Expedition Rear Gate Raiders",
    zh: "讨伐军・后门突入队",
    quoteEn: "It is the final night. All units rush the rear gate.",
    quoteZh: "最后一夜了，全员突入后门。",
  },
  "王国軍・白銀歩兵団": {
    en: "Royal Silver Infantry",
    zh: "王国军・白银步兵团",
    quoteEn: "First wave forward. Protect the human towns from further harm.",
    quoteZh: "第一阵前进，绝不让人类城镇再受波及。",
  },
  "討伐軍・夜間斥候隊": {
    en: "Expedition Night Recon",
    zh: "讨伐军・夜间斥候队",
    quoteEn: "Slip through the night woods and circle to the rear gate.",
    quoteZh: "穿过夜色中的森林，绕向后门。",
  },
  "勇者軍・重装破城団": {
    en: "Hero's Heavy Breachers",
    zh: "勇者军・重装破城团",
    quoteEn: "Bring the battering ram forward and force the gate open.",
    quoteZh: "推进攻城槌，撞开城门。",
  },
  "討伐軍・隠密工作隊": {
    en: "Expedition Covert Ops",
    zh: "讨伐军・隐密工作队",
    quoteEn: "Advance quietly and strike the sentries' blind spot.",
    quoteZh: "安静前进，突袭哨兵的死角。",
  },
  "王国軍・魔導砲撃隊": {
    en: "Royal Arcane Artillery",
    zh: "王国军・魔导炮击队",
    quoteEn: "Pin them down from afar until the night main force arrives.",
    quoteZh: "从远距离压制，衔接夜间的主力部队。",
  },
  "勇者軍・月下狩猟団": {
    en: "Hero's Moonlit Hunters",
    zh: "勇者军・月下狩猎团",
    quoteEn: "Under the full moon, the werewolf cannot come out. Strike now.",
    quoteZh: "满月之夜狼人无法出战，现在正是良机。",
  },
  "王国軍・大橋狙撃隊": {
    en: "Royal Great-Bridge Snipers",
    zh: "王国军・大桥狙击队",
    quoteEn: "Cross the ravine bridge and provide covering fire.",
    quoteZh: "跨过溪流大桥，掩护部队推进。",
  },
  "討伐軍・水路工作班": {
    en: "Expedition Aqueduct Sappers",
    zh: "讨伐军・水路工兵班",
    quoteEn: "Target the waterway grate and finish quickly.",
    quoteZh: "瞄准水路铁栅，速战速决。",
  },
  "勇者軍・先鋒騎士団": {
    en: "Hero's Vanguard Knights",
    zh: "勇者军・先锋骑士团",
    quoteEn: "My lance will clear the path. All units follow.",
    quoteZh: "以我之枪开辟道路，全军跟上。",
  },
  "討伐軍・夜間包囲隊": {
    en: "Expedition Night Siege Unit",
    zh: "讨伐军・夜间包围队",
    quoteEn: "By the end of the week, the garrison must be worn out.",
    quoteZh: "到了周末，守城兵力肯定已经疲惫不堪。",
  },
  "勇者軍・先鋒重装団": {
    en: "Hero's Heavy Vanguard",
    zh: "勇者军・先锋重装团",
    quoteEn: "The vanguard of the Hero's main force advances.",
    quoteZh: "勇者主力先锋，全军推进。",
  },
  "勇者軍・高位魔導団": {
    en: "Hero's High Mage Corps",
    zh: "勇者军・高位魔导团",
    quoteEn: "Rain arcane bolts from the night sky and press forward.",
    quoteZh: "从夜空倾泻魔导弹，不要退缩。",
  },
  "王国軍・精鋭弓騎団": {
    en: "Royal Elite Mounted Archers",
    zh: "王国军・精锐弓骑团",
    quoteEn: "Disrupt their ranks and keep pressure until the main force arrives.",
    quoteZh: "打乱敌方阵脚，在主力抵达前持续施压。",
  },
  "討伐軍・隠密本隊": {
    en: "Expedition Main Stealth Force",
    zh: "讨伐军・隐密本队",
    quoteEn: "Shake their defenses from both the rear gate and aqueduct at once.",
    quoteZh: "从后门与水路同时发动奇袭动摇防线。",
  },
  "教国軍・聖堂親衛隊": {
    en: "Papal Paladin Guard",
    zh: "教国军・圣堂亲卫队",
    quoteEn: "For the peace of human towns, we shall seal this forest stronghold.",
    quoteZh: "为了人类城镇的安宁，攻下这座森林城池。",
  },
  "王国軍・攻城重砲隊": {
    en: "Royal Heavy Siege Battery",
    zh: "王国军・攻城重炮队",
    quoteEn: "Push our lines right up to the main gate.",
    quoteZh: "把阵线推到正门跟前。",
  },
  "討伐軍・夜間工兵隊": {
    en: "Expedition Night Engineers",
    zh: "讨伐军・夜间工兵队",
    quoteEn: "Weaken the rampart footing ahead of tomorrow's decisive battle.",
    quoteZh: "为明天的决战做准备，破坏城墙地基。",
  },
  "勇者軍・前衛突破隊": {
    en: "Hero's Frontline Breachers",
    zh: "勇者军・前卫突破队",
    quoteEn: "The Hero's main party arrives tonight. Draw the gatekeepers out.",
    quoteZh: "勇者主力今夜抵达，把门卫引出来。",
  },
  "勇者一行・決戦本隊": {
    en: "Hero's Party · Decisive Force",
    zh: "勇者一行・决战主力",
    quoteEn: "This is the final battle. All forces charge the main gate.",
    quoteZh: "这是最后的攻防战了，全军突击正门。",
  },
  "先遣隊・剣士＆弓兵班": {
    en: "Vanguard Swords & Bows",
    zh: "先遣队・剑士与弓兵班",
    quoteEn: "To stop damage to the town, we test the gate's defense.",
    quoteZh: "为了阻止城镇受损，先试探城门的防卫。",
  },
  "王国軍・重装盾兵団": {
    en: "Royal Heavy Shield Phalanx",
    zh: "王国军・重装盾兵团",
    quoteEn: "Push straight through from the front.",
    quoteZh: "从正面强行推进。",
  },
  "森林部隊・長弓狙撃団": {
    en: "Forest Longbow Snipers",
    zh: "森林部队・长弓狙击团",
    quoteEn: "Snipe from the grove and never miss an opening.",
    quoteZh: "从林间狙击，绝不放过任何破绽。",
  },
  "教国軍・聖堂騎士団": {
    en: "Papal Cathedral Knights",
    zh: "教国军・圣堂骑士团",
    quoteEn: "To protect people's lives, we seal this stronghold.",
    quoteZh: "为了守护人们的日常生活，封锁这座要塞。",
  },
  "裏門工作・隠密小隊": {
    en: "Rear Gate Stealth Platoon",
    zh: "后门工作・隐密小队",
    quoteEn: "Strike during the guard change without making a sound.",
    quoteZh: "瞄准换岗间隙，不要发出声响。",
  },
  "勇者一行・精鋭本隊": {
    en: "Hero's Party · Elite Force",
    zh: "勇者一行・精锐主力",
    quoteEn: "Time to settle everything. Open the gate.",
    quoteZh: "该做个了断了，打开城门吧。",
  },
};

export function getRequirementLocalized(
  req: ShiftSlotRequirement,
  lang: GameLang
): { enemyName: string; enemyQuote: string } {
  if (lang === "ja") {
    return {
      enemyName: req.enemyName,
      enemyQuote: req.enemyQuote ?? "街の平穏のため、この門を突破する。",
    };
  }
  const entry = ENEMY_NAME_I18N[req.enemyName];
  if (entry) {
    return {
      enemyName: lang === "en" ? entry.en : entry.zh,
      enemyQuote: lang === "en" ? entry.quoteEn : entry.quoteZh,
    };
  }
  return {
    enemyName: req.enemyName,
    enemyQuote:
      lang === "en"
        ? "For the peace of the town, we will break through this gate."
        : "为了城镇的安宁，突破这座城门。",
  };
}

export function getRequestedOffReasonLocalized(
  reason: string,
  monsterId: MonsterId,
  lang: GameLang
): string {
  if (lang === "ja") return reason;
  const known: Record<string, { en: string; zh: string }> = {
    休息日: { en: "Rest Day", zh: "休息日" },
    水辺での休養: { en: "Waterside Rest", zh: "水边休养" },
    古傷の療養日: { en: "Old Wound Care", zh: "旧伤疗养" },
    武具の手入れ: { en: "Armor Maintenance", zh: "保养武具" },
    武具の点検: { en: "Gear Inspection", zh: "检查武具" },
    書庫の目録整理: { en: "Archive Cataloging", zh: "整理书库目录" },
  };
  if (known[reason]) return known[reason][lang];
  const m = getMonsterLocalized(monsterId, lang);
  const postPart = (m.usualPost ?? "").split(/[·・]/)[0]?.trim() ?? "";
  return lang === "en" ? `${postPart} Duty / Rest` : `${postPart}当班・休养`;
}

export function getStageLocalized(
  stage: StageScenario,
  lang: GameLang
): {
  title: string;
  subtitle: string;
  newRuleTitle: string;
  newRuleSummary: string;
  lilithIntro: string;
  lilithHint: string;
} {
  if (lang === "ja") {
    return {
      title: stage.title,
      subtitle: stage.subtitle,
      newRuleTitle: stage.newRuleTitle,
      newRuleSummary: stage.newRuleSummary,
      lilithIntro: stage.lilithIntro,
      lilithHint: stage.lilithHint,
    };
  }

  const calShort = formatCastleCalendarMonthLocalized(stage.weekNumber, false, lang);
  const calFull = formatCastleCalendarMonthLocalized(stage.weekNumber, true, lang);
  const isRetry = stage.subtitle.includes("新編成");
  const rosterNames = stage.availableMonsters
    .map((id) => getMonsterLocalized(id, lang).name)
    .join(lang === "en" ? ", " : "・");

  if (isRetry) {
    return {
      title:
        lang === "en"
          ? `${calShort}: Main Gate Defense (${stage.numDays ?? 5} Days · New Lineup)`
          : `${calShort}：正门防卫排班（${stage.numDays ?? 5}天・新编成）`,
      subtitle:
        lang === "en"
          ? `On-duty roster: ${rosterNames} (Reorganized)`
          : `本周正门值班：${rosterNames}（新编成）`,
      newRuleTitle:
        lang === "en"
          ? "Updated Lineup & Enemy Formation"
          : "重新编排的值班成员与敌军阵容",
      newRuleSummary:
        lang === "en"
          ? `Following the previous battle, the on-duty roster and enemy march schedule have been reorganized. This week's ${stage.availableMonsters.length} guards are ${rosterNames}.`
          : `根据上一轮战况，本周的值班成员与敌军进军编成已重新调整。本次由 ${rosterNames} 共${stage.availableMonsters.length}名成员负责正门防卫。`,
      lilithIntro:
        lang === "en"
          ? `New recon reports have arrived. Our on-duty guards this time are ${rosterNames}. Check enemy power and everyone's work rules to build the shift.`
          : `收到了新的进军预测。本次负责正门值班的是 ${rosterNames} 共${stage.availableMonsters.length}名成员，请结合敌方战力与大家的勤务条件来编排班表吧。`,
      lilithHint:
        lang === "en"
          ? "Check requested days off and Full Moon nights first, then place your heavy hitter who can only work every other day onto the toughest raids."
          : "请先确认指定休息日与满月之夜，再优先决定只能隔天出勤的主力重将安排在哪几个强敌时段。",
    };
  }

  if (stage.id === "week-1") {
    return {
      title:
        lang === "en"
          ? `${calShort}: Vanguard Recon (3 Days)`
          : `${calShort}：先遣队的侦察（3天）`,
      subtitle:
        lang === "en"
          ? `${calFull} — Assign 3 guards to their best hours across a 3-day schedule.`
          : `${calFull} — 先从3天排班开始，将3名警备成员安排在各自擅长的时间段。`,
      newRuleTitle:
        lang === "en"
          ? "Core Rule: Best Hours & Drago's Rest"
          : "基础规则：擅长时段与德拉戈的休养",
      newRuleSummary:
        lang === "en"
          ? "Fenrir excels by day (400) and Carmilla excels at night (400). Drago (500) is strong day or night, but must rest the day after working."
          : "芬里尔擅长白班（防卫力400），卡蜜拉擅长夜班（防卫力400）。德拉戈（防卫力500）昼夜皆可独当一面，但出勤1天后次日必须休息。",
      lilithIntro:
        lang === "en"
          ? "Since this is your first shift schedule, let us build it together step by step. We have 3 guards covering Monday through Wednesday against the enemy vanguard."
          : "这是您第一次编排班表，先由我陪同您一起完成吧。我们需要安排3名成员负责周一至周三的守卫，应对敌方先遣部队。",
      lilithHint:
        lang === "en"
          ? "Place Drago (500) on Monday Day and Wednesday Night where tough squads attack, and let him rest on Tuesday. Assign Fenrir (400) to the remaining Day shifts and Carmilla (400) to Night."
          : "将德拉戈（500）安排在强敌来袭的周一昼与周三夜，周二让他休息；其余白班交给芬里尔（400），夜班交给卡蜜拉（400）即可稳守。",
    };
  }

  if (stage.id === "week-2") {
    return {
      title:
        lang === "en"
          ? `${calShort}: Night Raiders Approach (3 Days)`
          : `${calShort}：夜袭部队逼近（3天）`,
      subtitle:
        lang === "en"
          ? "Dullahan joins from the outer rampart. Watch out for pair synergy (+100) and incompatible pairs (-150)."
          : "杜拉汉从外郭合流。注意搭档连携（+100）与不愿同班的排斥组合（-150）。",
      newRuleTitle:
        lang === "en"
          ? "New Rule: No Day After Night · Synergy & Incompatible Pairs"
          : "追加规则：夜班次日不可上白班・搭档默契与同班排斥",
      newRuleSummary:
        lang === "en"
          ? "A guard on Night shift cannot take the next morning's Day shift (Night -> Night is allowed). Friendly pairs (Fenrir + Dullahan) gain +100 defense together, while incompatible pairs (Carmilla + Dullahan) argue and lose -150 defense."
          : "上夜班的成员次日清晨不能直接上白班（夜→夜可以）。此外，合得来的搭档（芬里尔＋杜拉汉）同班可提升100防卫力，而互相排斥的组合（卡蜜拉＋杜拉汉）同班会因争执降低150防卫力。",
      lilithIntro:
        lang === "en"
          ? "This month Drago is covering the rear gate, and spectral knight Dullahan joins the main gate. However, Carmilla dislikes sharing a shift with stiff Dullahan, so keep them in separate slots."
          : "本月德拉戈调往后门值勤，重装骑士杜拉汉加入正门班表。不过卡蜜拉不愿与死板的杜拉汉同班，请把他们安排在不同时段吧。",
      lilithHint:
        lang === "en"
          ? "Pairing Fenrir (Day 400) and Dullahan (Day 300) on Monday Day triggers their +100 synergy for 800 total defense."
          : "周一白班同时安排芬里尔（昼400）与杜拉汉（昼300），加上连携加成（+100）可达800防卫力，轻松守住正门。",
    };
  }

  if (stage.id === "week-3") {
    return {
      title:
        lang === "en"
          ? `${calShort}: Four-Day Siege (4 Days)`
          : `${calShort}：四日围城（4天）`,
      subtitle:
        lang === "en"
          ? "Rookie slime Pururu joins from the aqueduct for a 4-day shift."
          : "新晋史莱姆普露露从地下水路前来支援，编排4天班表。",
      newRuleTitle:
        lang === "en"
          ? "New Rule: Rookie Night Partner & Max 3 Consecutive Days"
          : "追加规则：新人夜间搭档与连续出勤上限",
      newRuleSummary:
        lang === "en"
          ? "Rookie Pururu (200) cannot work Night shift alone; pair her with a senior at night (pairing with Carmilla adds +100). Also, no guard can work more than 3 consecutive days, so everyone needs at least 1 day off in 4 days."
          : "新人普露露（防卫力200）无法独自承担夜班，夜间必须与前辈同班（与卡蜜拉同班可额外+100）。此外每位成员最多连续工作3天，4天内至少要安排1天休息。",
      lilithIntro:
        lang === "en"
          ? "Enemy forces have camped around the woods for a 4-day siege. Rookie Pururu is helping from the aqueduct—always pair her with a senior if she takes a night shift."
          : "敌军在森林四周扎营，战局延长到了4天。本月由地下水路的普露露前来支援，若安排普露露上夜班，请务必让前辈陪同。",
      lilithHint:
        lang === "en"
          ? "Assigning Carmilla (Night 400) and Pururu (Night 200) together on Thursday Night grants +100 synergy for 700 total defense."
          : "周四夜班将卡蜜拉（夜400）与普露露（夜200）排在一起，加上连携加成（+100）即可达到700防卫力。",
    };
  }

  if (stage.id === "week-4") {
    return {
      title:
        lang === "en"
          ? `${calShort}: Full Moon Defense (5 Days · 5 Guards)`
          : `${calShort}：满月攻防战（5天・5人值班）`,
      subtitle:
        lang === "en"
          ? "Full 5-day schedule with 5 guards. Handle Wednesday's Full Moon and pair relations."
          : "5人阵容应对5天完整班表，处理周三满月之夜与成员间的搭档关系。",
      newRuleTitle:
        lang === "en"
          ? "New Rule: Full Moon Night & Weekly Shift Cap"
          : "追加规则：满月之夜与每周出勤上限",
      newRuleSummary:
        lang === "en"
          ? "On Wednesday's Full Moon night, Fenrir cannot take the Night shift (Wednesday Day is allowed). Over 5 days, Drago can work at most 3 shifts and other guards at most 4 shifts."
          : "周三满月之夜，芬里尔无法配置在夜班（周三白班可以）。在5天班表中，德拉戈最多出勤3次，其余成员最多出勤4次。",
      lilithIntro:
        lang === "en"
          ? "Five guards are on main gate duty this month. Wednesday night is a Full Moon, so Fenrir cannot work that night. Avoid putting Carmilla and Dullahan in the same slot (-150) while respecting everyone's requested days off."
          : "本月正门值班共有5名成员。周三夜晚适逢满月，芬里尔无法上夜班。请避开卡蜜拉与杜拉汉的同班排斥（-150），并留意各自的指定休息日。",
      lilithHint:
        lang === "en"
          ? "Since Fenrir cannot work Wednesday Night, pick two from Carmilla, Dullahan, Pururu, and Drago. Pairing Pururu with Carmilla or Dullahan avoids the -150 clash between Carmilla and Dullahan."
          : "周三满月夜芬里尔无法出战，需从卡蜜拉、杜拉汉、普露露、德拉戈中选2人。善用普露露与前辈的连携，即可避开卡蜜拉与杜拉汉的同班排斥（-150）。",
    };
  }

  if (stage.id === "week-5") {
    return {
      title:
        lang === "en"
          ? `${calShort}: Hero's Main Force (5 Days · 6 Guards)`
          : `${calShort}：勇者主力进军（5天・6人扩编值班）`,
      subtitle:
        lang === "en"
          ? "Chief Librarian Lich joins to form a 6-guard lineup against the Hero's main party."
          : "随着勇者主力逼近，地下书库馆长巫妖加入组成6人防线，避开排斥组合全力防守。",
      newRuleTitle:
        lang === "en"
          ? "Decisive Month: 6-Guard Lineup & Conflict Management"
          : "决战之月：6人扩编排班与同班排斥协调",
      newRuleSummary:
        lang === "en"
          ? "Chief Librarian Lich (Night 400) joins for a 6-guard lineup. However, Lich dislikes sharing a shift with Drago (-150), and Carmilla clashes with Dullahan (-150). Save enough stamina so 3 guards can defend Friday Night's decisive raid."
          : "为迎战敌方主力，地下书库馆长巫妖（夜400）加入形成6人态势。但巫妖讨厌与德拉戈同班（-150），卡蜜拉也排斥与杜拉汉同班（-150）。请合理分配体力，确保周五夜班有3名成员迎战勇者主力。",
      lilithIntro:
        lang === "en"
          ? "The Hero's main force is finally on the move. With Lich joining from the archives, 6 guards protect the main gate. Keep Drago apart from Lich and Carmilla apart from Dullahan, and hold Friday Night with 3 guards."
          : "敌方主力终于出动了。本月特邀地下书库的巫妖支援，以6名成员共同把守正门。请注意别让德拉戈与巫妖、卡蜜拉与杜拉汉同班，并在周五夜晚集结3人守住城门。",
      lilithHint:
        lang === "en"
          ? "We now have 3 strong night guards: Carmilla, Dullahan, and Lich. Assign Drago to Mon Day, Wed Day, and Fri Night, and pair Drago + Carmilla + Pururu (or Dullahan + Pururu) on Friday Night to avoid the Drago-Lich penalty."
          : "擅长夜班的成员增加到了卡蜜拉、杜拉汉、巫妖3人。可将德拉戈排在周一昼、周三昼与周五夜，周五夜用德拉戈＋卡蜜拉＋普露露（或杜拉汉＋普露露）即可避开巫妖与德拉戈的排斥。",
    };
  }

  // Endless adaptive stage (Week 6+)
  const tier = stage.difficultyTier ?? 3;
  const diffLabel = getDifficultyLabelLocalized(tier, lang);
  const numDays = stage.numDays ?? 5;
  const heavyId = stage.availableMonsters[0] ?? "drago";
  const heavyName = getMonsterLocalized(heavyId, lang).name;
  return {
    title:
      lang === "en"
        ? `${calShort}: Main Gate Shift (${numDays} Days · ${stage.availableMonsters.length} Guards)`
        : `${calShort}：正门防卫排班（${numDays}天・${stage.availableMonsters.length}人值班）`,
    subtitle:
      lang === "en"
        ? `On-duty roster: ${rosterNames} (Difficulty: ${diffLabel})`
        : `本月正门值班：${rosterNames}（难度：${diffLabel}）`,
    newRuleTitle:
      lang === "en"
        ? `${calShort} Roster (${stage.availableMonsters.length} Guards · ${diffLabel})`
        : `${calShort} 正门值班（${stage.availableMonsters.length}人编成・${diffLabel}）`,
    newRuleSummary:
      lang === "en"
        ? `Based on your recent defense record, ${stage.availableMonsters.length} guards (${rosterNames}) have been called to the main gate for a ${numDays}-day shift. Use friendly pairs (+100) and avoid incompatible pairs (-150).`
        : `根据近期的警备记录，本月从城内20名成员中召集了${stage.availableMonsters.length}名（${rosterNames}）负责${numDays}天的正门防卫。请活用默契搭档（+100）并避开同班排斥组合（-150）。`,
    lilithIntro:
      lang === "en"
        ? `Recon reports for ${calShort} have arrived. Our ${stage.availableMonsters.length} on-duty guards are ${rosterNames}. Watch everyone's best hours and incompatible partners as we build the schedule.`
        : `${calShort}的进军预测已经送达。本月正门值班为 ${rosterNames} 共${stage.availableMonsters.length}名成员，请留意各自擅长的时间段与同班排斥关系来编排班表吧。`,
    lilithHint:
      lang === "en"
        ? `Check requested days off and Full Moon nights first, then decide which tough raids ${heavyName} (who works every other day) should cover.`
        : `请先确认指定休息日与满月之夜，再决定只能隔天出勤的${heavyName}分配到哪几个强敌时段。`,
  };
}

export function getTutorialStepLocalized(
  step: {
    stepIndex: number;
    totalSteps: number;
    day: DayIndex;
    monsterId: MonsterId;
    targetShift: "off" | "day" | "night";
    shortCallout: string;
    instruction: string;
  },
  lang: GameLang
): { shortCallout: string; instruction: string } {
  if (lang === "ja") {
    return { shortCallout: step.shortCallout, instruction: step.instruction };
  }
  const idx = step.stepIndex;
  const enSteps: Record<number, { shortCallout: string; instruction: string }> = {
    1: {
      shortCallout: "Let us build this together. Click 'Day' for Drago on Mon",
      instruction:
        "Let us build the first shift together (1/6). A tough vanguard squad attacks on Monday Day, so select 'Day' for Drago (500 defense) on Monday.",
    },
    2: {
      shortCallout: "Next is Mon Night. Click 'Night' for Carmilla (Night 400)",
      instruction:
        "Nicely done (2/6). For Monday Night, let us assign night specialist Carmilla (Night 400). Select 'Night' for Carmilla on Monday.",
    },
    3: {
      shortCallout: "Drago rests on Tue. Click 'Day' for Fenrir (Day 400)",
      instruction:
        "Looking good (3/6). Drago needs a rest day after working, so select 'Day' for daytime specialist Fenrir (Day 400) on Tuesday.",
    },
    4: {
      shortCallout: "Click 'Night' for Carmilla on Tue as well",
      instruction:
        "Keep it up (4/6). Let Carmilla handle Tuesday Night as well. Select 'Night' for Carmilla on Tuesday.",
    },
    5: {
      shortCallout: "Click 'Day' for Fenrir on Wed",
      instruction:
        "Almost there (5/6). Select 'Day' for Fenrir on Wednesday to cover the daytime patrol.",
    },
    6: {
      shortCallout: "Finally, click 'Night' for well-rested Drago on Wed",
      instruction:
        "Final step (6/6). The Crimson Mage Corps attacks on Wednesday Night—assign Drago, who rested on Tuesday, to 'Night' on Wednesday to complete the schedule.",
    },
  };
  const zhSteps: Record<number, { shortCallout: string; instruction: string }> = {
    1: {
      shortCallout: "先一起来排班吧，请点击德拉戈周一的「昼」",
      instruction:
        "先和我一起编排吧（1/6）。周一白天有强悍的「先遣队・重装前卫群」来袭，请在防卫力500的德拉戈周一格子中选择「昼」。",
    },
    2: {
      shortCallout: "接着是周一夜晚，请点击卡蜜拉（夜400）的「夜」",
      instruction:
        "很好（2/6）。周一夜晚就交给擅长夜班的卡蜜拉（夜400）吧，请在卡蜜拉周一格子中选择「夜」。",
    },
    3: {
      shortCallout: "周二让德拉戈休息，请点击芬里尔（昼400）的「昼」",
      instruction:
        "进展顺利（3/6）。德拉戈工作一天后次日需要休息，周二白天请选择擅长白班的芬里尔（昼400）的「昼」。",
    },
    4: {
      shortCallout: "周二夜晚也请点击卡蜜拉的「夜」",
      instruction:
        "保持这个节奏（4/6）。周二夜晚继续交给卡蜜拉吧，请在卡蜜拉周二格子中选择「夜」。",
    },
    5: {
      shortCallout: "周三白天也请点击芬里尔的「昼」",
      instruction:
        "就快完成了（5/6）。周三白天也请在擅长白班的芬里尔周三格子中选择「昼」。",
    },
    6: {
      shortCallout: "最后点击周二休整完毕的德拉戈周三的「夜」即可完成",
      instruction:
        "最后一步（6/6）。周三夜晚有强敌「勇者军・红莲魔导团」来袭，让周二休息恢复体力的德拉戈在周三选择「夜」就大功告成了。",
    },
  };
  const table = lang === "en" ? enSteps : zhSteps;
  return table[idx] ?? { shortCallout: step.shortCallout, instruction: step.instruction };
}

export function getViolationLocalized(
  v: RuleViolation,
  stage: StageScenario,
  lang: GameLang
): { shortBadge: string; message: string } {
  if (lang === "ja") {
    return { shortBadge: v.shortBadge, message: v.message };
  }
  const dayLabel = v.day !== undefined ? getDayLabel(v.day, lang) : "";
  const shiftLabel =
    v.shift === "day"
      ? pickLang(lang, { ja: "昼", en: "Day", zh: "昼" })
      : pickLang(lang, { ja: "夜", en: "Night", zh: "夜" });
  const m = v.monsterId ? getMonsterLocalized(v.monsterId, lang) : null;

  switch (v.category) {
    case "raid_power": {
      const slot = stage.requirements.find((r) => r.day === v.day && r.shift === v.shift);
      const ene = slot ? getRequirementLocalized(slot, lang).enemyName : "";
      return {
        shortBadge: lang === "en" ? "Low Power" : "战力偏低",
        message:
          lang === "en"
            ? `${dayLabel} ${shiftLabel} (${ene}) has lower defense than expected.`
            : `${dayLabel}${shiftLabel}（${ene}）的防卫力偏低。`,
      };
    }
    case "min_staff": {
      const slot = stage.requirements.find((r) => r.day === v.day && r.shift === v.shift);
      const minStaff = slot?.minStaff ?? 1;
      return {
        shortBadge: lang === "en" ? `Min ${minStaff} Guards` : `需${minStaff}人`,
        message:
          lang === "en"
            ? `${dayLabel} ${shiftLabel} requires at least ${minStaff} guards.`
            : `${dayLabel}${shiftLabel}的人数不足（需要至少 ${minStaff} 名成员）。`,
      };
    }
    case "full_moon":
      return {
        shortBadge: lang === "en" ? "No Full Moon Night" : "满月夜不可配置",
        message:
          lang === "en"
            ? `${dayLabel} Night is a Full Moon, so ${m?.name ?? ""} cannot take Night shift.`
            : `${dayLabel}夜晚是满月，${m?.name ?? ""}无法配置在夜班。`,
      };
    case "solo_night":
      return {
        shortBadge: lang === "en" ? "No Solo Night" : "夜间不可独守",
        message:
          lang === "en"
            ? `${m?.name ?? ""} is alone on ${dayLabel} Night. Assign another guard alongside at night.`
            : `${dayLabel}夜晚只有${m?.name ?? ""}一人，夜间请安排其他同伴一起值勤。`,
      };
    case "weekly_cap": {
      const cap = m?.maxWeeklyShifts ?? 3;
      return {
        shortBadge: lang === "en" ? `Max ${cap}/wk exceeded` : `超过每周${cap}天上限`,
        message:
          lang === "en"
            ? `${m?.name ?? ""} exceeds the weekly limit of ${cap} shifts. Add more rest days.`
            : `${m?.name ?? ""}的出勤天数已超过每周${cap}天上限，请增加休息日。`,
      };
    }
    case "night_to_day": {
      const prevDay = v.day !== undefined && v.day > 0 ? getDayLabel((v.day - 1) as DayIndex, lang) : "";
      return {
        shortBadge: lang === "en" ? "No Night -> Day" : "前日夜班（禁夜转昼）",
        message:
          lang === "en"
            ? `${m?.name ?? ""} is scheduled for ${prevDay} Night into ${dayLabel} Day. A guard cannot take Day shift right after Night shift.`
            : `${m?.name ?? ""}从${prevDay}夜班直接连上${dayLabel}白班，夜班次日清晨不能安排白班。`,
      };
    }
    case "consecutive": {
      const maxC = m?.maxConsecutiveDays ?? 1;
      return {
        shortBadge:
          maxC === 1
            ? lang === "en"
              ? "No consecutive days"
              : "不可连勤（次日需休）"
            : lang === "en"
              ? `Max ${maxC} consecutive`
              : `最多连上${maxC}天`,
        message:
          maxC === 1
            ? lang === "en"
              ? `${m?.name ?? ""} is scheduled on consecutive days. Give ${m?.name ?? ""} a rest day after working.`
              : `${m?.name ?? ""}被连续安排了出勤，工作1天后次日请安排休息。`
            : lang === "en"
              ? `${m?.name ?? ""} works more than ${maxC} consecutive days.`
              : `${m?.name ?? ""}连续出勤超过了上限（最多连续${maxC}天）。`,
      };
    }
    case "day_off":
      return {
        shortBadge: lang === "en" ? "Requested Off" : "指定休息日",
        message:
          lang === "en"
            ? `${dayLabel} is ${m?.name ?? ""}'s requested day off.`
            : `${dayLabel}是${m?.name ?? ""}的指定休息日，请设为休班。`,
      };
  }
}

export interface LocalizedOpeningCut {
  image: string;
  cameraClass: string;
  particleColor: string;
  lead: string;
  sub: string;
  durationMs: number;
  isClimax?: boolean;
}

export function getOpeningMovieCutsLocalized(lang: GameLang): readonly LocalizedOpeningCut[] {
  if (lang === "en") {
    return [
      {
        image: "./op-scene-1-castle.jpg",
        cameraClass: "op-cam-zoom-in",
        particleColor: "#fde047",
        lead: "Deep within a misty forest above a clear mountain stream stands the last sanctuary—the Demon Castle.",
        sub: "Monsters with nowhere else to go lived quietly together inside these stone walls.",
        durationMs: 5400,
      },
      {
        image: "./op-scene-2-heroes.jpg",
        cameraClass: "op-cam-pan-left",
        particleColor: "#fb923c",
        lead: "One day, a clash along the forest border cast a shadow over their peaceful lives.",
        sub: "To protect the human towns, the Hero's expedition began marching on the fortress day and night.",
        durationMs: 5400,
      },
      {
        image: "./bg-castle-hall.jpg",
        cameraClass: "op-cam-zoom-out",
        particleColor: "#38bdf8",
        lead: "Deep beneath the keep, the Demon Lord slumbers peacefully while the residents guard their home.",
        sub: "If the main gate falls, the monsters will lose their final place to belong.",
        durationMs: 5400,
      },
      {
        image: "./op-scene-4-guards.jpg",
        cameraClass: "op-cam-pan-up",
        particleColor: "#c084fc",
        lead: "Some shine in golden daylight, some thrive in silver moonlight, and some support their allies.",
        sub: "With a humane 24-hour shift that overworks no one, they stand ready to defend the gate—",
        durationMs: 5400,
      },
      {
        image: "./op-scene-4-guards.jpg",
        cameraClass: "op-cam-climax",
        particleColor: "#fde68a",
        lead: "Demon Castle 24h Guard Shift",
        sub: "As the newly appointed Guard Captain, the castle's shift schedule is now in your hands.",
        durationMs: 6200,
        isClimax: true,
      },
    ];
  }
  if (lang === "zh") {
    return [
      {
        image: "./op-scene-1-castle.jpg",
        cameraClass: "op-cam-zoom-in",
        particleColor: "#fde047",
        lead: "在幽深森林与清澈溪流之上，矗立着魔物们最后的庇护所——「魔王城」。",
        sub: "无处可去的魔物们，在这座宁静的城池中彼此依偎、安稳度日。",
        durationMs: 5400,
      },
      {
        image: "./op-scene-2-heroes.jpg",
        cameraClass: "op-cam-pan-left",
        particleColor: "#fb923c",
        lead: "某一天，森林外围发生的冲突打破了往日的宁静。",
        sub: "为了守护人类城镇，勇者讨伐军开始不分昼夜地向这座要塞进军。",
        durationMs: 5400,
      },
      {
        image: "./bg-castle-hall.jpg",
        cameraClass: "op-cam-zoom-out",
        particleColor: "#38bdf8",
        lead: "在城池深处静静沉睡的「魔王」，以及生活在这里的同伴们。",
        sub: "一旦正门被攻破，魔物们最后的容身之所也将随之失去。",
        durationMs: 5400,
      },
      {
        image: "./op-scene-4-guards.jpg",
        cameraClass: "op-cam-pan-up",
        particleColor: "#c084fc",
        lead: "有人擅长白昼骄阳，有人精于月夜暗影，也有人在身旁默默支援同伴。",
        sub: "不让任何一人勉强透支，用24小时轮班制度守住我们的城门——",
        durationMs: 5400,
      },
      {
        image: "./op-scene-4-guards.jpg",
        cameraClass: "op-cam-climax",
        particleColor: "#fde68a",
        lead: "《魔王城24小时警备排班》",
        sub: "作为新任警备队长，这座魔王城的排班调度就正式托付给您了。",
        durationMs: 6200,
        isClimax: true,
      },
    ];
  }
  return [
    {
      image: "./op-scene-1-castle.jpg",
      cameraClass: "op-cam-zoom-in",
      particleColor: "#fde047",
      lead: "深い森の奥、清らかな渓流の上に立つ最後の砦――「魔王城」。",
      sub: "行き場を失った魔物たちは、この静かな城で肩を寄せ合い暮らしていた。",
      durationMs: 5400,
    },
    {
      image: "./op-scene-2-heroes.jpg",
      cameraClass: "op-cam-pan-left",
      particleColor: "#fb923c",
      lead: "ある日、森の外縁で起きた魔物と人間の衝突が平穏に影を落とす。",
      sub: "街の人々を守るため、人間の勇者隊が昼夜を問わず砦へと進軍を開始した。",
      durationMs: 5400,
    },
    {
      image: "./bg-castle-hall.jpg",
      cameraClass: "op-cam-zoom-out",
      particleColor: "#38bdf8",
      lead: "城の奥深くで静かに眠りにつく『魔王』と、この城に暮らす仲間たち。",
      sub: "もし城門が破られれば、魔物たちの最後の居場所は失われてしまう。",
      durationMs: 5400,
    },
    {
      image: "./op-scene-4-guards.jpg",
      cameraClass: "op-cam-pan-up",
      particleColor: "#c084fc",
      lead: "昼の陽射しに強い者、夜の月影に冴える者、そして仲間の背中を支える者。",
      sub: "誰ひとり無理をさせず、24時間の交代シフトで城門を守り抜く――",
      durationMs: 5400,
    },
    {
      image: "./op-scene-4-guards.jpg",
      cameraClass: "op-cam-climax",
      particleColor: "#fde68a",
      lead: "『魔王城の24時間警備シフト』",
      sub: "新しく着任した警備隊長であるあなたに、この城のシフト編成が託された。",
      durationMs: 6200,
      isClimax: true,
    },
  ];
}

export interface LocalizedPrologueSlide {
  heading: string;
  text: string;
  visualHtml: string;
}

export function getPrologueSlidesLocalized(lang: GameLang): readonly LocalizedPrologueSlide[] {
  if (lang === "en") {
    return [
      {
        heading: '"Welcome to the Demon Castle. You must be our newly appointed Guard Captain."',
        text: '"Thank you for traveling all this way. I am Lilith, Chief Tactician of the Demon Castle. Starting today, I will serve as your adjutant to help coordinate our main gate defense."',
        visualHtml: "",
      },
      {
        heading: '"This castle is the final sanctuary where monsters can live in peace."',
        text: '"Protected by deep woods and mountain streams, monsters with nowhere else to go live quietly here. Deep within the keep, our Demon Lord slumbers peacefully, making the main gate vital to everyone\'s daily life."',
        visualHtml: `
          <div class="prologue-scene-banner">
            <img class="prologue-banner-img" src="./op-scene-1-castle.jpg" alt="Demon Castle in the woods" />
            <div class="prologue-banner-caption">The Demon Castle, a quiet sanctuary deep in the forest</div>
          </div>
        `,
      },
      {
        heading: '"We need your help building a humane 24-hour guard shift."',
        text: '"Following a recent clash at the forest edge, the Hero\'s expedition is marching on our gate day and night. Some guards dislike sunlight and others cannot work consecutive days, so please assemble a day-and-night schedule where everyone can shine without overworking."',
        visualHtml: `
          <div class="prologue-scene-banner">
            <img class="prologue-banner-img" src="./op-scene-4-guards.jpg" alt="Demon Castle Guards" />
            <div class="prologue-banner-caption">Guards with distinct daytime and nighttime strengths</div>
          </div>
        `,
      },
    ];
  }
  if (lang === "zh") {
    return [
      {
        heading: "「欢迎来到魔王城，您就是新上任的警备队长吧」",
        text: "「感谢您远道而来。我是担任魔王城警备参谋的莉莉丝，从今天起将作为您的副官，与您一同负责正门的防卫调度，请多指教。」",
        visualHtml: "",
      },
      {
        heading: "「这座城池，是魔物们安静生活的最后堡垒」",
        text: "「在深林与溪流环抱的魔王城里，聚集着无处可去的魔物们。我们的君主魔王大人正静静沉睡在城池深处，正门便是守护大家日常生活的重中之重。」",
        visualHtml: `
          <div class="prologue-scene-banner">
            <img class="prologue-banner-img" src="./op-scene-1-castle.jpg" alt="森林深处的魔王城" />
            <div class="prologue-banner-caption">由深林与溪流守护的最后堡垒「魔王城」</div>
          </div>
        `,
      },
      {
        heading: "「希望拜托您的，是24小时轮班表的编排」",
        text: "「受日前森林外围冲突的影响，人类的勇者部队正昼夜不停地向要塞进军。城内成员有的怕晒、有的不能连续出勤，请为大家编排一份无需勉强又能发挥所长的昼夜班表吧。」",
        visualHtml: `
          <div class="prologue-scene-banner">
            <img class="prologue-banner-img" src="./op-scene-4-guards.jpg" alt="魔王城的门卫们" />
            <div class="prologue-banner-caption">昼夜专长各不相同的魔王城门卫们</div>
          </div>
        `,
      },
    ];
  }
  return [
    {
      heading: "「ようこそ魔王城へ。あなたが新しく着任された警備隊長ですね」",
      text: "「遠いところをよく来てくださいました。私はこの魔王城で警備参謀を務めているリリスと申します。今日からあなたの副官として、城門の守りを一緒に担当させていただきますね。どうぞよろしくお願いいたします。」",
      visualHtml: "",
    },
    {
      heading: "「この城は、魔物たちが静かに暮らす最後の砦なのです」",
      text: "「深い森と渓流に守られたこの魔王城には、行き場を失った魔物たちが集まって暮らしています。城の奥深くでは私たちの主である魔王様も静かに眠っておられ、正門はみんなの暮らしを守る大切な要となっています。」",
      visualHtml: `
        <div class="prologue-scene-banner">
          <img class="prologue-banner-img" src="./op-scene-1-castle.jpg" alt="森の奥の魔王城" />
          <div class="prologue-banner-caption">深い森と渓流に守られた最後の砦「魔王城」</div>
        </div>
      `,
    },
    {
      heading: "「あなたにお願いしたいのは、24時間のシフト編成です」",
      text: "「先日、森の外縁で起きた衝突をきっかけに、人間の勇者隊が昼も夜も休まずこの砦へ進軍してきています。日差しが苦手な者や連勤ができない者など事情もさまざまですので、どうかみんなが無理なく力を発揮できる昼夜のシフトを組んでください。」",
      visualHtml: `
        <div class="prologue-scene-banner">
          <img class="prologue-banner-img" src="./op-scene-4-guards.jpg" alt="魔王城の門番たち" />
          <div class="prologue-banner-caption">昼と夜で得意分野が異なる魔王城の門番たち</div>
        </div>
      `,
    },
  ];
}
