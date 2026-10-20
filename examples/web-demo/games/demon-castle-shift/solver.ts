import { Model, expr, sum, maximize, type Var } from "../../../../src/index.js";
import { MONSTERS, getEffectivePower, getShiftMorale } from "./characters.js";
import {
  ALL_MONSTER_IDS,
  BALANCE_CONFIG,
  DAY_KEYS,
  DAY_LABELS,
  type ActiveShiftType,
  type DayIndex,
  type MonsterId,
  type MoraleEvent,
  type OptimalSolveResult,
  type RuleViolation,
  type ScheduleEvaluation,
  type ScheduleGrid,
  type ShiftSlotRequirement,
  type ShiftType,
  type SlotBattleOutcome,
  type SlotStatus,
  type StageScenario,
} from "./types.js";

const BASE_MORALE_SCORE = 1000;

/**
 * Standard normal cumulative distribution function Phi(z) approximation (Abramowitz & Stegun).
 */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Returns the expected (median M) enemy combat power for a slot.
 */
export function getExpectedEnemyPower(req: ShiftSlotRequirement): number {
  if (typeof req.expectedPower === "number") {
    return req.expectedPower;
  }
  return Math.max(100, Math.round((req.requiredPower * BALANCE_CONFIG.expectedToMaxRatio) / 10) * 10);
}

/**
 * Returns the minimum (-2σ floor) enemy combat power for a slot.
 */
export function getMinEnemyPower(req: ShiftSlotRequirement): number {
  const expected = getExpectedEnemyPower(req);
  const minRaw =
    expected * Math.exp(-BALANCE_CONFIG.enemyLogSigma * BALANCE_CONFIG.enemyTruncateSigma);
  return Math.max(50, Math.round(minRaw / 10) * 10);
}

/**
 * Computes the win probability (0..99%) for a given defensePower against a slot's log-normal enemy power.
 * Since there is no upper cap on enemy power rolls, win probability never reaches 100% (max 99%).
 */
export function computeSlotWinProbability(
  defensePower: number,
  req: ShiftSlotRequirement
): number {
  if (defensePower <= 0) return 0;
  const expected = getExpectedEnemyPower(req);
  const z = Math.log(defensePower / expected) / BALANCE_CONFIG.enemyLogSigma;
  const prob = Math.round(normalCdf(z) * 100);
  return Math.max(0, Math.min(99, prob));
}

/**
 * Maps an enemy squad requirement to its visual unit portrait asset.
 */
export function resolveEnemyPortrait(req: ShiftSlotRequirement): string {
  const name = req.enemyName;
  if (
    name.includes("勇者") ||
    name.includes("聖堂") ||
    name.includes("親衛隊") ||
    req.enemyIcon === "👑"
  ) {
    return "./enemy-hero-party.jpg";
  }
  if (
    name.includes("魔導") ||
    name.includes("月下") ||
    name.includes("狩猟") ||
    name.includes("夜間精鋭") ||
    name.includes("傭兵") ||
    req.enemyIcon === "✨" ||
    req.enemyIcon === "🌕"
  ) {
    return "./enemy-mages.jpg";
  }
  if (
    name.includes("重騎士") ||
    name.includes("重装") ||
    name.includes("歩兵") ||
    name.includes("巡回") ||
    name.includes("騎士") ||
    name.includes("砲兵") ||
    req.enemyIcon === "🛡️" ||
    req.isBossRaid
  ) {
    return "./enemy-knights.jpg";
  }
  return "./enemy-scout.jpg";
}

/**
 * Rolls the actual enemy combat power for each slot from the log-normal distribution (with no upper cap)
 * and determines whether the defending guards hold the line (`defensePower >= actualEnemyPower`).
 */
