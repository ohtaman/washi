<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";
import { useComponentTranslations } from "../locales/index";
import type { SolverStatus } from "../../../../src/modeler/types.js";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));
const isZh = computed(() => lang.value.startsWith("zh"));
const i18n = computed(() => useComponentTranslations(lang.value).dict.ecommerce);

interface CartCatalogItem {
  id: string;
  category: "Tech" | "Office";
  price: number;
}

const catalog: CartCatalogItem[] = [
  { id: "headphones", category: "Tech", price: 160 },
  { id: "keyboard", category: "Tech", price: 80 },
  { id: "webcam", category: "Tech", price: 95 },
  { id: "stand", category: "Office", price: 45 },
  { id: "lightbar", category: "Office", price: 55 },
  { id: "mat", category: "Office", price: 25 },
];

const selectedItems = ref<Set<string>>(new Set(["headphones", "keyboard"]));
const allowFiller = ref(true);

const coupons = [
  {
    id: "WELCOME15",
    discount: 15,
    minSpend: 100,
    group: "welcome",
  },
  {
    id: "MEMBER10",
    discount: 10,
    minSpend: 180,
    group: "member",
  },
  {
    id: "SAVE30_200",
    discount: 30,
    minSpend: 200,
    group: "tier",
  },
  {
    id: "MEGA50_250",
    discount: 50,
    minSpend: 250,
    group: "tier",
  },
];

const fillers = [
  { id: "USB_Cable", price: 10, netCost: 8 },
  { id: "Screen_Wipe", price: 15, netCost: 12 },
  { id: "Keycap_Puller", price: 25, netCost: 20 },
];

const isSolving = ref(false);
const isDirty = ref(false);
const status = ref<SolverStatus>("NotSolved");
const solveError = ref<string | null>(null);
const solveTimeMs = ref(0);
const solvedBaseTotal = ref<number | null>(null);
const appliedCoupons = ref<string[]>([]);
const chosenFillerId = ref<string | null>(null);
const netPayableWithFiller = ref<number | null>(null);
const netPayableWithoutFiller = ref<number | null>(null);

const liveSelectedTotal = computed(() =>
  catalog
    .filter((item) => selectedItems.value.has(item.id))
    .reduce((acc, item) => acc + item.price, 0)
);

const chosenFiller = computed(() =>
  fillers.find((f) => f.id === chosenFillerId.value) || null
);

const finalCartMerchandise = computed(() =>
  solvedBaseTotal.value === null
    ? null
    : solvedBaseTotal.value + (chosenFiller.value ? chosenFiller.value.price : 0)
);

const totalDiscount = computed(() =>
  status.value !== "Optimal"
    ? null
    : coupons
        .filter((c) => appliedCoupons.value.includes(c.id))
        .reduce((acc, c) => acc + c.discount, 0)
);

const cashToPay = computed(() =>
  finalCartMerchandise.value === null || totalDiscount.value === null
    ? null
    : finalCartMerchandise.value - totalDiscount.value
);

let editVersion = 0;

function toggleCartItem(id: string) {
  const next = new Set(selectedItems.value);
  if (next.has(id)) {
    if (next.size > 1) next.delete(id);
  } else {
    next.add(id);
  }
  selectedItems.value = next;
  editVersion++;
  isDirty.value = true;
}

function markDirty() {
  editVersion++;
  isDirty.value = true;
}

