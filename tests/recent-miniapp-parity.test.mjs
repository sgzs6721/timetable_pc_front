import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const page = (file) => resolve(root, 'src/pages', file)
const load = typescriptLoader({
  [page('kit.tsx')]: { todayIso: () => '2026-11-09', money: (value) => Number(value || 0).toFixed(2) },
  [resolve(root, 'src/api/biz.ts')]: {},
})
const service = load(page('schedule-service.ts'))
const courses = load(page('course-pagination.ts'))
const finance = load(page('finance-summary.ts'))
const profit = load(page('profit-dashboard.tsx'))
const access = load(resolve(root, 'src/access.ts'))
const nav = load(resolve(root, 'src/nav.ts'))
const entitlement = load(page('student-period-entitlement.ts'))
const domain = load(page('students-domain.tsx'))

test('课程分页查询覆盖全量筛选，删除末页后退回最后有效页', () => {
  assert.deepEqual(courses.coursePageQuery(3, 3, ' 小明 ', 'one', 7), { campusId: 3, offset: 40, pageSize: 20, keyword: '小明', type: 'oneToOne', coachId: 7 })
  assert.equal(courses.lastCoursePage(40), 2)
  assert.equal(courses.lastCoursePage(0), 1)
  assert.equal(courses.coursePageQuery(3, 1, '', 'all').type, undefined)
})

const appointment = (id, startTime, endTime, extra = {}) => ({ id, startTime, endTime, dayOfWeek: 1, campusId: 3, targetType: 'student', targetId: id, displayName: `学员${id}`, ...extra })
test('服务预约按连续重叠分组，邻接、不同日期与校区互不合并，保留原始 ID', () => {
  const rows = [appointment(1, '09:00', '10:00'), appointment(2, '09:30', '10:30'), appointment(3, '10:00', '11:00'), appointment(4, '11:00', '12:00'), appointment(5, '09:00', '10:00', { campusId: 4 }), appointment(6, '09:00', '10:00', { dayOfWeek: 2 })]
  const groups = service.groupServiceSchedules(rows)
  const combined = groups.find((group) => group.schedules.length === 3)
  assert.equal(groups.length, 4)
  assert.deepEqual(combined.schedules.map((row) => row.id), [1, 2, 3])
  assert.equal(combined.end, '11:00')
  assert.equal(combined.count, 3)
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3, 4, 5, 6])
})

test('服务名单人数不重复计同一学员，请假不计入在场人数；独立服务按安排计数', () => {
  const groups = service.groupServiceSchedules([
    appointment(1, '09:00', '10:00'), appointment(2, '09:00', '10:00', { targetId: 1 }),
    appointment(3, '09:00', '10:00', { uiChangeStatus: 3 }),
    appointment(4, '10:00', '11:00', { targetType: 'service', targetId: 7 }),
    appointment(5, '10:00', '11:00', { targetType: 'service', targetId: 7 }),
  ])
  assert.equal(groups[0].count, 1)
  assert.equal(groups[0].schedules.length, 3)
  assert.equal(groups[1].count, 2)
  assert.equal(groups[1].standalone, true)
})

test('服务开始时间允许重叠预约，避开占用并保留当前时长、单元格和日边界', () => {
  const rows = [appointment(1, '09:00', '10:30'), appointment(2, '11:00', '12:00', { uiChangeStatus: 4 })]
  assert.deepEqual(service.serviceStartOptions('09:00', '11:00', 60, '12:00', rows), ['09:00', '09:30', '10:00'])
  assert.deepEqual(service.serviceStartOptions('09:00', '10:00', 60, '10:00', rows), ['09:00'])
  assert.deepEqual(service.serviceBlockers(rows, false), rows)
})

test('服务名单账户按绑定卡读取，模糊旧预约不展示其他卡的余额', () => {
  const row = appointment(1, '09:00', '10:00', { pricingCourseType: 'service:7#card:102' })
  const options = [{ targetType: 'student', targetId: 1, cardOptions: [{ id: 101, cardCategory: 'STORED_VALUE', remainingAmount: 999 }, { id: 102, cardCategory: 'STORED_VALUE', remainingAmount: 50 }], serviceOptions: [{ courseType: 'service:7', studentCardIds: [101, 102], unitPrice: 20 }] }]
  assert.equal(service.serviceAccount(row, options).primary, '余额 ¥50.00')
  assert.equal(service.serviceAccount(row, options).secondary, '单价 ¥20.00')
  assert.equal(service.serviceAccount({ ...row, pricingCourseType: 'service:7' }, options).primary, '账户信息暂不可用')
  assert.equal(service.serviceAccount(row).primary, '账户加载中…')
})

test('服务模板版本按序列保留最新版本，不丢失同一时段多笔服务', () => {
  const { latestTemplateSchedules } = load(page('schedule-board-helpers.tsx'))
  const rows = [appointment(1, '09:00', '10:00', { templateSeriesId: 10, effectiveStartDate: '2026-11-01' }), appointment(2, '09:30', '10:30', { templateSeriesId: 10, effectiveStartDate: '2026-11-02' }), appointment(3, '09:30', '10:30', { templateSeriesId: 11, targetId: 2 })]
  assert.deepEqual(latestTemplateSchedules(rows).map((row) => row.id).sort(), [2, 3])
})