export function rollStageBattles(
  stage: StageScenario,
  evaluation: ScheduleEvaluation,
  rng: () => number = Math.random
): SlotBattleOutcome[] {
  const outcomes: SlotBattleOutcome[] = [];
  const sigma = BALANCE_CONFIG.enemyLogSigma;

  for (const slot of evaluation.slotStatuses) {
    const req = stage.requirements.find((r) => r.day === slot.day && r.shift === slot.shift);
    if (!req) continue;

    // Box-Muller transform for standard normal Z (no upper cap — rare enemy surges are possible)
    const u1 = Math.max(1e-7, Math.min(1 - 1e-7, rng()));
    const u2 = Math.max(1e-7, Math.min(1 - 1e-7, rng()));
    const rawZ = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const rawEnemy = slot.expectedPower * Math.exp(sigma * rawZ);
    const actualEnemyPower = Math.max(50, Math.round(rawEnemy / 5) * 5);

    const isWin = slot.currentPower >= actualEnemyPower;
    const isPerfectDefense = isWin && slot.currentPower >= slot.requiredPower;
    const leadId = slot.assignedMonsters[0];
    const leadMonster = leadId ? MONSTERS[leadId] : null;
    const defenderName =
      slot.assignedMonsters.length > 0
        ? slot.assignedMonsters.map((id) => MONSTERS[id].name).join("・")
        : "配置なし";
    const defenderPortrait = leadMonster ? leadMonster.portrait : "./char-lilith.jpg";
    const defenderQuote = leadMonster
      ? slot.shift === "day"
        ? leadMonster.quotes.dayAssign
        : leadMonster.quotes.nightAssign
      : "この時間帯は誰も配置されていません。";

    const activePositiveRel = stage.activeRelations.find(
      (rel) =>
        rel.moraleDelta > 0 &&
        slot.assignedMonsters.includes(rel.monsterA) &&
        slot.assignedMonsters.includes(rel.monsterB)
    );
    const activeNegativeRel = stage.activeRelations.find(
      (rel) =>
        rel.moraleDelta < 0 &&
        slot.assignedMonsters.includes(rel.monsterA) &&
        slot.assignedMonsters.includes(rel.monsterB)
    );

    outcomes.push({
      day: slot.day,
      shift: slot.shift,
      enemyName: req.enemyName,
      enemyIcon: req.enemyIcon,
      enemyPortrait: resolveEnemyPortrait(req),
      enemyQuote: req.enemyQuote ?? "街の平穏のため、この門を突破する。",
      defenderQuote: activeNegativeRel ? (leadMonster?.quotes.angry ?? defenderQuote) : defenderQuote,
      defenderName,
      defenderPortrait,
      assignedMonsters: slot.assignedMonsters,
      hasSynergy: Boolean(activePositiveRel),
      synergyTitle: activePositiveRel?.title,
      hasConflict: Boolean(activeNegativeRel),
      conflictTitle: activeNegativeRel?.title,
      isPerfectDefense,
      isBossRaid: Boolean(req.isBossRaid),
      defensePower: slot.currentPower,
      expectedEnemyPower: slot.expectedPower,
      maxEnemyPower: slot.requiredPower,
      actualEnemyPower,
      winProbability: slot.winProbability,
      hasRaid: false,
      isWin,
    });
  }

  // Decide which slots actually have an enemy raid (Hero does NOT appear 2 times every day like clockwork).
  // Target roughly 45% of slots (e.g., 2-3 raids in a 3-day week, 3-4 in a 4-day week, 4 in a 5-day week),
  // prioritizing boss raids and any weak/unguarded slots spotted by enemy scouts, and picking at most 1 raid per day first.
  const totalSlots = outcomes.length;
  const baseTargetRaids = Math.max(2, Math.round(totalSlots * BALANCE_CONFIG.raidOccurrenceRatio));
  const jitter = rng() < 0.45 ? 0 : 1;
  const targetRaids = Math.min( Math.max(2, Math.ceil(totalSlots * 0.5)), baseTargetRaids + (totalSlots >= 8 ? jitter : 0) );

  const daysWithRaid = new Set<DayIndex>();
  let raidCount = 0;

  // 1. Boss raids always occur
  for (const o of outcomes) {
    if (o.isBossRaid) {
      o.hasRaid = true;
      daysWithRaid.add(o.day);
      raidCount++;
    }
  }

  // 2. Enemy scouts target slots left weak (defensePower < expectedEnemyPower)
  for (const o of outcomes) {
    if (!o.hasRaid && o.defensePower < o.expectedEnemyPower) {
      o.hasRaid = true;
      daysWithRaid.add(o.day);
      raidCount++;
    }
  }

  // 3. Randomly pick remaining raids from distinct days first (so the Hero doesn't show up 2x every day)
  const candidateDays: DayIndex[] = [];
  for (const o of outcomes) {
    if (!daysWithRaid.has(o.day) && !candidateDays.includes(o.day)) {
      candidateDays.push(o.day);
    }
  }
  // Fisher-Yates shuffle candidate days using rng()
  for (let i = candidateDays.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    const tmp = candidateDays[i];
    candidateDays[i] = candidateDays[j];
    candidateDays[j] = tmp;
  }

  for (const day of candidateDays) {
    if (raidCount >= targetRaids) break;
    const daySlots = outcomes.filter((o) => o.day === day && !o.hasRaid);
    if (daySlots.length > 0) {
      const idx = Math.min(daySlots.length - 1, Math.max(0, Math.floor(rng() * daySlots.length)));
      const chosen = daySlots[idx];
      chosen.hasRaid = true;
      daysWithRaid.add(day);
      raidCount++;
    }
  }

  // Fallback if still below minimum 2 raids
  for (const o of outcomes) {
    if (raidCount >= Math.min(2, totalSlots)) break;
    if (!o.hasRaid) {
      o.hasRaid = true;
      raidCount++;
    }
  }

  // Peaceful slots (hasRaid === false) have no enemy attack, so the gate is never breached there
  for (const o of outcomes) {
    if (!o.hasRaid) {
      o.isWin = true;
    }
  }

  return outcomes;
}

