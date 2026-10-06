import { Button, Checkbox, Input, InputNumber, Modal, Popconfirm, Radio, Space, Switch, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { tell } from './kit'

type CardCategory = 'HOURS' | 'STORED_VALUE' | 'PERIOD'
type PeriodType = 'WEEK' | 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR'

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
  scopeText?: string
  description?: string
  enabled?: number
}

interface ScopeOption {
  id: number
  label: string
  basePrice: number
  basePriceText: string
}

interface RuleDraft {
  key: string
  targetType: 'COURSE' | 'SERVICE'
  targetId: number
  targetName: string
  basePrice: number
  basePriceText: string
  discount: string
  unitPrice: string
}

const CARD_TYPES: Array<{ value: CardCategory; label: string }> = [
  { value: 'HOURS', label: '课时卡' },
  { value: 'STORED_VALUE', label: '储值卡' },
  { value: 'PERIOD', label: '时段卡' },
]

const PERIOD_TYPES: Array<{ value: PeriodType; label: string }> = [
  { value: 'WEEK', label: '周卡' },
  { value: 'MONTH', label: '月卡' },
  { value: 'QUARTER', label: '季卡' },
  { value: 'HALF_YEAR', label: '半年卡' },
  { value: 'YEAR', label: '年卡' },
]

