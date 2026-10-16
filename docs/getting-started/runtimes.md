# Runtime Environments

WaSHI is designed to run seamlessly in any JavaScript/TypeScript runtime without native C++ compilation.

---

## 🟢 Node.js

WaSHI natively supports Node.js (v18+) with standard ECMAScript Modules (ESM).

```typescript
import { Model, maximize } from "@ohtaman/washi";

const model = new Model();
const x = model.continuous("x", { lb: 0, ub: 10 });
model.objective(maximize(x));

await model.solve();
console.log("x =", x.value);
```

Run with `tsx` or `node`:

```bash
npx tsx app.ts
```

---

## 🌐 Browsers (Vite, Webpack, Next.js)

### Modern Bundlers (Vite / Rollup)

When using modern bundlers, WebAssembly assets are automatically bundled.

```typescript
import { Model, maximize } from "@ohtaman/washi";

export async function runOptimization() {
  const model = new Model({ solver: "highs" });
  const x = model.continuous("x", { lb: 0, ub: 100 });
  model.objective(maximize(x));
  await model.solve();
  return x.value;
}
```

### Next.js & Server-Side Rendering (SSR)

When importing in Next.js applications, optimization models can be solved either on the server (Node runtime) or dynamically in client components:

```tsx
"use client";

import { useState } from "react";
import { Model, maximize } from "@ohtaman/washi";

export default function OptimizerComponent() {
  const [val, setVal] = useState<number | null>(null);

  const handleSolve = async () => {
    const model = new Model();
    const x = model.continuous("x", { lb: 0, ub: 50 });
    model.objective(maximize(x));
    await model.solve();
    setVal(x.value);
  };

  return (
    <div>
      <button onClick={handleSolve}>Run Optimization</button>
      {val !== null && <p>Result: {val}</p>}
    </div>
  );
}
```

---

## 🟨 Vanilla HTML & Script Tags (CDN)

You can load WaSHI directly into static web pages using CDN script tags without any build tool:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WaSHI CDN Demo</title>
  </head>
  <body>
    <h1>WaSHI Browser Optimization</h1>
    <pre id="output">Solving...</pre>

    <!-- Load WaSHI Browser Bundle from CDN -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@latest/dist/browser/washi.min.js"></script>
    <script>
      (async () => {
        const { Model, expr, maximize } = Washi;

        const model = new Model("CDNDemo");
        const x = model.continuous("x", { lb: 0, ub: 10 });
        const y = model.continuous("y", { lb: 0, ub: 20 });

        model.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
        model.constraint(expr`${x} + ${y} <= 15`);

        await model.solve();

        document.getElementById("output").textContent =
          `Status: ${model.status}\n` +
          `Objective: ${model.objectiveValue}\n` +
          `x = ${x.value}, y = ${y.value}`;
      })();
    </script>
  </body>
</html>
```

---

## ⚡ Bun & Deno

### Bun

WaSHI runs out of the box in Bun:

```bash
bun add @ohtaman/washi
bun run app.ts
```

### Deno

In Deno (v1.30+ with npm specifiers):

```typescript
import { Model, maximize } from "npm:@ohtaman/washi";

const model = new Model();
const x = model.continuous("x", { lb: 0, ub: 10 });
model.objective(maximize(x));
await model.solve();
console.log("x =", x.value);
```
