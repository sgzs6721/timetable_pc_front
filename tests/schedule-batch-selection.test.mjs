import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const source = (name) => resolve(root, 'src/pages', name)
const load = typescriptLoader({ [source('kit.tsx')]: { todayIso: () => '2026-10-25' } })
const { batchKey, toggleBatchRange, parseBatchKey } = load(source('schedule-board-fields.tsx'))
const { BatchSelectionLayer, batchSelectionOptions } = load(source('schedule-batch-selection.tsx'))
const { slotsOf } = load(source('schedule-board-helpers.tsx'))
let miniPage
globalThis.wx = { getSystemInfoSync: () => ({ platform: 'devtools' }), getStorageSync: () => '', showToast: () => assert.fail('空白时段不应被拒绝') }
globalThis.Page = (page) => { miniPage = page }
load(resolve(root, '../timetable_miniapp1/miniprogram/subpackages/schedule/pages/timetable-detail/timetable-detail.ts'))

function miniContext() {
  return {
    ...miniPage,
    data: { ...miniPage.data, boardMode: 'batchCreate', timetable: { timeIntervalMinutes: 60 }, batchCreateTargets: [] },
    validateVisibleTimetableDay: () => true,
    ensureTemplateDayManageable: () => true,
    ensureScheduleDateManageable: () => true,
    resolveDefaultCampusId: () => 1,
    isContinuousBlankActionSlot: () => true,
    setData(patch) { Object.assign(this.data, patch) },
  }
}

const cases = [
  { name: '跨日期多选保留所有日期', taps: [[1, '13:00', '14:00'], [2, '13:00', '14:00'], [3, '15:00', '15:30']] },
  { name: '两个半小时即时合并并整段取消', taps: [[1, '13:00', '13:30'], [1, '13:30', '14:00'], [1, '13:00', '14:00']] },
  { name: '半点起跨格一小时即时合并', taps: [[1, '13:30', '14:00'], [1, '14:00', '14:30']] },
  { name: '连续整格与半格延伸为长选区再取消', taps: [[1, '13:00', '14:00'], [1, '14:00', '14:30'], [1, '14:30', '15:00'], [1, '13:00', '15:00']] },
  { name: '从后向前合并，不相邻的选择独立保留', taps: [[1, '15:00', '15:30'], [1, '13:30', '14:00'], [1, '13:00', '13:30']] },
  { name: '重叠入口替换原选区但保留其它日期', taps: [[2, '16:00', '17:00'], [1, '13:00', '14:00'], [1, '13:30', '14:30']] },
  { name: '实际半小时不扩展到可用空白结束位置', taps: [[1, '13:00', '13:30'], [1, '13:00', '13:30'], [1, '13:30', '14:30']] },
]

for (const { name, taps } of cases) test(`批量选择与小程序实际点击逻辑一致：${name}`, () => {
  const mini = miniContext()
  let batch = []
  for (const [day, start, end] of taps) {
    const date = `2026-10-${18 + day}`
    batch = toggleBatchRange(batch, date, start, end)
    mini.onCellTap({ currentTarget: { dataset: {
      dayidx: day - 1, dayofweek: day, daylabel: `周${day}`, fulldate: date,
      time: start, endtime: end, availableendtime: '20:00',
    } } })
    const expected = mini.data.batchCreateTargets.map((target) => batchKey(target.fullDate, target.time, target.endTime))
    assert.deepEqual(batch, expected, `点击 ${date} ${start}-${end} 后两端选区应相同`)
    assert.equal(Object.keys(mini.data.batchCreateKeyMap).length, batch.length)
    for (const key of batch) assert.ok(parseBatchKey(key).end > parseBatchKey(key).start)
  }
})

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (!node || typeof node !== 'object') return []
  if (node.type === BatchSelectionLayer) return flatten(BatchSelectionLayer(node.props))
  return [node, ...flatten(node.props?.children)]
}
const hasClass = (node, name) => (node.props?.className || '').split(' ').includes(name)
const timetable = { id: 1, name: '课表', isWeekly: 1, startTime: '13:00', endTime: '17:00', timeIntervalMinutes: 60 }
const slots = slotsOf(timetable)

