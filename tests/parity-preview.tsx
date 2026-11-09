import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Button, Space, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { CoursesPage } from '../src/pages/CoursesPage'
import { FinancePage } from '../src/pages/FinancePage'
import { ServiceScheduleLayer } from '../src/pages/schedule-service-layer'
import { CellDialog, type CellDialogProps } from '../src/pages/schedule-cell-dialog'
import { ProfitDashboard } from '../src/pages/profit-dashboard'
import { requests, serviceSchedules } from './parity-fixtures'
import 'antd/dist/reset.css'
import '../src/styles/global.css'
import '../src/styles/work.css'
import '../src/styles/finance-settings.css'
import '../src/styles/finance-comparison.css'
import '../src/styles/finance-overview-filter.css'
import '../src/styles/design.css'
import '../src/styles/staff.css'
import '../src/styles/page-styles.css'
import '../src/styles/ui-consistency.css'
import '../src/styles/calendar.css'
import '../src/styles/dialogs.css'
import '../src/styles/buttons.css'
import '../src/pages/schedule-service.css'

const campuses = [{ id: 1, name: '中心校区' }, { id: 2, name: '滨江校区' }]
const shell = { user: { id: 1, role: 'owner', subscriptionStatus: 'active' }, campusId: 1, currentOrgId: 1, campuses, organizations: [{ id: 1, ownerId: 1, name: '示例机构' }], setPageDescription() {} }
const slots = [{ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' }, { start: '11:00', end: '12:00' }]
const dailyItem = { date: '2026-11-09', revenue: 10000, otherIncome: 2500, income: 12500, teacherCost: 3000, operatingExpense: 2000, expense: 5000, profit: 7500 }
const profit = [{ campusId: 1, campusName: '中心校区', daily: { startDate: '2026-11-09', endDate: '2026-11-09', totalRevenue: 10000, totalOtherIncome: 2500, totalIncome: 12500, totalTeacherCost: 3000, totalOperatingExpense: 2000, totalExpense: 5000, totalProfit: 7500 }, items: [dailyItem] }]
function ServicePreview() {
  const [cell, setCell] = useState<CellDialogProps['cell']>(null)
  return <section className="work-card"><h2>中心校区 · 场地服务</h2><p>点击重叠预约查看合并名单，编辑仍对应原始预约。</p><Button onClick={() => setCell({ day: 1, date: '2026-11-09', start: '09:00', end: '10:00', slotStart: '09:00', slotEnd: '10:00' })}>新增服务预约</Button><div style={{ position: 'relative', height: 360, maxWidth: 400, marginTop: 24, background: '#f1f4fb' }}><ServiceScheduleLayer schedules={serviceSchedules as any} slots={slots} date="2026-11-09" day={1} timetableId={9} templateMode={false} canEdit onOpen={setCell} /></div>
    <CellDialog cell={cell} campusId={1} campusName="中心校区" campuses={campuses} schedulableCampuses={campuses} ownerName="场地服务" serviceTimetable allowTrial={false} batchCount={0} timetableId={9} weekStart="2026-11-09" dayLessons={serviceSchedules as any} dayStart="09:00" dayEnd="12:00" onClose={() => setCell(null)} onSave={async (data) => { requests.push({ method: 'SAVE_SERVICE', path: 'preview-only', data }); message.success('模拟预约已保存'); setCell(null) }} onLeave={async () => { setCell(null) }} onRestore={async () => { setCell(null) }} onDelete={async () => { setCell(null) }} onBeginMove={() => {}} onBeginCopy={() => {}} onStudent={async () => null} />
  </section>
}
function Preview() {
  const [page, setPage] = useState('courses')
  const [log, setLog] = useState('')
  return <main style={{ maxWidth: 1400, margin: '24px auto', padding: '0 24px 48px' }}><header style={{ marginBottom: 24 }}><h1>前端同步回归 · 模拟数据</h1><Space>{[['courses', '课程管理'], ['service', '服务课表'], ['finance', '收支管理'], ['profit', '经营数据']].map(([key, label]) => <Button key={key} type={page === key ? 'primary' : 'default'} onClick={() => { setPage(key); setLog('') }}>{label}</Button>)}<Button onClick={() => setLog(JSON.stringify(requests.slice(-8), null, 2))}>查看模拟请求</Button></Space></header>
    {page === 'courses' ? <CoursesPage /> : page === 'service' ? <ServicePreview /> : page === 'finance' ? <FinancePage /> : <ProfitDashboard sections={profit as any} comparisonSections={profit as any} previousSections={[]} selectedCampusId={1} periodLabel="2026年11月" previousPeriodLabel="上月" onCampusSelect={() => {}} onDetail={() => message.info('销课收入明细入口')} />}
    {log ? <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: 24 }} aria-label="模拟请求记录">{log}</pre> : null}
  </main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#315ff4', borderRadius: 10 } }}><MemoryRouter><Routes><Route element={<Outlet context={shell} />}><Route path="*" element={<Preview />} /></Route></Routes></MemoryRouter></ConfigProvider>)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