export function getStageDays(stage: StageScenario): DayIndex[] {
  const count = stage.numDays ?? 5;
  const days: DayIndex[] = [];
  for (let d = 0; d < count; d++) {
    days.push(d as DayIndex);
  }
  return days;
}

export function createEmptySchedule(monsters: readonly MonsterId[], numDays = 5): ScheduleGrid {
  const grid = {} as ScheduleGrid;
  for (const id of ALL_MONSTER_IDS) {
    grid[id] = Array.from({ length: numDays }, () => "off" as ShiftType);
  }
  for (const id of monsters) {
    grid[id] = Array.from({ length: numDays }, () => "off" as ShiftType);
  }
  return grid;
}

export function cloneSchedule(schedule: ScheduleGrid): ScheduleGrid {
  const copy = {} as ScheduleGrid;
  for (const key of Object.keys(schedule) as MonsterId[]) {
    copy[key] = [...schedule[key]];
  }
  return copy;
}

/**
 * Deterministically evaluates a schedule against all hard rules and computes the exact morale score.
 * This independent evaluator is also used to cross-check the MILP solver's optimal objective.
 */
export function evaluateSchedule(stage: StageScenario, schedule: ScheduleGrid): ScheduleEvaluation {
  const days = getStageDays(stage);
  const numDays = days.length;
  const violations: RuleViolation[] = [];
  const slotStatuses: SlotStatus[] = [];
  const moraleEvents: MoraleEvent[] = [];

  const monsterShiftCounts = {} as Record<MonsterId, number>;
  const monsterMorale = {} as Record<MonsterId, number>;
  for (const id of ALL_MONSTER_IDS) {
    monsterShiftCounts[id] = 0;
    monsterMorale[id] = 0;
  }

  // 1. Evaluate each (day, shift) slot requirement & per-slot morale
  for (const req of stage.requirements) {
    if (req.day >= numDays) continue;
    const assignedMonsters: MonsterId[] = [];
    let currentPower = 0;

    for (const mId of stage.availableMonsters) {
      const assigned = schedule[mId]?.[req.day] === req.shift;
      if (assigned) {
        assignedMonsters.push(mId);
        currentPower += getEffectivePower(mId, req.shift);

        const shiftMorale = getShiftMorale(mId, req.shift);
        if (shiftMorale !== 0) {
          monsterMorale[mId] += shiftMorale;
          moraleEvents.push({
            label: `${DAY_LABELS[req.day]}・${req.shift === "day" ? "昼" : "夜"}: ${MONSTERS[mId].name}（適性）`,
            delta: shiftMorale,
            day: req.day,
            shift: req.shift,
            monsters: [mId],
          });
        }

        const bossBonus = MONSTERS[mId].bossRaidBonusMorale ?? 0;
        if (req.isBossRaid && bossBonus !== 0) {
          monsterMorale[mId] += bossBonus;
          moraleEvents.push({
            label: `${DAY_LABELS[req.day]}・${req.shift === "day" ? "昼" : "夜"}: ${MONSTERS[mId].name}（強敵警戒）`,
            delta: bossBonus,
            day: req.day,
            shift: req.shift,
            monsters: [mId],
          });
        }
      }
    }

    // Check pairwise synergies / conflicts in this slot (adds directly to defense power & morale)
    for (const rel of stage.activeRelations) {
      if (
        assignedMonsters.includes(rel.monsterA) &&
        assignedMonsters.includes(rel.monsterB)
      ) {
        currentPower += rel.moraleDelta;
        monsterMorale[rel.monsterA] += Math.round(rel.moraleDelta / 2);
        monsterMorale[rel.monsterB] += rel.moraleDelta - Math.round(rel.moraleDelta / 2);
        moraleEvents.push({
          label: `${DAY_LABELS[req.day]}・${req.shift === "day" ? "昼" : "夜"}: ${rel.title}（${MONSTERS[rel.monsterA].name}・${MONSTERS[rel.monsterB].name}）`,
          delta: rel.moraleDelta,
          day: req.day,
          shift: req.shift,
          monsters: [rel.monsterA, rel.monsterB],
        });
      }
    }

    currentPower = Math.max(0, currentPower);
    const expectedPower = getExpectedEnemyPower(req);
    const minEnemyPower = getMinEnemyPower(req);
    const winProbability = computeSlotWinProbability(currentPower, req);
    const powerMet = currentPower >= req.requiredPower;
    const staffMet = assignedMonsters.length >= req.minStaff;

    slotStatuses.push({
      day: req.day,
      shift: req.shift,
      currentPower,
      requiredPower: req.requiredPower,
      expectedPower,
      minEnemyPower,
      winProbability,
      currentStaff: assignedMonsters.length,
      minStaff: req.minStaff,
      assignedMonsters,
      powerMet,
      staffMet,
    });

    if (!powerMet) {
      violations.push({
        id: `power_${DAY_KEYS[req.day]}_${req.shift}`,
        category: "raid_power",
        severity: "error",
        day: req.day,
        shift: req.shift,
        shortBadge: `戦力手薄 (${currentPower})`,
        message: `${DAY_LABELS[req.day]}の${req.shift === "day" ? "昼" : "夜"}（${req.enemyName}・予測 ${expectedPower}）は防衛力が ${currentPower} とやや手薄です。`,
      });
    }

    if (!staffMet) {
      violations.push({
        id: `staff_${DAY_KEYS[req.day]}_${req.shift}`,
        category: "min_staff",
        severity: "error",
        day: req.day,
        shift: req.shift,
        shortBadge: `人数不足 (${assignedMonsters.length}/${req.minStaff})`,
        message: `${DAY_LABELS[req.day]}の${req.shift === "day" ? "昼" : "夜"}は人数が不足しています（現在 ${assignedMonsters.length}名 / 必要 ${req.minStaff}名）。`,
      });
    }

    // Full Moon Night check for any monster with fullMoonNightForbidden
    if (req.isFullMoon && req.shift === "night") {
      for (const mId of assignedMonsters) {
        if (MONSTERS[mId].fullMoonNightForbidden) {
          violations.push({
            id: `fullmoon_${mId}_${DAY_KEYS[req.day]}`,
            category: "full_moon",
            severity: "error",
            day: req.day,
            shift: "night",
            monsterId: mId,
            shortBadge: "満月夜は配置不可",
            message: `${DAY_LABELS[req.day]}の夜は満月のため、${MONSTERS[mId].name}は夜番に配置できません。`,
          });
        }
      }
    }

    // Rookie no-solo-night check for any monster with requiresNightPartner
    if (req.shift === "night" && assignedMonsters.length < 2) {
      for (const mId of assignedMonsters) {
        if (MONSTERS[mId].requiresNightPartner) {
          violations.push({
            id: `solo_night_${mId}_${DAY_KEYS[req.day]}`,
            category: "solo_night",
            severity: "error",
            day: req.day,
            shift: "night",
            monsterId: mId,
            shortBadge: "夜は単独配置不可",
            message: `${DAY_LABELS[req.day]}の夜に${MONSTERS[mId].name}がひとりになっています。夜は他の仲間も一緒に配置してください。`,
          });
        }
      }
    }
  }

  // 2. Evaluate per-monster labor rules
  for (const mId of stage.availableMonsters) {
    const profile = MONSTERS[mId];
    const shifts = schedule[mId] ?? [];

    let totalWorked = 0;
    for (const d of days) {
      if (shifts[d] && shifts[d] !== "off") {
        totalWorked++;
      }
    }
    monsterShiftCounts[mId] = totalWorked;

    // Weekly shift cap
    if (totalWorked > profile.maxWeeklyShifts) {
      violations.push({
        id: `weekly_cap_${mId}`,
        category: "weekly_cap",
        severity: "error",
        monsterId: mId,
        shortBadge: `週${profile.maxWeeklyShifts}日上限超過`,
        message: `${profile.name}の出勤数が上限を超えています（現在 ${totalWorked}日 / 上限 ${profile.maxWeeklyShifts}日）。休みを増やしてください。`,
      });
    }

    // Night -> Day interval rule
    for (let d = 0; d < numDays - 1; d++) {
      if (shifts[d] === "night" && shifts[d + 1] === "day") {
        violations.push({
          id: `night_to_day_${mId}_${DAY_KEYS[d]}`,
          category: "night_to_day",
          severity: "error",
          day: (d + 1) as DayIndex,
          shift: "day",
          monsterId: mId,
          shortBadge: "前日が夜番（夜→昼は不可）",
          message: `${profile.name}が${DAY_LABELS[d]}の夜番から翌朝（${DAY_LABELS[d + 1]}の昼番）へ連続で入っています。夜番の翌朝は昼番に入れません。`,
        });
      }
    }

    // Consecutive working days rule (window of size maxConsecutiveDays + 1)
    const windowSize = profile.maxConsecutiveDays + 1;
    for (let start = 0; start <= numDays - windowSize; start++) {
      let workedInWindow = 0;
      for (let k = 0; k < windowSize; k++) {
        if (shifts[start + k] && shifts[start + k] !== "off") {
          workedInWindow++;
        }
      }
      if (workedInWindow > profile.maxConsecutiveDays) {
        violations.push({
          id: `consecutive_${mId}_${DAY_KEYS[start]}`,
          category: "consecutive",
          severity: "error",
          day: (start + profile.maxConsecutiveDays) as DayIndex,
          monsterId: mId,
          shortBadge:
            profile.maxConsecutiveDays === 1
              ? "連勤不可（翌日は休み）"
              : `${windowSize}連勤不可（最大${profile.maxConsecutiveDays}連勤）`,
          message:
            profile.maxConsecutiveDays === 1
              ? `${profile.name}が${DAY_LABELS[start]}と${DAY_LABELS[start + 1]}に連続で入っています。1日働いたら翌日は休みにしてください。`
              : `${profile.name}が${windowSize}日連続で入っています（最大${profile.maxConsecutiveDays}連勤まで）。`,
        });
      }
    }
  }

  // 3. Requested days off
  for (const offReq of stage.requestedDaysOff) {
    if (offReq.day >= numDays) continue;
    if (!stage.availableMonsters.includes(offReq.monsterId)) continue;
    const assigned = schedule[offReq.monsterId]?.[offReq.day];
    if (assigned && assigned !== "off") {
      violations.push({
        id: `req_off_${offReq.monsterId}_${DAY_KEYS[offReq.day]}`,
        category: "day_off",
        severity: "error",
        day: offReq.day,
        monsterId: offReq.monsterId,
        shortBadge: "指定休",
        message: `${DAY_LABELS[offReq.day]}は${MONSTERS[offReq.monsterId].name}の指定休（${offReq.reason}）です。休みにしてください。`,
      });
    }
  }

  const deltaSum = moraleEvents.reduce((acc, ev) => acc + ev.delta, 0);
  const totalScore = BASE_MORALE_SCORE + deltaSum;
  const laborViolations = violations.filter(
    (v) => v.category !== "raid_power" && v.category !== "min_staff"
  );
  const hasAnyAssigned = slotStatuses.some((s) => s.currentStaff > 0);

  return {
    isValid: violations.length === 0,
    canDispatch: laborViolations.length === 0 && hasAnyAssigned,
    violations,
    slotStatuses,
    moraleEvents,
    baseScore: BASE_MORALE_SCORE,
    totalScore,
    monsterShiftCounts,
    monsterMorale,
  };
}

