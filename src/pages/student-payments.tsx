import { Space } from 'antd'
import { useState } from 'react'
import { paymentDateLabel, periodValidityError, transferTargetLabel } from './payment-rules'
import { clampDecimalInput, todayIso } from './kit'
import type { Student, Card, Named, PayRecord } from './students-model'
import { checkInAmountText, checkInHoursText, chronologicalSortKey } from './student-checkins'
import { personName } from './students-domain'

export function isTransferInRecord(record: PayRecord): boolean {
  const direction = String(record.transferDirection || '').trim().toLowerCase()
  if (direction === 'in') return true
  return String(record.typeText || '').includes('转入')
}

export function deletePaymentTitle(record: PayRecord): string {
  if (record.adjustmentReason === 'transfer') {
    const label = String(record.typeText || '').trim() || (isTransferInRecord(record) ? '课时转入' : '课时转出')
    return `删除${label}记录`
  }
  if (record.type === 'refund') return '删除退费记录'
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'period_refund_consume'].includes(reason)) return '删除金额调整记录'
    return '删除课时调整记录'
  }
  return '删除缴费记录'
}

export function deletePaymentPeerLabel(record: PayRecord): string {
  const usesTransferWording = String(record.typeText || '').includes('转让')
  if (isTransferInRecord(record)) return usesTransferWording ? '转让转出' : '课时转出'
  return usesTransferWording ? '转让转入' : '课时转入'
}

export function transferHoursDetail(hours: number, giftHours: number): string {
  if (hours > 0 && giftHours > 0) return `正课${checkInHoursText(hours)}课时 / 赠课${checkInHoursText(giftHours)}课时`
  if (giftHours > 0) return `赠课${checkInHoursText(giftHours)}课时`
  return `${checkInHoursText(hours)}课时`
}

export function paymentChildHoursSummary(record: PayRecord): string {
  if (record.type !== 'supplement' && record.type !== 'refund') return ''
  const regularHours = Number(record.hours || 0)
  const giftHours = Number(record.giftHours || 0)
  const parts: string[] = []
  const refund = record.type === 'refund'
  if (regularHours > 0) parts.push(refund ? `退正课${checkInHoursText(regularHours)}课时` : `正课${checkInHoursText(regularHours)}课时`)
  if (giftHours > 0) parts.push(refund ? `退赠课${checkInHoursText(giftHours)}课时` : `赠课${checkInHoursText(giftHours)}课时`)
  return parts.join('、')
}

export function paymentChildSummary(record: PayRecord, hidden: boolean): string {
  if (record.type === 'supplement') return `补缴 · +${checkInAmountText(Number(record.amount || 0))} 元`
  if (record.type === 'refund') return `退费 · -${checkInAmountText(Number(record.amount || 0))} 元`
  const reason = String(record.adjustmentReason || '')
  if (reason === 'manual_deduct_amount') return `扣减金额 · -${checkInAmountText(Number(record.amount || 0))}元`
  if (reason === 'manual_add_amount') return `增加金额 · +${checkInAmountText(Number(record.amount || 0))}元`
  if (reason === 'clear_amount') return `清空余额 · -${checkInAmountText(Number(record.amount || 0))}元`
  if (reason === 'period_refund_consume') return `消耗 · -${checkInAmountText(Number(record.amount || 0))} 元`
  const giftHours = Number(record.giftHours || 0)
  if (reason === 'manual_deduct') return `扣正课 · ${checkInHoursText(Number(record.hours || 0))}课时`
  if (reason === 'gift_expired') return `扣赠课 · ${checkInHoursText(giftHours)}课时`
  if (reason === 'clear_hours') return `清空课时 · 正课${checkInHoursText(Number(record.hours || 0))} / 赠课${checkInHoursText(giftHours)}`
  if (reason === 'activity_gift') return `赠课 · ${checkInHoursText(giftHours)}课时`
  if (reason === 'activate_hours') {
    const regularHours = Number(record.hours || 0)
    const incoming = isTransferInRecord(record)
    const sign = incoming ? '+' : '-'
    const parts: string[] = []
    if (regularHours > 0) parts.push(`${sign}${checkInHoursText(regularHours)}正课`)
    if (giftHours > 0) parts.push(`${sign}${checkInHoursText(giftHours)}赠课`)
    if (!parts.length) parts.push(`${sign}0课时`)
    return `合并课时 · ${parts.join(' / ')}`
  }
  if (reason === 'transfer') {
    const hours = Number(record.hours || 0)
    const incoming = isTransferInRecord(record)
    const hoursText = transferHoursDetail(hours, giftHours)
    if (hours <= 0 && giftHours <= 0) {
      if (hidden) return incoming ? '转让转入' : '转让转出'
      return incoming
        ? `转让转入 · +${checkInAmountText(Number(record.amount || 0))}元`
        : `转让转出 · -${checkInAmountText(Number(record.amount || 0))}元`
    }
    if (hidden) return incoming ? `转入课时 · ${hoursText}` : `转出课时 · ${hoursText}`
    return incoming
      ? `转入课时 · ${hoursText} · +${checkInAmountText(Number(record.amount || 0))}元`
      : `转出课时 · ${hoursText} · -${checkInAmountText(Number(record.amount || 0))}元`
  }
  return record.typeText || '调整'
}

