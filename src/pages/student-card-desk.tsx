import { Button, Form, Input, Modal, Popconfirm, Select, Switch, Tabs, message } from 'antd'
import { useContext, useRef, useState } from 'react'
import { postJson, putJson } from '../api/biz'
import { money, tell } from './kit'
import type { Student, Card, Named } from './students-model'
import { CardSaveButton, StoredRights, cardDraftError, cardEditBaseline, cardEditKey, rightFields, serviceRightPayload } from './student-profile'
import type { CardFormValues } from './student-profile'
import { CatalogHold, CatalogLoadContext, ChoiceTabs, cardCategoryText, personName } from './students-domain'

export function CardDesk(props: { student: Student; coaches: Named[]; services: Named[]; groups: Named[]; onChanged: () => Promise<void> }) {
  const cards = props.student.cards || []
  const [editing, setEditing] = useState<Card | null>(null)
  const [creating, setCreating] = useState(false)
  return (
    <section className="student-detail-panel student-card-desk">
      <header className="student-detail-section-head">
        <div><h3>卡片管理</h3><p>{cards.length ? `共 ${cards.length} 张卡片，课程权益相互独立` : '为学员配置课程或服务权益'}</p></div>
        <Button type="primary" ghost onClick={() => setCreating(true)}>新增卡类型</Button>
      </header>
      {cards.length ? <div className="student-card-desk-list">
        {cards.map((card) => {
          const category = cardCategoryText(card.cardCategory)
          const typeLabel = category === '时段卡'
            ? ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' }[String(card.periodType || '').toUpperCase()] || category)
            : category
          const active = card.status === 1 || card.status == null
          const balanceText = category === '储值卡'
            ? `余额 ¥${money(card.remainingAmount)} / ¥${money(card.totalAmount)}`
            : category === '时段卡'
              ? (card.validEndDate ? `有效期至 ${card.validEndDate}` : '待缴费后生成有效期')
              : `剩余 ${card.remainingHours ?? 0} / ${card.totalHours ?? 0} 课时`
          const relation = [card.studentGroupName, (card.coachMemberNames || []).join('、')].filter(Boolean).join(' · ')
          return (
            <div className={`student-card-desk-row${active ? '' : ' is-closed'}`} key={card.id || `${category}-${card.cardName}`}>
              <span className={`student-card-desk-icon is-${String(card.cardCategory || 'hours').toLowerCase()}`}>{typeLabel.slice(0, 1)}</span>
              <div className="student-card-desk-info">
                <div><strong>{card.cardName || card.studentGroupName || typeLabel}</strong><span>{typeLabel}</span>{active ? null : <em>已关闭</em>}</div>
                <p>{balanceText}{relation ? ` · ${relation}` : ''}</p>
                {card.canClose === false && active ? <small>{card.closeBlockedReason || '当前权益未结清，暂不能关闭'}</small> : null}
              </div>
              {active ? <div className="student-card-desk-actions">
                <Button size="small" onClick={() => setEditing(card)}>编辑</Button>
                {card.canClose === false ? null : (
                  <Popconfirm title="结清并关闭这张卡？" description="关闭后不能继续缴费或打卡，历史记录仍会保留。" onConfirm={async () => {
                    try {
                      await postJson(`/student-cards/${card.id}/close`, {})
                      message.success('卡已关闭')
                      await props.onChanged()
                    } catch (error) {
                      message.error(tell(error, '关闭失败'))
                    }
                  }}>
                    <Button size="small">关闭</Button>
                  </Popconfirm>
                )}
              </div> : null}
            </div>
          )
        })}
      </div> : <div className="student-card-desk-empty"><strong>尚未配置卡片</strong><p>新增卡类型后，可继续记录缴费和打卡。</p></div>}
      <Modal title="新增卡类型" open={creating} onCancel={() => setCreating(false)} footer={null} destroyOnHidden width={680}>
        <CardCreate
          student={props.student}
          coaches={props.coaches}
          services={props.services}
          groups={props.groups}
          onChanged={async () => {
            setCreating(false)
            await props.onChanged()
          }}
        />
      </Modal>
      <Modal title="编辑课时卡" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{
              cardName: editing.cardName,
              periodType: editing.periodType,
              studentGroupId: editing.studentGroupId,
              coachMemberIds: editing.coachMemberIds,
              serviceItemIds: editing.serviceItemIds,
              courseCategory: editing.courseCategory !== false,
              ...rightFields(editing.serviceRights),
            }}
            onFinish={async (values: CardFormValues) => {
              const category = String(editing.cardCategory || '').toUpperCase()
              if (cardEditKey(values, category) === cardEditBaseline(editing)) return
              const course = category === 'HOURS' || values.courseCategory !== false
              if (category === 'PERIOD' && editing.periodTypeEditable === false && values.periodType !== editing.periodType) {
                message.warning('时段卡已有缴费记录，不能修改卡类型')
                return
              }
              const reason = cardDraftError({ ...values, cardCategory: category }, props.groups, props.services)
              if (reason) {
                message.warning(reason)
                return
              }
              const rights = category === 'STORED_VALUE' ? serviceRightPayload(values, props.services) : undefined
              await putJson(`/student-cards/${editing.id}`, {
                cardCategory: editing.cardCategory,
                cardName: values.cardName,
                periodType: category === 'PERIOD' ? values.periodType : undefined,
                courseCategory: category === 'HOURS' ? true : values.courseCategory,
                studentGroupId: course ? values.studentGroupId || 0 : 0,
                coachMemberIds: course ? values.coachMemberIds || [] : [],
                serviceItemIds: category === 'HOURS' ? [] : values.serviceItemIds || [],
                serviceRights: rights,
              })
              message.success('课时卡已更新')
              setEditing(null)
              await props.onChanged()
            }}
          >
            <Form.Item name="cardName" label="名称"><Input /></Form.Item>
            <CardEditBindingFields card={editing} coaches={props.coaches} services={props.services} groups={props.groups} />
            <CardSaveButton card={editing} groups={props.groups} services={props.services} />
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

function CardEditBindingFields(props: { card: Card; coaches: Named[]; services: Named[]; groups: Named[] }) {
  const category = String(props.card.cardCategory || '').toUpperCase()
  const courseFlag = Form.useWatch('courseCategory')
  const course = category === 'HOURS' || courseFlag !== false
  return (
    <>
      {category === 'PERIOD' ? <Form.Item name="periodType" label="时段"><PeriodTypeSelect locked={props.card.periodTypeEditable === false} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name="courseCategory" label="包含课程" valuePropName="checked"><Switch /></Form.Item> : null}
      {course ? <CourseField groups={props.groups} category={category} name="studentGroupId" coachField="coachMemberIds" courseFlag="courseCategory" originalId={props.card.studentGroupId} /> : null}
      {course ? <Form.Item name="coachMemberIds" label="选择老师"><CoachMultiSelect coaches={props.coaches} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name="serviceItemIds" label="适用服务（多选）"><ServiceMultiSelect services={props.services.filter((item) => (item.enabled !== 0 && item.enabled !== false) || (props.card.serviceItemIds || []).includes(item.id))} /></Form.Item> : null}
      {category === 'STORED_VALUE' ? <StoredRights services={props.services} /> : null}
    </>
  )
}

export function courseCoachIds(group?: Named): number[] {
  const ids = group?.coachIds?.length ? group.coachIds : (group?.coachId ? [group.coachId] : [])
  return Array.from(new Set(ids.map((id) => Number(id)).filter((id) => id > 0)))
}

export function courseCoachNames(group: Named | undefined, coaches: Named[]): string[] {
  return courseCoachIds(group).map((id, index) => {
    const named = String(group?.coachNames?.[index] || '').trim()
    if (named) return named
    const matched = coaches.find((item) => Number(item.id) === id)
    return matched ? personName(matched) : `老师${id}`
  })
}

export function lockedCheckInCoach(group: Named | undefined, coaches: Named[]): { id: number; name: string } | null {
  const ids = courseCoachIds(group)
  if (ids.length <= 1) return null
  return { id: ids[0], name: courseCoachNames(group, coaches).filter(Boolean).join('、') }
}

export function oneToOneCourse(group: Named): boolean {
  if (group.internal === true) return true
  return String(group.name || group.shortName || '').trim().endsWith('一对一课程')
}

export function preferredCourseForCoach(student: Student | null | undefined, groups: Named[], coachId: number): Named | undefined {
  if (!coachId) return undefined
  const ownIds = (student?.studentGroupIds?.length ? student.studentGroupIds : (student?.studentGroupId ? [student.studentGroupId] : []))
    .map((id) => Number(id))
    .filter((id) => id > 0)
  const allowed = new Set(ownIds)
  const valid = groups.filter((group) => Number(group.status) !== 0 && group.invalid !== true)
  const matched = valid.filter((group) => (allowed.size === 0 || allowed.has(Number(group.id))) && courseCoachIds(group).includes(coachId))
  if (matched.length) return matched[0]
  return valid.find((group) => oneToOneCourse(group) && courseCoachIds(group).includes(coachId))
}

export function paymentOptionForCourse<T extends { id: number; courseType?: string; courseLabel?: string; isSelectable?: boolean }>(options: T[], course?: Named): T | undefined {
  if (!course) return undefined
  const type = String(course.id)
  const name = String(course.name || course.shortName || '').trim()
  return options.find((item) => item.isSelectable !== false && String(item.courseType || '').trim() === type)
    || options.find((item) => item.isSelectable !== false && !!name && String(item.courseLabel || '').includes(name))
}

export function coachesAfterCourse(current: number[] = [], previous?: Named, next?: Named): number[] {
  const nextIds = courseCoachIds(next)
  const currentIds = Array.from(new Set(current.map((id) => Number(id)).filter((id) => id > 0)))
  if (!nextIds.length) return currentIds
  if (!currentIds.length) return nextIds
  const previousIds = new Set(courseCoachIds(previous))
  return Array.from(new Set([...nextIds, ...currentIds.filter((id) => !previousIds.has(id))]))
}

export function courseInactive(group: Named): boolean {
  return group.invalid === true || !!group.inactiveReason
}

export function courseInactiveText(reason?: string): string {
  if (reason === 'DELETED_TEACHER') return '已删除'
  if (reason === 'RESIGNED_TEACHER') return '已离职'
  return ''
}

export function courseUnitPriceConfigured(group?: Named): boolean {
  return Number(group?.unitPrice || 0) > 0
}

export function visibleCourses(groups: Named[], originalId?: number): Named[] {
  return groups
    .filter((group) => {
      if (!group.id || !String(group.name || group.shortName || '').trim()) return false
      return !courseInactive(group) || group.id === originalId
    })
    .sort((left, right) => {
      if (courseInactive(left) !== courseInactive(right)) return courseInactive(left) ? 1 : -1
      return String(left.name || left.shortName || '').localeCompare(String(right.name || right.shortName || ''), 'zh-CN')
    })
}

export function courseOptionLabel(group: Named): string {
  const name = group.shortName || group.name || '未命名课程'
  const coaches = (group.coachNames || []).filter(Boolean).join('、') || group.coachName || ''
  const meta = [coaches, courseInactiveText(group.inactiveReason), courseUnitPriceConfigured(group) ? `¥${money(group.unitPrice)}/小时` : ''].filter(Boolean).join(' | ')
  return meta ? `${name} · ${meta}` : name
}

export function serviceOriginalPrice(service?: Named): number {
  return Math.max(0, Number(service?.price ?? service?.unitPrice ?? 0))
}

export function sliceDecimal(value: number, digits = 2): number {
  const text = String(Math.abs(value))
  const [integer, decimal = ''] = text.split('.')
  const sliced = decimal ? Number(`${integer}.${decimal.slice(0, digits)}`) : Number(integer)
  return Number.isFinite(sliced) ? sliced : 0
}

export function syncTransferDiscount(original: number, value: number | null): { discount?: number; price?: number } {
  if (value == null || !Number.isFinite(Number(value))) return {}
  const discount = Math.min(100, sliceDecimal(Math.max(0, Number(value))))
  if (!(discount > 0)) return {}
  if (!(original > 0)) return { discount }
  return { discount, price: Number(((original * discount) / 100).toFixed(2)) }
}

export function syncTransferPrice(original: number, value: number | null): { discount?: number; price?: number } {
  if (value == null || !Number.isFinite(Number(value))) return {}
  const price = sliceDecimal(Math.max(0, Number(value)))
  if (!(price > 0)) return {}
  if (!(original > 0)) return { price }
  const discount = Math.min(100, Number(((price / original) * 100).toFixed(2)))
  return { price, discount: discount > 0 ? discount : undefined }
}

export function serviceOptionLabel(item: Named): string {
  const hours = Number(item.durationMinutes || 60) / 60
  const duration = Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)))
  const stopped = item.enabled === 0 || item.enabled === false ? '停用' : ''
  return [personName(item), `¥${money(serviceOriginalPrice(item))}/${duration}小时`, stopped].filter(Boolean).join(' · ')
}

