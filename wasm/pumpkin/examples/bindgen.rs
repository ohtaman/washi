use std::fs;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo_root = manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .expect("Failed to locate repository root from wasm/pumpkin");
    let wasm_path = manifest_dir.join("target/wasm32-unknown-unknown/release/pumpkin.wasm");
    let staging_dir = manifest_dir.join("target/bindgen-web");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).unwrap();
    }
    fs::create_dir_all(&staging_dir).unwrap();

    wasm_bindgen_cli_support::Bindgen::new()
        .input_path(&wasm_path)
        .web(true)
        .unwrap()
        .typescript(true)
        .generate(&staging_dir)
        .unwrap();

    let public_wasm = repo_root.join("public/solvers/pumpkin.wasm");
    let solver_dir = repo_root.join("src/modeler/solvers/pumpkin");
    fs::create_dir_all(public_wasm.parent().unwrap()).unwrap();
    fs::create_dir_all(&solver_dir).unwrap();

    fs::copy(staging_dir.join("pumpkin_bg.wasm"), &public_wasm).unwrap();

    let raw_js = fs::read_to_string(staging_dir.join("pumpkin.js")).unwrap();
    for expected in [
        "export function check_json(",
        "export function check_with_callback(",
        "export function solve_json(",
        "export function solve_with_callback(",
        "wasm.__wbindgen_start();",
        "export { initSync, __wbg_init as default };",
    ] {
        assert!(
            raw_js.contains(expected),
            "Unexpected wasm-bindgen output in pumpkin.js: missing `{}`",
            expected
        );
    }

    let body = raw_js
        .replace("/* @ts-self-types=\"./pumpkin.d.ts\" */\n", "")
        .replace("/* @ts-self-types=\"./pumpkin.d.ts\" */\r\n", "")
        .replace("export function check_json(", "function check_json(")
        .replace(
            "export function check_with_callback(",
            "function check_with_callback(",
        )
        .replace("export function solve_json(", "function solve_json(")
        .replace(
            "export function solve_with_callback(",
            "function solve_with_callback(",
        )
        .replace(
            "    wasm.__wbindgen_start();",
            "    if (\n      !wasm ||\n      !(wasm.memory instanceof WebAssembly.Memory) ||\n      typeof wasm.__wbindgen_start !== \"function\" ||\n      typeof wasm.__wbindgen_malloc !== \"function\" ||\n      typeof wasm.__wbindgen_free !== \"function\" ||\n      typeof wasm.check_json !== \"function\" ||\n      typeof wasm.check_with_callback !== \"function\" ||\n      typeof wasm.solve_json !== \"function\" ||\n      typeof wasm.solve_with_callback !== \"function\"\n    ) {\n      throw new Error(\"[WaSHI] Invalid Pumpkin WebAssembly module: missing expected solver exports.\");\n    }\n    wasm.__wbindgen_start();",
        )
        .replace(
            "export { initSync, __wbg_init as default };",
            "return { check_json, check_with_callback, solve_json, solve_with_callback, __wbg_init };",
        );

    assert!(
        !body.contains("\nexport ") && !body.starts_with("export "),
        "Unexpected leftover `export` statement inside scoped pumpkin runtime"
    );

    let patched_js = format!(
        "/* @ts-self-types=\"./runtime.d.ts\" */\n\nfunction __washiCreateRuntimeScope() {{\n{}\n}}\n\nexport async function createPumpkinRuntime(wasmBytes) {{\n  const scope = __washiCreateRuntimeScope();\n  await scope.__wbg_init({{ module_or_path: wasmBytes }});\n  return {{\n    check_json: scope.check_json,\n    check_with_callback: scope.check_with_callback,\n    solve_json: scope.solve_json,\n    solve_with_callback: scope.solve_with_callback,\n  }};\n}}\n",
        body.trim()
    );
    fs::write(solver_dir.join("runtime.js"), patched_js).unwrap();

    let patched_dts = "\
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
";
    fs::write(solver_dir.join("runtime.d.ts"), patched_dts).unwrap();

    println!(
        "Emitted {}, {}, and {}",
        public_wasm.display(),
        solver_dir.join("runtime.js").display(),
        solver_dir.join("runtime.d.ts").display()
    );
}
