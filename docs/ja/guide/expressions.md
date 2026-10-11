# 数式の記述 (`expr`)

数式は、決定変数と数値係数の線形または2次結合です。

TypeScript には演算子オーバーロード（`+`, `*` 等）がないため、WaSHI は **`expr` タグ付きテンプレートリテラル** や高速な総和ヘルパー（`quicksum`, `lpSum`）を提供しています。

---

## ✍️ タグ付きテンプレートリテラル (`expr`)

自然な代数数式として表現できます：

```typescript
import { Model, expr } from "@ohtaman/washi";

const model = new Model();
const x = model.addVar({ lb: 0 });
const y = model.addVar({ lb: 0 });

// 線形結合: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2次式: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;
```

---

## ⚡ 高速総和ヘルパー (`quicksum`)

大量の変数（数百〜数万個）をループで足し合わせる場合、テンプレート構文よりも高速な $O(N)$ 線形時間のヘルパーが推奨されます：

```typescript
import { quicksum } from "@ohtaman/washi";

// 重み付き線形和: sum(costs[i] * items[i])
const totalCost = quicksum(items.map((x, i) => [costs[i], x]));
```
