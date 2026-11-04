/**
 * Directly compiled HiGHS WebAssembly Driver & C API Wrapper.
 *
 * Provides a type-safe, zero-dependency interface to official ERGO-Code/HiGHS
 * via its native C API (highs_c_api.h), eliminating third-party npm wrappers.
 */

export interface HighsEmscriptenModule {
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: any[]) => any;
  ccall(name: string, returnType: string | null, argTypes: string[], args: any[]): any;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, val: number, type: string): void;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxBytesToWrite: number): void;
  addFunction(fn: (...args: any[]) => any, signature: string): number;
  removeFunction(ptr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  FS?: {
    writeFile(path: string, data: string | Uint8Array, opts?: any): void;
    unlink(path: string): void;
    readFile(path: string, opts?: any): Uint8Array | string;
  };
  HEAPF64?: Float64Array;
  HEAP32?: Int32Array;
  HEAPU8?: Uint8Array;
  HEAP8?: Int8Array;
  wasmMemory?: WebAssembly.Memory;
}

export interface CreateHiGHSOptions {
  locateFile?: (path: string, prefix?: string) => string;
  wasmBinary?: ArrayBuffer | Uint8Array;
  instantiateWasm?: (imports: any, successCallback: (instance: any) => void) => any;
  noFSInit?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

export interface HighsSolutionColumn {
  Index: number;
  Name: string;
  Primal: number;
  Dual: number;
  Type?: string;
}

export interface HighsSolutionRow {
  Index: number;
  Name?: string;
  Primal?: number;
  Dual?: number;
}

export interface HighsSolutionResult {
  Status: string;
  StatusCode: number;
  ObjectiveValue: number;
  Columns: Record<string, HighsSolutionColumn>;
  Rows?: HighsSolutionRow[];
  PrimalSolutionStatus?: number;
  DualSolutionStatus?: number;
  HasPrimalSolution?: boolean;
  IsMip?: boolean;
  ObjectiveOffsetApplied?: boolean;
}

function extractFloat64Array(
  module: HighsEmscriptenModule,
  ptr: number,
  length: number
): Float64Array {
  if (module.HEAPF64) {
    return new Float64Array(module.HEAPF64.buffer, ptr, length).slice();
  }
  const buffer = module.wasmMemory ? module.wasmMemory.buffer : module.HEAP8?.buffer;
  if (buffer) {
    return new Float64Array(buffer, ptr, length).slice();
  }
  const result = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = module.getValue(ptr + i * 8, "double");
  }
  return result;
}

export class HighsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HighsError";
  }
}

export class HighsUnsupportedOptionError extends HighsError {
  constructor(message: string) {
    super(message);
    this.name = "HighsUnsupportedOptionError";
  }
}

export const HIGHS_STATUS_NAMES: Record<number, string> = {
  0: "Not Set",
  1: "Load error",
  2: "Model error",
  3: "Presolve error",
  4: "Solve error",
  5: "Postsolve error",
  6: "Empty",
  7: "Optimal",
  8: "Infeasible",
  9: "Primal infeasible or unbounded",
  10: "Unbounded",
  11: "Bound on objective reached",
  12: "Target for objective reached",
  13: "Time limit reached",
  14: "Iteration limit reached",
  15: "Unknown",
  16: "Solution limit reached",
  17: "Interrupted",
  18: "Memory limit reached",
};

export const HIGHS_CONSTANTS = {
  callbackType: {
    logging: 0,
    simplexInterrupt: 1,
    ipmInterrupt: 2,
    mipSolution: 3,
    mipImprovingSolution: 4,
    mipLogging: 5,
    mipInterrupt: 6,
    mipGetCutPool: 7,
    mipDefineLazyConstraints: 8,
    mipUserSolution: 9,
  },
  solutionStatus: {
    none: 0,
    infeasible: 1,
    feasible: 2,
  },
  modelStatus: {
    notSet: 0,
    loadError: 1,
    modelError: 2,
    presolveError: 3,
    solveError: 4,
    postsolveError: 5,
    modelEmpty: 6,
    optimal: 7,
    infeasible: 8,
    unboundedOrInfeasible: 9,
    unbounded: 10,
    objectiveBound: 11,
    objectiveTarget: 12,
    timeLimit: 13,
    iterationLimit: 14,
    unknown: 15,
    solutionLimit: 16,
    interrupt: 17,
  },
} as const;