export function CourseField(props: {
  groups: Named[]
  category: string
  name: string | Array<string | number>
  storeName?: string | Array<string | number>
  coachField: string | Array<string | number>
  courseFlag?: string | Array<string | number>
  originalId?: number
  variant?: 'select' | 'chips'
}) {
  const form = Form.useFormInstance()
  const catalog = useContext(CatalogLoadContext)
  const storeName = props.storeName || props.name
  const watchedFlag = Form.useWatch(props.courseFlag || storeName)
  const courseFlag = props.courseFlag ? watchedFlag : true
  const selected = Form.useWatch(storeName) as number | undefined
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const courseOn = props.category === 'HOURS' || courseFlag !== false
  const handleCourseChange = (next?: number) => {
    if (!next) return
    const course = props.groups.find((item) => item.id === next)
    if (props.category === 'STORED_VALUE' && !courseUnitPriceConfigured(course)) {
      form.setFieldValue(props.name, selectedRef.current ?? null)
      return
    }
    const previous = props.groups.find((item) => item.id === selectedRef.current)
    const current = (form.getFieldValue(props.coachField) || []) as number[]
    form.setFieldValue(props.coachField, coachesAfterCourse(current, previous, course))
  }
  if (!courseOn) return null
  return (
    <Form.Item
      name={props.name}
      label={props.variant === 'chips' ? '选择课程（单选）' : '课程'}
      normalize={(next, prev) => {
        const course = props.groups.find((item) => item.id === next)
        if (props.category === 'STORED_VALUE' && next && !courseUnitPriceConfigured(course)) {
          message.warning('请在课程管理中设置单价')
          return prev ?? null
        }
        return next
      }}
    >
      {catalog.groups === 'ready' && props.groups.length > 0 ? (
        props.variant === 'chips' ? (
          <CourseChipSelect groups={visibleCourses(props.groups, props.originalId || selected)} category={props.category} onPick={handleCourseChange} />
        ) : (
          <Select
            allowClear
            options={visibleCourses(props.groups, props.originalId || selected).map((item) => {
              const missingPrice = props.category === 'STORED_VALUE' && !courseUnitPriceConfigured(item)
              return { value: item.id, label: missingPrice ? `${courseOptionLabel(item)} · 未设置单价` : courseOptionLabel(item), disabled: missingPrice }
            })}
            onChange={handleCourseChange}
          />
        )
      ) : catalog.groups === 'failed' ? (
        <CatalogHold text="课程加载失败，点击重试" onRetry={catalog.retryGroups} />
      ) : catalog.groups === 'loading' ? (
        <CatalogHold text="正在加载课程..." />
      ) : (
        <CatalogHold text="当前校区暂无课程，请先在课程管理中配置" />
      )}
    </Form.Item>
  )
}

