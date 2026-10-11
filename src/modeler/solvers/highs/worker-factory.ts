/** Kept separate from the loader so worker builds do not recursively include themselves. */
export function createHighsWorker(): Worker {
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}