test('半小时、整小时、跨格一小时都保留可点击入口，长选区内入口被整段取消框接管', () => {
  let batch = []
  const render = () => flatten(BatchSelectionLayer({ date: '2026-10-19', slots, lessons: [], batch, onToggle: (start, end) => { batch = toggleBatchRange(batch, '2026-10-19', start, end) } }))
  const tap = (label) => {
    const node = render().find((item) => item.type === 'button' && !item.props.disabled && item.props['aria-label'] === label)
    assert.ok(node, `缺少可点击的 ${label}`)
    node.props.onClick({ stopPropagation() {} })
  }
  for (const label of ['13:00-13:30', '13:30-14:00', '13:00-14:00', '13:30-14:30']) {
    assert.ok(render().some((node) => node.props?.['aria-label'] === label))
  }
  tap('13:00-13:30')
  assert.equal(render().filter((node) => node.props?.['aria-pressed']).length, 1)
  assert.equal(render().find((node) => hasClass(node, 'tt-batch-outline')).props.style.height, 32)
  tap('13:30-14:00')
  assert.deepEqual(batch, ['2026-10-19|13:00|14:00'])
  tap('14:00-14:30')
  assert.equal(render().find((node) => hasClass(node, 'is-merged')).props.style.height, 104)
  assert.ok(render().find((node) => node.props?.['aria-label'] === '14:00-15:00').props.disabled)
  tap('14:30-15:00')
  assert.deepEqual(batch, ['2026-10-19|13:00|15:00'])
  tap('13:00-15:00')
  assert.deepEqual(batch, [])
})

test('空白入口不跨已有课程、占用或课表结束边界，部分空白仍可选', () => {
  const lessons = [{ startTime: '13:30:00', endTime: '14:00:00' }, { startTime: '15:00', endTime: '15:30', uiChangeStatus: 4 }]
  const options = batchSelectionOptions(slots, lessons)
  assert.ok(options.some(({ start, end }) => start === '13:00' && end === '13:30'))
  assert.ok(options.some(({ start, end }) => start === '15:30' && end === '16:00'))
  assert.equal(options.some(({ start, end }) => start === '14:30' && end === '15:30'), false)
  assert.equal(options.some(({ end }) => end > '17:00'), false)
  for (const option of options) for (const lesson of lessons) {
    assert.equal(option.start < lesson.endTime.slice(0, 5) && option.end > lesson.startTime.slice(0, 5), false)
  }
})

test('长选区的判定与小程序一致，包括非标准剩余时长及旧半小时网格', () => {
  const { buildBatchCreateVisualBlocks } = load(resolve(root, '../timetable_miniapp1/miniprogram/subpackages/schedule/utils/timetable-detail-batch-create.ts'))
  for (const interval of [30, 60]) for (const [start, end] of [['13:00', '13:30'], ['13:30', '14:30'], ['13:00', '13:40'], ['13:00', '14:30'], ['13:30', '16:30']]) {
    const target = { dayidx: 0, fullDate: '2026-10-19', time: start, endTime: end }
    const expected = buildBatchCreateVisualBlocks([target], () => interval)
    const nodes = flatten(BatchSelectionLayer({ date: target.fullDate, slots: slotsOf({ ...timetable, timeIntervalMinutes: interval }), lessons: [], batch: [batchKey(target.fullDate, start, end)], onToggle() {} }))
    assert.equal(nodes.filter((node) => hasClass(node, 'is-merged')).length, expected.length, `${interval} 分钟网格的 ${start}-${end}`)
  }
})

let vm
const warnings = []
const uiLoad = typescriptLoader({
  react: { ...React, useEffect: () => {} },
  antd: { Button: 'button', Dropdown: 'div', Modal: 'div', Popconfirm: 'div', Skeleton: 'div', Tabs: 'div', message: { warning: (text) => warnings.push(text), success() {}, info() {} } },
  '@ant-design/icons': { LeftOutlined: 'i', RightOutlined: 'i', PlusOutlined: 'i', StarFilled: 'i', StarOutlined: 'i' },
  [source('kit.tsx')]: { todayIso: () => '2026-10-25', NeedCampus: 'section', PageHead: 'header', AppIcon: 'i' },
  [source('schedule-controller.ts')]: { useScheduleController: () => vm },
  [source('schedule-week-picker.tsx')]: { ScheduleWeekPicker: 'nav' },
  [source('schedule-cell-dialog.tsx')]: { CellDialog: 'dialog' },
  [source('schedule-batch-selection.tsx')]: { BatchSelectionLayer },
  [resolve(root, 'src/api/biz.ts')]: {},
})
const { SchedulePage } = uiLoad(source('SchedulePage.tsx'))
const { ScheduleDialogs } = uiLoad(source('schedule-dialogs.tsx'))
function resetPage(overrides = {}) {
  warnings.length = 0
  vm = {
    groups: [], current: timetable, weekStart: '2026-10-19', mode: 'instance', selecting: true,
    schedules: [], templateSchedules: [], boardSchedules: [], instantiatedWeeks: [],
    days: [1, 2, 3, 4, 5, 6, 7], boardDays: [1, 2, 3, 4, 5, 6, 7], slots, limits: {}, campusLegend: [],
    batch: [], deleteIds: [], dragGuard: { current: false }, canManageCurrent: true, campusId: 1, activeTimetableCampusId: 1,
    ensureScheduleDateManageable: () => true, ensureTemplateDayManageable: () => true,
    setBatch: (value) => { vm.batch = typeof value === 'function' ? value(vm.batch) : value },
    setCell: (cell) => { vm.cell = cell },
    ...overrides,
  }
}
const dayLayer = (index = 0) => flatten(SchedulePage()).filter((node) => hasClass(node, 'tt-day'))[index]
const clickRange = (label, day = 0) => {
  const button = flatten(dayLayer(day)).find((node) => node.type === 'button' && !node.props.disabled && node.props['aria-label'] === label)
  assert.ok(button)
  button.props.onClick({ stopPropagation() {} })
}

