# #043. Package Dependency Resolution (SAT)

<!-- section:scenario -->
A software package manager must choose which version (if any) of each package to install. Each package may have at most one installed version, while every required root package must have exactly one version selected.

Installing a specific package version can require one of several candidate dependency versions and can conflict with incompatible package versions. Determine whether a valid installation exists and, if feasible, minimize the total number of installed packages.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `packages` | `Record<string, string[]>` | Available version strings per package |
| `roots` | `string[]` | Root packages that must be installed |
| `requires` | `DependencyRule[]` | Rules `{ pkg, ver, depPkg, depVersions }` |
| `conflicts` | `Array<[[string, string], [string, string]]>` | Mutually incompatible `[pkg, ver]` pairs |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `feasible` | `boolean` | `true` if a valid dependency resolution exists |
| `selected` | `Record<string, string / null>` or `null` | Chosen version per package (`null` if omitted), or `null` overall if infeasible |
| `installedCount` | `number` or `null` | Minimized count of installed packages, or `null` if infeasible |

<!-- section:example -->
**Input**

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

**Output**

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

Because `app@1.0` conflicts with `legacy@1.0`, `http@1.0` is ruled out, leaving `{ app@1.0, http@2.0, tls@1.2 }` with 3 installed packages.


<!-- section:hint1 -->
Introduce a Boolean selection decision for every `(package, version)` pair. Enforce at most one version per package, require at least one version for each root package, and express each dependency requirement and pairwise conflict over those selection decisions while minimizing the total number of installed versions.

<!-- section:hint2 -->
Because Z3 minimizes arithmetic `Var` expressions while logical combinators (`implies`, `or`, `not`, `and`) operate on `BoolVar`, pair each `m.bool(...)` variable with an `m.binary(...)` indicator linked in both directions via `implies`. Solve with `minimize(sum(allUsed))` and `const status = await m.solve({ solver: "z3" })`, checking `status === "Optimal"`.
