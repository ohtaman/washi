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
  price: number;
}

const catalog: CartCatalogItem[] = [
  { id: "headphones", nameEn: "Wireless Headphones", nameJa: "ワイヤレスヘッドホン", price: 160 },
  { id: "keyboard", nameEn: "Mechanical Keyboard", nameJa: "メカニカルキーボード", price: 80 },
  { id: "stand", nameEn: "Aluminum Laptop Stand", nameJa: "アルミPCスタンド", price: 45 },
  { id: "mat", nameEn: "Felt Desk Mat", nameJa: "フェルトデスクマット", price: 25 },
];

const selectedItems = ref<Set<string>>(new Set(["headphones", "keyboard"]));
const allowFiller = ref(true);

const coupons = [
  { id: "WELCOME15", discount: 15, minSpend: 100, group: "welcome", labelJa: "$100以上で $15 OFF", labelEn: "$15 off $100+" },
  { id: "SAVE30_200", discount: 30, minSpend: 200, group: "tier", labelJa: "$200以上で $30 OFF (併用不可: Tier)", labelEn: "$30 off $200+ (Tier exclusive)" },
  { id: "MEGA45_250", discount: 45, minSpend: 250, group: "tier", labelJa: "$250以上で $45 OFF (併用不可: Tier)", labelEn: "$45 off $250+ (Tier exclusive)" },
];

const fillers = [
  { id: "USB_Cable", nameEn: "USB-C Braided Cable", nameJa: "USB-C ケーブル", price: 10, netCost: 8 },
  { id: "Screen_Wipe", nameEn: "Microfiber Cleaning Kit", nameJa: "液晶クリーナー", price: 15, netCost: 12 },
  { id: "Keycap_Puller", nameEn: "Metal Keycap Puller", nameJa: "キーキャッププラー", price: 25, netCost: 20 },
];

const solveTimeMs = ref(0);
const appliedCoupons = ref<string[]>([]);
const chosenFillerId = ref<string | null>(null);
const netPayableWithFiller = ref(192);
const netPayableWithoutFiller = ref(200);

const baseTotal = computed(() =>
  catalog
    .filter((item) => selectedItems.value.has(item.id))
    .reduce((acc, item) => acc + item.price, 0)
);

const chosenFiller = computed(() =>
  fillers.find((f) => f.id === chosenFillerId.value) || null
);

const finalCartMerchandise = computed(
  () => baseTotal.value + (chosenFiller.value ? chosenFiller.value.price : 0)
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
  solveCart();
}

async function runSingleCartModel(enableFillers: boolean) {
  const { Model, expr, sum } = await getWashiClient(false);
  const m = new Model({ name: "CartCouponOptimizer", solver: "highs" });

  const useCoupon = m.addVars(
    coupons.map((c) => c.id),
    { type: "binary", name: "cpn" }
  );
  const addFiller = m.addVars(
    fillers.map((f) => f.id),
    { type: "binary", name: "filler" }
  );

  if (!enableFillers) {
    for (const f of fillers) {
      m.addConstr(expr`${addFiller.get(f.id)!} == 0`);
    }
  } else {
    m.addConstr(expr`${sum(fillers.map((f) => addFiller.get(f.id)!))} <= 1`, {
      name: "max_one_filler",
    });
  }

  const tierCoupons = coupons
    .filter((c) => c.group === "tier")
    .map((c) => useCoupon.get(c.id)!);
  m.addConstr(expr`${sum(tierCoupons)} <= 1`, { name: "tier_mutex" });

  const fillerSpend = sum(fillers.map((f) => expr`${f.price} * ${addFiller.get(f.id)!}`));

  for (const c of coupons) {
    const shortfall = Math.max(0, c.minSpend - baseTotal.value);
    if (shortfall > 0) {
      m.addIndicator(useCoupon.get(c.id)!, 1, expr`${fillerSpend} >= ${shortfall}`, {
        name: `thresh_${c.id}`,
      });
    }
  }

  const totalDiscExpr = sum(
    coupons.map((c) => expr`${c.discount} * ${useCoupon.get(c.id)!}`)
  );
  const fillerCostExpr = sum(
    fillers.map((f) => expr`${f.netCost} * ${addFiller.get(f.id)!}`)
  );

  m.minimize(expr`${baseTotal.value} + ${fillerCostExpr} - ${totalDiscExpr}`);
  await m.solve();

  const activeCpns = coupons
    .filter((c) => Math.round(useCoupon.get(c.id)!.value ?? 0) === 1)
    .map((c) => c.id);
  const activeFiller =
    fillers.find((f) => Math.round(addFiller.get(f.id)!.value ?? 0) === 1)?.id ?? null;

  const merch = baseTotal.value + (fillers.find((f) => f.id === activeFiller)?.price ?? 0);
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
  const t0 = performance.now();
  const [resMain, resNoFiller] = await Promise.all([
    runSingleCartModel(allowFiller.value),
    runSingleCartModel(false),
  ]);
  solveTimeMs.value = performance.now() - t0;

  appliedCoupons.value = resMain.activeCpns;
  chosenFillerId.value = resMain.activeFiller;
  netPayableWithFiller.value = resMain.cashPayable;
  netPayableWithoutFiller.value = resNoFiller.cashPayable;
}

