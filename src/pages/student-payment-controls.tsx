import { Button, Form, InputNumber, Select, Space, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { AppIcon, money, todayIso } from './kit'
import type { Card, Named, PayRecord } from './students-model'
import { serviceOriginalPrice } from './student-card-desk'
import { clampPaymentDecimal } from './student-payments'
import { checkInHoursText } from './student-checkins'
import { personName } from './students-domain'

export interface RefundBalance {
  refundBaseAmount?: number
  maxRefundAmount?: number
  remainingAmount?: number
  refundFeeEnabled?: boolean
  refundFeePercent?: number
  refundCalcMethodLabel?: string
  refundCalcNote?: string
  refundCalcTerms?: Array<{ operator?: string; value?: string; label?: string }>
  paidAmount?: number
  remainingRegularHours?: number
  remainingBonusHours?: number
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
}

export function clampRefundFeePercent(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.min(30, Number(numeric.toFixed(2)))
}

export function refundCap(balance: RefundBalance, feePercent: unknown): number {
  const base = Math.max(0, Number(balance.refundBaseAmount ?? balance.maxRefundAmount ?? balance.remainingAmount ?? 0))
  if (!balance.refundFeeEnabled) return Number(Number(balance.maxRefundAmount ?? base).toFixed(2))
  const percent = clampRefundFeePercent(feePercent ?? balance.refundFeePercent ?? 0)
  if (percent <= 0) return Number(base.toFixed(2))
  return Number((base * (1 - percent / 100)).toFixed(2))
}

export function formatRefundFormulaAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function refundFormulaTerms(balance: RefundBalance, feePercent: unknown, finalAmount: number): Array<{ operator: string; value: string; label: string }> {
  const expression = (balance.refundCalcTerms || [])
    .map((item) => ({
      operator: String(item.operator || '').trim(),
      value: String(item.value || '').trim(),
      label: String(item.label || '').trim(),
    }))
    .filter((item) => item.value && item.operator !== '=')
  if (!expression.length) return []
  const percent = clampRefundFeePercent(feePercent ?? balance.refundFeePercent ?? 0)
  const terms = expression.slice()
  if (balance.refundFeeEnabled && percent > 0) {
    terms.push({ operator: '×', value: `(1−${String(percent)}%)`, label: '手续费' })
  }
  terms.push({ operator: '=', value: `¥${formatRefundFormulaAmount(finalAmount)}`, label: '' })
  return terms
}

export function groupMatchesCoach(group: Named, coachId: number): boolean {
  if (!coachId) return true
  const ids = group.coachIds?.length ? group.coachIds : group.coachId ? [group.coachId] : []
  return !ids.length || ids.map(Number).includes(coachId)
}

export function paymentCoachChoices(card: Card | undefined, groups: Named[], coaches: Named[], serviceOnly: boolean): Array<{ id: number; label: string; locked: boolean }> {
  if (serviceOnly || !card) return []
  const labelFor = (id: number, preferred?: string) => {
    const text = String(preferred || '').trim()
    if (text) return text
    const coach = coaches.find((item) => item.id === id)
    return coach ? personName(coach) : `老师${id}`
  }
  const assigned = (card.coachMemberIds || []).map(Number).filter((id) => id > 0)
  if (assigned.length) {
    return assigned.map((id, index) => ({ id, label: labelFor(id, card.coachMemberNames?.[index]), locked: true }))
  }
  const seen = new Set<number>()
  const rows: Array<{ id: number; label: string; locked: boolean }> = []
  groups.forEach((group) => {
    const ids = group.coachIds?.length ? group.coachIds : group.coachId ? [group.coachId] : []
    ids.map(Number).filter((id) => id > 0).forEach((id) => {
      if (seen.has(id)) return
      seen.add(id)
      rows.push({ id, label: labelFor(id), locked: false })
    })
  })
  return rows
}

export function recordAmountImpact(type: string, reason: string, amount: number): number {
  const value = Math.max(0, Number(amount || 0))
  if (type === 'refund') return -value
  if (type !== 'adjustment') return 0
  if (reason === 'manual_deduct_amount' || reason === 'clear_amount') return -value
  if (reason === 'manual_add_amount') return value
  return 0
}

export function amountOverLimitHint(reason: string, amount: unknown, available: number): string {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  if (reason !== 'manual_deduct_amount' && reason !== 'clear_amount' && reason !== 'transfer') return ''
  if (numeric <= available + 0.000001) return ''
  const text = Number(available || 0).toFixed(2)
  return reason === 'transfer'
    ? `转让金额不能超过可转余额¥${text}`
    : `扣减金额不能超过可扣余额¥${text}`
}

export function recordHoursImpact(type: string, reason: string, hours: number, giftHours: number): { regular: number; gift: number } {
  const regular = Math.max(0, Number(hours || 0))
  const gift = Math.max(0, Number(giftHours || 0))
  if (type === 'refund') return { regular: -regular, gift: -gift }
  if (type === 'supplement') return { regular: 0, gift: 0 }
  if (type === 'adjustment') {
    if (reason === 'manual_deduct') return { regular: -regular, gift: 0 }
    if (reason === 'gift_expired') return { regular: 0, gift: -gift }
    if (reason === 'clear_hours' || reason === 'transfer') return { regular: -regular, gift: -gift }
    if (reason === 'activity_gift') return { regular: 0, gift }
  }
  return { regular, gift }
}

export function hoursReasonUnavailable(reason: string, regularAvailable: number, giftAvailable: number): boolean {
  if (reason === 'gift_expired') return giftAvailable <= 0
  if (reason === 'manual_deduct') return regularAvailable <= 0
  if (reason === 'clear_hours' || reason === 'transfer') return regularAvailable <= 0 && giftAvailable <= 0
  return false
}

export function adjustmentReasonOptions(
  category: string,
  current?: string,
  limits?: { ready: boolean; regular: number; gift: number },
): Array<{ value: string; label: string; disabled?: boolean }> {
  const card = String(category || '').toUpperCase()
  const mark = (options: Array<{ value: string; label: string }>) => options.map((item) => ({
    ...item,
    disabled: !!(limits?.ready && card !== 'PERIOD' && card !== 'STORED_VALUE' && hoursReasonUnavailable(item.value, limits.regular, limits.gift)),
  }))
  if (card === 'PERIOD') return mark([{ value: 'transfer', label: '转让' }])
  if (card === 'STORED_VALUE') {
    const options = [
      { value: 'manual_deduct_amount', label: '扣减金额' },
      { value: 'clear_amount', label: '清空余额' },
      { value: 'transfer', label: '转让' },
    ]
    if (current === 'manual_add_amount') options.splice(1, 0, { value: 'manual_add_amount', label: '增加余额' })
    return mark(options)
  }
  return mark([
    { value: 'gift_expired', label: '扣赠课' },
    { value: 'manual_deduct', label: '扣正课' },
    { value: 'activity_gift', label: '送赠课' },
    { value: 'clear_hours', label: '清空课时' },
    { value: 'transfer', label: '转课' },
  ])
}

export function hoursLimitText(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Number(value.toFixed(2))
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/(\.\d*?)0+$/, '$1')
}

