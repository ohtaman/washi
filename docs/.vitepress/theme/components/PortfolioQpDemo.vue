<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));
const isZh = computed(() => lang.value.startsWith("zh"));

const minReturnPct = ref(7.5);
const isSolving = ref(false);
const isDirty = ref(false);
const solveTimeMs = ref(0);
const varianceVal = ref(0.0088);

const assets = [
  { id: "Tech", labelEn: "US Tech Equity", labelJa: "ハイテク株", labelZh: "美股科技", ret: 0.12, color: "#c23b22" },
  { id: "Global", labelEn: "Global Index", labelJa: "全世界株式", labelZh: "全球股票指数", ret: 0.085, color: "#1e3a5f" },
  { id: "REIT", labelEn: "Real Estate (REIT)", labelJa: "不動産 REIT", labelZh: "房地产 REIT", ret: 0.07, color: "#237a4b" },
  { id: "Gold", labelEn: "Gold (Hedge)", labelJa: "金 (ヘッジ)", labelZh: "黄金 (避险)", ret: 0.055, color: "#b45309" },
  { id: "Bonds", labelEn: "Gov Bonds", labelJa: "国債", labelZh: "国债", ret: 0.035, color: "#64748b" },
];

const cov = [
  [0.045, 0.020, 0.010, -0.004, 0.002],
  [0.020, 0.024, 0.012, -0.002, 0.002],
  [0.010, 0.012, 0.020,  0.002, 0.002],
  [-0.004, -0.002, 0.002, 0.016, 0.001],
  [0.002, 0.002, 0.002,  0.001, 0.004],
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
    const { Model, sum, dot, expr, minimize, QuadExpr } = await getWashiClient(false);

    const m = new Model("PortfolioQP5");
    const assetIds = assets.map((a) => a.id);
    const w = m.continuous(assetIds, { lb: 0, ub: 0.6 });

    m.constraint(expr`${sum(assetIds, (id) => w[id])} == 1.0`, "full_invest");

    const targetRet = minReturnPct.value / 100;
    const retMap = Object.fromEntries(assets.map((a) => [a.id, a.ret]));
    m.constraint(expr`${dot(retMap, w)} >= ${targetRet}`, "target_return");

    let risk = new QuadExpr();
    for (let i = 0; i < assets.length; i++) {
      for (let j = 0; j < assets.length; j++) {
        if (cov[i][j] !== 0) {
          risk = risk.add(w[assets[i].id].mul(w[assets[j].id]).mul(cov[i][j]));
        }
      }
    }

    m.objective(minimize(risk));
    const status = await m.solve();
    solveTimeMs.value = performance.now() - t0;

    if (status === "Optimal") {
      varianceVal.value = m.objectiveValue ?? 0;
      const nextW: Record<string, number> = {};
      assets.forEach((a) => {
        nextW[a.id] = w[a.id].value ?? 0;
      });
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
            {{ isJa ? "ポートフォリオ配分オプティマイザ (Markowitz QP)" : isZh ? "投资组合配置优化器 (Markowitz QP)" : "Portfolio Allocation Optimizer (Markowitz QP)" }}
          </h4>
          <p class="washi-app-subtitle">
            {{
              isJa
                ? "目標期待リターンを変更して「▶ 最適化を実行」を押すと、5資産の共分散行列（QuadExpr）からリスク最小の配分比率を計算します。"
                : isZh
                ? "调整目标期望收益率并点击“▶ 运行优化”，即可根据 5 项资产的协方差矩阵（QuadExpr）计算最小风险配置比例。"
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
          <span v-if="isSolving">⏳ {{ isJa ? "計算中..." : isZh ? "计算中..." : "Solving..." }}</span>
          <span v-else>▶ {{ isJa ? "最適化を実行" : isZh ? "运行优化" : "Run Optimization" }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot"></span>
        </button>
      </div>
    </div>

    <div class="washi-controls-bar" style="justify-content: space-between;">
      <label class="washi-control-item" style="flex: 1; max-width: 460px;">
        <span style="min-width: 175px;">
          {{ isJa ? "目標期待リターン:" : isZh ? "目标期望收益率:" : "Target Expected Return:" }}
          <strong>{{ minReturnPct.toFixed(1) }}%</strong>
        </span>
        <input
          type="range"
          min="5.0"
          max="9.8"
          step="0.1"
          v-model.number="minReturnPct"
          @input="markDirty"
          style="flex: 1; accent-color: #c23b22;"
        />
      </label>
      <div class="solve-meta">
        HiGHS QP · {{ solveTimeMs.toFixed(1) }} ms ·
        {{ isJa ? "最小分散:" : isZh ? "最小方差:" : "Min Variance:" }}
        <strong>{{ varianceVal.toFixed(5) }}</strong>
      </div>
    </div>

    <!-- Allocation Stacked Bar & Cards -->
    <div style="padding: 16px 20px;" :class="{ 'is-stale': isDirty }">
      <div v-if="isDirty" class="dirty-banner" style="margin-bottom: 12px;">
        {{ isJa ? "目標リターンが変更されました。右上の「▶ 最適化を実行」を押して再計算してください。" : isZh ? "目标收益率已更改，请点击右上角“▶ 运行优化”重新计算。" : "Target return changed. Click '▶ Run Optimization' above to recompute." }}
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
            <strong>{{ isJa ? a.labelJa : isZh ? a.labelZh : a.labelEn }}</strong>
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
        {{ isJa ? "Playground でコードを編集する →" : isZh ? "在 Playground 中编辑代码 →" : "Edit Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
