import { Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Switch, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { PhoneCopyButton, copyPlainText, money, tell } from './kit'
import type { Student, Card, ServiceRight, Named } from './students-model'
import { CoachMultiSelect, CourseField, PERIOD_OPTIONS, ServiceMultiSelect, courseUnitPriceConfigured, serviceOriginalPrice } from './student-card-desk'
import { ChoiceTabs, personName } from './students-domain'

export function AddStudent(props: { open: boolean; coaches: Named[]; groups: Named[]; services: Named[]; campusId: number | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal title="新增学员" open={props.open} onCancel={props.onClose} footer={null} destroyOnHidden width={720}>
      <Form
        layout="vertical"
        initialValues={{ cards: [{ cardCategory: 'HOURS', courseCategory: true }] }}
        onFinishFailed={(info) => {
          const text = info.errorFields?.[0]?.errors?.[0]
          if (text) message.warning(String(text))
        }}
        onFinish={async (values: { name: string; gender: number; phone?: string; birthDate?: string; remark?: string; cards: CardFormValues[] }) => {
          if (!props.campusId) {
            message.warning('请先选择校区')
            return
          }
          if (!String(values.name || '').trim()) {
            message.warning('请输入学员姓名')
            return
          }
          const cards = values.cards || []
          if (!cards.length) {
            message.warning('请选择至少一种卡类型')
            return
          }
          for (const card of cards) {
            const category = String(card.cardCategory || 'HOURS').toUpperCase()
            const same = cards.filter((item) => String(item.cardCategory || 'HOURS').toUpperCase() === category)
            const reason = cardDraftError(card, props.groups, props.services, same.indexOf(card) + 1, same.length)
            if (reason) {
              message.warning(reason)
              return
            }
          }
          const payloads = cards.map((card) => cardPayload(card, props.services))
          const coachIds = Array.from(new Set(payloads.flatMap((card) => card.coachMemberIds)))
          const groupIds = Array.from(new Set(payloads.map((card) => card.studentGroupId).filter((id): id is number => !!id)))
          try {
            await postJson<Student>('/students', {
              name: values.name.trim(),
              gender: values.gender,
              phone: String(values.phone || '').trim(),
              birthDate: values.birthDate || undefined,
              remark: values.remark,
              campusId: props.campusId,
              cardCategory: payloads[0].cardCategory,
              periodType: payloads[0].periodType,
              courseCategory: payloads[0].courseCategory,
              coachMemberIds: coachIds,
              studentGroupId: groupIds[0],
              studentGroupIds: groupIds,
              cards: payloads,
            })
            message.success('学员已添加')
            props.onSaved()
          } catch (error) {
            message.error(tell(error, '添加失败'))
          }
        }}
      >
        <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }, { max: 6, message: '学员姓名不能超过6个字' }]}><Input maxLength={6} /></Form.Item>
        <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}><Select options={[{ value: 1, label: '男' }, { value: 2, label: '女' }]} /></Form.Item>
        <Form.Item name="phone" label="电话" rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入11位正确手机号' }]}><Input maxLength={11} /></Form.Item>
        <Form.Item name="birthDate" label="出生日期" rules={[{ validator: validateBirthDate }]}><BusinessDatePicker maxDate={birthDateMax()} /></Form.Item>
        <Form.List name="cards">
          {(fields, { add, remove }) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <CardDraft key={field.key} fieldName={field.name} index={index} coaches={props.coaches} groups={props.groups} services={props.services} onRemove={fields.length > 1 ? () => remove(field.name) : undefined} />
              ))}
              <Button onClick={() => add({ cardCategory: 'HOURS', courseCategory: true })}>再加一张卡</Button>
            </Space>
          )}
        </Form.List>
        <Form.Item name="remark" label="备注"><Input.TextArea rows={2} maxLength={200} placeholder="请输入备注（选填）" /></Form.Item>
        <Button type="primary" htmlType="submit">保存</Button>
      </Form>
    </Modal>
  )
}

export interface CardFormValues {
  cardName?: string
  cardCategory?: string
  periodType?: string
  courseCategory?: boolean
  studentGroupId?: number
  coachMemberIds?: number[]
  serviceItemIds?: number[]
  rightDiscount?: Record<string, number>
  rightPrice?: Record<string, number>
}

