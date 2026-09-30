import { Button, Input, Popconfirm, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson } from '../api/biz'
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
  records?: Array<Record<string, unknown>>
  total?: number
}

interface CampusHours {
  studentCount?: number
  activeStudentCount?: number
  consumedHours?: number
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
          <div className="stat-line">
            <span>在学学员<strong>{campusHours.activeStudentCount || campusHours.studentCount || 0}</strong></span>
            <span>已销课时<strong>{money(campusHours.consumedHours)}</strong></span>
            <span>剩余正课<strong>{money(campusHours.remainingRegularHours)}</strong></span>
            <span>剩余赠课<strong>{money(campusHours.remainingBonusHours)}</strong></span>
          </div>
        ) : null}
        <div className="stat-line">
          <span>课时<strong>{money(data?.summaryHours)}</strong></span>
          <span>体验<strong>{money(data?.summaryTrialHours)}</strong></span>
          <span>服务<strong>{money(data?.summaryServiceHours)}</strong></span>
          <span>金额<strong>{money(data?.summaryAmount)}</strong></span>
          <span>老师<strong>{data?.summaryTeacherCount || 0}</strong></span>
        </div>
        <div className="work-toolbar">
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
            <>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </>
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
        <Table
          rowKey={(row) => String(row.recordId || row.sortTime)}
          dataSource={data?.records || []}
          pagination={{ current: page, pageSize: 20, total: data?.total || 0, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
          columns={[
            { title: '日期', dataIndex: 'date' },
            { title: '老师', dataIndex: 'teacherName' },
            { title: '学员', dataIndex: 'studentDisplayName' },
            { title: '课程', dataIndex: 'courseName' },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => hoursTypeText(row) },
            { title: '打卡', render: (_: unknown, row: Record<string, unknown>) => row.recordType !== 'consumption' ? '' : Number(row.autoCheckIn) === 1 ? '自动' : '手动' },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => hoursText(row.hours) },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => row.amount == null ? '' : money(row.amount) },
            { title: '备注', dataIndex: 'remark' },
            {
              title: '',
              render: (_: unknown, row: Record<string, unknown>) => canManage && row.recordType === 'consumption' && row.recordId ? (
                <Popconfirm title="删除课时记录" description={`确定删除${row.studentDisplayName || '该学员'}的这条上课记录吗？删除后将返还 ${hoursText(row.hours)}。`} onConfirm={async () => {
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
