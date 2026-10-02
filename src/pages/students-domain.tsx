import { Button, Modal, Popconfirm, message } from 'antd'
import { createContext, useEffect, useState } from 'react'
import { putJson } from '../api/biz'
import { AppIcon, money, tell, todayIso } from './kit'
import type { Card, Named, Student } from './students-model'
export function personName(item?: Named): string {
  return item?.displayName || item?.nickname || item?.name || item?.serviceName || item?.phone || '未命名'
}

export function keepLastCoachAlert() {
  Modal.info({
    title: '无法删除',
    content: (
      <div>
        <div>至少需要保留一位老师</div>
        <div>不能全部删除</div>
      </div>
    ),
    okText: '我知道了',
  })
}

export function courseCoachCount(student: Student, card: Card | undefined, groups: Named[]): number {
  const groupId = Number(card?.studentGroupId || student.studentGroupId || 0)
  const group = groups.find((item) => item.id === groupId)
  const coachIds = group?.coachIds?.length ? group.coachIds : (group?.coachId ? [group.coachId] : [])
  return coachIds.length
}

export type CatalogStatus = 'loading' | 'ready' | 'failed'

export interface CatalogLoad {
  groups: CatalogStatus
  coaches: CatalogStatus
  services: CatalogStatus
  retryGroups: () => void
  retryCoaches: () => void
  retryServices: () => void
}

export const CatalogLoadContext = createContext<CatalogLoad>({
  groups: 'ready',
  coaches: 'ready',
  services: 'ready',
  retryGroups: () => undefined,
  retryCoaches: () => undefined,
  retryServices: () => undefined,
})

export function CatalogHold(props: { value?: unknown; onChange?: (value: unknown) => void; text: string; onRetry?: () => void }) {
  if (props.onRetry) return <Button type="link" htmlType="button" onClick={props.onRetry}>{props.text}</Button>
  return <span>{props.text}</span>
}

