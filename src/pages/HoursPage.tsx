import { Button, Input, Popconfirm, Select, Table, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson } from '../api/biz'
import { BusinessDateRangePicker } from '../components/BusinessDatePicker'
import { EmptyState, NeedCampus, PageHead, money, monthKey, periodChoices, type PeriodOption, shiftPeriod, tell, todayIso, useShell } from './kit'

interface HoursResult {
  month?: string
  rangeLabel?: string
  cycleLabel?: string
  periodOptions?: PeriodOption[]
  summaryHours?: number
  summaryAmount?: number
  summaryTeacherCount?: number
  courseOptions?: string[]
  serviceOptions?: string[]
  teacherOptions?: string[]
  summaryTrialHours?: number
  summaryServiceHours?: number
  summaryServiceAmount?: number
  records?: Array<Record<string, unknown>>
  total?: number
}

interface CampusHours {
  studentCount?: number
  activeStudentCount?: number
  totalHours?: number
  consumedHours?: number
  regularHours?: number
  bonusHours?: number
  consumedRegularHours?: number
  consumedBonusHours?: number
  remainingRegularHours?: number
  remainingBonusHours?: number
}

export function HoursPage() {
  const shell = useShell()
  const [search] = useSearchParams()
  const jumpMode = search.get('timeMode')
  const [mode, setMode] = useState(jumpMode === 'custom_range' || jumpMode === 'salary_cycle' || jumpMode === 'natural_month' || jumpMode === 'this_week' || jumpMode === 'today' ? jumpMode : 'today')
  const [month, setMonth] = useState(search.get('month') || monthKey())
  const [startDate, setStartDate] = useState(search.get('startDate') || monthStart())
  const [endDate, setEndDate] = useState(search.get('endDate') || todayIso())
  const [course, setCourse] = useState('全部')
  const [teacher, setTeacher] = useState(search.get('teacherName') || '全部')
  const appliedQuery = useRef(search.toString())
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HoursResult | null>(null)
  const [campusHours, setCampusHours] = useState<CampusHours | null>(null)
  const role = String(shell.user?.role || '').trim().toLowerCase()
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const canManage = role === 'owner' || role === 'admin' || (shell.user?.id != null && currentOrg?.ownerId === shell.user.id) || (shell.user?.campusAdminCampusIds || []).includes(Number(shell.campusId))

  async function load(nextPage = page, nextKeyword = keyword) {
    if (!shell.currentOrgId) return
    if (mode === 'custom_range' && startDate && endDate && startDate > endDate) {
      message.warning('开始日期不能晚于结束日期')
      return
    }
    const query = hoursQuery(mode, month, startDate, endDate)
    const result = await getJson<HoursResult>('/salary/class-hours', {
      campusId: shell.campusId,
      courseName: course === '全部' ? undefined : course,
      teacherNames: !canManage || teacher === '全部' ? undefined : teacher,
      keyword: nextKeyword.trim() || undefined,
      page: nextPage,
      pageSize: 20,
      ...query,
    })
    setData(result)
    if ((mode === 'salary_cycle' || mode === 'natural_month') && result?.month && result.month !== month) setMonth(result.month)
    if (canManage && shell.campusId) {
      setCampusHours(await getJson<CampusHours>('/students/campus-summary', { campusId: shell.campusId, includeDetail: true }).catch(() => null))
    } else {
      setCampusHours(null)
    }
  }

  useEffect(() => {
    const key = search.toString()
    if (key === appliedQuery.current) return
    appliedQuery.current = key
    const nextMode = search.get('timeMode')
    if (nextMode === 'custom_range' || nextMode === 'salary_cycle' || nextMode === 'natural_month' || nextMode === 'this_week' || nextMode === 'today') setMode(nextMode)
    const nextMonth = search.get('month')
    if (nextMonth) setMonth(nextMonth)
    const nextStart = search.get('startDate')
    if (nextStart) setStartDate(nextStart)
    const nextEnd = search.get('endDate')
    if (nextEnd) setEndDate(nextEnd)
    const teacherName = search.get('teacherName')
    if (teacherName) setTeacher(teacherName)
  }, [search])

  useEffect(() => {
    load(1).catch((error) => message.error(tell(error, '课时加载失败')))
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.campusId, shell.currentOrgId, month, course, teacher, mode, startDate, endDate, canManage])

  if (!shell.currentOrgId) {
    return <EmptyState title="还没有机构" text="课时管理需要先选择或创建机构。" />
  }

  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead title={canManage ? '课时管理' : '我的课时'} extra={data?.rangeLabel || '按校区查看上课记录'} />
      <section className="work-card">
        {campusHours ? (
          <div className="hours-campus-panel">
            <div className="hours-campus-panel-head">
              <strong>校区课时概览</strong>
              <span>当前校区学员课时汇总</span>
            </div>
            <div className="hours-campus-grid">
              <span><small>在学学员</small><strong>{campusHours.activeStudentCount || campusHours.studentCount || 0}</strong></span>
              <span><small>总课时</small><strong>{money(campusHours.totalHours)}</strong></span>
              <span><small>已销课时</small><strong>{money(campusHours.consumedHours)}</strong></span>
              <span><small>总正课</small><strong>{money(campusHours.regularHours)}</strong></span>
              <span><small>总赠课</small><strong>{money(campusHours.bonusHours)}</strong></span>
              <span><small>已上正课</small><strong>{money(campusHours.consumedRegularHours)}</strong></span>
              <span><small>已上赠课</small><strong>{money(campusHours.consumedBonusHours)}</strong></span>
              <span><small>剩余正课</small><strong>{money(campusHours.remainingRegularHours)}</strong></span>
              <span><small>剩余赠课</small><strong>{money(campusHours.remainingBonusHours)}</strong></span>
            </div>
          </div>
        ) : null}
        <div className="hours-overview-bar">
          <div className="stat-line hours-overview-stats">
            <span><small>销课课时</small><strong>{money(data?.summaryHours)}</strong></span>
            <span><small>体验课时</small><strong>{money(data?.summaryTrialHours)}</strong></span>
            <span><small>销课金额</small><strong>{money(data?.summaryAmount)}</strong></span>
            <span><small>服务金额</small><strong>{money(data?.summaryServiceAmount)}</strong></span>
            <span><small>授课老师</small><strong>{data?.summaryTeacherCount || 0}</strong></span>
          </div>
          <div className="hours-overview-divider" />
          <div className="work-toolbar hours-overview-filters">
          <Select
            style={{ width: 140 }}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'today', label: '今天' },
              { value: 'this_week', label: '本周' },
              { value: 'salary_cycle', label: '记薪周期' },
              { value: 'natural_month', label: '自然月' },
              { value: 'custom_range', label: '自定义' },
            ]}
          />
          {mode === 'salary_cycle' || mode === 'natural_month' ? (
            <>
              <Button onClick={() => setMonth(shiftPeriod(data?.periodOptions, month, -1))}>上一期</Button>
              <Select
                style={{ width: 280 }}
                value={month}
                onChange={setMonth}
                options={periodChoices(data?.periodOptions, month, mode)}
              />
              <Button onClick={() => setMonth(shiftPeriod(data?.periodOptions, month, 1))}>下一期</Button>
            </>
          ) : null}
          {mode === 'custom_range' ? (
            <BusinessDateRangePicker
              value={[startDate, endDate]}
              onChange={([start, end]) => { setStartDate(start); setEndDate(end) }}
              style={{ width: 286 }}
            />
          ) : null}
          <Select
            style={{ width: 180 }}
            value={course}
            onChange={setCourse}
            options={[
              { value: '全部', label: '全部课程和服务' },
              ...((data?.courseOptions || []).length ? [{ label: '课程', options: (data?.courseOptions || []).map((item) => ({ value: item, label: item })) }] : []),
              ...((data?.serviceOptions || []).length ? [{ label: '服务', options: (data?.serviceOptions || []).filter((item) => !(data?.courseOptions || []).includes(item)).map((item) => ({ value: item, label: item })) }] : []),
            ]}
          />
          {canManage ? (
            <Select
              style={{ width: 160 }}
              value={teacher}
              onChange={setTeacher}
              options={['全部', ...(data?.teacherOptions || [])].map((item) => ({ value: item, label: item === '全部' ? '全部老师' : item }))}
            />
          ) : null}
          <Input.Search allowClear placeholder="搜索学员" style={{ width: 200 }} onSearch={(value) => { setKeyword(value); setPage(1); load(1, value).catch((error) => message.error(tell(error, '课时加载失败'))) }} />
          </div>
        </div>
        <Table
          rowKey={(row) => String(row.recordId || row.sortTime)}
          dataSource={data?.records || []}
          pagination={{ current: page, pageSize: 20, total: data?.total || 0, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
          columns={[
            { title: '日期', render: (_: unknown, row: Record<string, unknown>) => hoursDateText(row) },
            { title: '时间', render: (_: unknown, row: Record<string, unknown>) => hoursClockText(row.scheduleTime) },
            { title: '老师', render: (_: unknown, row: Record<string, unknown>) => hoursTeacherText(row) },
            { title: '学员', render: (_: unknown, row: Record<string, unknown>) => hoursStudentText(row) },
            { title: '课程', render: (_: unknown, row: Record<string, unknown>) => hoursCourseText(row) },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => hoursTypeText(row) },
            { title: '打卡', render: (_: unknown, row: Record<string, unknown>) => row.recordType !== 'consumption' ? '' : Number(row.autoCheckIn) === 1 ? '自动' : '手动' },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => hoursText(row.hours) },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => row.amount == null ? '' : money(row.amount) },
            { title: '备注', dataIndex: 'remark' },
            {
              title: '',
              render: (_: unknown, row: Record<string, unknown>) => canManage && row.recordType === 'consumption' && row.recordId ? (
                <Popconfirm title="删除课时记录" description={`确定删除${hoursStudentText(row)}的这条上课记录吗？删除后将返还 ${hoursText(row.hours)}。`} onConfirm={async () => {
                  try {
                    await delJson(`/consumptions/${row.recordId}`)
                    message.success('已删除')
                    await load(page)
                  } catch (error) {
                    message.error(tell(error, '删除失败'))
                  }
                }}>
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              ) : null,
            },
          ]}
        />
      </section>
    </NeedCampus>
  )
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function isoDateText(value: unknown): string {
  const match = String(value || '').trim().match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function weekdayText(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  return WEEKDAY_LABELS[parsed.getDay()] || ''
}

function hoursDateText(row: Record<string, unknown>): string {
  const date = isoDateText(row.scheduleTime) || isoDateText(row.date)
  if (!date) return String(row.date || '')
  const weekday = weekdayText(date)
  return weekday ? `${date} ${weekday}` : date
}

function hoursClockText(value: unknown): string {
  const text = String(value || '').trim()
  const match = text.match(/(\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?/)
  if (!match) return ''
  if (match[1] === '23:59' && match[2] === '59') return ''
  return match[1]
}

function hoursStudentText(row: Record<string, unknown>): string {
  return String(row.studentDisplayName || '').trim() || '未命名学员'
}

function hoursServiceRecord(row: Record<string, unknown>): boolean {
  return row.serviceRecord === true || String(row.courseType || '').trim().startsWith('service:')
}

function hoursServiceText(row: Record<string, unknown>): string {
  const raw = String(row.courseTypeLabel || row.courseName || '').trim() || '服务消费'
  if (raw.startsWith('service:')) return '服务消费'
  return raw.endsWith('服务') ? raw : `${raw}服务`
}

function hoursTeacherText(row: Record<string, unknown>): string {
  if (hoursServiceRecord(row)) return hoursServiceText(row)
  return String(row.teacherName || '').trim() || '未分配老师'
}

function hoursCourseText(row: Record<string, unknown>): string {
  if (hoursServiceRecord(row)) return ''
  const courseText = String(row.courseName || '').trim()
  const studentText = String(row.studentDisplayName || '').trim()
  if (courseText && courseText !== studentText) return courseText
  const rawLabel = String(row.courseTypeLabel || '').trim()
  const label = rawLabel === 'one_to_one' ? '一对一' : rawLabel
  if (label && !/^\d+$/.test(label)) return label
  if (row.recordType === 'preset_schedule') return String(row.recordTypeLabel || '').trim() || '体验课'
  return ''
}

function hoursText(value: unknown): string {
  const numeric = Number(value || 0)
  if (Number.isNaN(numeric)) return '0h'
  return `${numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}h`
}

function hoursTypeText(row: Record<string, unknown>): string {
  const labels = Array.isArray(row.cardTypeLabels) && row.cardTypeLabels.length
    ? row.cardTypeLabels.map(String).join('、')
    : String(row.cardTypeLabel || '')
  if (row.recordType === 'preset_schedule') return labels ? `体验课 · ${labels}` : '体验课'
  return labels
}

function monthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`
}

function hoursQuery(mode: string, month: string, startDate: string, endDate: string): Record<string, string> {
  if (mode === 'today') {
    const day = todayIso()
    return { timeMode: 'custom_range', startDate: day, endDate: day }
  }
  if (mode === 'this_week') {
    const date = new Date()
    const weekday = date.getDay() || 7
    date.setDate(date.getDate() - weekday + 1)
    const start = localIso(date)
    date.setDate(date.getDate() + 6)
    return { timeMode: 'custom_range', startDate: start, endDate: localIso(date) }
  }
  if (mode === 'custom_range') {
    return { timeMode: 'custom_range', startDate, endDate }
  }
  return { timeMode: mode, month }
}
