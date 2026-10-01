import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { buildQuickCheckInPaymentOptions, buildQuickCheckInServiceOptions, checkInCourseSelectWarning, checkInCourseSubmitWarning, clampQuickCheckInDate } from './checkin-options'
import type { CheckInPaymentOption } from './checkin-options'
import { money, tell, todayIso } from './kit'
import type { Student, Named, PayRecord } from './students-model'
import { lockedCheckInCoach, paymentOptionForCourse, preferredCourseForCoach } from './student-card-desk'
import { activeStudentCards, boundedDateMax, cardRemain, checkInBlockReason, checkInBounds, checkInCardEligible, checkInQuotaHint, confirmCheckInDates, dateOutOfBoundsMessage, noEligibleCheckInMessage, personName, quickCheckInDefaultHours } from './students-domain'

export function servicePriceText(service: { originalPrice: number; discount: number; discountedPrice: number }, count: number, days: number): string {
  const unit = Number(service.discountedPrice || 0)
  const total = unit * count * Math.max(1, days)
  const discount = Number(service.discount || 0) > 0 ? `折扣 ${money(service.discount)}% · ` : ''
  const original = Number(service.originalPrice || 0) > 0 ? `原价 ¥${money(service.originalPrice)} · ` : ''
  const batch = days > 1 ? ` · ${days} 次合计 ¥${money(total)}` : ''
  return `${original}${discount}单价 ¥${money(unit)} · 本次 ¥${money(unit * count)}${batch}`
}

export function CheckInCoursePicker(props: {
  value?: number
  onChange?: (value: number) => void
  options: CheckInPaymentOption[]
}) {
  const [open, setOpen] = useState(false)
  const [draftId, setDraftId] = useState<number | null>(null)
  const current = props.options.find((item) => item.id === props.value)
  const draft = props.options.find((item) => item.id === draftId)
  const canConfirm = !!draft && draft.isSelectable !== false
  function openPicker() {
    if (!props.options.length) return
    const selected = props.options.find((item) => item.id === props.value && item.isSelectable !== false)
    const fallback = props.options.find((item) => item.isSelectable !== false)
    setDraftId((selected || fallback)?.id ?? null)
    setOpen(true)
  }
  function confirm() {
    const warning = checkInCourseSelectWarning(draft)
    if (!draft || warning) {
      message.warning(warning || '请选择有效的课程')
      return
    }
    props.onChange?.(draft.id)
    setOpen(false)
  }
  if (!props.options.length) return <p>当前学员未配置课程</p>
  const cardType = props.options[0]?.cardTypeLabel || ''
  return (
    <>
      <Button htmlType="button" block onClick={openPicker} style={{ textAlign: 'left' }}>
        {current?.courseLabel || current?.label || '请选择课程'}
      </Button>
      <Modal
        title={cardType ? `选择打卡类别 · ${cardType}` : '选择打卡类别'}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <div className="sheet-card" style={{ width: '100%', margin: 0, padding: 0 }}>
          {props.options.map((item) => (
            <button
              type="button"
              key={item.id}
              className={draftId === item.id && item.isSelectable !== false ? 'is-on' : ''}
              onClick={() => {
                const warning = checkInCourseSelectWarning(item)
                if (warning) {
                  message.warning(warning)
                  return
                }
                setDraftId(item.id)
              }}
            >
              <b>{item.courseLabel || item.label}{item.disabledReason ? `（${item.disabledReason}）` : ''}</b>
              {item.validityText ? <small>{item.validityText}</small> : null}
              {item.hoursRatioText ? <small>{item.hoursRatioText} · 剩余课时/总课时</small> : item.remainText && item.remainText !== item.cardTypeLabel ? <small>{item.remainText}{item.totalHoursText ? ` · ${item.totalHoursText}` : ''}</small> : null}
            </button>
          ))}
        </div>
        <Space style={{ marginTop: 12 }}>
          <Button htmlType="button" onClick={() => setOpen(false)}>取消</Button>
          <Button htmlType="button" type="primary" disabled={!canConfirm} onClick={confirm}>确定</Button>
        </Space>
      </Modal>
    </>
  )
}