export function hoursOverLimitMessage(kind: 'refund' | 'transfer' | 'deduct', target: 'regular' | 'gift', available: number): string {
  const hoursText = hoursLimitText(available)
  if (kind === 'refund') return target === 'gift' ? `最多可退${hoursText}课时赠课` : `最多可退${hoursText}课时正课`
  if (kind === 'transfer') return target === 'gift' ? `最多可转${hoursText}课时赠课` : `最多可转${hoursText}课时正课`
  return target === 'gift' ? `最多可扣减${hoursText}课时赠课` : `最多可扣减${hoursText}课时正课`
}

export function LimitedHours(props: { name: 'hours' | 'giftHours'; label: string; max: number; warning: string }) {
  return (
    <Form.Item name={props.name} label={props.label} getValueFromEvent={(value) => {
      const next = clampPaymentDecimal(value)
      if (next == null) return value
      if (next <= props.max) return next
      message.warning(props.warning)
      return clampPaymentDecimal(props.max)
    }}>
      <InputNumber style={{ width: '100%' }} min={0} />
    </Form.Item>
  )
}

export function adjustmentHourFields(reason: string, category: string): { regular: boolean; gift: boolean; regularLabel: string; giftLabel: string; hint: string } {
  const card = String(category || '').toUpperCase()
  const hoursTransfer = card !== 'PERIOD' && card !== 'STORED_VALUE'
  if (reason === 'manual_deduct') return { regular: true, gift: false, regularLabel: '扣减正课', giftLabel: '赠课课时', hint: '该记录只扣减正课课时，不产生金额。' }
  if (reason === 'activity_gift') return { regular: false, gift: true, regularLabel: '正课课时', giftLabel: '赠送赠课', hint: '该记录只增加赠课课时，不产生金额。' }
  if (reason === 'clear_hours') return { regular: true, gift: true, regularLabel: '扣减正课', giftLabel: '扣减赠课', hint: '该记录会同时扣减正课和赠课课时，不产生金额。' }
  if (reason === 'transfer') {
    return {
      regular: hoursTransfer,
      gift: hoursTransfer,
      regularLabel: '转正课课时',
      giftLabel: '转赠课课时',
      hint: card === 'PERIOD' ? '将该时段卡转让给其他学员。可转金额按剩余天数折算，不产生实收。' : '',
    }
  }
  if (reason === 'manual_deduct_amount') return { regular: false, gift: false, regularLabel: '', giftLabel: '', hint: '该记录只扣减储值余额，不产生实收金额。' }
  if (reason === 'manual_add_amount') return { regular: false, gift: false, regularLabel: '', giftLabel: '', hint: '该记录只增加储值余额，无需选择支付方式。' }
  if (reason === 'clear_amount') return { regular: false, gift: false, regularLabel: '', giftLabel: '', hint: '将按当前剩余余额清空，不产生实收金额。' }
  return { regular: false, gift: true, regularLabel: '正课课时', giftLabel: '扣减赠课', hint: '该记录只扣减赠课课时，不产生金额。' }
}

