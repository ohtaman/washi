# E-Commerce Cart & Coupon Optimizer (Indicator MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Mixed-Integer Programming (MIP) | HiGHS (default) | `m.binary()`, `m.constraint()`, `m.indicator()`, `expr`, `minimize` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=cart_coupon">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts">Source Code</a></li></ul> |

Modern e-commerce checkouts often feature complex promotional rules: minimum spend thresholds, category-specific discounts, stackable vs. mutually exclusive coupons, and maximum coupon limits per order. Running an optimizer directly in the browser (or an edge worker) lets the checkout UI automatically apply the best coupon combination—and even recommend a small "filler" item when crossing a spend threshold lowers the customer's net bill.

This example demonstrates **`m.indicator(binVar, constraint, { activeValue, M? })`**, which automatically linearizes conditional *"if coupon is selected, minimum spend must hold"* constraints using Big-M reformulation for MIP solvers like HiGHS. When `M` is omitted, WaSHI automatically derives safe, tight Big-M values from finite variable bounds.

<EcommerceCouponDemo />

## Scenario & Promotion Rules

A customer's shopping cart currently contains **$242** of merchandise (**$210** in Tech items and **$32** in Apparel):
- **Optional Filler Add-on:** A **$10** Braided USB-C Cable (Tech) can be added to bring the cart total from `$242` to `$252`.
- **Available Coupons** (maximum **2 coupons** total per checkout; at most **1 Exclusive** coupon):

| Coupon Code | Discount | Condition | Stacking Rule |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | Total cart spend $\ge \$100$ | **Stackable** |
| `TECH30` | **-$30** | Tech category spend $\ge \$200$ | **Exclusive** (cannot combine with `MEGA45_250`) |
| `MEGA45_250` | **-$45** | Total cart spend $\ge \$250$ | **Exclusive** (cannot combine with `TECH30`) |
| `MEMBER10` | **-$10** | Total cart spend $\ge \$150$ | **Stackable** |

Without adding the `$10` cable, the cart (`$242`) cannot use `MEGA45_250` and pays `$242 - $30 (TECH30) - $15 (WELCOME15) = $197`.  
By adding the `$10` cable (`$252` gross), the customer unlocks `MEGA45_250` (`-$45`) + `WELCOME15` (`-$15`) for a net total of **$192**—saving an extra **$5** while getting an extra item!

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
