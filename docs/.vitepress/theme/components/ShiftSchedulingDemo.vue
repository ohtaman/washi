<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));

const staffList = [
  { id: "Alice", role: "Senior", roleJa: "シニア", wage: 140, maxShifts: 5, isSenior: true },
  { id: "Bob", role: "Senior", roleJa: "シニア", wage: 130, maxShifts: 5, isSenior: true },
  { id: "Charlie", role: "Junior", roleJa: "ジュニア", wage: 95, maxShifts: 5, isSenior: false },
] as const;

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const daysJa: Record<string, string> = {
  Mon: "月",
  Tue: "火",
  Wed: "水",
  Thu: "木",
  Fri: "金",
  Sat: "土",
  Sun: "日",
};

const dailyRequired = ref(2);
const requireSenior = ref(true);

// Set of "Staff_Day" keys where staff requested a day off
const requestedOff = ref<Set<string>>(new Set(["Alice_Mon", "Bob_Wed", "Charlie_Sat"]));

const isSolving = ref(false);
const status = ref<"Optimal" | "Infeasible" | "Solving">("Optimal");
const totalCost = ref<number | null>(1915);
const solveTimeMs = ref<number>(0);
const assignments = ref<Record<string, number>>({});
const unsatCore = ref<string[]>([]);
const z3Note = ref<string>("");

function keyOf(staffId: string, day: string) {
  return `${staffId}_${day}`;
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
  solveRoster();
}

function applyScenario(type: "feasible" | "sat_clash" | "senior_clash") {
  if (type === "feasible") {
    dailyRequired.value = 2;
    requireSenior.value = true;
    requestedOff.value = new Set(["Alice_Mon", "Bob_Wed", "Charlie_Sat"]);
  } else if (type === "sat_clash") {
    dailyRequired.value = 2;
    requireSenior.value = true;
    requestedOff.value = new Set([
      "Alice_Mon",
      "Bob_Wed",
      "Alice_Sat",
      "Bob_Sat",
      "Charlie_Sat",
    ]);
  } else if (type === "senior_clash") {
    dailyRequired.value = 2;
    requireSenior.value = true;
    requestedOff.value = new Set(["Alice_Wed", "Bob_Wed", "Charlie_Sat"]);
  }
  solveRoster();
}

function buildConstraints(m: any, expr: any, sum: any) {
  const shift = m.addVars(
    staffList.map((s) => s.id),
    [...days],
    { type: "binary", name: "shift" }
  );

  for (const d of days) {
    const workingToday = sum(staffList.map((s) => shift.get(s.id, d)!));
    m.addConstr(expr`${workingToday} >= ${dailyRequired.value}`, { name: `coverage_${d}` });

    if (requireSenior.value) {
      const seniorsToday = sum(
        staffList.filter((s) => s.isSenior).map((s) => shift.get(s.id, d)!)
      );
      m.addConstr(expr`${seniorsToday} >= 1`, { name: `senior_${d}` });
    }
  }

  for (const s of staffList) {
    const weeklyShifts = sum(days.map((d) => shift.get(s.id, d)!));
    m.addConstr(expr`${weeklyShifts} <= ${s.maxShifts}`, { name: `max_shifts_${s.id}` });
  }

  for (const req of requestedOff.value) {
    const [sId, day] = req.split("_");
    const v = shift.get(sId, day as any);
    if (v) {
      m.addConstr(expr`${v} == 0`, { name: `day_off_${sId}_${day}` });
    }
  }

  return shift;
}