export function ChoiceTabs<T extends string | number>(props: { value?: T; onChange?: (value: T) => void; onPick?: (value: T) => void; options: Array<{ value: T; label: string; icon?: string }> }) {
  return (
    <div className={props.options.some((item) => item.icon?.startsWith('icon-bank') || item.icon === 'icon-cash') ? 'pay-method-tabs' : 'choice-tabs'}>
      {props.options.map((item) => (
        <button key={String(item.value)} type="button" className={props.value === item.value ? 'is-on' : ''} onClick={() => { props.onChange?.(item.value); props.onPick?.(item.value) }}>
          {item.icon ? <AppIcon name={item.icon} size={16} /> : null}
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function removedCard(card: Card): boolean {
  return Number(card.deleted) === 1 || Number(card.status ?? 1) === 0
}

export function CardRecordTabs<T extends { studentCardId?: number }>(props: { cards?: Card[]; rows: T[]; focusId?: number; onCardChange?: (cardId?: number) => void; children: (rows: T[], card?: Card) => JSX.Element }) {
  const cards = orderedStudentCards(props.cards || [])
  const activeCards = cards.filter((card) => !removedCard(card))
  const archivedCards = cards.filter((card) => removedCard(card))
  const foldable = activeCards.length > 0 && archivedCards.length > 0
  const [showArchived, setShowArchived] = useState(false)
  const visible = foldable && !showArchived ? activeCards : cards
  const [tab, setTab] = useState(props.focusId ? String(props.focusId) : String(activeCards[0]?.id || cards[0]?.id || ''))
  useEffect(() => {
    if (!props.focusId || !cards.some((card) => card.id === props.focusId)) return
    if (archivedCards.some((card) => card.id === props.focusId)) setShowArchived(true)
    setTab(String(props.focusId))
  }, [props.focusId, cards.map((card) => card.id).join('|')])
  if (!visible.length) return props.children(props.rows)
  const activeKey = visible.some((card) => String(card.id) === tab) ? tab : String(visible[0]?.id || '')
  const activeCard = visible.find((card) => String(card.id) === activeKey) || visible[0]
  const fallbackCardId = cards[0]?.id
  const scopedRows = props.rows.filter((row) => row.studentCardId
    ? row.studentCardId === activeCard?.id
    : activeCard?.id === fallbackCardId)
  if (!foldable && visible.length < 2) return props.children(scopedRows, activeCard)
  return (
    <div className="student-record-card-pages">
      <div className="student-record-card-tabs" role="tablist" aria-label="切换记录卡片">
        {visible.map((card) => {
          const key = String(card.id)
          const selected = key === activeKey
          const tag = cardBalanceView(card).tag
          const name = String(card.cardName || card.studentGroupName || '').trim()
          return <button key={key} type="button" role="tab" aria-selected={selected} className={[selected ? 'is-active' : '', removedCard(card) ? 'is-archived' : ''].filter(Boolean).join(' ')} onClick={() => {
            setTab(key)
            props.onCardChange?.(Number(key))
          }}><span>{tag}</span>{name && name !== tag ? <small>{name}</small> : null}</button>
        })}
        {foldable ? <button className="student-record-card-more" type="button" onClick={() => {
          const next = !showArchived
          setShowArchived(next)
          if (!next && archivedCards.some((card) => String(card.id) === tab)) {
            const nextId = activeCards[0]?.id
            setTab(String(nextId || ''))
            props.onCardChange?.(nextId)
          }
        }}>{showArchived ? '收起' : '更多'}</button> : null}
      </div>
      {props.children(scopedRows, activeCard)}
    </div>
  )
}

export function listBalanceText(row: Student, card?: Card): { text: string; low: boolean } {
  const category = listCardCategory(card) || String(row.cardCategory || '').toUpperCase()
  if (category === 'STORED_VALUE') return { text: '储值卡', low: false }
  if (category === 'PERIOD') {
    const label = ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' } as Record<string, string>)[String(card?.periodType || row.periodType || '')]
    return { text: label || '时段卡', low: false }
  }
  const summary = hoursListSummary(row, card)
  return { text: `${formatListHours(summary.remaining)}/${formatListHours(summary.total)}`, low: summary.remaining < 5 }
}

/** 课时列跟随当前展示卡。多张课时卡都带齐余额时按各卡相加，缺余额字段时沿用学员汇总，避免把缺失当成 0。 */
export function hoursListSummary(row: Student, card?: Card): { remaining: number; total: number } {
  const activeHoursCards = (row.cards || []).filter((item) => (
    (item.status == null || Number(item.status) === 1)
    && String(item.cardCategory || '').trim().toUpperCase() === 'HOURS'
  ))
  const complete = activeHoursCards.length > 0 && activeHoursCards.every((item) => item.totalHours != null && item.remainingHours != null)
  if (complete) {
    return activeHoursCards.reduce((summary, item) => {
      const regular = Number(item.regularHours || 0)
      const bonus = Number(item.bonusHours || 0)
      const total = Number.isFinite(Number(item.totalHours)) ? Number(item.totalHours) : regular + bonus
      const remaining = Number.isFinite(Number(item.remainingHours)) ? Number(item.remainingHours) : 0
      return { remaining: summary.remaining + remaining, total: summary.total + total }
    }, { remaining: 0, total: 0 })
  }
  const total = Number(row.totalHours ?? card?.totalHours ?? (Number(row.regularHours ?? card?.regularHours ?? 0) + Number(row.bonusHours ?? card?.bonusHours ?? 0)))
  return { remaining: Number(row.remainingHours ?? card?.remainingHours ?? 0), total }
}

export function formatListHours(value: number): string {
  const numeric = Number.isFinite(value) ? value : 0
  const text = Math.abs(numeric - Math.round(numeric)) < 0.001
    ? String(Math.round(numeric))
    : String(Number(numeric.toFixed(2)))
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const integerPart = unsigned.split('.')[0] || '0'
  if (integerPart.length <= 3) return text
  return `${negative ? '-' : ''}${integerPart.slice(0, 3)}...`
}

export function listCardCategory(card?: Card): string {
  return String(card?.cardCategory || '').toUpperCase()
}

export function listCardHasBalance(card: Card, field: 'remainingHours' | 'remainingAmount'): boolean {
  return Object.prototype.hasOwnProperty.call(card, field) && card[field] != null
}

export function listCardEffective(card: Card, student: Student): boolean {
  const category = listCardCategory(card)
  if (category === 'HOURS') {
    if (listCardHasBalance(card, 'remainingHours')) return Number(card.remainingHours || 0) > 0
    return Number(student.remainingHours || 0) > 0
  }
  if (category === 'STORED_VALUE') {
    if (listCardHasBalance(card, 'remainingAmount')) return Number(card.remainingAmount || 0) > 0
    return true
  }
  if (category === 'PERIOD') {
    const end = String(card.validEndDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return true
    const start = String(card.validStartDate || '').trim()
    const today = todayIso()
    return (!/^\d{4}-\d{2}-\d{2}$/.test(start) || today >= start) && today <= end
  }
  return false
}

/** 列表优先展示仍生效的课时卡；课时用尽后回退储值卡、时段卡。筛选卡类型时优先该类型。 */
export function listDisplayCard(student: Student, selectedCategory?: string): Card | undefined {
  const cards = (student.cards || []).filter((card) => card.status == null || Number(card.status) === 1)
  const wanted = String(selectedCategory || '').toUpperCase()
  if (wanted) {
    const matched = cards.find((card) => listCardCategory(card) === wanted)
    if (matched) return matched
  }
  const hours = cards.filter((card) => listCardCategory(card) === 'HOURS')
  const stored = cards.filter((card) => listCardCategory(card) === 'STORED_VALUE')
  const period = cards.filter((card) => listCardCategory(card) === 'PERIOD')
  return hours.find((card) => listCardEffective(card, student))
    || stored.find((card) => listCardEffective(card, student))
    || period.find((card) => listCardEffective(card, student))
    || hours[0]
    || stored[0]
    || period[0]
}

export function listServiceOnly(row: Student, card?: Card): boolean {
  return card ? card.courseCategory === false : row.courseCategory === false
}

export function listCoachText(row: Student, card: Card | undefined, coaches: Named[]): string {
  if (listServiceOnly(row, card)) {
    const hasServiceBinding = !!card && Array.isArray(card.serviceItemIds)
    const source = hasServiceBinding ? (card?.serviceItemNames || []) : (row.serviceItemNames || row.serviceNames || [])
    const names = source.map((item) => String(item || '').trim()).filter(Boolean)
    return names.length ? names.join('、') : '-'
  }
  const hasCoachBinding = !!card && Array.isArray(card.coachMemberIds)
  const ids = (hasCoachBinding ? (card?.coachMemberIds || []) : (row.coachMemberIds || []))
    .map(Number)
    .filter((id) => id > 0)
  const cardNames = hasCoachBinding && Array.isArray(card?.coachMemberNames)
    ? card.coachMemberNames.map((item) => String(item || '').trim())
    : []
  const resolved = ids.map((id, index) => {
    const coach = coaches.find((item) => item.id === id)
    return coach ? personName(coach) : cardNames[index]
  }).map((item) => String(item || '').trim()).filter(Boolean)
  if (resolved.length) return resolved.join('、')
  if (hasCoachBinding) return cardNames.filter(Boolean).join('、') || '待分配'
  const fallback = (row.coachMemberNames?.length ? row.coachMemberNames : (row.coachMemberName ? [row.coachMemberName] : []))
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return fallback.length ? fallback.join('、') : '待分配'
}

export function orderedStudentCards(cards: Card[], today = todayIso()): Card[] {
  const categoryOrder: Record<string, number> = { HOURS: 0, PERIOD: 1, STORED_VALUE: 2 }
  const exhausted = (card: Card) => {
    const category = String(card.cardCategory || '').toUpperCase()
    if (category === 'PERIOD') return !card.validEndDate || card.validEndDate < today
    if (category === 'STORED_VALUE') return Number(card.remainingAmount || 0) <= 0
    return Number(card.remainingHours || 0) <= 0
  }
  return cards.filter((card) => card.id).slice().sort((left, right) => (
    Number(exhausted(left)) - Number(exhausted(right))
    || (categoryOrder[String(left.cardCategory || '').toUpperCase()] ?? 99) - (categoryOrder[String(right.cardCategory || '').toUpperCase()] ?? 99)
    || Number(left.id || 0) - Number(right.id || 0)
  ))
}

export function cardBalanceView(card: Card): { value: string; tag: string; metric: string } {
  const category = String(card.cardCategory || 'HOURS').toUpperCase()
  const format = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
  if (category === 'STORED_VALUE') {
    const expired = Boolean(card.validEndDate && card.validEndDate < todayIso())
    return { value: `¥${money(Math.max(0, Number(card.remainingAmount || 0)))}`, tag: '储值卡', metric: expired ? '已过期' : '剩余金额' }
  }
  if (category === 'PERIOD') {
    const start = String(card.validStartDate || '')
    const end = String(card.validEndDate || '')
    const tag = ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' } as Record<string, string>)[String(card.periodType || '')] || '时段卡'
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    const expired = /^\d{4}-\d{2}-\d{2}$/.test(end) && todayIso() > end
    const value = dated ? `${start.replace(/-/g, '.')} - ${end.replace(/-/g, '.')}` : '待缴费'
    return { value, tag, metric: expired ? '已过期' : '有效期' }
  }
  const remain = Math.max(0, Number(card.remainingHours || 0))
  const total = Math.max(0, Number(card.totalHours ?? (Number(card.regularHours || 0) + Number(card.bonusHours || 0))))
  return { value: `${format(remain)}/${format(total)}`, tag: '课时卡', metric: '剩余/总课时' }
}

export function cardValidityLine(card: Card): { label: string; text: string } | null {
  const category = String(card.cardCategory || '').toUpperCase()
  const start = String(card.validStartDate || '').trim()
  const end = String(card.validEndDate || '').trim()
  const deadline = String(card.consumeDeadline || '').trim()
  const dated = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (dated(start) && dated(end)) {
    const label = category === 'PERIOD' ? '有效期' : category === 'STORED_VALUE' ? '限时消费' : '限时销课'
    return { label, text: `${start} 至 ${end}` }
  }
  if (dated(deadline)) return { label: '有效期至', text: deadline }
  if (dated(end)) return { label: '有效期至', text: end }
  return null
}

export function lastCheckInText(value?: string): string {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T00:00:00`).getDay()]
  return weekday ? `${date} · ${weekday}` : date
}

export function showsCardCoaches(card?: Card): boolean {
  if (!card) return true
  return String(card.cardCategory || '').toUpperCase() === 'HOURS' || card.courseCategory !== false
}

export async function saveActiveCardCoaches(student: Student, card: Card | undefined, coachMemberIds: number[]) {
  if (!coachMemberIds.length) {
    message.warning('请至少选择一位老师')
    return
  }
  const activeCards = (student.cards || []).filter((item) => item.id && (item.status == null || Number(item.status) === 1))
  const target = card?.id ? activeCards.find((item) => item.id === card.id) || card : undefined
  if (target?.id && showsCardCoaches(target)) {
    await putJson(`/student-cards/${target.id}`, {
      cardCategory: target.cardCategory,
      periodType: target.periodType || undefined,
      courseCategory: target.courseCategory !== false,
      cardName: target.cardName || undefined,
      studentGroupId: Number(target.studentGroupId || 0) || undefined,
      coachMemberIds,
    })
    const unionIds = Array.from(new Set(activeCards
      .filter((item) => showsCardCoaches(item))
      .flatMap((item) => (item.id === target.id ? coachMemberIds : (item.coachMemberIds || [])))
      .map(Number)
      .filter((id) => id > 0)))
    await putJson(`/students/${student.id}/coaches`, unionIds.length ? unionIds : coachMemberIds)
    return
  }
  await putJson(`/students/${student.id}/coaches`, coachMemberIds)
}

export function assignedCoachRows(student: Student, card: Card | undefined, coaches: Named[]): Array<{ id: number; name: string }> {
  const ids = (card?.coachMemberIds?.length ? card.coachMemberIds : student.coachMemberIds) || []
  const names = card?.coachMemberNames?.length ? card.coachMemberNames : student.coachMemberNames
  return ids.map((id, index) => {
    const coach = coaches.find((item) => item.id === Number(id))
    return { id: Number(id), name: coach ? personName(coach) : (names?.[index] || `老师${id}`) }
  }).filter((item) => item.id > 0)
}

export function AssignedCoaches(props: {
  student: Student
  card?: Card
  coaches: Named[]
  groups: Named[]
  onChanged: () => Promise<void>
}) {
  const rows = assignedCoachRows(props.student, props.card, props.coaches)
  async function removeCoach(id: number) {
    if (Number(props.student.status || 0) === 2) {
      message.warning('该学员已结业，不能调整老师')
      return
    }
    if (courseCoachCount(props.student, props.card, props.groups) > 1) return
    const next = rows.map((item) => item.id).filter((item) => item !== id)
    if (!next.length) {
      keepLastCoachAlert()
      return
    }
    try {
      await saveActiveCardCoaches(props.student, props.card, next)
      message.success('删除成功')
      await props.onChanged()
    } catch (error) {
      message.error(tell(error, '删除失败'))
    }
  }
  return (
    <div className="assigned-coaches">
      <strong>分配的老师</strong>
      {rows.length === 0 ? <p>暂未分配老师</p> : (
        <ul>
          {rows.map((coach) => (
            <li key={coach.id}>
              <span>{coach.name}</span>
              {rows.length <= 1 ? (
                <Button type="link" htmlType="button" aria-label={`移除${coach.name}`} onClick={() => removeCoach(coach.id)}>×</Button>
              ) : (
                <Popconfirm title="确认删除" description={`确定删除老师“${coach.name}”吗？`} okText="删除" cancelText="取消" onConfirm={() => removeCoach(coach.id)}>
                  <Button type="link" danger htmlType="button" aria-label={`移除${coach.name}`}>×</Button>
                </Popconfirm>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function cardCategoryText(value?: string): string {
  const text = String(value || '').toUpperCase()
  if (text === 'STORED_VALUE') return '储值卡'
  if (text === 'PERIOD') return '时段卡'
  if (text === 'HOURS') return '课时卡'
  return value || ''
}

export function checkInBoundHint(min: string, max: string, withinHint: string): string {
  if (max && max > todayIso()) {
    return min && min !== '2020-01-01'
      ? `有效期 ${min} 至 ${max}，打卡日期不能晚于今天`
      : `有效期至 ${max}，打卡日期不能晚于今天`
  }
  return withinHint
}

export function checkInBounds(source?: { validStartDate?: string; validEndDate?: string; consumeDeadline?: string }): { min: string; max: string; hint: string } {
  const start = String(source?.validStartDate || '')
  const end = String(source?.validEndDate || '')
  const deadline = String(source?.consumeDeadline || '')
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (isDate(start) && isDate(end)) {
    const max = isDate(deadline) && deadline < end ? deadline : end
    return { min: start, max, hint: checkInBoundHint(start, max, `仅可选择有效期内日期：${start} 至 ${max}`) }
  }
  if (isDate(deadline)) return { min: '', max: deadline, hint: checkInBoundHint('', deadline, `仅可选择有效期至 ${deadline} 及之前的日期`) }
  if (isDate(end)) return { min: '', max: end, hint: checkInBoundHint('', end, `仅可选择有效期至 ${end} 及之前的日期`) }
  if (isDate(start)) return { min: start, max: '', hint: `仅可选择 ${start} 及之后的日期` }
  return { min: '', max: '', hint: '' }
}

export function boundedDateMax(bounds: { max: string }): string {
  if (bounds.max && bounds.max < todayIso()) return bounds.max
  return todayIso()
}

export function dateOutOfBoundsMessage(date: string, bounds: { min: string; max: string }): string {
  if (date > todayIso()) return '不能选择未来日期'
  if (bounds.min && date < bounds.min) return '未到有效期，不能打卡'
  if (bounds.max && date > bounds.max) return '已过有效期，不能打卡'
  return ''
}

export function checkInQuotaHint(input: {
  dates: string[]
  category: string
  useService: boolean
  servicePrice: number
  serviceCount: number
  remainingAmount: number
  hours: number
  remainingHours: number
}): string {
  const count = input.dates.length
  if (count <= 0) return ''
  const category = input.category.toUpperCase()
  if (input.useService && category === 'STORED_VALUE') {
    const total = input.servicePrice * Math.max(1, input.serviceCount) * count
    if (total > input.remainingAmount && total > 0) {
      return `已选 ${count} 个日期，共需 ¥${money(total)}，超出剩余 ¥${money(input.remainingAmount)}`
    }
    return ''
  }
  if (category === 'PERIOD' || category === 'STORED_VALUE') return ''
  if (!(input.hours > 0)) return ''
  const totalHours = input.hours * count
  if (totalHours > input.remainingHours) {
    return `已选 ${count} 个日期，共需 ${money(totalHours)} 课时，超出剩余 ${money(input.remainingHours)} 课时`
  }
  return ''
}

export function quickCheckInDefaultHours(card?: { cardCategory?: string; remainingHours?: number }): number {
  const remaining = Number(card?.remainingHours || 0)
  if (String(card?.cardCategory || '').toUpperCase() === 'HOURS' && remaining > 0 && remaining < 1) {
    const rounded = Number(remaining.toFixed(2))
    return rounded > 0 ? rounded : remaining
  }
  return 1
}

export function checkInDateLabel(date: string): string {
  const parsed = new Date(date.replace(/-/g, '/'))
  if (Number.isNaN(parsed.getTime())) return date
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][parsed.getDay()]
  return weekday ? `${date}（${weekday}）` : date
}

export function confirmCheckInDates(dates: string[], usedDates: string[]): Promise<string[] | null> {
  const duplicates = dates.filter((date) => usedDates.includes(date))
  if (!duplicates.length) return Promise.resolve(dates)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: string[] | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    if (dates.length === 1) {
      Modal.confirm({
        title: '该日期已打卡',
        content: `${checkInDateLabel(dates[0])} 已有打卡记录，是否继续打卡？`,
        okText: '继续打卡',
        cancelText: '取消',
        onOk: () => finish(dates),
        onCancel: () => finish(null),
      })
      return
    }
    const remaining = dates.filter((date) => !usedDates.includes(date))
    const modal = Modal.confirm({
      title: '部分日期已打卡',
      content: (
        <div>
          <p>以下日期已打卡</p>
          {duplicates.map((date) => <p key={date}>{checkInDateLabel(date)}</p>)}
          <p>选择“跳过重复日期”将仅提交剩余 {remaining.length} 个日期。</p>
        </div>
      ),
      okText: '继续全部打卡',
      cancelText: '取消本次打卡',
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => { modal.destroy(); finish(null) }}>取消本次打卡</Button>
          <Button onClick={() => { modal.destroy(); finish(remaining) }}>跳过重复日期</Button>
          <Button type="primary" onClick={() => { modal.destroy(); finish(dates) }}>继续全部打卡</Button>
        </div>
      ),
    })
  })
}

export function checkInBlockReason(student: Student, card?: Card): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能打卡'
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const amount = Number(card?.remainingAmount ?? student.remainingAmount ?? 0)
  const hours = Number(card?.remainingHours ?? student.remainingHours ?? 0)
  if (category === 'STORED_VALUE' && amount <= 0) return '剩余金额为0，不能打卡'
  if (category === 'PERIOD') {
    const end = String(card?.validEndDate || student.periodValidEndDate || '')
    const start = String(card?.validStartDate || student.periodValidStartDate || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || (/^\d{4}-\d{2}-\d{2}$/.test(start) && todayIso() < start)) return '时段卡未生效，不能打卡'
  }
  if (category !== 'STORED_VALUE' && category !== 'PERIOD' && hours <= 0) return '剩余课时为0，不能打卡'
  return ''
}

export function paymentBlockReason(student: Student): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能缴费'
  const card = (student.cards || []).find((item) => item.status == null || item.status === 1) || student.cards?.[0]
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const needsCoach = category === 'HOURS' || (card ? card.courseCategory !== false : category !== 'STORED_VALUE')
  const coachIds = card?.coachMemberIds?.length ? card.coachMemberIds : student.coachMemberIds
  if (needsCoach && !(coachIds || []).length) return '请先分配老师再缴费'
  return ''
}

export function canArchiveStudent(student: Student): boolean {
  if (Number(student.status || 0) === 2) return true
  const cards = student.cards?.length ? student.cards : [{ cardCategory: student.cardCategory, remainingHours: student.remainingHours, remainingAmount: student.remainingAmount, validEndDate: student.periodValidEndDate }]
  const today = todayIso()
  return cards.every((card) => {
    const category = String(card.cardCategory || 'HOURS').toUpperCase()
    if (category === 'STORED_VALUE') return Number(card.remainingAmount || 0) === 0
    if (category === 'PERIOD') return !!card.validEndDate && card.validEndDate < today
    return Number(card.remainingHours || 0) === 0
  })
}

export function campusAdminIds(user: { campusAdmin?: boolean; campusAdminCampusIds?: number[]; positionCampusId?: number } | null): number[] {
  const ids = (user?.campusAdminCampusIds || []).map((id) => Number(id || 0)).filter((id, index, list) => id > 0 && list.indexOf(id) === index)
  if (ids.length) return ids
  const legacy = Number(user?.positionCampusId || 0)
  return user?.campusAdmin && legacy > 0 ? [legacy] : []
}

export function managesStudents(
  user: { id?: number; role?: string; campusAdmin?: boolean; campusAdminCampusIds?: number[]; positionCampusId?: number } | null,
  org: { ownerId?: number } | null,
  campusId: number | null,
): boolean {
  if (!(Number(campusId) > 0)) return false
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  if (role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId)) return true
  return campusAdminIds(user).includes(Number(campusId))
}

export function campusOffline(value: boolean | number | string | null | undefined): boolean {
  return value === false || value === 0 || value === '0' || value === 'false'
}

export function isNonCourseServiceCard(card?: { cardCategory?: string; courseCategory?: boolean } | null): boolean {
  const category = String(card?.cardCategory || '').trim().toUpperCase()
  return (category === 'STORED_VALUE' || category === 'PERIOD') && card?.courseCategory === false
}

export function hasTeacherVisibleStudentCard(student: Student): boolean {
  const activeCards = (student.cards || []).filter((card) => card && (card.status == null || Number(card.status) === 1))
  if (activeCards.length) return activeCards.some((card) => !isNonCourseServiceCard(card))
  return !isNonCourseServiceCard(student)
}

export function teacherVisibleStudent(student: Student): Student {
  if (!student.cards?.length) return student
  return {
    ...student,
    cards: student.cards.filter((card) => card && (card.status == null || Number(card.status) === 1) && !isNonCourseServiceCard(card)),
  }
}

export function studentQuotaBlock(summary: Record<string, unknown> | null): string {
  if (!summary || summary.canAddStudent !== false) return ''
  const count = Number(summary.quotaStudentCount || 0)
  const limit = Number(summary.studentLimit || 0)
  return limit > 0
    ? `当前校区已有${count}名学员，最多保留${limit}名。请升级会员、购买扩容或清理无效学员后再添加。`
    : '当前校区暂时无法添加学员，请升级会员或购买扩容后再试。'
}

export function archiveHint(student: Student): string {
  if (Number(student.status || 0) === 2) return '该学员已结业归档，点击可恢复为在学状态'
  return canArchiveStudent(student) ? '所有卡权益均已用尽或到期，可执行结业归档' : '仍有卡存在剩余课时、余额或尚未到期，不能归档'
}

export function assignBlock(student: Student, groups: Named[], coaches: Named[], card?: Card): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能分配老师'
  const groupId = Number(card?.studentGroupId || student.studentGroupId || 0)
  const group = groups.find((item) => item.id === groupId)
  const coachIds = group?.coachIds?.length ? group.coachIds : (group?.coachId ? [group.coachId] : [])
  if (coachIds.length > 1) return '该课程有多位老师，不能单独分配'
  const assignable = coaches.filter((item) => Number(item.status ?? 1) !== 0)
  if (!assignable.length) return '当前校区暂无老师，请先配置校区老师'
  return ''
}

export function cardRemain(card: Card | undefined, student: Student): number {
  if (card?.remainingHours != null) return Number(card.remainingHours)
  return Number(student.remainingHours || 0)
}

export function isoDay(value?: string): string {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''
}

export function activeStudentCards(student: Student): Card[] {
  const active = (student.cards || []).filter((card) => card && (card.status == null || Number(card.status) === 1))
  if (active.length) return active
  return [{
    cardCategory: student.cardCategory || 'HOURS',
    periodType: student.periodType,
    courseCategory: student.courseCategory,
    studentGroupId: student.studentGroupId,
    coachMemberIds: student.coachMemberIds,
    remainingHours: student.remainingHours,
    totalHours: student.totalHours,
    remainingAmount: student.remainingAmount,
    totalAmount: student.totalAmount,
    validStartDate: student.periodValidStartDate,
    validEndDate: student.periodValidEndDate,
  }]
}

export function checkInCardEligible(card: Card, student: Student, useStudentBalance: boolean): boolean {
  const category = String(card.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const remainingHours = Number(card.remainingHours ?? (useStudentBalance ? student.remainingHours : 0) ?? 0)
  const remainingAmount = Number(card.remainingAmount ?? (useStudentBalance ? student.remainingAmount : 0) ?? 0)
  const start = isoDay(card.validStartDate || (useStudentBalance ? student.periodValidStartDate : ''))
  const end = isoDay(card.validEndDate || (useStudentBalance ? student.periodValidEndDate : ''))
  const notStarted = !!start && todayIso() < start
  if (category === 'STORED_VALUE') return remainingAmount > 0 && !notStarted
  if (category === 'PERIOD') return !!end && !notStarted
  return remainingHours > 0 && !notStarted
}

export function noEligibleCheckInMessage(student: Student, cards: Card[]): string {
  const category = String(student.cardCategory || cards[0]?.cardCategory || 'HOURS').toUpperCase()
  const start = isoDay(student.periodValidStartDate || cards[0]?.validStartDate || '')
  if (start && todayIso() < start) return '未到有效期，不能打卡'
  if (category === 'STORED_VALUE') return '剩余金额为0，不能打卡'
  if (category === 'PERIOD') return '时段卡未生效，不能打卡'
  return '剩余课时为0，不能打卡'
}
