export function getBundledPumpkinWasmUrl(): string {
  return new URL("../../../../public/solvers/pumpkin.wasm", import.meta.url).href;
}
