/// <reference lib="webworker" />

const PYODIDE_VERSION = "0.29.0";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_MJS_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;
const PYODIDE_MJS_INTEGRITY =
  "sha384-XJ6ycErPpV7Tc/oBqTzwquOaQP2va5SY3A7lLnW6WmToRq2tBQKTNhabNXeZMh9I";

interface PyodideInstance {
  loadPackage(names: string | string[]): Promise<void>;
  runPython(code: string): unknown;
  globals: {
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

let pyodideReady: Promise<PyodideInstance> | null = null;
let initialized = false;

async function ensurePyodideWithHighspy(): Promise<PyodideInstance> {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      self.postMessage({ type: "phase", phase: "loading-pyodide" });

      const resp = await fetch(PYODIDE_MJS_URL, {
        integrity: PYODIDE_MJS_INTEGRITY,
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch Pyodide v${PYODIDE_VERSION}: HTTP ${resp.status}`);
      }
      const sourceText = await resp.text();
      const blobUrl = URL.createObjectURL(
        new Blob([sourceText], { type: "text/javascript" })
      );

      let loadPyodideFn: (opts: { indexURL: string }) => Promise<PyodideInstance>;
      try {
        const mod = (await import(/* @vite-ignore */ blobUrl)) as {
          loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance>;
        };
        loadPyodideFn = mod.loadPyodide;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      const pyodide = await loadPyodideFn({ indexURL: PYODIDE_INDEX_URL });
      self.postMessage({ type: "phase", phase: "loading-highspy" });
      await pyodide.loadPackage("highspy");

      // Register persistent JSON serializer & harness once per worker lifecycle.
      // Execute synchronously via runPython() inside the Web Worker (no runPythonAsync / JSPI).
      pyodide.runPython(`
import json, math, io, contextlib, traceback
import highspy
try:
    import numpy as np
except Exception:
    np = None

def __washi_to_jsonable(obj):
    if obj is None or isinstance(obj, (bool, str, int)):
        return obj
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            raise ValueError(f"Non-finite float in output: {obj}")
        return obj
    if np is not None:
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return [__washi_to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, dict):
        return {str(k): __washi_to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [__washi_to_jsonable(v) for v in obj]
    raise TypeError(f"Unsupported output type: {type(obj).__name__}")

def __washi_run_batch(code_str, inputs_json):
    inputs = json.loads(inputs_json)
    stdout_buf = io.StringIO()
    ns = {}
    try:
        with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stdout_buf):
            exec(compile(code_str, "solution.py", "exec"), ns)
            fn = ns.get("solve")
            if not callable(fn):
                raise RuntimeError("Could not find Python function solve(input_data).")
            outputs = [__washi_to_jsonable(fn(inp)) for inp in inputs]
        return json.dumps({
            "ok": True,
            "outputs": outputs,
            "logs": stdout_buf.getvalue().splitlines(),
        })
    except Exception as exc:
        return json.dumps({
            "ok": False,
            "outputs": [],
            "logs": stdout_buf.getvalue().splitlines(),
            "error": str(exc) + "\\n" + traceback.format_exc(),
        })
`);
      initialized = true;
      return pyodide;
    })().catch((err) => {
      pyodideReady = null;
      throw err;
    });
  }
  return pyodideReady;
}

self.onmessage = async (event: MessageEvent<{ requestId: number; code: string; inputsJson: string }>) => {
  const { requestId, code, inputsJson } = event.data;
  const wasCached = initialized;
  const startMs = performance.now();

  try {
    const pyodide = await ensurePyodideWithHighspy();
    const afterLoadMs = performance.now();
    self.postMessage({ type: "phase", requestId, phase: "running" });

    pyodide.globals.set("__washi_user_code", code);
    pyodide.globals.set("__washi_inputs_json", inputsJson);
    let rawJson: string;
    try {
      rawJson = String(
        pyodide.runPython("__washi_run_batch(__washi_user_code, __washi_inputs_json)")
      );
    } finally {
      pyodide.globals.delete("__washi_user_code");
      pyodide.globals.delete("__washi_inputs_json");
    }

    const parsed = JSON.parse(rawJson) as {
      ok: boolean;
      outputs: unknown[];
      logs: string[];
      error?: string;
    };
    const endMs = performance.now();

    self.postMessage({
      type: "result",
      requestId,
      wasCached,
      loadTimeMs: wasCached ? 0 : afterLoadMs - startMs,
      runTimeMs: endMs - afterLoadMs,
      ...parsed,
    });
  } catch (err: unknown) {
    self.postMessage({
      type: "result",
      requestId,
      wasCached,
      loadTimeMs: 0,
      runTimeMs: performance.now() - startMs,
      ok: false,
      outputs: [],
      logs: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