export function paymentChildLine(record: PayRecord, hidden: boolean): string {
  const summary = paymentChildSummary(record, hidden)
  const hours = paymentChildHoursSummary(record)
  return [summary, hours].filter(Boolean).join(' · ')
}

export function deletePaymentContent(record: PayRecord): string {
  const recordDate = String(record.paymentDate || '').trim()
  const recordTypeText = String(record.typeText || '缴费').trim()
  const storedService = String(record.displayMode || '').trim() === 'stored_service'
  const totalHours = Number(record.totalHours ?? (Number(record.hours || 0) + Number(record.giftHours || 0)))
  const hoursHint = !storedService && totalHours ? `，并回退 ${totalHours} 课时` : ''
  const summaryText = storedService
    ? '删除后将重新计算累计金额并刷新服务权益。'
    : `删除后将重新计算累计金额、整本均价${hoursHint}。`
  const baseText = `确定删除 ${recordDate} 的${recordTypeText}记录吗？${summaryText}`
  if (record.adjustmentReason !== 'transfer') return baseText
  const peerName = String(record.transferTargetStudentName || '').trim() || '对方学员'
  return `确定删除 ${recordDate} 的${recordTypeText}记录吗？将同时删除${peerName}的${deletePaymentPeerLabel(record)}记录，并回退双方的课时和金额。`
}

export function paymentAvgText(record: PayRecord): string {
  const hours = Number(record.hours || 0) + Number(record.giftHours || 0)
  const signed = signedPaymentAmount(record)
  const transfer = record.adjustmentReason === 'transfer'
  if (record.type === 'refund' || (record.type === 'adjustment' && !transfer) || hours <= 0 || Math.abs(signed) <= 0) return ''
  return `¥${checkInAmountText(Math.abs(signed) / hours)}/课时`
}

export function paymentCommissionText(record: PayRecord): string {
  const names = (record.commissionAllocations || []).map((item) => String(item.memberName || '').trim()).filter(Boolean)
  const nameText = names.length ? names.join('、') : String(record.commissionMemberName || '').trim()
  if (!nameText) return ''
  const rate = Number(record.commissionRate || 0) > 0 ? ` · ${checkInAmountText(Number(record.commissionRate))}%` : ''
  const amount = Number(record.commissionAmount || 0) > 0 ? ` · ¥${checkInAmountText(Number(record.commissionAmount))}` : ''
  return `${nameText}${rate}${amount}`
}

export function paymentRemarkText(record: PayRecord): string {
  const text = String(record.remark || '').trim()
  const formatted = !text || (record.type === 'adjustment' && (/^\[.*\]$/.test(text) || /^\[period_refund_consume\]/.test(text))) ? '' : text
  if (record.adjustmentReason !== 'transfer' || isTransferInRecord(record)) return formatted
  const custom = formatted.match(/^\[(?:转课接收|转课转出|转校区转入)\]\s*(?:来自|转给|转至)?\s*[^；;]*[；;]\s*(.+)$/)
  if (custom) return custom[1].trim()
  const stripped = /^\[(?:转课接收|转课转出|转校区转入)\]/.test(formatted) ? '' : formatted
  if (stripped) return stripped
  if (Number(record.hours || 0) + Number(record.giftHours || 0) > 0) return ''
  const targetName = String(record.transferTargetStudentName || '').trim()
  return targetName ? `[转让转出] 转给 ${targetName}` : '[转让转出]'
}

export function childPaymentDisplay(record: PayRecord, parent: PayRecord): PayRecord {
  const parentOpen = !paymentValidityEnd(parent)
  const hideValidity = (record.type === 'supplement' && parentOpen) || (record.type === 'adjustment' && record.adjustmentReason !== 'transfer')
  if (!hideValidity) return record
  return { ...record, validStartDate: '', validEndDate: '', consumeDeadline: '' }
}

export function isoDayText(value?: string): string {
  const text = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function paymentValidityEnd(record?: { validEndDate?: string; consumeDeadline?: string }): string {
  return [record?.validEndDate, record?.consumeDeadline].map((item) => isoDayText(item)).filter(Boolean).sort()[0] || ''
}

export function laterPaymentValidity(record: PayRecord): PayRecord {
  let winner = record
  ;(record.supplements || []).forEach((item) => {
    if (item.type !== 'supplement') return
    const candidate = paymentValidityEnd(item)
    const current = paymentValidityEnd(winner)
    if (candidate && current && candidate > current) winner = item
  })
  return winner
}

export function paymentValidityPhrase(record?: { validStartDate?: string; validEndDate?: string; consumeDeadline?: string }): string {
  const start = isoDayText(record?.validStartDate)
  const end = paymentValidityEnd(record)
  if (start && end) return `有效期间：${start} ~ ${end}`
  if (end) return `有效期至：${end}`
  if (start) return `有效期自：${start}`
  return '不限期'
}

export function paymentValidityTone(record?: { validEndDate?: string; consumeDeadline?: string }): '' | 'expired' | 'soon' {
  const end = paymentValidityEnd(record)
  if (!end) return ''
  const days = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 5) return 'soon'
  return ''
}

