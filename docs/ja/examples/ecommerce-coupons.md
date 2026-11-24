# ECカートのクーポン・割引最適適用 (Indicator MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 混合整数計画問題 (MIP) | HiGHS (標準) | `m.binary()`, `m.constraint()`, `m.indicator()`, `expr`, `minimize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=cart_coupon">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">ソースコード</a></li></ul> |

EC サイトの決済画面では、最低購入金額・カテゴリ限定割引・併用不可ルール・適用枚数上限が複雑に絡み合います。ブラウザやエッジ環境で MIP を解くことで、最適なクーポン組合せに加え、少額商品の追加購入で支払総額が下がるかも同時に判定できます。

この例では、`m.indicator(binVar, constraint, { activeValue, M? })` で「クーポンを適用するなら最低金額を満たす」という条件付き制約を記述します。HiGHS などの MIP ソルバー向けには、条件が無効なときだけ定数 `M` で制約を緩める **Big-M 線形化** へ自動変換されます。

> [!IMPORTANT]
> **`M` を省略する前提条件**: 条件付き制約の全変数に**有限な** `lb` と `ub` がある場合のみ、WaSHI がタイトな Big-M を自動導出します。0-1 変数は `[0, 1]` で有界です。非有界な変数を含む場合は、明示的に `M` を渡すか有限の上下界を設定してください。

<EcommerceCouponDemo />

## シナリオ設定

現在のカート小計は `$242`（うち Tech カテゴリが `$210`、Apparel が `$32`）です。
- **追加候補アイテム**: `$10` の USB-C ケーブル（Tech）を追加すると、カート小計は `$242` から `$252` になります。
- **利用可能クーポン**: 1 回の決済で合計 2 枚まで、うち併用不可（Exclusive）クーポンは 1 枚まで適用できます。

| クーポンコード | 割引額 | 適用条件 | 併用ルール |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | カート総額 $\ge \$100$ | **併用可 (Stackable)** |
| `TECH30` | **-$30** | Tech カテゴリ $\ge \$200$ | **併用不可 (Exclusive)**（`MEGA45_250` と併用不可） |
| `MEGA45_250` | **-$45** | カート総額 $\ge \$250$ | **併用不可 (Exclusive)**（`TECH30` と併用不可） |
| `MEMBER10` | **-$10** | カート総額 $\ge \$150$ | **併用可 (Stackable)** |

## WaSHI による実装 (`indicator`)

<CodeRunner preset="cart_coupon">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

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
  const discounts = Object.fromEntries(coupons.map((c) => [c.id, c.discount]));

  const merchSpend = expr`${baseCartSubtotal} + ${usbCablePrice} * ${addUsbCable}`;
  const techSpend  = expr`${baseTechSubtotal} + ${usbCablePrice} * ${addUsbCable}`;

  // 1. Indicator 制約: クーポンを使う (activeValue: 1) なら最低購入金額を満たす必要がある
  // M を省略すると変数の上下界から最もタイトな Big-M が自動導出されます
  for (const cpn of coupons) {
    if (cpn.minCart > 0) {
      m.indicator(useCoupon[cpn.id], expr`${merchSpend} >= ${cpn.minCart}`, {
        activeValue: 1,
        name: `min_spend_${cpn.id}`,
      });
    }
    if (cpn.minTech > 0) {
      m.indicator(useCoupon[cpn.id], expr`${techSpend} >= ${cpn.minTech}`, {
        activeValue: 1,
        name: `min_tech_${cpn.id}`,
      });
    }
  }

  // 2. 併用不可（Exclusive）クーポンは最大 1 枚まで
  const exclusiveVars = coupons.filter((c) => !c.stackable).map((c) => useCoupon[c.id]);
  m.constraint(expr`sum(${exclusiveVars}) <= 1`, "at_most_one_exclusive");

  // 3. 1回の決済で使えるクーポンは合計 2 枚まで
  m.constraint(expr`sum(${useCoupon}) <= 2`, "max_two_coupons");

  // 目的関数: 最終支払額 (商品総額 - 割引合計) を最小化
  m.objective(minimize(expr`${merchSpend} - dot(${discounts}, ${useCoupon})`));

  const status = await m.solve();
  console.log(`Status: ${status}, Optimal Net Payable: $${m.objectiveValue}`);
  console.log(`Recommended Add-on (+$10 USB-C Cable): ${addUsbCable.value === 1 ? "YES" : "NO"}`);
  for (const cpn of coupons) {
    const applied = useCoupon[cpn.id].value === 1;
    console.log(`  ${applied ? "✅ [APPLIED]" : "   [skipped]"} ${cpn.id.padEnd(11)} (-$${cpn.discount})`);
  }
}

optimizeCheckoutCart();
```

</CodeRunner>

## 解の読み解きとポイント

- **ケーブルを追加しない場合（`$197`）**: 小計 `$242` では `MEGA45_250` を使えないため、`TECH30`（`-$30`）と `WELCOME15`（`-$15`）の組合せが最善となり、支払額は `$197` です。
- **`$10` の USB-C ケーブルを追加した場合（`$192`）**: 商品総額が `$252` に達して `MEGA45_250`（`-$45`）と `WELCOME15`（`-$15`）を適用できるため、支払額は `$192` に下がります。商品を追加したうえでさらに `$5` 安くなります。
- **`m.indicator()` の利点**: `addUsbCable` と `useCoupon` を単一の MIP で同時に解くことで、追加コストと割引増のトレードオフを直接比較できます。