/**
 * Builds the exact Mixed-Integer Linear Programming (MILP) model in WaSHI for the stage.
 */
export function buildScheduleWashiModel(
  stage: StageScenario,
  options?: {
    solver?: "highs" | "z3" | "glpk";
    pinnedSchedule?: Partial<Record<MonsterId, Partial<Record<DayIndex, ShiftType>>>>;
    forbidSchedule?: ScheduleGrid;
  }
) {
  const days = getStageDays(stage);
  const numDays = days.length;
  const m = new Model(`DemonCastleShift_Week${stage.weekNumber}`, {
    solver: options?.solver ?? "highs",
  });

  const dayVars: Record<MonsterId, Var[]> = {} as Record<MonsterId, Var[]>;
  const nightVars: Record<MonsterId, Var[]> = {} as Record<MonsterId, Var[]>;

  for (const mId of stage.availableMonsters) {
    dayVars[mId] = [];
    nightVars[mId] = [];
    for (const d of days) {
      dayVars[mId].push(m.binary(`day_${mId}_${DAY_KEYS[d]}`));
      nightVars[mId].push(m.binary(`night_${mId}_${DAY_KEYS[d]}`));
    }
  }

  // 1. At most 1 shift per day per monster
  for (const mId of stage.availableMonsters) {
    for (const d of days) {
      m.constraint(
        expr`${dayVars[mId][d]} + ${nightVars[mId][d]} <= 1`,
        `one_shift_per_day_${mId}_${DAY_KEYS[d]}`
      );
    }
  }

  // 2. Night -> Next Day transition forbidden
  for (const mId of stage.availableMonsters) {
    for (let d = 0; d < numDays - 1; d++) {
      m.constraint(
        expr`${nightVars[mId][d]} + ${dayVars[mId][d + 1]} <= 1`,
        `no_night_to_day_${mId}_${DAY_KEYS[d]}_to_${DAY_KEYS[d + 1]}`
      );
    }
  }

  // 3. Max consecutive working days & Weekly shift cap
  for (const mId of stage.availableMonsters) {
    const profile = MONSTERS[mId];
    const windowSize = profile.maxConsecutiveDays + 1;
    for (let start = 0; start <= numDays - windowSize; start++) {
      const windowVars: Var[] = [];
      for (let k = 0; k < windowSize; k++) {
        windowVars.push(dayVars[mId][start + k], nightVars[mId][start + k]);
      }
      m.constraint(
        expr`${sum(windowVars)} <= ${profile.maxConsecutiveDays}`,
        `max_consec_${profile.maxConsecutiveDays}_${mId}_${DAY_KEYS[start]}`
      );
    }

    const allWeekVars = [...dayVars[mId], ...nightVars[mId]];
    m.constraint(
      expr`${sum(allWeekVars)} <= ${profile.maxWeeklyShifts}`,
      `weekly_cap_${mId}`
    );
  }

  // 4. Requested days off
  for (const offReq of stage.requestedDaysOff) {
    if (offReq.day >= numDays) continue;
    if (!stage.availableMonsters.includes(offReq.monsterId)) continue;
    const d = offReq.day;
    const mId = offReq.monsterId;
    m.constraint(
      expr`${dayVars[mId][d]} + ${nightVars[mId][d]} <= 0`,
      `requested_off_${mId}_${DAY_KEYS[d]}`
    );
  }

  // 5. Slot requirements & Objective Function (Required combat power including pair synergy, min staff, Full Moon, Pururu no-solo-night)
  const objectiveTerms = [expr`${BASE_MORALE_SCORE}`];

  for (const req of stage.requirements) {
    if (req.day >= numDays) continue;
    const d = req.day;
    const s = req.shift;
    const slotVars = stage.availableMonsters.map((mId) =>
      s === "day" ? dayVars[mId][d] : nightVars[mId][d]
    );
    const powerTerms = stage.availableMonsters.map((mId) => {
      const v = s === "day" ? dayVars[mId][d] : nightVars[mId][d];
      const pwr = getEffectivePower(mId, s);
      return expr`${pwr} * ${v}`;
    });

    for (const mId of stage.availableMonsters) {
      const v = s === "day" ? dayVars[mId][d] : nightVars[mId][d];
      let coeff = getShiftMorale(mId, s);
      if (req.isBossRaid && MONSTERS[mId].bossRaidBonusMorale) {
        coeff += MONSTERS[mId].bossRaidBonusMorale!;
      }
      if (coeff !== 0) {
        objectiveTerms.push(expr`${coeff} * ${v}`);
      }
    }

    // Linearize pairwise relations on this (day, shift) using auxiliary binary variable p_{rel}_{d}_{s}
    for (const rel of stage.activeRelations) {
      if (
        !stage.availableMonsters.includes(rel.monsterA) ||
        !stage.availableMonsters.includes(rel.monsterB)
      ) {
        continue;
      }
      const varA = s === "day" ? dayVars[rel.monsterA][d] : nightVars[rel.monsterA][d];
      const varB = s === "day" ? dayVars[rel.monsterB][d] : nightVars[rel.monsterB][d];
      const pairVar = m.binary(`pair_${rel.monsterA}_${rel.monsterB}_${DAY_KEYS[d]}_${s}`);

      m.constraint(
        expr`${pairVar} - ${varA} <= 0`,
        `pair_ubA_${rel.id}_${DAY_KEYS[d]}_${s}`
      );
      m.constraint(
        expr`${pairVar} - ${varB} <= 0`,
        `pair_ubB_${rel.id}_${DAY_KEYS[d]}_${s}`
      );
      m.constraint(
        expr`${varA} + ${varB} - ${pairVar} <= 1`,
        `pair_lb_${rel.id}_${DAY_KEYS[d]}_${s}`
      );

      powerTerms.push(expr`${rel.moraleDelta} * ${pairVar}`);
      objectiveTerms.push(expr`${rel.moraleDelta} * ${pairVar}`);
    }

    m.constraint(
      expr`${sum(powerTerms)} >= ${req.requiredPower}`,
      `raid_power_${DAY_KEYS[d]}_${s}`
    );

    if (req.minStaff > 0) {
      m.constraint(
        expr`${sum(slotVars)} >= ${req.minStaff}`,
        `min_staff_${DAY_KEYS[d]}_${s}`
      );
    }

    if (req.isFullMoon && s === "night") {
      for (const mId of stage.availableMonsters) {
        if (MONSTERS[mId].fullMoonNightForbidden) {
          m.constraint(
            expr`${nightVars[mId][d]} <= 0`,
            `full_moon_${mId}_${DAY_KEYS[d]}`
          );
        }
      }
    }

    if (s === "night") {
      for (const mId of stage.availableMonsters) {
        if (MONSTERS[mId].requiresNightPartner) {
          const otherNightVars = stage.availableMonsters
            .filter((id) => id !== mId)
            .map((id) => nightVars[id][d]);
          if (otherNightVars.length > 0) {
            m.constraint(
              expr`${nightVars[mId][d]} - ${sum(otherNightVars)} <= 0`,
              `${mId}_needs_partner_${DAY_KEYS[d]}_night`
            );
          } else {
            m.constraint(expr`${nightVars[mId][d]} <= 0`, `${mId}_no_solo_${DAY_KEYS[d]}_night`);
          }
        }
      }
    }
  }

  // 6. Optional pinned cells (for Z3 conflict diagnosis or guided hints)
  if (options?.pinnedSchedule) {
    for (const mId of stage.availableMonsters) {
      const mPins = options.pinnedSchedule[mId];
      if (!mPins) continue;
      for (const d of days) {
        const pinnedState = mPins[d];
        if (!pinnedState) continue;
        if (pinnedState === "day") {
          m.constraint(expr`${dayVars[mId][d]} == 1`, `pin_${mId}_${DAY_KEYS[d]}_day`);
        } else if (pinnedState === "night") {
          m.constraint(expr`${nightVars[mId][d]} == 1`, `pin_${mId}_${DAY_KEYS[d]}_night`);
        } else if (pinnedState === "off") {
          m.constraint(
            expr`${dayVars[mId][d]} + ${nightVars[mId][d]} == 0`,
            `pin_${mId}_${DAY_KEYS[d]}_off`
          );
        }
      }
    }
  }

  // 7. Optional no-good cut
  if (options?.forbidSchedule) {
    const activeOnes: Var[] = [];
    const activeZeros: Var[] = [];
    for (const mId of stage.availableMonsters) {
      for (const d of days) {
        const target = options.forbidSchedule[mId]?.[d] ?? "off";
        if (target === "day") {
          activeOnes.push(dayVars[mId][d]);
          activeZeros.push(nightVars[mId][d]);
        } else if (target === "night") {
          activeZeros.push(dayVars[mId][d]);
          activeOnes.push(nightVars[mId][d]);
        } else {
          activeZeros.push(dayVars[mId][d], nightVars[mId][d]);
        }
      }
    }
    m.constraint(
      expr`${sum(activeOnes)} - ${sum(activeZeros)} <= ${activeOnes.length - 1}`,
      "forbid_previous_solution"
    );
  }

  m.objective(maximize(sum(objectiveTerms)));

  return { model: m, dayVars, nightVars };
}

