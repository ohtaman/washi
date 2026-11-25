# 电商购物车与优惠券优化 (Indicator MIP)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 混合整数规划 (MIP) | HiGHS (默认) | `m.binary()`, `m.constraint()`, `m.indicator()`, `expr`, `minimize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=cart_coupon">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">源代码</a></li></ul> |

电商结算规则常同时包含最低消费门槛、品类满减、互斥优惠券和单笔用券数量上限。将这些规则统一建模为单个 MIP，可同时求得最优优惠券组合，并判断是否加购低价凑单商品以进一步降低实付总额。

本例使用 `m.indicator(binVar, constraint, { activeValue, M? })` 表示“若选用某张优惠券，则必须满足最低消费门槛”的条件约束。对于 HiGHS 等 MIP 求解器，WaSHI 会通过 **Big-M 线性化** 自动转换：当二元指示变量未激活时，利用常数 `M` 放宽对应不等式。

> [!IMPORTANT]
> **省略 `M` 的前提条件**：被控约束表达式中的所有变量都具备**有限的** `lb` 和 `ub` 上下界时，WaSHI 才会自动推导紧凑的 Big-M（0-1 变量天然有界于 `[0, 1]`）。若包含无界变量，需显式传入 `M` 或先设置有限边界。

<EcommerceCouponDemo />

## 场景与促销规则

顾客购物车当前共有 `$242` 商品（数码类 Tech 占 `$210`，服饰类 Apparel 占 `$32`）：
- **可选凑单商品**：加购一根 `$10` 的编织 USB-C 数据线（Tech 品类）后，商品总额从 `$242` 升至 `$252`（Tech 品类小计从 `$210` 升至 `$220`）。
- **可用优惠券**：每笔订单最多使用 2 张优惠券；互斥券（Exclusive）彼此不能同时使用，最多使用 1 张（可与可叠加券组合使用）。

| 优惠券代码 | 抵扣金额 | 适用门槛 | 叠加规则 |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | 购物车总额 $\ge \$100$ | **可叠加 (Stackable)** |
| `TECH30` | **-$30** | Tech 品类满额 $\ge \$200$ | **互斥 (Exclusive)**（不可与 `MEGA45_250` 同享） |
| `MEGA45_250` | **-$45** | 购物车总额 $\ge \$250$ | **互斥 (Exclusive)**（不可与 `TECH30` 同享） |
| `MEMBER10` | **-$10** | 购物车总额 $\ge \$150$ | **可叠加 (Stackable)** |

## WaSHI 实现

<CodeRunner preset="cart_coupon">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

async function optimizeCheckoutCart() {
  const m = new Model("CartCouponOptimizer");

  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // 0-1 决策变量：是否加购 $10 的 USB-C 数据线以解锁 $250 满减档位？
  const addUsbCable = m.binary("addon_USB_Cable");
  const usbCablePrice = 10;

  const coupons = [
    { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
    { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
    { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
    { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
  ];

  // 每张优惠券对应的 0-1 决策变量
  const useCoupon = m.binary(coupons.map((c) => c.id));
  const discounts = Object.fromEntries(coupons.map((c) => [c.id, c.discount]));

  const merchSpend = expr`${baseCartSubtotal} + ${usbCablePrice} * ${addUsbCable}`;
  const techSpend  = expr`${baseTechSubtotal} + ${usbCablePrice} * ${addUsbCable}`;

  // 1. 指示符约束 (Indicator)：若 useCoupon[id] == 1，则必须满足最低消费门槛
  // 省略 M 时，WaSHI 会根据变量边界自动推导紧凑的 Big-M
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

  // 2. 不可叠加（互斥）优惠券之间最多只能选用 1 张
  const exclusiveVars = coupons.filter((c) => !c.stackable).map((c) => useCoupon[c.id]);
  m.constraint(expr`sum(${exclusiveVars}) <= 1`, "at_most_one_exclusive");

  // 3. 每笔订单最多使用 2 张优惠券
  m.constraint(expr`sum(${useCoupon}) <= 2`, "max_two_coupons");

  // 目标函数：最小化最终应付净额 (商品总额 - 折扣总额)
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

## 结果解读与要点

- **不加购数据线（`$197`）**：购物车总额 `$242` 未达到 `MEGA45_250` 门槛，最优组合为 `TECH30`（`-$30`）与 `WELCOME15`（`-$15`），最终实付 `$197`。
- **加购 `$10` 数据线（`$192`）**：商品总额增至 `$252` 后解锁 `MEGA45_250`（`-$45`），搭配 `WELCOME15`（`-$15`）使实付降至 `$192`，多得一根数据线的同时反而再省 `$5`。
- **使用 `m.indicator()` 的优势**：在同一 MIP 模型中联合决策 `addUsbCable` 与 `useCoupon`，无需手工枚举凑单组合即可直接权衡加购成本与新增折扣。