export function activateEndDate(record: PayRecord): string {
  return [record.validEndDate, record.consumeDeadline]
    .map((item) => String(item || '').trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
    .sort()[0] || ''
}

export function activateHourStatus(record: PayRecord): { text: string; rank: number } {
  const end = activateEndDate(record)
  if (!end) return { text: '不限期', rank: 2 }
  const days = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000)
  if (days < 0) return { text: `${end} 已过期`, rank: 0 }
  return { text: `${end} 到期`, rank: 1 }
}

export function activateHourTitle(record: PayRecord): string {
  const typeLabel = record.type === 'renew' ? '续费' : '新增'
  const paymentDate = String(record.paymentDate || '').trim()
  return paymentDate ? `${paymentDate} ${typeLabel}` : typeLabel
}

export function activateHourOptions(records: PayRecord[], cardId: number): PayRecord[] {
  const today = todayIso()
  return records.filter((record) => {
    const type = String(record.type || '')
    if (type !== 'new' && type !== 'renew') return false
    const remaining = Number(record.remainingHours || 0)
    if (!(remaining > 0)) return false
    const recordCardId = Number(record.studentCardId || 0)
    if (cardId > 0 && recordCardId !== cardId) return false
    if (!cardId && recordCardId > 0) return false
    if (remaining < 5) return true
    const end = activateEndDate(record)
    if (!end) return false
    const days = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
    return days <= 5
  }).sort((left, right) => {
    const rank = activateHourStatus(left).rank - activateHourStatus(right).rank
    if (rank !== 0) return rank
    const leftTitle = activateHourTitle(left)
    const rightTitle = activateHourTitle(right)
    return rightTitle < leftTitle ? -1 : rightTitle > leftTitle ? 1 : 0
  })
}

export function ActivateHourPicker(props: { value?: number[]; onChange?: (value: number[]) => void; records: PayRecord[] }) {
  const selected = new Set((props.value || []).map((id) => Number(id)))
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {props.records.map((item) => {
        const on = selected.has(item.id)
        return (
          <Button key={item.id} htmlType="button" block type={on ? 'primary' : 'default'} onClick={() => {
            const next = on ? [...selected].filter((id) => id !== item.id) : [...selected, item.id]
            props.onChange?.(next)
          }}>
            {activateHourTitle(item)} · {activateHourStatus(item).text} · 剩余{checkInHoursText(Number(item.remainingHours || 0))}课时
          </Button>
        )
      })}
    </Space>
  )
}

export function SilentIds(props: { value?: number[]; onChange?: (next: number[]) => void }) {
  void props
  return null
}

