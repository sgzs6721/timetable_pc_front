import { CalendarOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Drawer, Select, Spin, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { BusinessDateRangePicker } from '../components/BusinessDatePicker'
import { ProfitDashboard } from './profit-dashboard'
import { detailTitle, ProfitDetailPanel } from './profit-detail-panel'
import {
  DETAIL_ENDPOINTS,
  visibleDailyItems,
  type CampusProfitResponse,
  type DetailMetricKey,
  type FinanceTimeOptions,
  type ProfitCampusSection,
  type ProfitDailyData,
  type ProfitDetailRequest,
} from './profit-model'
import { monthKey, NeedOrg, PageHead, periodChoices, tell, todayIso, useShell } from './kit'

type TimeMode = 'today' | 'this_week' | 'salary_cycle' | 'natural_month' | 'custom_range'

const TIME_MODES: Array<{ value: TimeMode; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'this_week', label: '本周' },
  { value: 'salary_cycle', label: '记薪周期' },
  { value: 'natural_month', label: '自然月' },
  { value: 'custom_range', label: '自定义' },
]

export function ProfitPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const organizationManager = isOrganizationManager(shell.user, currentOrg)
  const campusIdsKey = shell.campuses.map((item) => item.id).join(',')
  const [campusChoice, setCampusChoice] = useState<number | null>(null)
  const defaultCampusId = organizationManager ? 0 : Number(shell.campusId || shell.campuses[0]?.id || 0)
  const selectedCampusId = campusChoice !== null
    && (campusChoice === 0 ? organizationManager : shell.campuses.some((item) => item.id === campusChoice))
    ? campusChoice
    : defaultCampusId

  const [timeMode, setTimeMode] = useState<TimeMode>('natural_month')
  const [month, setMonth] = useState(monthKey())
  const [periods, setPeriods] = useState<FinanceTimeOptions['periodOptions']>([])
  const [customStart, setCustomStart] = useState(todayIso())
  const [customEnd, setCustomEnd] = useState(todayIso())
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState(todayIso())
  const [rangeLabel, setRangeLabel] = useState('')
  const [previousRangeLabel, setPreviousRangeLabel] = useState('')
  const [sections, setSections] = useState<ProfitCampusSection[]>([])
  const [previousSections, setPreviousSections] = useState<ProfitCampusSection[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [drawerRequest, setDrawerRequest] = useState<ProfitDetailRequest | null>(null)
  const [drawerData, setDrawerData] = useState<Record<string, unknown> | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  const pageRequestVersion = useRef(0)
  const drawerRequestVersion = useRef(0)
  const detailCache = useRef(new Map<string, Record<string, unknown>>())

  useEffect(() => setCampusChoice(null), [shell.currentOrgId])

  useEffect(() => {
    if (selectedCampusId === 0 && timeMode === 'salary_cycle') setTimeMode('natural_month')
  }, [selectedCampusId, timeMode])

  useEffect(() => {
    const version = ++pageRequestVersion.current
    if (!shell.currentOrgId || !campusIdsKey || !shell.campuses.length) {
      setSections([])
      setPreviousSections([])
      setLoading(false)
      closeDetail()
      return
    }

    const effectiveMode: TimeMode = selectedCampusId === 0 && timeMode === 'salary_cycle' ? 'natural_month' : timeMode
    const timeQuery = {
      campusId: selectedCampusId || undefined,
      timeMode: effectiveMode,
      month: effectiveMode === 'salary_cycle' || effectiveMode === 'natural_month' ? month : undefined,
      startDate: effectiveMode === 'custom_range' ? customStart : undefined,
      endDate: effectiveMode === 'custom_range' ? customEnd : undefined,
    }
    const campusIds = shell.campuses.map((item) => item.id).join(',')

    setLoading(true)
    getJson<FinanceTimeOptions>('/finance/time-options', timeQuery)
      .then(async (options) => {
        const nextStart = String(options.startDate || customStart || todayIso()).slice(0, 10)
        const nextEnd = String(options.endDate || customEnd || todayIso()).slice(0, 10)
        const previous = previousDateRange(nextStart, nextEnd, effectiveMode)
        const [rows, priorRows] = await Promise.all([
          getJson<CampusProfitResponse[]>('/finance/profit/daily/by-campus', {
            campusIds,
            startDate: nextStart,
            endDate: nextEnd,
          }),
          getJson<CampusProfitResponse[]>('/finance/profit/daily/by-campus', {
            campusIds,
            startDate: previous.start,
            endDate: previous.end,
          }).catch(() => []),
        ])
        if (version !== pageRequestVersion.current) return

        setStartDate(nextStart)
        setEndDate(nextEnd)
        setRangeLabel(String(options.rangeLabel || options.cycleLabel || '').trim())
        setPreviousRangeLabel(formatRange(previous.start, previous.end))
        setPeriods(options.periodOptions || [])
        if (options.month && options.month !== month) setMonth(options.month)
        setSections(buildSections(shell.campuses, rows || []))
        setPreviousSections(buildSections(shell.campuses, priorRows || []))
        detailCache.current.clear()
      })
      .catch((error) => {
        if (version !== pageRequestVersion.current) return
        setSections([])
        setPreviousSections([])
        message.error(tell(error, '经营分析加载失败'))
      })
      .finally(() => {
        if (version === pageRequestVersion.current) setLoading(false)
      })
  }, [campusIdsKey, customEnd, customStart, month, reloadToken, selectedCampusId, shell.currentOrgId, timeMode])

  const availableModes = selectedCampusId === 0
    ? TIME_MODES.filter((item) => item.value !== 'salary_cycle')
    : TIME_MODES
  const campusOptions = [
    ...(organizationManager ? [{ value: 0, label: '全部校区' }] : []),
    ...shell.campuses.map((item) => ({ value: item.id, label: item.name || '未命名校区' })),
  ]
  const scopedSections = selectedCampusId > 0
    ? sections.filter((item) => item.campusId === selectedCampusId)
    : sections
  const selectedPeriodLabel = rangeLabel || formatRange(startDate, endDate)

  function closeDetail() {
    drawerRequestVersion.current += 1
    setDrawerRequest(null)
    setDrawerData(null)
    setDrawerLoading(false)
  }

  function changeCampus(value: number) {
    setCampusChoice(value)
    if (value === 0 && timeMode === 'salary_cycle') setTimeMode('natural_month')
    closeDetail()
  }

  function changeTimeMode(value: TimeMode) {
    if (value === 'custom_range') {
      const today = todayIso()
      setCustomStart(today)
      setCustomEnd(today)
    }
    setTimeMode(value)
    closeDetail()
  }

  async function requestDetail(request: ProfitDetailRequest): Promise<Record<string, unknown>> {
    const key = detailKey(request)
    const cached = detailCache.current.get(key)
    if (cached) return cached
    const data = await getJson<Record<string, unknown>>(DETAIL_ENDPOINTS[request.metric], {
      campusId: request.campusId,
      startDate: request.startDate,
      endDate: request.endDate,
    })
    detailCache.current.set(key, data)
    return data
  }

  async function openDetail(
    metric: DetailMetricKey,
    section: ProfitCampusSection,
    detailStart: string,
    detailEnd: string,
  ) {
    const request: ProfitDetailRequest = {
      metric,
      campusId: section.campusId,
      campusName: section.campusName,
      startDate: detailStart || startDate,
      endDate: detailEnd || endDate,
    }
    const version = ++drawerRequestVersion.current
    setDrawerRequest(request)
    setDrawerData(null)
    setDrawerLoading(true)
    try {
      const data = await requestDetail(request)
      if (version === drawerRequestVersion.current) setDrawerData(data)
    } catch (error) {
      if (version === drawerRequestVersion.current) message.error(tell(error, '经营明细加载失败'))
    } finally {
      if (version === drawerRequestVersion.current) setDrawerLoading(false)
    }
  }

  return (
    <NeedOrg orgId={shell.currentOrgId}>
      <main className="profit-analysis-page">
        <PageHead title="经营分析" extra="从收入、成本、利润、趋势和校区对比看清经营质量。" />

        <section className="profit-filter-panel" aria-label="经营分析筛选">
          <div className="profit-filter-field profit-filter-campus">
            <span className="profit-filter-label">分析范围</span>
            <Select value={selectedCampusId} options={campusOptions} onChange={changeCampus} />
          </div>
          <i className="profit-filter-divider" />
          <div className="profit-filter-field profit-filter-mode">
            <span className="profit-filter-label">统计方式</span>
            <Select value={timeMode} options={availableModes} onChange={changeTimeMode} />
          </div>
          <div className="profit-filter-field profit-filter-period">
            <span className="profit-filter-label">统计周期</span>
            {timeMode === 'salary_cycle' || timeMode === 'natural_month' ? (
              <Select value={month} options={periodChoices(periods, month, timeMode)} onChange={(value) => { setMonth(value); closeDetail() }} />
            ) : timeMode === 'custom_range' ? (
              <BusinessDateRangePicker
                value={[customStart, customEnd]}
                allowClear={false}
                onChange={([nextStart, nextEnd]) => {
                  if (!nextStart || !nextEnd || nextStart > nextEnd) return
                  setCustomStart(nextStart)
                  setCustomEnd(nextEnd)
                  closeDetail()
                }}
              />
            ) : (
              <div className="profit-filter-range"><CalendarOutlined /><span>{selectedPeriodLabel}</span></div>
            )}
          </div>
          <Button className="profit-filter-refresh" icon={<ReloadOutlined />} onClick={() => { closeDetail(); setReloadToken((value) => value + 1) }}>刷新</Button>
        </section>

        <Spin spinning={loading}>
          {sections.length ? (
            <ProfitDashboard
              sections={scopedSections}
              comparisonSections={sections}
              previousSections={previousSections}
              selectedCampusId={selectedCampusId}
              periodLabel={selectedPeriodLabel}
              previousPeriodLabel={previousRangeLabel}
              onCampusSelect={changeCampus}
              onDetail={(metric, section, detailStart, detailEnd) => void openDetail(metric, section, detailStart, detailEnd)}
            />
          ) : !loading ? <div className="profit-empty">当前统计范围暂无经营数据</div> : null}
        </Spin>

        <Drawer
          className="profit-detail-drawer"
          open={!!drawerRequest}
          width="min(900px, 94vw)"
          destroyOnHidden
          title={drawerRequest ? (
            <div><strong>{detailTitle(drawerRequest)}</strong><small>{formatRange(drawerRequest.startDate, drawerRequest.endDate)}</small></div>
          ) : null}
          onClose={closeDetail}
        >
          {drawerRequest ? (
            <ProfitDetailPanel
              request={drawerRequest}
              data={drawerData}
              loading={drawerLoading}
              onStudent={(id) => navigate(`/students?studentId=${id}`)}
            />
          ) : null}
        </Drawer>
      </main>
    </NeedOrg>
  )
}

