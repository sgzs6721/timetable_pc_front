import { CalendarOutlined, CheckCircleOutlined, CheckOutlined, CreditCardOutlined, DownOutlined, InfoCircleOutlined, ReadOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, Switch, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { BusinessDatePicker, BusinessMultiDatePicker } from '../components/BusinessDatePicker'
import { buildQuickCheckInPaymentOptions, buildQuickCheckInServiceOptions, checkInCourseSelectWarning, checkInCourseSubmitWarning, clampQuickCheckInDate } from './checkin-options'
import type { CheckInPaymentOption } from './checkin-options'
import { money, tell, todayIso } from './kit'
import type { Card, Student, Named, PayRecord } from './students-model'
import { lockedCheckInCoach, paymentOptionForCourse, preferredCourseForCoach } from './student-card-desk'
import { activeStudentCards, boundedDateMax, cardCategoryText, cardRemain, checkInBlockReason, checkInBounds, checkInCardEligible, checkInQuotaHint, confirmCheckInDates, dateOutOfBoundsMessage, noEligibleCheckInMessage, personName } from './students-domain'

const CHECK_IN_HOURS_MIN = 0.5
const CHECK_IN_HOURS_MAX = 4
const CHECK_IN_HOURS_STEP = 0.5

export function servicePriceText(service: { originalPrice: number; discount: number; discountedPrice: number }, count: number, days: number): string {
  const unit = Number(service.discountedPrice || 0)
  const total = unit * count * Math.max(1, days)
  const discount = Number(service.discount || 0) > 0 ? `折扣 ${money(service.discount)}% · ` : ''
  const original = Number(service.originalPrice || 0) > 0 ? `原价 ¥${money(service.originalPrice)} · ` : ''
  const batch = days > 1 ? ` · ${days} 次合计 ¥${money(total)}` : ''
  return `${original}${discount}单价 ¥${money(unit)} · 本次 ¥${money(unit * count)}${batch}`
}

export function CheckInHoursStepper(props: { value?: number; onChange?: (value: number) => void }) {
  const numeric = Number(props.value)
  const hours = Number.isFinite(numeric)
    ? Math.min(CHECK_IN_HOURS_MAX, Math.max(CHECK_IN_HOURS_MIN, numeric))
    : 1
  const changeBy = (delta: number) => {
    const next = Math.min(CHECK_IN_HOURS_MAX, Math.max(CHECK_IN_HOURS_MIN, hours + delta))
    props.onChange?.(Number(next.toFixed(1)))
  }
  return (
    <div className="quick-checkin-hours-stepper" role="group" aria-label="消耗课时">
      <Button htmlType="button" aria-label="减少半课时" disabled={hours <= CHECK_IN_HOURS_MIN} onClick={() => changeBy(-CHECK_IN_HOURS_STEP)}>−</Button>
      <span aria-live="polite"><strong>{Number.isInteger(hours) ? hours : hours.toFixed(1)}</strong><small>课时</small></span>
      <Button htmlType="button" aria-label="增加半课时" disabled={hours >= CHECK_IN_HOURS_MAX} onClick={() => changeBy(CHECK_IN_HOURS_STEP)}>＋</Button>
    </div>
  )
}

export function CheckInCoursePicker(props: {
  value?: number
  onChange?: (value: number) => void
  options: CheckInPaymentOption[]
}) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const current = props.options.find((item) => item.id === props.value)
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  function selectCourse(item: CheckInPaymentOption) {
    const warning = checkInCourseSelectWarning(item)
    if (warning) {
      message.warning(warning || '请选择有效的课程')
      return
    }
    props.onChange?.(item.id)
    setOpen(false)
  }
  if (!props.options.length) return <p>当前学员未配置课程</p>
  return (
    <div ref={pickerRef} className={open ? 'quick-checkin-course-picker is-open' : 'quick-checkin-course-picker'}>
      <Button
        className="quick-checkin-course-trigger"
        htmlType="button"
        block
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span>
          <strong>{current?.courseLabel || current?.label || '请选择课程'}</strong>
          <small>{current?.validityText || '点击选择本次打卡的课程'}</small>
        </span>
        <DownOutlined />
      </Button>
      {open ? (
        <div className="checkin-course-options is-floating" role="listbox" aria-label="课程选项">
          {props.options.map((item) => {
            const hoursText = item.hoursRatioText
              ? `${item.hoursRatioText} 剩余/总课时`
              : item.remainText && item.remainText !== item.cardTypeLabel
                ? [item.remainText, item.totalHoursText].filter(Boolean).join(' · ')
                : ''
            const detailText = [item.validityText, hoursText, item.disabledReason].filter(Boolean).join(' · ')
            return (
              <button
                type="button"
                key={item.id}
                className={[
                  'checkin-course-option',
                  props.value === item.id && item.isSelectable !== false ? 'is-on' : '',
                  item.isSelectable === false ? 'is-disabled' : '',
                ].filter(Boolean).join(' ')}
                role="option"
                aria-selected={props.value === item.id && item.isSelectable !== false}
                aria-disabled={item.isSelectable === false}
                disabled={item.isSelectable === false}
                onClick={() => selectCourse(item)}
              >
                <span className="checkin-course-option-mark">{props.value === item.id && item.isSelectable !== false ? <CheckOutlined /> : null}</span>
                <b className="checkin-course-option-title">{item.courseLabel || item.label}</b>
                {detailText ? <small className={item.disabledReason ? 'checkin-course-option-meta is-error' : 'checkin-course-option-meta'}>{detailText}</small> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function QuickCheckIn(props: {
  student: Student | null
  preferredCardId?: number
  cardSelectionLocked?: boolean
  coaches: Named[]
  services: Named[]
  groups: Named[]
  onClose: () => void
  onDone: (studentId: number, hours: number, amount: number) => void
}) {
  const student = props.student
  const [full, setFull] = useState<Student | null>(null)
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [cardId, setCardId] = useState<number | undefined>()
  const [useCourse, setUseCourse] = useState(false)
  const [useService, setUseService] = useState(false)
  const [dates, setDates] = useState<string[]>([todayIso()])
  const [batchMode, setBatchMode] = useState(false)
  const [usedDates, setUsedDates] = useState<string[]>([])
  const [serviceCounts, setServiceCounts] = useState<Record<number, number>>({})
  const [ready, setReady] = useState(false)
  const [form] = Form.useForm()
  useEffect(() => {
    if (!student) return
    let active = true
    setReady(false)
    setDates([todayIso()])
    setBatchMode(false)
    const paymentRequest = getJson<PayRecord[]>(`/payment-records/student/${student.id}`)
    const usedRequest = getJson<Array<{ consumeDate?: string }>>(`/consumptions/student/${student.id}`).catch(() => [] as Array<{ consumeDate?: string }>)
    getJson<Student>(`/students/${student.id}`).catch(() => student).then((data) => {
      if (!active) return null
      const loaded = data || student
      const preferred = Number(props.preferredCardId || 0)
      const source = activeStudentCards(loaded)
      const eligible = source.filter((card) => checkInCardEligible(card, loaded, source.length === 1 || (preferred > 0 && Number(card.id || 0) === preferred)))
      if (!eligible.length) {
        message.warning(noEligibleCheckInMessage(loaded, source))
        props.onClose()
        paymentRequest.catch(() => undefined)
        return null
      }
      return Promise.all([paymentRequest, usedRequest]).then(([paymentRows, consumptionRows]) => {
        if (!active) return
        const first = eligible.find((item) => item.id === preferred) || eligible[0]
        const day = clampQuickCheckInDate(todayIso(), { card: first, records: paymentRows || [], singleCard: eligible.length <= 1, today: todayIso() })
        setFull({ ...loaded, cards: eligible })
        setPayments(paymentRows || [])
        setUsedDates((consumptionRows || []).map((item) => String(item.consumeDate || '')).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))
        setCardId(first?.id)
        setDates([day])
        if (eligible.length > 1) {
          setReady(true)
          return
        }
        const serviceOnly = (String(first?.cardCategory || '').toUpperCase() === 'STORED_VALUE' || String(first?.cardCategory || '').toUpperCase() === 'PERIOD') && first?.courseCategory === false
        const paymentChoices = buildQuickCheckInPaymentOptions({ records: paymentRows || [], card: first, groups: props.groups, checkInDate: day, singleCard: true })
        const serviceChoices = buildQuickCheckInServiceOptions({ records: paymentRows || [], services: props.services, card: first, singleCard: true })
        const hasCourse = !serviceOnly && paymentChoices.some((item) => item.isSelectable !== false)
        if (!hasCourse && !serviceChoices.length) {
          message.warning(serviceOnly ? '暂无可用服务，请先缴费' : '暂无可用于打卡的缴费课程')
          props.onClose()
          return
        }
        setReady(true)
      })
    }).catch((error) => {
      if (!active) return
      const text = tell(error, '加载打卡信息失败')
      message.warning(/[\u4e00-\u9fff]/.test(text) ? text : '加载打卡信息失败')
      props.onClose()
    })
    return () => { active = false }
  }, [student, props.preferredCardId])
  const cards = (full?.cards || []).filter((card) => card.status !== 0)
  const card = cards.find((item) => item.id === cardId) || cards[0]
  const checkDate = card
    ? clampQuickCheckInDate(dates[0] || todayIso(), { card, records: payments, singleCard: cards.length <= 1, today: todayIso() })
    : (dates[0] || todayIso())
  const courseOptions = useMemo(() => buildQuickCheckInPaymentOptions({
    records: payments,
    card,
    groups: props.groups,
    checkInDate: checkDate,
    singleCard: cards.length <= 1,
  }), [payments, card, props.groups, checkDate, cards.length])
  const serviceOptions = useMemo(() => buildQuickCheckInServiceOptions({
    records: payments,
    services: props.services,
    card,
    singleCard: cards.length <= 1,
  }), [payments, props.services, card, cards.length])
  const selectableCourse = courseOptions.find((item) => item.isSelectable !== false)
  const remain = cardRemain(card, full || student || { id: 0, name: '' })
  const cardCoaches = card?.coachMemberIds || []
  const currentCategory = String(card?.cardCategory || student?.cardCategory || 'HOURS').toUpperCase()
  const serviceOnlyCard = (String(card?.cardCategory || '').toUpperCase() === 'STORED_VALUE' || String(card?.cardCategory || '').toUpperCase() === 'PERIOD') && card?.courseCategory === false
  const courseGroup = props.groups.find((item) => item.id === Number(card?.studentGroupId || full?.studentGroupId || 0))
  const lockedCoach = serviceOnlyCard ? null : lockedCheckInCoach(courseGroup, props.coaches)
  const hasSelectableCourse = !serviceOnlyCard && !!selectableCourse
  // Match the mini program: choosing “course/service” is only meaningful for a
  // stored-value or period card that carries both kinds of benefits. A normal
  // hours card has already identified the check-in content through the card.
  const showContentTypeSelector = (currentCategory === 'STORED_VALUE' || currentCategory === 'PERIOD')
    && hasSelectableCourse
    && serviceOptions.length > 0
  const courseSignature = courseOptions.map((item) => `${item.id}:${item.isSelectable}:${item.courseType}`).join('|')
  const watchedPaymentId = Form.useWatch('paymentId', form)
  const watchedHours = Form.useWatch('hours', form)
  const selectedServices = serviceOptions.filter((item) => Number(serviceCounts[item.id] || 0) > 0)
  const serviceAmount = selectedServices.reduce((sum, item) => sum + Number(item.discountedPrice || 0) * Number(serviceCounts[item.id] || 0), 0)
  const selectedPayment = courseOptions.find((item) => item.id === watchedPaymentId) || selectableCourse
  const dateSource = useService
    ? card
    : (selectedPayment && (selectedPayment.validStartDate || selectedPayment.validEndDate || selectedPayment.consumeDeadline) ? selectedPayment : card)
  const dateBounds = checkInBounds(dateSource)
  const dateMax = boundedDateMax(dateBounds)
  const hasCheckedInDate = dates.some((date) => usedDates.includes(date))
  const quotaDates = dates.some((date) => usedDates.includes(date)) ? dates.filter((date) => !usedDates.includes(date)) : dates
  const quotaHint = checkInQuotaHint({
    dates: quotaDates,
    category: String(card?.cardCategory || student?.cardCategory || 'HOURS'),
    useService,
    servicePrice: serviceAmount,
    serviceCount: 1,
    remainingAmount: Number(card?.remainingAmount ?? student?.remainingAmount ?? 0),
    hours: Number(watchedHours || 1),
    remainingHours: Number(card?.remainingHours ?? student?.remainingHours ?? 0),
  })
  useEffect(() => {
    if (!ready || !card) return
    setDates((current) => {
      const next = current.map((date) => clampQuickCheckInDate(date, { card, records: payments, singleCard: cards.length <= 1, today: todayIso() }))
      const unique = Array.from(new Set(next))
      return unique.length === current.length && unique.every((date, index) => date === current[index]) ? current : unique
    })
  }, [card?.id, checkDate, ready])
  useEffect(() => {
    if (!card) return
    setUseCourse(hasSelectableCourse)
    setUseService(!hasSelectableCourse && serviceOptions.length > 0)
    form.setFieldValue('paymentId', selectableCourse?.id)
    form.setFieldValue('hours', 1)
    if (lockedCoach) form.setFieldValue('coachId', lockedCoach.id)
    else if (cardCoaches[0]) form.setFieldValue('coachId', cardCoaches[0])
  }, [card?.id])
  const serviceSignature = serviceOptions.map((item) => item.id).join('|')
  useEffect(() => {
    const allowed = new Set(serviceOptions.map((item) => item.id))
    setServiceCounts((current) => {
      const next: Record<number, number> = {}
      Object.entries(current).forEach(([id, count]) => {
        if (allowed.has(Number(id)) && count > 0) next[Number(id)] = count
      })
      if (!Object.keys(next).length && !hasSelectableCourse && serviceOptions.length === 1) next[serviceOptions[0].id] = 1
      const same = Object.keys(current).length === Object.keys(next).length
        && Object.entries(next).every(([id, count]) => current[Number(id)] === count)
      return same ? current : next
    })
  }, [card?.id, serviceSignature, hasSelectableCourse])
  useEffect(() => {
    const current = form.getFieldValue('paymentId')
    const kept = courseOptions.find((item) => item.id === current && item.isSelectable !== false)
    const next = kept || selectableCourse
    if (current !== next?.id) form.setFieldValue('paymentId', next?.id)
  }, [courseSignature])
  if (!student) return null
  if (!ready) {
    return (
      <Modal
        className="quick-checkin-modal"
        width={720}
        centered
        title={<QuickCheckInHeading studentName={student.name} />}
        open
        onCancel={props.onClose}
        footer={null}
        destroyOnHidden
      >
        <div className="quick-checkin-loading">
          <span />
          <strong>正在准备打卡信息</strong>
          <small>正在读取可用卡片、课程和余额…</small>
        </div>
      </Modal>
    )
  }
  const blockReason = checkInBlockReason(full || student, card)
  const currentCardCategory = cardCategoryText(card?.cardCategory || student.cardCategory || 'HOURS') || '课时卡'
  const currentCardName = card?.cardName || card?.studentGroupName || currentCardCategory
  const currentCardMeta = quickCheckInCardMeta(card, full || student)
  return (
    <Modal
      className="quick-checkin-modal"
      width={920}
      centered
      title={<QuickCheckInHeading studentName={student.name} />}
      open
      onCancel={props.onClose}
      footer={(
        <div className="quick-checkin-actions">
          <span>已选择 <strong>{dates.length}</strong> 个打卡日期</span>
          <div>
            <Button htmlType="button" onClick={props.onClose}>取消</Button>
            <Button
              form="quick-checkin-form"
              type="primary"
              htmlType="submit"
              disabled={!!blockReason || !!quotaHint || (!useCourse && !useService)}
            >{dates.length > 1 ? '确认批量打卡' : '确认打卡'}</Button>
          </div>
        </div>
      )}
      destroyOnHidden
    >
      {blockReason ? <div className="quick-checkin-notice is-error"><InfoCircleOutlined /><span>{blockReason}</span></div> : null}
      {!courseOptions.length && !serviceOptions.length ? <div className="quick-checkin-notice is-warning"><InfoCircleOutlined /><span>{serviceOnlyCard ? '暂无可用服务，请先缴费' : '暂无可用于打卡的缴费课程'}</span></div> : null}
      <Form
        id="quick-checkin-form"
        className="quick-checkin-form"
        form={form}
        layout="vertical"
        initialValues={{ hours: 1, serviceCount: 1 }}
        onFinish={async (values: { paymentId?: number; coachId?: number; hours?: number; serviceId?: number; serviceCount?: number; remark?: string }) => {
          if (blockReason) {
            message.warning(blockReason)
            return
          }
          const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
          const period = category === 'PERIOD'
          const stored = category === 'STORED_VALUE'
          const checkDates = Array.from(new Set(dates.map((date) => clampQuickCheckInDate(date, { card, records: payments, singleCard: cards.length <= 1, today: todayIso() })))).sort()
          if (!checkDates.length) {
            message.warning('请选择日期')
            return
          }
          if (checkDates.some((date) => date > todayIso())) {
            message.warning('不能选择未来日期')
            return
          }
          if (period && !card?.validEndDate) {
            message.warning('时段卡未生效，不能打卡')
            return
          }
          const payment = courseOptions.find((item) => item.id === values.paymentId) || selectableCourse
          const paymentBounds = payment && (payment.validStartDate || payment.validEndDate || payment.consumeDeadline) ? payment : card
          const bounds = checkInBounds(paymentBounds)
          const outOfRange = checkDates.find((date) => (bounds.min && date < bounds.min) || (bounds.max && date > bounds.max))
          if (outOfRange) {
            message.warning(bounds.min && outOfRange < bounds.min ? '未到有效期，不能打卡' : '已过有效期，不能打卡')
            return
          }
          if (!useCourse && !useService) {
            message.warning('请选择服务或课程')
            return
          }
          const confirmedDates = await confirmCheckInDates(checkDates, usedDates)
          if (!confirmedDates?.length) return
          const items: Array<Record<string, unknown>> = []
          const datePayload = confirmedDates.length > 1 ? { consumeDates: confirmedDates } : { consumeDate: confirmedDates[0] }
          if (useCourse) {
            if (!payment || !String(payment.courseType || '').trim()) {
              message.warning('当前学员未配置课程，不能打卡')
              return
            }
            const courseWarning = checkInCourseSubmitWarning(payment)
            if (courseWarning) {
              message.warning(courseWarning)
              return
            }
            const coachId = lockedCoach ? lockedCoach.id : Number(values.coachId || 0)
            const coachName = lockedCoach ? lockedCoach.name : personName(props.coaches.find((item) => item.id === coachId))
            if (!coachId || (!lockedCoach && (!cardCoaches.length || !cardCoaches.includes(coachId)))) {
              message.warning('请先为该课时卡分配老师')
              return
            }
            const hours = Number(values.hours || 0)
            if (!hours || hours < CHECK_IN_HOURS_MIN) {
              message.warning('请输入正确的课时数')
              return
            }
            if (hours > CHECK_IN_HOURS_MAX) {
              message.warning(`单次最多消耗 ${CHECK_IN_HOURS_MAX} 课时`)
              return
            }
            if (!stored && !period && hours * confirmedDates.length > remain) {
              message.warning(`剩余课时不足（${remain}）`)
              return
            }
            items.push({
              studentId: student.id,
              studentCardId: card?.id,
              consumeType: 1,
              remark: String(values.remark || '').trim(),
              coachId,
              coachName,
              hours,
              paymentRecordId: payment.id || undefined,
              courseType: payment.courseType,
              courseTypeLabel: payment.courseLabel,
              ...datePayload,
            })
          }
          if (useService) {
            if (!selectedServices.length) {
              message.warning('请选择服务')
              return
            }
            const invalidService = selectedServices.find((item) => !(Number(serviceCounts[item.id] || 0) > 0))
            if (invalidService) {
              message.warning('请输入正确的次数')
              return
            }
            const totalAmount = serviceAmount * confirmedDates.length
            const balance = Number(card?.remainingAmount ?? student.remainingAmount ?? 0)
            if (stored && totalAmount > balance) {
              message.warning(`剩余金额不足，剩余 ${money(balance)}，本次需 ${money(totalAmount)}`)
              return
            }
            selectedServices.forEach((service) => {
              const count = Number(serviceCounts[service.id] || 0)
              const price = period ? 0 : Number(service.discountedPrice || 0)
              items.push({
                studentId: student.id,
                studentCardId: card?.id,
                consumeType: 1,
                remark: String(values.remark || '').trim(),
                hours: count,
                unitPrice: price,
                amount: price * count,
                courseType: `service:${service.id}`,
                courseTypeLabel: service.name,
                ...datePayload,
              })
            })
          }
          try {
            if (items.length > 1) await postJson('/consumptions/composite', { items })
            else if (items[0].consumeDates) await postJson('/consumptions/batch', items[0])
            else await postJson('/consumptions', items[0])
            const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
            const successTitle = confirmedDates.length > 1
              ? `已批量打卡${confirmedDates.length}次`
              : useCourse && useService
                ? '课程和服务打卡成功'
                : useService
                  ? '服务打卡成功'
                  : '打卡成功'
            message.success(successTitle)
            props.onDone(student.id, useCourse ? Number(values.hours || 0) * confirmedDates.length : 0, amount)
          } catch (error) {
            message.error(tell(error, '打卡失败'))
          }
        }}
      >
        <div className="quick-checkin-left-column">
          <section className="quick-checkin-card-panel">
            <div className="quick-checkin-card-head">
              <div className="quick-checkin-section-title">
                <span><CreditCardOutlined /></span>
                <div>
                  <small>本次扣减卡片</small>
                  <strong>{currentCardName}</strong>
                  <small className="quick-checkin-card-meta">{currentCardMeta}</small>
                </div>
              </div>
              <em>{currentCardCategory}</em>
            </div>
            {/* The mini program only switches cards in the student-level quick entry;
                a check-in launched from an already selected card stays scoped to it. */}
            {cards.length > 1 && !props.cardSelectionLocked ? (
              <Form.Item className="quick-checkin-card-select" label="切换课时卡">
                <Select
                  value={card?.id}
                  onChange={setCardId}
                  options={cards.map((item) => {
                    const name = item.cardName || item.studentGroupName || cardCategoryText(item.cardCategory) || '课时卡'
                    return { value: item.id, label: `${name} · ${quickCheckInCardMeta(item, full || student)}` }
                  })}
                />
              </Form.Item>
            ) : null}
          </section>

          <section className={showContentTypeSelector ? 'quick-checkin-section' : 'quick-checkin-section is-direct-content'}>
            {showContentTypeSelector ? (
              <>
                <div className="quick-checkin-section-heading">
                  <div className="quick-checkin-section-title">
                    <span><ReadOutlined /></span>
                    <div><strong>打卡内容</strong><small>选择本次要记录的课程或服务</small></div>
                  </div>
                </div>
                <div className="quick-checkin-type-options">
                  <div className={useCourse ? 'quick-checkin-type-option is-active' : 'quick-checkin-type-option'}>
                    <span className="quick-checkin-type-icon"><ReadOutlined /></span>
                    <div><strong>课程</strong><small>扣减课时并记录授课老师</small></div>
                    <Switch aria-label="课程打卡" checked={useCourse} onChange={setUseCourse} />
                  </div>
                  <div className={useService ? 'quick-checkin-type-option is-active' : 'quick-checkin-type-option'}>
                    <span className="quick-checkin-type-icon"><CheckCircleOutlined /></span>
                    <div><strong>服务</strong><small>记录服务次数与消费金额</small></div>
                    <Switch aria-label="服务打卡" checked={useService} onChange={setUseService} />
                  </div>
                </div>
              </>
            ) : null}
            {!hasSelectableCourse && !serviceOptions.length ? <div className="quick-checkin-inline-notice">当前课时卡暂无可用的课程或服务权益</div> : null}
            {useCourse ? (
              <div className="quick-checkin-course-fields">
                <Form.Item className="is-full" name="paymentId" label="课程" initialValue={selectableCourse?.id}>
                  <CheckInCoursePicker options={courseOptions} />
                </Form.Item>
                {lockedCoach ? (
                  <Form.Item label="授课老师"><Input value={lockedCoach.name || '未分配老师'} disabled prefix={<UserOutlined />} /></Form.Item>
                ) : cardCoaches.length ? (
                  <Form.Item name="coachId" label="授课老师" initialValue={cardCoaches[0]}>
                    <Select
                      options={props.coaches.filter((item) => cardCoaches.includes(item.id)).map((item) => ({ value: item.id, label: personName(item) }))}
                      onChange={(value) => {
                        const option = paymentOptionForCourse(courseOptions, preferredCourseForCoach(full || student, props.groups, Number(value)))
                        if (option) form.setFieldValue('paymentId', option.id)
                      }}
                    />
                  </Form.Item>
                ) : <div className="quick-checkin-inline-notice">请先为该课时卡分配老师</div>}
                <Form.Item name="hours" label="消耗课时">
                  <CheckInHoursStepper />
                </Form.Item>
              </div>
            ) : null}
            {useService ? (
              <div className="quick-checkin-service-list">
                <small className="quick-checkin-list-label">具体服务</small>
                {serviceOptions.map((item) => {
                  const count = Number(serviceCounts[item.id] || 0)
                  const selected = count > 0
                  return (
                    <div key={item.id} className={selected ? 'quick-checkin-service-row is-selected' : 'quick-checkin-service-row'}>
                      <Button htmlType="button" type={selected ? 'primary' : 'default'} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: selected ? 0 : 1 }))}>{item.name}</Button>
                      <div className="quick-checkin-stepper">
                        <Button htmlType="button" disabled={!selected || count <= 1} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: Math.max(1, count - 1) }))}>－</Button>
                        <strong>{selected ? count : 0}</strong>
                        <Button htmlType="button" disabled={!selected} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: count + 1 }))}>＋</Button>
                      </div>
                      {selected ? <span>{servicePriceText(item, count, dates.length)}</span> : <span>点击服务名称进行选择</span>}
                    </div>
                  )
                })}
                {!serviceOptions.length ? <div className="quick-checkin-inline-notice">暂无可用服务</div> : null}
              </div>
            ) : null}
          </section>
        </div>

        <section className="quick-checkin-section">
          <div className="quick-checkin-section-heading">
            <div className="quick-checkin-section-title">
              <span><CalendarOutlined /></span>
              <div><strong>打卡日期</strong><small>{batchMode ? '可在日历中连续选择多个日期' : '选择本次需要记录的日期'}</small></div>
            </div>
            <div className="quick-checkin-batch-switch">
              <span><b>批量打卡</b><small>{batchMode ? '已开启多选' : '开启后可多选'}</small></span>
              <Switch checked={batchMode} onChange={(checked) => {
                setBatchMode(checked)
                if (!checked) setDates((current) => [current[0] || checkDate])
              }} />
            </div>
          </div>
          <Form.Item className="quick-checkin-date-item" extra={dateBounds.hint || undefined}>
            <div className="quick-checkin-calendar-control">
              <div className={hasCheckedInDate ? 'quick-checkin-date-field has-used-status' : 'quick-checkin-date-field'}>
                {batchMode ? (
                  <BusinessMultiDatePicker
                    value={dates}
                    usedValues={usedDates}
                    minDate={dateBounds.min || undefined}
                    maxDate={dateMax}
                    allowClear
                    onChange={setDates}
                  />
                ) : (
                  <BusinessDatePicker
                    value={dates[0] || ''}
                    minDate={dateBounds.min || undefined}
                    maxDate={dateMax}
                    allowClear
                    onChange={(value) => setDates(value ? [value] : [])}
                  />
                )}
                {hasCheckedInDate ? <span className="quick-checkin-date-used-badge">已打卡</span> : null}
              </div>
              <div className="quick-checkin-date-presets">
                {[{ label: '今天', value: todayIso() }, { label: '昨天', value: shiftIsoDate(todayIso(), -1) }].map((preset) => {
                  const blocked = dateOutOfBoundsMessage(preset.value, dateBounds)
                  const selected = dates.includes(preset.value)
                  return (
                    <Button
                      key={preset.value}
                      htmlType="button"
                      className={selected ? 'is-active' : ''}
                      disabled={!!blocked}
                      onClick={() => setDates((current) => batchMode
                        ? (current.includes(preset.value) ? current.filter((item) => item !== preset.value) : [...current, preset.value].sort())
                        : [preset.value])}
                    >{preset.label}</Button>
                  )
                })}
              </div>
            </div>
            {quotaHint ? <div className="quick-checkin-inline-notice is-error">{quotaHint}</div> : null}
          </Form.Item>
          <Form.Item className="quick-checkin-remark" name="remark" label="备注（选填）"><Input maxLength={100} placeholder="可填写本次课程或服务的补充说明" /></Form.Item>
        </section>

      </Form>
      {props.groups.length === 0 ? null : null}
    </Modal>
  )
}

function QuickCheckInHeading(props: { studentName: string }) {
  return (
    <div className="quick-checkin-heading">
      <span className="quick-checkin-heading-icon"><CheckCircleOutlined /></span>
      <span>
        <strong>学员打卡</strong>
        <small>{props.studentName} · 记录本次课程或服务消耗</small>
      </span>
    </div>
  )
}

function quickCheckInValidity(card?: Card): string {
  const start = String(card?.validStartDate || '').slice(0, 10)
  const end = String(card?.validEndDate || card?.consumeDeadline || '').slice(0, 10)
  if (start && end) return `${start} 至 ${end}`
  if (end) return `有效期至 ${end}`
  if (start) return `${start} 起生效`
  return '无限期'
}

function quickCheckInCardMeta(card: Card | undefined, student: Student): string {
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const balance = category === 'STORED_VALUE'
    ? `剩余 ¥${money(Number(card?.remainingAmount ?? student.remainingAmount ?? 0))}`
    : category === 'PERIOD'
      ? ''
      : `剩余 ${money(cardRemain(card, student))} 课时`
  return [balance, quickCheckInValidity(card)].filter(Boolean).join(' · ')
}

function shiftIsoDate(value: string, deltaDays: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  date.setDate(date.getDate() + deltaDays)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