function formatDecimal(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0'
  return amount.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function cardCategoryOf(value: unknown): CardCategory {
  const category = String(value || 'HOURS').toUpperCase()
  if (category === 'STORED_VALUE' || category === 'PERIOD') return category
  return 'HOURS'
}

function periodTypeOf(value: unknown): PeriodType {
  const periodType = String(value || 'MONTH').toUpperCase()
  if (periodType === 'WEEK' || periodType === 'QUARTER' || periodType === 'HALF_YEAR' || periodType === 'YEAR') return periodType
  return 'MONTH'
}

function cardLabel(value: unknown): string {
  return CARD_TYPES.find((item) => item.value === cardCategoryOf(value))?.label || '课时卡'
}

function periodLabel(value: unknown): string {
  return PERIOD_TYPES.find((item) => item.value === periodTypeOf(value))?.label || '月卡'
}

function idsOf(values: unknown): number[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
}

function ruleKey(targetType: 'COURSE' | 'SERVICE', targetId: number): string {
  return `${targetType}:${targetId}`
}

function readBasePrice(source?: { basePrice?: number; basePriceText?: string }): number {
  const direct = Number(source?.basePrice || 0)
  if (direct > 0) return direct
  const matched = String(source?.basePriceText || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  const parsed = matched ? Number(matched[1]) : 0
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function linkRule(rule: RuleDraft, field?: 'discount' | 'unitPrice', typedValue?: string): RuleDraft {
  const base = readBasePrice(rule)
  const next = { ...rule, basePrice: base }
  if (!(base > 0)) {
    if (field) next[field] = typedValue || ''
    return next
  }
  if (field === 'discount') {
    const value = typedValue || ''
    if (!value) return { ...next, discount: '', unitPrice: '' }
    const discount = Math.min(100, Number(value))
    return { ...next, discount: value, unitPrice: Number.isFinite(discount) ? formatDecimal(base * discount / 100) : next.unitPrice }
  }
  if (field === 'unitPrice') {
    const value = typedValue || ''
    if (!value) return { ...next, discount: '', unitPrice: '' }
    const unitPrice = Number(value)
    if (!Number.isFinite(unitPrice)) return { ...next, unitPrice: value }
    const cappedUnit = Math.min(base, unitPrice)
    return { ...next, unitPrice: unitPrice > base ? formatDecimal(cappedUnit) : value, discount: formatDecimal(cappedUnit / base * 100) }
  }
  const unitPrice = Number(next.unitPrice || 0)
  const discount = Number(next.discount || 0)
  if (unitPrice > 0) {
    const cappedUnit = Math.min(base, unitPrice)
    return { ...next, unitPrice: formatDecimal(cappedUnit), discount: formatDecimal(cappedUnit / base * 100) }
  }
  if (discount > 0) {
    const cappedDiscount = Math.min(100, discount)
    return { ...next, discount: formatDecimal(cappedDiscount), unitPrice: formatDecimal(base * cappedDiscount / 100) }
  }
  return next
}

function syncRules(courses: ScopeOption[], services: ScopeOption[], courseIds: number[], serviceIds: number[], current: RuleDraft[], legacyUnitPrice = ''): RuleDraft[] {
  const currentMap = new Map(current.map((rule) => [rule.key, rule]))
  const courseSet = new Set(courseIds)
  const serviceSet = new Set(serviceIds)
  const toRule = (targetType: 'COURSE' | 'SERVICE', option: ScopeOption): RuleDraft => {
    const key = ruleKey(targetType, option.id)
    const existing = currentMap.get(key)
    const basePrice = readBasePrice(option)
    const draft = existing
      ? { ...existing, targetName: option.label, basePrice, basePriceText: option.basePriceText }
      : {
        key,
        targetType,
        targetId: option.id,
        targetName: option.label,
        basePrice,
        basePriceText: option.basePriceText,
        discount: legacyUnitPrice ? '' : '100',
        unitPrice: legacyUnitPrice,
      }
    return linkRule(draft)
  }
  return [
    ...courses.filter((item) => courseSet.has(item.id)).map((item) => toRule('COURSE', item)),
    ...services.filter((item) => serviceSet.has(item.id)).map((item) => toRule('SERVICE', item)),
  ]
}

function ruleSummary(rule: RuleDraft): string {
  const unitPrice = Number(rule.unitPrice || 0)
  if (unitPrice > 0) return `¥${formatDecimal(unitPrice)}/次`
  const discount = Number(rule.discount || 0)
  if (discount >= 100) return '原价'
  if (discount > 0) return `${formatDecimal(discount / 10)}折`
  return '待设置'
}

function pricingMeta(item: CoursePricing): string {
  const category = cardCategoryOf(item.cardCategory)
  const priceText = formatDecimal(item.price)
  if (category === 'HOURS') return `¥${priceText} · ${formatDecimal(item.hours)}课时`
  if (category === 'STORED_VALUE') {
    const count = Array.isArray(item.pricingRules) ? item.pricingRules.length : 0
    return `¥${priceText} · ${count > 0 ? `${count}项独立计费` : `单价¥${formatDecimal(item.unitPrice)}`}`
  }
  return `¥${priceText} · ${periodLabel(item.periodType)}`
}

function emptyDraft() {
  return {
    editingId: 0,
    category: 'HOURS' as CardCategory,
    periodType: 'MONTH' as PeriodType,
    name: '',
    price: '',
    hours: '',
    description: '',
    courseIds: [] as number[],
    serviceIds: [] as number[],
    rules: [] as RuleDraft[],
  }
}

export function CoursePricings({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<CoursePricing[]>([])
  const [courses, setCourses] = useState<ScopeOption[]>([])
  const [services, setServices] = useState<ScopeOption[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  async function load() {
    if (!campusId) return
    const [pricings, groups, items] = await Promise.all([
      getJson<CoursePricing[]>(`/campus-services/${campusId}/course-pricings`),
      getJson<Array<{ id?: number; name?: string; unitPrice?: number }>>('/student-groups/list', { campusId }).catch(() => []),
      getJson<Array<{ id?: number; serviceName?: string; price?: number }>>(`/campus-services/${campusId}/items`).catch(() => []),
    ])
    setRows(pricings || [])
    setCourses((groups || []).filter((group) => Number(group.id || 0) > 0 && String(group.name || '').trim()).map((group) => ({
      id: Number(group.id),
      label: String(group.name).trim(),
      basePrice: Number(group.unitPrice || 0),
      basePriceText: Number(group.unitPrice || 0) > 0 ? `课程单价 ¥${formatDecimal(group.unitPrice || 0)}` : '',
    })))
    setServices((items || []).filter((item) => Number(item.id || 0) > 0 && String(item.serviceName || '').trim()).map((item) => ({
      id: Number(item.id),
      label: String(item.serviceName).trim(),
      basePrice: Number(item.price || 0),
      basePriceText: Number(item.price || 0) > 0 ? `服务原价 ¥${formatDecimal(item.price || 0)}` : '',
    })))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>

  function openCreate() {
    setDraft(emptyDraft())
    setOpen(true)
  }

  function openEdit(row: CoursePricing) {
    const category = cardCategoryOf(row.cardCategory)
    const courseIds = idsOf(row.courseIds)
    const serviceIds = idsOf(row.serviceItemIds)
    const saved: RuleDraft[] = (row.pricingRules || []).map((rule) => {
      const targetType: 'COURSE' | 'SERVICE' = String(rule.targetType || '').toUpperCase() === 'SERVICE' ? 'SERVICE' : 'COURSE'
      const targetId = Number(rule.targetId || 0)
      const option = (targetType === 'SERVICE' ? services : courses).find((item) => item.id === targetId)
      return {
        key: ruleKey(targetType, targetId),
        targetType,
        targetId,
        targetName: String(rule.targetName || option?.label || '').trim(),
        basePrice: readBasePrice(option),
        basePriceText: option?.basePriceText || '',
        discount: Number(rule.discount || 0) > 0 ? formatDecimal(rule.discount) : '',
        unitPrice: Number(rule.unitPrice || 0) > 0 ? formatDecimal(rule.unitPrice) : '',
      }
    }).filter((rule) => rule.targetId > 0)
    const legacyUnitPrice = category === 'STORED_VALUE' && !saved.length && Number(row.unitPrice || 0) > 0
      ? formatDecimal(row.unitPrice)
      : ''
    setDraft({
      editingId: Number(row.id || 0),
      category,
      periodType: periodTypeOf(row.periodType),
      name: String(row.courseName || ''),
      price: formatDecimal(row.price),
      hours: category === 'HOURS' ? formatDecimal(row.hours) : '',
      description: String(row.description || ''),
      courseIds,
      serviceIds,
      rules: syncRules(courses, services, courseIds, serviceIds, saved, legacyUnitPrice),
    })
    setOpen(true)
  }

  function changeScope(kind: 'course' | 'service', ids: number[]) {
    const courseIds = kind === 'course' ? ids : draft.courseIds
    const serviceIds = kind === 'service' ? ids : draft.serviceIds
    setDraft({
      ...draft,
      courseIds,
      serviceIds,
      rules: draft.category === 'STORED_VALUE' ? syncRules(courses, services, courseIds, serviceIds, draft.rules) : draft.rules,
    })
  }

  function changeRule(key: string, field: 'discount' | 'unitPrice', value: string) {
    const nextValue = field === 'discount' ? value.replace(/[^\d.]/g, '') : value
    setDraft({
      ...draft,
      rules: draft.rules.map((rule) => rule.key === key ? linkRule(rule, field, nextValue) : rule),
    })
  }

  async function save() {
    const courseName = draft.name.trim()
    const price = Number(draft.price || 0)
    const hours = Number(draft.hours || 0)
    const selectedCourses = courses.filter((item) => draft.courseIds.includes(item.id))
    const selectedServices = services.filter((item) => draft.serviceIds.includes(item.id))
    if (!courseName) return message.warning('请输入课程名称')
    if (!(price > 0)) return message.warning('请输入正确的价格')
    if (draft.category === 'HOURS' && !(hours > 0)) return message.warning('请输入正确的课时数')
    if (draft.category !== 'HOURS' && !selectedCourses.length && !selectedServices.length) return message.warning('请选择适用课程或服务')
    const pricingRules = draft.category === 'STORED_VALUE'
      ? syncRules(courses, services, draft.courseIds, draft.serviceIds, draft.rules)
      : []
    if (draft.category === 'STORED_VALUE' && pricingRules.some((rule) => {
      const discount = Number(rule.discount || 0)
      const unitPrice = Number(rule.unitPrice || 0)
      return !(unitPrice > 0) && !(discount > 0 && discount <= 100)
    })) return message.warning('请补全每项计费设置')
    const payload = {
      courseName,
      cardCategory: draft.category,
      price: draft.price,
      hours: draft.category === 'HOURS' ? draft.hours : 0,
      unitPrice: undefined,
      pricingRules: pricingRules.map((rule) => ({
        targetType: rule.targetType,
        targetId: rule.targetId,
        targetName: rule.targetName,
        discount: Number(rule.discount || 0) > 0 ? rule.discount : undefined,
        unitPrice: Number(rule.unitPrice || 0) > 0 ? rule.unitPrice : undefined,
      })),
      periodType: draft.category === 'PERIOD' ? draft.periodType : undefined,
      courseIds: draft.category === 'HOURS' ? [] : selectedCourses.map((item) => item.id),
      serviceItemIds: draft.category === 'HOURS' ? [] : selectedServices.map((item) => item.id),
      scopeText: draft.category === 'HOURS' ? '' : [
        selectedCourses.length ? `课程：${pricingRules.filter((rule) => rule.targetType === 'COURSE').map((rule) => `${rule.targetName}（${ruleSummary(rule)}）`).join('、') || selectedCourses.map((item) => item.label).join('、')}` : '',
        selectedServices.length ? `服务：${pricingRules.filter((rule) => rule.targetType === 'SERVICE').map((rule) => `${rule.targetName}（${ruleSummary(rule)}）`).join('、') || selectedServices.map((item) => item.label).join('、')}` : '',
      ].filter(Boolean).join('；'),
      description: draft.description.trim(),
    }
    setSaving(true)
    try {
      if (draft.editingId) await putJson(`/campus-services/${campusId}/course-pricings/${draft.editingId}`, payload)
      else await postJson(`/campus-services/${campusId}/course-pricings`, payload)
      message.success(draft.editingId ? '修改成功' : '新增成功')
      setOpen(false)
      await load()
    } catch (error) {
      message.error(tell(error, draft.editingId ? '修改失败' : '新增失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="work-card service-settings-card">
      <header className="service-list-head">
        <div>
          <h2>课程定价</h2>
          <span>机构统一维护的续费价格，学员端按标准课程展示</span>
        </div>
        <Button type="primary" onClick={openCreate}>新增定价</Button>
      </header>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '还没有课程定价' }}
        columns={[
          { title: '名称', dataIndex: 'courseName' },
          { title: '卡类型', render: (_: unknown, row: CoursePricing) => cardLabel(row.cardCategory) },
          { title: '价格', render: (_: unknown, row: CoursePricing) => pricingMeta(row) },
          { title: '适用范围', render: (_: unknown, row: CoursePricing) => String(row.scopeText || '').trim() || '—' },
          {
            title: '启用',
            render: (_: unknown, row: CoursePricing) => (
              <Switch
                checked={Number(row.enabled) !== 0}
                onChange={async (checked) => {
                  try {
                    await putJson(`/campus-services/${campusId}/course-pricings/${row.id}`, {
                      courseName: row.courseName,
                      cardCategory: row.cardCategory,
                      price: row.price,
                      hours: row.hours,
                      unitPrice: row.unitPrice,
                      periodType: row.periodType,
                      courseIds: row.courseIds,
                      serviceItemIds: row.serviceItemIds,
                      pricingRules: row.pricingRules,
                      scopeText: row.scopeText,
                      description: row.description,
                      enabled: checked ? 1 : 0,
                    })
                    await load()
                  } catch (error) {
                    message.error(tell(error, '更新失败'))
                  }
                }}
              />
            ),
          },
          {
            title: '操作',
            render: (_: unknown, row: CoursePricing) => (
              <Space>
                <Button type="link" onClick={() => openEdit(row)}>编辑</Button>
                <Popconfirm
                  title="确认删除"
                  description={`确定删除“${String(row.courseName || '该课程定价')}”吗？已创建的学员缴费项目不会受影响。`}
                  onConfirm={async () => {
                    try {
                      await delJson(`/campus-services/${campusId}/course-pricings/${row.id}`)
                      message.success('删除成功')
                      await load()
                    } catch (error) {
                      message.error(tell(error, '删除失败'))
                    }
                  }}
                >
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={draft.editingId ? '编辑课程定价' : '新增课程定价'}
        open={open}
        width={720}
        onCancel={() => { if (!saving) setOpen(false) }}
        footer={null}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <label>课程名称<Input maxLength={40} value={draft.name} placeholder="请输入课程名称" onChange={(event) => setDraft({ ...draft, name: event.target.value.slice(0, 40) })} /></label>
          <label>卡类型
            <Radio.Group
              optionType="button"
              value={draft.category}
              options={CARD_TYPES}
              onChange={(event) => {
                const category = cardCategoryOf(event.target.value)
                setDraft({
                  ...draft,
                  category,
                  hours: category === 'HOURS' ? draft.hours : '',
                  rules: category === 'STORED_VALUE' ? syncRules(courses, services, draft.courseIds, draft.serviceIds, draft.rules) : draft.rules,
                })
              }}
            />
          </label>
          <label>价格<InputNumber style={{ width: '100%' }} min={0} value={draft.price === '' ? null : Number(draft.price)} placeholder="请输入价格" onChange={(value) => setDraft({ ...draft, price: value == null ? '' : String(value) })} /></label>
          {draft.category === 'HOURS' ? <label>课时数<InputNumber style={{ width: '100%' }} min={0} value={draft.hours === '' ? null : Number(draft.hours)} placeholder="请输入课时数" onChange={(value) => setDraft({ ...draft, hours: value == null ? '' : String(value) })} /></label> : null}
          {draft.category === 'PERIOD' ? <label>时段类型<Radio.Group optionType="button" value={draft.periodType} options={PERIOD_TYPES} onChange={(event) => setDraft({ ...draft, periodType: periodTypeOf(event.target.value) })} /></label> : null}
          {draft.category !== 'HOURS' ? (
            <>
              <div>
                <p>适用课程</p>
                {courses.length ? <Checkbox.Group value={draft.courseIds} onChange={(values) => changeScope('course', values.map(Number))}>{courses.map((item) => <Checkbox key={item.id} value={item.id}>{item.label}{item.basePriceText ? ` · ${item.basePriceText}` : ''}</Checkbox>)}</Checkbox.Group> : <p>当前校区还没有课程</p>}
              </div>
              <div>
                <p>适用服务</p>
                {services.length ? <Checkbox.Group value={draft.serviceIds} onChange={(values) => changeScope('service', values.map(Number))}>{services.map((item) => <Checkbox key={item.id} value={item.id}>{item.label}{item.basePriceText ? ` · ${item.basePriceText}` : ''}</Checkbox>)}</Checkbox.Group> : <p>当前校区还没有服务项目</p>}
              </div>
            </>
          ) : null}
          {draft.category === 'STORED_VALUE' && draft.rules.length ? (
            <div>
              <p>逐项计费</p>
              {draft.rules.map((rule) => (
                <Space key={rule.key} style={{ display: 'flex', marginBottom: 8 }} align="start">
                  <span style={{ minWidth: 120 }}>{rule.targetName}{rule.basePriceText ? `（${rule.basePriceText}）` : ''}</span>
                  <Input value={rule.discount} placeholder="折扣%" onChange={(event) => changeRule(rule.key, 'discount', event.target.value)} />
                  <Input value={rule.unitPrice} placeholder="单价" onChange={(event) => changeRule(rule.key, 'unitPrice', event.target.value)} />
                </Space>
              ))}
            </div>
          ) : null}
          <label>说明<Input.TextArea maxLength={500} showCount value={draft.description} autoSize={{ minRows: 3, maxRows: 5 }} placeholder="选填" onChange={(event) => setDraft({ ...draft, description: event.target.value.slice(0, 500) })} /></label>
          <div className="staff-form-actions">
            <Button disabled={saving} onClick={() => setOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>{draft.editingId ? '保存' : '确认新增'}</Button>
          </div>
        </Space>
      </Modal>
    </section>
  )
}