function CourseChipSelect(props: { value?: number; onChange?: (value: number) => void; onPick?: (value: number) => void; groups: Named[]; category: string }) {
  const [expanded, setExpanded] = useState(false)
  const selectedId = Number(props.value || 0)
  const selected = props.groups.find((item) => Number(item.id) === selectedId)
  const ordered = selected ? [selected, ...props.groups.filter((item) => Number(item.id) !== selectedId)] : props.groups
  const showMore = ordered.length > 4
  const visible = expanded ? ordered : ordered.slice(0, 4)
  return (
    <div className="student-choice-shell">
      <div className="student-choice-grid student-choice-grid--courses">
        {visible.map((item) => {
          const id = Number(item.id)
          const active = id === selectedId
          const disabled = props.category === 'STORED_VALUE' && !courseUnitPriceConfigured(item)
          const coaches = (item.coachNames || []).filter(Boolean).join('、') || item.coachName || ''
          const status = courseInactiveText(item.inactiveReason)
          const price = props.category !== 'HOURS' && courseUnitPriceConfigured(item) ? `¥${money(item.unitPrice)}/小时` : ''
          const meta = [coaches, status, disabled ? '未设置单价' : price].filter(Boolean).join(' · ')
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              className={`student-choice-chip${active ? ' is-selected' : ''}`}
              onClick={() => {
                props.onChange?.(id)
                props.onPick?.(id)
              }}
            >
              <span>{item.shortName || item.name || '未命名课程'}</span>
              {meta ? <small>{meta}</small> : null}
            </button>
          )
        })}
      </div>
      {showMore ? <button className="student-choice-more" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : `更多课程（${ordered.length}）`}</button> : null}
    </div>
  )
}

