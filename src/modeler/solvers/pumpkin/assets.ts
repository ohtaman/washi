export function getBundledPumpkinWasmUrl(): string {
  return new URL("../../../../public/pumpkin.wasm", import.meta.url).href;
}
