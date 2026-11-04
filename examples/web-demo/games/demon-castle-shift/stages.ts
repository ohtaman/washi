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
  { raidTitle: "Advance Vanguard Recon", enemyName: "Vanguard Swordsmen & Archers", enemyIcon: "🗡️", enemyQuote: "To prevent damage to the town, we scout the gates." },
  { raidTitle: "Knight Order Advance", enemyName: "Kingdom Armored Shield Corps", enemyIcon: "🛡️", enemyQuote: "We march straight through. Stand aside." },
  { raidTitle: "Mage Unit Expedition", enemyName: "Hero Crimson Battle Mages", enemyIcon: "🔥", enemyQuote: "We cannot allow monsters to dwell near the settlement." },
  { raidTitle: "Archers Approach", enemyName: "Forest Longbow Snipers", enemyIcon: "🏹", enemyQuote: "Aiming through the forest canopy. No opening goes unnoticed." },
  { raidTitle: "Holy Kingdom Advance", enemyName: "Sanctuary Templar Knights", enemyIcon: "✨", enemyQuote: "To protect human livelihood, we will seal this fortress." },
];

const NIGHT_ENEMIES = [
  { raidTitle: "Night Infiltration", enemyName: "Expedition Night Scouts", enemyIcon: "🗝️", enemyQuote: "Under cover of darkness, unlock the postern gate." },
  { raidTitle: "Rear Gate Approach", enemyName: "Rear Gate Infiltration Squad", enemyIcon: "🥷", enemyQuote: "Strike during the guard rotation. Keep silent." },
  { raidTitle: "Moonlit Ambush", enemyName: "Hero Moonlit Hunt Division", enemyIcon: "🌕", enemyQuote: "Rush the ramparts while the moon lights the way." },
  { raidTitle: "Waterway Intrusion", enemyName: "Waterway Shinobi Squad", enemyIcon: "🐾", enemyQuote: "Slip into the fortress through the aqueduct grates." },
  { raidTitle: "Main Force Night Assault", enemyName: "Hero Elite Vanguard", enemyIcon: "👑", enemyQuote: "Time to end this. Open the gates." },
];

const HEAVY_POOL: readonly MonsterId[] = ["drago", "golem", "behemoth", "ifrit"];
const DAY_POOL: readonly MonsterId[] = ["fenrir", "garuda", "centaur", "griffon"];
const NIGHT_POOL: readonly MonsterId[] = ["carmilla", "lich", "morgan", "banshee"];
const KNIGHT_POOL: readonly MonsterId[] = ["dullahan", "gargoyle", "minotaur", "arachne"];
const ROOKIE_POOL: readonly MonsterId[] = ["pururu", "mandra", "mimic", "wisp"];

/**
 * Castle calendar era name and year/month calculation (starts 1073 years before refDate)
 */
export const CALENDAR_ERA_NAME = "Star-Moon Era";
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

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function formatCastleCalendarMonth(
  monthNumberOneBased: number,
  includeEra = false,
  refDate: Date = new Date()
): string {
  const { eraName, year, month } = getCastleCalendarYearMonth(monthNumberOneBased, refDate);
  const mName = MONTH_NAMES_EN[(month - 1) % 12];
  return includeEra ? `${eraName} ${mName} ${year}` : mName;
}

