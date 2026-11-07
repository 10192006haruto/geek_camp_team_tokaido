// CLI/tests only: transpile existing TypeScript without adding runtime dependencies.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      const attempts = [base.href, `${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`, base.href.replace(/\.js$/, '.ts'), base.href.replace(/\.js$/, '.tsx')];
      for (const url of attempts) if (/\.tsx?$/.test(url) && existsSync(new URL(url))) return { url, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText };
    return next(url, context);
  },
});