async function solveRoster() {
  if (typeof window === "undefined") return;
  isSolving.value = true;
  z3Note.value = "";

  try {
    const t0 = performance.now();
    const { Model, expr, sum } = await getWashiClient(false);

    const m = new Model({ name: "ShiftRoster", solver: "highs" });
    const shift = buildConstraints(m, expr, sum);

    const costTerms: any[] = [];
    for (const s of staffList) {
      for (const d of days) {
        costTerms.push(expr`${s.wage} * ${shift.get(s.id, d)!}`);
      }
    }
    m.minimize(sum(costTerms));
    await m.solve();
    const elapsed = performance.now() - t0;
    solveTimeMs.value = elapsed;

    if (m.status === "Optimal") {
      status.value = "Optimal";
      totalCost.value = m.objectiveValue;
      unsatCore.value = [];
      const nextAssign: Record<string, number> = {};
      for (const s of staffList) {
        for (const d of days) {
          nextAssign[keyOf(s.id, d)] = Math.round(shift.get(s.id, d)!.value ?? 0);
        }
      }
      assignments.value = nextAssign;
    } else {
      status.value = "Infeasible";
      totalCost.value = null;
      assignments.value = {};

      // Run Z3 Unsat Core diagnosis if crossOriginIsolated is available
      if ((window as any).crossOriginIsolated) {
        try {
          const { Model: Z3Model, expr: z3Expr, sum: z3Sum } = await getWashiClient(true);
          const diag = new Z3Model({ name: "ShiftConflict", solver: "z3" });
          buildConstraints(diag, z3Expr, z3Sum);
          await diag.check();
          unsatCore.value = diag.unsatCore || [];
        } catch {
          unsatCore.value = inferLocalConflict();
        }
      } else {
        unsatCore.value = inferLocalConflict();
      }
    }
  } finally {
    isSolving.value = false;
  }
}

