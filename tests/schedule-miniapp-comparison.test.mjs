import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { typescriptLoader } from './load-typescript.mjs'

// 与 check:parity 一样，从同一工作区直接执行机构小程序源码，避免只对照复制的期望值。
const root = resolve(import.meta.dirname, '..')
const mini = resolve(root, '../timetable_miniapp1/miniprogram/subpackages/schedule/utils')
const load = typescriptLoader({ [resolve(root, 'src/pages/kit.tsx')]: { todayIso: () => '2026-10-25' } })
const { buildDayComparison } = load(resolve(root, 'src/pages/schedule-day-comparison.ts'))
const { buildBoardSections } = load(resolve(mini, 'timetable-detail-sections.ts'))
const { getBoardSectionHelpers } = load(resolve(mini, 'timetable-detail-section-adapters.ts'))
const { resolveEffectiveTemplateSchedulesForDay, resolveLatestTemplateSchedulesForDay } = load(resolve(mini, 'timetable-detail-board.ts'))
const helpers = getBoardSectionHelpers(resolveEffectiveTemplateSchedulesForDay, resolveLatestTemplateSchedulesForDay)
const timetable = { id: 1, name: '测试', isWeekly: 1, startTime: '09:00', endTime: '20:00', timeIntervalMinutes: 60 }
const dates = ['2026.10.19', '2026.10.20', '2026.10.21', '2026.10.22', '2026.10.23', '2026.10.24', '2026.10.25']
const fixed = (id, courseName, startTime, endTime, extra = {}) => ({ id, timetableId: 1, courseName, dayOfWeek: 6, startTime, endTime, effectiveStartDate: '2026-10-01', uiChangeStatus: 0, ...extra })
const actual = (id, name, start, end, extra = {}) => fixed(id, name, start, end, { scheduleDate: '2026-10-24', uiChangeStatus: 2, ...extra })
const basic = fixed(1, '甲', '10:00', '11:00')
const leave = actual(100, '甲', '10:00', '11:00', { uiChangeStatus: 3 })
const cases = [
  { name: '截图中的上下双色课程', templates: [fixed(1, '王楚涵', '15:00', '16:00'), fixed(2, '刘卓鸣', '17:00', '18:00')], lessons: [actual(101, '刘卓鸣', '14:30', '15:30'), actual(102, '张牧野', '15:30', '16:30')] },
  { name: '无固定课程时全新增', templates: [], lessons: [actual(101, '甲', '10:00', '11:00')] },
  { name: '相同内容和时间不标记', templates: [basic], lessons: [actual(101, '甲', '10:00', '11:00')] },
  { name: '完全覆盖时全修改', templates: [basic], lessons: [actual(101, '乙', '10:00', '11:00')] },
  { name: '未来生效的最新版本仍作为比较基准', templates: [basic, { ...basic, id: 2, courseName: '乙', effectiveStartDate: '2026-10-26' }], lessons: [actual(101, '甲', '10:00', '11:00')] },
  { name: '最新删除版本不作为课程', templates: [basic, { ...basic, id: 2, uiChangeStatus: 3, effectiveStartDate: '2026-10-25' }], lessons: [actual(101, '甲', '10:00', '11:00')] },
  { name: '请假保留恢复标识', templates: [basic], lessons: [leave] },
  { name: '旧请假不误标替换后的新模板', templates: [{ ...basic, courseName: '乙' }], lessons: [leave] },
  { name: '修改实例优先于旧请假', templates: [{ ...basic, courseName: '乙' }], lessons: [leave, actual(101, '丙', '10:00', '10:30')] },
  { name: '占用既不标新增也不留下取消框', templates: [basic], lessons: [actual(101, '占用', '10:00', '11:00', { uiChangeStatus: 4 })] },
  { name: '多个模板按覆盖并集计算分段', templates: [fixed(1, '甲', '09:30', '10:30'), fixed(2, '乙', '10:00', '11:00'), fixed(3, '丙', '11:00', '12:00')], lessons: [actual(101, '丁', '09:00', '13:00')] },
  { name: '取消虚框跨小时保持完整', templates: [fixed(1, '甲', '16:30', '17:30')], lessons: [] },
  { name: '日期范围不显示变更标记', timetable: { ...timetable, isWeekly: 0 }, templates: [basic], lessons: [actual(101, '乙', '10:00', '11:00')] },
  { name: '有效期以外不显示取消标记', timetable: { ...timetable, startDate: '2026-10-26' }, templates: [basic], lessons: [] },
]

function minutes(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m }
function ranges(segments, start, span) {
  return (segments || []).map(({ layoutStyle }) => {
    const top = Number(layoutStyle.match(/top:([\d.]+)%/)[1])
    const height = Number(layoutStyle.match(/height:([\d.]+)%/)[1])
    return { start: Math.round(start + span * top / 100), end: Math.round(start + span * (top + height) / 100) }
  })
}
function miniDetail(lesson) {
  const mark = lesson.compareStatus || ''
  const partial = mark && lesson.compareAddedSegments?.length && lesson.compareModifiedSegments?.length
  const start = minutes(lesson.startTime)
  const span = minutes(lesson.endTime) - start
  return {
    mark,
    added: partial ? ranges(lesson.compareAddedSegments, start, span) : [],
    modified: partial ? ranges(lesson.compareModifiedSegments, start, span) : [],
  }
}

for (const fixture of cases) test(`机构/Web 运行时一致：${fixture.name}`, () => {
  const settings = fixture.timetable || timetable
  const institution = buildBoardSections(['一', '二', '三', '四', '五', '六', '日'], dates, dates.map((date) => date.slice(5)), [[], [], [], [], [], fixture.lessons, []], settings, '10.25', fixture.templates, helpers)[0].days[5]
  const web = buildDayComparison(settings, false, 6, '2026-10-24', fixture.lessons, fixture.templates)
  for (const lesson of institution.allSchedules) assert.deepEqual(web.detail(lesson), miniDetail(lesson))
  const institutionCancelled = Object.entries(institution.compareCancelledSegmentsBySlot).flatMap(([slot, segments]) => segments.map((segment) => ({
    ...ranges([segment], minutes(slot), settings.timeIntervalMinutes)[0],
    leaveScheduleId: segment.leaveScheduleId,
  })))
  const webCancelled = web.cancelled.map((segment) => ({ start: minutes(segment.start), end: minutes(segment.end), leaveScheduleId: segment.leaveScheduleId }))
  assert.deepEqual(webCancelled, institutionCancelled)
})