/**
 * Difficulty tier tuning parameters for endless progression
 * - `numDays`: Number of schedule days (3-5 days)
 * - `rosterSize`: Number of guards summoned for main gate duty (3-7 members)
 * - `slackPower`: Safety margin subtracted from witness defense power
 * - `maxPtoCount`: Maximum requested days off
 * - `fullMoonCount`: Number of full moon nights
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
  1: { label: "Peaceful (3-guard roster)", numDays: 3, rosterSize: 3, slackPower: 100, maxPtoCount: 0, fullMoonCount: 0 },
  2: { label: "Moderate (4-guard roster)", numDays: 4, rosterSize: 4, slackPower: 100, maxPtoCount: 1, fullMoonCount: 0 },
  3: { label: "Standard (5-guard roster)", numDays: 5, rosterSize: 5, slackPower: 100, maxPtoCount: 2, fullMoonCount: 1 },
  4: { label: "Veteran (6-guard roster)", numDays: 5, rosterSize: 6, slackPower: 50, maxPtoCount: 2, fullMoonCount: 1 },
  5: { label: "Extreme (7-guard roster)", numDays: 5, rosterSize: 7, slackPower: 0, maxPtoCount: 3, fullMoonCount: 2 },
};

export const CAMPAIGN_STAGES: readonly StageScenario[] = [
  {
    id: "week-1",
    weekNumber: 1,
    numDays: 3,
    title: `${formatCastleCalendarMonth(1)}: Vanguard Recon (3 Days)`,
    subtitle: `${formatCastleCalendarMonth(1, true)} — Assign 3 guards to their best hours across a 3-day schedule.`,
    newRuleTitle: "Core Rule: Best Hours & Drago's Rest",
    newRuleSummary:
      "Fenrir excels during the day (Power 400), while Carmilla dominates the night (Power 400). Drago (Power 500) is reliable day and night, but must rest the day after working.",
    lilithIntro:
      "This is our first shift schedule, so let us build it together. First, we will prepare for the enemy vanguard over 3 days (Mon-Wed) with 3 guards.",
    lilithHint:
      "Assign Drago (Power 500) to Monday Day and Wednesday Night against tough squads, giving Drago Tuesday off. Station Fenrir (400) on remaining days and Carmilla (400) on nights for an ironclad defense.",
    availableMonsters: ["drago", "fenrir", "carmilla"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "Mon · Day Vanguard Heavy Frontline", enemyName: "Vanguard Heavy Frontline", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "To protect the human towns, we will survey this forest fortress." },
      { day: 0, shift: "night", raidTitle: "Mon · Night Vanguard Night Scouts", enemyName: "Vanguard Night Scouts", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "Under cover of night, we will probe weak points at the gate." },
      { day: 1, shift: "day", raidTitle: "Tue · Day Royal Infantry Patrol", enemyName: "Royal Infantry Patrol", enemyIcon: "🛡️", requiredPower: 400, minStaff: 1, enemyQuote: "Daytime patrol squad. Push through the front gate." },
      { day: 1, shift: "night", raidTitle: "Tue · Night Expedition Night Saboteurs", enemyName: "Expedition Night Saboteurs", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "Approach without a sound and slip past the sentries." },
      { day: 2, shift: "day", raidTitle: "Wed · Day Royal Forest Archers", enemyName: "Royal Forest Archers", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "Advance within bowshot and ready your arrows." },
      { day: 2, shift: "night", raidTitle: "Wed · Night Hero's Crimson Mage Corps", enemyName: "Hero's Crimson Mage Corps", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "Pry open the night gate with arcane fire." },
    ],
    requestedDaysOff: [],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) => r.id === "drago_fenrir_train"),
    tutorialSteps: [
      {
        monsterId: "drago",
        day: 0,
        targetShift: "day",
        shortCallout: "Let us assemble the schedule together. Select Drago for Monday Day.",
        instruction: "Let us build the schedule together (1/6). A tough enemy Vanguard Heavy Frontline attacks Monday Day, so assign Drago (Power 500) to Monday Day.",
      },
      {
        monsterId: "carmilla",
        day: 0,
        targetShift: "night",
        shortCallout: "Next is Monday Night. Select Carmilla (Night 400) for Night shift.",
        instruction: "Great job (2/6). Monday Night is best suited for night specialist Carmilla (Night 400). Choose Night in Carmilla's Monday cell.",
      },
      {
        monsterId: "fenrir",
        day: 1,
        targetShift: "day",
        shortCallout: "Drago must rest Tuesday. Select Fenrir (Day 400) for Day shift.",
        instruction: "Going well (3/6). Drago needs the next day off after working, so assign daytime specialist Fenrir (Day 400) to Tuesday Day.",
      },
      {
        monsterId: "carmilla",
        day: 1,
        targetShift: "night",
        shortCallout: "Select Carmilla for Tuesday Night as well.",
        instruction: "Keep it up (4/6). Let Carmilla handle Tuesday Night as well. Choose Night in Carmilla's Tuesday cell.",
      },
      {
        monsterId: "fenrir",
        day: 2,
        targetShift: "day",
        shortCallout: "Assign Fenrir to Wednesday Day as well.",
        instruction: "Almost there (5/6). For Wednesday Day, assign daytime specialist Fenrir to the Wednesday Day cell.",
      },
      {
        monsterId: "drago",
        day: 2,
        targetShift: "night",
        shortCallout: "Finally, assign rested Drago to Wednesday Night to finish.",
        instruction: "Final step (6/6). Wednesday Night brings tough Hero's Crimson Mage Corps, so assign rested Drago to Wednesday Night to complete the schedule.",
      },
    ],
    clearQuotes: {
      drago: "Mid-week rest kept my old wound from aching; held out until the end.",
      fenrir: "Great visibility on daytime patrols; kept things fully under control.",
      carmilla: "Could focus during the quiet night hours. Not bad tactical direction.",
    },
  },
  {
    id: "week-2",
    weekNumber: 2,
    numDays: 3,
    title: `${formatCastleCalendarMonth(2)}: Night Attack Approaching (3 Days)`,
    subtitle: "Dullahan joins from the outer bailey. Watch for synergies (+100) and clashes (-150).",
    newRuleTitle: "New Rule: No Day After Night Shift & Roster Compatibility",
    newRuleSummary:
      "Guards on night shift cannot take day shift the next morning (night to night is allowed). Synergistic pairs (Fenrir + Dullahan) add +100 defense, but clashing pairs (Carmilla + Dullahan) subtract -150 defense.",
    lilithIntro:
      "This month Drago rotates to the postern gate, and armored knight Dullahan joins main gate duty. Carmilla dislikes sharing shifts with rigid Dullahan, so separate them into different slots.",
    lilithHint:
      "Pairing Fenrir (Day 400) and Dullahan (Day 300) on Monday Day grants a +100 synergy bonus for 800 defense power, holding the gate with ease.",
    availableMonsters: ["fenrir", "carmilla", "dullahan"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "Mon · Day Royal Heavy Infantry", enemyName: "Royal Heavy Infantry", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "Line up shields and advance from the front. Open the gate." },
      { day: 0, shift: "night", raidTitle: "Mon · Night Vanguard Night Scouts", enemyName: "Vanguard Night Scouts", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "Exploit openings in the night watch to scale the walls." },
      { day: 1, shift: "day", raidTitle: "Tue · Day Royal Perimeter Patrol", enemyName: "Royal Perimeter Patrol", enemyIcon: "🛡️", requiredPower: 400, minStaff: 1, enemyQuote: "Subdue the forest perimeter one section at a time." },
      { day: 1, shift: "night", raidTitle: "Tue · Night Covert Sabotage Platoon", enemyName: "Covert Sabotage Platoon", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "The vampire is reportedly off-duty tonight. Perfect chance." },
      { day: 2, shift: "day", raidTitle: "Wed · Day Vanguard Swordsman Squad", enemyName: "Vanguard Swordsman Squad", enemyIcon: "🗡️", requiredPower: 400, minStaff: 1, enemyQuote: "Consecutive battles must have exhausted the castle defenses." },
      { day: 2, shift: "night", raidTitle: "Wed · Night Hero Night Assault Corps", enemyName: "Hero Night Assault Corps", enemyIcon: "⚔️", requiredPower: 600, minStaff: 2, enemyQuote: "Attack simultaneously from two flanks. Break through." },
    ],
    requestedDaysOff: [
      { monsterId: "carmilla", day: 1, reason: "Rest Day" },
    ],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) =>
      ["fenrir_dullahan_patrol", "carmilla_dullahan_clash"].includes(r.id)
    ),
    clearQuotes: {
      dullahan: "With post-night rest guaranteed, the heavy armor was no burden.",
      fenrir: "Patrolling with Dullahan gave complete peace of mind covering each other's backs.",
      carmilla: "Without having to see that stiff knight, night shift was quite pleasant.",
    },
  },
  {
    id: "week-3",
    weekNumber: 3,
    numDays: 4,
    title: `${formatCastleCalendarMonth(3)}: Four-Day Siege (4 Days)`,
    subtitle: "Rookie slime Pururu arrives from the aqueducts. Schedule a 4-day roster.",
    newRuleTitle: "New Rule: Rookie Night Duty & Consecutive Shift Caps",
    newRuleSummary:
      "Rookie Pururu (Power 200) cannot guard night shift alone (must be paired; gains +100 synergy with Carmilla). All guards are capped at 3 consecutive shifts and must take at least 1 day off in 4 days.",
    lilithIntro:
      "Enemy forces have encamped around the forest for a 4-day siege. Rookie Pururu joins from aqueduct maintenance. When stationing Pururu at night, always pair with a senior guard.",
    lilithHint:
      "Stationing Carmilla (Night 400) and Pururu (Night 200) together on Thursday Night yields 700 defense with synergy bonus (+100).",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "Mon · Day Royal Siege Infantry", enemyName: "Royal Siege Infantry", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "Tighten the perimeter over 4 days, starting at the main gate." },
      { day: 0, shift: "night", raidTitle: "Mon · Night Hero Elite Night Assault Squad", enemyName: "Hero Elite Night Assault Squad", enemyIcon: "🔥", requiredPower: 500, minStaff: 1, isBossRaid: true, enemyQuote: "Strike the gatekeepers down under cover of darkness." },
      { day: 1, shift: "day", raidTitle: "Tue · Day Waterway Recon Squad", enemyName: "Waterway Recon Squad", enemyIcon: "🗡️", requiredPower: 200, minStaff: 1, enemyQuote: "Scout the aqueduct inlet. A small unit suffices." },
      { day: 1, shift: "night", raidTitle: "Tue · Night Waterway Infiltration Shinobi", enemyName: "Waterway Infiltration Shinobi", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "Infiltrate silently through the subterranean aqueducts." },
      { day: 2, shift: "day", raidTitle: "Wed · Day Hero Siege Mages", enemyName: "Hero Siege Mages", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "Focus magical output and shatter the gate barrier." },
      { day: 2, shift: "night", raidTitle: "Wed · Night Moonlit Hunt Division", enemyName: "Moonlit Hunt Division", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "Dense night fog. Scale the palisade while visibility is low." },
      { day: 3, shift: "day", raidTitle: "Thu · Day Royal Forest Archers", enemyName: "Royal Forest Archers", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "Final day of siege. Give them no respite." },
      { day: 3, shift: "night", raidTitle: "Thu · Night Postern Gate Assault Unit", enemyName: "Postern Gate Assault Unit", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "Final night. Storm the postern gate in full force." },
    ],
    requestedDaysOff: [
      { monsterId: "fenrir", day: 1, reason: "Rest Day" },
      { monsterId: "pururu", day: 2, reason: "Waterside Rest" },
    ],
    activeRelations: ALL_PAIR_RELATIONS.filter((r) =>
      ["carmilla_pururu_love", "drago_fenrir_train"].includes(r.id)
    ),
    clearQuotes: {
      pururu: "With Carmilla and senior guards nearby, I could keep watch calmly at night.",
      carmilla: "Pururu is obedient and helpful. Night rounds were never boring.",
      drago: "Rest distribution is key over 4 days. Excellent rotation.",
    },
  },
  {
    id: "week-4",
    weekNumber: 4,
    numDays: 5,
    title: `${formatCastleCalendarMonth(4)}: Full Moon Battle (5 Days · 5 Guards)`,
    subtitle: "A 5-guard roster over 5 days. Navigate Wednesday's Full Moon and compatibility.",
    newRuleTitle: "New Rule: Full Moon Night & Weekly Shift Caps",
    newRuleSummary:
      "During Full Moon (Wed Night), Fenrir cannot guard night duty (day is fine). Over 5 days, Drago may work at most 3 shifts, others at most 4 shifts.",
    lilithIntro:
      "Five guards are assigned to the main gate this month. Fenrir cannot take Wednesday Night due to the Full Moon. Avoid Carmilla and Dullahan's clash (-150) and heed requested off days.",
    lilithHint:
      "With Fenrir unavailable Wednesday Night, assign 2 guards from Carmilla, Dullahan, Pururu, and Drago. Since Carmilla and Dullahan together subtract -150 defense, Pururu is essential to balance the shift.",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu", "dullahan"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "Mon · Day Silver Infantry Vanguard", enemyName: "Silver Infantry Vanguard", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "First division, advance. Protect human towns from harm." },
      { day: 0, shift: "night", raidTitle: "Mon · Night Postern Gate Night Scouts", enemyName: "Postern Gate Night Scouts", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "Flank around to the postern gate through the night forest." },
      { day: 1, shift: "day", raidTitle: "Tue · Day Heavy Siege Ram Unit", enemyName: "Heavy Siege Ram Unit", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "Bring up the battering ram. Force the gates open." },
      { day: 1, shift: "night", raidTitle: "Tue · Night Covert Saboteurs", enemyName: "Covert Saboteurs", enemyIcon: "🥷", requiredPower: 400, minStaff: 1, enemyQuote: "Advance quietly. Exploit the sentries' blind spots." },
      { day: 2, shift: "day", raidTitle: "Wed · Day Royal Arcane Artillery", enemyName: "Royal Arcane Artillery", enemyIcon: "✨", requiredPower: 300, minStaff: 1, enemyQuote: "Pin them down from long range to pave way for the night main force." },
      { day: 2, shift: "night", raidTitle: "Wed · Night Moonlit Hunt Division", enemyName: "Moonlit Hunt Division", enemyIcon: "🌕", requiredPower: 600, minStaff: 2, isFullMoon: true, isBossRaid: true, enemyQuote: "Werewolves cannot fight under the full moon. Now is our chance." },
      { day: 3, shift: "day", raidTitle: "Thu · Day Great Bridge Snipers", enemyName: "Great Bridge Snipers", enemyIcon: "🏹", requiredPower: 600, minStaff: 2, enemyQuote: "Cross the great bridge over the gorge. Provide covering fire." },
      { day: 3, shift: "night", raidTitle: "Thu · Night Waterway Sabotage Unit", enemyName: "Waterway Sabotage Unit", enemyIcon: "🗝️", requiredPower: 400, minStaff: 1, enemyQuote: "Breach the aqueduct grates quickly." },
      { day: 4, shift: "day", raidTitle: "Fri · Day Hero Vanguard Knights", enemyName: "Hero Vanguard Knights", enemyIcon: "🔥", requiredPower: 700, minStaff: 2, isBossRaid: true, enemyQuote: "My lance will forge the path. All units, follow." },
      { day: 4, shift: "night", raidTitle: "Fri · Night Siege Encirclement Corps", enemyName: "Siege Encirclement Corps", enemyIcon: "⚔️", requiredPower: 600, minStaff: 2, enemyQuote: "The garrison must be exhausted by week's end." },
    ],
    requestedDaysOff: [
      { monsterId: "drago", day: 0, reason: "Old Wound Treatment" },
      { monsterId: "carmilla", day: 3, reason: "Rest Day" },
      { monsterId: "dullahan", day: 1, reason: "Armor Maintenance" },
    ],
    activeRelations: [...ALL_PAIR_RELATIONS],
    clearQuotes: {
      fenrir: "Exempting me from Full Moon night was a lifesaver. Focused on day rounds instead.",
      dullahan: "Clear roles across the five guards; rock-solid defense throughout the long stretch.",
      pururu: "Even with a 5-day shift, rest days keep energy high to the finish.",
    },
  },
  {
    id: "week-5",
    weekNumber: 5,
    numDays: 5,
    title: `${formatCastleCalendarMonth(5)}: Hero Main Force March (5 Days · 6 Guards)`,
    subtitle: "Lich joins from archives for a 6-guard roster against the Hero. Avoid clashes for total defense.",
    newRuleTitle: "Climax Month: 6-Guard Expanded Shift & Clash Resolution",
    newRuleSummary:
      "Lich (Night 400) joins from archives for a 6-guard roster. Lich clashes with Drago (-150), and Carmilla clashes with Dullahan (-150). Preserve frontline strength for Friday Night's Hero Main Force (3 guards required).",
    lilithIntro:
      "The enemy main force has begun marching. Chief Librarian Lich joins us for a 6-guard roster. Keep Drago/Lich and Carmilla/Dullahan apart while marshaling 3 guards for Friday Night.",
    lilithHint:
      "Night duty options expand with Carmilla, Dullahan, and Lich. Station Drago on Mon (Day), Wed (Day), and Fri (Night). A Fri Night trio of Drago + Carmilla + Pururu neatly sidesteps Lich's clash.",
    availableMonsters: ["drago", "carmilla", "fenrir", "pururu", "dullahan", "lich"],
    requirements: [
      { day: 0, shift: "day", raidTitle: "Mon · Day Hero Vanguard Heavy Corps", enemyName: "Hero Vanguard Heavy Corps", enemyIcon: "🔥", requiredPower: 800, minStaff: 2, isBossRaid: true, enemyQuote: "Vanguard of the Hero's army, advance." },
      { day: 0, shift: "night", raidTitle: "Mon · Night High Mage Artillery Corps", enemyName: "High Mage Artillery Corps", enemyIcon: "✨", requiredPower: 700, minStaff: 2, enemyQuote: "Bombard the walls with arcane shells from the night sky." },
      { day: 1, shift: "day", raidTitle: "Tue · Day Elite Mounted Archers", enemyName: "Elite Mounted Archers", enemyIcon: "🏹", requiredPower: 400, minStaff: 1, enemyQuote: "Disrupt their ranks and maintain pressure until the main force arrives." },
      { day: 1, shift: "night", raidTitle: "Tue · Night Covert Main Infiltration Unit", enemyName: "Covert Main Infiltration Unit", enemyIcon: "🥷", requiredPower: 700, minStaff: 2, enemyQuote: "Harass both postern and waterways simultaneously." },
      { day: 2, shift: "day", raidTitle: "Wed · Day Holy Sanctuary Royal Guards", enemyName: "Holy Sanctuary Royal Guards", enemyIcon: "🔥", requiredPower: 800, minStaff: 2, isBossRaid: true, enemyQuote: "For the peace of human towns, we will take this fortress." },
      { day: 2, shift: "night", raidTitle: "Wed · Night Moonlit Hunt Division", enemyName: "Moonlit Hunt Division", enemyIcon: "🌕", requiredPower: 600, minStaff: 2, isFullMoon: true, enemyQuote: "Under the full moon's light, strike their weakest post." },
      { day: 3, shift: "day", raidTitle: "Thu · Day Heavy Siege Battery", enemyName: "Heavy Siege Battery", enemyIcon: "🛡️", requiredPower: 600, minStaff: 2, enemyQuote: "Push battle lines directly to the fortress gates." },
      { day: 3, shift: "night", raidTitle: "Thu · Night Combat Sappers Corps", enemyName: "Combat Sappers Corps", enemyIcon: "🗝️", requiredPower: 600, minStaff: 2, enemyQuote: "Undermine rampart foundations for tomorrow's grand assault." },
      { day: 4, shift: "day", raidTitle: "Fri · Day Frontline Breakthrough Squad", enemyName: "Frontline Breakthrough Squad", enemyIcon: "🔥", requiredPower: 400, minStaff: 1, enemyQuote: "The Hero arrives tonight. Draw the gatekeepers out." },
      { day: 4, shift: "night", raidTitle: "Fri · Night Hero Party Decisive Force", enemyName: "Hero Party Decisive Force", enemyIcon: "👑", requiredPower: 1000, minStaff: 3, isBossRaid: true, enemyQuote: "This is the final battle. All units, storm the main gate." },
    ],
    requestedDaysOff: [
      { monsterId: "carmilla", day: 2, reason: "Rest Day" },
      { monsterId: "dullahan", day: 1, reason: "Armor Inspection" },
      { monsterId: "lich", day: 4, reason: "Archive Inventory" },
    ],
    activeRelations: [...ALL_PAIR_RELATIONS],
    clearQuotes: {
      drago: "Saving strength until Friday night meant not giving an inch against the main party.",
      carmilla: "Reclaimed peaceful nights without a single casualty.",
      fenrir: "Everyone's strengths aligned; defending together felt great to the end.",
      dullahan: "Masterful leadership. Peace in this fortress and forest has been secured.",
      pururu: "Our Demon Castle, we defended it together.",
      lich: "Thanks to a shift without running into Lord Drago, barrier deployment was serene.",
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
    // 5-day witness for Tiers 3 (5 guards), 4 (6 guards), 5 (7 guards)
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
        raidTitle: isFullMoon ? "Full Moon Night Watch" : enemy.raidTitle,
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
      ? `${MONSTERS[mId].usualPost.split("·")[0].trim()} Duty / Rest`
      : "Rest Day";
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
  const rosterNames = availableMonsters.map((id) => MONSTERS[id].name).join(", ");
  const calendarLabel = formatCastleCalendarMonth(weekNumber);
  return {
    id: `week-${weekNumber}-${seed}`,
    weekNumber,
    numDays,
    difficultyTier: tier,
    difficultyLabel: diffLabel,
    title: `${calendarLabel}: Main Gate Defense (${numDays} Days · ${availableMonsters.length} Guards)`,
    subtitle: `Guards on Duty: ${rosterNames} (Difficulty: ${diffLabel})`,
    newRuleTitle: `${calendarLabel} Main Gate Roster (${availableMonsters.length} Guards · ${diffLabel})`,
    newRuleSummary:
      history.length > 0
        ? `Based on recent security performance, ${availableMonsters.length} guards (${rosterNames}) were summoned from the castle's 20 defenders. Leverage synergies (+100) and avoid clashes (-150) to build a solid roster.`
        : `A ${numDays}-day guard schedule defended by ${availableMonsters.length} members (${rosterNames}) selected from the 20 castle defenders.`,
    lilithIntro:
      history.length > 0
        ? `The ${calendarLabel} march forecast has arrived. This month's main gate guards are ${rosterNames} (${availableMonsters.length} total). Consider their best hours and clashes to formulate the schedule.`
        : `The ${calendarLabel} march forecast has arrived. Let us build a reasonable shift to protect the castle with this month's ${availableMonsters.length} guards.`,
    lilithHint:
      `Check requested days off and Full Moon nights first, then assign ${MONSTERS[heavy1].name} (who can only work every other day) to tough raid slots.`,
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
  const rosterNames = generated.availableMonsters.map((id) => MONSTERS[id].name).join(", ");

  return {
    ...generated,
    id: base.id,
    weekNumber: base.weekNumber,
    title: base.title,
    subtitle: `Guards on Duty: ${rosterNames} (New Lineup)`,
    newRuleTitle: base.newRuleTitle,
    newRuleSummary: `Following the previous battle, the on-duty roster and enemy march schedule have been reorganized. This week's ${generated.availableMonsters.length} guards are ${rosterNames}.`,
    lilithIntro: `New recon reports have arrived. Our on-duty guards this time are ${rosterNames} (${generated.availableMonsters.length} total). Examine enemy power and everyone's work rules to build the shift.`,
  };
}

/**
 * Generates a guaranteed-solvable random weekly challenge.
 */
export function generateRandomStage(seed = Date.now()): StageScenario {
  const weekNum = 6 + (Math.abs(seed) % 90);
  return generateAdaptiveStage(weekNum, [], seed);
}