export function decorateValidity(text: string, tone: '' | 'expired' | 'soon'): string {
  if (!text || text === '不限期' || !tone) return text
  return `${text} · ${tone === 'expired' ? '已过期' : '即将到期'}`
}

export function storedValidityPhrase(record?: { validStartDate?: string; validEndDate?: string; consumeDeadline?: string }): { text: string; tone: '' | 'expired' | 'soon' } {
  const start = isoDayText(record?.validStartDate)
  const end = isoDayText(record?.validEndDate)
  const deadline = isoDayText(record?.consumeDeadline)
  if (start && end) return { text: `限时消费 ${start} 至 ${end}`, tone: paymentValidityTone({ validEndDate: end }) }
  const until = deadline || end
  if (until) return { text: `有效期至：${until}`, tone: paymentValidityTone({ validEndDate: end, consumeDeadline: until }) }
  return { text: '不限期', tone: '' }
}

export function paymentRemainingText(record: PayRecord, card: Card | undefined, student: Student, kind: 'main' | 'child'): string {
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  if (category !== 'HOURS' || kind === 'child') return ''
  const remain = Math.max(0, Number(record.remainingHours || 0))
  const text = `${checkInHoursText(remain)}课时`
  return (record.supplements || []).length ? `共计剩余${text}` : `剩余${text}`
}

export function paymentValidityCell(record: PayRecord, card: Card | undefined, student: Student, kind: 'main' | 'child'): { text: string; tone: '' | 'expired' | 'soon' } {
  if (kind === 'child') {
    if (record.type === 'adjustment' && record.adjustmentReason !== 'transfer') return { text: '', tone: '' }
    const phrase = paymentValidityPhrase(record)
    if (phrase === '不限期') return { text: '', tone: '' }
    const tone = paymentValidityTone(record)
    return { text: decorateValidity(phrase, tone), tone }
  }
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const source = laterPaymentValidity(record)
  if (category === 'STORED_VALUE') {
    const own = storedValidityPhrase(record)
    const summary = storedValidityPhrase(source)
    const ownText = decorateValidity(own.text, own.tone)
    const summaryText = decorateValidity(summary.text, summary.tone)
    if ((record.supplements || []).length && ownText !== summaryText) return { text: `${ownText}\n共计 ${summaryText}`, tone: summary.tone || own.tone }
    return { text: summaryText, tone: summary.tone }
  }
  if (category === 'PERIOD') {
    const end = isoDayText(source.validEndDate) || paymentValidityEnd(source)
    if (!end) {
      const phrase = paymentValidityPhrase(source)
      if (Number(record.remainingHours || 0) <= 0 && phrase === '不限期') return { text: '', tone: '' }
      return { text: phrase, tone: '' }
    }
    const tone = paymentValidityTone(source)
    return { text: decorateValidity(`有效期至：${end}`, tone), tone }
  }
  const hideOpen = Number(record.remainingHours || 0) <= 0
  const ownPhrase = paymentValidityPhrase(record)
  const summaryPhrase = paymentValidityPhrase(source)
  const ownText = hideOpen && ownPhrase === '不限期' ? '' : decorateValidity(ownPhrase, paymentValidityTone(record))
  const summaryText = hideOpen && summaryPhrase === '不限期' ? '' : decorateValidity(summaryPhrase, paymentValidityTone(source))
  if ((record.supplements || []).length && ownText && summaryText && ownText !== summaryText) {
    return { text: `${ownText}\n共计 ${summaryText}`, tone: paymentValidityTone(source) || paymentValidityTone(record) }
  }
  const text = (record.supplements || []).length ? (summaryText || ownText) : ownText
  return { text, tone: paymentValidityTone((record.supplements || []).length ? source : record) }
}

