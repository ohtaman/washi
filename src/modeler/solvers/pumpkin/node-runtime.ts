export async function readPumpkinWasmFileUrl(fileUrl: URL): Promise<Uint8Array> {
  const [{ readFile }] = await Promise.all([
    import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs/promises"),
  ]);
  const buf = await readFile(fileUrl);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function readBundledPumpkinWasmBytes(): Promise<Uint8Array> {
  const [{ fileURLToPath }] = await Promise.all([
    import(/* webpackIgnore: true */ /* @vite-ignore */ "node:url"),
  ]);
  const tried: string[] = [];
  for (const rel of ["../../../../public/pumpkin.wasm", "./pumpkin.wasm"]) {
    const fileUrl = new URL(rel, import.meta.url);
    tried.push(fileURLToPath(fileUrl));
    try {
      return await readPumpkinWasmFileUrl(fileUrl);
    } catch {
      // Try next candidate
    }
  }
  throw new Error(
    `[WaSHI] Bundled pumpkin.wasm could not be found in Node.js (tried: ${tried.join(", ")}). ` +
      `Ensure public/pumpkin.wasm exists or configure a custom URL with setPumpkinWasmUrl(url); no CDN fallback is attempted.`
  );
}