export function CardDraft(props: { fieldName: number; index: number; coaches: Named[]; groups: Named[]; services: Named[]; onRemove?: () => void }) {
  const form = Form.useFormInstance()
  const categoryValue = Form.useWatch(['cards', props.fieldName, 'cardCategory'])
  const courseFlag = Form.useWatch(['cards', props.fieldName, 'courseCategory'])
  const drafts = Form.useWatch('cards') as Array<{ cardCategory?: string }> | undefined
  const category = String(categoryValue || 'HOURS').toUpperCase()
  const course = category === 'HOURS' || courseFlag !== false
  const label = category === 'PERIOD' ? '时段卡' : category === 'STORED_VALUE' ? '储值卡' : '课时卡'
  const sameCategory = (drafts || []).map((item) => String(item?.cardCategory || 'HOURS').toUpperCase())
  const typeCount = sameCategory.filter((item) => item === category).length
  const typeIndex = sameCategory.slice(0, props.index + 1).filter((item) => item === category).length
  const categoryRef = useRef(category)
  categoryRef.current = category
  return (
    <div className="panel-block">
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <strong>{typeCount > 1 ? `${label} ${typeIndex}` : label}</strong>
        {props.onRemove ? <Button size="small" onClick={props.onRemove}>移除</Button> : null}
      </Space>
      <Form.Item name={[props.fieldName, 'cardCategory']} label="卡类型" rules={[{ required: true, message: '请选择卡类型' }]}>
        <ChoiceTabs
          options={[{ value: 'HOURS', label: '课时卡' }, { value: 'PERIOD', label: '时段卡' }, { value: 'STORED_VALUE', label: '储值卡' }]}
          onPick={(value) => {
            const previous = categoryRef.current
            categoryRef.current = value
            if (value === 'HOURS') {
              form.setFieldValue(['cards', props.fieldName, 'courseCategory'], true)
              form.setFieldValue(['cards', props.fieldName, 'serviceItemIds'], [])
            } else if (previous === 'HOURS') {
              form.setFieldValue(['cards', props.fieldName, 'courseCategory'], false)
              form.setFieldValue(['cards', props.fieldName, 'studentGroupId'], undefined)
              form.setFieldValue(['cards', props.fieldName, 'coachMemberIds'], [])
            }
          }}
        />
      </Form.Item>
      {category === 'PERIOD' ? <Form.Item name={[props.fieldName, 'periodType']} label="时段" initialValue="MONTH"><Select options={PERIOD_OPTIONS} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name={[props.fieldName, 'courseCategory']} label="包含课程" valuePropName="checked" initialValue><Switch /></Form.Item> : null}
      {course ? <CourseField groups={props.groups} category={category} name={[props.fieldName, 'studentGroupId']} storeName={['cards', props.fieldName, 'studentGroupId']} coachField={['cards', props.fieldName, 'coachMemberIds']} courseFlag={['cards', props.fieldName, 'courseCategory']} /> : null}
      {course ? <Form.Item name={[props.fieldName, 'coachMemberIds']} label="选择老师"><CoachMultiSelect coaches={props.coaches} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name={[props.fieldName, 'serviceItemIds']} label={course ? '适用服务（多选）' : '适用服务（多选） *'}><ServiceMultiSelect services={props.services.filter((item) => item.enabled !== 0 && item.enabled !== false)} /></Form.Item> : null}
      {category === 'STORED_VALUE' ? <StoredRights services={props.services} listName={props.fieldName} /> : null}
    </div>
  )
}

export function StoredRights(props: { services: Named[]; listName?: number }) {
  const form = Form.useFormInstance()
  const watchName = props.listName == null ? 'serviceItemIds' : ['cards', props.listName, 'serviceItemIds']
  const selected = (Form.useWatch(watchName) || []) as number[]
  if (!selected.length) return null
  return (
    <Space direction="vertical">
      {selected.map((id) => {
        const service = props.services.find((item) => item.id === id)
        const original = serviceOriginalPrice(service)
        const discountName = props.listName == null ? ['rightDiscount', String(id)] : [props.listName, 'rightDiscount', String(id)]
        const priceName = props.listName == null ? ['rightPrice', String(id)] : [props.listName, 'rightPrice', String(id)]
        const discountPath = props.listName == null ? discountName : ['cards', props.listName, 'rightDiscount', String(id)]
        const pricePath = props.listName == null ? priceName : ['cards', props.listName, 'rightPrice', String(id)]
        return (
          <Space key={id} wrap>
            <span>{service ? personName(service) : `服务${id}`} · 原价 ¥{money(original)}</span>
            <Form.Item name={discountName} label="折扣%" style={{ marginBottom: 0 }}>
              <InputNumber min={0} max={100} onChange={(value) => form.setFieldValue(pricePath, value == null ? undefined : Number(((original * Number(value)) / 100).toFixed(2)))} />
            </Form.Item>
            <Form.Item name={priceName} label="折后单价" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                onChange={(value) => {
                  if (value == null) {
                    form.setFieldValue(discountPath, undefined)
                    return
                  }
                  if (original <= 0) {
                    form.setFieldValue(discountPath, undefined)
                    return
                  }
                  form.setFieldValue(discountPath, Math.min(100, Number(((Number(value) / original) * 100).toFixed(2))))
                }}
              />
            </Form.Item>
          </Space>
        )
      })}
    </Space>
  )
}