test('页面点击保留跨日期选区，连续合并后按钮计数同步更新', () => {
  resetPage()
  clickRange('13:00-13:30')
  clickRange('13:00-14:00', 1)
  clickRange('13:30-14:00')
  assert.deepEqual(vm.batch, ['2026-10-19|13:00|14:00', '2026-10-20|13:00|14:00'])
  assert.ok(flatten(SchedulePage()).some((node) => node.type === 'button' && node.props.children === '排课 2 段'))
})

test('页面所有选择入口都执行历史日期、有效期和管理权限检查', () => {
  for (const overrides of [
    { ensureScheduleDateManageable: () => false },
    { ensureTemplateDayManageable: () => false, templateMode: true },
    { archived: true },
  ]) {
    resetPage(overrides)
    for (const label of ['13:00-13:30', '13:30-14:00', '13:00-14:00', '13:30-14:30']) clickRange(label)
    assert.deepEqual(vm.batch, [])
  }
})

test('确认选择使用当前视图的有效课程：请假不阻挡，固定模板占用会阻挡', () => {
  const lesson = { id: 1, courseName: '已请假课程', dayOfWeek: 1, startTime: '13:00', endTime: '14:00', uiChangeStatus: 3 }
  resetPage({ batch: ['2026-10-19|13:00|14:00'], schedules: [lesson], templateSchedules: [{ ...lesson, id: 2, uiChangeStatus: 0 }] })
  assert.equal(flatten(SchedulePage()).some((node) => hasClass(node, 'tt-cancel')), false, '批量排课时请假标记不能遮挡选择入口')
  const confirm = () => flatten(SchedulePage()).find((node) => node.type === 'button' && node.props.children === '排课 1 段').props.onClick()
  confirm()
  assert.equal(vm.cell.start, '13:00')
  assert.equal(vm.cell.end, '14:00')
  resetPage({ batch: ['2026-10-19|13:00|14:00'], templateMode: true, boardSchedules: [{ ...lesson, uiChangeStatus: 4 }] })
  confirm()
  assert.equal(vm.cell, undefined)
  assert.deepEqual(warnings, ['批量排课时请选择空白时间段'])
})

test('从移动或复制进入批量排课时清理旧目标选框', () => {
  resetPage({ selecting: false, setSelecting: (value) => { vm.selecting = value }, setDeleting() {}, setDeleteIds() {}, setPlacement: (value) => { vm.placement = value } })
  vm.placement = { kind: 'copy', schedule: { id: 1 }, targets: [] }
  const menu = flatten(SchedulePage()).find((node) => node.props?.menu?.items?.some((item) => item.key === 'create'))
  menu.props.menu.onClick({ key: 'create' })
  assert.equal(vm.placement, null)
})

test('合并为一段后提交仍保留实际选择的起止时间', async () => {
  let saved
  resetPage({
    batch: ['2026-10-19|13:30|15:00'], cell: { day: 1, date: '2026-10-19', start: '13:30', end: '15:00' },
    shell: {}, manageableScheduleCampuses: [], saveCell: async (values, ranges) => { saved = ranges },
    setSelecting() {}, loadWeek: async () => {},
  })
  const dialog = flatten(ScheduleDialogs({ vm })).find((node) => node.type === 'dialog')
  assert.equal(dialog.props.batchCount, 1)
  await dialog.props.onSave({ courseName: '课程', startTime: '13:00', endTime: '14:00' })
  assert.deepEqual(saved, [{ day: 1, date: '2026-10-19', start: '13:30', end: '15:00' }])
})
