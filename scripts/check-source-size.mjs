import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const SOURCE_ROOT = new URL('../src/', import.meta.url)
const MAX_LINES = 800
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css'])

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  }))
  return nested.flat()
}

const rootPath = SOURCE_ROOT.pathname
const oversized = []

for (const file of await sourceFiles(rootPath)) {
  const contents = await readFile(file, 'utf8')
  const lines = contents.split(/\r?\n/).length
  if (lines > MAX_LINES) oversized.push({ file: relative(rootPath, file), lines })
}

if (oversized.length) {
  oversized.sort((left, right) => right.lines - left.lines)
  console.error(`源码文件不得超过 ${MAX_LINES} 行，请拆分组件或领域逻辑：`)
  oversized.forEach(({ file, lines }) => console.error(`- ${file}: ${lines} 行`))
  process.exit(1)
}

console.log(`源码文件大小检查通过（单文件不超过 ${MAX_LINES} 行）`)
