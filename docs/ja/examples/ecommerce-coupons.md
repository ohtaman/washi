# ECカートのクーポン・割引最適適用 (Indicator MIP)

**問題クラス:** 混合整数計画問題 (MIP) · **ソルバー:** HiGHS (標準) · **主な API:** `m.addIndicator()`, `type: "Binary"`, `sum()`  
**[▶ Web デモで開く](https://ohtaman.github.io/washi/demo/?preset=cart_coupon)** · **ソースコード:** [`examples/node/12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts)

ECサイトのカート・決済画面では、「〇〇円以上で使えるクーポン」「特定カテゴリ限定割引」「他クーポンとの併用不可（排他条件）」「最大2枚まで」といった複雑なプロモーションルールが絡み合います。

WaSHI を使えば、サーバーに負荷をかけず**ブラウザ内（クライアントサイド）で瞬時に支払総額が最小になるクーポンの組み合わせを計算**できます。さらに、**「あと10ドルの小物を買い足せば250ドル以上の大型クーポンが解放され、結果的に支払額が5ドル安くなる」**といったスマートなレコメンドも単一の MIP モデルで同時に導出できます。

---

## シナリオ設定

現在のカート小計は **$242**（うち Tech カテゴリ商品が **$210**）：
- **追加提案アイテム:** **$10** の USB-C ケーブルを追加すると、カート総額が `$242 -> $252` に到達します。
- **保有クーポン一覧**（最大2枚まで適用可、「併用不可」クーポンは最大1枚まで）：

| クーポンコード | 割引額 | 適用条件 | 併用ルール |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | カート総額 $\ge \$100$ | **併用可 (Stackable)** |
| `TECH30` | **-$30** | Tech カテゴリ $\ge \$200$ | **併用不可 (Exclusive)** |
| `MEGA45_250` | **-$45** | カート総額 $\ge \$250$ | **併用不可 (Exclusive)** |
| `MEMBER10` | **-$10** | カート総額 $\ge \$150$ | **併用可 (Stackable)** |

---

## WaSHI による実装 (`addIndicator`)

「クーポン $c$ を適用する（`useCoupon[c] == 1`）ならば、購入金額が最低条件以上である」という条件付き制約を `m.addIndicator()` で直感的に記述します。

```typescript
import { Model, sum } from "@ohtaman/washi";

async function optimizeCheckoutCart() {
  const m = new Model({ name: "CartCouponOptimizer", sense: "Minimize" });

  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // $10 の USB-C ケーブルを追加するかどうかの 0-1 変数
  const addUsbCable = m.addVar({ name: "addon_USB_Cable", type: "Binary" });
  const usbCablePrice = 10;

  const coupons = [
    { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
    { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
    { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
    { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
  ];

  const useCoupon = m.addVars(coupons.map((c) => c.id), { type: "Binary", prefix: "cpn" });

  const merchSpend = addUsbCable.mul(usbCablePrice).add(baseCartSubtotal);
  const techSpend  = addUsbCable.mul(usbCablePrice).add(baseTechSubtotal);

  // 1. Indicator 制約: クーポンを使う (activeValue: 1) なら最低購入金額を満たす必要がある
  for (const cpn of coupons) {
    if (cpn.minCart > 0) {
      m.addIndicator(useCoupon[cpn.id], merchSpend.ge(cpn.minCart), {
        activeValue: 1,
        M: 500,
        name: `min_spend_${cpn.id}`,
      });
    }
    if (cpn.minTech > 0) {
      m.addIndicator(useCoupon[cpn.id], techSpend.ge(cpn.minTech), {
        activeValue: 1,
        M: 500,
        name: `min_tech_${cpn.id}`,
      });
    }
  }

  // 2. 併用不可（Exclusive）クーポンは最大 1 枚まで
  const exclusiveCoupons = coupons.filter((c) => !c.stackable);
  m.addConstraint(sum(exclusiveCoupons, (c) => useCoupon[c.id]).le(1), "at_most_one_exclusive");

  // 3. 1回の決済で使えるクーポンは合計 2 枚まで
  m.addConstraint(sum(coupons, (c) => useCoupon[c.id]).le(2), "max_two_coupons");

  // 目的関数: 最終支払額 (商品総額 - 割引合計) を最小化
  const totalDiscount = sum(coupons, (c) => useCoupon[c.id].mul(c.discount));
  m.minimize(merchSpend.sub(totalDiscount));

  await m.solve();
  console.log(`Optimal Net Payable: $${m.objectiveValue}`);
}

optimizeCheckoutCart();
```

---

## 実行結果

```text
Status: Optimal (model build: 0.71ms, solve: 21.99ms)
Base Cart Subtotal:    $242.00
Recommended Add-on:    YES (+$10 Braided USB-C Cable to unlock $250 tier)
Gross Merchandise:     $252.00
Total Coupon Savings: -$60.00
Final Payable Total:   $192.00 (saved $50.00 vs base cart!)

Coupon Selection Breakdown:
  ✅ [APPLIED]  WELCOME15    (-$15) — $15 off orders >= $100 (Stackable)
     [skipped]  TECH30       (-$30) — $30 off Tech >= $200 (Exclusive)
  ✅ [APPLIED]  MEGA45_250   (-$45) — $45 off total cart >= $250 (Exclusive)
     [skipped]  MEMBER10     (-$10) — $10 loyalty bonus >= $150 (Stackable)
```
