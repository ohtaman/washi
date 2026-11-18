/* tslint:disable */
/* eslint-disable */

export interface PumpkinWasmBindings {
  check_json(request_json: string): string;
  check_with_callback(request_json: string, should_abort?: Function | null): string;
  solve_json(request_json: string): string;
  solve_with_callback(
    request_json: string,
    on_event?: Function | null,
    should_abort?: Function | null
  ): string;
}

export function createPumpkinRuntime(
  wasmBytes: BufferSource | WebAssembly.Module
): Promise<PumpkinWasmBindings>;