export function PaymentStoredPricing(props: { groups: Named[]; services: Named[]; card?: Card; pricing: boolean }) {
  const form = Form.useFormInstance()
  const payType = Form.useWatch('type')
  const courseType = Form.useWatch('courseType')
  const picked = ((Form.useWatch('pickedServiceIds') as number[] | undefined) || []).map((id) => Number(id)).filter((id) => id > 0)
  if (payType !== 'new' && payType !== 'renew') return null
  const category = String(props.card?.cardCategory || '').toUpperCase()
  const serviceCard = (category === 'STORED_VALUE' || category === 'PERIOD') && props.card?.courseCategory === false
  const bound = (props.card?.serviceItemIds || []).map((id) => Number(id)).filter((id) => id > 0)
  const choosing = serviceCard && bound.length === 0
  const serviceIds = choosing ? picked : bound
  const group = props.pricing ? props.groups.find((item) => String(item.id) === String(courseType || '')) : undefined
  const original = Number(group?.unitPrice || 0)
  if (!group && !serviceIds.length && !choosing) return null
  const serviceNames = serviceIds.map((id) => {
    const service = props.services.find((item) => item.id === id)
    return service ? personName(service) : `服务${id}`
  }).join('、')
  return (
    <>
      <Form.Item name="pickedServiceIds" hidden initialValue={[]}>
        <SilentIds />
      </Form.Item>
      {choosing ? (
        <div className="panel-block">
          <strong>适用服务</strong>
          <p>转校区后需重新选择</p>
          {props.services.length ? (
            <div className="choice-tabs">
              {props.services.map((service) => {
                const on = serviceIds.includes(service.id)
                return (
                  <button
                    key={service.id}
                    type="button"
                    className={on ? 'is-on' : ''}
                    onClick={() => {
                      const next = on ? serviceIds.filter((id) => id !== service.id) : [...serviceIds, service.id]
                      form.setFieldValue('pickedServiceIds', next)
                    }}
                  >{personName(service)}</button>
                )
              })}
            </div>
          ) : <p>当前校区暂无可选服务，请先在校区设置中配置</p>}
        </div>
      ) : serviceNames ? <p>适用服务 {serviceNames}</p> : null}
      {group ? (
        <div className="panel-block">
          <strong>课程类型折扣</strong>
          <p>{original > 0 ? `原价 ¥${money(original)}/小时。折扣和折后单价会互相换算。` : '该课程未设置单价，请填写折扣。'}</p>
          <Space wrap>
            <Form.Item name="courseDiscount" label="折扣%" rules={[{ required: true, message: '请填写课程类型折扣' }]}>
              <InputNumber
                min={0}
                max={100}
                placeholder="如 95"
                onChange={(value) => {
                  if (value == null || original <= 0) return
                  form.setFieldValue('courseUnitPrice', Number(((original * Number(value)) / 100).toFixed(2)))
                }}
              />
            </Form.Item>
            <Form.Item name="courseUnitPrice" label="折后单价">
              <InputNumber
                min={0}
                placeholder="元/小时"
                onChange={(value) => {
                  if (original <= 0) return
                  if (value == null) {
                    form.setFieldValue('courseDiscount', undefined)
                    return
                  }
                  form.setFieldValue('courseDiscount', Math.min(100, Number(((Number(value) / original) * 100).toFixed(2))))
                }}
              />
            </Form.Item>
          </Space>
        </div>
      ) : null}
      {props.pricing ? serviceIds.map((id) => {
        const service = props.services.find((item) => item.id === id)
        const serviceOriginal = serviceOriginalPrice(service)
        return (
          <Space key={id} wrap>
            <span>{service ? personName(service) : `服务${id}`} · 原价 ¥{money(serviceOriginal)}</span>
            <Form.Item name={['serviceRightDiscount', String(id)]} label="折扣%" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                max={100}
                onChange={(value) => {
                  if (value == null || serviceOriginal <= 0) return
                  form.setFieldValue(['serviceRightPrice', String(id)], Number(((serviceOriginal * Number(value)) / 100).toFixed(2)))
                }}
              />
            </Form.Item>
            <Form.Item name={['serviceRightPrice', String(id)]} label="折后单价" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                onChange={(value) => {
                  if (serviceOriginal <= 0) return
                  if (value == null) {
                    form.setFieldValue(['serviceRightDiscount', String(id)], undefined)
                    return
                  }
                  form.setFieldValue(['serviceRightDiscount', String(id)], Math.min(100, Number(((Number(value) / serviceOriginal) * 100).toFixed(2))))
                }}
              />
            </Form.Item>
          </Space>
        )
      }) : null}
    </>
  )
}

export function ValidityStartDate({ minDate }: { minDate?: string }) {
  const form = Form.useFormInstance()
  return (
    <Form.Item name="validStartDate" label="有效期开始" getValueFromEvent={(event) => {
      const value = String(event?.target?.value ?? event ?? '')
      const floor = String(minDate || '').slice(0, 10)
      if (floor && value && value < floor) {
        message.warning(`有效期开始不能早于原缴费日期 ${floor}`)
        return floor
      }
      const end = String(form.getFieldValue('validEndDate') || '').slice(0, 10)
      if (value && end && value > end) form.setFieldValue('validEndDate', value)
      return value
    }}>
      <BusinessDatePicker minDate={minDate || undefined} />
    </Form.Item>
  )
}

