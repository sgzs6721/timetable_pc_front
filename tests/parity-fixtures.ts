export const requests: Array<{ method: string; path: string; data: unknown }> = []
const courses = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `课程${String(i + 1).padStart(2, '0')}`, shortName: `课${i + 1}`, oneToOne: i < 5, unitPrice: 120, coachIds: [1], coachNamesText: '陈老师', studentCount: 0 }))
export const targets = [
  { targetType: 'service', targetId: 90, name: '场地使用', pricingCourseType: 'VENUE', serviceOptions: [] },
  { targetType: 'student', targetId: 11, name: '陈小明', cardOptions: [{ id: 111, cardCategory: 'STORED_VALUE', remainingAmount: 320, courseCategory: false, available: true }], serviceOptions: [{ courseType: 'VENUE', name: '场地使用', unitPrice: 40, studentCardIds: [111] }] },
  { targetType: 'student', targetId: 12, name: '李思雨', cardOptions: [{ id: 112, cardCategory: 'PERIOD', periodType: 'MONTH', validStartDate: '2026-11-01', validEndDate: '2026-11-30', courseCategory: false, available: true }], serviceOptions: [{ courseType: 'VENUE', name: '场地使用', unitPrice: 0, studentCardIds: [112] }] },
]
export const serviceSchedules = [
  { id: 101, timetableId: 9, campusId: 1, targetType: 'student', targetId: 11, courseName: '陈小明', displayName: '陈小明', pricingCourseType: 'VENUE#card:111', startTime: '09:00', endTime: '10:00', dayOfWeek: 1, scheduleDate: '2026-11-09' },
  { id: 102, timetableId: 9, campusId: 1, targetType: 'student', targetId: 12, courseName: '李思雨', displayName: '李思雨', pricingCourseType: 'VENUE#card:112', startTime: '09:30', endTime: '10:30', dayOfWeek: 1, scheduleDate: '2026-11-09' },
]
let categories = [
  { id: 1, name: '场地租金', direction: 'expense', enabled: 1, remark: JSON.stringify({ expenseSetting: { isRecurring: true, cycleMonths: 1, startDate: '2026-11-01' } }) },
  { id: 2, name: '其他收入', direction: 'income', enabled: 1 },
]
const overview = { income: 12500, paidExpense: 3000, pendingExpense: 2000, expectedExpense: 5000, incomeDetails: [{ id: 51, detailType: 'service', title: '场地使用', subtitle: '服务销课', amount: 40, bizDate: '2026-11-09' }], paidExpenseDetails: [], pendingExpenseDetails: [] }
export async function getJson(path: string, query: Record<string, unknown> = {}): Promise<any> {
  requests.push({ method: 'GET', path, data: query })
  await new Promise((resolve) => setTimeout(resolve, query.keyword === '课程01' ? 800 : 50))
  if (path === '/student-groups/page') {
    const rows = courses.filter((row) => (!query.keyword || row.name.includes(String(query.keyword))) && (!query.type || (query.type === 'oneToOne' ? row.oneToOne : !row.oneToOne)))
    const offset = Number(query.offset || 0)
    return { records: rows.slice(offset, offset + 20), total: rows.length, offset, nextOffset: offset + 20, hasMore: offset + 20 < rows.length, pageSize: 20, campusCourseCount: 45, campusOneToOneCourseCount: 5, campusOtherCourseCount: 40 }
  }
  if (path === '/student-groups/list') return courses
  if (path.startsWith('/campus-teacher/campus/')) return [{ id: 1, displayName: '陈老师', status: 1 }]
  if (/^\/campus\/\d+$/.test(path)) return { visibleInList: true }
  if (path === '/schedules/cell-target-options') return targets
  if (path.startsWith('/campus-staff/')) return { trialLessonConfig: '{}' }
  if (path === '/finance/time-options') return { month: '2026-11', periodOptions: [{ value: '2026-11', label: '2026年11月' }] }
  if (path === '/finance/overview') return overview
  if (path === '/finance/overview/by-campus') return [{ campusId: 1, campusName: '中心校区', overview }, { campusId: 2, campusName: '滨江校区', overview: { ...overview, income: 7500, paidExpense: 1000, pendingExpense: 1000, expectedExpense: 2000 } }]
  if (path === '/finance/categories') return categories
  if (path === '/finance/recurring-plans') return []
  if (path === '/finance/records') return [{ id: 51, sourceType: 'manual_income', categoryId: 2, categoryName: '其他收入', direction: 'income', amount: 150, bizDate: '2026-11-09' }]
  throw new Error(`模拟数据未定义接口：${path}`)
}
export async function putJson(path: string, data: any) {
  requests.push({ method: 'PUT', path, data })
  if (path.startsWith('/finance/categories/')) categories = categories.map((row) => row.id === Number(path.split('/').pop()) ? { ...row, ...data } : row)
  return data
}
export async function postJson(path: string, data: unknown) { requests.push({ method: 'POST', path, data }); return data }
export async function delJson(path: string, data?: unknown) { requests.push({ method: 'DELETE', path, data }); return null }
export async function downloadFile() { throw new Error('模拟预览不提供下载') }