export function teacherIsoDate(value?: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

export function teacherPeriodLabel(periodType?: string): string {
  return ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' } as Record<string, string>)[String(periodType || '').toUpperCase()] || '时段卡'
}

export function teacherAmountOnly(record: PayRecord): boolean {
  const reason = String(record.adjustmentReason || '').trim()
  return reason === 'manual_deduct_amount' || reason === 'manual_add_amount' || reason === 'clear_amount' || reason === 'period_refund_consume'
}

export function teacherHoursPayment(record: PayRecord, card?: Card): boolean {
  const category = String(card?.cardCategory || '').toUpperCase()
  if (category === 'PERIOD' || category === 'STORED_VALUE') return false
  if (category === 'HOURS') return true
  if (teacherAmountOnly(record)) return false
  const hours = Number(record.hours || 0)
  const giftHours = Number(record.giftHours || 0)
  if (hours !== 0 || giftHours !== 0) return true
  const type = String(record.type || '').trim()
  const hasValidity = teacherIsoDate(record.validStartDate) || teacherIsoDate(record.validEndDate) || teacherIsoDate(record.consumeDeadline)
  if ((type === 'new' || type === 'renew' || type === 'supplement' || type === 'refund') && hasValidity) return false
  return true
}

export function teacherHourDelta(record: PayRecord): { regular: number; gift: number } {
  const regular = Number(record.hours || 0)
  const gift = Number(record.giftHours || 0)
  const type = String(record.type || '').trim()
  const reason = String(record.adjustmentReason || '').trim()
  if (type === 'refund') return { regular: -regular, gift: -gift }
  if (type !== 'adjustment') return { regular, gift }
  if (reason === 'manual_deduct') return { regular: -regular, gift: 0 }
  if (reason === 'gift_expired') return { regular: 0, gift: -gift }
  if (reason === 'clear_hours') return { regular: -regular, gift: -gift }
  if (reason === 'activity_gift') return { regular: 0, gift }
  if (reason === 'activate_hours' || reason === 'transfer') {
    const inbound = reason === 'activate_hours' ? String(record.transferDirection || '').trim() === 'in' : isTransferInRecord(record)
    const sign = inbound ? 1 : -1
    return { regular: sign * regular, gift: sign * gift }
  }
  return { regular: 0, gift: 0 }
}

export function teacherSignedHours(value: number): string {
  const text = checkInHoursText(value)
  return value > 0 ? `+${text}` : text
}

export function teacherNonHoursType(record: PayRecord, card: Card | undefined, category: string): string {
  const label = category === 'PERIOD' ? teacherPeriodLabel(card?.periodType) : (category === 'STORED_VALUE' ? '储值卡' : '缴费')
  const type = String(record.type || '').trim()
  if (type === 'refund') return `${label}退费`
  if (type === 'renew') return `${label}续费`
  if (type === 'supplement') return `${label}补缴`
  if (type === 'adjustment') return `${label}调整`
  return label
}

export function teacherNonHoursValidity(record: PayRecord, category: string): { label: string; text: string } {
  if (teacherAmountOnly(record)) return { label: '变动', text: '金额调整' }
  const start = String(record.validStartDate || '').trim()
  const end = String(record.validEndDate || '').trim()
  const deadline = String(record.consumeDeadline || '').trim()
  if (category === 'STORED_VALUE') {
    if (teacherIsoDate(start) && teacherIsoDate(end)) return { label: '限时消费', text: `${start} 至 ${end}` }
    if (teacherIsoDate(deadline)) return { label: '有效期至', text: deadline }
    if (teacherIsoDate(end)) return { label: '有效期至', text: end }
    return { label: '', text: '不限期' }
  }
  if (teacherIsoDate(start) && teacherIsoDate(end)) return { label: '有效期', text: `${start} 至 ${end}` }
  if (teacherIsoDate(deadline)) return { label: '有效期至', text: deadline }
  if (teacherIsoDate(end)) return { label: '有效期至', text: end }
  return { label: '有效期', text: '待开通' }
}

export interface TeacherPayRow {
  id: number
  category: string
  typeText: string
  date: string
  timeText: string
  courseText: string
  metricMode: 'hours' | 'validity'
  regularText: string
  giftText: string
  validityLabel: string
  validityText: string
  sortKey: string
}

export function teacherPaymentRows(records: PayRecord[], cards: Card[]): TeacherPayRow[] {
  return records.filter((record) => Number(record?.id || 0) > 0).flatMap((record) => {
    const cardId = Number(record.studentCardId || 0)
    const card = cardId > 0 ? cards.find((item) => Number(item.id || 0) === cardId) : (cards.length === 1 ? cards[0] : undefined)
    const category = String(card?.cardCategory || '').toUpperCase()
    if (card && (category === 'PERIOD' || category === 'STORED_VALUE') && card.courseCategory === false) return []
    const date = String(record.paymentDate || record.createTime || '').slice(0, 10)
    const createTime = String(record.createTime || '').replace('T', ' ')
    const timeMatch = createTime.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/)
    const label = String(record.courseTypeLabel || card?.studentGroupName || '').trim()
    const courseType = String(record.courseType || '').trim()
    const courseText = !label || label === courseType ? '' : label
    const base = { id: record.id, category: category || (teacherHoursPayment(record, card) ? 'HOURS' : ''), date, timeText: timeMatch ? timeMatch[1] : '', courseText, sortKey: `${date} ${createTime}` }
    const row: TeacherPayRow = !teacherHoursPayment(record, card)
      ? (() => {
        const validity = teacherNonHoursValidity(record, category)
        return { ...base, metricMode: 'validity', typeText: teacherNonHoursType(record, card, category), validityLabel: validity.label, validityText: validity.text, regularText: '', giftText: '' }
      })()
      : (() => {
        const delta = teacherHourDelta(record)
        return { ...base, category: base.category || 'HOURS', metricMode: 'hours', typeText: '课时变动', validityLabel: '', validityText: '', regularText: teacherSignedHours(delta.regular), giftText: teacherSignedHours(delta.gift) }
      })()
    return [row]
  }).sort((left, right) => left.sortKey < right.sortKey ? 1 : left.sortKey > right.sortKey ? -1 : 0)
}