export interface HighsBindings {
  create: () => number;
  destroy: (highs: number) => void;
  clearModel: (highs: number) => number;
  version: () => string;
  readModel: (highs: number, filename: string) => number;
  run: (highs: number) => number;
  getNumCol: (highs: number) => number;
  getNumRow: (highs: number) => number;
  getNumNz: (highs: number) => number;
  getObjectiveValue: (highs: number) => number;
  getModelStatus: (highs: number) => number;
  getSolution: (highs: number, colVal: number, colDual: number, rowVal: number, rowDual: number) => number;
  getColName: (highs: number, col: number, namePtr: number) => number;
  getRowName: (highs: number, row: number, namePtr: number) => number;
  getColIntegrality: (highs: number, col: number, integPtr: number) => number;
  changeObjectiveOffset: (highs: number, offset: number) => number;
  getObjectiveOffset: (highs: number, offsetPtr: number) => number;
  setBoolOptionValue: (highs: number, option: string, value: number) => number;
  setIntOptionValue: (highs: number, option: string, value: number) => number;
  setDoubleOptionValue: (highs: number, option: string, value: number) => number;
  setStringOptionValue: (highs: number, option: string, value: string) => number;
  setSolution: (highs: number, colVal: number, rowVal: number, colDual: number, rowDual: number) => number;
  setSparseSolution: (highs: number, numEntries: number, indexPtr: number, valPtr: number) => number;
  getIntInfoValue: (highs: number, info: string, valPtr: number) => number;
  getDoubleInfoValue: (highs: number, info: string, valPtr: number) => number;
  getInt64InfoValue: (highs: number, info: string, valPtr: number) => number;
  setCallback: (highs: number, callbackPtr: number, userData: number) => number;
  startCallback: (highs: number, callbackType: number) => number;
  stopCallback: (highs: number, callbackType: number) => number;
}

export function bindHighsFunctions(module: HighsEmscriptenModule): HighsBindings {
  return {
    create: module.cwrap("Highs_create", "number", []),
    destroy: module.cwrap("Highs_destroy", "void", ["number"]),
    clearModel: module.cwrap("Highs_clearModel", "number", ["number"]),
    version: module.cwrap("Highs_version", "string", []),
    readModel: module.cwrap("Highs_readModel", "number", ["number", "string"]),
    run: module.cwrap("Highs_run", "number", ["number"]),
    getNumCol: module.cwrap("Highs_getNumCol", "number", ["number"]),
    getNumRow: module.cwrap("Highs_getNumRow", "number", ["number"]),
    getNumNz: module.cwrap("Highs_getNumNz", "number", ["number"]),
    getObjectiveValue: module.cwrap("Highs_getObjectiveValue", "number", ["number"]),
    getModelStatus: module.cwrap("Highs_getModelStatus", "number", ["number"]),
    getSolution: module.cwrap("Highs_getSolution", "number", ["number", "number", "number", "number", "number"]),
    getColName: module.cwrap("Highs_getColName", "number", ["number", "number", "number"]),
    getRowName: module.cwrap("Highs_getRowName", "number", ["number", "number", "number"]),
    getColIntegrality: module.cwrap("Highs_getColIntegrality", "number", ["number", "number", "number"]),
    changeObjectiveOffset: module.cwrap("Highs_changeObjectiveOffset", "number", ["number", "number"]),
    getObjectiveOffset: module.cwrap("Highs_getObjectiveOffset", "number", ["number", "number"]),
    setBoolOptionValue: module.cwrap("Highs_setBoolOptionValue", "number", ["number", "string", "number"]),
    setIntOptionValue: module.cwrap("Highs_setIntOptionValue", "number", ["number", "string", "number"]),
    setDoubleOptionValue: module.cwrap("Highs_setDoubleOptionValue", "number", ["number", "string", "number"]),
    setStringOptionValue: module.cwrap("Highs_setStringOptionValue", "number", ["number", "string", "string"]),
    setSolution: module.cwrap("Highs_setSolution", "number", ["number", "number", "number", "number", "number"]),
    setSparseSolution: module.cwrap("Highs_setSparseSolution", "number", ["number", "number", "number", "number"]),
    getIntInfoValue: module.cwrap("Highs_getIntInfoValue", "number", ["number", "string", "number"]),
    getDoubleInfoValue: module.cwrap("Highs_getDoubleInfoValue", "number", ["number", "string", "number"]),
    getInt64InfoValue: module.cwrap("Highs_getInt64InfoValue", "number", ["number", "string", "number"]),
    setCallback: module.cwrap("Highs_setCallback", "number", ["number", "number", "number"]),
    startCallback: module.cwrap("Highs_startCallback", "number", ["number", "number"]),
    stopCallback: module.cwrap("Highs_stopCallback", "number", ["number", "number"]),
  };
}