export function cardDraftLabel(category: string, course: boolean, typeIndex = 1, typeCount = 1): string {
  const base = category === 'HOURS'
    ? '课时卡'
    : category === 'PERIOD'
      ? (course ? '课程类时段卡' : '服务类时段卡')
      : (course ? '课程类储值卡' : '服务类储值卡')
  return typeCount > 1 ? `${base} ${typeIndex}` : base
}

export function coachIdsKey(ids?: number[]) {
  return (ids || []).map(Number).filter((id) => id > 0).sort((left, right) => left - right).join(',')
}

export function CoachSaveButton(props: { student: Student; card?: Card }) {
  const ids = Form.useWatch('coachMemberIds') as number[] | undefined
  const graduated = Number(props.student.status || 0) === 2
  const selected = coachIdsKey(ids)
  const original = coachIdsKey(props.card?.coachMemberIds?.length ? props.card.coachMemberIds : props.student.coachMemberIds)
  return <Button htmlType="submit" disabled={graduated || !selected || selected === original}>保存老师</Button>
}

export function cardEditKey(values: CardFormValues, category: string) {
  const normalized = category.toUpperCase()
  const course = normalized === 'HOURS' || values.courseCategory !== false
  const serviceIds = normalized === 'HOURS'
    ? []
    : (values.serviceItemIds || []).map(Number).filter((id) => id > 0).sort((left, right) => left - right)
  const rights = normalized === 'STORED_VALUE'
    ? serviceIds.map((id) => ({
      id,
      discount: Number(values.rightDiscount?.[id] ?? values.rightDiscount?.[String(id)] ?? 0),
      price: Number(values.rightPrice?.[id] ?? values.rightPrice?.[String(id)] ?? 0),
    }))
    : []
  return JSON.stringify({
    cardName: String(values.cardName || '').trim(),
    periodType: normalized === 'PERIOD' ? String(values.periodType || '') : '',
    course,
    studentGroupId: course ? Number(values.studentGroupId || 0) : 0,
    coachMemberIds: course ? (values.coachMemberIds || []).map(Number).filter((id) => id > 0).sort((left, right) => left - right) : [],
    serviceIds,
    rights,
  })
}

export function cardEditBaseline(card: Card) {
  return cardEditKey({
    cardName: card.cardName,
    periodType: card.periodType,
    courseCategory: card.courseCategory !== false,
    studentGroupId: card.studentGroupId,
    coachMemberIds: card.coachMemberIds,
    serviceItemIds: card.serviceItemIds,
    ...rightFields(card.serviceRights),
  }, String(card.cardCategory || ''))
}

export function CardSaveButton(props: { card: Card; groups: Named[]; services: Named[] }) {
  const form = Form.useFormInstance()
  const watched = (Form.useWatch([], form) || {}) as CardFormValues
  const category = String(props.card.cardCategory || '').toUpperCase()
  const values = { ...watched, cardCategory: category }
  const blocked = cardDraftError(values, props.groups, props.services) || (cardEditKey(values, category) === cardEditBaseline(props.card) ? 'unchanged' : '')
  return <Button type="primary" htmlType="submit" disabled={!!blocked}>保存</Button>
}

