import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const source = (name) => resolve(root, 'src/pages', name)
let vm
let openedCell
let restoredCampus
let confirmation
const load = typescriptLoader({
  react: { ...React, useEffect: () => {} },
  antd: { Button: 'button', Dropdown: 'div', Modal: { confirm: (value) => { confirmation = value } }, Popconfirm: 'div', Skeleton: 'div', Tabs: 'div', message: {} },
  '@ant-design/icons': { LeftOutlined: 'i', RightOutlined: 'i', PlusOutlined: 'i', StarFilled: 'i', StarOutlined: 'i' },
  [source('kit.tsx')]: { todayIso: () => '2026-10-25', NeedCampus: 'section', PageHead: 'header', AppIcon: 'i' },
  [source('schedule-controller.ts')]: { useScheduleController: () => vm },
  [source('schedule-dialogs.tsx')]: { ScheduleDialogs: 'aside' },
  [source('schedule-week-picker.tsx')]: { ScheduleWeekPicker: 'nav' },
  [resolve(root, 'src/api/biz.ts')]: {},
})
const { buildDayComparison, compareSegmentStyle } = load(source('schedule-day-comparison.ts'))
const { latestTemplateSchedules, compareDetail, cancelledCompareSegments, slotsOf } = load(source('schedule-board-helpers.tsx'))
const { SchedulePage } = load(source('SchedulePage.tsx'))
const timetable = { id: 1, name: '第二学期', isWeekly: 1, startDate: '2026-10-01', endDate: '2026-12-31', startTime: '09:00', endTime: '20:00', timeIntervalMinutes: 60 }
const fixed = (id, courseName, startTime, endTime, extra = {}) => ({ id, timetableId: 1, dayOfWeek: 6, courseName, startTime, endTime, effectiveStartDate: '2026-10-01', uiChangeStatus: 0, ...extra })
const actual = (id, courseName, startTime, endTime, extra = {}) => fixed(id, courseName, startTime, endTime, { scheduleDate: '2026-10-24', uiChangeStatus: 2, ...extra })
const dayCompare = (lessons, templates, options = {}) => buildDayComparison(options.timetable || timetable, !!options.templateMode, options.day || 6, options.date || '2026-10-24', lessons, templates)
const range = (start, end) => ({ start, end })
const cancelRanges = (result) => result.cancelled.map(({ start, end, leaveScheduleId }) => ({ start, end, leaveScheduleId }))

const liu = actual(101, '刘卓鸣', '14:30', '15:30', { templateScheduleId: 202 })
const zhang = actual(102, '张牧野', '15:30', '16:30', { templateScheduleId: 203 })
const screenshotTemplates = [
  fixed(201, '王楚涵', '15:00', '16:00'),
  fixed(202, '刘卓鸣', '17:00', '18:00'),
  fixed(203, '张牧野', '16:30', '17:30', { dayOfWeek: 4 }),
]

test('截图：刘卓鸣上绿下橙，张牧野上橙下绿，不局限于同名课程或原模板', () => {
  const result = dayCompare([liu, zhang], screenshotTemplates)
  assert.deepEqual(result.detail(liu), { mark: 'added', added: [range(870, 900)], modified: [range(900, 930)] })
  assert.deepEqual(result.detail(zhang), { mark: 'added', added: [range(960, 990)], modified: [range(930, 960)] })
  assert.deepEqual(cancelRanges(result), [{ start: '17:00', end: '18:00', leaveScheduleId: undefined }])
})

test('多个固定课程取覆盖并集，包括其它校区；相交和相邻部分不重复分段', () => {
  const lesson = actual(1, '替换课程', '09:00', '13:00')
  const result = dayCompare([lesson], [fixed(2, '甲', '09:30', '10:30'), fixed(3, '乙', '10:00', '11:00', { campusId: 2 }), fixed(4, '丙', '11:00', '12:00')])
  assert.deepEqual(result.detail(lesson), { mark: 'added', added: [range(540, 570), range(720, 780)], modified: [range(570, 720)] })
})

test('最新固定版本不按查看周的历史生效日期回退', () => {
  const old = fixed(1, '旧课程', '10:00', '11:00')
  const latest = fixed(2, '新课程', '10:00', '11:00', { effectiveStartDate: '2026-10-26' })
  const lesson = actual(3, '旧课程', '10:00', '11:00')
  const result = dayCompare([lesson], [old, latest])
  assert.deepEqual(result.templates, [latest])
  assert.equal(result.detail(lesson).mark, 'modified')
})