export function TeacherPaymentList(props: { payments: PayRecord[]; cards: Card[] }) {
  const tabs = (['HOURS', 'PERIOD', 'STORED_VALUE'] as const)
    .map((key) => ({ key, label: key === 'HOURS' ? '课时卡' : key === 'PERIOD' ? '时段卡' : '储值卡', rows: teacherPaymentRows(props.payments, props.cards).filter((row) => row.category === key) }))
    .filter((tab) => tab.rows.length > 0)
  const [key, setKey] = useState(tabs[0]?.key || 'HOURS')
  const active = tabs.some((tab) => tab.key === key) ? key : (tabs[0]?.key || '')
  const rows = tabs.find((tab) => tab.key === active)?.rows || []
  if (!tabs.length) return <p>暂无缴费记录</p>
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {tabs.length > 1 ? (
        <div className="choice-tabs">
          {tabs.map((tab) => <button key={tab.key} type="button" className={tab.key === active ? 'is-on' : ''} onClick={() => setKey(tab.key)}>{tab.label}</button>)}
        </div>
      ) : null}
      <div className="check-timeline">
        {rows.map((row) => (
          <article key={row.id}>
            <header>
              <strong>{row.typeText}</strong>
              <span>{row.date}</span>
              {row.timeText ? <em>{row.timeText}</em> : null}
            </header>
            {row.courseText ? <p>{row.courseText}</p> : null}
            {row.metricMode === 'hours' ? (
              <p className="teacher-pay-delta"><span>正课<strong>{row.regularText}</strong></span><span>赠课<strong>{row.giftText}</strong></span></p>
            ) : <p>{row.validityLabel ? `${row.validityLabel} ${row.validityText}` : row.validityText}</p>}
          </article>
        ))}
      </div>
    </Space>
  )
}

export function signedPaymentAmount(record: PayRecord): number {
  const amount = Number(record.amount || 0)
  if (!amount) return 0
  if (record.type === 'refund') return -amount
  if (record.adjustmentReason === 'transfer') return isTransferInRecord(record) ? amount : -amount
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (reason === 'manual_deduct_amount' || reason === 'clear_amount' || reason === 'period_refund_consume') return -amount
    if (reason === 'manual_add_amount') return amount
    return 0
  }
  return amount
}

export function paymentAmountSign(record: PayRecord): string {
  if (record.type === 'refund') return '−'
  if (record.adjustmentReason === 'transfer') return isTransferInRecord(record) ? '+' : '−'
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (reason === 'manual_add_amount') return '+'
    if (reason === 'manual_deduct_amount' || reason === 'clear_amount' || reason === 'period_refund_consume') return '−'
    return '±'
  }
  return '+'
}

export function paymentMethodLabel(method?: number): string {
  if (method === 1) return '支付宝'
  if (method === 2) return '微信'
  if (method === 3) return '银行卡'
  if (method === 4) return '公户'
  if (method === 5) return '现金'
  return ''
}

export function paymentAmountCaption(record: PayRecord): string {
  if (record.type === 'refund') return '退费金额'
  if (record.adjustmentReason === 'transfer') return isTransferInRecord(record) ? '转入金额' : '转出金额'
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (reason === 'manual_add_amount') return '增加金额'
    if (reason === 'manual_deduct_amount' || reason === 'clear_amount' || reason === 'period_refund_consume') return '扣减金额'
    return '调整金额'
  }
  return '收款金额'
}

export function paymentAmountText(record: PayRecord, caption = false): string {
  const amount = `${paymentAmountSign(record)}${checkInAmountText(Math.abs(Number(record.amount || 0)))}`
  const method = paymentMethodLabel(record.paymentMethod)
  const body = method ? `${amount} · ${method}` : amount
  return caption ? `${paymentAmountCaption(record)} ${body}` : body
}

