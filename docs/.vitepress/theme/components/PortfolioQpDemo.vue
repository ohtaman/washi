<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));

const minReturnPct = ref(7.5);
const isSolving = ref(false);
const isDirty = ref(false);
const solveTimeMs = ref(0);
const varianceVal = ref(0.0088);

const assets = [
  { id: "Tech", labelEn: "US Tech Equity", labelJa: "ハイテク株", ret: 0.12, color: "#c23b22" },
  { id: "Global", labelEn: "Global Index", labelJa: "全世界株式", ret: 0.085, color: "#1e3a5f" },
  { id: "REIT", labelEn: "Real Estate (REIT)", labelJa: "不動産 REIT", ret: 0.07, color: "#237a4b" },
  { id: "Gold", labelEn: "Gold (Hedge)", labelJa: "金 (ヘッジ)", ret: 0.055, color: "#b45309" },
  { id: "Bonds", labelEn: "Gov Bonds", labelJa: "国債", ret: 0.035, color: "#64748b" },
];

const weights = ref<Record<string, number>>({
  Tech: 0.25,
  Global: 0.30,
  REIT: 0.15,
  Gold: 0.10,
  Bonds: 0.20,
});

function markDirty() {
  isDirty.value = true;
}

async function solvePortfolio() {
  if (typeof window === "undefined") return;
  isSolving.value = true;
  try {
    const t0 = performance.now();
    const { Model, expr, sum, QuadExpr } = await getWashiClient(false);

    const m = new Model({ name: "PortfolioQP5", solver: "highs" });
    const w = m.addVars(
      assets.map((a) => a.id),
      { lb: 0, ub: 0.6, name: "w" }
    );

    m.addConstr(expr`${sum(assets.map((a) => w.get(a.id)!))} == 1`, { name: "full_invest" });

    const targetRet = minReturnPct.value / 100;
    const expectedRet = sum(assets.map((a) => expr`${a.ret} * ${w.get(a.id)!}`));
    m.addConstr(expr`${expectedRet} >= ${targetRet}`, { name: "target_return" });

    // Covariance matrix across 5 asset classes
    const risk = new QuadExpr()
      .addQuadTerm(w.get("Tech")!, w.get("Tech")!, 0.045)
      .addQuadTerm(w.get("Global")!, w.get("Global")!, 0.022)
      .addQuadTerm(w.get("REIT")!, w.get("REIT")!, 0.018)
      .addQuadTerm(w.get("Gold")!, w.get("Gold")!, 0.015)
      .addQuadTerm(w.get("Bonds")!, w.get("Bonds")!, 0.003)
      .addQuadTerm(w.get("Tech")!, w.get("Global")!, 0.024)
      .addQuadTerm(w.get("Tech")!, w.get("REIT")!, 0.010)
      .addQuadTerm(w.get("Global")!, w.get("REIT")!, 0.012)
      .addQuadTerm(w.get("Tech")!, w.get("Gold")!, -0.006)
      .addQuadTerm(w.get("Global")!, w.get("Gold")!, -0.004)
      .addQuadTerm(w.get("Tech")!, w.get("Bonds")!, 0.002);

    m.minimize(risk);
    await m.solve();
    solveTimeMs.value = performance.now() - t0;

    if (m.status === "Optimal") {
      varianceVal.value = m.objectiveValue ?? 0;
      const nextW: Record<string, number> = {};
      for (const a of assets) {
        nextW[a.id] = w.get(a.id)!.value ?? 0;
      }
      weights.value = nextW;
    }
    isDirty.value = false;
  } finally {
    isSolving.value = false;
  }
}

onMounted(() => {
  solvePortfolio();
});
</script>

<template>
  <div class="washi-app-card">
    <div class="washi-app-header">
      <div class="washi-header-top">
        <div>
          <span class="washi-app-eyebrow">INTERACTIVE EXAMPLE · 5 ASSETS CONVEX QP (QuadExpr)</span>
          <h4 class="washi-app-title">
            {{ isJa ? "ポートフォリオ配分オプティマイザ (Markowitz QP)" : "Portfolio Allocation Optimizer (Markowitz QP)" }}
          </h4>
          <p class="washi-app-subtitle">
            {{
              isJa
                ? "目標期待リターンを変更して「▶ 最適化を実行」を押すと、5資産の共分散行列（QuadExpr）からリスク最小の配分比率を計算します。"
                : "Adjust the target expected return and click '▶ Run Optimization' to solve the 5-asset Quadratic Program."
            }}
          </p>
        </div>

        <button
          class="washi-solve-btn"
          :class="{ dirty: isDirty, solving: isSolving }"
          :disabled="isSolving"
          @click="solvePortfolio"
        >
          <span v-if="isSolving">⏳ {{ isJa ? "計算中..." : "Solving..." }}</span>
          <span v-else>▶ {{ isJa ? "最適化を実行" : "Run Optimization" }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot"></span>
        </button>
      </div>
    </div>

    <div class="washi-controls-bar" style="justify-content: space-between;">
      <label class="washi-control-item" style="flex: 1; max-width: 460px;">
        <span style="min-width: 175px;">
          {{ isJa ? "目標期待リターン:" : "Target Expected Return:" }}
          <strong>{{ minReturnPct.toFixed(1) }}%</strong>
        </span>
        <input
          type="range"
          min="4.5"
          max="10.2"
          step="0.1"
          v-model.number="minReturnPct"
          @input="markDirty"
          style="flex: 1; accent-color: #c23b22;"
        />
      </label>
      <div class="solve-meta">
        HiGHS QP · {{ solveTimeMs.toFixed(1) }} ms ·
        {{ isJa ? "最小分散:" : "Min Variance:" }}
        <strong>{{ varianceVal.toFixed(5) }}</strong>
      </div>
    </div>

    <!-- Allocation Stacked Bar & Cards -->
    <div style="padding: 16px 20px;" :class="{ 'is-stale': isDirty }">
      <div v-if="isDirty" class="dirty-banner" style="margin-bottom: 12px;">
        {{ isJa ? "目標リターンが変更されました。右上の「▶ 最適化を実行」を押して再計算してください。" : "Target return changed. Click '▶ Run Optimization' above to recompute." }}
      </div>

      <div style="display: flex; height: 22px; border-radius: 6px; overflow: hidden; margin-bottom: 14px; border: 1px solid var(--vp-c-divider);">
        <div
          v-for="a in assets"
          :key="a.id"
          :style="{ width: `${(weights[a.id] || 0) * 100}%`, background: a.color }"
          :title="a.labelEn"
        ></div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px;">
        <div v-for="a in assets" :key="a.id" class="qp-asset-card">
          <div class="qp-asset-top">
            <span class="qp-dot" :style="{ background: a.color }"></span>
            <strong>{{ isJa ? a.labelJa : a.labelEn }}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px;">
            <span class="qp-pct" :style="{ color: a.color, marginTop: 0 }">
              {{ ((weights[a.id] || 0) * 100).toFixed(1) }}%
            </span>
            <span class="qp-ret">E[R]={{ (a.ret * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/washi/demo/?preset=portfolio_qp" class="playground-link">
        &lt;/&gt; {{ isJa ? "Playground でコードを編集する →" : "Edit Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