export function cardDraftError(card: CardFormValues, groups: Named[], services: Named[] = [], typeIndex = 1, typeCount = 1, scene: 'draft' | 'detail-create' = 'draft'): string {
  const category = String(card.cardCategory || 'HOURS').toUpperCase()
  const course = category === 'HOURS' || card.courseCategory !== false
  const label = cardDraftLabel(category, course, typeIndex, typeCount)
  if (category === 'PERIOD' && !card.periodType) return '请选择时段卡类型'
  if (!course && category !== 'HOURS' && !(card.serviceItemIds || []).length) {
    return category === 'PERIOD' ? '请为服务类时段卡选择服务' : '请为服务类储值卡选择服务'
  }
  if (scene !== 'detail-create') {
    const missingRightId = (card.serviceItemIds || []).find((id) => {
      const discount = Number(card.rightDiscount?.[id] ?? card.rightDiscount?.[String(id)] ?? 0)
      const unitPrice = Number(card.rightPrice?.[id] ?? card.rightPrice?.[String(id)] ?? 0)
      return discount < 0 || discount > 100 || (discount <= 0 && unitPrice <= 0)
    })
    if (category === 'STORED_VALUE' && missingRightId != null) {
      const discount = Number(card.rightDiscount?.[missingRightId] ?? card.rightDiscount?.[String(missingRightId)] ?? 0)
      const serviceName = personName(services.find((item) => item.id === Number(missingRightId))) || '已选服务'
      return discount < 0 || discount > 100
        ? `${serviceName}折扣必须在 0 到 100 之间`
        : `请为${serviceName}设置折扣或折后单价`
    }
    if (course && !card.studentGroupId) return groups.length ? `请为${label}选择课程` : `${label}暂无可选课程`
    if (category === 'STORED_VALUE' && course && card.studentGroupId && !courseUnitPriceConfigured(groups.find((item) => item.id === card.studentGroupId))) {
      return `${label}课程未设置单价，请在课程管理中设置单价`
    }
  }
  if (course && !(card.coachMemberIds || []).length) {
    return scene === 'detail-create' ? '请至少选择一位老师' : `请为${label}选择老师`
  }
  return ''
}

export function cardPayload(card: CardFormValues, services: Named[]) {
  const category = String(card.cardCategory || 'HOURS').toUpperCase()
  const course = category === 'HOURS' || card.courseCategory !== false
  return {
    cardCategory: category,
    periodType: category === 'PERIOD' ? card.periodType || 'MONTH' : undefined,
    courseCategory: category === 'HOURS' ? true : course,
    coachMemberIds: course ? card.coachMemberIds || [] : [],
    serviceItemIds: category === 'HOURS' ? [] : card.serviceItemIds || [],
    serviceRights: category === 'STORED_VALUE' ? serviceRightPayload(card, services) : undefined,
    studentGroupId: course ? card.studentGroupId : undefined,
  }
}

export function serviceRightPayload(card: CardFormValues, services: Named[]) {
  return (card.serviceItemIds || []).map((id) => {
    const discount = Number(card.rightDiscount?.[id] ?? card.rightDiscount?.[String(id)] ?? 0)
    const unitPrice = Number(card.rightPrice?.[id] ?? card.rightPrice?.[String(id)] ?? 0)
    const service = services.find((item) => item.id === id)
    return {
      courseType: `service:${id}`,
      courseTypeLabel: service ? personName(service) : undefined,
      discount: discount > 0 ? discount : undefined,
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
    }
  })
}

export function rightFields(rights?: ServiceRight[]) {
  const rightDiscount: Record<string, number> = {}
  const rightPrice: Record<string, number> = {}
  ;(rights || []).forEach((right) => {
    const id = String(right.courseType || '').replace('service:', '')
    if (!id) return
    if (right.discount) rightDiscount[id] = Number(right.discount)
    if (right.unitPrice) rightPrice[id] = Number(right.unitPrice)
  })
  return { rightDiscount, rightPrice }
}

export function detailTabKey(tab?: string): string {
  if (tab === 'lessons') return 'check'
  if (tab === 'course' || tab === 'check') return 'check'
  if (tab === 'payment' || tab === 'pay') return 'pay'
  if (tab === 'parent') return 'base'
  return 'base'
}

export function campusProfile(student: Student, campuses: Named[]): { label: string; campus: string; source: string } {
  const campus = String(campuses.find((item) => item.id === student.campusId)?.name || student.campusName || '').trim()
  const source = String(student.sourceCampusName || '').trim()
  const same = (Number(student.sourceCampusId || 0) > 0 && Number(student.campusId || 0) > 0 && Number(student.sourceCampusId) === Number(student.campusId))
    || (!!source && !!campus && source === campus)
  if (source && same) return { label: '所在校区', campus, source: '' }
  return { label: '所属校区', campus, source }
}

export function createdAtText(value?: string): string {
  const text = String(value || '').replace('T', ' ').trim()
  return text.length >= 16 ? text.slice(0, 16) : text
}