let modelFileSeq = 0;

export class HighsModel {
  readonly highs: number;
  readonly module: HighsEmscriptenModule;
  readonly bindings: HighsBindings;
  private readonly stringBuf: number;
  private isDestroyed = false;

  constructor(module: HighsEmscriptenModule, bindings: HighsBindings, highsPtr?: number) {
    this.module = module;
    this.bindings = bindings;
    this.highs = highsPtr ?? bindings.create();
    this.stringBuf = module._malloc(512);
  }

  changeObjectiveOffset(offset: number): void {
    const status = this.bindings.changeObjectiveOffset(this.highs, offset);
    if (status !== 0) {
      throw new HighsError(`Highs_changeObjectiveOffset failed with status ${status}`);
    }
  }

  getObjectiveOffset(): number {
    const ptr = this.module._malloc(8);
    try {
      this.bindings.getObjectiveOffset(this.highs, ptr);
      return this.module.getValue(ptr, "double");
    } finally {
      this.module._free(ptr);
    }
  }

  readonly options = {
    set: (name: string, value: any): void => {
      let status = -1;
      if (typeof value === "boolean") {
        status = this.bindings.setBoolOptionValue(this.highs, name, value ? 1 : 0);
      } else if (typeof value === "number") {
        if (Number.isInteger(value)) {
          status = this.bindings.setIntOptionValue(this.highs, name, value);
          if (status !== 0) {
            status = this.bindings.setDoubleOptionValue(this.highs, name, value);
          }
        } else {
          status = this.bindings.setDoubleOptionValue(this.highs, name, value);
        }
      } else if (typeof value === "string") {
        status = this.bindings.setStringOptionValue(this.highs, name, value);
      }

      if (status !== 0) {
        throw new HighsUnsupportedOptionError(`Option "${name}" with value ${JSON.stringify(value)} is not supported or invalid in HiGHS`);
      }
    },
  };

  getDimensions(): { numCols: number; numRows: number } {
    return {
      numCols: this.bindings.getNumCol(this.highs),
      numRows: this.bindings.getNumRow(this.highs),
    };
  }

  getColIntegrality(colIndex: number): number {
    const ptr = this.module._malloc(4);
    try {
      this.bindings.getColIntegrality(this.highs, colIndex, ptr);
      return this.module.getValue(ptr, "i32");
    } finally {
      this.module._free(ptr);
    }
  }

  getColName(colIndex: number): string {
    this.bindings.getColName(this.highs, colIndex, this.stringBuf);
    return this.module.UTF8ToString(this.stringBuf);
  }

  getRowName(rowIndex: number): string {
    this.bindings.getRowName(this.highs, rowIndex, this.stringBuf);
    return this.module.UTF8ToString(this.stringBuf);
  }

