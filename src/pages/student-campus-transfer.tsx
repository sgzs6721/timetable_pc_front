import { Button, Checkbox, Input, InputNumber, Modal, Select, Space, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { money, tell, todayIso } from './kit'
import type { Student, Card, Named, PayRecord } from './students-model'
import { serviceOriginalPrice, sliceDecimal, syncTransferDiscount, syncTransferPrice } from './student-card-desk'
import { cardCategoryText, personName } from './students-domain'

export function CampusTransfer(props: { student: Student; campuses: Named[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [targetCampusId, setTargetCampusId] = useState<number>()
  const [transferDate, setTransferDate] = useState(todayIso())
  const [remark, setRemark] = useState('')
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [groups, setGroups] = useState<TransferOption[]>([])
  const [coaches, setCoaches] = useState<Named[]>([])
  const [services, setServices] = useState<TransferOption[]>([])
  const [targetStatus, setTargetStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [drafts, setDrafts] = useState<Record<number, TransferDraft>>({})
  const [saving, setSaving] = useState(false)
  const cards = (props.student.cards || []).filter((card) => card.id && (card.status == null || card.status === 1))
  useEffect(() => {
    if (!open) return
    const campusOptions = props.campuses.filter((item) => item.id && item.id !== props.student.campusId)
    setTargetCampusId(campusOptions[0]?.id)
    setTransferDate(todayIso())
    setRemark('')
    setGroups([])
    setCoaches([])
    setServices([])
    setTargetStatus('idle')
    let picked = false
    const next: Record<number, TransferDraft> = {}
    cards.forEach((card) => {
      const disabled = !periodTransferable(card, [])
      const selected = !disabled && !picked
      if (selected) picked = true
      next[card.id!] = { selected, hours: Number(card.remainingHours || 0), coachIds: [], serviceIds: [], discount: {}, price: {} }
    })
    setDrafts(next)
    getJson<PayRecord[]>(`/payment-records/student/${props.student.id}`).then((rows) => {
      setPayments(rows || [])
      setDrafts((current) => {
        const refreshed = { ...current }
        let chosen = false
        cards.forEach((card) => {
          const disabled = !periodTransferable(card, rows || [])
          const existing = refreshed[card.id!]
          refreshed[card.id!] = { ...(existing || { hours: Number(card.remainingHours || 0), coachIds: [], serviceIds: [], discount: {}, price: {} }), selected: !disabled && !chosen }
          if (!disabled && !chosen) chosen = true
        })
        return refreshed
      })
    }).catch(() => setPayments([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.student.id])
  useEffect(() => {
    if (!open || !targetCampusId) return
    let cancelled = false
    setGroups([])
    setCoaches([])
    setServices([])
    setTargetStatus('loading')
    Promise.all([
      getJson<TransferOption[]>('/student-groups/list', { campusId: targetCampusId }),
      getJson<Named[]>(`/campus-teacher/campus/${targetCampusId}`),
      getJson<TransferOption[]>(`/campus-services/${targetCampusId}/items`),
    ]).then(([groupRows, coachRows, serviceRows]) => {
      if (cancelled) return
      setGroups(groupRows || [])
      setCoaches(coachRows || [])
      setServices((serviceRows || []).filter((item) => item.enabled !== 0 && item.enabled !== false))
      setTargetStatus('ready')
    }).catch(() => {
      if (cancelled) return
      setGroups([])
      setCoaches([])
      setServices([])
      setTargetStatus('failed')
      message.warning('加载校区失败')
    })
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, { ...draft, courseId: undefined, coachIds: [], serviceIds: [], discount: {}, price: {} }])))
    return () => { cancelled = true }
  }, [open, targetCampusId])
  useEffect(() => {
    if (!open || (!groups.length && !services.length)) return
    setDrafts((current) => {
      let changed = false
      const next = { ...current }
      cards.forEach((card) => {
        const draft = next[card.id!]
        if (!draft) return
        const fillCourse = groups.length === 1 && needsTransferCourse(card) && !draft.courseId
        const fillService = services.length === 1 && needsTransferService(card) && draft.serviceIds.length === 0
        if (!fillCourse && !fillService) return
        changed = true
        const group = groups[0]
        const coachIds = (group?.coachIds?.length ? group.coachIds : group?.coachId ? [group.coachId] : []).filter((id) => coaches.some((item) => item.id === id))
        next[card.id!] = {
          ...draft,
          courseId: fillCourse ? group?.id : draft.courseId,
          coachIds: fillCourse ? coachIds : draft.coachIds,
          serviceIds: fillService ? [services[0].id] : draft.serviceIds,
        }
      })
      return changed ? next : current
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups, services, coaches])
  function patch(cardId: number, patchValue: Partial<TransferDraft>) {
    setDrafts((current) => ({ ...current, [cardId]: { ...current[cardId], ...patchValue } }))
  }
  async function submit() {
    if (props.student.status === 2) {
      message.warning('结业学员不能转校区')
      return
    }
    if (!targetCampusId) {
      message.warning('请选择目标校区')
      return
    }
    const chosen = cards.filter((card) => drafts[card.id!]?.selected && periodTransferable(card, payments))
    if (cards.length && !chosen.length) {
      message.warning('请选择要转移的卡片')
      return
    }
    const cardTransfers: Array<Record<string, unknown>> = []
    for (const card of chosen) {
      const draft = drafts[card.id!]
      const category = String(card.cardCategory || '').toUpperCase()
      const hours = category === 'HOURS' ? Number(draft.hours || 0) : undefined
      const maxHours = Number(card.remainingHours || 0)
      if (hours != null && (hours < 0 || hours > maxHours + 0.000001)) {
        message.warning('转移课时不能超过当前卡剩余课时')
        return
      }
      const suggested = suggestedTransferAmount(card, payments, hours)
      const amount = !draft.amountEdited
        ? (category === 'STORED_VALUE' ? 0 : suggested)
        : draft.amount == null
          ? (category === 'PERIOD' ? suggested : 0)
          : Number(draft.amount)
      if (amount < 0 || amount > 999999.99) {
        message.warning('金额不能超过999999.99')
        return
      }
      if (category === 'STORED_VALUE' && amount > Number(card.remainingAmount || 0) + 0.000001) {
        message.warning('转移金额不能超过当前储值卡余额')
        return
      }
      if (category !== 'STORED_VALUE' && draft.amount != null && amount > suggested + 0.000001) {
        message.warning(category === 'PERIOD' ? '转移金额不能超过当前时段卡缴费金额' : '转移金额不能超过当前课时对应的可转金额')
        return
      }
      const moving = category === 'HOURS' ? (hours || 0) > 0 || amount > 0 : category === 'STORED_VALUE' ? amount > 0 : true
      const course = needsTransferCourse(card)
      const service = needsTransferService(card)
      if (moving && course && !draft.courseId) {
        message.warning('请选择目标校区对应课程')
        return
      }
      if (moving && course && !draft.coachIds.length) {
        message.warning('请选择目标校区负责老师')
        return
      }
      if (moving && service && !draft.serviceIds.length) {
        message.warning('请选择目标校区适用服务')
        return
      }
      const rights = category === 'STORED_VALUE' && service
        ? draft.serviceIds.map((id) => ({
          courseType: `service:${id}`,
          courseTypeLabel: personName(services.find((item) => item.id === id)),
          discount: Number(draft.discount[id] || 0) > 0 ? Number(draft.discount[id]) : undefined,
          unitPrice: Number(draft.price[id] || 0) > 0 ? Number(draft.price[id]) : undefined,
        }))
        : undefined
      if (moving && rights?.some((item) => !item.discount && !item.unitPrice)) {
        message.warning('请为每个已选服务设置折扣或折后单价')
        return
      }
      cardTransfers.push({
        studentCardId: card.id,
        hours,
        amount,
        targetCourseType: moving && course ? String(draft.courseId) : undefined,
        targetStudentGroupId: moving && course ? draft.courseId : undefined,
        targetCoachMemberIds: moving && course ? draft.coachIds : undefined,
        targetServiceItemIds: moving && service ? draft.serviceIds : undefined,
        targetServiceRights: rights,
      })
    }
    setSaving(true)
    try {
      await postJson(`/students/${props.student.id}/transfer-campus`, {
        targetCampusId,
        transferDate,
        remark,
        cardTransfers: cardTransfers.length ? cardTransfers : undefined,
      })
      message.success('已转校区')
      setOpen(false)
      await props.onDone()
    } catch (error) {
      message.error(tell(error, '转校区失败'))
    } finally {
      setSaving(false)
    }
  }
  function openTransfer() {
    if (Number(props.student.status || 0) === 2) return
    const options = props.campuses.filter((item) => item.id && item.id !== props.student.campusId)
    if (!options.length) {
      message.warning('没有校区可以转入学员')
      return
    }
    setOpen(true)
  }
  return (
    <>
      <Button disabled={Number(props.student.status || 0) === 2} onClick={openTransfer}>转校区</Button>
      <Modal title="转校区" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden width={760}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="目标校区"
            style={{ width: '100%' }}
            value={targetCampusId}
            onChange={setTargetCampusId}
            options={props.campuses.filter((item) => item.id !== props.student.campusId).map((item) => ({ value: item.id, label: personName(item) }))}
          />
          <Input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} />
          <Input placeholder="备注" value={remark} onChange={(event) => setRemark(event.target.value)} />
          {cards.length ? <Tabs onChange={(key) => {
            const id = Number(key)
            setDrafts((current) => {
              const next = { ...current }
              cards.forEach((item) => {
                const row = next[item.id!]
                if (!row) return
                next[item.id!] = { ...row, selected: item.id === id && periodTransferable(item, payments) }
              })
              return next
            })
          }} items={cards.map((card) => {
            const draft = drafts[card.id!]
            if (!draft) return { key: String(card.id), label: cardCategoryText(card.cardCategory), children: null }
            const category = String(card.cardCategory || '').toUpperCase()
            const disabled = !periodTransferable(card, payments)
            const moving = category === 'HOURS' ? Number(draft.hours || 0) > 0 || Number(draft.amount || 0) > 0 : category === 'STORED_VALUE' ? Number(draft.amount || 0) > 0 : true
            const suggested = suggestedTransferAmount(card, payments, category === 'HOURS' ? Number(draft.hours || 0) : undefined)
            return {
              key: String(card.id),
              label: card.cardName || card.studentGroupName || cardCategoryText(card.cardCategory),
              children: (
              <div className="panel-block">
                <Checkbox disabled={disabled} checked={draft.selected && !disabled} onChange={(event) => {
                  if (!event.target.checked) {
                    patch(card.id!, { selected: false })
                    return
                  }
                  setDrafts((current) => {
                    const next = { ...current }
                    cards.forEach((item) => {
                      const row = next[item.id!]
                      if (!row) return
                      next[item.id!] = { ...row, selected: item.id === card.id && periodTransferable(item, payments) }
                    })
                    return next
                  })
                }}>
                  转入这张卡
                </Checkbox>
                <div>{disabled ? '当前没有可转移的有效期' : category === 'HOURS' ? `当前可转 ${card.remainingHours || 0} 课时` : category === 'STORED_VALUE' ? `当前可转 ${money(card.remainingAmount)}` : '有效期原样转入目标校区'}</div>
                {!draft.selected && !disabled ? <p>本次不转移此卡。再次点击上方标签即可选中转移。</p> : null}
                {draft.selected && !disabled ? (
                  <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                    {category === 'HOURS' ? (
                      <InputNumber
                        min={0}
                        max={Number(card.remainingHours || 0)}
                        value={draft.hours}
                        addonBefore="课时"
                        onChange={(value) => {
                          const maxHours = Number(card.remainingHours || 0)
                          const hours = Math.min(maxHours, Math.max(0, Number(value || 0)))
                          const cap = suggestedTransferAmount(card, payments, hours)
                          patch(card.id!, {
                            hours,
                            amount: draft.amountEdited ? clampTransferAmount(draft.amount ?? null, cap) : draft.amount,
                          })
                        }}
                      />
                    ) : null}
                    <InputNumber
                      min={0}
                      value={draft.amount}
                      placeholder={suggested.toFixed(2)}
                      addonBefore="金额"
                      onChange={(value) => {
                        const cap = category === 'STORED_VALUE' ? Number(card.remainingAmount || 0) : suggested
                        patch(card.id!, { amount: clampTransferAmount(value == null ? null : Number(value), cap), amountEdited: true })
                      }}
                    />
                    {moving && needsTransferCourse(card) ? (
                      !targetCampusId ? <p>请先选择目标校区</p> : targetStatus === 'loading' ? <p>正在加载课程...</p> : targetStatus === 'failed' ? <p>加载校区失败</p> : !groups.length ? <p>目标校区暂无课程</p> : (
                      <>
                        <Select
                          placeholder="请选择目标校区课程"
                          style={{ width: '100%' }}
                          value={draft.courseId}
                          onChange={(value) => {
                            const group = groups.find((item) => item.id === value)
                            const rawIds = group?.coachIds?.length ? group.coachIds : group?.coachId ? [group.coachId] : []
                            const coachIds = Array.from(new Set(rawIds.map(Number).filter((id) => id > 0 && coaches.some((item) => item.id === id))))
                            patch(card.id!, { courseId: value, coachIds })
                          }}
                          options={groups.map((item) => ({ value: item.id, label: item.shortName || personName(item) }))}
                        />
                        {!draft.courseId ? <p>请先选择目标课程</p> : !coaches.length ? <p>目标校区暂无老师</p> : (
                          <Select mode="multiple" placeholder="目标老师，可多选" style={{ width: '100%' }} value={draft.coachIds} onChange={(value) => patch(card.id!, { coachIds: Array.from(new Set(value.map(Number))) })} options={Array.from(new Map(coaches.filter((item) => item.id).map((item) => [item.id, item])).values()).map((item) => ({ value: item.id, label: personName(item) }))} />
                        )}
                      </>
                      )
                    ) : null}
                    {moving && needsTransferService(card) ? (
                      !targetCampusId ? <p>请先选择目标校区</p> : targetStatus === 'loading' ? <p>正在加载服务...</p> : targetStatus === 'failed' ? <p>加载校区失败</p> : !services.length ? <p>目标校区暂无可选服务</p> : (
                      <>
                        <Select mode="multiple" placeholder="目标校区服务" style={{ width: '100%' }} value={draft.serviceIds} onChange={(value) => patch(card.id!, { serviceIds: value })} options={services.map((item) => ({ value: item.id, label: personName(item) }))} />
                        {category === 'STORED_VALUE' ? draft.serviceIds.map((id) => {
                          const service = services.find((item) => item.id === id)
                          const original = serviceOriginalPrice(service)
                          return (
                            <Space key={id} wrap>
                              <span>{personName(service)}{original > 0 ? ` · 原价 ¥${money(original)}` : ''}</span>
                              <InputNumber
                                min={0}
                                placeholder="折扣%"
                                value={draft.discount[id]}
                                onChange={(value) => {
                                  const next = syncTransferDiscount(original, value == null ? null : Number(value))
                                  const discount = { ...draft.discount }
                                  const price = { ...draft.price }
                                  if (next.discount == null) delete discount[id]
                                  else discount[id] = next.discount
                                  if (next.price == null) delete price[id]
                                  else price[id] = next.price
                                  patch(card.id!, { discount, price })
                                }}
                              />
                              <InputNumber
                                min={0}
                                placeholder="折后单价"
                                value={draft.price[id]}
                                onChange={(value) => {
                                  const next = syncTransferPrice(original, value == null ? null : Number(value))
                                  const discount = { ...draft.discount }
                                  const price = { ...draft.price }
                                  if (next.discount == null) delete discount[id]
                                  else discount[id] = next.discount
                                  if (next.price == null) delete price[id]
                                  else price[id] = next.price
                                  patch(card.id!, { discount, price })
                                }}
                              />
                            </Space>
                          )
                        }) : null}
                      </>
                      )
                    ) : null}
                  </Space>
                ) : null}
              </div>
              ),
            }
          })} /> : <p>这名学员还没有课时卡，将按原有余额转入目标校区。</p>}
          <Button type="primary" loading={saving} onClick={() => submit()}>确认转校区</Button>
        </Space>
      </Modal>
    </>
  )
}

export interface TransferOption extends Named {
  coachIds?: number[]
  coachId?: number
  enabled?: number | boolean
}

export interface TransferDraft {
  selected: boolean
  hours: number
  amount?: number
  amountEdited?: boolean
  courseId?: number
  coachIds: number[]
  serviceIds: number[]
  discount: Record<number, number>
  price: Record<number, number>
}

export function clampTransferAmount(value: number | null, max: number): number | undefined {
  if (value == null || !Number.isFinite(Number(value))) return undefined
  const numeric = sliceDecimal(Math.max(0, Number(value)))
  const cap = Math.max(0, Number(max) || 0)
  if (numeric > cap + 0.000001) return Number(cap.toFixed(2))
  return numeric
}

export function needsTransferCourse(card: Card): boolean {
  const category = String(card.cardCategory || '').toUpperCase()
  if (category === 'HOURS') return true
  return category === 'PERIOD' || category === 'STORED_VALUE' ? card.courseCategory !== false : false
}

export function needsTransferService(card: Card): boolean {
  const category = String(card.cardCategory || '').toUpperCase()
  if (category !== 'PERIOD' && category !== 'STORED_VALUE') return false
  if (card.courseCategory === false) return true
  return (card.serviceItemIds || []).length > 0
}

export function periodTransferable(card: Card, payments: PayRecord[]): boolean {
  if (String(card.cardCategory || '').toUpperCase() !== 'PERIOD') return true
  const today = todayIso()
  return payments.some((record) => (
    (!record.studentCardId || record.studentCardId === card.id)
    && (record.type === 'new' || record.type === 'renew' || (record.type === 'adjustment' && record.adjustmentReason === 'transfer'))
    && !!record.validEndDate
    && record.validEndDate >= today
  )) || (!payments.length && !!card.validEndDate && card.validEndDate >= today)
}

export function suggestedTransferAmount(card: Card, payments: PayRecord[], hours?: number): number {
  const category = String(card.cardCategory || '').toUpperCase()
  const scoped = payments.filter((record) => !record.studentCardId || record.studentCardId === card.id)
  const funding = scoped.filter((record) => record.type === 'new' || record.type === 'renew' || (record.type === 'adjustment' && record.adjustmentReason === 'transfer'))
  if (category === 'STORED_VALUE') return Number(card.remainingAmount || 0)
  if (category === 'PERIOD') {
    const today = todayIso()
    const record = [...funding].reverse().find((item) => item.validEndDate && item.validEndDate >= today)
    return Number(record?.amount || 0)
  }
  const paidAmount = funding.reduce((total, record) => total + Math.max(0, Number(record.amount || 0)), 0)
  const paidHours = funding.reduce((total, record) => total + Math.max(0, Number(record.hours || 0)) + Math.max(0, Number(record.giftHours || 0)), 0)
  const maxHours = Number(card.remainingHours || 0)
  const full = paidHours > 0 ? (paidAmount / paidHours) * maxHours : 0
  if (hours == null || maxHours <= 0) return Number(full.toFixed(2))
  return Number(((full * hours) / maxHours).toFixed(2))
}
