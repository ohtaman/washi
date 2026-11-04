/**
 * Type declarations for the directly compiled HiGHS WebAssembly Emscripten module.
 */

import type { HighsEmscriptenModule, CreateHiGHSOptions } from "./driver.js";

export type { HighsEmscriptenModule, CreateHiGHSOptions };
export default function createHiGHS(moduleArg?: CreateHiGHSOptions): Promise<HighsEmscriptenModule>;