  setSolution(sol: { colValue?: number[]; indices?: number[]; values?: number[] }): void {
    if (sol.colValue && Array.isArray(sol.colValue)) {
      const numCols = sol.colValue.length;
      const ptr = this.module._malloc(numCols * 8);
      try {
        for (let j = 0; j < numCols; j++) {
          this.module.setValue(ptr + j * 8, sol.colValue[j], "double");
        }
        const status = this.bindings.setSolution(this.highs, ptr, 0, 0, 0);
        if (status !== 0) {
          throw new HighsError(`Highs_setSolution failed with status ${status}`);
        }
      } finally {
        this.module._free(ptr);
      }
      return;
    }

    if (sol.indices && sol.values && sol.indices.length === sol.values.length) {
      const numEntries = sol.indices.length;
      const idxPtr = this.module._malloc(numEntries * 4);
      const valPtr = this.module._malloc(numEntries * 8);
      try {
        for (let k = 0; k < numEntries; k++) {
          this.module.setValue(idxPtr + k * 4, sol.indices[k], "i32");
          this.module.setValue(valPtr + k * 8, sol.values[k], "double");
        }
        const status = this.bindings.setSparseSolution(this.highs, numEntries, idxPtr, valPtr);
        if (status !== 0) {
          throw new HighsError(`Highs_setSparseSolution failed with status ${status}`);
        }
      } finally {
        this.module._free(idxPtr);
        this.module._free(valPtr);
      }
      return;
    }

    throw new HighsError("Invalid argument to setSolution (expected { colValue } or { indices, values })");
  }

  run(callbacks?: Record<number, (event: any) => undefined>): number {
    let cbPtr = 0;
    const activeTypes: number[] = [];

    if (callbacks && typeof this.module.addFunction === "function") {
      cbPtr = this.module.addFunction((type: number, msgPtr: number, dataOutPtr: number, dataInPtr: number) => {
        const handler = callbacks[type];
        if (!handler) return;

        let data: any = {};
        if (dataOutPtr) {
          const runningTime = this.module.getValue(dataOutPtr + 8, "double");
          const simplexIterations = this.module.getValue(dataOutPtr + 16, "i32");
          const ipmIterations = this.module.getValue(dataOutPtr + 20, "i32");
          const pdlpIterations = this.module.getValue(dataOutPtr + 24, "i32");
          const objVal = this.module.getValue(dataOutPtr + 32, "double");
          const mipNodeCount = Number(this.module.getValue(dataOutPtr + 40, "i32"));
          const mipLpIterations = Number(this.module.getValue(dataOutPtr + 48, "i32"));
          const primalBound = this.module.getValue(dataOutPtr + 56, "double");
          const dualBound = this.module.getValue(dataOutPtr + 64, "double");
          const gap = this.module.getValue(dataOutPtr + 72, "double");
          const solutionPtr = this.module.getValue(dataOutPtr + 80, "i32");
          const solutionSize = this.module.getValue(dataOutPtr + 84, "i32");

          let mipSolution: Float64Array | undefined;
          if (solutionPtr && solutionSize > 0) {
            mipSolution = extractFloat64Array(this.module, solutionPtr, solutionSize);
          }

          data = {
            running_time: runningTime,
            simplex_iteration_count: simplexIterations,
            ipm_iteration_count: ipmIterations,
            pdlp_iteration_count: pdlpIterations,
            objective_function_value: objVal,
            mip_node_count: mipNodeCount,
            mip_total_lp_iterations: mipLpIterations,
            mip_primal_bound: primalBound,
            mip_dual_bound: dualBound,
            mip_gap: gap,
            ...(mipSolution ? { mip_solution: mipSolution } : {}),
          };
        }

        const message = msgPtr ? this.module.UTF8ToString(msgPtr) : "";
        const interrupt = () => {
          if (dataInPtr) {
            this.module.setValue(dataInPtr, 1, "i32");
          }
        };

        handler({ data, message, interrupt });
      }, "vipppp");

      this.bindings.setCallback(this.highs, cbPtr, 0);

      for (const rawType of Object.keys(callbacks)) {
        const typeNum = Number(rawType);
        this.bindings.startCallback(this.highs, typeNum);
        activeTypes.push(typeNum);
      }
    }

    try {
      return this.bindings.run(this.highs);
    } finally {
      if (cbPtr) {
        for (const typeNum of activeTypes) {
          try {
            this.bindings.stopCallback(this.highs, typeNum);
          } catch {
            // ignore
          }
        }
        try {
          this.module.removeFunction(cbPtr);
        } catch {
          // ignore
        }
      }
    }
  }

  getModelStatus(): number {
    return this.bindings.getModelStatus(this.highs);
  }

