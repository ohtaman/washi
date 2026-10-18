<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));
const isZh = computed(() => lang.value.startsWith("zh"));

interface StaffMember {
  id: string;
  role: "Senior" | "Mid" | "Junior";
  roleJa: string;
  roleZh: string;
  wage: number;
  maxShifts: number;
  isSenior: boolean;
}

const staffList: StaffMember[] = [
  { id: "Alice", role: "Senior", roleJa: "シニア", roleZh: "资深", wage: 160, maxShifts: 5, isSenior: true },
  { id: "Bob", role: "Senior", roleJa: "シニア", roleZh: "资深", wage: 155, maxShifts: 5, isSenior: true },
  { id: "Claire", role: "Senior", roleJa: "シニア", roleZh: "资深", wage: 150, maxShifts: 5, isSenior: true },
  { id: "David", role: "Mid", roleJa: "中堅", roleZh: "骨干", wage: 125, maxShifts: 5, isSenior: false },
  { id: "Elena", role: "Mid", roleJa: "中堅", roleZh: "骨干", wage: 120, maxShifts: 5, isSenior: false },
  { id: "Frank", role: "Junior", roleJa: "ジュニア", roleZh: "初级", wage: 100, maxShifts: 5, isSenior: false },
  { id: "Grace", role: "Junior", roleJa: "ジュニア", roleZh: "初级", wage: 95, maxShifts: 5, isSenior: false },
  { id: "Hiro", role: "Junior", roleJa: "ジュニア", roleZh: "初级", wage: 95, maxShifts: 5, isSenior: false },
];

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
const daysZh: Record<string, string> = {
  Mon: "周一",
  Tue: "周二",
  Wed: "周三",
  Thu: "周四",
  Fri: "周五",
  Sat: "周六",
  Sun: "周日",
};

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
          <span class="washi-app-eyebrow">INTERACTIVE EXAMPLE · 8 STAFF × 7 DAYS (56 BINARY VARS)</span>
          <h4 class="washi-app-title">
            {{ isJa ? "週間シフトスケジューラ ＆ 希望休の競合診断" : isZh ? "周排班计划器与休假冲突诊断" : "Weekly Shift Scheduler & Conflict Diagnosis" }}
          </h4>
          <p class="washi-app-subtitle">
            {{
              isJa
                ? "カレンダーのセルをクリックして希望休を変更し、「▶ 最適化を実行」を押すと HiGHS が最小コストのシフト表を計算します。"
                : isZh
                ? "点击表格单元格切换休假申请，然后点击“▶ 运行优化”，由 HiGHS 计算最低成本排班表。"
                : "Click cells to toggle vacation requests, then click '▶ Run Optimization' to solve with HiGHS."
            }}
          </p>
        </div>

        <button
          class="washi-solve-btn"
          :class="{ dirty: isDirty, solving: isSolving }"
          :disabled="isSolving"
          @click="solveRoster"
        >
          <span v-if="isSolving">⏳ {{ isJa ? "計算中..." : isZh ? "计算中..." : "Solving..." }}</span>
          <span v-else>▶ {{ isJa ? "最適化を実行" : isZh ? "运行优化" : "Run Optimization" }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot" :title="isJa ? '未反映の変更があります' : isZh ? '有未应用的更改' : 'Unsolved changes'"></span>
        </button>
      </div>

      <!-- Preset Scenarios: 3 Feasible + 1 Conflict -->
      <div class="washi-app-scenarios">
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'standard' }"
          @click="selectPreset('standard')"
        >
          1. {{ isJa ? "標準シフト（平日4名・週末5〜6名）" : isZh ? "标准需求（工作日 4 人·周末 5–6 人）" : "Standard Demand (4–6/day)" }}
        </button>
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'weekend_peak' }"
          @click="selectPreset('weekend_peak')"
        >
          2. {{ isJa ? "週末ピーク体制（シニア2名必須）" : isZh ? "周末高峰配置（每日至少 2 名资深）" : "Weekend Peak (≥2 Seniors/day)" }}
        </button>
        <button
          class="washi-chip-btn"
          :class="{ active: activePreset === 'two_days_off' }"
          @click="selectPreset('two_days_off')"
        >
          3. {{ isJa ? "全員2日ずつ希望休を指定" : isZh ? "全员各申请 2 天休假" : "Everyone Requests 2 Days Off" }}
        </button>
        <button
          class="washi-chip-btn danger"
          :class="{ active: activePreset === 'conflict' }"
          @click="selectPreset('conflict')"
        >
          ⚠️ {{ isJa ? "競合例：土曜にシニア全員が希望休" : isZh ? "冲突示例：周六所有资深员工申请休假" : "Conflict: All Seniors Off on Sat" }}
        </button>
      </div>
    </div>

    <!-- Rule Controls Bar -->
    <div class="washi-controls-bar">
      <label class="washi-control-item">
        <span>{{ isJa ? "1日あたりの最低シニア人数:" : isZh ? "每日最少资深员工数:" : "Min Seniors / Day:" }}</span>
        <select v-model.number="minSeniorPerDay" @change="markDirty" class="washi-select-sm">
          <option :value="0">0 {{ isJa ? "名（制約なし）" : isZh ? "人（无限制）" : "(None)" }}</option>
          <option :value="1">1 {{ isJa ? "名以上" : isZh ? "人以上" : "Senior" }}</option>
          <option :value="2">2 {{ isJa ? "名以上" : isZh ? "人以上" : "Seniors" }}</option>
        </select>
      </label>
      <label class="washi-control-item">
        <span>{{ isJa ? "各スタッフの週最低出勤日数:" : isZh ? "每人每周最少出勤天数:" : "Min Shifts / Staff:" }}</span>
        <select v-model.number="minShiftsPerStaff" @change="markDirty" class="washi-select-sm">
          <option :value="2">2 {{ isJa ? "日以上" : isZh ? "天以上" : "days" }}</option>
          <option :value="3">3 {{ isJa ? "日以上" : isZh ? "天以上" : "days" }}</option>
          <option :value="4">4 {{ isJa ? "日以上" : isZh ? "天以上" : "days" }}</option>
        </select>
      </label>
      <span v-if="isDirty" class="dirty-notice">
        {{ isJa ? "※ 条件を変更しました。「▶ 最適化を実行」を押すと結果に反映されます" : isZh ? "※ 参数已修改，点击“▶ 运行优化”更新排班结果" : "* Parameters modified. Click '▶ Run Optimization' to update." }}
      </span>
    </div>

    <!-- Roster Matrix Table -->
    <div class="washi-table-wrap" :class="{ 'is-stale': isDirty }">
      <table class="washi-roster-table">
        <thead>
          <tr>
            <th class="staff-col">{{ isJa ? "スタッフ (日給 / 上限5日)" : isZh ? "员工 (日薪 / 上限 5 天)" : "Staff (Wage / Max 5d)" }}</th>
            <th
              v-for="d in days"
              :key="d"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <div>{{ isJa ? daysJa[d] : isZh ? daysZh[d] : d }}</div>
              <div style="font-size: 0.68rem; font-weight: 500; opacity: 0.8;">
                {{ isJa ? `必要 ${dailyDemand[d]}名` : isZh ? `需 ${dailyDemand[d]}人` : `Need ${dailyDemand[d]}` }}
              </div>
            </th>
            <th>{{ isJa ? "週出勤" : isZh ? "周出勤" : "Total" }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in staffList" :key="s.id">
            <td class="staff-col">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span class="staff-name">{{ s.id }}</span>
                <span class="role-pill" :class="{ senior: s.isSenior }">
                  {{ isJa ? s.roleJa : isZh ? s.roleZh : s.role }}
                </span>
              </div>
              <div class="staff-meta">
                <span>${{ s.wage }}/d {{ isJa ? "(土日+$20)" : isZh ? "(周末+$20)" : "(Wknd +$20)" }}</span>
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
              :title="isJa ? 'クリックで希望休をON/OFF' : isZh ? '点击切换休假申请' : 'Click to toggle vacation request'"
            >
              <template v-if="requestedOff.has(keyOf(s.id, d))">
                <span class="cell-badge off-req" :class="{ conflict: isConflictingCell(s.id, d) }">
                  {{ isJa ? "希望休" : isZh ? "请假" : "Off Req" }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal' && assignments[keyOf(s.id, d)] === 1">
                <span class="cell-badge on-duty">
                  ● {{ isJa ? "出勤" : isZh ? "值班" : "On Duty" }}
                </span>
              </template>
              <template v-else-if="status === 'Optimal'">
                <span class="cell-badge rest">
                  {{ isJa ? "公休" : isZh ? "轮休" : "Rest" }}
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
            <td class="staff-col foot-label">{{ isJa ? "日別割当 / 必要人数" : isZh ? "每日排班 / 需求人数" : "Assigned / Required" }}</td>
            <td
              v-for="d in days"
              :key="d"
              class="foot-val"
              :class="{ 'conflict-col-head': isConflictingDay(d) }"
            >
              <span v-if="status === 'Optimal'">
                {{ dayTotalStaff(d) }} / {{ dailyDemand[d] }}{{ isJa ? "名" : isZh ? "人" : "" }}
              </span>
              <span v-else-if="isConflictingDay(d)" style="color: #e11d48; font-weight: 700;">
                ✗ {{ isJa ? "不足" : isZh ? "不足" : "Short" }}
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
        <strong>{{ isJa ? "最適シフト確定 (Optimal)" : isZh ? "已求得最优排班 (Optimal)" : "Optimal Roster Found" }}</strong>
        <span class="solve-meta">HiGHS WASM · {{ solveTimeMs.toFixed(1) }} ms · 56 Binary Vars</span>
      </div>
      <div class="result-kpi">
        <span>{{ isJa ? "週間総人件費 (最小化):" : isZh ? "周总人力成本 (最小化):" : "Total Weekly Payroll (Minimized):" }}</span>
        <strong class="kpi-num">${{ totalCost?.toLocaleString() }}</strong>
      </div>
    </div>

    <div v-else class="washi-result-bar conflict">
      <div class="conflict-header">
        <span class="status-dot conflict"></span>
        <strong>
          {{
            isJa
              ? "シフト編成不可 (Infeasible) — Z3 が特定した原因制約 (Unsat Core):"
              : isZh
              ? "无法排班 (Infeasible) — Z3 定位的冲突约束子集 (Unsat Core):"
              : "Schedule Infeasible — Conflicting Constraints Identified by Z3 (Unsat Core):"
          }}
        </strong>
      </div>
      <div class="unsat-chips">
        <code v-for="c in unsatCore" :key="c" class="unsat-chip">{{ c }}</code>
      </div>
      <div class="conflict-hint">
        {{
          isJa
            ? "💡 赤枠の「希望休」セルを1つクリックして解除し、「▶ 最適化を実行」を押すと再び最適シフトが組めるようになります。"
            : isZh
            ? "💡 点击任意红框“请假”单元格取消该休假申请，再点击“▶ 运行优化”即可恢复可行排班。"
            : "💡 Click one of the red 'Off Req' cells to clear that vacation request, then click '▶ Run Optimization'."
        }}
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/washi/demo/?preset=shift_scheduling" class="playground-link">
        {{ isJa ? "Playground でコードを編集する →" : isZh ? "在 Playground 中编辑代码 →" : "Edit Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