test('最新版本同生效日按 ID 选择，并保留同一时段的并行学员课程', () => {
  const first = fixed(1, '甲', '10:00', '11:00', { targetId: 1 })
  const newer = { ...first, id: 2 }
  const concurrent = fixed(3, '乙', '10:00', '11:00', { targetId: 2 })
  assert.deepEqual(latestTemplateSchedules([first, newer, concurrent]).map((row) => row.id).sort(), [2, 3])
})

test('内容与起止时间一致时不标色，不受旧状态、老师、校区、模板 ID 影响', () => {
  const lesson = actual(1, '甲', '10:00', '11:00', { campusId: 2, coachId: 2, targetId: 2 })
  const result = dayCompare([lesson], [fixed(2, '甲', '10:00:00', '11:00:00', { displayName: '> 甲', campusId: 1, coachId: 1, targetId: 1 })])
  assert.deepEqual(result.detail(lesson), { mark: '', added: [], modified: [] })
  assert.deepEqual(result.cancelled, [])
})

test('删除版本和占用标记不作为有效固定课程，也不生成取消框', () => {
  const lesson = actual(1, '甲', '10:00', '11:00')
  const result = dayCompare([lesson], [fixed(2, '甲', '10:00', '11:00'), fixed(3, '甲', '10:00', '11:00', { uiChangeStatus: 3, effectiveStartDate: '2026-10-25' }), fixed(4, '占用', '11:00', '12:00', { uiChangeStatus: 4 })])
  assert.equal(result.detail(lesson).mark, 'added')
  assert.deepEqual(result.cancelled, [])
  assert.equal(result.detail({ ...lesson, uiChangeStatus: 3 }).mark, '')
  assert.equal(result.detail({ ...lesson, uiChangeStatus: 4 }).mark, '')
})

test('取消范围扣除实际课程及占用，并保留跨行连续框', () => {
  const result = dayCompare([actual(1, '占用', '10:00', '10:30', { uiChangeStatus: 4 }), actual(2, '替换', '11:00', '11:30')], [fixed(3, '甲', '09:30', '12:00')])
  assert.deepEqual(cancelRanges(result).map(({ start, end }) => [start, end]), [['09:30', '10:00'], ['10:30', '11:00'], ['11:30', '12:00']])
  assert.deepEqual(cancelRanges(dayCompare([], [fixed(4, '甲', '16:30', '17:30')])).map(({ start, end }) => [start, end]), [['16:30', '17:30']])
})

test('请假记录保留销假 ID，替换后的旧请假不制造新课程取消框', () => {
  const leave = actual(1, '旧课程', '10:00', '11:00', { uiChangeStatus: 3 })
  assert.equal(dayCompare([leave], [fixed(2, '旧课程', '10:00', '11:00')]).cancelled[0].leaveScheduleId, 1)
  assert.deepEqual(dayCompare([leave], [fixed(3, '新课程', '10:00', '11:00')]).cancelled, [])
  const result = dayCompare([leave, actual(4, '修改课程', '10:00', '10:30')], [fixed(3, '新课程', '10:00', '11:00')])
  assert.deepEqual(cancelRanges(result), [{ start: '10:30', end: '11:00', leaveScheduleId: undefined }])
})

test('日期范围、固定模板视图及有效期外均不比较；有效期边界仍比较', () => {
  for (const options of [{ timetable: { ...timetable, isWeekly: 0 } }, { templateMode: true }, { date: '2026-09-30' }, { date: '2027-01-01' }]) {
    const result = dayCompare([liu], screenshotTemplates, options)
    assert.equal(result.enabled, false)
    assert.deepEqual(result.detail(liu), { mark: '', added: [], modified: [] })
    assert.deepEqual(result.cancelled, [])
  }
  for (const date of ['2026-10-01', '2026-12-31']) assert.equal(dayCompare([], [], { date }).enabled, true)
})

test('其它星期及其它周的实例不干扰当前日期的比较', () => {
  const templates = [fixed(1, '甲', '10:00', '11:00')]
  const others = [actual(2, '甲', '10:00', '11:00', { scheduleDate: '2026-10-17' }), fixed(3, '甲', '10:00', '11:00', { dayOfWeek: 5 })]
  assert.deepEqual(dayCompare(others, templates).schedules, [])
  assert.equal(cancelledCompareSegments(6, '2026-10-24', others, templates).length, 1)
  assert.equal(compareDetail(liu, []).mark, 'added')
})

test('分段连接处取消内部横线，顶部和底部仍保留外边框', () => {
  assert.deepEqual(compareSegmentStyle(liu, range(870, 900)), { top: '0%', height: '50%', borderBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 })
  assert.deepEqual(compareSegmentStyle(liu, range(900, 930)), { top: '50%', height: '50%', borderTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 })
})