function buildSections(
  campuses: Array<{ id: number; name?: string }>,
  rows: CampusProfitResponse[],
): ProfitCampusSection[] {
  const dailyByCampus = new Map<number, ProfitDailyData>()
  rows.forEach((row) => {
    const campusId = Number(row.campusId || 0)
    if (campusId > 0) dailyByCampus.set(campusId, row.daily || {})
  })
  return campuses.map((campus) => {
    const daily = dailyByCampus.get(campus.id) || {}
    return {
      campusId: campus.id,
      campusName: campus.name || '未命名校区',
      daily,
      items: visibleDailyItems(daily.items),
    }
  })
}

function previousDateRange(start: string, end: string, mode: TimeMode): { start: string; end: string } {
  if (mode === 'natural_month') {
    const previousEnd = shiftIsoDate(start, -1)
    return { start: `${previousEnd.slice(0, 7)}-01`, end: previousEnd }
  }
  if (mode === 'salary_cycle') {
    return { start: shiftIsoMonth(start, -1), end: shiftIsoMonth(end, -1) }
  }
  const days = daysBetween(start, end) + 1
  return {
    start: shiftIsoDate(start, -days),
    end: shiftIsoDate(start, -1),
  }
}

function shiftIsoMonth(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1))
  const lastDay = new Date(nextMonth.getTime() - 86400000).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10)
}

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  return Math.max(0, Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000))
}

function detailKey(request: ProfitDetailRequest): string {
  return [request.metric, request.campusId, request.startDate, request.endDate].join(':')
}

function formatRange(start: string, end: string): string {
  if (!start || !end) return ''
  return start === end ? start : `${start} ~ ${end}`
}

function isOrganizationManager(
  user: { id?: number; role?: string } | null,
  organization: { ownerId?: number } | null,
): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(organization?.ownerId || 0)
  return role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId)
}
