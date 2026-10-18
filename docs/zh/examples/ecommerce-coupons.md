# 电商购物车与优惠券优化 (Indicator MIP)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 混合整数规划 (MIP) | HiGHS (默认) | `m.binary()`, `m.constraint()`, `m.indicator()`, `expr`, `minimize` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=cart_coupon">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">源代码</a></li></ul> |

现代电商结算页面通常包含复杂的促销规则：最低消费门槛、特定品类折扣、可叠加与互斥（不可叠加）优惠券，以及每笔订单的最大用券数量限制。直接在浏览器端（或边缘节点 Worker）运行优化求解器，可以让结算 UI 自动为用户匹配最优的优惠券组合——甚至在跨过满减门槛能降低实付总额时，智能推荐一件低价“凑单”商品。

本示例演示了 **`m.indicator(binVar, constraint, { activeValue, M? })`** 的用法：针对 HiGHS 等 MIP 求解器，它会通过 Big-M 重构自动将*“若选用该优惠券，则必须满足最低消费门槛”*这类条件约束线性化。当省略参数 `M` 时，WaSHI 会根据变量的有限上下界自动推导安全且紧凑的 Big-M 值。

<EcommerceCouponDemo />

## 场景与促销规则

一位顾客的购物车中当前共有 **$242** 的商品（其中数码类 Tech 商品 **$210**，服饰类 Apparel 商品 **$32**）：
- **可选凑单配件：** 可加购一根 **$10** 的编织 USB-C 数据线（Tech 品类），将购物车商品总额从 `$242` 提升至 `$252`。
- **可用优惠券列表**（每次结算最多使用 **2 张优惠券**；其中**互斥券（Exclusive）**最多使用 **1 张**）：

| 优惠券代码 | 抵扣金额 | 适用门槛 | 叠加规则 |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | 购物车总额 $\ge \$100$ | **可叠加 (Stackable)** |
| `TECH30` | **-$30** | Tech 品类满额 $\ge \$200$ | **互斥 (Exclusive)**（不可与 `MEGA45_250` 同享） |
| `MEGA45_250` | **-$45** | 购物车总额 $\ge \$250$ | **互斥 (Exclusive)**（不可与 `TECH30` 同享） |
| `MEMBER10` | **-$10** | 购物车总额 $\ge \$150$ | **可叠加 (Stackable)** |

如果不加购 `$10` 的数据线，购物车（`$242`）无法解锁 `MEGA45_250`，实付金额为 `$242 - $30 (TECH30) - $15 (WELCOME15) = $197`。  
而加购 `$10` 的数据线后（商品总额 `$252`），顾客即可解锁 `MEGA45_250`（`-$45`）+ `WELCOME15`（`-$15`），最终实付仅需 **$192**——白得一根数据线的同时还额外省下了 **$5**！

## WaSHI 实现

<CodeRunner preset="cart_coupon">

```typescript
import { Model, sum, minimize, expr } from "@ohtaman/washi";

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

  const merchSpend = addUsbCable.mul(usbCablePrice).add(baseCartSubtotal);
  const techSpend  = addUsbCable.mul(usbCablePrice).add(baseTechSubtotal);

  // 1. 指示符约束 (Indicator)：若 useCoupon[id] == 1，则必须满足最低消费门槛
  for (const cpn of coupons) {
    if (cpn.minCart > 0) {
      m.indicator(useCoupon[cpn.id], merchSpend.ge(cpn.minCart), {
        activeValue: 1,
        M: 500,
        name: `min_spend_${cpn.id}`,
      });
    }
    if (cpn.minTech > 0) {
      m.indicator(useCoupon[cpn.id], techSpend.ge(cpn.minTech), {
        activeValue: 1,
        M: 500,
        name: `min_tech_${cpn.id}`,
      });
    }
  }

  // 2. 不可叠加（互斥）优惠券之间最多只能选用 1 张
  const exclusiveCoupons = coupons.filter((c) => !c.stackable);
  m.constraint(
    expr`${sum(exclusiveCoupons, (c) => useCoupon[c.id])} <= 1`,
    "at_most_one_exclusive"
  );

  // 3. 每笔订单最多使用 2 张优惠券
  m.constraint(
    expr`${sum(coupons, (c) => useCoupon[c.id])} <= 2`,
    "max_two_coupons"
  );

  // 目标函数：最小化最终应付净额 (商品总额 - 折扣总额)
  const totalDiscount = sum(coupons, (c) => useCoupon[c.id].mul(c.discount));
  m.objective(minimize(merchSpend.sub(totalDiscount)));

  const status = await m.solve();
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