function render(lessons, templates, overrides = {}) {
  vm = {
    groups: [], groupsLoading: false, archived: false, current: timetable, weekStart: '2026-10-19', mode: 'instance',
    schedules: lessons, templateSchedules: latestTemplateSchedules(templates), boardSchedules: lessons.filter((item) => item.uiChangeStatus !== 3),
    instantiatedWeeks: [], days: [1, 2, 3, 4, 5, 6, 7], boardDays: [1, 2, 3, 4, 5, 6, 7], slots: slotsOf(timetable), limits: {},
    campusLegend: [], batch: [], deleteIds: [], dragGuard: { current: false }, canManageCurrent: true, campusId: 1, activeTimetableCampusId: 1,
    setCell: (cell) => { openedCell = cell }, ensureScheduleDateManageable: (campusId) => { restoredCampus = campusId; return true },
    ...overrides,
  }
  const nodes = []
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(SchedulePage())
  return nodes
}
const hasClass = (node, name) => (node.props?.className || '').split(' ').includes(name)
const cards = (nodes) => nodes.filter((node) => hasClass(node, 'tt-card'))

test('实际 Web 页面使用分段结果渲染截图中的两个课程', () => {
  const nodes = render([liu, zhang], screenshotTemplates)
  assert.equal(cards(nodes).length, 2)
  const segments = nodes.filter((node) => hasClass(node, 'tt-compare'))
  assert.equal(segments.length, 4)
  assert.deepEqual(segments.map((node) => [node.props.className, node.props.style.top]), [
    ['tt-compare is-added', '0%'], ['tt-compare is-modified', '50%'],
    ['tt-compare is-added', '50%'], ['tt-compare is-modified', '0%'],
  ])
})

test('实际 Web 日期范围页面不标绿，固定模板页无变更标识，有效期外无取消框', () => {
  const nonweekly = render([liu], screenshotTemplates, { current: { ...timetable, isWeekly: 0 } })
  assert.equal(cards(nonweekly).length, 1)
  assert.equal(cards(nonweekly).some((node) => hasClass(node, 'is-added') || hasClass(node, 'is-modified')), false)
  assert.equal(nonweekly.some((node) => hasClass(node, 'tt-cancel') || hasClass(node, 'tt-compare') || hasClass(node, 'tt-legend')), false)
  const template = render([], screenshotTemplates, { templateMode: true, mode: 'template', boardSchedules: screenshotTemplates })
  assert.equal(cards(template).length, 3)
  assert.equal(template.some((node) => hasClass(node, 'tt-cancel') || hasClass(node, 'tt-compare')), false)
  assert.equal(render([], screenshotTemplates, { current: { ...timetable, startDate: '2026-10-26' } }).some((node) => hasClass(node, 'tt-cancel')), false)
})

test('请假虚框点击和销假均找到原始记录，权限校验使用该课程校区', () => {
  const leave = actual(100, '请假学员', '16:30', '17:30', { uiChangeStatus: 3, campusId: 7 })
  const nodes = render([leave], [fixed(200, '请假学员', '16:30', '17:30')])
  const button = nodes.find((node) => hasClass(node, 'tt-cancel') && hasClass(node, 'is-action'))
  assert.ok(button)
  button.props.onClick()
  assert.equal(openedCell.schedule, leave)
  assert.equal(restoredCampus, 7)
  button.props.onContextMenu({ preventDefault() {} })
  assert.equal(confirmation.title, '销假')
  assert.equal(restoredCampus, 7)
})

test('周日新增周五固定课：过去周五不生成实际课程，但固定模板中仍可显示', () => {
  const newlyCreated = fixed(300, '枯夸地', '13:00', '14:00', { dayOfWeek: 5, effectiveStartDate: '2026-10-25', createTime: '2026-10-25T14:35:00' })
  assert.equal(cards(render([], [newlyCreated])).length, 0)
  assert.equal(cards(render([], [newlyCreated], { templateMode: true, mode: 'template', boardSchedules: [newlyCreated] })).length, 1)
  const controller = readFileSync(source('schedule-controller.ts'), 'utf8')
  assert.match(controller, /getJson<Schedule\[\]>\(`\/schedules\/timetable\/\$\{timetable\.id\}\/week`, \{ weekStart \}\)/)
  assert.match(controller, /setSchedules\(list \|\| \[\]\)/)
  assert.match(controller, /setTemplateSchedules\(latestTemplateSchedules\(rows \|\| \[\]\)\)/)
})
