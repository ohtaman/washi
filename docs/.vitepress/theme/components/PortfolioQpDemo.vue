<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));

const minReturnPct = ref(6.5);
const solveTimeMs = ref(0);
const varianceVal = ref(0.0088);
const weights = ref({
  Stocks: 0.431,
  Bonds: 0.569,
  Gold: 0.0,
});

async function solvePortfolio() {
  if (typeof window === "undefined") return;
  const t0 = performance.now();
  const { Model, expr, QuadExpr } = await getWashiClient(false);

  const m = new Model({ name: "PortfolioQP", solver: "highs" });
  const stocks = m.addVar({ name: "Stocks", lb: 0, ub: 1 });
  const bonds = m.addVar({ name: "Bonds", lb: 0, ub: 1 });
  const gold = m.addVar({ name: "Gold", lb: 0, ub: 1 });

  m.addConstr(expr`${stocks} + ${bonds} + ${gold} == 1`, { name: "full_invest" });

  const targetRet = minReturnPct.value / 100;
  m.addConstr(expr`0.10 * ${stocks} + 0.04 * ${bonds} + 0.06 * ${gold} >= ${targetRet}`, {
    name: "target_return",
  });

  const risk = new QuadExpr()
    .addQuadTerm(stocks, stocks, 0.04)
    .addQuadTerm(bonds, bonds, 0.0025)
    .addQuadTerm(gold, gold, 0.015)
    .addQuadTerm(stocks, bonds, 0.002)
    .addQuadTerm(stocks, gold, -0.004);

  m.minimize(risk);
  await m.solve();
  solveTimeMs.value = performance.now() - t0;

  if (m.status === "Optimal") {
    varianceVal.value = m.objectiveValue ?? 0;
    weights.value = {
      Stocks: stocks.value ?? 0,
      Bonds: bonds.value ?? 0,
      Gold: gold.value ?? 0,
    };
  }
}

onMounted(() => {
  solvePortfolio();
});
</script>

<template>
  <div class="washi-app-card">
    <div class="washi-app-header">
      <div>
        <span class="washi-app-eyebrow">INTERACTIVE MINI-APP · HiGHS Quadratic Programming (QP)</span>
        <h4 class="washi-app-title">
          {{ isJa ? "ポートフォリオ配分シミュレータ (Markowitz QP)" : "Portfolio Allocation Simulator (Markowitz QP)" }}
        </h4>
        <p class="washi-app-subtitle">
          {{
            isJa
              ? "目標期待リターン（スライダー）を動かすと、2次計画法（QuadExpr）により分散（リスク）を最小化する資産配分比率がリアルタイムに再計算されます。"
              : "Drag the target return slider to solve the Quadratic Program (QuadExpr) and rebalance the minimum-variance portfolio in real time."
          }}
        </p>
      </div>
    </div>

    <div class="washi-controls-bar" style="justify-content: space-between;">
      <label class="washi-control-item" style="flex: 1; max-width: 440px;">
        <span style="min-width: 170px;">
          {{ isJa ? "目標期待リターン:" : "Target Expected Return:" }}
          <strong>{{ minReturnPct.toFixed(1) }}%</strong>
        </span>
        <input
          type="range"
          min="4.0"
          max="9.8"
          step="0.1"
          v-model.number="minReturnPct"
          @input="solvePortfolio"
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
    <div style="padding: 16px 20px;">
      <div style="display: flex; height: 22px; border-radius: 6px; overflow: hidden; margin-bottom: 14px; border: 1px solid var(--vp-c-divider);">
        <div
          :style="{ width: `${weights.Stocks * 100}%`, background: '#c23b22' }"
          title="Stocks"
        ></div>
        <div
          :style="{ width: `${weights.Bonds * 100}%`, background: '#1e3a5f' }"
          title="Bonds"
        ></div>
        <div
          :style="{ width: `${weights.Gold * 100}%`, background: '#b45309' }"
          title="Gold"
        ></div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
        <div class="qp-asset-card">
          <div class="qp-asset-top">
            <span class="qp-dot" style="background: #c23b22;"></span>
            <strong>{{ isJa ? "株式 (Stocks)" : "Stocks" }}</strong>
            <span class="qp-ret">E[R]=10%</span>
          </div>
          <div class="qp-pct" style="color: #c23b22;">
            {{ (weights.Stocks * 100).toFixed(1) }}%
          </div>
        </div>

        <div class="qp-asset-card">
          <div class="qp-asset-top">
            <span class="qp-dot" style="background: #1e3a5f;"></span>
            <strong>{{ isJa ? "債券 (Bonds)" : "Bonds" }}</strong>
            <span class="qp-ret">E[R]=4%</span>
          </div>
          <div class="qp-pct" style="color: #1e3a5f;">
            {{ (weights.Bonds * 100).toFixed(1) }}%
          </div>
        </div>

        <div class="qp-asset-card">
          <div class="qp-asset-top">
            <span class="qp-dot" style="background: #b45309;"></span>
            <strong>{{ isJa ? "金 (Gold)" : "Gold (Hedge)" }}</strong>
            <span class="qp-ret">E[R]=6%</span>
          </div>
          <div class="qp-pct" style="color: #b45309;">
            {{ (weights.Gold * 100).toFixed(1) }}%
          </div>
        </div>
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/washi/demo/?preset=portfolio_qp" class="playground-link">
        &lt;/&gt; {{ isJa ? "Playground で生のモデリングコードを開く →" : "Open Raw Model Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
