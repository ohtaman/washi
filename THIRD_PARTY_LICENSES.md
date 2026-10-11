# Third-Party Licenses & Attributions

WaSHI (`@ohtaman/washi`) is an open-source mathematical modeling framework distributed under the **MIT License**.

Depending on the solver you choose at runtime, WaSHI interacts with the following third-party optimization engines. This document provides copyright notices and license information for these underlying solvers.

---

## 1. HiGHS (Default Solver)

- **Role**: Default Linear & Mixed-Integer Programming Engine (WebAssembly)
- **Package**: [`highs`](https://www.npmjs.com/package/highs)
- **License**: **MIT License**
- **Upstream Repository**: [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) / [lovasoa/highs-js](https://github.com/lovasoa/highs-js)

```text
MIT License

Copyright (c) 2023 highs-js
Copyright (c) 2026 HiGHS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Z3 Theorem Prover (Optional Solver)

- **Role**: SMT Logic & Unsatisfiable Core Diagnosis Engine (WebAssembly)
- **Package**: [`z3-solver`](https://www.npmjs.com/package/z3-solver)
- **License**: **MIT License**
- **Upstream Repository**: [Z3Prover/z3](https://github.com/Z3Prover/z3)

```text
Z3
Copyright (c) Microsoft Corporation
All rights reserved. 
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## 3. GLPK / glpk.js (Optional Solver Plugin)

- **Role**: Optional Linear Programming Solver
- **Package**: [`glpk.js`](https://www.npmjs.com/package/glpk.js)
- **License**: **GNU General Public License v3.0 (GPL-3.0)**
- **Upstream Repository**: [jvail/glpk.js](https://github.com/jvail/glpk.js)
- **Notice**: WaSHI isolates GLPK support into an optional subpath export (`@ohtaman/washi/solvers/glpk`). It is loaded dynamically only when explicitly opted in by the user. If your application requires a strictly permissive license (e.g., proprietary enterprise deployments), stick to the default **HiGHS** (MIT) or **Z3** (MIT) engines.

```text
GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>
Everyone is permitted to copy and distribute verbatim copies
of this license document, but changing it is not allowed.

For the full license text of GPL-3.0, please refer to:
https://www.gnu.org/licenses/gpl-3.0.txt
```