onMounted(() => {
  solveCart();
});
</script>

<template>
  <div class="washi-app-card">
    <div class="washi-app-header">
      <div>
        <span class="washi-app-eyebrow">INTERACTIVE MINI-APP · HiGHS Indicator Constraints</span>
        <h4 class="washi-app-title">
          {{ isJa ? "ECカート・クーポン＆「あと少し買い」シミュレータ" : "E-Commerce Cart & Smart Coupon Simulator" }}
        </h4>
        <p class="washi-app-subtitle">
          {{
            isJa
              ? "カート内の商品をON/OFFすると、併用ルールと最低利用額（m.addIndicator）を満たす最適なクーポンと「追加した方が安くなるアイテム」を即座に計算します。"
              : "Toggle items in the cart to compute the optimal coupon combination and smart filler add-on recommendation in real time."
          }}
        </p>
      </div>
    </div>

    <div class="washi-cart-grid">
      <!-- Left: Cart Items & Filler Toggle -->
      <div class="washi-cart-col">
        <div class="col-section-label">
          {{ isJa ? "1. カートに入れる商品を選択" : "1. Select Items in Shopping Cart" }}
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
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
            <input type="checkbox" v-model="allowFiller" @change="solveCart" />
            <span>
              {{
                isJa
                  ? "「あと少し買い（Fillerアイテム）」の自動提案を有効にする"
                  : "Enable Smart Filler Add-on Recommendations"
              }}
            </span>
          </label>
          <div style="font-size: 0.76rem; color: var(--vp-c-text-2); margin-top: 4px;">
            {{
              isJa
                ? "候補: USB-Cケーブル (+$10) / クリーナー (+$15) / キーキャッププラー (+$25)"
                : "Candidates: USB-C Cable (+$10), Cleaning Kit (+$15), Keycap Puller (+$25)"
            }}
          </div>
        </div>
      </div>

      <!-- Right: Live Checkout Receipt -->
      <div class="washi-receipt-col">
        <div class="col-section-label" style="display: flex; justify-content: space-between;">
          <span>{{ isJa ? "2. 最適化された決済内訳" : "2. Optimized Checkout Receipt" }}</span>
          <span class="solve-meta">HiGHS · {{ solveTimeMs.toFixed(1) }} ms</span>
        </div>

        <!-- Smart Filler Callout -->
        <div v-if="chosenFiller" class="smart-filler-banner">
          <div style="font-weight: 700; font-size: 0.84rem; margin-bottom: 2px;">
            💡 {{ isJa ? "スマート提案: アイテムを1点追加した方がお得です！" : "Smart Tip: Adding a filler item lowers your bill!" }}
          </div>
          <div style="font-size: 0.78rem;">
            <template v-if="isJa">
              <strong>{{ chosenFiller.nameJa }} (+${{ chosenFiller.price }})</strong> を追加すると上位クーポンが解放され、そのまま買う（${{ netPayableWithoutFiller }}）より
              <strong>${{ netPayableWithoutFiller - cashToPay }} 安く</strong> なります。
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
            <span class="mono">${{ baseTotal }}</span>
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
        &lt;/&gt; {{ isJa ? "Playground で生のモデリングコードを開く →" : "Open Raw Model Code in Playground →" }}
      </a>
    </div>
  </div>
</template>