export function CardCreate(props: { student: Student; coaches: Named[]; services: Named[]; groups: Named[]; onChanged: () => Promise<void> }) {
  const [form] = Form.useForm<CardFormValues>()
  const category = String(Form.useWatch('cardCategory', form) || 'HOURS').toUpperCase()
  const courseOn = Form.useWatch('courseCategory', form)
  const course = category === 'HOURS' || courseOn !== false
  const services = props.services.filter((item) => item.enabled !== 0 && item.enabled !== false)
  const previousCategory = useRef('HOURS')
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ cardCategory: 'HOURS', periodType: 'MONTH', courseCategory: true }}
      onFinish={async (values) => {
        if (Number(props.student.status || 0) === 2) {
          message.warning('该学员已结业，不能新增卡类型')
          return
        }
        const nextCategory = String(values.cardCategory || '').trim().toUpperCase()
        if (!['HOURS', 'PERIOD', 'STORED_VALUE'].includes(nextCategory)) return
        const cardName = String(values.cardName || '').trim()
        if (cardName.length > 40) {
          message.warning('卡片名称不能超过40个字')
          return
        }
        const nextCourse = nextCategory === 'HOURS' || values.courseCategory !== false
        const coachIds = Array.from(new Set((values.coachMemberIds || []).map((id) => Number(id)).filter(Boolean)))
        const serviceIds = nextCategory === 'HOURS' ? [] : Array.from(new Set((values.serviceItemIds || []).map((id) => Number(id)).filter(Boolean)))
        const reason = cardDraftError({ ...values, cardCategory: nextCategory, coachMemberIds: coachIds, serviceItemIds: serviceIds }, props.groups, services, 1, 1, 'detail-create')
        if (reason) {
          message.warning(reason)
          return
        }
        const rights = nextCategory === 'STORED_VALUE' ? serviceRightPayload({ ...values, serviceItemIds: serviceIds }, services) : undefined
        const currentCoachIds = Array.from(new Set((props.student.coachMemberIds || []).map((id) => Number(id)).filter(Boolean)))
        try {
          const legacyCourseCards = (props.student.cards || []).filter((item) => (
            Number(item.id || 0) > 0
            && (item.cardCategory === 'HOURS' || item.courseCategory !== false)
            && !Array.isArray(item.coachMemberIds)
          ))
          await Promise.all(legacyCourseCards.map((item) => putJson(`/student-cards/${item.id}`, {
            cardCategory: item.cardCategory,
            periodType: item.periodType || undefined,
            courseCategory: item.courseCategory !== false,
            cardName: item.cardName || undefined,
            coachMemberIds: currentCoachIds,
          })))
          await postJson(`/students/${props.student.id}/cards`, {
            cardName: cardName || undefined,
            cardCategory: nextCategory,
            periodType: nextCategory === 'PERIOD' ? values.periodType : undefined,
            courseCategory: nextCourse,
            studentGroupId: nextCourse ? values.studentGroupId : undefined,
            coachMemberIds: nextCourse ? coachIds : [],
            serviceItemIds: serviceIds,
            serviceRights: rights,
          })
          const mergedCoachIds = Array.from(new Set([...currentCoachIds, ...coachIds]))
          const sameCoachSelection = currentCoachIds.length === mergedCoachIds.length && currentCoachIds.every((id) => mergedCoachIds.includes(id))
          if (nextCourse && !sameCoachSelection) {
            try {
              await putJson(`/students/${props.student.id}/coaches`, mergedCoachIds)
            } catch {
              message.warning('卡类型已创建，但老师分配失败，请重试')
              form.resetFields()
              await props.onChanged()
              return
            }
          }
          message.success('卡类型创建成功')
          form.resetFields()
          await props.onChanged()
        } catch (error) {
          message.error(tell(error, '创建卡类型失败'))
        }
      }}
    >
      <p className="schedule-meta">为 {props.student.name} 新建独立卡账户，已有卡和历史记录不会改变</p>
      <Form.Item name="cardName" label="名称"><Input maxLength={40} placeholder="可选，最多40个字" /></Form.Item>
      <Form.Item name="cardCategory" label="卡类型">
        <ChoiceTabs
          options={[{ value: 'HOURS', label: '课时卡' }, { value: 'PERIOD', label: '时段卡' }, { value: 'STORED_VALUE', label: '储值卡' }]}
          onPick={(value) => {
            const previous = previousCategory.current
            previousCategory.current = value
            if (value === 'HOURS') form.setFieldValue('courseCategory', true)
            else if (previous === 'HOURS') form.setFieldValue('courseCategory', false)
          }}
        />
      </Form.Item>
      {category === 'PERIOD' ? <Form.Item name="periodType" label="时段"><Select options={PERIOD_OPTIONS} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name="courseCategory" label="包含课程" valuePropName="checked"><Switch /></Form.Item> : null}
      {course ? <CourseField groups={props.groups} category={category} name="studentGroupId" coachField="coachMemberIds" courseFlag="courseCategory" /> : null}
      {course ? (
        <Form.Item name="coachMemberIds" label="选择老师">
          <CoachMultiSelect coaches={props.coaches} />
        </Form.Item>
      ) : null}
      {category !== 'HOURS' ? (
        <Form.Item name="serviceItemIds" label={course ? '适用服务（多选）' : '适用服务（多选） *'}>
          <ServiceMultiSelect services={services} />
        </Form.Item>
      ) : null}
      {category === 'STORED_VALUE' ? <StoredRights services={services} /> : null}
      <Button htmlType="submit">创建卡类型</Button>
    </Form>
  )
}

