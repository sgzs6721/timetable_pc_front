import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

// 执行实际 TS/TSX 源码，只替换测试边界（时钟、网络和页面控制器）。
export function typescriptLoader(stubs = {}) {
  const cache = new Map()
  function load(filename) {
    if (Object.hasOwn(stubs, filename)) return stubs[filename]
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const nativeRequire = createRequire(filename)
    const require = (specifier) => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier]
      if (!specifier.startsWith('.')) return nativeRequire(specifier)
      const base = resolve(dirname(filename), specifier)
      const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find((candidate) => existsSync(candidate))
      if (!file) throw new Error(`Cannot resolve ${specifier} from ${filename}`)
      return /\.tsx?$/.test(file) ? load(file) : nativeRequire(file)
    }
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    })
    new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
    return module.exports
  }
  return load
}
