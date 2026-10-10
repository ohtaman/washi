import * as Modeler from "../../../../src/index.js";

export interface ExecutionResult {
  success: boolean;
  logs: string[];
  model?: Modeler.Model;
  pulpProblem?: Modeler.LpProblem;
  mipModel?: Modeler.MipModel;
  error?: string;
  runTime?: number;
}

/**
 * Execute user JavaScript code inside the browser with the HiGHS Web Modeler environment
 */
export async function executeModelCode(code: string): Promise<ExecutionResult> {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const customLog = (...args: any[]) => {
    logs.push(args.map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" "));
    originalLog(...args);
  };

  const customWarn = (...args: any[]) => {
    logs.push("[WARN] " + args.map(a => String(a)).join(" "));
    originalWarn(...args);
  };

  const customError = (...args: any[]) => {
    logs.push("[ERROR] " + args.map(a => String(a)).join(" "));
    originalError(...args);
  };

  const startTime = performance.now();

  try {
    console.log = customLog;
    console.warn = customWarn;
    console.error = customError;

    // Build context with all modeler exports
    const context: Record<string, any> = {
      ...Modeler,
      console: { log: customLog, warn: customWarn, error: customError },
    };

    // We detect models created inside the code
    const modelsCreated: Modeler.Model[] = [];
    const problemsCreated: Modeler.LpProblem[] = [];

    // Proxy the constructors to intercept created instances
    class InterceptedModel extends Modeler.Model {
      constructor(...args: any[]) {
        super(...args);
        modelsCreated.push(this);
      }
    }

    class InterceptedLpProblem extends Modeler.LpProblem {
      constructor(...args: any[]) {
        super(...args);
        problemsCreated.push(this);
        modelsCreated.push(this.model);
      }
    }

    class InterceptedMipModel extends Modeler.MipModel {
      constructor(...args: any[]) {
        super(...args);
        modelsCreated.push(this);
      }
    }

    context.Model = InterceptedModel;
    context.LpProblem = InterceptedLpProblem;
    context.MipModel = InterceptedMipModel;

    // Asynchronous Function wrapper
    const keys = Object.keys(context);
    const values = Object.values(context);

    const asyncFunction = new Function(
      ...keys,
      `return (async () => {
        ${code}
      })();`
    );

    await asyncFunction(...values);

    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;

    const primaryModel = modelsCreated[modelsCreated.length - 1];
    const primaryProblem = problemsCreated[problemsCreated.length - 1];

    return {
      success: true,
      logs,
      model: primaryModel,
      pulpProblem: primaryProblem,
      runTime: duration,
    };
  } catch (err: any) {
    const endTime = performance.now();
    return {
      success: false,
      logs,
      error: err?.message || String(err),
      runTime: (endTime - startTime) / 1000,
    };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}
