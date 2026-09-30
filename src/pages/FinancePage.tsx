import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedCampus, PageHead, money, monthKey, periodChoices, type PeriodOption, shiftPeriod, tell, todayIso, useShell } from './kit'

export function FinancePage() {
  const shell = useShell()
  const campusId = shell.campusId
  const [mode, setMode] = useState('natural_month')
  const [month, setMonth] = useState(monthKey())
  const [startDate, setStartDate] = useState(monthBounds(monthKey())[0])
  const [endDate, setEndDate] = useState(todayIso())
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([])
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([])
  const [bills, setBills] = useState<Array<Record<string, unknown>>>([])
  const [teacherCost, setTeacherCost] = useState<Record<string, unknown> | null>(null)
  const [categoryEdit, setCategoryEdit] = useState<Record<string, unknown> | null>(null)
  const [planEdit, setPlanEdit] = useState<Record<string, unknown> | null>(null)
  const [periods, setPeriods] = useState<PeriodOption[]>([])

  async function load() {
    if (!campusId) return
    if (mode === 'custom_range') {
      if (startDate && endDate && startDate > endDate) {
        message.warning('开始日期不能晚于结束日期')
        return
      }
      if (startDate && endDate && endDate > addMonthsMinusDay(startDate, 6)) {
        message.warning('自定义时间段最多不能超过6个月')
        return
      }
    }
    const query = financeQuery(mode, month, startDate, endDate)
    const window = await getJson<Record<string, unknown>>('/finance/time-options', { campusId, ...query })
    const nextPeriods = (window?.periodOptions as PeriodOption[]) || []
    setPeriods(nextPeriods)
    const resolvedMonth = String(window?.month || '')
    if ((mode === 'salary_cycle' || mode === 'natural_month') && resolvedMonth && resolvedMonth !== month) setMonth(resolvedMonth)
    const rangeStart = String(window?.startDate || startDate).slice(0, 10)
    const rangeEnd = String(window?.endDate || endDate).slice(0, 10)
    const [nextOverview, nextCategories, nextRecords, nextPlans, nextBills, nextCost] = await Promise.all([
      getJson<Record<string, unknown>>('/finance/overview', { campusId, ...query }),
      getJson<Array<Record<string, unknown>>>('/finance/categories', { campusId, includeDisabled: true }),
      getJson<Array<Record<string, unknown>>>('/finance/records', { campusId, ...query }),
      getJson<Array<Record<string, unknown>>>('/finance/recurring-plans', { campusId }),
      getJson<Array<Record<string, unknown>>>('/finance/recurring-bills', { campusId, ...query }),
      getJson<Record<string, unknown>>('/finance/profit/teacher-cost-detail', { campusId, startDate: rangeStart, endDate: rangeEnd }),
    ])
    setOverview(nextOverview)
    setCategories(nextCategories || [])
    setRecords(nextRecords || [])
    setPlans(nextPlans || [])
    setBills(nextBills || [])
    setTeacherCost(nextCost)
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '收支加载失败')))
  }, [campusId, month, mode, startDate, endDate])

  const income = records.filter((item) => item.direction === 'income' || item.direction === 'INCOME')
  const expense = records.filter((item) => item.direction !== 'income' && item.direction !== 'INCOME')
  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="收支管理" extra="总览、财务设置、收入、运营支出和老师成本。">
        <Select
          style={{ width: 140 }}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'today', label: '今天' },
            { value: 'this_week', label: '本周' },
            { value: 'salary_cycle', label: '记薪周期' },
            { value: 'natural_month', label: '自然月' },
            { value: 'custom_range', label: '自定义' },
          ]}
        />
        {mode === 'natural_month' || mode === 'salary_cycle' ? (
          <>
            <Button onClick={() => setMonth(shiftPeriod(periods, month, -1))}>上一期</Button>
            <Select style={{ width: 280 }} value={month} onChange={setMonth} options={periodChoices(periods, month, mode)} />
            <Button onClick={() => setMonth(shiftPeriod(periods, month, 1))}>下一期</Button>
          </>
        ) : null}
        {mode === 'custom_range' ? (
          <>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </>
        ) : null}
      </PageHead>
      <Tabs items={[
        {
          key: 'overview',
          label: '总览',
          children: (
            <section className="work-card">
              <div className="stat-line">
                <span>收入<strong>{money(overview?.income)}</strong></span>
                <span>已支出<strong>{money(overview?.paidExpense)}</strong></span>
                <span>待支出<strong>{money(overview?.pendingExpense)}</strong></span>
                <span>老师成本<strong>{money(overview?.salaryExpense)}</strong></span>
              </div>
            </section>
          ),
        },
        {
          key: 'settings',
          label: '财务设置',
          children: (
            <section className="work-card">
              <Form layout="inline" onFinish={async (values: { name: string; direction: string }) => {
                const name = String(values.name || '').trim()
                const problem = categoryNameError(name, values.direction, campusId, categories)
                if (problem) {
                  message.warning(problem)
                  return
                }
                try {
                  await postJson('/finance/categories', { name, direction: values.direction, campusId, enabled: 1 })
                  message.success(values.direction === 'expense' ? '已新增支出项目' : '已新增收入项目')
                  await load()
                } catch (error) {
                  message.error(tell(error, '保存失败'))
                }
              }}>
                <Form.Item name="name" rules={[{ required: true }]}><Input maxLength={8} placeholder="项目名称，最多8字" /></Form.Item>
                <Form.Item name="direction" initialValue="income"><Select options={[{ value: 'income', label: '收入' }, { value: 'expense', label: '支出' }]} /></Form.Item>
                <Button htmlType="submit">添加项目</Button>
              </Form>
              <Table style={{ marginTop: 12 }} rowKey="id" dataSource={categories} pagination={false} columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '方向', dataIndex: 'direction' },
                { title: '状态', render: (_: unknown, row: Record<string, unknown>) => Number(row.enabled) === 0 ? '停用' : '启用' },
                {
                  title: '操作',
                  render: (_: unknown, row: Record<string, unknown>) => (
                    <Space>
                      <Button type="link" onClick={() => setCategoryEdit(row)}>改名</Button>
                      <Button type="link" onClick={async () => {
                        const disabling = Number(row.enabled) !== 0
                        try {
                          await postJson(`/finance/categories/${row.id}/${disabling ? 'disable' : 'restore'}`)
                          message.success(disabling ? '已停用' : '已恢复')
                          await load()
                        } catch (error) {
                          message.error(tell(error, '保存失败'))
                        }
                      }}>{Number(row.enabled) === 0 ? '恢复' : '停用'}</Button>
                      <Popconfirm title="确认删除" description="删除后不再用于新增流水，历史流水会灰色显示，确认删除吗？" onConfirm={async () => {
                        try {
                          await delJson(`/finance/categories/${row.id}`)
                          message.success('已删除')
                          await load()
                        } catch (error) {
                          message.error(tell(error, '删除失败'))
                        }
                      }}><Button type="link" danger>删除</Button></Popconfirm>
                    </Space>
                  ),
                },
              ]} />
              <Form style={{ marginTop: 16 }} layout="inline" onFinish={async (values: { name?: string; categoryId?: number; singleAmount?: number; cycleMonths?: number; startDate?: string; remark?: string }) => {
                const name = String(values.name || '').trim()
                if (!name || !campusId || !values.categoryId || Number(values.singleAmount) <= 0 || Number(values.cycleMonths) <= 0 || !values.startDate) {
                  message.warning('请补全周期支出信息')
                  return
                }
                try {
                  await postJson('/finance/recurring-plans', { ...values, name, campusId, enabled: 1 })
                  message.success('已新增周期支出')
                  await load()
                } catch (error) {
                  message.error(tell(error, '保存失败'))
                }
              }}>
                <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="周期支出" /></Form.Item>
                <Form.Item name="categoryId"><Select style={{ width: 140 }} placeholder="支出项目" options={categories.filter((item) => String(item.direction).includes('expense') || item.direction === 'expense').map((item) => ({ value: item.id, label: String(item.name) }))} /></Form.Item>
                <Form.Item name="singleAmount"><InputNumber placeholder="金额" /></Form.Item>
                <Form.Item name="cycleMonths"><InputNumber placeholder="周期月数" min={1} /></Form.Item>
                <Form.Item name="startDate" initialValue={todayIso()}><Input type="date" /></Form.Item>
                <Form.Item name="remark"><Input placeholder="备注" /></Form.Item>
                <Button htmlType="submit">添加周期支出</Button>
              </Form>
              <Table style={{ marginTop: 12 }} rowKey="id" dataSource={plans} pagination={false} columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '金额', dataIndex: 'singleAmount' },
                { title: '周期月数', dataIndex: 'cycleMonths' },
                { title: '开始', dataIndex: 'startDate' },
                {
                  title: '操作',
                  render: (_: unknown, row: Record<string, unknown>) => (
                    <Space>
                      <Button type="link" onClick={() => setPlanEdit(row)}>编辑</Button>
                      <Button type="link" danger onClick={async () => { await delJson(`/finance/recurring-plans/${row.id}`); await load() }}>删除</Button>
                    </Space>
                  ),
                },
              ]} />
              <h3 style={{ marginTop: 20 }}>本期周期账单</h3>
              <Table
                rowKey="id"
                dataSource={bills}
                pagination={false}
                locale={{ emptyText: '当前时间范围内没有周期账单' }}
                columns={[
                  { title: '月份', dataIndex: 'billMonth' },
                  { title: '计划', render: (_: unknown, row: Record<string, unknown>) => String(plans.find((item) => item.id === row.planId)?.name || row.planId || '') },
                  { title: '应摊', render: (_: unknown, row: Record<string, unknown>) => money(row.apportionedAmount) },
                  { title: '已覆盖', render: (_: unknown, row: Record<string, unknown>) => money(row.coveredAmount) },
                  { title: '状态', render: (_: unknown, row: Record<string, unknown>) => billStatusText(row.status) },
                ]}
              />
            </section>
          ),
        },
        { key: 'income', label: '收入明细', children: <RecordTable rows={income.length ? income : (overview?.incomeDetails as Array<Record<string, unknown>> || [])} campusId={campusId} categories={categories} plans={plans} direction="income" onChanged={load} /> },
        { key: 'expense', label: '运营支出明细', children: <RecordTable rows={expense.length ? expense : (overview?.paidExpenseDetails as Array<Record<string, unknown>> || [])} campusId={campusId} categories={categories} plans={plans} direction="expense" onChanged={load} /> },
        {
          key: 'teacher',
          label: '老师成本明细',
          children: (
            <section className="work-card">
              <p>固定分摊 {money(teacherCost?.totalFixedCost)}，销课课时成本 {money(teacherCost?.totalConsumedCost)}。</p>
              <Table rowKey={(row) => String(row.staffId) + String(row.campusId)} dataSource={(teacherCost?.items as Array<Record<string, unknown>>) || []} pagination={false} columns={[
                { title: '老师', dataIndex: 'staffName' },
                { title: '校区', dataIndex: 'campusName' },
                { title: '固定', render: (_: unknown, row: Record<string, unknown>) => money(row.fixedSalaryTotal) },
                { title: '分摊', render: (_: unknown, row: Record<string, unknown>) => money(row.fixedAllocatedCost) },
                { title: '销课成本', render: (_: unknown, row: Record<string, unknown>) => money(row.consumedCost) },
              ]} />
            </section>
          ),
        },
      ]} />
      <Modal title="修改项目名称" open={!!categoryEdit} onCancel={() => setCategoryEdit(null)} footer={null} destroyOnClose>
        {categoryEdit ? (
          <Form
            layout="vertical"
            initialValues={{ name: categoryEdit.name }}
            onFinish={async (values: { name: string }) => {
              const name = String(values.name || '').trim()
              const problem = categoryNameError(name, String(categoryEdit.direction || 'income'), campusId, categories, Number(categoryEdit.id || 0))
              if (problem) {
                message.warning(problem)
                return
              }
              try {
                await putJson(`/finance/categories/${categoryEdit.id}`, { ...categoryEdit, name })
                message.success('已保存')
                setCategoryEdit(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}><Input maxLength={8} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Modal title="编辑周期支出" open={!!planEdit} onCancel={() => setPlanEdit(null)} footer={null} destroyOnClose>
        {planEdit ? (
          <Form
            layout="vertical"
            initialValues={planEdit}
            onFinish={async (values: { name: string; singleAmount: number; cycleMonths?: number; startDate?: string; remark?: string; categoryId?: number }) => {
              if (!String(values.name || '').trim() || Number(values.singleAmount) <= 0 || Number(values.cycleMonths) <= 0 || !values.startDate) {
                message.warning('请补全周期支出信息')
                return
              }
              try {
                await putJson(`/finance/recurring-plans/${planEdit.id}`, { ...planEdit, ...values, name: values.name.trim(), campusId })
                message.success('已保存')
                setPlanEdit(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="singleAmount" label="单次金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="cycleMonths" label="周期月数"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
            <Form.Item name="startDate" label="开始日期"><Input type="date" /></Form.Item>
            <Form.Item name="remark" label="备注"><Input /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </NeedCampus>
  )
}

const PAYMENT_TYPES = [
  { value: 1, label: '支付宝' },
  { value: 2, label: '微信' },
  { value: 3, label: '银行卡' },
  { value: 4, label: '公户' },
  { value: 5, label: '现金' },
]

function paymentTypeText(value: unknown): string {
  return PAYMENT_TYPES.find((item) => item.value === Number(value))?.label || ''
}

function RecordTable(props: {
  rows: Array<Record<string, unknown>>
  campusId: number | null
  categories: Array<Record<string, unknown>>
  plans: Array<Record<string, unknown>>
  direction: string
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const entries = [
    ...props.categories
      .filter((item) => String(item.direction || '') === props.direction && Number(item.enabled) !== 0)
      .map((item) => ({ value: `category:${item.id}`, label: String(item.name) })),
    ...(props.direction === 'expense' ? props.plans.map((item) => ({ value: `plan:${item.id}`, label: `周期 · ${String(item.name || '')}` })) : []),
  ]
  function payloadOf(values: { entry: string; amount: number; bizDate?: string; paymentType: number; remark?: string }) {
    const [kind, rawId] = String(values.entry || '').split(':')
    const id = Number(rawId)
    const plan = kind === 'plan'
    return {
      campusId: props.campusId,
      direction: props.direction,
      sourceType: plan ? 'recurring_expense_payment' : props.direction === 'income' ? 'manual_income' : 'manual_expense',
      categoryId: plan ? undefined : id,
      planId: plan ? id : undefined,
      amount: values.amount,
      bizDate: values.bizDate || todayIso(),
      paymentType: values.paymentType,
      remark: values.remark,
    }
  }
  return (
    <section className="work-card">
      <Form layout="inline" onFinish={async (values: { entry: string; amount: number; bizDate?: string; paymentType: number; remark?: string }) => {
        const error = recordError(props.direction, props.campusId, values)
        if (error) {
          message.warning(error)
          return
        }
        try {
          await postJson('/finance/records', payloadOf(values))
          message.success('已保存')
          await props.onChanged()
        } catch (error) {
          message.error(tell(error, '保存失败'))
        }
      }}>
        <Form.Item name="entry" rules={[{ required: true, message: '请选择项目' }]}><Select style={{ width: 180 }} placeholder={props.direction === 'income' ? '收入项目' : '支出项目'} options={entries} /></Form.Item>
        <Form.Item name="amount" rules={[{ required: true, message: '请输入有效金额' }]}><InputNumber placeholder="金额" min={0.01} max={999999.99} /></Form.Item>
        <Form.Item name="paymentType" rules={[{ required: true, message: props.direction === 'income' ? '请选择收入方式' : '请选择支出方式' }]}><Select style={{ width: 120 }} placeholder={props.direction === 'income' ? '收入方式' : '支出方式'} options={PAYMENT_TYPES} /></Form.Item>
        <Form.Item name="bizDate" initialValue={todayIso()} rules={[{ required: true }]}><Input type="date" /></Form.Item>
        <Form.Item name="remark"><Input placeholder="备注" maxLength={200} /></Form.Item>
        <Button htmlType="submit">添加</Button>
      </Form>
      <Table style={{ marginTop: 12 }} rowKey={(row) => String(row.id || row.title)} dataSource={props.rows} pagination={false} columns={[
        { title: '日期', render: (_: unknown, row: Record<string, unknown>) => String(row.bizDate || row.date || '') },
        { title: '名称', render: (_: unknown, row: Record<string, unknown>) => String(row.title || row.sourceName || row.categoryName || '') },
        { title: '方式', render: (_: unknown, row: Record<string, unknown>) => String(row.paymentTypeLabel || paymentTypeText(row.paymentType)) },
        { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
        { title: '备注', dataIndex: 'remark' },
        {
          title: '操作',
          render: (_: unknown, row: Record<string, unknown>) => row.id ? (
            <>
              <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
              <Popconfirm title="删除？" onConfirm={async () => {
                try {
                  await delJson(`/finance/records/${row.id}`)
                  message.success('已删除')
                  await props.onChanged()
                } catch (error) {
                  message.error(tell(error, '删除失败'))
                }
              }}>
                <Button type="link" danger>删除</Button>
              </Popconfirm>
            </>
          ) : null,
        },
      ]} />
      <Modal title="编辑记录" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{
              entry: editing.planId ? `plan:${editing.planId}` : `category:${editing.categoryId}`,
              amount: editing.amount,
              remark: editing.remark,
              bizDate: editing.bizDate,
              paymentType: editing.paymentType,
            }}
            onFinish={async (values: { entry: string; amount: number; remark?: string; bizDate?: string; paymentType: number }) => {
              const error = recordError(props.direction, props.campusId, values)
              if (error) {
                message.warning(error)
                return
              }
              try {
                await putJson(`/finance/records/${editing.id}`, payloadOf(values))
                message.success('已保存')
                setEditing(null)
                await props.onChanged()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="entry" label="项目" rules={[{ required: true }]}><Select options={entries} /></Form.Item>
            <Form.Item name="bizDate" label="日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入有效金额' }]}><InputNumber style={{ width: '100%' }} min={0.01} max={999999.99} /></Form.Item>
            <Form.Item name="paymentType" label={props.direction === 'income' ? '收入方式' : '支出方式'} rules={[{ required: true }]}><Select options={PAYMENT_TYPES} /></Form.Item>
            <Form.Item name="remark" label="备注"><Input maxLength={200} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

function billStatusText(value: unknown): string {
  if (value === 'paid') return '已覆盖'
  if (value === 'partial') return '部分覆盖'
  return '待覆盖'
}

function recordError(direction: string, campusId: number | null, values: { entry?: string; amount?: number; bizDate?: string; paymentType?: number }) {
  if (!campusId) return '请先选择校区'
  if (!values.entry) return direction === 'income' ? '请选择收入条目' : '请选择支出条目'
  const amount = Number(values.amount)
  if (!Number.isFinite(amount) || amount <= 0) return '请输入有效金额'
  if (amount > 999999.99) return '金额不能超过999999.99'
  if (!values.paymentType) return direction === 'income' ? '请选择收入方式' : '请选择支出方式'
  if (!values.bizDate) return '请选择日期'
  return ''
}

function categoryNameKey(name: string): string {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function categoryNameError(name: string, direction: string, campusId: number | null, categories: Array<Record<string, unknown>>, currentId = 0): string {
  const expense = String(direction || '').toLowerCase().includes('expense')
  const trimmed = String(name || '').trim()
  if (expense && !campusId) return '请先切换到具体校区'
  if (!trimmed) return expense ? '请填写项目名称' : '请输入收入项目名'
  if (Array.from(trimmed).length > 8) return expense ? '支出项目最多8个字' : '收入项目最多8个字'
  const key = categoryNameKey(trimmed)
  const duplicate = categories.some((item) => {
    if (currentId > 0 && Number(item.id) === currentId) return false
    const itemDirection = String(item.direction || '').toLowerCase()
    const sameDirection = expense ? itemDirection.includes('expense') : itemDirection.includes('income')
    if (!sameDirection || Number(item.campusId || 0) !== Number(campusId || 0)) return false
    return categoryNameKey(String(item.name || '')) === key
  })
  return duplicate ? (expense ? '支出项目名称不能重复' : '收入项目名称不能重复') : ''
}

function addMonthsMinusDay(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(year, month - 1 + months, day)
  date.setDate(date.getDate() - 1)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function financeQuery(mode: string, month: string, startDate: string, endDate: string): Record<string, string> {
  if (mode === 'custom_range') return { timeMode: 'custom_range', startDate, endDate }
  if (mode === 'today' || mode === 'this_week') return { timeMode: mode }
  return { timeMode: mode, month }
}

function monthBounds(month: string): [string, string] {
  const [year, mon] = month.split('-').map(Number)
  const end = new Date(year, mon, 0).getDate()
  return [`${month}-01`, `${month}-${`${end}`.padStart(2, '0')}`]
}

