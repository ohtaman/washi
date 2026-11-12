<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";
import { useComponentTranslations } from "../locales/index";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));
const isZh = computed(() => lang.value.startsWith("zh"));
const i18n = computed(() => useComponentTranslations(lang.value).dict.shift);

interface StaffMember {
  id: string;
  role: "Senior" | "Mid" | "Junior";
  wage: number;
  maxShifts: number;
  isSenior: boolean;
}

const staffList: StaffMember[] = [
  { id: "Alice", role: "Senior", wage: 160, maxShifts: 5, isSenior: true },
  { id: "Bob", role: "Senior", wage: 155, maxShifts: 5, isSenior: true },
  { id: "Claire", role: "Senior", wage: 150, maxShifts: 5, isSenior: true },
  { id: "David", role: "Mid", wage: 125, maxShifts: 5, isSenior: false },
  { id: "Elena", role: "Mid", wage: 120, maxShifts: 5, isSenior: false },
  { id: "Frank", role: "Junior", wage: 100, maxShifts: 5, isSenior: false },
  { id: "Grace", role: "Junior", wage: 95, maxShifts: 5, isSenior: false },
  { id: "Hiro", role: "Junior", wage: 95, maxShifts: 5, isSenior: false },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const activePreset = ref<"standard" | "weekend_peak" | "two_days_off" | "conflict">("standard");
const dailyDemand = ref<Record<string, number>>({
  Mon: 4,
  Tue: 4,
  Wed: 4,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 5,
});
const minSeniorPerDay = ref(1);
const minShiftsPerStaff = ref(3);

// Set of "Staff_Day" keys where staff requested a day off
const requestedOff = ref<Set<string>>(
  new Set([
    "Alice_Mon",
    "Bob_Thu",
    "Claire_Sun",
    "David_Tue",
    "Elena_Sat",
    "Frank_Wed",
    "Grace_Fri",
    "Hiro_Mon",
  ])
);

const isSolving = ref(false);
const isDirty = ref(false);
const status = ref<"Optimal" | "Infeasible">("Optimal");
const totalCost = ref<number | null>(null);
const solveTimeMs = ref<number>(0);
const assignments = ref<Record<string, number>>({});
const unsatCore = ref<string[]>([]);

function keyOf(staffId: string, day: string) {
  return `${staffId}_${day}`;
}

function markDirty() {
  isDirty.value = true;
}

function toggleDayOff(staffId: string, day: string) {
  const k = keyOf(staffId, day);
  const next = new Set(requestedOff.value);
  if (next.has(k)) {
    next.delete(k);
  } else {
    next.add(k);
  }
  requestedOff.value = next;
  isDirty.value = true;
}

function selectPreset(preset: "standard" | "weekend_peak" | "two_days_off" | "conflict") {
  activePreset.value = preset;
  if (preset === "standard") {
    dailyDemand.value = { Mon: 4, Tue: 4, Wed: 4, Thu: 4, Fri: 5, Sat: 6, Sun: 5 };
    minSeniorPerDay.value = 1;
    minShiftsPerStaff.value = 3;
    requestedOff.value = new Set([
      "Alice_Mon",
      "Bob_Thu",
      "Claire_Sun",
      "David_Tue",
      "Elena_Sat",
      "Frank_Wed",
      "Grace_Fri",
      "Hiro_Mon",
    ]);
  } else if (preset === "weekend_peak") {
    dailyDemand.value = { Mon: 4, Tue: 4, Wed: 4, Thu: 4, Fri: 5, Sat: 6, Sun: 6 };
    minSeniorPerDay.value = 2;
    minShiftsPerStaff.value = 3;
    requestedOff.value = new Set([
      "Alice_Tue",
      "Bob_Wed",
      "Claire_Mon",
      "David_Fri",
      "Elena_Thu",
      "Frank_Fri",
      "Grace_Mon",
      "Hiro_Wed",
    ]);
  } else if (preset === "two_days_off") {
    dailyDemand.value = { Mon: 4, Tue: 4, Wed: 4, Thu: 4, Fri: 5, Sat: 5, Sun: 5 };
    minSeniorPerDay.value = 1;
    minShiftsPerStaff.value = 3;
    requestedOff.value = new Set([
      "Alice_Mon",
      "Alice_Tue",
      "Bob_Wed",
      "Bob_Thu",
      "Claire_Fri",
      "Claire_Sat",
      "David_Sun",
      "David_Mon",
      "Elena_Tue",
      "Elena_Wed",
      "Frank_Thu",
      "Frank_Fri",
      "Grace_Sat",
      "Grace_Sun",
      "Hiro_Tue",
      "Hiro_Thu",
    ]);
  } else if (preset === "conflict") {
    dailyDemand.value = { Mon: 4, Tue: 4, Wed: 4, Thu: 4, Fri: 5, Sat: 5, Sun: 5 };
    minSeniorPerDay.value = 1;
    minShiftsPerStaff.value = 3;
    requestedOff.value = new Set([
      "Alice_Sat",
      "Bob_Sat",
      "Claire_Sat",
      "David_Tue",
      "Elena_Wed",
      "Frank_Mon",
    ]);
  }
  isDirty.value = true;
}

function buildConstraints(m: any, sum: any, expr: any) {
  const staffIds = staffList.map((s) => s.id);
  const shift = m.binary(staffIds, [...days]);

  for (const d of days) {
    const reqCount = dailyDemand.value[d] ?? 4;
    m.constraint(
      expr`${sum(staffList, (s: StaffMember) => shift[s.id][d])} >= ${reqCount}`,
      `coverage_${d}`
    );

    if (minSeniorPerDay.value > 0) {
      const seniors = staffList.filter((s) => s.isSenior);
      m.constraint(
        expr`${sum(seniors, (s: StaffMember) => shift[s.id][d])} >= ${minSeniorPerDay.value}`,
        `senior_${d}`
      );
    }
  }

  for (const s of staffList) {
    m.constraint(
      expr`${sum(days, (d: string) => shift[s.id][d])} <= ${s.maxShifts}`,
      `max_shifts_${s.id}`
    );
    if (minShiftsPerStaff.value > 0) {
      m.constraint(
        expr`${sum(days, (d: string) => shift[s.id][d])} >= ${minShiftsPerStaff.value}`,
        `min_shifts_${s.id}`
      );
    }
  }

  for (const req of requestedOff.value) {
    const [sId, day] = req.split("_");
    const v = shift[sId]?.[day];
    if (v) {
      m.constraint(expr`${v} == 0`, `day_off_${sId}_${day}`);
    }
  }

  return shift;
}

async function solveRoster() {
  if (typeof window === "undefined") return;
  isSolving.value = true;

  try {
    const t0 = performance.now();
    const { Model, sum, dot, expr, minimize } = await getWashiClient(false);

    const m = new Model("ShiftRoster8x7");
    const shift = buildConstraints(m, sum, expr);

    const costMap = Object.fromEntries(
      staffList.map((s) => [
        s.id,
        Object.fromEntries(days.map((d) => [d, s.wage + (d === "Sat" || d === "Sun" ? 20 : 0)])),
      ])
    );
    m.objective(minimize(dot(costMap, shift)));
    const solveStatus = await m.solve();
    const elapsed = performance.now() - t0;
    solveTimeMs.value = elapsed;

    if (solveStatus === "Optimal") {
      status.value = "Optimal";
      totalCost.value = m.objectiveValue;
      unsatCore.value = [];
      const nextAssign: Record<string, number> = {};
      for (const s of staffList) {
        for (const d of days) {
          nextAssign[keyOf(s.id, d)] = Math.round(shift[s.id][d].value ?? 0);
        }
      }
      assignments.value = nextAssign;
    } else {
      status.value = "Infeasible";
      totalCost.value = null;
      assignments.value = {};

      if ((window as any).crossOriginIsolated) {
        try {
          const { Model: Z3Model, sum: z3Sum, expr: z3Expr } = await getWashiClient(true);
          const diag = new Z3Model({ name: "ShiftConflict", solver: "z3" });
          buildConstraints(diag, z3Sum, z3Expr);
          await diag.check("z3");
          unsatCore.value =
            diag.unsatCore && diag.unsatCore.length > 0
              ? diag.unsatCore
              : inferLocalConflict();
        } catch {
          unsatCore.value = inferLocalConflict();
        }
      } else {
        unsatCore.value = inferLocalConflict();
      }
    }
    isDirty.value = false;
  } finally {
    isSolving.value = false;
  }
}

function inferLocalConflict(): string[] {
  for (const d of days) {
    const avail = staffList.filter((s) => !requestedOff.value.has(keyOf(s.id, d)));
    const reqCount = dailyDemand.value[d] ?? 4;
    if (avail.length < reqCount) {
      return [
        `coverage_${d}`,
        ...staffList
          .filter((s) => requestedOff.value.has(keyOf(s.id, d)))
          .map((s) => `day_off_${s.id}_${d}`),
      ];
    }
    if (minSeniorPerDay.value > 0) {
      const availSeniors = avail.filter((s) => s.isSenior);
      if (availSeniors.length < minSeniorPerDay.value) {
        return [
          `senior_${d}`,
          ...staffList
            .filter((s) => s.isSenior && requestedOff.value.has(keyOf(s.id, d)))
            .map((s) => `day_off_${s.id}_${d}`),
        ];
      }
    }
  }
  return ["max_shifts_limit", "coverage_weekly"];
}

function isConflictingCell(staffId: string, day: string) {
  return !isDirty.value && unsatCore.value.includes(`day_off_${staffId}_${day}`);
}

function isConflictingDay(day: string) {
  return (
    !isDirty.value &&
    (unsatCore.value.includes(`coverage_${day}`) ||
      unsatCore.value.includes(`senior_${day}`))
  );
}

function staffTotalDays(staffId: string) {
  if (status.value !== "Optimal") return 0;
  return days.reduce((acc, d) => acc + (assignments.value[keyOf(staffId, d)] || 0), 0);
}

function dayTotalStaff(day: string) {
  if (status.value !== "Optimal") return 0;
  return staffList.reduce((acc, s) => acc + (assignments.value[keyOf(s.id, day)] || 0), 0);
}

onMounted(() => {
  solveRoster();
});
</script>

<template>
  <div class="washi-app-card">
    <div class="washi-app-header">
      <div class="washi-header-top">
        <div>
          <span class="washi-app-eyebrow">
            {{ i18n.eyebrow }}
          </span>
          <h4 class="washi-app-title">
            {{ i18n.title }}
          </h4>
          <p class="washi-app-subtitle">
            {{ i18n.subtitle }}
          </p>
        </div>

        <button
          class="washi-solve-btn"
          :class="{ dirty: isDirty, solving: isSolving }"
          :disabled="isSolving"
          @click="solveRoster"
        >
          <span v-if="isSolving">⏳ {{ i18n.solving }}</span>
          <span v-else>▶ {{ i18n.run }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot" :title="i18n.dirtyTooltip"></span>
        </button>
      </div>

      <!-- Preset Scenarios: 3 Feasible + 1 Conflict -->
      <div class="washi-app-scenarios">
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'standard' }"
          @click="selectPreset('standard')"
        >
          {{ i18n.presets.standard }}
        </button>
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'weekend_peak' }"
          @click="selectPreset('weekend_peak')"
        >
          {{ i18n.presets.weekend }}
        </button>
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'two_days_off' }"
          @click="selectPreset('two_days_off')"
        >
          {{ i18n.presets.twoOff }}
        </button>
        <button
          class="washi-chip-btn danger"
          :class="{ active: activePreset === 'conflict' }"
          @click="selectPreset('conflict')"
        >
          {{ i18n.presets.conflict }}
        </button>
      </div>
    </div>

    <!-- Rule Controls Bar -->
    <div class="washi-controls-bar">
      <label class="washi-control-item">
        <span>{{ i18n.minSeniors }}</span>
        <select v-model.number="minSeniorPerDay" @change="markDirty" class="washi-select-sm">
          <option :value="0">{{ i18n.minSeniorsOptions.none }}</option>
          <option :value="1">{{ i18n.minSeniorsOptions.one }}</option>
          <option :value="2">{{ i18n.minSeniorsOptions.two }}</option>
        </select>
      </label>
      <label class="washi-control-item">
        <span>{{ i18n.minShifts }}</span>
        <select v-model.number="minShiftsPerStaff" @change="markDirty" class="washi-select-sm">
          <option :value="2">2 {{ i18n.minShiftsSuffix }}</option>
          <option :value="3">3 {{ i18n.minShiftsSuffix }}</option>
          <option :value="4">4 {{ i18n.minShiftsSuffix }}</option>
        </select>
      </label>
      <span v-if="isDirty" class="dirty-notice">
        {{ i18n.dirtyBanner }}
      </span>
    </div>

    <!-- Roster Matrix Table -->
    <div class="washi-table-wrap" :class="{ 'is-stale': isDirty }">
      <table class="washi-roster-table">
        <thead>
          <tr>
            <th class="staff-col">{{ i18n.colStaff }}</th>
            <th
              v-for="d in days"
              :key="d"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <div>{{ i18n.days[d] || d }}</div>
              <div style="font-size: 0.68rem; font-weight: 500; opacity: 0.8;">
                {{ i18n.needPrefix }}{{ dailyDemand[d] }}
              </div>
            </th>
            <th>{{ i18n.colTotal }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in staffList" :key="s.id">
            <td class="staff-col">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span class="staff-name">{{ s.id }}</span>
                <span class="role-pill" :class="{ senior: s.isSenior }">
                  {{ i18n.roles[s.role] || s.role }}
                </span>
              </div>
              <div class="staff-meta">
                <span>${{ s.wage }}/d {{ i18n.weekendExtra }}</span>
              </div>
            </td>
            <td
              v-for="d in days"
              :key="d"
              class="roster-cell"
              :class="{
                'is-conflict': isConflictingCell(s.id, d),
                'is-off-req': requestedOff.has(keyOf(s.id, d)),
              }"
              @click="toggleDayOff(s.id, d)"
              :title="i18n.toggleTitle" 
            >
              <template v-if="requestedOff.has(keyOf(s.id, d))">
                <span class="cell-badge off-req" :class="{ conflict: isConflictingCell(s.id, d) }">
                  {{ i18n.offReq }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal' && assignments[keyOf(s.id, d)] === 1">
                <span class="cell-badge on-duty">
                  {{ i18n.onDuty }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal'">
                <span class="cell-badge rest">
                  {{ i18n.rest }}
                </span>
              </template>
              <template v-else>
                <span class="cell-badge rest">—</span>
              </template>
            </td>
            <td class="weekly-sum-cell">
              <span v-if="status === 'Optimal'">{{ staffTotalDays(s.id) }} / {{ s.maxShifts }}</span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="staff-col foot-label">{{ i18n.rowTotal }}</td>
            <td
              v-for="d in days"
              :key="d"
              class="foot-val"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <span v-if="status === 'Optimal'">
                {{ dayTotalStaff(d) }} / {{ dailyDemand[d] }}
              </span>
              <span v-else-if="isConflictingDay(d)" style="color: #e11d48; font-weight: 700;">
                {{ i18n.short }}
              </span>
              <span v-else>—</span>
            </td>
            <td class="foot-val">
              <span v-if="status === 'Optimal'">{{ days.reduce((a, d) => a + dayTotalStaff(d), 0) }}</span>
              <span v-else>—</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Status / Diagnosis Footer -->
    <div v-if="status === 'Optimal'" class="washi-result-bar optimal">
      <div class="result-main">
        <span class="status-dot optimal"></span>
        <strong>{{ i18n.optimalTitle }}</strong>
        <span class="solve-meta">
          HiGHS WASM · {{ solveTimeMs.toFixed(1) }} ms · {{ i18n.optimalSub }}
        </span>
      </div>
      <div class="result-kpi">
        <span>{{ i18n.payroll }}</span>
        <strong class="kpi-num">${{ totalCost?.toLocaleString() }}</strong>
      </div>
    </div>

    <div v-else class="washi-result-bar conflict">
      <div class="conflict-header">
        <span class="status-dot conflict"></span>
        <strong>
          {{ i18n.infeasibleTitle }}
        </strong>
      </div>
      <div class="unsat-chips">
        <code v-for="c in unsatCore" :key="c" class="unsat-chip">{{ c }}</code>
      </div>
      <div class="conflict-hint">
        {{ i18n.infeasibleTip }}
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/demo/?preset=shift_scheduling" target="_self" class="playground-link">
        {{ i18n.openPlayground }}
      </a>
    </div>
  </div>
</template>