/**
 * Solves the stage to global optimality using WaSHI (HiGHS) and verifies the solution with validateSolution().
 */
export async function solveOptimalSchedule(stage: StageScenario): Promise<OptimalSolveResult> {
  const days = getStageDays(stage);
  const startTime = performance.now();
  const { model, dayVars, nightVars } = buildScheduleWashiModel(stage, { solver: "highs" });

  // Pre-solve integrity & LP export
  model.validateIntegrity();
  const lpString = model.toLpString();

  // Solve with HiGHS (use presolve: "off" to avoid HiGHS WASM MIP presolver false-infeasible bug on small binary models)
  const status = await model.solve({ presolve: "off" });
  const solveTimeMs = Math.max(1, Math.round(performance.now() - startTime));

  const optimalSchedule = createEmptySchedule(stage.availableMonsters, days.length);
  if (status === "Optimal" || model.hasPrimalSolution) {
    for (const mId of stage.availableMonsters) {
      for (const d of days) {
        const isDay = Math.round(dayVars[mId][d].value ?? 0) === 1;
        const isNight = Math.round(nightVars[mId][d].value ?? 0) === 1;
        optimalSchedule[mId][d] = isDay ? "day" : isNight ? "night" : "off";
      }
    }
  }

  // Mandatory independent verification via validateSolution()
  const report = model.validateSolution();

  return {
    status,
    optimalScore: Math.round(model.objectiveValue ?? BASE_MORALE_SCORE),
    optimalSchedule,
    lpString,
    solveTimeMs,
    verified: report.valid,
    maxViolation: report.maxViolation,
  };
}