async function runSingleCartModel(cartVal: number, enableFillers: boolean) {
  const { Model, sum, dot, expr, minimize } = await getWashiClient(false);
  const m = new Model("CartCouponOptimizer");

  const useCoupon = m.binary(coupons.map((c) => c.id));
  const addFiller = m.binary(fillers.map((f) => f.id));

  // Max 2 coupons per order
  m.constraint(
    expr`${sum(coupons, (c: any) => useCoupon[c.id])} <= 2`,
    "max_two_coupons"
  );

  if (!enableFillers) {
    for (const f of fillers) {
      m.constraint(expr`${addFiller[f.id]} == 0`, `disable_${f.id}`);
    }
  } else {
    m.constraint(
      expr`${sum(fillers, (f: any) => addFiller[f.id])} <= 1`,
      "max_one_filler"
    );
  }

  const tierCoupons = coupons.filter((c) => c.group === "tier");
  m.constraint(
    expr`${sum(tierCoupons, (c: any) => useCoupon[c.id])} <= 1`,
    "tier_mutex"
  );

  const fillerSpend = sum(fillers, (f: any) => addFiller[f.id].mul(f.price));
  const merchSpend = fillerSpend.add(cartVal);

  for (const c of coupons) {
    m.indicator(useCoupon[c.id], expr`${merchSpend} >= ${c.minSpend}`, {
      activeValue: 1,
      name: `thresh_${c.id}`,
    });
  }

  const discMap = Object.fromEntries(coupons.map((c) => [c.id, c.discount]));
  const netCostMap = Object.fromEntries(fillers.map((f) => [f.id, f.netCost]));

  const totalDiscExpr = dot(discMap, useCoupon);
  const fillerCostExpr = dot(netCostMap, addFiller);

  m.objective(minimize(fillerCostExpr.sub(totalDiscExpr).add(cartVal)));
  const solveStatus = await m.solve();

  if (solveStatus !== "Optimal") {
    return {
      status: solveStatus,
      activeCpns: [] as string[],
      activeFiller: null as string | null,
      cashPayable: null as number | null,
    };
  }

  const activeCpns = coupons
    .filter((c) => Math.round(useCoupon[c.id].value ?? 0) === 1)
    .map((c) => c.id);
  const activeFiller =
    fillers.find((f) => Math.round(addFiller[f.id].value ?? 0) === 1)?.id ?? null;

  const merch = cartVal + (fillers.find((f) => f.id === activeFiller)?.price ?? 0);
  const disc = coupons
    .filter((c) => activeCpns.includes(c.id))
    .reduce((a, c) => a + c.discount, 0);

  return {
    status: solveStatus,
    activeCpns,
    activeFiller,
    cashPayable: merch - disc,
  };
}

async function solveCart() {
  if (typeof window === "undefined" || isSolving.value) return;
  isSolving.value = true;
  const versionAtStart = editVersion;
  try {
    const cartVal = liveSelectedTotal.value;
    const t0 = performance.now();
    const [resMain, resNoFiller] = allowFiller.value
      ? await Promise.all([
          runSingleCartModel(cartVal, true),
          runSingleCartModel(cartVal, false),
        ])
      : await runSingleCartModel(cartVal, false).then((r) => [r, r] as const);
    solveTimeMs.value = performance.now() - t0;

    const nonOptimalStatus =
      resMain.status !== "Optimal"
        ? resMain.status
        : resNoFiller.status !== "Optimal"
          ? resNoFiller.status
          : null;

    if (nonOptimalStatus !== null) {
      status.value = nonOptimalStatus;
      solveError.value = null;
      solvedBaseTotal.value = null;
      appliedCoupons.value = [];
      chosenFillerId.value = null;
      netPayableWithFiller.value = null;
      netPayableWithoutFiller.value = null;
    } else {
      status.value = "Optimal";
      solveError.value = null;
      solvedBaseTotal.value = cartVal;
      appliedCoupons.value = resMain.activeCpns;
      chosenFillerId.value = resMain.activeFiller;
      netPayableWithFiller.value = resMain.cashPayable;
      netPayableWithoutFiller.value = resNoFiller.cashPayable;
    }
    isDirty.value = editVersion !== versionAtStart;
  } catch (err) {
    status.value = "Error";
    solveError.value = err instanceof Error ? err.message : String(err);
    solvedBaseTotal.value = null;
    appliedCoupons.value = [];
    chosenFillerId.value = null;
    netPayableWithFiller.value = null;
    netPayableWithoutFiller.value = null;
    isDirty.value = editVersion !== versionAtStart;
  } finally {
    isSolving.value = false;
  }
}

