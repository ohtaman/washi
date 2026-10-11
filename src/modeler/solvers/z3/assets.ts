/**
 * Asset discovery for Z3 solver plugin.
 *
 * In bundler builds (Vite, webpack), the static `new URL("./...", import.meta.url)`
 * pattern enables automatic discovery and emission of z3-built.js and z3-built.wasm.
 */
export function getBundledZ3AssetUrls(): { jsUrl: string; wasmUrl: string } {
  return {
    jsUrl: new URL("./z3-built.js", import.meta.url).href,
    wasmUrl: new URL("./z3-built.wasm", import.meta.url).href,
  };
}