/**
 * Diagnoses whether the player's currently assigned shifts can be completed to a valid schedule
 * using fast direct rule evaluation + HiGHS feasibility checks (no Z3 dependency).
 */
export async function diagnoseScheduleWithHighs(
  stage: StageScenario,
  currentSchedule: ScheduleGrid
): Promise<{ status: "Feasible" | "Infeasible"; conflicts: string[]; messages: string[] }> {
  const days = getStageDays(stage);
  const evalRes = evaluateSchedule(stage, currentSchedule);
  const laborViolations = evalRes.violations.filter(
    (v) => v.category !== "raid_power" && v.category !== "min_staff"
  );

  const conflicts: string[] = [];
  const messages: string[] = [];

  for (const v of laborViolations) {
    conflicts.push(`${v.category}_${v.monsterId ?? "slot"}`);
    messages.push(v.message);
  }

  const pinnedSchedule: Partial<Record<MonsterId, Partial<Record<DayIndex, ShiftType>>>> = {};
  for (const mId of stage.availableMonsters) {
    pinnedSchedule[mId] = {};
    for (const d of days) {
      const cell = currentSchedule[mId]?.[d];
      if (cell === "day" || cell === "night") {
        pinnedSchedule[mId]![d] = cell;
      }
    }
  }

  const { model } = buildScheduleWashiModel(stage, {
    solver: "highs",
    pinnedSchedule,
  });

  const status = await model.solve({ presolve: "off" });
  if (status === "Optimal" && laborViolations.length === 0) {
    return { status: "Feasible", conflicts: [], messages: [] };
  }

  // If no direct labor violation was triggered yet, find which monster's pinned shifts cause the dead-end
  if (laborViolations.length === 0) {
    for (const mId of stage.availableMonsters) {
      const relaxedPins = { ...pinnedSchedule, [mId]: {} };
      const { model: relaxedModel } = buildScheduleWashiModel(stage, {
        solver: "highs",
        pinnedSchedule: relaxedPins,
      });
      const relaxedStatus = await relaxedModel.solve({ presolve: "off" });
      if (relaxedStatus === "Optimal") {
        conflicts.push(`deadend_${mId}`);
        messages.push(
          `${MONSTERS[mId].name}の現在の出撃配置が偏っているため、残りの曜日の襲撃を防ぎきれなくなっています`
        );
      }
    }
    if (messages.length === 0) {
      conflicts.push("deadend_combined");
      messages.push("複数のモンスターの出撃日が重なり、後半の襲撃枠で人手不足が発生しています");
    }
  }

  return {
    status: "Infeasible",
    conflicts,
    messages,
  };
}

/**
 * Generates a stage scenario using `candidateFactory(attempt)` and verifies with HiGHS (`solveOptimalSchedule`)
 * and the independent evaluator (`evaluateSchedule`) that an Optimal, strictly valid solution exists.
 * If a candidate seed ever fails verification, it automatically retries with the next attempt index.
 */
export async function generateVerifiedStageWithHighs(
  candidateFactory: (attempt: number) => StageScenario,
  maxAttempts = 8
): Promise<{ stage: StageScenario; optimalResult: OptimalSolveResult }> {
  let lastStage: StageScenario | null = null;
  let lastResult: OptimalSolveResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = candidateFactory(attempt);
    lastStage = candidate;
    const res = await solveOptimalSchedule(candidate);
    lastResult = res;
    const evalCheck = evaluateSchedule(candidate, res.optimalSchedule);
    if (res.status === "Optimal" && res.verified && evalCheck.isValid) {
      return { stage: candidate, optimalResult: res };
    }
  }

  return {
    stage: lastStage!,
    optimalResult: lastResult!,
  };
}

