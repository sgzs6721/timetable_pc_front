import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson, postJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { computePeriodValidityEndDate, getPeriodValidityRule, paymentDateLabel, proratePeriodTransferAmount, transferTargetLabel } from './payment-rules'
import { money, tell, todayIso } from './kit'
import type { Student, Named, PayRecord, PayLaunch } from './students-model'
import { adjustPaymentTypeOptions, amountBelowRefundMax, clampPaymentDecimal, mainValidityUnlimited, paymentFormError, paymentValidityMode, standaloneTransferIn } from './student-payments'
import { ActivateHourPicker, CommissionPeople, LimitedHours, PaymentStoredPricing, TransferTargetSelect, ValidityEndDate, ValidityStartDate, activateHourOptions, adjustmentHourFields, adjustmentReasonOptions, amountOverLimitHint, clampRefundFeePercent, groupMatchesCoach, hoursOverLimitMessage, hoursReasonUnavailable, paymentCoachChoices, recordAmountImpact, recordHoursImpact, refundCap, refundFormulaTerms } from './student-payment-controls'
import type { RefundBalance } from './student-payment-controls'
import { ChoiceTabs, personName } from './students-domain'

export function PaymentEditor(props: {
  open: PayLaunch | null
  student: Student
  coaches: Named[]
  groups: Named[]
  services: Named[]
  payments: PayRecord[]
  preferredCardId?: number
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const [savingPayment, setSavingPayment] = useState(false)
  const paymentValues = (Form.useWatch([], form) || {}) as Record<string, unknown>
  const payType = Form.useWatch('type', form)
  const reason = Form.useWatch('adjustmentReason', form)
  const cardId = Form.useWatch('studentCardId', form)
  const commissionOn = Form.useWatch('commissionEnabled', form)
  const paymentAmountValue = Form.useWatch('amount', form)
  const activateOn = Form.useWatch('activateHours', form)
  const coachMemberId = Form.useWatch('coachMemberId', form)
  const mainRecordId = Form.useWatch('mainRecordId', form)
  const paymentDateValue = Form.useWatch('paymentDate', form)
  const refundFeePercent = Form.useWatch('refundFeePercent', form)
  const courseTypeValue = Form.useWatch('courseType', form)
  const [refundBalance, setRefundBalance] = useState<RefundBalance | null>(null)
  const [validityMode, setValidityMode] = useState<'timed' | 'deadline'>('deadline')
  const adjustMain = props.open && typeof props.open === 'object' && 'adjust' in props.open ? props.open.adjust : undefined
  const record = props.open && typeof props.open === 'object' && !('adjust' in props.open) ? props.open : undefined
  const adjustMode = !!adjustMain || (!!record && ['supplement', 'adjustment', 'refund'].includes(String(record.type || '')))
  const selectedCard = (props.student.cards || []).find((card) => card.id === cardId)
  const storedValue = String(selectedCard?.cardCategory || '').toUpperCase() === 'STORED_VALUE'
  const courseOptions = [
    ...props.groups.filter((item) => groupMatchesCoach(item, Number(coachMemberId || 0))).map((item) => ({ value: String(item.id), label: item.shortName || personName(item) })),
    ...props.services.map((item) => ({ value: `service:${item.id}`, label: personName(item) })),
  ]
  const cardCategory = String(selectedCard?.cardCategory || '').toUpperCase()
  const activateOptions = !record && payType === 'renew' && cardCategory !== 'STORED_VALUE' && cardCategory !== 'PERIOD'
    ? activateHourOptions(props.payments, Number(cardId || 0))
    : []
  const refundLimit = payType === 'refund' && refundBalance ? refundCap(refundBalance, refundFeePercent) : null
  const periodCard = cardCategory === 'PERIOD'
  const periodTransfer = periodCard && payType === 'adjustment' && reason === 'transfer'
  const hoursCard = cardCategory !== 'STORED_VALUE' && cardCategory !== 'PERIOD'
  const amountAdjust = storedValue && ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'transfer'].includes(String(reason || ''))
  const showAmount = payType !== 'adjustment' || amountAdjust
  const hourFields = adjustmentHourFields(String(reason || ''), cardCategory)
  const showPurchaseHours = hoursCard && (payType === 'new' || payType === 'renew' || payType === 'supplement')
  const showRefundHours = hoursCard && payType === 'refund'
  const showAdjustHours = payType === 'adjustment' && !amountAdjust && (hourFields.regular || hourFields.gift)
  const showCourse = payType !== 'refund' && payType !== 'adjustment'
  const serviceOnlyPay = (storedValue || periodCard) && selectedCard?.courseCategory === false
  const coachChoices = paymentCoachChoices(selectedCard, props.groups, props.coaches, serviceOnlyPay)
  const coachLocked = coachChoices.some((item) => item.locked)
  const coachChoiceKey = coachChoices.map((item) => item.id).join(',')
  const lockedCourseId = serviceOnlyPay ? 0 : Number(selectedCard?.studentGroupId || 0)
  const lockedCourse = lockedCourseId > 0 ? props.groups.find((item) => item.id === lockedCourseId) : undefined
  const showValidity = payType === 'new' || payType === 'renew' || payType === 'supplement' || (payType === 'adjustment' && reason === 'transfer' && hoursCard)
  const supplementLocked = payType === 'supplement' && !periodCard && mainValidityUnlimited(refundBalance)
  const showValidityControls = showValidity && !supplementLocked
  const showTimedRange = showValidityControls && (periodCard || validityMode === 'timed')
  const showDeadline = showValidityControls && !periodCard && validityMode === 'deadline'
  const periodRefundValidity = periodCard && payType === 'refund' && amountBelowRefundMax(paymentAmountValue, refundLimit)
  const linkedMain = adjustMain || props.payments.find((item) => item.id === Number(mainRecordId || 0))
  const originalPayDate = String(linkedMain?.paymentDate || '').slice(0, 10)
  const dateFloor = (payType === 'adjustment' || payType === 'supplement' || payType === 'refund') ? originalPayDate : ''
  const dateCeil = payType === 'refund' ? todayIso() : ''
  const editingImpact = record
    ? recordHoursImpact(String(record.type || ''), String(record.adjustmentReason || ''), Number(record.hours || 0), Number(record.giftHours || 0))
    : { regular: 0, gift: 0 }
  const hoursReady = !!(hoursCard && refundBalance && (payType === 'adjustment' || payType === 'refund'))
  const regularAvailable = hoursReady
    ? Math.max(0, Number(refundBalance?.remainingRegularHours || 0) - editingImpact.regular)
    : Number(selectedCard?.regularHours ?? selectedCard?.remainingHours ?? props.student.remainingHours ?? 0)
  const giftAvailable = hoursReady
    ? Math.max(0, Number(refundBalance?.remainingBonusHours || 0) - editingImpact.gift)
    : Number(selectedCard?.bonusHours ?? props.student.bonusHours ?? 0)
  const editingAmountImpact = record
    ? recordAmountImpact(String(record.type || ''), String(record.adjustmentReason || ''), Number(record.amount || 0))
    : 0
  const cardAmount = Number(selectedCard?.remainingAmount ?? props.student.remainingAmount ?? 0)
  const amountAvailable = amountAdjust
    ? Math.max(0, Number((cardAmount - editingAmountImpact).toFixed(2)))
    : Number(refundBalance?.remainingAmount ?? cardAmount)
  const amountOverHint = amountAdjust ? amountOverLimitHint(String(reason || ''), paymentAmountValue, amountAvailable) : ''
  const paymentLimits = amountAdjust
    ? { regular: regularAvailable, gift: giftAvailable, amount: amountAvailable }
    : hoursReady ? { regular: regularAvailable, gift: giftAvailable } : undefined
  const refundLeft = refundBalance == null
    ? null
    : Math.max(0, Number(refundBalance.maxRefundAmount ?? refundBalance.remainingAmount ?? 0))
  const refundBlocked = adjustMode && record?.type !== 'refund' && refundLeft === 0
  useEffect(() => {
    if (!props.open) return
    const group = props.groups.find((item) => String(item.id) === String(courseTypeValue || ''))
    if (!group) return
    const rights = (record?.storedValueRights || []) as Array<{ courseType?: string; discount?: number; unitPrice?: number }>
    const matched = rights.find((item) => String(item.courseType) === String(group.id))
    const original = Number(group.unitPrice || 0)
    const discount = matched?.discount
    form.setFieldsValue({
      courseDiscount: discount,
      courseUnitPrice: matched?.unitPrice ?? (discount != null && original > 0 ? Number(((original * Number(discount)) / 100).toFixed(2)) : undefined),
    })
  }, [props.open, courseTypeValue])
  useEffect(() => {
    if (!props.open || !selectedCard) return
    const discount: Record<string, number | undefined> = {}
    const price: Record<string, number | undefined> = {}
    ;(selectedCard.serviceRights || []).forEach((right) => {
      const id = String(right.courseType || '').replace(/^service:/, '')
      if (!id) return
      discount[id] = right.discount
      price[id] = right.unitPrice
    })
    form.setFieldsValue({ serviceRightDiscount: discount, serviceRightPrice: price })
  }, [props.open, selectedCard?.id])
  useEffect(() => {
    if (!props.open || !commissionOn) return
    const base = Number(paymentAmountValue || 0)
    if (!(base > 0)) return
    const rows = form.getFieldValue('commissionAllocations') as Array<{ commissionRate?: number; commissionAmount?: number }> | undefined
    if (!rows?.length) return
    const next = rows.map((row) => {
      const rate = Number(row?.commissionRate || 0)
      if (!(rate > 0)) return row
      return { ...row, commissionAmount: Number(((base * Math.min(100, rate)) / 100).toFixed(2)) }
    })
    const changed = next.some((row, index) => Number(row.commissionAmount || 0) !== Number(rows[index]?.commissionAmount || 0))
    if (changed) form.setFieldValue('commissionAllocations', next)
  }, [props.open, commissionOn, paymentAmountValue])
  useEffect(() => {
    const needsBalance = payType === 'refund' || payType === 'supplement' || payType === 'adjustment'
    if (!props.open || !needsBalance || !mainRecordId) {
      setRefundBalance(null)
      return
    }
    let active = true
    getJson<{ mainRecordBalance?: RefundBalance }>('/payment-records/bootstrap', {
      studentId: props.student.id,
      mainRecordId,
      studentCardId: cardId || undefined,
    }).then((data) => {
      if (!active) return
      const next = data.mainRecordBalance || null
      setRefundBalance(next)
      if (next?.refundFeeEnabled && form.getFieldValue('refundFeePercent') == null) {
        form.setFieldValue('refundFeePercent', Number(next.refundFeePercent || 0))
      }
      if (periodTransfer && next) {
        form.setFieldValue('amount', proratePeriodTransferAmount(
          Number(next.paidAmount || 0),
          String(next.validStartDate || '').slice(0, 10),
          String(next.validEndDate || '').slice(0, 10),
          String(form.getFieldValue('paymentDate') || todayIso()).slice(0, 10),
        ))
      }
    }).catch(() => {
      if (active) setRefundBalance(null)
    })
    return () => { active = false }
  }, [props.open, payType, periodTransfer, mainRecordId, cardId, props.student.id])
  useEffect(() => {
    if (!props.open || !periodTransfer || !refundBalance) return
    const amount = proratePeriodTransferAmount(
      Number(refundBalance.paidAmount || 0),
      String(refundBalance.validStartDate || '').slice(0, 10),
      String(refundBalance.validEndDate || '').slice(0, 10),
      String(paymentDateValue || todayIso()).slice(0, 10),
    )
    if (Number(form.getFieldValue('amount') || 0) !== amount) form.setFieldValue('amount', amount)
  }, [props.open, periodTransfer, refundBalance, paymentDateValue])
  useEffect(() => {
    if (!props.open || !hoursReady || payType !== 'adjustment') return
    const current = String(form.getFieldValue('adjustmentReason') || '')
    if (!hoursReasonUnavailable(current, regularAvailable, giftAvailable)) return
    const next = regularAvailable > 0 ? 'manual_deduct' : giftAvailable > 0 ? 'gift_expired' : 'activity_gift'
    if (next !== current) form.setFieldValue('adjustmentReason', next)
  }, [props.open, hoursReady, payType, regularAvailable, giftAvailable])
  useEffect(() => {
    if (!props.open || !refundBlocked || payType !== 'refund') return
    message.warning('当前无可退余额')
    form.setFieldValue('type', 'supplement')
  }, [props.open, refundBlocked, payType])
  useEffect(() => {
    if (!props.open) return
    form.resetFields()
    form.setFieldsValue({
      type: adjustMain ? 'supplement' : record?.type || 'new',
      amount: record?.amount,
      hours: record?.hours,
      giftHours: record?.giftHours,
      paymentDate: record?.paymentDate || todayIso(),
      paymentMethod: record?.paymentMethod || 2,
      courseType: record?.courseType || adjustMain?.courseType,
      validStartDate: record?.validStartDate,
      validEndDate: record?.validEndDate,
      consumeDeadline: record?.consumeDeadline,
      remark: record?.remark,
      adjustmentReason: record?.adjustmentReason,
      studentCardId: record?.studentCardId || adjustMain?.studentCardId || props.preferredCardId || props.student.cards?.find((card) => card.status == null || Number(card.status) === 1)?.id,
      mainRecordId: adjustMain?.id || record?.mainRecordId,
      commissionEnabled: !!(record?.commissionEnabled || record?.commissionMemberId || (record?.commissionAllocations || []).length),
      commissionAllocations: record?.commissionAllocations?.length
        ? record.commissionAllocations
        : record?.commissionMemberId
          ? [{ memberId: record.commissionMemberId, commissionRate: record.commissionRate, commissionAmount: record.commissionAmount }]
          : [],
      coachMemberId: record?.coachMemberId,
      activateHours: false,
      activateSourceRecordIds: [],
      transferTargetStudentId: record?.transferTargetStudentId,
      storedValueRights: record?.storedValueRights || [],
    })
    setValidityMode(paymentValidityMode(record))
  }, [props.open])
  useEffect(() => {
    if (!props.open || payType === 'refund' || serviceOnlyPay) return
    const patch: Record<string, unknown> = {}
    if (lockedCourseId > 0 && String(form.getFieldValue('courseType') || '') !== String(lockedCourseId)) {
      patch.courseType = String(lockedCourseId)
    }
    const currentCoach = Number(form.getFieldValue('coachMemberId') || 0)
    if (coachLocked) {
      const nextCoach = coachChoices.some((item) => item.id === currentCoach) ? currentCoach : coachChoices[0]?.id
      if (nextCoach && currentCoach !== nextCoach) patch.coachMemberId = nextCoach
    } else if (coachChoices.length === 1 && currentCoach !== coachChoices[0].id) {
      patch.coachMemberId = coachChoices[0].id
    }
    if (Object.keys(patch).length) form.setFieldsValue(patch)
  }, [props.open, payType, serviceOnlyPay, selectedCard?.id, lockedCourseId, coachLocked, coachChoiceKey])
  useEffect(() => {
    if (!props.open || payType !== 'supplement' || record || !refundBalance) return
    if (mainValidityUnlimited(refundBalance)) {
      form.setFieldsValue({ validStartDate: undefined, validEndDate: undefined, consumeDeadline: undefined })
      return
    }
    const start = String(refundBalance.validStartDate || '').slice(0, 10)
    const end = String(refundBalance.validEndDate || '').slice(0, 10)
    const deadline = String(refundBalance.consumeDeadline || end || '').slice(0, 10)
    form.setFieldsValue({
      validStartDate: start || undefined,
      validEndDate: end || undefined,
      consumeDeadline: deadline || undefined,
    })
    setValidityMode(paymentValidityMode({ validStartDate: start, validEndDate: end }))
  }, [props.open, payType, record, mainRecordId, refundBalance])
  useEffect(() => {
    if (!props.open || !periodRefundValidity || !refundBalance) return
    if (!form.getFieldValue('validStartDate') && refundBalance.validStartDate) {
      form.setFieldValue('validStartDate', String(refundBalance.validStartDate).slice(0, 10))
    }
    if (!form.getFieldValue('validEndDate') && refundBalance.validEndDate) {
      form.setFieldValue('validEndDate', String(refundBalance.validEndDate).slice(0, 10))
    }
  }, [props.open, periodRefundValidity, refundBalance])
  function paymentRecordProblem(source: Record<string, unknown>) {
    const values = { ...source }
    const requireCourse = values.type !== 'refund' && !serviceOnlyPay
    if (requireCourse && lockedCourseId > 0) values.courseType = String(lockedCourseId)
    if (requireCourse && coachLocked && !Number(values.coachMemberId || 0) && coachChoices[0]) values.coachMemberId = coachChoices[0].id
    if (requireCourse && coachChoices.length > 0 && !Number(values.coachMemberId || 0)) return '请先选择老师'
    const nextCategory = String(selectedCard?.cardCategory || props.student.cardCategory || '').toUpperCase()
    const nextReason = String(values.adjustmentReason || '')
    const storedAdjust = nextCategory === 'STORED_VALUE' && ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'transfer'].includes(nextReason)
    const periodTransferSubmit = nextCategory === 'PERIOD' && nextReason === 'transfer'
    if (values.type === 'adjustment' && !storedAdjust && !periodTransferSubmit) values.amount = 0
    const periodSubmit = nextCategory === 'PERIOD'
    const validityLocked = values.type === 'supplement' && !periodSubmit && mainValidityUnlimited(refundBalance)
    const belowRefundMax = values.type === 'refund' && periodSubmit && amountBelowRefundMax(values.amount, refundLimit)
    const keepsValidity = values.type === 'new' || values.type === 'renew' || values.type === 'supplement' || (values.type === 'adjustment' && nextReason === 'transfer' && !periodSubmit)
    if (values.type === 'refund') {
      if (!belowRefundMax) {
        values.validStartDate = undefined
        values.validEndDate = undefined
      }
      values.consumeDeadline = undefined
      values.validityMode = undefined
      values.belowRefundMax = belowRefundMax || undefined
    } else if (validityLocked || !keepsValidity) {
      values.validStartDate = undefined
      values.validEndDate = undefined
      values.consumeDeadline = undefined
      values.validityMode = undefined
      values.belowRefundMax = undefined
    } else if (periodSubmit || validityMode === 'timed') {
      values.consumeDeadline = undefined
      values.validityMode = 'timed'
      values.belowRefundMax = undefined
    } else {
      values.validStartDate = undefined
      values.validEndDate = undefined
      values.validityMode = 'deadline'
      values.belowRefundMax = undefined
    }
    return paymentFormError(
      values,
      props.student,
      selectedCard,
      props.payments,
      props.coaches,
      paymentLimits,
    )
  }
  const paymentBlocked = paymentRecordProblem(paymentValues)
  if (!props.open) return null
  return (
    <Modal title={adjustMain ? '调整' : record ? '编辑缴费' : '新增缴费'} open onCancel={props.onClose} footer={null} destroyOnHidden>
      <Form
        form={form}
        key={adjustMain ? `adjust-${adjustMain.id}` : record?.id || 'new'}
        layout="vertical"
        onValuesChange={(changed, all) => {
          if (changed.paymentDate) {
            const nextType = String(all.type || '')
            const floorSource = adjustMain || props.payments.find((item) => item.id === Number(all.mainRecordId || 0))
            const floor = (nextType === 'adjustment' || nextType === 'supplement' || nextType === 'refund')
              ? String(floorSource?.paymentDate || '').slice(0, 10)
              : ''
            const nextDate = String(changed.paymentDate)
            if (floor && nextDate < floor) {
              message.warning(`调整日期不能早于原缴费日期 ${floor}`)
              form.setFieldValue('paymentDate', floor)
            } else if (nextType === 'refund' && nextDate > todayIso()) {
              message.warning('退费日期不能是未来日期')
              form.setFieldValue('paymentDate', todayIso())
            }
          }
          if (changed.type === 'adjustment') {
            const nextCategory = String(selectedCard?.cardCategory || props.student.cardCategory || '').toUpperCase()
            const nextReason = nextCategory === 'PERIOD'
              ? 'transfer'
              : nextCategory === 'STORED_VALUE'
                ? 'manual_deduct_amount'
                : String(all.adjustmentReason || 'gift_expired')
            form.setFieldsValue({
              adjustmentReason: nextReason,
              commissionEnabled: false,
              amount: nextCategory === 'STORED_VALUE' || nextCategory === 'PERIOD' ? all.amount : 0,
            })
          }
          if (!selectedCard || String(selectedCard.cardCategory || '').toUpperCase() !== 'PERIOD') return
          if (periodRefundValidity) return
          if (changed.validStartDate) {
            const end = computePeriodValidityEndDate(String(changed.validStartDate), selectedCard.periodType)
            if (end) form.setFieldValue('validEndDate', end)
            return
          }
          if (!changed.validEndDate) return
          const start = String(all.validStartDate || '')
          const expected = computePeriodValidityEndDate(start, selectedCard.periodType)
          const nextEnd = String(changed.validEndDate || '')
          if (!expected || !nextEnd || nextEnd === expected) return
          const rule = getPeriodValidityRule(selectedCard.periodType)
          form.setFieldValue('validEndDate', expected)
          message.warning(rule ? `${rule.label}有效期必须为${rule.days}天，结束日期应为${expected}` : '时段卡有效期设置不正确')
        }}
        initialValues={{
          type: adjustMain ? 'supplement' : record?.type || 'new',
          amount: record?.amount,
          hours: record?.hours,
          giftHours: record?.giftHours,
          paymentDate: record?.paymentDate || todayIso(),
          paymentMethod: record?.paymentMethod || 2,
          courseType: record?.courseType || adjustMain?.courseType,
          validStartDate: record?.validStartDate,
          validEndDate: record?.validEndDate,
          consumeDeadline: record?.consumeDeadline,
          remark: record?.remark,
          adjustmentReason: record?.adjustmentReason,
          studentCardId: record?.studentCardId || adjustMain?.studentCardId || props.preferredCardId || props.student.cards?.find((card) => card.status == null || Number(card.status) === 1)?.id,
          mainRecordId: adjustMain?.id || record?.mainRecordId,
          commissionEnabled: record?.commissionEnabled || !!record?.commissionMemberId || !!(record?.commissionAllocations || []).length,
          commissionAllocations: record?.commissionAllocations?.length
            ? record.commissionAllocations
            : record?.commissionMemberId
              ? [{ memberId: record.commissionMemberId, commissionRate: record.commissionRate, commissionAmount: record.commissionAmount }]
              : [],
          coachMemberId: record?.coachMemberId,
          activateHours: false,
          activateSourceRecordIds: [],
          transferTargetStudentId: record?.transferTargetStudentId,
          storedValueRights: record?.storedValueRights || [],
        }}
        onFinish={async (values) => {
          if (savingPayment) return
          if (!props.student?.id) {
            message.warning('学员信息错误')
            return
          }
          const requireCourse = values.type !== 'refund' && !serviceOnlyPay
          if (requireCourse && lockedCourseId > 0) values.courseType = String(lockedCourseId)
          if (requireCourse && coachLocked && !Number(values.coachMemberId || 0) && coachChoices[0]) values.coachMemberId = coachChoices[0].id
          if (requireCourse && coachChoices.length > 0 && !Number(values.coachMemberId || 0)) {
            message.warning('请先选择老师')
            return
          }
          const nextCategory = String(selectedCard?.cardCategory || props.student.cardCategory || '').toUpperCase()
          const nextReason = String(values.adjustmentReason || '')
          const storedAdjust = nextCategory === 'STORED_VALUE' && ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'transfer'].includes(nextReason)
          const periodTransferSubmit = nextCategory === 'PERIOD' && nextReason === 'transfer'
          if (values.type === 'adjustment' && !storedAdjust && !periodTransferSubmit) values.amount = 0
          const periodSubmit = nextCategory === 'PERIOD'
          const validityLocked = values.type === 'supplement' && !periodSubmit && mainValidityUnlimited(refundBalance)
          const belowRefundMax = values.type === 'refund' && periodSubmit && amountBelowRefundMax(values.amount, refundLimit)
          const keepsValidity = values.type === 'new' || values.type === 'renew' || values.type === 'supplement' || (values.type === 'adjustment' && nextReason === 'transfer' && !periodSubmit)
          if (values.type === 'refund') {
            if (!belowRefundMax) {
              values.validStartDate = undefined
              values.validEndDate = undefined
            }
            values.consumeDeadline = undefined
            values.validityMode = undefined
            values.belowRefundMax = belowRefundMax || undefined
          } else if (validityLocked || !keepsValidity) {
            values.validStartDate = undefined
            values.validEndDate = undefined
            values.consumeDeadline = undefined
            values.validityMode = undefined
            values.belowRefundMax = undefined
          } else if (periodSubmit || validityMode === 'timed') {
            values.consumeDeadline = undefined
            values.validityMode = 'timed'
            values.belowRefundMax = undefined
          } else {
            values.validStartDate = undefined
            values.validEndDate = undefined
            values.validityMode = 'deadline'
            values.belowRefundMax = undefined
          }
          const blocked = paymentFormError(
            values,
            props.student,
            selectedCard,
            props.payments,
            props.coaches,
            paymentLimits,
          )
          if (blocked) {
            message.warning(blocked)
            return
          }
          const pricingGroup = storedValue && !serviceOnlyPay && (values.type === 'new' || values.type === 'renew')
            ? props.groups.find((item) => String(item.id) === String(values.courseType || ''))
            : undefined
          const boundIds = (selectedCard?.serviceItemIds || []).map((id) => Number(id)).filter((id) => id > 0)
          const pickedIds = Array.isArray(values.pickedServiceIds)
            ? (values.pickedServiceIds as Array<number | string>).map((id) => Number(id)).filter((id) => id > 0)
            : []
          const choosingServices = serviceOnlyPay && boundIds.length === 0 && (values.type === 'new' || values.type === 'renew')
          if (choosingServices && props.services.length > 0 && pickedIds.length === 0) {
            message.warning('请选择服务类别')
            return
          }
          const serviceIds = storedValue && (values.type === 'new' || values.type === 'renew')
            ? (boundIds.length ? boundIds : pickedIds)
            : []
          const serviceDiscountMap = (values.serviceRightDiscount || {}) as Record<string, number>
          const servicePriceMap = (values.serviceRightPrice || {}) as Record<string, number>
          const serviceRightNumbers = (id: number) => ({
            discount: Number(serviceDiscountMap[id] ?? serviceDiscountMap[String(id)] ?? 0),
            unit: Number(servicePriceMap[id] ?? servicePriceMap[String(id)] ?? 0),
          })
          const serviceRightReady = (id: number) => {
            const right = serviceRightNumbers(id)
            return right.discount > 0 || right.unit > 0
          }
          if (pricingGroup) {
            const discount = Number(values.courseDiscount)
            const label = pricingGroup.shortName || personName(pricingGroup)
            if (values.courseDiscount != null && values.courseDiscount !== '' && (!Number.isFinite(discount) || discount < 0 || discount > 100)) {
              message.warning(`${label}折扣必须在 0 到 100 之间`)
              return
            }
            if (!(discount > 0)) {
              message.warning('请填写课程类型折扣')
              return
            }
          }
          if ((pricingGroup || serviceIds.length > 0) && !(pricingGroup && Number(values.courseDiscount) > 0) && !serviceIds.some(serviceRightReady)) {
            message.warning('请至少选择一个课程或服务并设置折扣/单价')
            return
          }
          for (const id of serviceIds) {
            const right = serviceRightNumbers(id)
            if (right.discount < 0 || right.discount > 100) {
              const service = props.services.find((item) => item.id === id)
              message.warning(`${service ? personName(service) : '已选服务'}折扣必须在 0 到 100 之间`)
              return
            }
            if (!serviceRightReady(id)) {
              const service = props.services.find((item) => item.id === id)
              message.warning(`请为${service ? personName(service) : '已选服务'}设置折扣或折后单价`)
              return
            }
          }
          const builtRights = [
            ...(pricingGroup ? [{
              courseType: String(pricingGroup.id),
              courseTypeLabel: pricingGroup.shortName || personName(pricingGroup),
              discount: Number(values.courseDiscount) > 0 ? Number(values.courseDiscount) : undefined,
              unitPrice: Number(values.courseUnitPrice) > 0 ? Number(values.courseUnitPrice) : undefined,
            }] : []),
            ...serviceIds.map((id) => {
              const service = props.services.find((item) => item.id === id)
              const discount = Number(serviceDiscountMap[id] ?? serviceDiscountMap[String(id)] ?? 0)
              const unit = Number(servicePriceMap[id] ?? servicePriceMap[String(id)] ?? 0)
              return {
                courseType: `service:${id}`,
                courseTypeLabel: service ? personName(service) : '',
                discount: discount > 0 ? discount : undefined,
                unitPrice: unit > 0 ? unit : undefined,
              }
            }),
          ]
          if (values.type === 'refund' && refundLimit != null && Number(values.amount || 0) > refundLimit + 0.001) {
            message.warning(refundLimit > 0 ? `最多可退${refundLimit}` : '当前无可退余额')
            return
          }
          const allocations = ((values.commissionAllocations || []) as Array<{ memberId?: number; commissionRate?: number; commissionAmount?: number }>)
            .filter((item) => Number(item?.memberId || 0) > 0)
          const firstAllocation = allocations[0]
          const payload = {
            ...values,
            refundFeePercent: undefined,
            activateHours: undefined,
            validityMode: undefined,
            belowRefundMax: undefined,
            studentId: props.student.id,
            hours: showPurchaseHours || showRefundHours || (showAdjustHours && hourFields.regular) ? (values.hours ?? 0) : 0,
            giftHours: showPurchaseHours || showRefundHours || (showAdjustHours && hourFields.gift) ? (values.giftHours ?? 0) : 0,
            paymentDate: values.paymentDate || todayIso(),
            paymentMethod: values.type === 'adjustment' ? undefined : (values.paymentMethod || 2),
            coachMemberId: serviceOnlyPay ? undefined : (values.coachMemberId || undefined),
            courseType: serviceOnlyPay ? undefined : values.courseType,
            activateSourceRecordIds: values.type === 'renew' && values.activateHours ? values.activateSourceRecordIds : undefined,
            commissionEnabled: !!values.commissionEnabled,
            commissionAllocations: values.commissionEnabled ? allocations : [],
            commissionMemberId: values.commissionEnabled ? firstAllocation?.memberId : undefined,
            commissionRate: values.commissionEnabled ? firstAllocation?.commissionRate : undefined,
            commissionAmount: values.commissionEnabled ? firstAllocation?.commissionAmount : undefined,
            transferTargetStudentId: values.adjustmentReason === 'transfer' ? values.transferTargetStudentId : undefined,
            courseDiscount: undefined,
            courseUnitPrice: undefined,
            serviceRightDiscount: undefined,
            serviceRightPrice: undefined,
            pickedServiceIds: undefined,
            storedValueRights: storedValue && (values.type === 'new' || values.type === 'renew')
              ? builtRights
              : storedValue
                ? (values.storedValueRights || []).filter((item: { courseType?: string }) => item?.courseType)
                : undefined,
          }
          try {
            setSavingPayment(true)
            if (record) await putJson(`/payment-records/${record.id}`, payload)
            else await postJson('/payment-records', payload)
            message.success('保存成功')
            await props.onSaved()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          } finally {
            setSavingPayment(false)
          }
        }}
      >
        <Form.Item name="type" label="类型">
          <Select options={(adjustMode ? adjustPaymentTypeOptions(cardCategory) : [
            { value: 'new', label: '新增' },
            { value: 'renew', label: '续费' },
          ]).map((item) => ({ ...item, disabled: item.value === 'refund' && refundBlocked }))} />
        </Form.Item>
        <Form.Item name="studentCardId" label="学员卡" rules={[{ required: true, message: '请选择学员卡' }]}>
          <Select
            disabled={!!record || !!adjustMain}
            options={(props.student.cards || [])
              .filter((card) => card.id && (card.status == null || Number(card.status) === 1 || card.id === record?.studentCardId || card.id === adjustMain?.studentCardId))
              .map((card) => ({ value: card.id, label: card.cardName || card.studentGroupName || card.cardCategory }))}
          />
        </Form.Item>
        {payType === 'supplement' || payType === 'refund' || payType === 'adjustment' ? (
          <Form.Item name="mainRecordId" label="关联主记录" rules={[{ required: true, message: '请选择主缴费记录' }]}>
            <Select
              disabled={!!adjustMain}
              options={(adjustMain ? [adjustMain] : props.payments.filter((item) => item.type === 'new' || item.type === 'renew' || standaloneTransferIn(item))).map((item) => ({ value: item.id, label: `${item.paymentDate || ''} ${item.courseTypeLabel || item.courseType || item.typeText || item.amount || ''}` }))}
            />
          </Form.Item>
        ) : null}
        {showCourse ? (
          <>
            {serviceOnlyPay ? null : (
              <>
                {coachChoices.length > 0 ? (
                  coachLocked ? (
                    <Form.Item label="授课老师"><span>{coachChoices.map((item) => item.label).join('、')}</span></Form.Item>
                  ) : (
                    <Form.Item name="coachMemberId" label="授课老师">
                      <Select placeholder="选择授课老师" options={coachChoices.map((item) => ({ value: item.id, label: item.label }))} />
                    </Form.Item>
                  )
                ) : null}
                {lockedCourseId > 0 ? (
                  <Form.Item label="缴费课程"><span>{lockedCourse ? (lockedCourse.shortName || personName(lockedCourse)) : (selectedCard?.studentGroupName || '已绑定课程')}</span></Form.Item>
                ) : (
                  <>
                    {coachChoices.length > 0 && !coachMemberId && !courseOptions.some((item) => !String(item.value).startsWith('service:')) ? <p className="schedule-meta">请先选择老师</p> : null}
                    <Form.Item name="courseType" label="课程或服务"><Select options={courseOptions} /></Form.Item>
                  </>
                )}
              </>
            )}
            {(payType === 'new' || payType === 'renew') && (storedValue || serviceOnlyPay) ? <PaymentStoredPricing groups={props.groups} services={props.services} card={selectedCard} pricing={storedValue} /> : null}
          </>
        ) : null}
        {activateOptions.length ? (
          <>
            <Form.Item name="activateHours" label="激活已过期或快到期课时" extra="含剩余不足5课时" valuePropName="checked"><Switch /></Form.Item>
            {activateOn ? (
              <Form.Item name="activateSourceRecordIds" label="选择要激活的课时">
                <ActivateHourPicker records={activateOptions} />
              </Form.Item>
            ) : null}
          </>
        ) : null}
        {payType === 'adjustment' ? null : (
          <Form.Item name="paymentMethod" label="支付方式">
            <ChoiceTabs options={[
              { value: 1, label: '支付宝' },
              { value: 2, label: '微信' },
              { value: 3, label: '银行卡', icon: 'icon-bankcard' },
              { value: 4, label: '公户', icon: 'icon-bank' },
              { value: 5, label: '现金', icon: 'icon-cash' },
            ]} />
          </Form.Item>
        )}
        {showAmount ? (
          <Form.Item name="amount" label={amountAdjust && reason === 'transfer' ? '转让金额' : '金额'} rules={[{ required: true, message: '请填写金额' }]} validateStatus={amountOverHint ? 'error' : undefined} help={amountOverHint || undefined} getValueFromEvent={clampPaymentDecimal}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        ) : null}
        {amountAdjust ? <button type="button" className="stat-link" onClick={() => form.setFieldValue('amount', amountAvailable)}>{reason === 'transfer' ? '可转余额' : '可扣余额'}<strong>{money(amountAvailable)}</strong> 点击回填</button> : null}
        {payType === 'refund' && refundBalance ? (
          <div className="profit-day-card">
            <div className="stat-line">
              <span>可退基数<strong>{money(refundBalance.refundBaseAmount ?? refundBalance.remainingAmount)}</strong></span>
              <button type="button" className="stat-link" onClick={() => { if (refundLimit != null) form.setFieldValue('amount', refundLimit) }}>最多可退<strong>{money(refundLimit)}</strong> 点击回填</button>
            </div>
            {refundBalance.refundFeeEnabled ? (
              <Form.Item name="refundFeePercent" label="手续费（%）" extra="最高 30%" getValueFromEvent={(value) => value == null ? value : clampRefundFeePercent(value)}>
                <InputNumber style={{ width: '100%' }} min={0} max={30} step={0.01} />
              </Form.Item>
            ) : null}
            {refundBalance.refundCalcMethodLabel ? <p>{refundBalance.refundCalcMethodLabel}</p> : null}
            {refundFormulaTerms(refundBalance, refundFeePercent, refundLimit ?? 0).length ? (
              <p>{refundFormulaTerms(refundBalance, refundFeePercent, refundLimit ?? 0).map((term) => [term.operator, term.value, term.label].filter(Boolean).join(' ')).join(' ')}</p>
            ) : null}
            {refundBalance.refundCalcNote ? <p>{refundBalance.refundCalcNote}</p> : null}
          </div>
        ) : null}
        {payType === 'supplement' && (storedValue || periodCard) ? <p>{periodCard ? '补缴增加收款金额，请选择支付方式。' : '补缴会增加储值余额，请选择支付方式。'}</p> : null}
        {showPurchaseHours ? (
          <>
            <Form.Item name="hours" label="正式课时" rules={[{ required: payType !== 'supplement', message: '请填写正式课时' }]} getValueFromEvent={clampPaymentDecimal}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="giftHours" label="赠课课时" getValueFromEvent={clampPaymentDecimal}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </>
        ) : null}
        {showRefundHours ? (
          <>
            <LimitedHours name="hours" label="退费正课" max={regularAvailable} warning={hoursOverLimitMessage('refund', 'regular', regularAvailable)} />
            <LimitedHours name="giftHours" label="退费赠课" max={giftAvailable} warning={hoursOverLimitMessage('refund', 'gift', giftAvailable)} />
            <div className="stat-line">
              <button type="button" onClick={() => form.setFieldValue('hours', regularAvailable)}>最多可退正课<strong>{regularAvailable}</strong></button>
              <button type="button" onClick={() => form.setFieldValue('giftHours', giftAvailable)}>最多可退赠课<strong>{giftAvailable}</strong></button>
            </div>
          </>
        ) : null}
        {showAdjustHours ? (
          <>
            {hourFields.regular ? <LimitedHours name="hours" label={hourFields.regularLabel} max={regularAvailable} warning={hoursOverLimitMessage(reason === 'transfer' ? 'transfer' : 'deduct', 'regular', regularAvailable)} /> : null}
            {hourFields.gift ? (
              reason === 'activity_gift'
                ? <Form.Item name="giftHours" label={hourFields.giftLabel} getValueFromEvent={clampPaymentDecimal}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
                : <LimitedHours name="giftHours" label={hourFields.giftLabel} max={giftAvailable} warning={hoursOverLimitMessage(reason === 'transfer' ? 'transfer' : 'deduct', 'gift', giftAvailable)} />
            ) : null}
            {hourFields.hint ? <p>{hourFields.hint}</p> : null}
            {reason !== 'activity_gift' ? (
              <div className="stat-line">
                {hourFields.regular ? <button type="button" onClick={() => form.setFieldValue('hours', regularAvailable)}>{reason === 'transfer' ? '可转正课' : '可扣正课'}<strong>{regularAvailable}</strong></button> : null}
                {hourFields.gift ? <button type="button" onClick={() => form.setFieldValue('giftHours', giftAvailable)}>{reason === 'transfer' ? '可转赠课' : '可扣赠课'}<strong>{giftAvailable}</strong></button> : null}
              </div>
            ) : null}
          </>
        ) : null}
        {payType === 'adjustment' && !showAdjustHours && hourFields.hint ? <p>{hourFields.hint}</p> : null}
        <Form.Item name="paymentDate" label={paymentDateLabel(String(payType || 'new'), String(reason || ''), String(selectedCard?.cardCategory || ''))}>
          <BusinessDatePicker minDate={dateFloor || undefined} maxDate={dateCeil || undefined} />
        </Form.Item>
        {periodRefundValidity ? (
          <>
            <p>未退满时请确认这张时段卡还要保留的有效期，保存后会更新到原缴费记录。</p>
            <ValidityStartDate />
            <ValidityEndDate />
          </>
        ) : null}
        {showValidityControls && !periodCard ? (
          <div className="work-toolbar">
            <span>有效期设置</span>
            <Button htmlType="button" type={validityMode === 'timed' ? 'primary' : 'default'} onClick={() => setValidityMode('timed')}>{storedValue ? '限时消费' : '限时销课'}</Button>
            <Button htmlType="button" type={validityMode === 'deadline' ? 'primary' : 'default'} onClick={() => {
              setValidityMode('deadline')
              const end = String(form.getFieldValue('validEndDate') || '')
              if (!form.getFieldValue('consumeDeadline') && end) form.setFieldValue('consumeDeadline', end)
            }}>有效期</Button>
          </div>
        ) : null}
        {supplementLocked ? <p>主缴费不限期，补缴不能再指定有效期。</p> : null}
        {payType === 'supplement' && !supplementLocked ? <p>沿用原有效期，可直接修改。</p> : null}
        {showTimedRange ? (
          <>
            <ValidityStartDate />
            <ValidityEndDate />
          </>
        ) : null}
        {showDeadline ? <Form.Item name="consumeDeadline" label="有效期至"><BusinessDatePicker /></Form.Item> : null}
        {payType === 'adjustment' ? (
          <Form.Item name="adjustmentReason" label="调整方式" rules={[{ required: true, message: '请选择调整方式' }]}>
            <Select options={adjustmentReasonOptions(cardCategory, String(record?.adjustmentReason || reason || ''), { ready: hoursReady, regular: regularAvailable, gift: giftAvailable })} />
          </Form.Item>
        ) : null}
        {periodTransfer ? (
          <Form.Item name="amount" label="可转金额" extra="按转让日期剩余天数折算，不可修改">
            <InputNumber style={{ width: '100%' }} disabled precision={2} />
          </Form.Item>
        ) : null}
        {reason === 'transfer' ? (
          <Form.Item name="transferTargetStudentId" label={transferTargetLabel(String(selectedCard?.cardCategory || ''))} rules={[{ required: true, message: `请选择${transferTargetLabel(String(selectedCard?.cardCategory || ''))}` }]}>
            <TransferTargetSelect
              studentId={props.student.id}
              courseType={serviceOnlyPay ? '' : String(courseTypeValue || (lockedCourseId > 0 ? lockedCourseId : ''))}
              label={transferTargetLabel(String(selectedCard?.cardCategory || ''))}
              fallbackName={String(record?.transferTargetStudentName || '')}
            />
          </Form.Item>
        ) : null}
        {storedValue && showCourse && payType !== 'new' && payType !== 'renew' ? (
          <Form.List name="storedValueRights">
            {(fields, { add, remove }) => (
              <div>
                <div className="work-toolbar">
                  <span>储值权益</span>
                  <Button onClick={() => add({ discount: 100 })}>添加课程权益</Button>
                </div>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginTop: 8 }}>
                    <Form.Item name={[field.name, 'courseType']} rules={[{ required: true, message: '请选择课程' }]}>
                      <Select style={{ width: 180 }} placeholder="课程或服务" options={courseOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'discount']}><InputNumber min={0} max={100} placeholder="折扣%" /></Form.Item>
                    <Form.Item name={[field.name, 'unitPrice']}><InputNumber min={0} placeholder="单价" /></Form.Item>
                    <Button type="link" onClick={() => remove(field.name)}>移除</Button>
                  </Space>
                ))}
              </div>
            )}
          </Form.List>
        ) : null}
        {payType === 'new' || payType === 'renew' || payType === 'supplement' ? (
          <Form.Item name="commissionEnabled" label="设置提成" extra="选填" valuePropName="checked"><Switch /></Form.Item>
        ) : null}
        {(payType === 'new' || payType === 'renew' || payType === 'supplement') && commissionOn ? (
          <Form.Item name="commissionAllocations" noStyle><CommissionPeople coaches={props.coaches} /></Form.Item>
        ) : null}
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
        <Button type="primary" htmlType="submit" disabled={!!paymentBlocked || savingPayment}>{savingPayment ? '保存中...' : '保存记录'}</Button>
      </Form>
    </Modal>
  )
}