function inferLocalConflict(): string[] {
  for (const d of days) {
    const avail = staffList.filter((s) => !requestedOff.value.has(keyOf(s.id, d)));
    if (avail.length < dailyRequired.value) {
      return [
        `coverage_${d}`,
        ...staffList
          .filter((s) => requestedOff.value.has(keyOf(s.id, d)))
          .map((s) => `day_off_${s.id}_${d}`),
      ];
    }
    if (requireSenior.value) {
      const availSeniors = avail.filter((s) => s.isSenior);
      if (availSeniors.length < 1) {
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
  return unsatCore.value.includes(`day_off_${staffId}_${day}`);
}

function isConflictingDay(day: string) {
  return (
    unsatCore.value.includes(`coverage_${day}`) ||
    unsatCore.value.includes(`senior_${day}`)
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
      <div>
        <span class="washi-app-eyebrow">INTERACTIVE MINI-APP · HiGHS + Z3</span>
        <h4 class="washi-app-title">
          {{ isJa ? "週間シフトスケジューラ ＆ 希望休の衝突診断" : "Weekly Shift Scheduler & Conflict Diagnosis" }}
        </h4>
        <p class="washi-app-subtitle">
          {{
            isJa
              ? "セルをクリックしてスタッフの「希望休」を切り替えられます。条件が矛盾すると自動的に原因制約（Unsat Core）をハイライトします。"
              : "Click any cell in the calendar to toggle a staff vacation request. If requests clash, conflicting constraints are highlighted."
          }}
        </p>
      </div>
      <div class="washi-app-scenarios">
        <button class="washi-chip-btn" @click="applyScenario('feasible')">
          ✓ {{ isJa ? "標準（解あり）" : "Standard (Feasible)" }}
        </button>
        <button class="washi-chip-btn danger" @click="applyScenario('sat_clash')">
          ⚡ {{ isJa ? "土曜に全員希望休（衝突）" : "All Off on Sat (Clash)" }}
        </button>
        <button class="washi-chip-btn danger" @click="applyScenario('senior_clash')">
          ⚡ {{ isJa ? "水曜にシニア全員休（衝突）" : "Seniors Off Wed (Clash)" }}
        </button>
      </div>
    </div>

    <!-- Rule Controls Bar -->
    <div class="washi-controls-bar">
      <label class="washi-control-item">
        <span>{{ isJa ? "1日の必要人数:" : "Daily Required Staff:" }}</span>
        <select v-model.number="dailyRequired" @change="solveRoster" class="washi-select-sm">
          <option :value="1">1 {{ isJa ? "名" : "staff" }}</option>
          <option :value="2">2 {{ isJa ? "名" : "staff" }}</option>
          <option :value="3">3 {{ isJa ? "名" : "staff" }}</option>
        </select>
      </label>
      <label class="washi-control-item" style="cursor: pointer;">
        <input type="checkbox" v-model="requireSenior" @change="solveRoster" />
        <span>{{ isJa ? "毎日シニア1名以上を必須にする" : "Require ≥1 Senior on duty daily" }}</span>
      </label>
    </div>

    <!-- Roster Matrix Table -->
    <div class="washi-table-wrap">
      <table class="washi-roster-table">
        <thead>
          <tr>
            <th class="staff-col">{{ isJa ? "スタッフ (日給)" : "Staff (Daily Wage)" }}</th>
            <th
              v-for="d in days"
              :key="d"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <div>{{ isJa ? daysJa[d] : d }}</div>
            </th>
            <th>{{ isJa ? "週計" : "Weekly" }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in staffList" :key="s.id">
            <td class="staff-col">
              <div class="staff-name">{{ s.id }}</div>
              <div class="staff-meta">
                <span class="role-pill" :class="{ senior: s.isSenior }">
                  {{ isJa ? s.roleJa : s.role }}
                </span>
                <span>${{ s.wage }}/d</span>
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
              :title="isJa ? 'クリックで希望休を切り替え' : 'Click to toggle vacation request'"
            >
              <template v-if="requestedOff.has(keyOf(s.id, d))">
                <span class="cell-badge off-req" :class="{ conflict: isConflictingCell(s.id, d) }">
                  {{ isJa ? "希望休" : "Off Req" }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal' && assignments[keyOf(s.id, d)] === 1">
                <span class="cell-badge on-duty">
                  ● {{ isJa ? "出勤" : "On Duty" }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal'">
                <span class="cell-badge rest">
                  {{ isJa ? "公休" : "Rest" }}
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
            <td class="staff-col foot-label">{{ isJa ? "日別出勤人数" : "Daily Headcount" }}</td>
            <td
              v-for="d in days"
              :key="d"
              class="foot-val"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <span v-if="status === 'Optimal'">{{ dayTotalStaff(d) }} {{ isJa ? "名" : "" }}</span>
              <span v-else-if="isConflictingDay(d)" style="color: #e11d48; font-weight: 700;">✗</span>
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
        <strong>{{ isJa ? "最適シフト確定 (Optimal)" : "Optimal Roster Found" }}</strong>
        <span class="solve-meta">HiGHS WASM · {{ solveTimeMs.toFixed(1) }} ms</span>
      </div>
      <div class="result-kpi">
        <span>{{ isJa ? "週間総人件費:" : "Total Weekly Cost:" }}</span>
        <strong class="kpi-num">${{ totalCost?.toLocaleString() }}</strong>
      </div>
    </div>

    <div v-else class="washi-result-bar conflict">
      <div class="conflict-header">
        <span class="status-dot conflict"></span>
        <strong>
          {{
            isJa
              ? "シフト編成不可 (Infeasible) — 衝突しているルール (Unsat Core):"
              : "Schedule Infeasible — Conflicting Constraints (Unsat Core):"
          }}
        </strong>
      </div>
      <div class="unsat-chips">
        <code v-for="c in unsatCore" :key="c" class="unsat-chip">{{ c }}</code>
      </div>
      <div class="conflict-hint">
        {{
          isJa
            ? "💡 赤くハイライトされた「希望休」セルをクリックして解除するか、上の必要人数・シニア必須条件を緩めると即座に再計算されます。"
            : "💡 Click a highlighted red 'Off Req' cell to clear the vacation request, or relax the daily staffing rule above."
        }}
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/washi/demo/?preset=shift_scheduling" class="playground-link">
        &lt;/&gt; {{ isJa ? "Playground で生のモデリングコードを開く →" : "Open Raw Model Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
