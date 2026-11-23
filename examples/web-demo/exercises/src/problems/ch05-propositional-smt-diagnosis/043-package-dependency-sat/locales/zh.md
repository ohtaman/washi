# #043. 软件包依赖解析 (SAT)

<!-- section:scenario -->
软件包管理器需要为每个候选软件包决定安装哪个版本（或不安装）。每个软件包至多安装一个版本，而所有必选根包都必须恰好选择一个版本。

安装某个版本的软件包可能会要求安装某个依赖包的指定候选版本之一，同时互斥冲突的版本对不能同时安装。请判断是否存在合法的安装方案，并在可行时使已安装软件包总数最少。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `packages` | `Record<string, string[]>` | 各软件包的候选版本列表 |
| `roots` | `string[]` | 必须安装的根包名称列表 |
| `requires` | `DependencyRule[]` | `{ pkg, ver, depPkg, depVersions }` 依赖规则列表 |
| `conflicts` | `Array<[[string, string], [string, string]]>` | 相互冲突的 `[pkg, ver]` 版本对 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `feasible` | `boolean` | 存在合法依赖方案时为 `true` |
| `selected` | `Record<string, string / null>` 或 `null` | 各包选中的版本（未安装为 `null`，无解时整体为 `null`） |
| `installedCount` | `number` 或 `null` | 最小化的已安装软件包数量（无解时为 `null`） |

<!-- section:example -->
**输入示例**

```json
{
  "packages": {
    "app": ["1.0"],
    "http": ["1.0", "2.0"],
    "tls": ["1.2"],
    "legacy": ["1.0"]
  },
  "roots": ["app"],
  "requires": [
    { "pkg": "app", "ver": "1.0", "depPkg": "http", "depVersions": ["1.0", "2.0"] },
    { "pkg": "http", "ver": "1.0", "depPkg": "legacy", "depVersions": ["1.0"] },
    { "pkg": "http", "ver": "2.0", "depPkg": "tls", "depVersions": ["1.2"] }
  ],
  "conflicts": [
    [["app", "1.0"], ["legacy", "1.0"]]
  ]
}
```

**输出示例**

```json
{
  "feasible": true,
  "selected": {
    "app": "1.0",
    "http": "2.0",
    "tls": "1.2",
    "legacy": null
  },
  "installedCount": 3
}
```

由于 `app@1.0` 与 `legacy@1.0` 冲突，无法选择 `http@1.0`，因此最少安装 3 个软件包：`{ app@1.0, http@2.0, tls@1.2 }`。


<!-- section:hint1 -->
为每一对 `(package, version)` 引入一个布尔选择变量。限制每个软件包至多安装一个版本、每个根软件包必须安装一个版本，并在这些选择变量上表达依赖与冲突约束，同时最小化已安装软件包的总数。

<!-- section:hint2 -->
由于 Z3 最小化的是算术 `Var` 表达式，而逻辑组合子（`implies`、`or`、`not`、`and`）作用于 `BoolVar`，请将每个 `m.bool(...)` 与一个 `m.binary(...)` 指示变量配对，并用双向 `implies` 关联。使用 `minimize(sum(allUsed))` 与 `await m.solve({ solver: "z3" })` 求解，并检查 `res.status === "Optimal"`。
