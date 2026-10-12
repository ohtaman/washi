# ECカートのクーポン・割引最適適用 (Indicator MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 混合整数計画問題 (MIP) | HiGHS (標準) | `m.binary()`, `m.constrain()`, `m.addIndicator()`, `expr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=cart_coupon">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">ソースコード</a></li></ul> |

ECサイトのカート・決済画面では、「〇〇円以上で使えるクーポン」「特定カテゴリ限定割引」「他クーポンとの併用不可（排他条件）」「最大2枚まで」といった複雑なプロモーションルールが絡み合います。

WaSHI を使えば、サーバーに負荷をかけず**ブラウザ内（クライアントサイド）で瞬時に支払総額が最小になるクーポンの組み合わせを計算**できます。さらに、**「あと10ドルの小物を買い足せば250ドル以上の大型クーポンが解放され、結果的に支払額が5ドル安くなる」**といったスマートなレコメンドも単一の MIP モデルで同時に導出できます。

<EcommerceCouponDemo />

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

## WaSHI による実装 (`addIndicator`)

「クーポン $c$ を適用する（`useCoupon[c] == 1`）ならば、購入金額が最低条件以上である」という条件付き制約を `m.addIndicator()` で直感的に記述します。

<CodeRunner preset="cart_coupon">

```typescript
import { Model, sum, expr } from "@ohtaman/washi";

async function optimizeCheckoutCart() {
  const m = new Model("CartCouponOptimizer");

  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // $10 の USB-C ケーブルを追加するかどうかの 0-1 変数
  const addUsbCable = m.binary("addon_USB_Cable");
  const usbCablePrice = 10;

  const coupons = [
    { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
    { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
    { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
    { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
  ];

  const useCoupon = m.binary(coupons.map((c) => c.id));

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
  m.constrain(
    expr`${sum(exclusiveCoupons, (c) => useCoupon[c.id])} <= 1`,
    "at_most_one_exclusive"
  );

  // 3. 1回の決済で使えるクーポンは合計 2 枚まで
  m.constrain(
    expr`${sum(coupons, (c) => useCoupon[c.id])} <= 2`,
    "max_two_coupons"
  );

  // 目的関数: 最終支払額 (商品総額 - 割引合計) を最小化
  const totalDiscount = sum(coupons, (c) => useCoupon[c.id].mul(c.discount));
  m.minimize(merchSpend.sub(totalDiscount));

  const status = await m.optimize();
  console.log(`Status: ${status}, Optimal Net Payable: $${m.objectiveValue}`);
  console.log(`Recommended Add-on (+$10 USB-C Cable): ${(addUsbCable.value ?? 0) > 0.5 ? "YES" : "NO"}`);
  for (const cpn of coupons) {
    const applied = (useCoupon[cpn.id].value ?? 0) > 0.5;
    console.log(`  ${applied ? "✅ [APPLIED]" : "   [skipped]"} ${cpn.id.padEnd(11)} (-$${cpn.discount})`);
  }
}

optimizeCheckoutCart();
```

</CodeRunner>
