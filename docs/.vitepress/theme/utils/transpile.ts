/**
 * Strip TypeScript-specific syntax from documentation code snippets
 * so they can be executed directly in the browser via AsyncFunction.
 */
export function transpileSnippetToJs(rawCode: string): string {
  let code = rawCode
    // Remove import statements
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "")
    // Remove interface declarations
    .replace(/^\s*interface\s+[\s\S]*?\}\s*$/gm, "")
    // Remove type alias declarations
    .replace(/^\s*type\s+[\s\S]*?;\s*$/gm, "")
    // Remove `export ` keywords
    .replace(/^\s*export\s+/gm, "")
    // Remove `as const`
    .replace(/\bas\s+const\b/g, "")
    // Remove non-null assertions like `obj!`
    .replace(/([a-zA-Z0-9_\)\]])!(?!=)/g, "$1")
    // Remove variable type annotations: `const items: Item[] =` -> `const items =`
    .replace(/\b(const|let|var)\s+([a-zA-Z_$][\w$]*)\s*:\s*[^=;]+=/g, "$1 $2 =")
    // Remove parameter type annotations in function declarations: `(x: string, y: number)`
    .replace(/\(([a-zA-Z0-9_$,\s]+:[^)]+)\)/g, (match) => {
      return match.replace(/([a-zA-Z_$][\w$]*)\s*:[^,)]+/g, "$1");
    });

  // Ensure a trailing top-level function call like `runKnapsack();` is awaited
  code = code.replace(/\n([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/, "\nawait $1();");
  return code;
}
