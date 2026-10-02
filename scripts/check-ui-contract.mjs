import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const src = join(root, 'src')

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const failures = []
const requiredTokens = [
  '--text-body',
  '--text-title',
  '--space-2',
  '--space-4',
  '--control-md',
  '--radius-control',
  '--radius-dialog',
  '--tab-height',
]
const globalCss = readFileSync(join(src, 'styles/global.css'), 'utf8')
for (const token of requiredTokens) {
  if (!globalCss.includes(`${token}:`)) failures.push(`缺少共享视觉令牌 ${token}`)
}

const main = readFileSync(join(src, 'main.tsx'), 'utf8')
const consistencyIndex = main.indexOf("./styles/ui-consistency.css")
const calendarIndex = main.indexOf("./styles/calendar.css")
const dialogsIndex = main.indexOf("./styles/dialogs.css")
const buttonsIndex = main.indexOf("./styles/buttons.css")
if (consistencyIndex < 0) failures.push('main.tsx 未加载 ui-consistency.css')
if (calendarIndex < 0) failures.push('main.tsx 未加载 calendar.css')
if (dialogsIndex < 0) failures.push('main.tsx 未加载 dialogs.css')
if (buttonsIndex < 0) failures.push('main.tsx 未加载 buttons.css')
if (consistencyIndex >= dialogsIndex) failures.push('dialogs.css 必须在 ui-consistency.css 之后加载')
if (calendarIndex >= dialogsIndex) failures.push('dialogs.css 必须在 calendar.css 之后加载')
if (buttonsIndex <= dialogsIndex) failures.push('buttons.css 必须最后加载，统一所有页面的按钮状态')
if (!main.includes('ConfigProvider.config')) failures.push('静态 Modal 未接入全局 Ant Design 主题')

const quickCheckInSource = readFileSync(join(src, 'pages/student-quick-checkin.tsx'), 'utf8')
const scheduleSheetSource = readFileSync(join(src, 'pages/schedule-cell-dialog.tsx'), 'utf8')
const quickCheckInCss = readFileSync(join(src, 'styles/work-student-checkin.css'), 'utf8')
const scheduleSheetCss = readFileSync(join(src, 'styles/work-schedule-sheet-polish.css'), 'utf8')
const scheduleBoardCss = readFileSync(join(src, 'styles/work-schedule-board.css'), 'utf8')
const financeCss = readFileSync(join(src, 'styles/work-finance.css'), 'utf8')
const dialogsCss = readFileSync(join(src, 'styles/dialogs.css'), 'utf8')
const buttonCss = readFileSync(join(src, 'styles/buttons.css'), 'utf8')
if (!buttonCss.includes('button:not(:disabled)')
  || !buttonCss.includes('button:disabled')
  || !buttonCss.includes('.ant-btn:disabled')
  || !buttonCss.includes('.ant-btn.ant-btn-loading')) {
  failures.push('按钮样式必须同时覆盖可点击、禁用和加载状态')
}
if (/\.quick-checkin-actions\s*\{[^}]*position:\s*sticky/s.test(quickCheckInCss)) {
  failures.push('打卡弹窗操作栏不能放在滚动区内 sticky 悬浮')
}
if (!quickCheckInSource.includes('className="quick-checkin-actions"')
  || !quickCheckInSource.includes('form="quick-checkin-form"')
  || !quickCheckInSource.includes('id="quick-checkin-form"')) {
  failures.push('打卡弹窗操作栏必须使用 Modal footer，并通过 form 属性提交')
}
if (!/\.ant-modal:not\(\.ant-modal-confirm\)\.sheet-modal \.ant-modal-body\s*\{[^}]*padding:\s*0;/s.test(scheduleSheetCss)) {
  failures.push('课表弹窗的自定义悬浮标题栏必须贴合无内边距的滚动区')
}
if (/\.sheet-head\s*\{[^}]*background:\s*rgba/s.test(scheduleSheetCss)) {
  failures.push('课表弹窗的悬浮标题栏必须使用不透明背景')
}
if (!/<Modal className="sheet-modal" open centered/.test(scheduleSheetSource)) {
  failures.push('课表弹窗必须在视口内垂直居中，避免底部操作区被截断')
}
if (!/\.ant-modal:not\(\.ant-modal-confirm\):not\(\.quick-checkin-modal\):not\(\.sheet-modal\)\s*\{[^}]*top:\s*max\(/s.test(dialogsCss)) {
  failures.push('普通长表单弹窗必须保留视口上下安全间距')
}
if (!/\.tt-grid\s*\{[^}]*repeat\(var\(--days,\s*7\),\s*minmax\(108px,\s*1fr\)\)/s.test(scheduleBoardCss)) {
  failures.push('标准桌面宽度必须完整展示周课表七天列')
}
if (!financeCss.includes('.profit-chart-scroll.is-sparse')) {
  failures.push('少量校区的经营图表必须居中展示，避免大面积单侧留白')
}

for (const path of walk(src)) {
  if (!['.ts', '.tsx'].includes(extname(path))) continue
  const source = readFileSync(path, 'utf8')
  const nativeDialog = /\bwindow\s*\.\s*(alert|confirm|prompt)\s*\(/g
  for (const match of source.matchAll(nativeDialog)) {
    failures.push(`${relative(root, path)} 使用了原生 window.${match[1]} 弹窗`)
  }
  const nativeDateInput = /type\s*=\s*["'](?:date|datetime-local)["']/g
  if (nativeDateInput.test(source)) failures.push(`${relative(root, path)} 使用了无法统一样式的原生日期输入`)
  if (extname(path) === '.tsx') {
    const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(syntax)
        if (name === 'button') {
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
          const hasAttribute = (attributeName) => attributes.some((attribute) => attribute.name.getText(syntax) === attributeName)
          const location = syntax.getLineAndCharacterOfPosition(node.getStart(syntax))
          const label = `${relative(root, path)}:${location.line + 1}`
          if (!hasAttribute('type')) failures.push(`${label} 原生 button 缺少 type 属性`)
          if (hasAttribute('aria-disabled') && !hasAttribute('disabled')) failures.push(`${label} 只有 aria-disabled，没有真实 disabled 语义`)
          if (node.getText(syntax).includes('is-off') && !hasAttribute('disabled')) failures.push(`${label} 使用 is-off 表示不可用按钮，但没有 disabled 语义`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(syntax)
  }
}

if (failures.length) {
  console.error(`UI 一致性检查失败：\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('UI 一致性检查通过（设计令牌、按钮状态、弹层安全区、完整周视图、统一日历、原生弹窗）')