export function ageText(value?: string): string {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const birth = new Date(`${date}T00:00:00`)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1
  return age > 0 ? `${age}岁` : ''
}

export function PhoneActions() {
  const phone = String(Form.useWatch('phone') || '').replace(/\D+/g, '').slice(0, 11)
  if (!/^1[3-9]\d{9}$/.test(phone)) return null
  return <PhoneCopyButton onClick={() => copyPhone(phone)} />
}

export async function copyPhone(phone: string) {
  const text = String(phone || '').trim()
  if (!text) {
    message.warning('联系电话缺失')
    return
  }
  if (await copyPlainText(text)) message.success('已复制')
  else Modal.info({ title: '联系电话', content: text, okText: '知道了' })
}

export function BirthDateItem() {
  const birthDate = Form.useWatch('birthDate')
  const age = ageText(birthDate)
  return (
    <Form.Item name="birthDate" label="出生日期" extra={age || undefined} rules={[{ validator: validateBirthDate }]}>
      <BusinessDatePicker maxDate={birthDateMax()} />
    </Form.Item>
  )
}

export function birthDateMax(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function validateBirthDate(_: unknown, value?: string) {
  if (!value || value <= birthDateMax()) return Promise.resolve()
  return Promise.reject(new Error('出生日期须至少早于当前6个月'))
}

export function profileSnapshot(values: { name?: string; gender?: number; phone?: string; birthDate?: string; remark?: string }) {
  const gender = Number(values.gender)
  return JSON.stringify({
    name: String(values.name || '').trim(),
    gender: gender === 1 || gender === 2 ? gender : 0,
    phone: String(values.phone || '').trim(),
    birthDate: String(values.birthDate || '').slice(0, 10),
    remark: String(values.remark || '').trim(),
  })
}

export function profileProblem(values: { name?: string; gender?: number; phone?: string; birthDate?: string; remark?: string }, student: Student) {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能编辑信息'
  const name = String(values.name || '').trim()
  const phone = String(values.phone || '').trim()
  const birthDate = String(values.birthDate || '').slice(0, 10)
  if (!name) return '请输入学员姓名'
  if (Array.from(name).length > 6) return '学员姓名不能超过6个字'
  if (Number(values.gender) !== 1 && Number(values.gender) !== 2) return '请选择性别'
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return '请输入11位正确手机号'
  if (birthDate && birthDate > birthDateMax()) return '出生日期须至少早于当前6个月'
  if (profileSnapshot(values) === profileSnapshot(student)) return 'unchanged'
  return ''
}

export function ProfileSaveButton(props: { student: Student; saving: boolean }) {
  const name = Form.useWatch('name')
  const gender = Form.useWatch('gender')
  const phone = Form.useWatch('phone')
  const birthDate = Form.useWatch('birthDate')
  const remark = Form.useWatch('remark')
  const blocked = profileProblem({ name, gender, phone, birthDate, remark }, props.student)
  return <Button type="primary" htmlType="submit" disabled={!!blocked || props.saving}>{props.saving ? '保存中...' : '保存修改'}</Button>
}

export function isActiveTeachingCoach(item: Named): boolean {
  const status = item.status == null || String(item.status).trim() === '' ? 1 : Number(item.status)
  const substitute = item.isSubstituteTeacher === true
    || Number(item.isSubstituteTeacher) === 1
    || String(item.isSubstituteTeacher || '').trim().toLowerCase() === 'true'
  return status === 1 && substitute
}

export function CoachTransfer(props: { open: boolean; coaches: Named[]; campusId: number; studentIds: number[]; onClose: () => void; onSaved: () => void }) {
  const teachingCoaches = props.coaches.filter(isActiveTeachingCoach)
  const [sourceId, setSourceId] = useState<number>()
  const [targetId, setTargetId] = useState<number>()
  const [students, setStudents] = useState<Student[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [keyword, setKeyword] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(false)
  useEffect(() => {
    if (!props.open) return
    setSourceId(undefined)
    setTargetId(undefined)
    setStudents([])
    setPicked(props.studentIds)
    setKeyword('')
    if (teachingCoaches.length < 2) message.warning('当前校区至少需要两位在职带课老师')
  }, [props.open])
  useEffect(() => {
    if (!props.open || !sourceId) {
      setStudents([])
      return
    }
    let active = true
    setLoadingStudents(true)
    getJson<Student[]>('/students/by-coach', { coachMemberId: sourceId, campusId: props.campusId })
      .then((rows) => {
        if (!active) return
        const activeRows = (rows || []).filter((item) => Number(item.status || 0) !== 2)
        setStudents(activeRows)
        const preset = props.studentIds.filter((id) => activeRows.some((item) => item.id === id))
        setPicked(preset)
      })
      .catch(() => {
        if (active) setStudents([])
      })
      .finally(() => {
        if (active) setLoadingStudents(false)
      })
    return () => { active = false }
  }, [props.open, sourceId, props.campusId])
  const visible = students.filter((item) => {
    const text = `${item.name || ''}${item.phone || ''}`
    return !keyword.trim() || text.includes(keyword.trim())
  })
  return (
    <Modal title="批量更换老师" open={props.open} onCancel={props.onClose} footer={null} destroyOnHidden width={640}>
      <p>仅调整当前负责关系。先选原老师，再勾选其名下在学学员。原老师和新老师都只能是在职带课老师。</p>
      {teachingCoaches.length < 2 ? <p>当前校区至少需要两位在职带课老师。</p> : null}
      <div className="work-toolbar">
        <Select
          style={{ width: 180 }}
          placeholder="原老师"
          value={sourceId}
          onChange={setSourceId}
          disabled={teachingCoaches.length < 2}
          options={teachingCoaches.map((item) => ({ value: item.id, label: personName(item) }))}
        />
        <Select
          style={{ width: 180 }}
          placeholder="新老师"
          value={targetId}
          onChange={setTargetId}
          disabled={teachingCoaches.length < 2}
          options={teachingCoaches.filter((item) => item.id !== sourceId).map((item) => ({ value: item.id, label: personName(item) }))}
        />
      </div>
      {!sourceId ? <p>请先选择原老师</p> : loadingStudents ? <p>正在加载学员...</p> : students.length === 0 ? <p>该老师名下暂无在学学员</p> : (
        <>
          <div className="work-toolbar">
            <Input style={{ width: 220 }} placeholder="搜索学员姓名/电话" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            <Button onClick={() => setPicked(picked.length === visible.length ? [] : visible.map((item) => item.id))}>{picked.length === visible.length && visible.length ? '取消全选' : '全选'}</Button>
            <span>已选 {picked.length} 位学员</span>
          </div>
          {!visible.length ? <p>没有匹配的学员</p> : (
            <Checkbox.Group className="coach-transfer-student-grid" value={picked} onChange={(values) => setPicked(values.map(Number))}>
              {visible.map((item) => <Checkbox key={item.id} value={item.id} title={[item.name, item.phone].filter(Boolean).join(' ')}>{item.name}{item.phone ? ` ${item.phone}` : ''}</Checkbox>)}
            </Checkbox.Group>
          )}
        </>
      )}
      <Button
        style={{ marginTop: 16 }}
        type="primary"
        htmlType="button"
        disabled={!sourceId || !targetId || !picked.length || sourceId === targetId}
        onClick={() => {
          if (!sourceId || !targetId || sourceId === targetId) {
            message.warning('请选择不同的原老师和新老师')
            return
          }
          if (!picked.length) {
            message.warning('请选择学员')
            return
          }
          const sourceName = personName(teachingCoaches.find((item) => item.id === sourceId))
          const targetName = personName(teachingCoaches.find((item) => item.id === targetId))
          const selected = [...picked]
          Modal.confirm({
            title: '确认转移',
            content: `将${selected.length}位学员从“${sourceName}”转给“${targetName}”？其他共同负责老师不会变化。`,
            okText: '确认转移',
            cancelText: '取消',
            onOk: async () => {
              try {
                const count = await postJson<number>('/students/coach-transfer', {
                  sourceCoachMemberId: sourceId,
                  targetCoachMemberId: targetId,
                  campusId: props.campusId,
                  studentIds: selected,
                })
                const transferred = Number(count ?? selected.length)
                Modal.confirm({
                  title: '转移完成',
                  content: `已成功转移${transferred}位学员，请选择下一步操作。`,
                  okText: '继续转移',
                  cancelText: '返回学员',
                  onOk: () => {
                    setSourceId(undefined)
                    setTargetId(undefined)
                    setStudents([])
                    setPicked([])
                    setKeyword('')
                  },
                  onCancel: () => props.onSaved(),
                })
              } catch (error) {
                message.error(tell(error, '更换失败'))
              }
            },
          })
        }}
      >确认转移</Button>
    </Modal>
  )
}
