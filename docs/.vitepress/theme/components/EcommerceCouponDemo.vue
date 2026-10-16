<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { getWashiClient } from "./washiClient";

const { lang } = useData();
const isJa = computed(() => lang.value.startsWith("ja"));

interface CartCatalogItem {
  id: string;
  nameEn: string;
  nameJa: string;
  category: "Tech" | "Office";
  price: number;
}

const catalog: CartCatalogItem[] = [
  { id: "headphones", nameEn: "Wireless ANC Headphones", nameJa: "ワイヤレスヘッドホン", category: "Tech", price: 160 },
  { id: "keyboard", nameEn: "Mechanical Keyboard", nameJa: "メカニカルキーボード", category: "Tech", price: 80 },
  { id: "webcam", nameEn: "4K Streaming Webcam", nameJa: "4K ウェブカメラ", category: "Tech", price: 95 },
  { id: "stand", nameEn: "Aluminum Laptop Stand", nameJa: "アルミPCスタンド", category: "Office", price: 45 },
  { id: "lightbar", nameEn: "Monitor Light Bar", nameJa: "モニターライトバー", category: "Office", price: 55 },
  { id: "mat", nameEn: "Felt Desk Mat", nameJa: "フェルトデスクマット", category: "Office", price: 25 },
];

const selectedItems = ref<Set<string>>(new Set(["headphones", "keyboard"]));
const allowFiller = ref(true);

const coupons = [
  {
    id: "WELCOME15",
    discount: 15,
    minSpend: 100,
    group: "welcome",
    labelJa: "$100以上で $15 OFF (併用可)",
    labelEn: "$15 off $100+ (Stackable)",
  },
  {
    id: "MEMBER10",
    discount: 10,
    minSpend: 180,
    group: "member",
    labelJa: "$180以上で $10 OFF (併用可)",
    labelEn: "$10 off $180+ (Stackable)",
  },
  {
    id: "SAVE30_200",
    discount: 30,
    minSpend: 200,
    group: "tier",
    labelJa: "$200以上で $30 OFF (Tier排他)",
    labelEn: "$30 off $200+ (Tier exclusive)",
  },
  {
    id: "MEGA50_250",
    discount: 50,
    minSpend: 250,
    group: "tier",
    labelJa: "$250以上で $50 OFF (Tier排他)",
    labelEn: "$50 off $250+ (Tier exclusive)",
  },
];

const fillers = [
  { id: "USB_Cable", nameEn: "USB-C Braided Cable", nameJa: "USB-C ケーブル", price: 10, netCost: 8 },
  { id: "Screen_Wipe", nameEn: "Microfiber Cleaning Kit", nameJa: "液晶クリーナー", price: 15, netCost: 12 },
  { id: "Keycap_Puller", nameEn: "Metal Keycap Puller", nameJa: "キーキャッププラー", price: 25, netCost: 20 },
];

const isSolving = ref(false);
const isDirty = ref(false);
const solveTimeMs = ref(0);
const solvedBaseTotal = ref(240);
const appliedCoupons = ref<string[]>([]);
const chosenFillerId = ref<string | null>(null);
const netPayableWithFiller = ref(180);
const netPayableWithoutFiller = ref(185);

const liveSelectedTotal = computed(() =>
  catalog
    .filter((item) => selectedItems.value.has(item.id))
    .reduce((acc, item) => acc + item.price, 0)
);

const chosenFiller = computed(() =>
  fillers.find((f) => f.id === chosenFillerId.value) || null
);

const finalCartMerchandise = computed(
  () => solvedBaseTotal.value + (chosenFiller.value ? chosenFiller.value.price : 0)
);

const totalDiscount = computed(() =>
  coupons
    .filter((c) => appliedCoupons.value.includes(c.id))
    .reduce((acc, c) => acc + c.discount, 0)
);

const cashToPay = computed(() => finalCartMerchandise.value - totalDiscount.value);