  readonly info = {
    get: (name: string): number | string => {
      const doublePtr = this.module._malloc(8);
      try {
        if (this.bindings.getDoubleInfoValue(this.highs, name, doublePtr) === 0) {
          return this.module.getValue(doublePtr, "double");
        }
      } finally {
        this.module._free(doublePtr);
      }

      const intPtr = this.module._malloc(4);
      try {
        if (this.bindings.getIntInfoValue(this.highs, name, intPtr) === 0) {
          return this.module.getValue(intPtr, "i32");
        }
      } finally {
        this.module._free(intPtr);
      }

      throw new HighsError(`Info item "${name}" not available or unknown in HiGHS`);
    },
  };

  getSolution(): { colValue: Float64Array; colDual: Float64Array; rowValue: Float64Array; rowDual: Float64Array } {
    const dims = this.getDimensions();
    const colValPtr = this.module._malloc(dims.numCols * 8);
    const colDualPtr = this.module._malloc(dims.numCols * 8);
    const rowValPtr = this.module._malloc(dims.numRows * 8);
    const rowDualPtr = this.module._malloc(dims.numRows * 8);

    try {
      this.bindings.getSolution(this.highs, colValPtr, colDualPtr, rowValPtr, rowDualPtr);
      return {
        colValue: extractFloat64Array(this.module, colValPtr, dims.numCols),
        colDual: extractFloat64Array(this.module, colDualPtr, dims.numCols),
        rowValue: extractFloat64Array(this.module, rowValPtr, dims.numRows),
        rowDual: extractFloat64Array(this.module, rowDualPtr, dims.numRows),
      };
    } finally {
      this.module._free(colValPtr);
      this.module._free(colDualPtr);
      this.module._free(rowValPtr);
      this.module._free(rowDualPtr);
    }
  }

  getObjectiveValue(): number {
    return this.bindings.getObjectiveValue(this.highs);
  }

  destroy(): void {
    if (!this.isDestroyed) {
      this.isDestroyed = true;
      try {
        this.module._free(this.stringBuf);
      } catch {
        // ignore
      }
      try {
        this.bindings.destroy(this.highs);
      } catch {
        // ignore
      }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }
}

export class Highs {
  readonly module: HighsEmscriptenModule;
  readonly bindings: HighsBindings;
  readonly constants = HIGHS_CONSTANTS;
  readonly errors = { HighsError, HighsUnsupportedOptionError };

  constructor(module: HighsEmscriptenModule) {
    this.module = module;
    this.bindings = bindHighsFunctions(module);
  }

  withModel<T>(
    modelInput: { format: "lp" | "mps"; data: string },
    action: (m: HighsModel) => T
  ): T {
    const highsPtr = this.bindings.create();
    const model = new HighsModel(this.module, this.bindings, highsPtr);
    const filename = `/model_${++modelFileSeq}.${modelInput.format}`;

    if (!this.module.FS) {
      throw new HighsError("Emscripten FS is not initialized on this HiGHS module instance");
    }
    const fs = this.module.FS;
    try {
      fs.writeFile(filename, modelInput.data);
      const readStatus = this.bindings.readModel(highsPtr, filename);
      if (readStatus !== 0) {
        throw new HighsError(`Failed to load ${modelInput.format.toUpperCase()} model into HiGHS (status ${readStatus})`);
      }
      return action(model);
    } finally {
      try {
        fs.unlink(filename);
      } catch {
        // ignore
      }
      model.destroy();
    }
  }

  solve(lpString: string, options: Record<string, any> = {}): HighsSolutionResult {
    return this.withModel({ format: "lp", data: lpString }, (m) => {
      for (const [key, val] of Object.entries(options)) {
        try {
          m.options.set(key, val);
        } catch {
          // ignore unsupported options
        }
      }
      m.run();
      const status = m.getModelStatus();
      const dims = m.getDimensions();
      const sol = m.getSolution();
      const columns: Record<string, HighsSolutionColumn> = {};
      for (let j = 0; j < dims.numCols; j++) {
        const name = m.getColName(j);
        columns[name] = {
          Index: j,
          Name: name,
          Primal: sol.colValue[j],
          Dual: sol.colDual[j],
        };
      }
      return {
        Status: HIGHS_STATUS_NAMES[status] ?? "Unknown",
        StatusCode: status,
        ObjectiveValue: m.getObjectiveValue(),
        Columns: columns,
      };
    });
  }
}
