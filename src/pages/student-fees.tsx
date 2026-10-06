import { Button, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Tag, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { tell } from './kit'
import type { Card, ServiceRight, Student } from './students-model'

interface PricingRule {
  targetType?: string
  targetId?: number
  targetName?: string
  discount?: number | string
  unitPrice?: number | string
}

interface CoursePricing {
  id?: number
  courseName?: string
  cardCategory?: string
  price?: number | string
  hours?: number | string
  unitPrice?: number | string
  periodType?: string
  courseIds?: number[]
  serviceItemIds?: number[]
  pricingRules?: PricingRule[]
  description?: string
}

interface FeeItem {
  id: number
  coursePricingId?: number
  name?: string
  amount?: number
  hours?: number
  giftHours?: number
  studentCardId?: number
  description?: string
  paymentDeadline?: unknown
  expired?: boolean
  enabled?: boolean
  chargeSnapshot?: unknown
}

interface CardOption extends Card {
  id: number
  label: string
  categoryLabel: string
}

const PERIOD_DAYS: Record<string, number> = {
  WEEK: 7,
  MONTH: 31,
  QUARTER: 93,
  HALF_YEAR: 180,
  YEAR: 365,
}

function textOf(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function formatDecimal(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0'
  return amount.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function dateText(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const year = Number(value[0])
    const month = Number(value[1])
    const day = Number(value[2])
    if (year > 0 && month > 0 && day > 0) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const text = textOf(value)
  return text.length >= 10 ? text.slice(0, 10) : text
}

function todayText(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(dateTextValue: string, days: number): string {
  const parts = String(dateTextValue || '').split('-').map(Number)
  const date = new Date(parts[0], Math.max(0, (parts[1] || 1) - 1), parts[2] || 1)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function categoryOf(value: unknown): 'HOURS' | 'STORED_VALUE' | 'PERIOD' {
  const category = textOf(value).toUpperCase()
  if (category === 'STORED_VALUE' || category === 'PERIOD') return category
  return 'HOURS'
}

function categoryLabel(category: string, periodType?: string): string {
  if (category === 'PERIOD') {
    const labels: Record<string, string> = { WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' }
    return labels[textOf(periodType).toUpperCase()] || '时段卡'
  }
  if (category === 'STORED_VALUE') return '储值卡'
  return '课时卡'
}

function parseCharge(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  const text = textOf(value)
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

function asFee(item: Record<string, unknown>): FeeItem {
  return item as unknown as FeeItem
}

function cardOptions(student: Student): CardOption[] {
  return (student.cards || [])
    .filter((card) => Number(card.id || 0) > 0 && Number(card.status ?? 1) === 1)
    .map((card, index) => {
      const label = categoryLabel(String(card.cardCategory || 'HOURS'), card.periodType)
      const bindingName = textOf(card.studentGroupName) || (card.serviceItemNames || []).map(textOf).filter(Boolean).join('、')
      return { ...card, id: Number(card.id), categoryLabel: label, label: textOf(card.cardName) || bindingName || `${label}${index + 1}` }
    })
}

function filterCards(cards: CardOption[], pricing?: CoursePricing): CardOption[] {
  if (!pricing) return [...cards]
  const category = categoryOf(pricing.cardCategory)
  const courseIds = new Set((pricing.courseIds || []).map(Number).filter((id) => id > 0))
  const serviceItemIds = new Set((pricing.serviceItemIds || []).map(Number).filter((id) => id > 0))
  return cards.filter((card) => {
    if (categoryOf(card.cardCategory) !== category) return false
    if (category === 'PERIOD' && textOf(pricing.periodType) && textOf(card.periodType).toUpperCase() !== textOf(pricing.periodType).toUpperCase()) return false
    if (!courseIds.size && !serviceItemIds.size) return true
    if (courseIds.has(Number(card.studentGroupId || 0))) return true
    return (card.serviceItemIds || []).some((id) => serviceItemIds.has(Number(id)))
  })
}

function periodEnd(card: CardOption | undefined, startDate: string): string {
  if (categoryOf(card?.cardCategory) !== 'PERIOD') return ''
  const days = PERIOD_DAYS[textOf(card?.periodType).toUpperCase()] || 0
  return days > 0 ? addDays(startDate, days - 1) : ''
}

function pricingOptionLabel(item: CoursePricing): string {
  const category = categoryOf(item.cardCategory)
  const hoursText = category === 'HOURS' ? ` / ${formatDecimal(item.hours)}课时` : ''
  const categoryText = category === 'PERIOD' ? categoryLabel(category, textOf(item.periodType)) : categoryLabel(category)
  return `${textOf(item.courseName)} · ${categoryText} · ¥${formatDecimal(item.price)}${hoursText}`
}

function buildCharge(student: Student, card: CardOption, pricing: CoursePricing | undefined, hours: string, giftHours: string, description: string, validStartDate: string, validEndDate: string) {
  const category = String(card.cardCategory || 'HOURS')
  const courseType = card.courseCategory === false
    ? ''
    : (Number(card.studentGroupId || 0) > 0 ? String(card.studentGroupId) : (student.oneToOne ? 'one_to_one' : ''))
  const rights: ServiceRight[] = Array.isArray(card.serviceRights) ? card.serviceRights.map((item) => ({ ...item })) : []
  if (category === 'STORED_VALUE' && courseType && !rights.some((item) => textOf(item.courseType) === courseType)) {
    rights.unshift({ courseType, courseTypeLabel: textOf(card.studentGroupName), discount: 100 })
  }
  const configured = new Set(rights.map((item) => textOf(item.courseType)))
  ;(card.serviceItemIds || []).forEach((id, index) => {
    const value = `service:${Number(id)}`
    if (!configured.has(value)) {
      rights.push({
        courseType: value,
        courseTypeLabel: textOf((card.serviceItemNames || [])[index]),
        discount: category === 'STORED_VALUE' ? 100 : undefined,
      })
    }
  })
  const pricingUnitPrice = Number(pricing?.unitPrice || 0)
  const pricingCourseIds = new Set((pricing?.courseIds || []).map(Number))
  const pricingServiceIds = new Set((pricing?.serviceItemIds || []).map(Number))
  const ruleMap = new Map((pricing?.pricingRules || []).map((rule) => [`${textOf(rule.targetType).toUpperCase()}:${Number(rule.targetId || 0)}`, rule]))
  if (category === 'STORED_VALUE') {
    rights.forEach((right) => {
      const rightType = textOf(right.courseType)
      const serviceId = rightType.startsWith('service:') ? Number(rightType.slice('service:'.length)) : 0
      const courseId = serviceId ? 0 : Number(rightType)
      const rule = ruleMap.get(serviceId > 0 ? `SERVICE:${serviceId}` : `COURSE:${courseId}`)
      if (rule) {
        const unitPrice = Number(rule.unitPrice || 0)
        const discount = Number(rule.discount || 0)
        right.unitPrice = unitPrice > 0 ? unitPrice : undefined
        right.discount = discount > 0 ? discount : undefined
        right.courseTypeLabel = textOf(rule.targetName) || right.courseTypeLabel
      } else if (pricingUnitPrice > 0 && ((serviceId > 0 && pricingServiceIds.has(serviceId)) || (courseId > 0 && pricingCourseIds.has(courseId)))) {
        right.unitPrice = pricingUnitPrice
        right.discount = undefined
      }
    })
  }
  const primaryRight = rights.find((item) => textOf(item.courseType) === courseType)
  return {
    type: 'renew',
    hours: category === 'HOURS' ? Number(hours || 0) : 0,
    giftHours: category === 'HOURS' ? Number(giftHours || 0) : 0,
    courseType,
    coachMemberId: Number((card.coachMemberIds || [])[0] || 0) || undefined,
    storedValueRights: rights,
    storedValueDiscount: category === 'STORED_VALUE' ? Number(primaryRight?.discount || 0) || undefined : undefined,
    unitPrice: category === 'STORED_VALUE' ? (Number(primaryRight?.unitPrice || 0) || (pricingUnitPrice > 0 ? pricingUnitPrice : undefined)) : undefined,
    validStartDate: category === 'PERIOD' ? validStartDate : undefined,
    validEndDate: category === 'PERIOD' ? validEndDate : undefined,
    paymentMethod: 2,
    studentCardId: card.id,
    remark: textOf(description),
  }
}

export function FeeItems(props: { student: Student; items: Array<Record<string, unknown>>; onChanged: () => Promise<void> }) {
  const items = props.items.map(asFee)
  const [editor, setEditor] = useState<FeeItem | null | undefined>(undefined)
  const allCards = cardOptions(props.student)
  const cardMap = new Map(allCards.map((card) => [card.id, card.label]))
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div className="staff-form-actions">
        <span>已发布 {items.length} 项。启用后会展示在学员端“专属方案”中。</span>
        <Button type="primary" onClick={() => setEditor(null)}>新建专属方案</Button>
      </div>
      {items.map((item) => {
        const hours = Number(item.hours || 0)
        const giftHours = Number(item.giftHours || 0)
        const deadline = dateText(item.paymentDeadline)
        const cardName = cardMap.get(Number(item.studentCardId || 0)) || ''
        return (
          <div key={item.id}>
            <Space wrap>
              <strong>{textOf(item.name)}</strong>
              <Tag color={item.expired ? 'default' : (item.enabled ? 'blue' : 'default')}>{item.expired ? '已过期' : (item.enabled ? '已启用' : '已停用')}</Tag>
              <span>¥{formatDecimal(item.amount)} · {hours > 0 ? `${formatDecimal(hours)}课时` : '续费方案'}{giftHours > 0 ? ` · 赠${formatDecimal(giftHours)}课时` : ''}</span>
            </Space>
            {cardName ? <p>{cardName}</p> : null}
            <p>{deadline ? `缴费截止 ${deadline}` : '缴费长期有效'}</p>
            {textOf(item.description) ? <p>{textOf(item.description)}</p> : null}
            <Space>
              <Switch
                checked={Boolean(item.enabled)}
                onChange={async (enabled) => {
                  try {
                    await putJson(`/parent-admin/fee-items/${item.id}/enabled`, { enabled })
                    await props.onChanged()
                  } catch (error) {
                    message.error(tell(error, '更新失败'))
                  }
                }}
              />
              <Button type="link" onClick={() => setEditor(item)}>编辑</Button>
              <Popconfirm title="删除缴费方案" description={`确定删除“${textOf(item.name) || '该缴费方案'}”吗？已完成的缴费记录不会受影响。`} onConfirm={async () => {
                try {
                  await delJson(`/parent-admin/fee-items/${item.id}`)
                  await props.onChanged()
                } catch (error) {
                  message.error(tell(error, '删除失败'))
                }
              }}>
                <Button type="link" danger>删除</Button>
              </Popconfirm>
            </Space>
          </div>
        )
      })}
      {!items.length ? <p>还没有专属缴费方案。如需为这名学员设置不同于标准课程的价格，点击“新建专属方案”。</p> : null}
      <FeePlanEditor
        open={editor !== undefined}
        student={props.student}
        item={editor || null}
        onClose={() => setEditor(undefined)}
        onSaved={props.onChanged}
      />
    </Space>
  )
}

function FeePlanEditor(props: { open: boolean; student: Student; item: FeeItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pricings, setPricings] = useState<CoursePricing[]>([])
  const [pricingId, setPricingId] = useState(0)
  const [cards, setCards] = useState<CardOption[]>([])
  const [cardId, setCardId] = useState(0)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const [giftHours, setGiftHours] = useState('')
  const [description, setDescription] = useState('')
  const [paymentDeadline, setPaymentDeadline] = useState('')
  const [validStartDate, setValidStartDate] = useState(todayText())
  const [saving, setSaving] = useState(false)
  const allCards = cardOptions(props.student)
  const selectedPricing = pricings.find((item) => Number(item.id || 0) === pricingId)
  const selectedCard = cards.find((card) => card.id === cardId) || cards[0]
  const validEndDate = periodEnd(selectedCard, validStartDate)
  const editingId = props.item?.id || 0

  useEffect(() => {
    if (!props.open) return
    let cancelled = false
    const editing = props.item
    const student = props.student
    const availableCards = cardOptions(student)
    async function prepare() {
      const campusId = Number(student.campusId || 0)
      const coursePricings = campusId > 0
        ? await getJson<CoursePricing[]>(`/campus-services/${campusId}/course-pricings`, { enabledOnly: 1 }).catch(() => [])
        : []
      if (cancelled) return
      const charge = parseCharge(editing?.chargeSnapshot)
      let pricing = editing
        ? coursePricings.find((item) => Number(item.id || 0) === Number(editing.coursePricingId || 0))
        : undefined
      let nextCards = filterCards(availableCards, pricing)
      const selectedCardId = Number(charge.studentCardId || editing?.studentCardId || 0)
      let matched = nextCards.find((card) => card.id === selectedCardId)
      if (editing && selectedCardId > 0 && !matched) {
        pricing = undefined
        nextCards = [...availableCards]
        matched = nextCards.find((card) => card.id === selectedCardId)
      }
      setPricings(coursePricings)
      setPricingId(pricing ? Number(pricing.id || 0) : 0)
      setCards(nextCards)
      setCardId(matched?.id || nextCards[0]?.id || 0)
      setName(editing ? textOf(editing.name) : '')
      setAmount(editing ? formatDecimal(editing.amount) : '')
      setHours(editing ? formatDecimal(charge.hours ?? editing.hours) : '')
      setGiftHours(editing && Number(charge.giftHours ?? editing.giftHours ?? 0) > 0 ? formatDecimal(charge.giftHours ?? editing.giftHours) : '')
      setDescription(editing ? textOf(editing.description) : '')
      setPaymentDeadline(editing ? dateText(editing.paymentDeadline) : '')
      setValidStartDate(dateText(charge.validStartDate) || todayText())
    }
    void prepare()
    return () => { cancelled = true }
  }, [props.open, editingId, props.student.id])

  function applyPricing(nextId: number) {
    const pricing = pricings.find((item) => Number(item.id || 0) === nextId)
    if (!pricing) {
      const current = cards.find((card) => card.id === cardId)
      const restored = [...allCards]
      const matched = restored.find((card) => card.id === current?.id) || restored[0]
      setPricingId(0)
      setCards(restored)
      setCardId(matched?.id || 0)
      return
    }
    const category = categoryOf(pricing.cardCategory)
    const nextCards = filterCards(allCards, pricing)
    setPricingId(nextId)
    setCards(nextCards)
    setCardId(nextCards[0]?.id || 0)
    setName(textOf(pricing.courseName))
    setAmount(formatDecimal(pricing.price))
    setHours(category === 'HOURS' ? formatDecimal(pricing.hours) : '')
    if (category !== 'HOURS') setGiftHours('')
    setDescription(textOf(pricing.description))
    if (!nextCards[0]) message.warning(`该学员暂无可用${categoryLabel(category)}`)
  }

  async function submit() {
    const planName = textOf(name)
    const planAmount = Number(amount)
    const card = selectedCard
    if (!card) return message.warning('请先为学员建立可用卡片')
    if (!planName || !(planAmount > 0)) return message.warning('请填写方案名称和金额')
    if (categoryOf(card.cardCategory) === 'HOURS' && !(Number(hours || 0) > 0)) return message.warning('课时数必须大于0')
    if (saving) return
    setSaving(true)
    const payload = {
      studentId: props.student.id,
      coursePricingId: pricingId > 0 ? pricingId : undefined,
      name: planName,
      amount: planAmount,
      description: textOf(description),
      paymentDeadline: textOf(paymentDeadline) || undefined,
      charge: buildCharge(props.student, card, selectedPricing, hours, giftHours, description, validStartDate, validEndDate),
    }
    try {
      if (props.item?.id) await putJson(`/parent-admin/fee-items/${props.item.id}`, payload)
      else await postJson(`/parent-admin/students/${props.student.id}/fee-items`, payload)
      message.success(props.item?.id ? '方案已更新' : '方案已发布')
      props.onClose()
      await props.onSaved()
    } catch (error) {
      message.error(tell(error, props.item?.id ? '更新失败' : '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={props.item?.id ? '编辑专属缴费方案' : '新建专属缴费方案'}
      open={props.open}
      width={720}
      onCancel={() => { if (!saving) props.onClose() }}
      footer={null}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <p>{textOf(props.student.name) || '当前学员'}</p>
        <label>标准课程定价
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="可不选，直接填写专属价格"
            value={pricingId > 0 ? pricingId : undefined}
            options={pricings.map((item) => ({ value: Number(item.id), label: pricingOptionLabel(item) }))}
            onChange={(value) => applyPricing(Number(value || 0))}
          />
        </label>
        <label>续费卡片
          <Select
            style={{ width: '100%' }}
            placeholder="请选择学员卡片"
            value={cardId > 0 ? cardId : undefined}
            options={cards.map((card) => ({ value: card.id, label: `${card.label} · ${card.categoryLabel}` }))}
            onChange={(value) => setCardId(Number(value))}
          />
        </label>
        <label>方案名称<Input maxLength={40} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>金额<InputNumber style={{ width: '100%' }} min={0} value={amount === '' ? null : Number(amount)} onChange={(value) => setAmount(value == null ? '' : String(value))} /></label>
        {categoryOf(selectedCard?.cardCategory) === 'HOURS' ? (
          <>
            <label>课时<InputNumber style={{ width: '100%' }} min={0} value={hours === '' ? null : Number(hours)} onChange={(value) => setHours(value == null ? '' : String(value))} /></label>
            <label>赠送课时<InputNumber style={{ width: '100%' }} min={0} value={giftHours === '' ? null : Number(giftHours)} onChange={(value) => setGiftHours(value == null ? '' : String(value))} /></label>
          </>
        ) : null}
        {categoryOf(selectedCard?.cardCategory) === 'PERIOD' ? (
          <>
            <label>有效期开始<BusinessDatePicker value={validStartDate} onChange={setValidStartDate} allowClear={false} /></label>
            <p>有效期结束：{validEndDate || '—'}</p>
          </>
        ) : null}
        <label>缴费截止<BusinessDatePicker value={paymentDeadline} onChange={setPaymentDeadline} allowClear placeholder="不填则长期有效" /></label>
        <label>说明<Input.TextArea maxLength={500} showCount value={description} autoSize={{ minRows: 3, maxRows: 5 }} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="staff-form-actions">
          <Button disabled={saving} onClick={props.onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void submit()}>{props.item?.id ? '保存' : '发布方案'}</Button>
        </div>
      </Space>
    </Modal>
  )
}