export function disabledServiceWarning(services: Array<{ id: number; enabled?: number | boolean }>, current: number[] = [], next: number[] = []): string {
  const previous = new Set(current.map((id) => Number(id)))
  const blocked = next.some((id) => {
    if (previous.has(Number(id))) return false
    const service = services.find((item) => item.id === Number(id))
    return !!service && (service.enabled === false || service.enabled === 0)
  })
  return blocked ? '该服务已停用' : ''
}

export function CoachMultiSelect(props: { value?: number[]; onChange?: (value: number[]) => void; coaches: Named[]; variant?: 'select' | 'chips' }) {
  const catalog = useContext(CatalogLoadContext)
  const choices = props.coaches.filter((item) => Number(item.status ?? 1) !== 0)
  if (catalog.coaches === 'loading') return <CatalogHold text="正在加载老师..." />
  if (catalog.coaches === 'failed') return <CatalogHold text="老师加载失败，点击重试" onRetry={catalog.retryCoaches} />
  if (!choices.length) return <CatalogHold text="当前校区暂无老师，请先配置校区老师" />
  if (props.variant === 'chips') {
    const selected = new Set((props.value || []).map(Number))
    return (
      <div className="student-choice-grid student-choice-grid--coaches">
        {choices.map((item) => {
          const id = Number(item.id)
          const active = selected.has(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              className={`student-choice-chip student-choice-chip--coach${active ? ' is-selected' : ''}`}
              onClick={() => props.onChange?.(active ? [...selected].filter((value) => value !== id) : [...selected, id])}
            >
              <span>{personName(item)}</span>
            </button>
          )
        })}
      </div>
    )
  }
  return <Select mode="multiple" value={props.value} onChange={props.onChange} options={choices.map((item) => ({ value: item.id, label: personName(item) }))} />
}

