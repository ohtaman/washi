/** Vite handles this in the demo; the library build preserves a package-relative URL. */
export function getBundledWasmUrl(): string {
  return new URL("../public/highs.wasm", import.meta.url).href;
}
