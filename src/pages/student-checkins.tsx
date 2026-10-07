import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { delJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { buildQuickCheckInPaymentOptions, checkInCourseSubmitWarning } from './checkin-options'
import { money, tell, todayIso } from './kit'
import type { Student, Card, Named, PayRecord, CheckRecord } from './students-model'
import { paymentOptionForCourse, preferredCourseForCoach } from './student-card-desk'
import { CheckInCoursePicker } from './student-quick-checkin'
import { isTransferInRecord } from './student-payments'
import { CardRecordTabs, boundedDateMax, cardBalanceView, checkInBounds, personName } from './students-domain'
import { consumeItemReferenceKey, isCampusServiceConsumeItem, resolveConsumeItemReferenceFields } from './consume-item'

export function CheckInPanel(props: { student: Student; rows: CheckRecord[]; payments: PayRecord[]; groups: Named[]; financialHidden: boolean; coaches: Named[]; focusCardId?: number; onCardChange?: (cardId?: number) => void; onCheckIn: (cardId?: number) => void; onChanged: () => Promise<void>; manage: boolean }) {
  const [cardId, setCardId] = useState<number | undefined>(props.focusCardId)
  useEffect(() => { setCardId(props.focusCardId) }, [props.focusCardId])
  return (
    <div className="student-record-page student-check-history">
      <CardRecordTabs cards={props.student.cards} rows={props.rows} focusId={props.focusCardId} onCardChange={(nextId) => {
        setCardId(nextId)
        props.onCardChange?.(nextId)
      }}>
        {(rows, card) => <CheckInCard student={props.student} card={card} rows={rows} payments={props.payments} groups={props.groups} financialHidden={props.financialHidden} coaches={props.coaches} onChanged={props.onChanged} manage={props.manage} onCheckIn={() => props.onCheckIn(card?.id || cardId)} />}
      </CardRecordTabs>
    </div>
  )
}

export function CheckInCard(props: { student: Student; card?: Card; rows: CheckRecord[]; payments: PayRecord[]; groups: Named[]; financialHidden: boolean; coaches: Named[]; onChanged: () => Promise<void>; manage: boolean; onCheckIn?: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const summary = checkInSummary(props.rows, props.card, props.student, props.financialHidden, props.coaches)
  const rowKey = props.rows.map((row) => row.id).join(',')
  const visible = selected.length ? props.rows.filter((row) => selected.includes(checkInChipKey(row, summary.special, props.coaches))) : props.rows
  useEffect(() => {
    const keys = new Set(summary.chips.map((item) => item.key))
    setSelected((current) => {
      const next = current.filter((key) => keys.has(key))
      return next.join('|') === current.join('|') ? current : next
    })
  }, [rowKey, props.card?.id, summary.special])
  return (
    <div className="student-record-card-page">
      <section className="student-record-summary student-check-summary">
        <header>
          <div><span className="student-record-summary-name">{props.student.name}</span><h3>打卡记录总览</h3></div>
          {props.manage ? <Button type="primary" disabled={Number(props.student.status || 0) === 2} onClick={props.onCheckIn}>打卡</Button> : null}
        </header>
        <div className="student-record-metrics">
          {summary.metrics.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
        </div>
      </section>
      {summary.chips.length ? (
        <div className="student-record-filter-chips" aria-label="筛选打卡记录">
          {summary.chips.map((item) => (
            <button key={item.key} type="button" className={[selected.includes(item.key) ? 'is-on' : '', item.gender ? `is-${item.gender}` : ''].filter(Boolean).join(' ')} onClick={() => setSelected((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key])}>
              <span className={item.inactive ? 'is-inactive' : undefined}>{item.name}</span><small>{item.hoursText}</small>
            </button>
          ))}
        </div>
      ) : null}
      {(() => {
        const timeline = buildCheckTimeline(visible, props.payments, props.card, props.student, selected.length === 0 && !summary.serviceOnly)
        if (!timeline.length) return (
          <div className="student-record-empty">
            <strong>{props.rows.length ? '没有符合筛选的打卡记录' : (summary.serviceOnly ? '暂无服务记录' : '暂无打卡记录')}</strong>
            {props.rows.length ? null : <span>{summary.serviceOnly ? '完成服务打卡后会在这里沉淀展示' : '完成打卡销课后会在这里沉淀展示'}</span>}
          </div>
        )
        return (
          <div className="check-timeline student-check-list">
            {timeline.map((item) => {
              if (item.kind === 'payment') return (
              <article key={item.id} className={item.tone ? `is-${item.tone}` : 'is-change'}>
                <header>
                  <strong>课时变动</strong>
                  <span>{item.title}</span>
                  <em>{item.remain}</em>
                </header>
                {item.subtitle ? <p>{item.subtitle}</p> : null}
              </article>
              )
              const coach = checkInCoachIdentity(item.record, props.coaches)
              const showCoach = !checkInService(item.record) && coach.name !== '未分配老师'
              return (
              <article key={item.record.id}>
                <header>
                  <strong>{checkInService(item.record) ? (item.record.courseTypeLabel || item.record.courseName || '服务消费') : (item.record.courseName || item.record.courseTypeLabel || '课程')}</strong>
                  {showCoach ? <span className={coach.inactive ? 'is-inactive' : undefined}>{coach.name}</span> : null}
                  {item.sequence ? <em>#{item.sequence}</em> : null}
                  {props.manage ? (
                  <Space>
                    <CheckEditor record={item.record} student={props.student} card={props.card} payments={props.payments} groups={props.groups} coaches={props.coaches} onSaved={props.onChanged} />
                    <Popconfirm title={consumptionDeleteText(item.record)} onConfirm={async () => {
                      try {
                        await delJson(`/consumptions/${item.record.id}`)
                        message.success('已删除')
                        await props.onChanged()
                      } catch (error) {
                        message.error(tell(error, '删除失败'))
                      }
                    }}>
                      <Button type="link" danger>删除</Button>
                    </Popconfirm>
                  </Space>
                  ) : null}
                </header>
                <p>{checkInMeta(item.record, props.financialHidden, props.card)}</p>
                {formatCheckInTime(item.record.createTime) ? <p>打卡时间：{formatCheckInTime(item.record.createTime)}</p> : null}
                {checkInRemark(item.record) ? <p>备注：{checkInRemark(item.record)}</p> : null}
              </article>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

export const AUTO_CHECK_IN_REMARK = /^(?:排课)?自动打卡(?:\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}))?$/

export function checkInRemark(record: CheckRecord): string {
  const remark = String(record.remark || '').trim()
  return remark && !AUTO_CHECK_IN_REMARK.test(remark) ? remark : ''
}

export function checkInMeta(record: CheckRecord, hidden: boolean, card?: Card): string {
  const service = checkInService(record)
  const matched = String(record.remark || '').trim().match(AUTO_CHECK_IN_REMARK)
  const slot = String(record.scheduleTimeText || matched?.[1] || '').trim()
  const parts = [
    record.consumeDate,
    weekdayOf(String(record.consumeDate || '')),
    slot,
    !hidden && record.amount != null ? `¥${money(record.amount)}` : '',
    card ? cardBalanceView(card).tag : record.cardTypeLabel,
    Number(record.autoCheckIn) === 1 || matched ? '自动打卡' : '',
    service ? `${checkInHoursText(Number(record.hours || 0))}次` : `${checkInHoursText(Number(record.hours || 0))}课时`,
  ]
  return parts.filter(Boolean).join(' · ')
}

export function paymentHoursDelta(record: PayRecord): number {
  if (record.type === 'refund') return -(Number(record.hours || 0) + Number(record.giftHours || 0))
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (reason === 'manual_deduct') return -Number(record.hours || 0)
    if (reason === 'gift_expired') return -Number(record.giftHours || 0)
    if (reason === 'clear_hours') return -(Number(record.hours || 0) + Number(record.giftHours || 0))
    if (reason === 'activity_gift') return Number(record.giftHours || 0)
    if (reason === 'transfer') return isTransferInRecord(record) ? Number(record.hours || 0) : -Number(record.hours || 0)
    return 0
  }
  if (record.type === 'supplement') return 0
  return Number(record.hours || 0) + Number(record.giftHours || 0)
}

export function paymentChangeTitle(record: PayRecord, hoursDelta: number): string {
  const regularHours = Number(record.hours || 0)
  const giftHours = Number(record.giftHours || 0)
  if (record.type === 'refund') return `退费 ${checkInHoursText(Math.abs(hoursDelta))} 课时`
  if (record.type === 'adjustment') {
    const reason = String(record.adjustmentReason || '')
    if (reason === 'manual_deduct') return `扣减 ${checkInHoursText(regularHours)} 课时`
    if (reason === 'gift_expired') return `赠课过期扣减 ${checkInHoursText(giftHours)} 课时`
    if (reason === 'clear_hours') return `清空课时 ${checkInHoursText(regularHours + giftHours)} 课时`
    if (reason === 'activity_gift') return `新增赠课 ${checkInHoursText(giftHours)} 课时`
    if (reason === 'transfer') {
      const targetName = String(record.transferTargetStudentName || '').trim()
      if (isTransferInRecord(record)) return `转入 ${checkInHoursText(regularHours)} 课时${targetName ? ` · 来自${targetName}` : ''}`
      return `转出 ${checkInHoursText(regularHours)} 课时${targetName ? ` · 转给${targetName}` : ''}`
    }
    return `${record.typeText || '课时调整'} ${checkInHoursText(Math.abs(hoursDelta))} 课时`
  }
  const parts = []
  if (regularHours > 0) parts.push(`${checkInHoursText(regularHours)} 正课`)
  if (giftHours > 0) parts.push(`${checkInHoursText(giftHours)} 赠课`)
  return `${record.typeText || '缴费'} ${parts.join(' + ') || `${checkInHoursText(Math.abs(hoursDelta))} 课时`}`
}

export function chronologicalSortKey(dateText?: string, createTime?: string, id?: number): string {
  const datePart = String(dateText || '').trim().slice(0, 10) || '0000-00-00'
  const normalized = String(createTime || '').trim().replace('T', ' ')
  const timePart = normalized.length >= 19 ? normalized.slice(11, 19) : '00:00:00'
  const idPart = String(Math.max(0, Number(id || 0))).padStart(12, '0')
  return `${datePart} ${timePart} ${idPart}`
}

export function buildCheckTimeline(records: CheckRecord[], payments: PayRecord[], card: Card | undefined, student: Student, showPayments: boolean) {
  const scopedPayments = showPayments && card?.id
    ? payments.filter((item) => !item.studentCardId || item.studentCardId === card.id)
    : []
  const events: Array<{ kind: 'payment' | 'consumption'; id: number; sortKey: string; delta: number; record?: CheckRecord; payment?: PayRecord }> = []
  scopedPayments.forEach((record) => {
    const delta = paymentHoursDelta(record)
    if (!delta) return
    events.push({ kind: 'payment', id: record.id, sortKey: chronologicalSortKey(record.paymentDate, record.createTime, record.id), delta, payment: record })
  })
  records.forEach((record) => {
    events.push({ kind: 'consumption', id: record.id, sortKey: chronologicalSortKey(record.consumeDate, record.createTime, record.id), delta: -Number(record.hours || 0), record })
  })
  events.sort((left, right) => left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : (left.kind === right.kind ? left.id - right.id : left.kind === 'payment' ? -1 : 1))
  const sequence = new Map<number, number>()
  let nextSequence = 0
  events.forEach((event) => {
    if (event.kind !== 'consumption') return
    nextSequence += 1
    sequence.set(event.id, nextSequence)
  })
  let running = Number(card?.remainingHours ?? student.remainingHours ?? 0)
  if (!Number.isFinite(running)) running = 0
  const timeline: Array<{ kind: 'payment'; id: string; title: string; subtitle: string; remain: string; tone: string } | { kind: 'consumption'; record: CheckRecord; sequence: number }> = []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind === 'payment' && event.payment) {
      const tone = event.payment.type === 'new' ? 'in' : (event.payment.adjustmentReason === 'transfer' && !isTransferInRecord(event.payment) ? 'out' : '')
      timeline.push({
        kind: 'payment',
        id: `payment-${event.id}`,
        title: paymentChangeTitle(event.payment, event.delta),
        subtitle: [event.payment.courseTypeLabel, event.payment.paymentDate].filter(Boolean).join(' · '),
        remain: `剩余${checkInHoursText(Math.max(0, running))}课时`,
        tone,
      })
    } else if (event.record) {
      timeline.push({ kind: 'consumption', record: event.record, sequence: sequence.get(event.id) || 0 })
    }
    running -= event.delta
  }
  return timeline
}

export function checkInHoursText(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value - Math.round(value)) < 0.000001) return String(Math.round(value))
  return String(Number(value.toFixed(2)))
}

export function checkInAmountText(value: number): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0.00'
  const [integerPart, decimalPart] = numeric.toFixed(2).split('.')
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`
}

export function checkInService(row: CheckRecord): boolean {
  return isCampusServiceConsumeItem(row)
}

export function checkInCoachIdentity(row: CheckRecord, coaches: Named[]): { key: string; name: string; inactive: boolean; gender: '' | 'male' | 'female' } {
  const rawId = Number(row.coachId || 0)
  const rawName = String(row.coachName || '').trim()
  const byId = rawId > 0
    ? coaches.find((item) => item.id === rawId || Number(item.userId || 0) === rawId)
    : undefined
  const byName = !byId && rawName
    ? coaches.find((item) => [item.displayName, item.nickname, item.name, item.phone].some((value) => String(value || '').trim() === rawName))
    : undefined
  const matched = byId || byName
  const name = matched ? personName(matched) : (rawName || (rawId > 0 ? `老师${rawId}` : '未分配老师'))
  const id = Number(matched?.id || rawId || 0)
  const genderText = String(matched?.gender || '').trim().toLowerCase()
  const gender = genderText === '2' || genderText === 'female' || genderText === 'f' || genderText === '女'
    ? 'female'
    : (genderText === '1' || genderText === 'male' || genderText === 'm' || genderText === '男' ? 'male' : '')
  return {
    key: id > 0 ? `coach:${id}` : `coach-name:${name}`,
    name,
    inactive: Number(matched?.status) === 0,
    gender,
  }
}

export function checkInChipKey(row: CheckRecord, special: boolean, coaches: Named[] = []): string {
  if (special) {
    const reference = consumeItemReferenceKey(row)
    if (checkInService(row)) return `service:${reference || row.courseName || row.courseTypeLabel || 'service'}`
    return `course:${reference || row.courseTypeLabel || row.courseName || 'course'}`
  }
  return checkInCoachIdentity(row, coaches).key
}

export function checkInSummary(rows: CheckRecord[], card: Card | undefined, student: Student, hidden: boolean, coaches: Named[] = []) {
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const courseCategory = card?.courseCategory ?? student.courseCategory
  const special = category === 'STORED_VALUE' || category === 'PERIOD'
  const periodCourse = category === 'PERIOD' && courseCategory !== false
  const serviceOnly = special && courseCategory === false
  const periodService = category === 'PERIOD' && courseCategory === false
  let lessonCount = 0
  let totalHours = 0
  let serviceCount = 0
  let totalAmount = 0
  const courseKeys = new Set<string>()
  rows.forEach((row) => {
    const hours = Math.max(0, Number(row.hours || 0))
    totalAmount += Math.max(0, Number(row.amount || 0))
    if (checkInService(row)) {
      serviceCount += hours
      return
    }
    lessonCount += 1
    totalHours += hours
    const key = String(consumeItemReferenceKey(row) || row.courseName || row.courseTypeLabel || '').trim()
    if (key) courseKeys.add(key)
  })
  const hasServices = serviceCount > 0
  const isServiceOnly = lessonCount === 0 && hasServices
  const isServiceCard = periodService || (isServiceOnly && !periodCourse)
  const isCourseCard = special && !isServiceCard
  const checkInCount = serviceCount + lessonCount
  const metrics: Array<{ label: string; value: string }> = []
  if (isServiceCard) {
    metrics.push({ label: '打卡次数', value: checkInHoursText(checkInCount) })
    if (!hidden) metrics.push({ label: '打卡金额', value: `¥${checkInAmountText(totalAmount)}` })
  } else if (special && !periodCourse) {
    metrics.push({ label: '打卡次数', value: checkInHoursText(checkInCount) })
    if (!hidden) metrics.push({ label: '打卡金额', value: `¥${checkInAmountText(totalAmount)}` })
    if (isCourseCard) metrics.push({ label: '打卡课时', value: checkInHoursText(totalHours) })
  } else {
    metrics.push({ label: '上课次数', value: String(lessonCount) })
    metrics.push({ label: '课程数量', value: String(courseKeys.size) })
    if (hasServices) metrics.push({ label: '打卡次数', value: checkInHoursText(serviceCount) })
  }
  const chips = new Map<string, { key: string; name: string; hours: number; service: boolean; inactive: boolean; gender: '' | 'male' | 'female' }>()
  rows.forEach((row) => {
    const key = checkInChipKey(row, special, coaches)
    const service = checkInService(row)
    const coach = special ? null : checkInCoachIdentity(row, coaches)
    const name = special
      ? (service ? (row.courseTypeLabel || row.courseName || '服务') : (row.courseName || row.courseTypeLabel || row.courseType || '课程'))
      : (coach?.name || '未分配老师')
    const current = chips.get(key) || { key, name, hours: 0, service, inactive: false, gender: '' as '' | 'male' | 'female' }
    current.hours += Number(row.hours || 0)
    if (coach?.inactive) current.inactive = true
    if (!current.gender && coach?.gender) current.gender = coach.gender
    chips.set(key, current)
  })
  return {
    special,
    serviceOnly,
    metrics,
    chips: Array.from(chips.values())
      .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, 'zh-Hans-CN'))
      .map((item) => ({
        ...item,
        hoursText: special && item.service ? `${checkInHoursText(item.hours)}次` : `${checkInHoursText(item.hours)}课时`,
      })),
  }
}

export function formatCheckInTime(value?: string): string {
  const normalized = String(value || '').trim().replace('T', ' ')
  if (!normalized) return ''
  const matched = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  return matched ? `${matched[1]} ${matched[2]}` : normalized
}

export function weekdayOf(value: string): string {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

export function formatDeleteAmount(value?: number): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0.00'
  const [integerPart, decimalPart] = numeric.toFixed(2).split('.')
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`
}

export function formatDeleteHours(value?: number): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Math.abs(numeric - Math.round(numeric)) < 0.000001) return String(Math.round(numeric))
  return String(Number(numeric.toFixed(2)))
}

export function consumptionDeleteText(row: CheckRecord): string {
  const service = checkInService(row)
  const rollback = service ? `删除后将返还 ¥${formatDeleteAmount(row.amount)}。` : `删除后将返还 ${formatDeleteHours(row.hours)} 课时。`
  const auto = !service && Number(row.autoCheckIn) === 1
    ? '该记录为自动打卡，删除后会同步清理对应课表中的该学员；如果该节课已无其他学员，还会一并删除整条课表。'
    : ''
  return `确定删除 ${row.consumeDate || ''} 的${service ? '服务记录' : '打卡记录'}吗？${rollback}${auto}`
}

export function CheckEditor(props: { record: CheckRecord; student: Student; card?: Card; payments: PayRecord[]; groups: Named[]; coaches: Named[]; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [moreHours, setMoreHours] = useState(Number(props.record.hours || 0) > 2)
  const [form] = Form.useForm()
  const service = checkInService(props.record)
  const historicalName = String(props.record.coachName || '').trim()
  const coachLocked = /[、,，]/.test(historicalName)
  const card = props.card || (props.student.cards || []).find((item) => item.id === props.record.studentCardId)
  const cards = (props.student.cards || []).filter((item) => item.status !== 0 && item.id)
  const category = String(card?.cardCategory || props.student.cardCategory || '').toUpperCase()
  const watchedDate = Form.useWatch('consumeDate', form)
  const watchedHours = Form.useWatch('hours', form)
  const watchedPaymentId = Form.useWatch('paymentId', form)
  const checkDate = String(watchedDate || props.record.consumeDate || todayIso()).slice(0, 10)
  const courseOptions = useMemo(() => service ? [] : buildQuickCheckInPaymentOptions({
    records: props.payments,
    card,
    groups: props.groups,
    checkInDate: checkDate,
    singleCard: cards.length <= 1,
  }), [service, props.payments, card, props.groups, checkDate, cards.length])
  const paymentId = matchedPaymentId(courseOptions, props.record)
  const selectedCourse = courseOptions.find((item) => item.id === watchedPaymentId) || courseOptions.find((item) => item.id === paymentId)
  const assignedCoachIds = card?.coachMemberIds?.length ? card.coachMemberIds : (props.student.coachMemberIds || [])
  const coachChoices = props.coaches.filter((item) => !assignedCoachIds.length || assignedCoachIds.includes(item.id) || item.id === props.record.coachId)
  const editorSource = service
    ? card
    : (selectedCourse && (category === 'HOURS' || selectedCourse.validStartDate || selectedCourse.validEndDate || selectedCourse.consumeDeadline) ? selectedCourse : card)
  const editorBounds = checkInBounds(editorSource)
  const editorDateMax = boundedDateMax(editorBounds)
  const originHours = Number(props.record.hours || 0)
  const unitPrice = Number(props.record.unitPrice || 0) > 0
    ? Number(props.record.unitPrice)
    : originHours > 0 ? Number(props.record.amount || 0) / originHours : 0
  useEffect(() => {
    if (!open || service || paymentId == null) return
    const current = form.getFieldValue('paymentId')
    if (current == null || !courseOptions.some((item) => item.id === current)) form.setFieldValue('paymentId', paymentId)
  }, [open, service, paymentId, courseOptions, form])
  return (
    <>
      <Button type="link" onClick={() => setOpen(true)}>编辑</Button>
      <Modal title="编辑打卡" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            consumeDate: String(props.record.consumeDate || '').slice(0, 10),
            hours: props.record.hours || 1,
            remark: props.record.remark || '',
            coachId: props.record.coachId,
            paymentId,
          }}
          onFinish={async (values: { consumeDate?: string; hours?: number; remark?: string; coachId?: number; paymentId?: number }) => {
            if (!values.consumeDate) {
              message.warning('请选择日期')
              return
            }
            if (values.consumeDate > todayIso()) {
              message.warning('不能选择未来日期')
              return
            }
            const hours = Number(values.hours || 0)
            if (!hours || hours <= 0) {
              message.warning(service ? '请输入正确的次数' : '请输入正确的课时数')
              return
            }
            const period = category === 'PERIOD'
            const stored = category === 'STORED_VALUE'
            const payment = courseOptions.find((item) => item.id === values.paymentId)
            if (!service) {
              if (!payment || !String(payment.courseType || '').trim()) {
                message.warning('当前学员未配置课程，不能打卡')
                return
              }
              const courseWarning = checkInCourseSubmitWarning(payment)
              if (courseWarning) {
                message.warning(courseWarning)
                return
              }
              if (!coachLocked && !values.coachId) {
                message.warning('请选择老师')
                return
              }
              const bounds = checkInBounds(category === 'HOURS' || payment.validStartDate || payment.validEndDate || payment.consumeDeadline ? payment : card)
              if ((bounds.min && values.consumeDate < bounds.min) || (bounds.max && values.consumeDate > bounds.max)) {
                message.warning(bounds.min && values.consumeDate < bounds.min ? '未到有效期，不能打卡' : '已过有效期，不能打卡')
                return
              }
              if (!stored && !period) {
                const remaining = Number(card?.remainingHours ?? props.student.remainingHours ?? 0)
                if (hours - originHours > remaining) {
                  message.warning(`剩余课时不足（${remaining}）`)
                  return
                }
              }
            }
            const coach = coachChoices.find((item) => item.id === values.coachId)
            try {
              await putJson(`/consumptions/${props.record.id}`, service ? {
                studentId: props.student.id,
                studentCardId: props.record.studentCardId,
                hours,
                paymentRecordId: props.record.paymentRecordId || undefined,
                unitPrice,
                amount: unitPrice * hours,
                courseType: props.record.courseType,
                courseTypeLabel: props.record.courseTypeLabel,
                consumeItemType: props.record.consumeItemType,
                consumeItemId: props.record.consumeItemId,
                consumeDate: values.consumeDate,
                remark: String(values.remark || '').trim(),
              } : {
                studentId: props.student.id,
                studentCardId: props.record.studentCardId,
                coachName: coachLocked ? historicalName : (coach ? personName(coach) : props.record.coachName),
                coachId: coachLocked ? (props.record.coachId || undefined) : values.coachId,
                hours,
                paymentRecordId: payment?.id || props.record.paymentRecordId || undefined,
                courseType: payment?.courseType || props.record.courseType,
                ...resolveConsumeItemReferenceFields(payment?.courseType || props.record.courseType),
                consumeDate: values.consumeDate,
                remark: String(values.remark || '').trim(),
              })
              message.success('已保存')
              setOpen(false)
              await props.onSaved()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          {service ? (
            <p>服务：{props.record.courseTypeLabel || props.record.courseName || '服务消费'}{unitPrice > 0 ? ` · 单价 ¥${money(unitPrice)}` : ''}</p>
          ) : (
            <>
              <Form.Item name="paymentId" label="课程">
                <CheckInCoursePicker options={courseOptions} />
              </Form.Item>
              {selectedCourse?.validityText ? <p>{selectedCourse.validityText}</p> : null}
              {coachLocked ? <Form.Item label="老师"><Input value={historicalName} disabled /></Form.Item> : (
                <Form.Item name="coachId" label="老师" rules={[{ required: true, message: '请选择老师' }]}>
                  <Select
                    options={coachChoices.map((item) => ({ value: item.id, label: personName(item) }))}
                    onChange={(value) => {
                      const option = paymentOptionForCourse(courseOptions, preferredCourseForCoach(props.student, props.groups, Number(value)))
                      if (option) form.setFieldValue('paymentId', option.id)
                    }}
                  />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item name="consumeDate" label="日期" extra={editorBounds.hint || undefined}><BusinessDatePicker minDate={editorBounds.min || undefined} maxDate={editorDateMax} /></Form.Item>
          <Form.Item name="hours" label={service ? '次数' : '课时'}><InputNumber min={service ? 1 : 0.5} step={service ? 1 : 0.5} style={{ width: '100%' }} /></Form.Item>
          {service ? null : (
            <Space wrap>
              {(moreHours ? [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] : [0.5, 1, 1.5, 2]).map((hour) => (
                <Button key={hour} htmlType="button" type={Number(watchedHours) === hour ? 'primary' : 'default'} onClick={() => form.setFieldValue('hours', hour)}>{hour}课时</Button>
              ))}
              <Button type="link" htmlType="button" onClick={() => setMoreHours((current) => !current)}>{moreHours ? '收起' : '更多课时'}</Button>
            </Space>
          )}
          <Form.Item name="remark" label="备注"><Input maxLength={100} placeholder="选填，不超过100字" /></Form.Item>
          <Button type="primary" htmlType="submit">保存修改</Button>
        </Form>
      </Modal>
    </>
  )
}

export function matchedPaymentId(options: Array<{ id: number; courseType?: string; configuredFromStudent?: boolean }>, record: CheckRecord): number | undefined {
  const currentType = String(record.courseType || '').trim()
  const configured = options.some((item) => item.configuredFromStudent)
  const found = configured
    ? options.find((item) => String(item.courseType || '').trim() === currentType)
    : options.find((item) => item.id === record.paymentRecordId) || options.find((item) => String(item.courseType || '').trim() === currentType)
  return found?.id ?? options.find((item) => String(item.courseType || '').trim() === currentType)?.id
}
