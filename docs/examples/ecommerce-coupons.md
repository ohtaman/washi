# E-Commerce Cart & Coupon Optimizer (Indicator MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Mixed-Integer Programming (MIP) | HiGHS (default) | `m.binary()`, `m.constraint()`, `m.indicator()`, `expr`, `minimize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=cart_coupon">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">Source Code</a></li></ul> |

E-commerce checkouts often combine minimum spend thresholds, category discounts, mutually exclusive coupons, and per-order coupon caps. Running a MIP model in the browser or an edge worker selects the best coupon set and can also test whether adding a low-cost filler item lowers the final bill.

This example uses `m.indicator()` to model conditional rules such as "if a coupon is applied, minimum spend must hold." For MIP solvers like HiGHS, WaSHI applies **Big-M linearization**, relaxing the inequality by a constant `M` when the binary indicator is inactive.

> [!IMPORTANT]
> **Precondition for omitting `M`**: WaSHI derives a tight Big-M automatically only when every variable in the conditional constraint has **finite** `lb` and `ub` bounds. Binary variables are already bounded in `[0, 1]`. If any variable is unbounded, pass an explicit `M` or set finite bounds first.

<EcommerceCouponDemo />

## Scenario & Promotion Rules

A customer's shopping cart currently contains `$242` of merchandise (`$210` in Tech items and `$32` in Apparel):
- **Optional Filler Add-on**: Adding a `$10` Braided USB-C Cable (Tech) raises the cart subtotal from `$242` to `$252`.
- **Available Coupons**: At most 2 coupons per checkout, and at most 1 exclusive coupon.

| Coupon Code | Discount | Condition | Stacking Rule |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | Total cart spend $\ge \$100$ | **Stackable** |
| `TECH30` | **-$30** | Tech category spend $\ge \$200$ | **Exclusive** (cannot combine with `MEGA45_250`) |
| `MEGA45_250` | **-$45** | Total cart spend $\ge \$250$ | **Exclusive** (cannot combine with `TECH30`) |
| `MEMBER10` | **-$10** | Total cart spend $\ge \$150$ | **Stackable** |

## Implementation in WaSHI

<CodeRunner preset="cart_coupon">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

async function optimizeCheckoutCart() {
  const m = new Model("CartCouponOptimizer");

  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // Binary decision: add optional $10 USB-C cable to unlock $250 tier?
  const addUsbCable = m.binary("addon_USB_Cable");
  const usbCablePrice = 10;

  const coupons = [
    { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
    { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
    { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
    { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
  ];

  // Binary decision variables for each coupon
  const useCoupon = m.binary(coupons.map((c) => c.id));
  const discounts = Object.fromEntries(coupons.map((c) => [c.id, c.discount]));

  const merchSpend = expr`${baseCartSubtotal} + ${usbCablePrice} * ${addUsbCable}`;
  const techSpend  = expr`${baseTechSubtotal} + ${usbCablePrice} * ${addUsbCable}`;

  // 1. Indicator constraints: If useCoupon[id] == 1, minimum spend threshold must hold.
  // Omitting `M` lets WaSHI automatically derive the tightest Big-M from variable bounds!
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

  // 2. Mutual exclusion among non-stackable ("Exclusive") coupons
  const exclusiveVars = coupons.filter((c) => !c.stackable).map((c) => useCoupon[c.id]);
  m.constraint(expr`sum(${exclusiveVars}) <= 1`, "at_most_one_exclusive");

  // 3. Max 2 coupons per order
  m.constraint(expr`sum(${useCoupon}) <= 2`, "max_two_coupons");

  // Objective: Minimize final net payable amount (merchSpend - totalDiscounts)
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

## Key Takeaways

- **Without the add-on (`$197`)**: At `$242`, `MEGA45_250` is unavailable, so the best valid pair is `TECH30` (`-$30`) and `WELCOME15` (`-$15`), leaving `$197`.
- **With the `$10` USB-C cable (`$192`)**: Raising gross spend to `$252` unlocks `MEGA45_250` (`-$45`) alongside `WELCOME15` (`-$15`), bringing the net bill to `$192`—saving `$5` while including the cable.
- **Why `m.indicator()` fits**: Modeling `addUsbCable` and `useCoupon` in one MIP avoids enumerating cart combinations manually and lets the solver weigh add-on costs against unlocked discounts directly.
