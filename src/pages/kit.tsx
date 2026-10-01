import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useLayoutEffect, type ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../layouts/AppShell'

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>()
}

export function tell(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function copyPlainText(value: string): Promise<boolean> {
  const text = String(value || '').trim()
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 浏览器未授权剪贴板时，改用选中文本复制。
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  return copied
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

/** 金额、单价、课时输入：整数最多保留指定位数，小数最多两位，多余部分直接丢掉。 */
export function clampDecimalInput(value: unknown, integerDigits = 6): number | null {
  if (value == null || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  const truncated = Math.floor(numeric * 100 + 1e-8) / 100
  const integer = Math.floor(truncated)
  const decimal = Math.round((truncated - integer) * 100)
  const digits = Math.max(1, Math.floor(integerDigits))
  const sliced = Number(String(integer).slice(0, digits))
  const next = sliced + decimal / 100
  const cap = Number(`${'9'.repeat(digits)}.99`)
  return next > cap ? cap : next
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

export function PageHead(props: { title: string; extra?: string; children?: ReactNode; showTitle?: boolean }) {
  const { setPageDescription } = useShell()
  useLayoutEffect(() => {
    setPageDescription(props.extra || '')
    return () => setPageDescription('')
  }, [props.extra, setPageDescription])

  return (
    <>
      {!props.showTitle ? <h1 className="page-title-visually-hidden">{props.title}</h1> : null}
      {props.showTitle || props.children ? (
        <header className={props.showTitle ? 'work-head has-title' : 'work-head'}>
          {props.showTitle ? <div className="work-head-main"><h1>{props.title}</h1></div> : null}
          {props.children ? <div className="work-head-actions">{props.children}</div> : null}
        </header>
      ) : null}
    </>
  )
}

export function AppIcon(props: { name: string; size?: number; className?: string }) {
  return <img className={props.className || 'app-icon'} src={`/icons/${props.name}.svg`} width={props.size || 18} height={props.size || 18} alt="" draggable={false} />
}

export function EmptyState(props: { title: string; text: string; action?: ReactNode; icon?: string }) {
  return (
    <section className="empty-card">
      <AppIcon name={props.icon || 'icon-schedule-empty'} size={42} />
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
  return <Button icon={<ReloadOutlined />} onClick={props.onClick} loading={props.loading}>刷新</Button>
}

export function PhoneCopyButton(props: { onClick: () => void }) {
  return (
    <Tooltip title="复制电话">
      <Button
        className="phone-copy-button"
        type="text"
        size="small"
        htmlType="button"
        icon={<CopyOutlined />}
        aria-label="复制电话"
        onClick={props.onClick}
      />
    </Tooltip>
  )
}