function toggleCartItem(id: string) {
  const next = new Set(selectedItems.value);
  if (next.has(id)) {
    if (next.size > 1) next.delete(id);
  } else {
    next.add(id);
  }
  selectedItems.value = next;
  isDirty.value = true;
}

function markDirty() {
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
      M: 600,
      name: `thresh_${c.id}`,
    });
  }

  const discMap = Object.fromEntries(coupons.map((c) => [c.id, c.discount]));
  const netCostMap = Object.fromEntries(fillers.map((f) => [f.id, f.netCost]));

  const totalDiscExpr = dot(discMap, useCoupon);
  const fillerCostExpr = dot(netCostMap, addFiller);

  m.objective(minimize(fillerCostExpr.sub(totalDiscExpr).add(cartVal)));
  await m.solve();

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
    activeCpns,
    activeFiller,
    cashPayable: merch - disc,
  };
}

async function solveCart() {
  if (typeof window === "undefined") return;
  isSolving.value = true;
  try {
    const cartVal = liveSelectedTotal.value;
    const t0 = performance.now();
    const [resMain, resNoFiller] = await Promise.all([
      runSingleCartModel(cartVal, allowFiller.value),
      runSingleCartModel(cartVal, false),
    ]);
    solveTimeMs.value = performance.now() - t0;

    solvedBaseTotal.value = cartVal;
    appliedCoupons.value = resMain.activeCpns;
    chosenFillerId.value = resMain.activeFiller;
    netPayableWithFiller.value = resMain.cashPayable;
    netPayableWithoutFiller.value = resNoFiller.cashPayable;
    isDirty.value = false;
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
          <span class="washi-app-eyebrow">INTERACTIVE EXAMPLE · HiGHS Indicator Constraints</span>
          <h4 class="washi-app-title">
            {{ isJa ? "ECカート・クーポン＆「あと少し買い」最適化" : "E-Commerce Cart & Smart Coupon Optimizer" }}
          </h4>
          <p class="washi-app-subtitle">
            {{
              isJa
                ? "カートの商品を選んで「▶ 最適化を実行」を押すと、併用上限（最大2枚）と最低利用額（m.addIndicator）から最安になるクーポンの組と追加提案アイテムを計算します。"
                : "Select items in the cart and click '▶ Run Optimization' to find the best coupon combination and smart filler add-on."
            }}
          </p>
        </div>

        <button
          class="washi-solve-btn"
          :class="{ dirty: isDirty, solving: isSolving }"
          :disabled="isSolving"
          @click="solveCart"
        >
          <span v-if="isSolving">⏳ {{ isJa ? "計算中..." : "Solving..." }}</span>
          <span v-else>▶ {{ isJa ? "最適化を実行" : "Run Optimization" }}</span>
          <span v-if="isDirty && !isSolving" class="dirty-dot"></span>
        </button>
      </div>
    </div>

    <div class="washi-cart-grid">
      <!-- Left: Cart Items & Filler Toggle -->
      <div class="washi-cart-col">
        <div class="col-section-label" style="display: flex; justify-content: space-between;">
          <span>{{ isJa ? "1. カートに入れる商品を選択" : "1. Select Cart Items" }}</span>
          <span>{{ isJa ? `選択中: $${liveSelectedTotal}` : `Selected: $${liveSelectedTotal}` }}</span>
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
            <span class="item-title">{{ isJa ? item.nameJa : item.nameEn }}</span>
            <span class="item-price">${{ item.price }}</span>
          </div>
        </div>

        <div class="filler-toggle-box">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.84rem; font-weight: 600;">
            <input type="checkbox" v-model="allowFiller" @change="markDirty" />
            <span>
              {{
                isJa
                  ? "「あと少し買い（Fillerアイテム）」の同時最適化を有効化"
                  : "Enable Smart Filler Add-on Optimization"
              }}
            </span>
          </label>
          <div style="font-size: 0.75rem; color: var(--vp-c-text-2); margin-top: 4px;">
            {{
              isJa
                ? "候補: USB-Cケーブル (+$10) / クリーナー (+$15) / キーキャッププラー (+$25)"
                : "Candidates: USB-C Cable (+$10), Cleaning Kit (+$15), Keycap Puller (+$25)"
            }}
          </div>
        </div>
      </div>

      <!-- Right: Live Checkout Receipt -->
      <div class="washi-receipt-col" :class="{ 'is-stale': isDirty }">
        <div class="col-section-label" style="display: flex; justify-content: space-between;">
          <span>{{ isJa ? "2. 最適化された決済内訳 (最大2枚適用)" : "2. Optimized Checkout Receipt (Max 2 Coupons)" }}</span>
          <span class="solve-meta">HiGHS · {{ solveTimeMs.toFixed(1) }} ms</span>
        </div>

        <div v-if="isDirty" class="dirty-banner">
          {{ isJa ? "商品の選択が変更されました。右上の「▶ 最適化を実行」を押して再計算してください。" : "Cart changed. Click '▶ Run Optimization' above to recompute." }}
        </div>

        <!-- Smart Filler Callout -->
        <div v-if="chosenFiller" class="smart-filler-banner">
          <div style="font-weight: 700; font-size: 0.84rem; margin-bottom: 2px;">
            💡 {{ isJa ? "あと少し買い提案: 小物を1点足した方が支払額が下がります！" : "Smart Tip: Adding a filler item lowers your net bill!" }}
          </div>
          <div style="font-size: 0.78rem;">
            <template v-if="isJa">
              <strong>{{ chosenFiller.nameJa }} (+${{ chosenFiller.price }})</strong> を追加すると上位クーポンが解放され、そのまま買う（${{ netPayableWithoutFiller }}）より
              <strong>${{ netPayableWithoutFiller - cashToPay }} お得</strong> になります。
            </template>
            <template v-else>
              Adding <strong>{{ chosenFiller.nameEn }} (+${{ chosenFiller.price }})</strong> unlocks a higher tier discount, saving
              <strong>${{ netPayableWithoutFiller - cashToPay }}</strong> compared to checking out as-is (${{ netPayableWithoutFiller }}).
            </template>
          </div>
        </div>

        <!-- Coupons Status -->
        <div class="receipt-coupons">
          <div
            v-for="c in coupons"
            :key="c.id"
            class="receipt-coupon-row"
            :class="{ applied: appliedCoupons.includes(c.id) }"
          >
            <div>
              <code class="cpn-code">{{ c.id }}</code>
              <span class="cpn-desc">{{ isJa ? c.labelJa : c.labelEn }}</span>
            </div>
            <span class="cpn-status">
              {{
                appliedCoupons.includes(c.id)
                  ? `-$${c.discount}`
                  : isJa
                  ? "未適用"
                  : "Skipped"
              }}
            </span>
          </div>
        </div>

        <!-- Totals -->
        <div class="receipt-totals">
          <div class="receipt-line">
            <span>{{ isJa ? "選択商品の小計" : "Selected Items Subtotal" }}</span>
            <span class="mono">${{ solvedBaseTotal }}</span>
          </div>
          <div v-if="chosenFiller" class="receipt-line filler-line">
            <span>+ {{ isJa ? chosenFiller.nameJa : chosenFiller.nameEn }} (Filler)</span>
            <span class="mono">+${{ chosenFiller.price }}</span>
          </div>
          <div class="receipt-line discount-line">
            <span>{{ isJa ? "クーポン割引合計" : "Total Coupon Discounts" }}</span>
            <span class="mono">-${{ totalDiscount }}</span>
          </div>
          <div class="receipt-line grand-total">
            <span>{{ isJa ? "最終お支払い額 (Cash Payable)" : "Final Cash Payable" }}</span>
            <span class="grand-num">${{ cashToPay }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="washi-app-footer">
      <a href="/washi/demo/?preset=cart_coupon" class="playground-link">
        {{ isJa ? "Playground でコードを編集する →" : "Edit Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
