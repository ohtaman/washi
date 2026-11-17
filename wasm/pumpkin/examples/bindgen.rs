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

    let public_wasm = repo_root.join("public/pumpkin.wasm");
    let solver_dir = repo_root.join("src/modeler/solvers/pumpkin");
    fs::create_dir_all(public_wasm.parent().unwrap()).unwrap();
    fs::create_dir_all(&solver_dir).unwrap();

    fs::copy(staging_dir.join("pumpkin_bg.wasm"), &public_wasm).unwrap();

    let raw_js = fs::read_to_string(staging_dir.join("pumpkin.js")).unwrap();
    let patched_js = raw_js.replace("./pumpkin.d.ts", "./runtime.d.ts")
        + "\nexport function __washiResetPumpkinRuntime() {\n"
        + "  wasm = undefined;\n"
        + "  wasmModule = undefined;\n"
        + "  wasmInstance = undefined;\n"
        + "  __wbg_init_promise = undefined;\n"
        + "  cachedUint8ArrayMemory0 = null;\n"
        + "}\n";
    fs::write(solver_dir.join("runtime.js"), patched_js).unwrap();

    let raw_dts = fs::read_to_string(staging_dir.join("pumpkin.d.ts")).unwrap();
    let patched_dts = raw_dts
        + "\nexport function __washiResetPumpkinRuntime(): void;\n";
    fs::write(solver_dir.join("runtime.d.ts"), patched_dts).unwrap();

    println!(
        "Emitted {}, {}, and {}",
        public_wasm.display(),
        solver_dir.join("runtime.js").display(),
        solver_dir.join("runtime.d.ts").display()
    );
}
