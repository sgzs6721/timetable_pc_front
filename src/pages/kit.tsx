import { Button } from 'antd'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../layouts/AppShell'

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>()
}

export function tell(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function todayIso(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`
}

export interface PeriodOption {
  month?: string
  label?: string
  cycleRangeLabel?: string
  payDateLabel?: string
}

export function periodChoices(options: PeriodOption[] | undefined, month: string, mode: string): Array<{ value: string; label: string }> {
  const rows = (options || []).filter((item) => item.month)
  const choices = rows.map((item) => ({
    value: String(item.month),
    label: mode === 'salary_cycle'
      ? [item.label || item.month, item.cycleRangeLabel, item.payDateLabel].filter(Boolean).join(' · ')
      : String(item.label || item.month),
  }))
  if (month && !choices.some((item) => item.value === month)) choices.unshift({ value: month, label: month })
  return choices
}

export function shiftPeriod(options: PeriodOption[] | undefined, month: string, delta: number): string {
  const months = (options || []).map((item) => String(item.month || '')).filter(Boolean)
  const index = months.indexOf(month)
  if (index < 0 || !months.length) return shiftMonth(month, delta)
  return months[Math.min(Math.max(index - delta, 0), months.length - 1)]
}

function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + delta, 1))
}

export function money(value: unknown): string {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '0'
  return Math.abs(number - Math.round(number)) < 0.001 ? `${Math.round(number)}` : number.toFixed(2)
}

export function genderText(value: unknown): string {
  const text = String(value ?? '').toLowerCase()
  if (text === '1' || text === 'male' || text === 'm') return '男'
  if (text === '2' || text === 'female' || text === 'f') return '女'
  return ''
}

export function isPendingPayment(student: {
  status?: number
  cardCategory?: string
  remainingHours?: number
  remainingAmount?: number
  totalAmount?: number
} | null): boolean {
  if (!student || Number(student.status || 0) === 2) return false
  const category = String(student.cardCategory || '').toUpperCase()
  if (category === 'STORED_VALUE') {
    const total = Math.max(0, Number(student.totalAmount || 0))
    const remain = Math.max(0, Number(student.remainingAmount || 0))
    return total <= 0 || remain < total * 0.1
  }
  if (category === 'PERIOD') return false
  return Number(student.remainingHours || 0) < 5
}

export function studentStatusText(student: {
  status?: number
  cardCategory?: string
  remainingHours?: number
  remainingAmount?: number
  totalAmount?: number
}): string {
  if (Number(student.status || 0) === 2) return '结业'
  if (isPendingPayment(student)) return '待缴费'
  return '在学'
}

export function PageHead(props: { title: string; extra?: string; children?: ReactNode }) {
  return (
    <header className="work-head">
      <div>
        <h1>{props.title}</h1>
        {props.extra ? <p>{props.extra}</p> : null}
      </div>
      <div className="work-head-actions">{props.children}</div>
    </header>
  )
}

export function EmptyState(props: { title: string; text: string; action?: ReactNode }) {
  return (
    <section className="empty-card">
      <h2>{props.title}</h2>
      <p>{props.text}</p>
      {props.action}
    </section>
  )
}

export function NeedCampus(props: { campusId: number | null; children: ReactNode }) {
  if (!props.campusId) {
    return <EmptyState title="请先选择校区" text="这个功能和校区有关。请先在顶栏选择校区，或到校区管理里新建。" />
  }
  return <>{props.children}</>
}

export function NeedOrg(props: { orgId: number | null; children: ReactNode }) {
  if (!props.orgId) {
    return <EmptyState title="当前账号没有机构身份" text="网页端只进入机构教务台。请使用已加入机构的账号，或先创建机构。" />
  }
  return <>{props.children}</>
}

export function RefreshButton(props: { onClick: () => void; loading?: boolean }) {
  return <Button onClick={props.onClick} loading={props.loading}>刷新</Button>
}
