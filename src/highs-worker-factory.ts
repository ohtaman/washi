/** Kept separate from the loader so worker builds do not recursively include themselves. */
export function createHighsWorker(): Worker {
  return new Worker(new URL("./highs-worker.ts", import.meta.url), { type: "module" });
}
