# #043. パッケージ依存関係の解決（SAT）

<!-- section:scenario -->
パッケージマネージャは、候補となる各パッケージについてどのバージョンを導入するか（あるいは導入しないか）を、次の条件をすべて満たすように決定します。
- **パッケージごとに高々 1 バージョン**: 同じパッケージの複数バージョンを同時に導入することはできません。
- **必須ルートパッケージ**: `roots` に含まれる各パッケージは、必ずちょうど 1 つのバージョンを導入します。
- **依存ルール**: 特定バージョンの導入には、別の依存パッケージの候補バージョンのいずれかの導入が必要です。
- **競合排他**: 互いに競合するバージョン同士は同時に導入できません。

すべての条件を満たす構成が存在するかを判定し、実行可能な場合は導入パッケージ総数を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `packages` | `Record<string, string[]>` | パッケージごとの候補バージョン一覧 |
| `roots` | `string[]` | 導入が必須のルートパッケージ名一覧 |
| `requires` | `DependencyRule[]` | `{ pkg, ver, depPkg, depVersions }` 形式の依存関係 |
| `conflicts` | `Array<[[string, string], [string, string]]>` | 同時導入できない `[pkg, ver]` ペアの組 |

各 `DependencyRule` は `{ pkg: string, ver: string, depPkg: string, depVersions: string[] }` の形式で、`pkg` のバージョン `ver` を導入する場合、`depPkg` を `depVersions` のいずれかのバージョンで導入する必要があることを表します。

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `feasible` | `boolean` | 実行可能な解決策が存在すれば `true`、そうでなければ `false` |
| `selected` | `Record<string, string>`（値は `null` 可）または `null` | `packages` の全パッケージをキーとする選択バージョン（未導入は `null`、実行不能なら全体が `null`） |
| `installedCount` | `number` または `null` | 最小化された導入パッケージ数（実行不能なら `null`） |

TypeScript 上の `selected` の型は `Record<string, string | null> | null` です。

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

`{ app@1.0, http@2.0, tls@1.2 }` を選び `legacy` を未導入とすると、ルート条件・すべての依存ルール・`app@1.0` と `legacy@1.0` の競合制約を満たし、`installedCount` = 1 + 1 + 1 = 3 となります。


<!-- section:hint1 -->
すべての `(package, version)` ペアに対して導入有無を表す真偽値変数を設けます。各パッケージは高々 1 バージョン、各ルートパッケージは必ず 1 バージョンが選ばれるようにし、依存関係と競合関係を表現したうえで、導入パッケージ総数を最小化します。

<!-- section:hint2 -->
Z3 で最小化するのは算術変数 `Var` の和であり、論理結合子（`implies`, `or`, `not`, `and`）は `BoolVar` 上で動作するため、各 `m.bool(...)` に `m.binary(...)` 指示変数を対応づけて双方向の `implies` で連結します。`minimize(sum(allUsed))` と `const status = await m.solve({ solver: "z3" })` で解き、`status === "Optimal"` を確認してください。