export function ValidityEndDate() {
  const form = Form.useFormInstance()
  return (
    <Form.Item name="validEndDate" label="有效期结束" getValueFromEvent={(event) => {
      const value = String(event?.target?.value ?? event ?? '')
      const start = String(form.getFieldValue('validStartDate') || '').slice(0, 10)
      if (start && value && value < start) {
        message.warning('结束日期不能早于开始日期')
        const current = String(form.getFieldValue('validEndDate') || '')
        return current
      }
      return value
    }}>
      <BusinessDatePicker />
    </Form.Item>
  )
}

export function TransferTargetSelect(props: {
  studentId: number
  courseType?: string
  label: string
  fallbackName?: string
  value?: number
  onChange?: (value?: number) => void
}) {
  const [rows, setRows] = useState<Array<{ id: number; name: string; phone: string; gender?: number }>>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const requestSeq = useRef(0)
  const selected = rows.find((item) => item.id === props.value)
  const options = selected || !props.value
    ? rows
    : [{ id: props.value, name: props.fallbackName || '', phone: '', gender: undefined }, ...rows]

  async function search(raw: string) {
    const trimmed = raw.trim()
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    setKeyword(trimmed)
    if (!trimmed) {
      setLoading(false)
      setRows((current) => current.filter((item) => item.id === props.value))
      return
    }
    setLoading(true)
    try {
      const list = await getJson<Array<{ studentId?: number; studentName?: string; studentPhone?: string; studentGender?: number }>>('/payment-records/transfer-targets', {
        studentId: props.studentId,
        courseType: props.courseType || undefined,
        keyword: trimmed,
      })
      if (seq !== requestSeq.current) return
      const next = (list || []).flatMap((item) => {
        const id = Number(item.studentId || 0)
        const name = String(item.studentName || '').trim()
        if (!id || !name) return []
        return [{ id, name, phone: String(item.studentPhone || '').trim(), gender: item.studentGender }]
      })
      setRows(next)
    } catch {
      if (seq !== requestSeq.current) return
      setRows((current) => current.filter((item) => item.id === props.value))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  return (
    <Select
      showSearch
      filterOption={false}
      value={props.value}
      placeholder={`搜索并选择${props.label}`}
      loading={loading}
      notFoundContent={!keyword ? null : loading ? '搜索中...' : '未找到匹配学员'}
      onSearch={(value) => { search(value).catch(() => undefined) }}
      onChange={props.onChange}
      options={options.map((item) => ({
        value: item.id,
        label: [item.name, item.phone].filter(Boolean).join(' · '),
      }))}
      optionRender={(option) => {
        const row = options.find((item) => item.id === option.value)
        const gender = Number(row?.gender || 0)
        return (
          <span className="name-with-icon">
            {gender === 1 || gender === 2 ? <AppIcon name={gender === 2 ? 'icon-gender-female' : 'icon-gender-male'} size={16} /> : null}
            <span>{option.label}</span>
          </span>
        )
      }}
    />
  )
}

export function syncCommissionByPayment(
  rows: Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>,
  paymentAmount: number,
) {
  return rows.map((item) => {
    const rate = Number(item.commissionRate || 0)
    const currentAmount = Number(item.commissionAmount || 0)
    if (!(rate > 0) && !(currentAmount > 0)) return item
    if (rate > 0) {
      const capped = Math.min(rate, 100)
      return {
        ...item,
        commissionRate: capped,
        commissionAmount: paymentAmount > 0 ? Number(((paymentAmount * capped) / 100).toFixed(2)) : undefined,
      }
    }
    if (currentAmount > 0 && paymentAmount > 0) {
      let nextRate = Number(((currentAmount * 100) / paymentAmount).toFixed(2))
      let nextAmount = currentAmount
      if (nextRate > 100) {
        nextRate = 100
        nextAmount = Number(paymentAmount.toFixed(2))
      }
      return { ...item, commissionRate: nextRate, commissionAmount: nextAmount }
    }
    return item
  })
}

export function sameCommissionRows(
  left: Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>,
  right: Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>,
) {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return Number(item.memberId || 0) === Number(other.memberId || 0)
      && Number(item.commissionRate || 0) === Number(other.commissionRate || 0)
      && Number(item.commissionAmount || 0) === Number(other.commissionAmount || 0)
  })
}

