# #043. Package Dependency Resolution (SAT)

<!-- section:scenario -->
A software package manager must decide which version (if any) of each candidate package to install while satisfying all of the following rules:
- **At most one version per package**: No package may have two or more versions installed simultaneously.
- **Required root packages**: Every package listed in `roots` must have exactly one version installed.
- **Dependency rules**: Installing a specific package version requires installing one of the candidate versions of its dependency package.
- **Pairwise conflicts**: Mutually incompatible package-version pairs cannot be installed together.

Determine whether a valid installation exists and, if feasible, minimize the total number of installed packages.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `packages` | `Record<string, string[]>` | Available version strings per package |
| `roots` | `string[]` | Root packages that must be installed |
| `requires` | `DependencyRule[]` | Rules `{ pkg, ver, depPkg, depVersions }` |
| `conflicts` | `Array<[[string, string], [string, string]]>` | Mutually incompatible `[pkg, ver]` pairs |

Each `DependencyRule` has `{ pkg: string, ver: string, depPkg: string, depVersions: string[] }`, meaning if `pkg` is installed at version `ver`, then `depPkg` must be installed with one of the versions in `depVersions`.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `feasible` | `boolean` | `true` if a valid dependency resolution exists, else `false` |
| `selected` | `Record<string, string>` (values may be `null`) or `null` | Chosen version per package with every key in `packages` present (`null` if not installed), or `null` overall if infeasible |
| `installedCount` | `number` or `null` | Minimized count of installed packages, or `null` if infeasible |

In TypeScript, `selected` has type `Record<string, string | null> | null`.

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

Selecting `{ app@1.0, http@2.0, tls@1.2 }` (with `legacy` not installed) satisfies the root requirement, all dependency rules, and the conflict between `app@1.0` and `legacy@1.0`, giving `installedCount` = 1 + 1 + 1 = 3.


<!-- section:hint1 -->
Introduce a Boolean selection decision for every `(package, version)` pair. Enforce at most one version per package, require at least one version for each root package, and express each dependency requirement and pairwise conflict over those selection decisions while minimizing the total number of installed versions.

<!-- section:hint2 -->
Because Z3 minimizes arithmetic `Var` expressions while logical combinators (`implies`, `or`, `not`, `and`) operate on `BoolVar`, pair each `m.bool(...)` variable with an `m.binary(...)` indicator linked in both directions via `implies`. Solve with `minimize(sum(allUsed))` and `const status = await m.solve({ solver: "z3" })`, checking `status === "Optimal"`.
