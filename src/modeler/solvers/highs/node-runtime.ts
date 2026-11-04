import createHiGHS from "./runtime.js";
import { Highs } from "./driver.js";

export async function loadNodeHighs(): Promise<(options?: any) => Promise<Highs>> {
  const [{ existsSync }, { fileURLToPath }] = await Promise.all([
    import("node:fs"),
    import("node:url"),
  ]);

  return async (options: any = {}) => {
    let wasmPath: string | undefined;
    for (const rel of ["../../../../public/highs.wasm", "./highs.wasm"]) {
      try {
        const candidate = fileURLToPath(new URL(rel, import.meta.url));
        if (existsSync(candidate)) {
          wasmPath = candidate;
          break;
        }
      } catch {
        // ignore resolution error
      }
    }

    const locateFile = (file: string, dir?: string) => {
      if (options.locateFile) {
        return options.locateFile(file, dir);
      }
      if (file.endsWith(".wasm") && wasmPath) {
        return wasmPath;
      }
      return (dir || "") + file;
    };

    const instantiateWasm = options.wasmBinary
      ? (imports: WebAssembly.Imports, successCallback: (inst: WebAssembly.Instance) => void) => {
          WebAssembly.instantiate(options.wasmBinary, imports).then((res) => {
            const instance = "instance" in res ? res.instance : res;
            successCallback(instance);
          });
          return {};
        }
      : options.instantiateWasm;

    const module = await createHiGHS({
      ...options,
      locateFile,
      ...(instantiateWasm ? { instantiateWasm } : {}),
    });
    return new Highs(module);
  };
}