export function commissionSummary(row?: { commissionRate?: number; commissionAmount?: number }): string {
  const rate = Number(row?.commissionRate || 0)
  const amount = Number(row?.commissionAmount || 0)
  if (!(rate > 0) && !(amount > 0)) return ''
  const rateText = String(rate).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') || '0'
  return `${rateText}% · ¥${amount.toFixed(2)}`
}

export function CommissionPeople(props: { coaches: Named[]; value?: Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>; onChange?: (value: Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>) => void }) {
  const form = Form.useFormInstance()
  const rows = props.value || []
  const amount = Number(Form.useWatch('amount', form) || 0)
  const [activeId, setActiveId] = useState(0)
  const seeded = useRef(false)
  const people = props.coaches.filter((item) => Number(item.status ?? 1) === 1 && personName(item))
  const active = rows.find((item) => Number(item.memberId) === activeId)

  useEffect(() => {
    if (seeded.current || activeId) return
    const first = rows.find((item) => Number(item.memberId || 0) > 0)
    if (!first) return
    seeded.current = true
    setActiveId(Number(first.memberId))
  }, [rows, activeId])

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const seenAmount = useRef<number | null>(null)
  useEffect(() => {
    if (seenAmount.current === amount) return
    const previous = seenAmount.current
    seenAmount.current = amount
    if (previous == null) return
    const next = syncCommissionByPayment(rowsRef.current, amount)
    if (sameCommissionRows(next, rowsRef.current)) return
    props.onChange?.(next)
  }, [amount])

  function configured(row?: { commissionRate?: number; commissionAmount?: number }) {
    return Number(row?.commissionRate || 0) > 0 || Number(row?.commissionAmount || 0) > 0
  }

  function choose(id: number) {
    if (activeId === id) {
      props.onChange?.(rows.filter((item) => Number(item.memberId) !== id || configured(item)))
      setActiveId(0)
      return
    }
    const kept = rows.filter((item) => Number(item.memberId) !== activeId || configured(item))
    const next = kept.some((item) => Number(item.memberId) === id) ? kept : [...kept, { memberId: id }]
    props.onChange?.(next)
    setActiveId(id)
  }

  function patchActive(patch: { commissionRate?: number; commissionAmount?: number }) {
    props.onChange?.(rows.map((item) => Number(item.memberId) === activeId ? { ...item, ...patch } : item))
  }

  return (
    <div>
      <div className="work-toolbar">
        <span>提成人员</span>
        <span>点选后设置该人员提成</span>
      </div>
      {people.length ? (
        <div className="work-toolbar">
          {people.map((item) => {
            const row = rows.find((entry) => Number(entry.memberId) === item.id)
            const summary = commissionSummary(row)
            const on = activeId === item.id || !!summary
            return (
              <Button key={item.id} htmlType="button" type={on ? 'primary' : 'default'} onClick={() => choose(item.id)}>
                {personName(item)}{summary ? ` ${summary}` : ''}
              </Button>
            )
          })}
        </div>
      ) : <p>暂无可选人员</p>}
      <Space style={{ marginTop: 8 }}>
        <InputNumber
          min={0}
          max={100}
          disabled={!activeId}
          placeholder="0"
          addonAfter="%"
          value={activeId ? active?.commissionRate : undefined}
          onChange={(value) => {
            if (!activeId || value == null) {
              if (activeId) patchActive({ commissionRate: undefined, commissionAmount: amount > 0 ? undefined : active?.commissionAmount })
              return
            }
            const rate = Math.min(100, Number(value))
            patchActive({
              commissionRate: rate,
              commissionAmount: amount > 0 ? Number(((amount * rate) / 100).toFixed(2)) : active?.commissionAmount,
            })
          }}
        />
        <InputNumber
          min={0}
          disabled={!activeId}
          placeholder="0.00"
          addonBefore="¥"
          value={activeId ? active?.commissionAmount : undefined}
          onChange={(value) => {
            if (!activeId || value == null) return
            const raw = Number(value)
            if (!(amount > 0)) {
              patchActive({ commissionAmount: raw })
              return
            }
            const rate = Number(((raw * 100) / amount).toFixed(2))
            const nextRate = Math.min(100, rate)
            const nextAmount = nextRate < rate ? Number(amount.toFixed(2)) : raw
            patchActive({ commissionRate: nextRate, commissionAmount: nextAmount })
          }}
        />
      </Space>
      {activeId ? <p>当前：{personName(people.find((item) => item.id === activeId))}</p> : null}
    </div>
  )
}
