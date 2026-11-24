# #043. パッケージ依存関係の解決（SAT）

<!-- section:scenario -->
パッケージマネージャは、候補となる各パッケージについてどのバージョンを導入するか（あるいは導入しないか）を決定します。各パッケージでは高々 1 つのバージョンしか選択できず、必須ルートパッケージは必ず 1 つのバージョンを選ぶ必要があります。

特定バージョンの導入は別の依存パッケージ群の選択を要求し、また互いに競合するバージョン同士は同時導入できません。すべての依存と競合を満たす構成が存在するかを判定し、実行可能な場合は導入パッケージ総数を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `packages` | `Record<string, string[]>` | パッケージごとの候補バージョン一覧 |
| `roots` | `string[]` | 導入が必須のルートパッケージ名一覧 |
| `requires` | `DependencyRule[]` | `{ pkg, ver, depPkg, depVersions }` 形式の依存関係 |
| `conflicts` | `Array<[[string, string], [string, string]]>` | 同時導入できない `[pkg, ver]` ペアの組 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `feasible` | `boolean` | 実行可能な解決策が存在すれば `true` |
| `selected` | `Record<string, string / null>` または `null` | 各パッケージの選択バージョン（未導入は `null`、実行不能なら全体が `null`） |
| `installedCount` | `number` または `null` | 最小化された導入パッケージ数（実行不能なら `null`） |

<!-- section:example -->
**入力例**

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

**出力例**

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

`app@1.0` と `legacy@1.0` が競合するため `http@1.0` は選べず、`{ app@1.0, http@2.0, tls@1.2 }` を選ぶとすべての依存関係と競合制約を満たし、導入パッケージ数 `installedCount` は 1 + 1 + 1 = 3 となります。


<!-- section:hint1 -->
すべての `(package, version)` ペアに対して導入有無を表す真偽値変数を設けます。各パッケージは高々 1 バージョン、各ルートパッケージは必ず 1 バージョンが選ばれるようにし、依存関係と競合関係を表現したうえで、導入パッケージ総数を最小化します。

<!-- section:hint2 -->
Z3 で最小化するのは算術変数 `Var` の和であり、論理結合子（`implies`, `or`, `not`, `and`）は `BoolVar` 上で動作するため、各 `m.bool(...)` に `m.binary(...)` 指示変数を対応づけて双方向の `implies` で連結します。`minimize(sum(allUsed))` と `await m.solve({ solver: "z3" })` で解き、`res.status === "Optimal"` を確認してください。