export function paymentSummaryMetrics(rows: PayRecord[], card: Card | undefined, student: Student, hidden: boolean): { head: { title: string; subtitle: string; value: string; course: string } | null; metrics: Array<{ label: string; value: string }> } {
  const activeCards = (student.cards || []).filter((item) => item.id)
  if (!card && activeCards.length >= 2) {
    if (hidden) return { head: null, metrics: [] }
    const amount = rows.reduce((sum, row) => sum + signedPaymentAmount(row), 0)
    return { head: { title: '累计缴费金额', subtitle: '', value: `¥${checkInAmountText(Math.max(0, amount))}`, course: '' }, metrics: [] }
  }
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const special = category === 'STORED_VALUE' || category === 'PERIOD'
  if (special) {
    const amount = rows.reduce((sum, row) => sum + signedPaymentAmount(row), 0)
    const includesCourse = (card?.courseCategory ?? student.courseCategory) !== false
    const services = [
      ...(card?.serviceItemNames || []),
      ...(card?.serviceRights || []).map((item) => item.courseTypeLabel || ''),
      ...(card ? [] : student.serviceItemNames || []),
    ].map((item) => String(item || '').trim()).filter(Boolean)
    const uniqueServices = Array.from(new Set(services))
    const courseName = String(card?.studentGroupName || '').trim()
    const benefit = includesCourse
      ? [courseName, uniqueServices.join(' | ')].filter(Boolean).join(' | ') || '未配置课程'
      : (uniqueServices.join(' | ') || '未配置服务')
    const metrics = hidden ? [] : [{ label: '累计金额(元)', value: checkInAmountText(amount) }]
    metrics.push({ label: '适用服务', value: benefit })
    const subtitle = includesCourse
      ? '按上课权益展示'
      : uniqueServices.length > 0
        ? '按已配置服务权益展示'
        : '当前仅记录金额，没有附加服务权益'
    return {
      head: {
        title: category === 'PERIOD' ? '时段权益' : '储值权益',
        subtitle,
        value: hidden ? '' : `¥${checkInAmountText(Math.max(0, amount))}`,
        course: '',
      },
      metrics,
    }
  }
  let netAmount = 0
  let netRegular = 0
  let netGift = 0
  rows.forEach((record) => {
    netAmount += signedPaymentAmount(record)
    if (record.type === 'adjustment') {
      const reason = String(record.adjustmentReason || '')
      if (reason === 'manual_deduct') netRegular -= Number(record.hours || 0)
      else if (reason === 'gift_expired') netGift -= Number(record.giftHours || 0)
      else if (reason === 'clear_hours') {
        netRegular -= Number(record.hours || 0)
        netGift -= Number(record.giftHours || 0)
      } else if (reason === 'activity_gift') netGift += Number(record.giftHours || 0)
      else if (reason === 'transfer') netRegular += isTransferInRecord(record) ? Number(record.hours || 0) : -Number(record.hours || 0)
      return
    }
    const sign = record.type === 'refund' ? -1 : 1
    netRegular += sign * Number(record.hours || 0)
    netGift += sign * Number(record.giftHours || 0)
  })
  const rawTotal = netRegular + netGift
  const avg = rawTotal > 0 && netAmount > 0 ? checkInAmountText(netAmount / rawTotal) : ''
  const metrics: Array<{ label: string; value: string }> = []
  if (!hidden) metrics.push({ label: '累计金额(元)', value: checkInAmountText(netAmount) })
  metrics.push({ label: '正课课时', value: checkInHoursText(Math.max(0, netRegular)) })
  metrics.push({ label: '赠课课时', value: checkInHoursText(Math.max(0, netGift)) })
  metrics.push({ label: '总课时', value: checkInHoursText(Math.max(0, rawTotal)) })
  return {
    head: {
      title: '整本均价',
      subtitle: '总金额 ÷ 总课时',
      value: hidden ? '' : (avg ? `¥${avg}/课时` : '—'),
      course: String(card?.studentGroupName || '').trim(),
    },
    metrics,
  }
}

export function standaloneTransferIn(record: PayRecord): boolean {
  return record.adjustmentReason === 'transfer' && isTransferInRecord(record) && Number(record.mainRecordId || 0) <= 0
}

export function groupPayments(records: PayRecord[]): Array<PayRecord & { supplements: PayRecord[] }> {
  const grouped: Array<PayRecord & { supplements: PayRecord[] }> = []
  const mainIndexById = new Map<number, number>()
  const latestByCourse = new Map<string, number>()
  let latestMainIndex = -1
  const attach = (parent: PayRecord & { supplements: PayRecord[] }, record: PayRecord) => {
    parent.supplements = [...parent.supplements, record].sort((left, right) => {
      const leftKey = chronologicalSortKey(left.paymentDate, left.createTime, left.id)
      const rightKey = chronologicalSortKey(right.paymentDate, right.createTime, right.id)
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
  }
  ;[...records].reverse().forEach((record) => {
    const linked = !standaloneTransferIn(record) && (record.type === 'supplement' || record.type === 'adjustment' || record.type === 'refund')
    if (linked) {
      const explicit = Number(record.mainRecordId || 0)
      const courseKey = String(record.courseType || '').trim() || '__EMPTY__'
      let parentIndex = explicit > 0 ? mainIndexById.get(explicit) : latestByCourse.get(courseKey)
      if (record.type === 'refund' && parentIndex == null && latestMainIndex >= 0) parentIndex = latestMainIndex
      if (parentIndex != null && grouped[parentIndex]) {
        attach(grouped[parentIndex], record)
      } else {
        grouped.push({ ...record, supplements: [] })
        if (record.adjustmentReason === 'transfer' && isTransferInRecord(record)) {
          latestMainIndex = grouped.length - 1
          mainIndexById.set(record.id, latestMainIndex)
        }
      }
      return
    }
    grouped.push({ ...record, supplements: [] })
    latestMainIndex = grouped.length - 1
    mainIndexById.set(record.id, latestMainIndex)
    latestByCourse.set(String(record.courseType || '').trim() || '__EMPTY__', latestMainIndex)
  })
  const detached: number[] = []
  grouped.forEach((record, index) => {
    const explicit = Number(record.mainRecordId || 0)
    const childType = record.type === 'supplement' || record.type === 'adjustment' || record.type === 'refund'
    if (!childType || explicit <= 0 || standaloneTransferIn(record) || record.supplements.length > 0) return
    const parentIndex = mainIndexById.get(explicit)
    if (parentIndex == null || parentIndex === index || !grouped[parentIndex]) return
    attach(grouped[parentIndex], record)
    detached.push(index)
  })
  const attached = detached.length > 0 ? grouped.filter((_, index) => !detached.includes(index)) : grouped
  return attached.reverse()
}

export function supplementSectionFoldable(title: string, count: number): boolean {
  return count > 1 && title !== '补缴记录' && title !== '退费记录'
}

export function supplementSectionTitle(records: PayRecord[]): string {
  const types = Array.from(new Set(records.map((item) => item.type).filter(Boolean)))
  if (types.length === 1 && types[0] === 'adjustment') {
    const amount = records.some((item) => ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'period_refund_consume'].includes(String(item.adjustmentReason || '')))
    return amount ? '金额调整记录' : '课时调整记录'
  }
  if (types.length === 1 && types[0] === 'supplement') return '补缴记录'
  if (types.length === 1 && types[0] === 'refund') return '退费记录'
  return types.length ? '缴费调整记录' : '补缴记录'
}

export function adjustPaymentTypeOptions(category: string): Array<{ value: string; label: string }> {
  if (category === 'PERIOD') {
    return [
      { value: 'supplement', label: '补缴' },
      { value: 'adjustment', label: '转让' },
      { value: 'refund', label: '退费' },
    ]
  }
  return [
    { value: 'supplement', label: '补缴' },
    { value: 'adjustment', label: category === 'STORED_VALUE' ? '金额调整' : '课时调整' },
    { value: 'refund', label: '退费' },
  ]
}

export function canAdjustPayment(record: PayRecord): boolean {
  return record.type === 'new' || record.type === 'renew' || standaloneTransferIn(record)
}

export function canEditPayment(record: PayRecord): boolean {
  const reason = String(record.adjustmentReason || '')
  return reason !== 'transfer' && reason !== 'activate_hours' && reason !== 'period_refund_consume'
}

export function decimalLimit(value: unknown): boolean {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric < 0) return false
  const scaled = Math.round(numeric * 100)
  return Math.abs(numeric * 100 - scaled) < 0.001 && Math.floor(numeric) <= 999999
}

