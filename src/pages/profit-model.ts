import type { PeriodOption } from './kit'

export type ProfitMetricKey = 'revenue' | 'teacherCost' | 'operatingExpense' | 'profit'
export type DetailMetricKey = Exclude<ProfitMetricKey, 'profit'>

export interface ProfitDailyItem {
  date: string
  revenue?: number
  teacherCost?: number
  manualExpense?: number
  recurringExpense?: number
  operatingExpense?: number
  profit?: number
}

export interface ProfitDailyData {
  startDate?: string
  endDate?: string
  totalRevenue?: number
  totalTeacherCost?: number
  totalOperatingExpense?: number
  totalProfit?: number
  totalUnallocatedSalaryCost?: number
  items?: ProfitDailyItem[]
}

export interface CampusProfitResponse {
  campusId?: number
  daily?: ProfitDailyData | null
}

export interface ProfitCampusSection {
  campusId: number
  campusName: string
  daily: ProfitDailyData
  items: ProfitDailyItem[]
}

export interface FinanceTimeOptions {
  timeMode?: string
  month?: string
  startDate?: string
  endDate?: string
  rangeLabel?: string
  cycleLabel?: string
  periodOptions?: PeriodOption[]
}

export interface ProfitDetailRequest {
  metric: DetailMetricKey
  campusId: number
  campusName: string
  startDate: string
  endDate: string
}

export interface ProfitChartGroup {
  id: string
  label: string
  sub?: string
  values: Record<ProfitMetricKey, number>
}

export const PROFIT_METRICS: Array<{ key: ProfitMetricKey; label: string }> = [
  { key: 'revenue', label: '销课收入' },
  { key: 'teacherCost', label: '课时成本' },
  { key: 'operatingExpense', label: '经营支出' },
  { key: 'profit', label: '利润' },
]

export const DETAIL_ENDPOINTS: Record<DetailMetricKey, string> = {
  revenue: '/finance/profit/revenue-detail',
  teacherCost: '/finance/profit/teacher-cost-detail',
  operatingExpense: '/finance/profit/operating-expense-detail',
}

export function metricAmount(data: ProfitDailyData | null | undefined, metric: ProfitMetricKey): number {
  if (metric === 'revenue') return numberOf(data?.totalRevenue)
  if (metric === 'teacherCost') return numberOf(data?.totalTeacherCost)
  if (metric === 'operatingExpense') return numberOf(data?.totalOperatingExpense)
  return numberOf(data?.totalProfit)
}

export function dailyMetricAmount(item: ProfitDailyItem, metric: ProfitMetricKey): number {
  return numberOf(item[metric])
}

export function numberOf(value: unknown): number {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

export function currency(value: unknown): string {
  return `¥${numberOf(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function visibleDailyItems(items: ProfitDailyItem[] | undefined): ProfitDailyItem[] {
  const today = localIsoDate(new Date())
  return (items || []).filter((item) => !!item.date && String(item.date).slice(0, 10) <= today)
}

export function weekdayLabel(iso: string): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return `周${'日一二三四五六'[date.getDay()]}`
}

export function fullWeekdayLabel(iso: string): string {
  const short = weekdayLabel(iso)
  return short ? short.replace('周', '星期') : ''
}

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