export function QuickCheckIn(props: {
  student: Student | null
  preferredCardId?: number
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
  const [dateDraft, setDateDraft] = useState(todayIso())
  const [usedDates, setUsedDates] = useState<string[]>([])
  const [moreHours, setMoreHours] = useState(false)
  const [serviceCounts, setServiceCounts] = useState<Record<number, number>>({})
  const [ready, setReady] = useState(false)
  const [form] = Form.useForm()
  useEffect(() => {
    if (!student) return
    let active = true
    setReady(false)
    setDates([todayIso()])
    setDateDraft(todayIso())
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
        setDateDraft(day)
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
  const serviceOnlyCard = (String(card?.cardCategory || '').toUpperCase() === 'STORED_VALUE' || String(card?.cardCategory || '').toUpperCase() === 'PERIOD') && card?.courseCategory === false
  const courseGroup = props.groups.find((item) => item.id === Number(card?.studentGroupId || full?.studentGroupId || 0))
  const lockedCoach = serviceOnlyCard ? null : lockedCheckInCoach(courseGroup, props.coaches)
  const hasSelectableCourse = !serviceOnlyCard && !!selectableCourse
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
    setDateDraft(checkDate)
  }, [card?.id, checkDate, ready])
  useEffect(() => {
    if (!card) return
    setUseCourse(hasSelectableCourse)
    setUseService(!hasSelectableCourse && serviceOptions.length > 0)
    form.setFieldValue('paymentId', selectableCourse?.id)
    form.setFieldValue('hours', quickCheckInDefaultHours(card))
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
      <Modal title={`打卡 · ${student.name}`} open onCancel={props.onClose} footer={null} destroyOnHidden>
        <p>正在加载打卡信息...</p>
      </Modal>
    )
  }
  const blockReason = checkInBlockReason(full || student, card)
  return (
    <Modal title={`打卡 · ${student.name}`} open onCancel={props.onClose} footer={null} destroyOnHidden>
      {blockReason ? <p>{blockReason}</p> : null}
      {!courseOptions.length && !serviceOptions.length ? <p>{serviceOnlyCard ? '暂无可用服务，请先缴费' : '暂无可用于打卡的缴费课程'}</p> : null}
      <Form
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
            if (!hours || hours <= 0) {
              message.warning('请输入正确的课时数')
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
        {cards.length > 1 ? (
          <Form.Item label="选择课时卡">
            <Select value={card?.id} onChange={setCardId} options={cards.map((item) => ({ value: item.id, label: `${item.cardName || item.studentGroupName || item.cardCategory} · 剩余 ${cardRemain(item, full || student)}` }))} />
          </Form.Item>
        ) : null}
        <p>当前余额：课时 {remain}，金额 {money(card?.remainingAmount ?? student.remainingAmount)}。卡上没有余额时，按列表里的剩余课时兜底。</p>
        <Space>
          {serviceOnlyCard ? null : <><span>课程</span><Switch checked={useCourse} onChange={setUseCourse} /></>}
          {serviceOptions.length ? <><span>服务</span><Switch checked={useService} onChange={setUseService} /></> : null}
        </Space>
        {!hasSelectableCourse && !serviceOptions.length ? <p>当前课时卡暂无可用的课程或服务权益</p> : null}
        {useCourse ? (
          <>
            <Form.Item name="paymentId" label="课程" initialValue={selectableCourse?.id}>
              <CheckInCoursePicker options={courseOptions} />
            </Form.Item>
            {(courseOptions.find((item) => item.id === watchedPaymentId) || selectableCourse)?.validityText ? <p>{(courseOptions.find((item) => item.id === watchedPaymentId) || selectableCourse)?.validityText}</p> : null}
            {lockedCoach ? (
              <Form.Item label="老师"><Input value={lockedCoach.name || '未分配老师'} disabled /></Form.Item>
            ) : cardCoaches.length ? (
              <Form.Item name="coachId" label="老师" initialValue={cardCoaches[0]}>
                <Select
                  options={props.coaches.filter((item) => cardCoaches.includes(item.id)).map((item) => ({ value: item.id, label: personName(item) }))}
                  onChange={(value) => {
                    const option = paymentOptionForCourse(courseOptions, preferredCourseForCoach(full || student, props.groups, Number(value)))
                    if (option) form.setFieldValue('paymentId', option.id)
                  }}
                />
              </Form.Item>
            ) : <p>请先为该课时卡分配老师</p>}
            <Form.Item name="hours" label="消耗课时"><InputNumber min={quickCheckInDefaultHours(card) < 0.5 ? quickCheckInDefaultHours(card) : 0.5} step={0.5} style={{ width: '100%' }} /></Form.Item>
            <Space wrap>
              {(moreHours ? [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] : [0.5, 1, 1.5, 2]).map((hour) => (
                <Button key={hour} htmlType="button" type={Number(watchedHours || 1) === hour ? 'primary' : 'default'} onClick={() => form.setFieldValue('hours', hour)}>{hour}课时</Button>
              ))}
              <Button type="link" htmlType="button" onClick={() => setMoreHours((current) => !current)}>{moreHours ? '收起' : '更多课时'}</Button>
            </Space>
          </>
        ) : null}
        {useService ? (
          <div>
            <div>具体服务</div>
            {serviceOptions.map((item) => {
              const count = Number(serviceCounts[item.id] || 0)
              const selected = count > 0
              return (
                <div key={item.id} className="work-toolbar">
                  <Button htmlType="button" type={selected ? 'primary' : 'default'} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: selected ? 0 : 1 }))}>{item.name}</Button>
                  <Button htmlType="button" disabled={!selected || count <= 1} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: Math.max(1, count - 1) }))}>－</Button>
                  <span>{selected ? count : 0}</span>
                  <Button htmlType="button" disabled={!selected} onClick={() => setServiceCounts((current) => ({ ...current, [item.id]: count + 1 }))}>＋</Button>
                  {selected ? <span>{servicePriceText(item, count, dates.length)}</span> : null}
                </div>
              )
            })}
            {!serviceOptions.length ? <p>暂无可用服务</p> : null}
          </div>
        ) : null}
        <Form.Item label="打卡日期" extra={dateBounds.hint || undefined}>
          <Space wrap>
            <Input type="date" value={dateDraft} min={dateBounds.min || undefined} max={dateMax} onChange={(event) => setDateDraft(event.target.value)} />
            <Button htmlType="button" onClick={() => {
              if (!dateDraft) return
              const blocked = dateOutOfBoundsMessage(dateDraft, dateBounds)
              if (blocked) {
                message.warning(blocked)
                return
              }
              setDates((current) => current.includes(dateDraft) ? current : [...current, dateDraft].sort())
            }}>添加日期</Button>
          </Space>
          <Space wrap style={{ marginTop: 8 }}>
            {dates.map((date) => (
              <Tag key={date} closable={dates.length > 1} onClose={() => setDates((current) => current.filter((item) => item !== date))}>{date}{usedDates.includes(date) ? ' 已打卡' : ''}</Tag>
            ))}
          </Space>
          {quotaHint ? <p>{quotaHint}</p> : null}
        </Form.Item>
        <Form.Item name="remark" label="备注"><Input maxLength={100} placeholder="选填，不超过100字" /></Form.Item>
        <Button type="primary" htmlType="submit" disabled={!!blockReason || !!quotaHint || (!useCourse && !useService)}>{dates.length > 1 ? '批量打卡' : '确认打卡'}</Button>
      </Form>
      {props.groups.length === 0 ? null : null}
    </Modal>
  )
}