test('全部校区以分累计金额，缺失校区统计标记为不可用', () => {
  const rows = [{ overview: { income: 0.1, paidExpense: 0.2, pendingExpense: 0.1 } }, { overview: { income: 0.2, paidExpense: -0.1, pendingExpense: 0.2 } }]
  assert.deepEqual(finance.allCampusSummary(rows), { available: true, income: 0.3, paid: 0.1, pending: 0.3, expense: 0.4 })
  assert.equal(finance.allCampusSummary(rows, 3).available, false)
  assert.equal(finance.allCampusSummary([...rows, { overview: null }]).available, false)
})

test('服务收入和手工流水即使同 ID 也不冲突，系统生成收入不提供修改操作', () => {
  const manual = { id: 7, sourceType: 'manual_income', direction: 'income' }
  const generated = { id: 7, sourceType: 'service_income', direction: 'income' }
  assert.notEqual(finance.financeRecordKey(manual, 0), finance.financeRecordKey(generated, 0))
  assert.equal(finance.editableFinanceRecord(manual), true)
  assert.equal(finance.editableFinanceRecord(generated), false)
  assert.equal(finance.editableFinanceRecord({ id: 7, detailType: 'payment' }), false)
})

test('经营汇总、每日利润率和成本率使用总收入，后端显式零值优先', () => {
  const sections = [{ campusId: 3, daily: { totalRevenue: 100, totalOtherIncome: 50, totalIncome: 150, totalTeacherCost: 20, totalOperatingExpense: 30, totalExpense: 50, totalProfit: 100 }, items: [{ date: '2026-11-09', revenue: 100, otherIncome: 50, income: 150, teacherCost: 20, operatingExpense: 30, expense: 50, profit: 100 }] }]
  const totals = profit.summarize(sections)
  assert.equal(totals.income, 150)
  assert.equal(totals.otherIncome, 50)
  assert.equal(totals.margin, 100 / 150 * 100)
  assert.equal(profit.aggregateDaily(sections)[0].margin, totals.margin)
  const model = load(page('profit-model.ts'))
  assert.equal(model.profitIncome({ totalIncome: 0, totalRevenue: 100 }), 0)
  assert.equal(model.profitIncome({ totalRevenue: 100, totalOtherIncome: 50 }), 150)
})

test('财务项目编辑保留既有元数据，关闭周期时清除周期参数', () => {
  const { categoryRemark } = load(page('finance-category-editor.tsx'))
  const original = JSON.stringify({ source: 'kept', expenseSetting: { isRecurring: true, cycleMonths: 3, startDate: '2026-01-01' } })
  assert.deepEqual(JSON.parse(categoryRemark(original, { isRecurring: false })), { source: 'kept', expenseSetting: { isRecurring: false, cycleMonths: 0, startDate: '' } })
})

test('销售菜单按当前校区授权，切换校区后保留教师入口并收起客源和营销', () => {
  const user = { role: 'coach', leadCampusIds: [3], isSubstituteTeacher: true }
  assert.equal(access.canViewCampusSalesMenus(user, 3), true)
  assert.equal(access.canViewCampusSalesMenus(user, 4), false)
  assert.ok(nav.navForUser(user, null, 3).some((row) => row.path === '/marketing'))
  assert.ok(!nav.navForUser(user, null, 4).some((row) => ['/leads', '/marketing'].includes(row.path)))
  assert.ok(nav.navForUser(user, null, 4).some((row) => row.path === '/schedule'))
})

test('多卡中仍有权益不能标为整体转出，精简卡缺少余额时不当作零', () => {
  const transferred = { fullyTransferred: true, cardCategory: 'HOURS' }
  assert.equal(entitlement.hasOnlyTransferredRights([transferred, { cardCategory: 'HOURS' }]), false)
  assert.equal(entitlement.hasOnlyTransferredRights([transferred, { cardCategory: 'PERIOD', validEndDate: '2026-12-01' }], '2026-11-09'), false)
  assert.equal(entitlement.hasOnlyTransferredRights([transferred, { cardCategory: 'HOURS', remainingHours: 0 }]), true)
})

test('已退费卡阻止打卡与转校，允许归档，其他卡有效期不能补到当前卡', () => {
  const card = { id: 1, cardCategory: 'PERIOD', fullyRefunded: true, validEndDate: '2026-12-01' }
  const student = { id: 1, name: '测试', status: 1, cards: [card] }
  assert.equal(domain.checkInBlockReason(student, card), '该卡已退费，不能打卡')
  assert.equal(domain.checkInCardEligible(card, student, false), false)
  assert.equal(domain.canArchiveStudent(student), true)
  const multi = { ...student, periodValidEndDate: '2026-12-01', cards: [{ id: 1 }, { id: 2 }] }
  assert.equal(domain.checkInBlockReason(multi, { id: 1, cardCategory: 'PERIOD' }), '时段卡未生效，不能打卡')
  assert.equal(entitlement.periodFullyRefunded({ id: 1 }, [{ id: 1, studentCardId: 1, type: 'new', amount: 100, supplements: [{ id: 2, type: 'refund', amount: 100 }] }]), true)
  assert.equal(entitlement.periodFullyRefunded({ id: 2 }, [{ id: 1, studentCardId: 1, type: 'refund', amount: 100 }]), false)
  const transfer = load(page('student-campus-transfer.tsx'))
  assert.equal(transfer.periodTransferable({ id: 1, cardCategory: 'STORED_VALUE', fullyRefunded: true }, []), false)
  const ledger = [{ id: 1, type: 'refund', amount: 100 }, { id: 2, studentCardId: 2, type: 'new', amount: 100, validEndDate: '2026-12-01' }]
  assert.equal(transfer.periodTransferable({ id: 2, cardCategory: 'PERIOD' }, ledger, false), true, '多卡旧无归属退费不能抵消另张卡的有效批次')
})