onMounted(() => {
  solveCart();
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
          @click="solveCart"
        >
          <span v-if="isSolving">⏳ {{ i18n.solving }}</span>
          <span v-else>▶ {{ i18n.run }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot"></span>
        </button>
      </div>
    </div>

    <div class="washi-cart-grid">
      <!-- Left: Cart Items & Filler Toggle -->
      <div class="washi-cart-col">
        <div class="col-section-label" style="display: flex; justify-content: space-between;">
          <span>{{ i18n.step1 }}</span>
          <span>{{ i18n.selectedPrefix }}{{ liveSelectedTotal }}</span>
        </div>
        <div class="cart-items-list">
          <div
            v-for="item in catalog"
            :key="item.id"
            class="cart-item-row"
            :class="{ selected: selectedItems.has(item.id) }"
            @click="toggleCartItem(item.id)"
          >
            <input
              type="checkbox"
              :checked="selectedItems.has(item.id)"
              @click.stop="toggleCartItem(item.id)"
            />
            <span class="item-title">{{ i18n.products[item.id] || item.id }}</span>
            <span class="item-price">${{ item.price }}</span>
          </div>
        </div>

        <div class="filler-toggle-box">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.84rem; font-weight: 600;">
            <input type="checkbox" v-model="allowFiller" @change="markDirty" />
            <span>
              {{ i18n.enableFiller }}
            </span>
          </label>
          <div style="font-size: 0.75rem; color: var(--vp-c-text-2); margin-top: 4px;">
            {{ i18n.fillerCandidates }}
          </div>
        </div>
      </div>

      <!-- Right: Live Checkout Receipt -->
      <div class="washi-receipt-col" :class="{ 'is-stale': isDirty }">
        <div class="col-section-label" style="display: flex; justify-content: space-between;">
          <span>{{ i18n.step2 }}</span>
          <span class="solve-meta">HiGHS · {{ solveTimeMs.toFixed(1) }} ms</span>
        </div>

        <div v-if="isDirty" class="dirty-banner">
          {{ i18n.dirtyBanner }}
        </div>

        <!-- Smart Filler Callout -->
        <div
          v-if="status === 'Optimal' && chosenFiller && netPayableWithoutFiller !== null && cashToPay !== null"
          class="smart-filler-banner"
        >
          <div style="font-weight: 700; font-size: 0.84rem; margin-bottom: 2px;">
            💡 {{ i18n.smartTip }}
          </div>
          <div style="font-size: 0.78rem;">
            {{ i18n.smartTipBody1 }}
            <strong>{{ i18n.products[chosenFiller.id] || chosenFiller.id }} (+${{ chosenFiller.price }})</strong>
            {{ i18n.smartTipBody2 }}{{ netPayableWithoutFiller }}{{ i18n.smartTipBody3 }}
            <strong>${{ netPayableWithoutFiller - cashToPay }}</strong>.
          </div>
        </div>

        <!-- Coupons Status -->
        <div class="receipt-coupons">
          <div
            v-for="c in coupons"
            :key="c.id"
            class="receipt-coupon-row"
            :class="{ applied: status === 'Optimal' && appliedCoupons.includes(c.id) }"
          >
            <div>
              <code class="cpn-code">{{ c.id }}</code>
              <span class="cpn-desc">{{ i18n.coupons[c.id] || c.id }}</span>
            </div>
            <span class="cpn-status">
              {{
                status !== "Optimal"
                  ? "—"
                  : appliedCoupons.includes(c.id)
                    ? `-$${c.discount}`
                    : i18n.skipped
              }}
            </span>
          </div>
        </div>

        <!-- Totals -->
        <div class="receipt-totals">
          <div class="receipt-line">
            <span>{{ i18n.subtotal }}</span>
            <span class="mono">{{ solvedBaseTotal !== null ? `$${solvedBaseTotal}` : "—" }}</span>
          </div>
          <div v-if="status === 'Optimal' && chosenFiller" class="receipt-line filler-line">
            <span>+ {{ i18n.products[chosenFiller.id] || chosenFiller.id }} (Filler)</span>
            <span class="mono">+${{ chosenFiller.price }}</span>
          </div>
          <div class="receipt-line discount-line">
            <span>{{ i18n.discount }}</span>
            <span class="mono">{{ totalDiscount !== null ? `-$${totalDiscount}` : "—" }}</span>
          </div>
          <div class="receipt-line grand-total">
            <span>{{ i18n.totalPayable }}</span>
            <span class="grand-num">{{ cashToPay !== null ? `$${cashToPay}` : "—" }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="status !== 'Optimal' && status !== 'NotSolved'"
      role="alert"
      class="washi-result-bar conflict"
    >
      <div class="conflict-header">
        <span class="status-dot conflict"></span>
        <strong>{{ i18n.nonOptimalTitle }} ({{ status }})</strong>
      </div>
      <div v-if="solveError" class="conflict-diag-notice">
        {{ solveError }}
      </div>
      <div v-else class="conflict-hint">
        {{ i18n.nonOptimalHint }}
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/demo/?preset=cart_coupon" target="_self" class="playground-link">
        {{ i18n.openPlayground }}
      </a>
    </div>
  </div>
</template>