export function ServiceMultiSelect(props: { value?: number[]; onChange?: (value: number[]) => void; services: Named[] }) {
  const catalog = useContext(CatalogLoadContext)
  if (catalog.services === 'loading') return <CatalogHold text="正在加载服务..." />
  if (catalog.services === 'failed') return <CatalogHold text="服务加载失败，点击重试" onRetry={catalog.retryServices} />
  if (!props.services.length) return <CatalogHold text="当前校区暂无可选服务，请先在校区设置中配置" />
  return (
    <Select
      mode="multiple"
      value={props.value}
      options={props.services.map((item) => ({ value: item.id, label: serviceOptionLabel(item) }))}
      onChange={(next: number[]) => {
        const warning = disabledServiceWarning(props.services, props.value, next)
        if (warning) {
          message.warning(warning)
          return
        }
        props.onChange?.(next)
      }}
    />
  )
}

export function PeriodTypeSelect(props: { value?: string; onChange?: (value: string) => void; locked?: boolean }) {
  return (
    <Select
      value={props.value}
      options={PERIOD_OPTIONS}
      onChange={(next: string) => {
        if (props.locked && next !== props.value) {
          message.warning('时段卡已有缴费记录，不能修改卡类型')
          return
        }
        props.onChange?.(next)
      }}
    />
  )
}

export const PERIOD_OPTIONS = [
  { value: 'WEEK', label: '周' },
  { value: 'MONTH', label: '月' },
  { value: 'QUARTER', label: '季' },
  { value: 'HALF_YEAR', label: '半年' },
  { value: 'YEAR', label: '年' },
]

export function CardSummary({ cards }: { cards: Card[] }) {
  if (!cards.length) return <p>还没有课时卡。可在缴费时建立课时卡、时段卡或储值卡。</p>
  const panel = (card: Card) => (
    <p>
      正课 {card.regularHours ?? 0} · 赠课 {card.bonusHours ?? 0} · 剩余课时 {card.remainingHours ?? 0} · 余额 {money(card.remainingAmount)} / {money(card.totalAmount)}
      {card.validEndDate || card.consumeDeadline ? ` · 有效期至 ${card.validEndDate || card.consumeDeadline}` : ''}
    </p>
  )
  if (cards.length === 1) return panel(cards[0])
  return (
    <Tabs items={cards.map((card) => ({
      key: String(card.id || card.cardName),
      label: card.cardName || card.studentGroupName || cardCategoryText(card.cardCategory),
      children: panel(card),
    }))} />
  )
}