/** 输入时截断为最多 6 位整数和 2 位小数，与小程序缴费金额、课时输入一致。 */
export function clampPaymentDecimal(value: unknown): number | null {
  return clampDecimalInput(value, 6)
}

export function paymentValidityMode(source?: { validStartDate?: string; validEndDate?: string }): 'timed' | 'deadline' {
  const start = String(source?.validStartDate || '').slice(0, 10)
  const end = String(source?.validEndDate || '').slice(0, 10)
  return start || end ? 'timed' : 'deadline'
}

export function mainValidityUnlimited(source?: { validEndDate?: string; consumeDeadline?: string } | null): boolean {
  if (!source) return false
  return !String(source.validEndDate || '').trim() && !String(source.consumeDeadline || '').trim()
}

export function amountBelowRefundMax(amount: unknown, maxAmount: number | null): boolean {
  const value = Number(amount)
  if (!Number.isFinite(value) || !(value > 0) || maxAmount == null || !(maxAmount > 0)) return false
  return Math.round(value * 100) < Math.round(maxAmount * 100)
}

export function paymentFormError(values: Record<string, unknown>, student: Student, card?: Card, payments: PayRecord[] = [], coaches: Named[] = [], limits?: { regular: number; gift: number; amount?: number }) {
  if (Number(student.status) === 2) return '该学员已结业，不能缴费'
  const type = String(values.type || 'new')
  const reason = String(values.adjustmentReason || '')
  const category = String(card?.cardCategory || student.cardCategory || '').toUpperCase()
  const stored = category === 'STORED_VALUE'
  const period = category === 'PERIOD'
  const hoursCard = !stored && !period
  const amount = Number(values.amount)
  const hours = Number(values.hours || 0)
  const gift = Number(values.giftHours || 0)
  const date = String(values.paymentDate || '')
  if (!Number.isFinite(amount)) return '金额必须是有效数字'
  if (amount > 999999.99) return '金额不能超过999999.99'
  if (type !== 'adjustment' && amount <= 0) return '缴费金额必须大于0'
  if (type === 'refund' && stored && amount > Number(card?.remainingAmount || student.remainingAmount || 0) + 0.000001) {
    const refundable = Number(card?.remainingAmount || student.remainingAmount || 0)
    return refundable > 0 ? `最多可退¥${refundable.toFixed(2)}` : '当前无可退余额'
  }
  if (type !== 'adjustment' && !values.paymentMethod) return '请选择支付方式'
  if (hoursCard && !decimalLimit(values.hours)) return '正式课时最多6位整数和2位小数'
  if (hoursCard && !decimalLimit(values.giftHours)) return '赠课课时最多6位整数和2位小数'
  if (hours > 999999.99) return '正式课时不能超过999999.99'
  if (gift > 999999.99) return '赠课课时不能超过999999.99'
  if (hoursCard && (type === 'new' || type === 'renew') && hours <= 0) return '正式课时必须大于0'
  if (type === 'renew' && values.activateHours) {
    const selected = Array.isArray(values.activateSourceRecordIds) ? values.activateSourceRecordIds.filter((id) => Number(id) > 0) : []
    if (!selected.length) return '请选择要合并的课时'
  }
  if (type === 'supplement' && (stored || period) && amount <= 0) return '请输入补缴金额'
  if (type === 'supplement' && hoursCard && hours <= 0 && gift <= 0) return '请至少填写补缴正课或赠课课时'
  const regularAvailable = limits?.regular ?? Number(card?.regularHours ?? card?.remainingHours ?? student.remainingHours ?? 0)
  const giftAvailable = limits?.gift ?? Number(card?.bonusHours ?? student.bonusHours ?? 0)
  if (type === 'refund' && hoursCard) {
    if (regularAvailable > 0 && hours <= 0) return '请填写退费正课'
    if (giftAvailable > 0 && gift <= 0) return '请填写退费赠课'
    if (hours <= 0 && gift <= 0) return '请填写退费正课和退费赠课'
    if (hours > regularAvailable) return `最多可退${regularAvailable}课时正课`
    if (gift > giftAvailable) return `最多可退${giftAvailable}课时赠课`
  }
  if (type === 'adjustment') {
    const amountAdjust = stored && ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'transfer'].includes(reason)
    if (amountAdjust) {
      if (amount <= 0) return reason === 'transfer' ? '请输入转让金额' : '请输入调整金额'
      const balance = limits?.amount ?? Number(card?.remainingAmount || student.remainingAmount || 0)
      if (['manual_deduct_amount', 'clear_amount', 'transfer'].includes(reason) && amount > balance + 0.000001) {
        return reason === 'transfer' ? `最多可转¥${balance.toFixed(2)}` : `最多可扣减¥${balance.toFixed(2)}`
      }
      if (reason === 'transfer' && !values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
    } else if (period && reason === 'transfer') {
      if (!values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
    } else {
      if (amount !== 0) return '课时调整金额必须为0'
      if (reason === 'manual_deduct' && hours > regularAvailable) return `最多可扣减${regularAvailable}课时正课`
      if (reason === 'transfer' && hours > regularAvailable) return `最多可转${regularAvailable}课时正课`
      if (reason === 'transfer' && gift > giftAvailable) return `最多可转${giftAvailable}课时赠课`
      if (reason === 'gift_expired' && gift > giftAvailable) return `最多可扣减${giftAvailable}课时赠课`
      if (reason === 'manual_deduct' && hours <= 0) return '请输入要扣减的正课课时'
      if (reason === 'transfer' && hours <= 0 && gift <= 0) return '请输入要转出的正课或赠课课时'
      if (reason === 'transfer' && !values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
      if (reason === 'gift_expired' && gift <= 0) return '请输入要扣减的赠课课时'
      if (reason === 'activity_gift' && gift <= 0) return '请输入赠送的赠课课时'
      if (reason === 'clear_hours') {
        if (hours <= 0 && gift <= 0) return '请至少填写要清空的正课或赠课课时'
        if (hours > regularAvailable) return `最多可扣减${regularAvailable}课时正课`
        if (gift > giftAvailable) return `最多可扣减${giftAvailable}课时赠课`
      }
    }
  }
  if ((type === 'new' || type === 'renew' || type === 'supplement') && values.commissionEnabled) {
    const rows = (Array.isArray(values.commissionAllocations) ? values.commissionAllocations : []) as Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>
    const usable = rows.filter((item) => Number(item?.memberId || 0) > 0)
    if (!usable.length) return '请选择提成人员'
    for (const item of usable) {
      const rate = Number(item.commissionRate || 0)
      const commissionAmount = Number(item.commissionAmount || 0)
      if (!(rate > 0) && !(commissionAmount > 0)) {
        const member = coaches.find((coach) => coach.id === Number(item.memberId))
        return `请设置${member ? personName(member) : '提成人员'}的提成`
      }
      if (rate > 100) return '提成比例不能超过100%'
    }
  }
  if (!date) return `请选择${paymentDateLabel(type, reason, category)}`
  const main = payments.find((item) => item.id === Number(values.mainRecordId))
  const originalDate = String(main?.paymentDate || '').slice(0, 10)
  if ((type === 'adjustment' || type === 'supplement' || type === 'refund') && originalDate && date < originalDate) return `调整日期不能早于原缴费日期 ${originalDate}`
  if (type === 'refund' && date > todayIso()) return '退费日期不能是未来日期'
  const start = String(values.validStartDate || '').slice(0, 10)
  const end = String(values.validEndDate || '').slice(0, 10)
  const deadline = String(values.consumeDeadline || '').slice(0, 10)
  const mode = String(values.validityMode || '')
  const periodError = periodValidityError(category, type, start, end, card?.periodType)
  if (periodError) return periodError
  const needsRange = !period && mode === 'timed' && (type === 'new' || type === 'renew' || type === 'supplement' || (type === 'adjustment' && reason === 'transfer'))
  if (needsRange && (!start || !end)) return '请选择有效期开始和结束日期'
  if (start && end && end < start) return '有效期结束不能早于开始'
  if (type === 'supplement' && !period && mode === 'deadline' && !deadline) return '请选择有效期至'
  if (type === 'refund' && period && values.belowRefundMax) {
    if (!start || !end) return '请选择更改后的有效期'
    if (end < start) return '有效期结束不能早于开始'
  }
  if ((type === 'supplement' || type === 'adjustment') && !values.mainRecordId) return '缺少主缴费记录，请返回重新点击调整'
  return ''
}

