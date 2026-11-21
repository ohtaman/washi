/// <reference lib="webworker" />

const PYODIDE_VERSION = "0.29.0";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_MJS_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;
const PYODIDE_MJS_INTEGRITY =
  "sha384-XJ6ycErPpV7Tc/oBqTzwquOaQP2va5SY3A7lLnW6WmToRq2tBQKTNhabNXeZMh9I";

interface PyodideInstance {
  loadPackage(names: string | string[]): Promise<void>;
  pyimport(name: string): unknown;
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
      await pyodide.loadPackage(["highspy", "micropip"]);
      const micropip = pyodide.pyimport("micropip") as {
        install(pkg: string | string[]): Promise<void>;
      };
      await micropip.install("pulp==3.3.2");

      // Register persistent JSON serializer & harness once per worker lifecycle.
      // Execute synchronously via runPython() inside the Web Worker (no runPythonAsync / JSPI).
      pyodide.runPython(`
import json, math, io, contextlib, re, traceback
import highspy
import pulp
try:
    import numpy as np
except Exception:
    np = None

def _washi_to_snake(name):
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\\1_\\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\\1_\\2", s1).lower()

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

_washi_tracked_models = []
_washi_tracked_pulp_models = []
_washi_orig_highs = highspy.Highs
try:
    class _WashiTrackedHighs(_washi_orig_highs):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            _washi_tracked_models.append(self)
    highspy.Highs = _WashiTrackedHighs
except TypeError:
    def _washi_make_highs(*args, **kwargs):
        inst = _washi_orig_highs(*args, **kwargs)
        _washi_tracked_models.append(inst)
        return inst
    highspy.Highs = _washi_make_highs

_washi_orig_lp_init = pulp.LpProblem.__init__
_washi_orig_lp_solve = pulp.LpProblem.solve

def _washi_lp_init(self, *args, **kwargs):
    _washi_orig_lp_init(self, *args, **kwargs)
    _washi_tracked_pulp_models.append(self)

def _washi_lp_solve(self, solver=None, **kwargs):
    if solver is None:
        solver = pulp.HiGHS(msg=False)
    return _washi_orig_lp_solve(self, solver=solver, **kwargs)

pulp.LpProblem.__init__ = _washi_lp_init
pulp.LpProblem.solve = _washi_lp_solve
pulp.LpSolverDefault = pulp.HiGHS(msg=False)

def _washi_normalize_status(model, status_enum):
    ms = highspy.HighsModelStatus
    if status_enum == ms.kOptimal:
        return "Optimal"
    if status_enum == ms.kInfeasible:
        return "Infeasible"
    if status_enum == ms.kUnbounded:
        return "Unbounded"
    if status_enum == ms.kUnboundedOrInfeasible:
        return "InfeasibleOrUnbounded"
    if status_enum == ms.kNotset:
        return "NotSolved"
    return str(model.modelStatusToString(status_enum))

def _washi_normalize_pulp_status(status_code):
    if status_code == pulp.LpStatusOptimal:
        return "Optimal"
    if status_code == pulp.LpStatusInfeasible:
        return "Infeasible"
    if status_code == pulp.LpStatusUnbounded:
        return "Unbounded"
    if status_code == pulp.LpStatusNotSolved:
        return "NotSolved"
    return str(pulp.LpStatus.get(status_code, "Unknown"))

def _washi_current_metrics():
    if _washi_tracked_pulp_models:
        primary = _washi_tracked_pulp_models[-1]
        st_norm = _washi_normalize_pulp_status(primary.status)
        rt_sec = getattr(primary, "solutionTime", None)
        return {
            "varCount": len(primary.variables()),
            "constraintCount": len(primary.constraints),
            "solveTimeMs": (
                float(rt_sec) * 1000.0
                if isinstance(rt_sec, (int, float)) and math.isfinite(rt_sec)
                else None
            ),
            "solverStatus": st_norm,
        }
    if _washi_tracked_models:
        primary = _washi_tracked_models[-1]
        st_norm = _washi_normalize_status(primary, primary.getModelStatus())
        rt_sec = primary.getRunTime() if hasattr(primary, "getRunTime") else None
        return {
            "varCount": int(primary.getNumCol()),
            "constraintCount": int(primary.getNumRow()),
            "solveTimeMs": (
                float(rt_sec) * 1000.0
                if isinstance(rt_sec, (int, float)) and math.isfinite(rt_sec)
                else None
            ),
            "solverStatus": st_norm,
        }
    return {
        "varCount": 0,
        "constraintCount": 0,
        "solveTimeMs": None,
        "solverStatus": None,
    }

def __washi_run_batch(code_str, inputs_json):
    inputs = json.loads(inputs_json)
    stdout_buf = io.StringIO()
    ns = {}
    try:
        _washi_tracked_models.clear()
        _washi_tracked_pulp_models.clear()
        with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stdout_buf):
            exec(compile(code_str, "solution.py", "exec"), ns)
            fn = ns.get("solve")
            if not callable(fn):
                raise RuntimeError("Could not find Python function solve(...).")
            outputs = []
            metrics = []
            for inp in inputs:
                _washi_tracked_models.clear()
                _washi_tracked_pulp_models.clear()
                raw_out = fn(**{_washi_to_snake(k): v for k, v in inp.items()})
                outputs.append(__washi_to_jsonable(raw_out))
                metrics.append(_washi_current_metrics())
        return json.dumps({
            "ok": True,
            "outputs": outputs,
            "metrics": metrics,
            "logs": stdout_buf.getvalue().splitlines(),
        })
    except Exception as exc:
        failed_status = None
        try:
            st_norm = _washi_current_metrics().get("solverStatus")
            if st_norm in ("Infeasible", "InfeasibleOrUnbounded", "Unbounded"):
                failed_status = st_norm
        except Exception:
            failed_status = None
        return json.dumps({
            "ok": False,
            "outputs": [],
            "metrics": [],
            "logs": stdout_buf.getvalue().splitlines(),
            "error": str(exc) + "\\n" + traceback.format_exc(),
            **({"failedSolverStatus": failed_status} if failed_status else {}),
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
      metrics?: unknown[];
      failedSolverStatus?: string;
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
