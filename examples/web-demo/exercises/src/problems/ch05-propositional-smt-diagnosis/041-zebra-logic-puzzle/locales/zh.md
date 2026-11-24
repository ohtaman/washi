# #041. 斑马谜题（逻辑网格）

<!-- section:scenario -->
从左到右排列的每个位置都必须从每个类别中恰好分配一个属性值，且每个属性值在所有位置中恰好出现一次。结构化线索限制了属性值的位置、同位绑定、互斥组合以及左右或相邻的相对位置关系。

给定位置数量、各类别的属性列表以及线索列表，判断是否存在满足所有条件的分配；若可满足，则返回一组完整分配。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `n` | `number` | 位置数量（从左到右编号为 0 到 `n - 1`） |
| `categories` | `Record<string, string[]>` | 类别名称到其 `n` 个不同属性值列表的映射 |
| `clues` | `ZebraClue[]` | 结构化线索（`at`, `same`, `implies`, `notTogether`, `leftOf`, `nextTo`） |

其中 `CategoryValue` 为 `[category: string, value: string]`，每条 `ZebraClue` 为以下变体之一：
- `{ type: "at", position: number, category: string, value: string }`（`position` 从 0 开始）
- `{ type: "same", a: CategoryValue, b: CategoryValue }`
- `{ type: "implies", a: CategoryValue, b: CategoryValue }`
- `{ type: "notTogether", a: CategoryValue, b: CategoryValue }`
- `{ type: "leftOf", left: CategoryValue, right: CategoryValue, immediate?: boolean }`（`immediate: true` 表示 `pos(right) === pos(left) + 1`，否则表示 `pos(left) < pos(right)`）
- `{ type: "nextTo", a: CategoryValue, b: CategoryValue }`（`|pos(a) - pos(b)| === 1`）

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | 若存在满足所有线索的分配则为 `true`，否则为 `false` |
| `assignment` | `Array<Record<string, string>>` or `null` | 长度为 `n` 的数组，记录每个位置各类别的分配值；不可满足时为 `null` |

<!-- section:example -->
**输入**

```json
{
  "n": 3,
  "categories": {
    "color": ["red", "blue", "green"],
    "pet": ["cat", "dog", "bird"],
    "drink": ["tea", "coffee", "water"]
  },
  "clues": [
    { "type": "at", "position": 0, "category": "color", "value": "red" },
    { "type": "same", "a": ["color", "red"], "b": ["drink", "tea"] },
    { "type": "leftOf", "left": ["color", "green"], "right": ["color", "blue"], "immediate": true },
    { "type": "implies", "a": ["color", "blue"], "b": ["pet", "dog"] },
    { "type": "nextTo", "a": ["pet", "cat"], "b": ["drink", "water"] },
    { "type": "notTogether", "a": ["color", "green"], "b": ["drink", "coffee"] }
  ]
}
```

**输出**

```json
{
  "satisfiable": true,
  "assignment": [
    { "color": "red", "pet": "cat", "drink": "tea" },
    { "color": "green", "pet": "bird", "drink": "water" },
    { "color": "blue", "pet": "dog", "drink": "coffee" }
  ]
}
```

位置 0 为 red/cat/tea，位置 1 为 green/bird/water，位置 2 为 blue/dog/coffee，满足所有唯一分配与位置线索。


<!-- section:hint1 -->
为每个位置与每个类别属性值组合建立一个布尔决策变量。施加两组唯一性约束：每个位置在每个类别中恰好选一个值，每个值恰好出现在一个位置。然后将各类线索翻译为这些布尔变量之间的逻辑关系。

<!-- section:hint2 -->
使用 `m.bool(...)` 创建布尔变量，并用 `or(...)`（至少一个）和成对的 `not(and(...))`（至多一个）实现 exact-one 约束。对于 `same`、`implies`、`leftOf`、`nextTo` 线索使用 `implies(...)`，最后调用 `await m.check({ solver: "z3" })` 检查 `"Sat"`。
