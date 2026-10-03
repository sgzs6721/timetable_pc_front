import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, message } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { BusinessDatePicker, BusinessDateRangePicker } from '../components/BusinessDatePicker'
import { FinanceOverviewDashboard } from './finance-overview'
import { NeedCampus, PageHead, clampDecimalInput, money, monthKey, periodChoices, type PeriodOption, shiftPeriod, tell, todayIso, useShell } from './kit'

export function FinancePage() {
  const shell = useShell()
  const campusId = shell.campusId
  const [settingsBlock, setSettingsBlock] = useState('categories')
  const [mode, setMode] = useState('natural_month')
  const [month, setMonth] = useState(monthKey())
  const [startDate, setStartDate] = useState(monthBounds(monthKey())[0])
  const [endDate, setEndDate] = useState(todayIso())
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [campusRows, setCampusRows] = useState<Array<{ campusId?: number; campusName?: string; overview?: Record<string, unknown> }>>([])
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([])
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([])
  const [bills, setBills] = useState<Array<Record<string, unknown>>>([])
  const [categoryEdit, setCategoryEdit] = useState<Record<string, unknown> | null>(null)
  const [planEdit, setPlanEdit] = useState<Record<string, unknown> | null>(null)
  const [periods, setPeriods] = useState<PeriodOption[]>([])
  const [categoryForm] = Form.useForm()
  const categoryDirection = Form.useWatch('direction', categoryForm) || 'income'
  const [expenseRecurring, setExpenseRecurring] = useState(false)
  const loadRequestRef = useRef(0)
  const billingMonth = monthKey()
  const billingPeriod = naturalMonthRangeLabel(billingMonth)
  const billingPeriodShort = naturalMonthRangeLabel(billingMonth, true)

  async function load() {
    if (!campusId) return
    const requestId = ++loadRequestRef.current
    setOverviewLoading(true)
    if (mode === 'custom_range') {
      if (startDate && endDate && startDate > endDate) {
        message.warning('开始日期不能晚于结束日期')
        if (requestId === loadRequestRef.current) setOverviewLoading(false)
        return
      }
      if (startDate && endDate && endDate > addMonthsMinusDay(startDate, 6)) {
        message.warning('自定义时间段最多不能超过6个月')
        if (requestId === loadRequestRef.current) setOverviewLoading(false)
        return
      }
    }
    try {
      const query = financeQuery(mode, month, startDate, endDate)
      const window = await getJson<Record<string, unknown>>('/finance/time-options', { campusId, ...query })
      if (requestId !== loadRequestRef.current) return
      const nextPeriods = (window?.periodOptions as PeriodOption[]) || []
      setPeriods(nextPeriods)
      const resolvedMonth = String(window?.month || '')
      if ((mode === 'salary_cycle' || mode === 'natural_month') && resolvedMonth && resolvedMonth !== month) setMonth(resolvedMonth)
      const [nextOverview, nextCategories, nextRecords, nextPlans, nextBills, nextCampusRows] = await Promise.all([
        getJson<Record<string, unknown>>('/finance/overview', { campusId, ...query }),
        getJson<Array<Record<string, unknown>>>('/finance/categories', { campusId, includeDisabled: true }),
        getJson<Array<Record<string, unknown>>>('/finance/records', { campusId, ...query }),
        getJson<Array<Record<string, unknown>>>('/finance/recurring-plans', { campusId }),
        getJson<Array<Record<string, unknown>>>('/finance/recurring-bills', { campusId, ...query }),
        getJson<Array<{ campusId?: number; campusName?: string; overview?: Record<string, unknown> }>>('/finance/overview/by-campus', {
          campusIds: shell.campuses.map((item) => item.id).join(','),
          ...query,
        }),
      ])
      if (requestId !== loadRequestRef.current) return
      setOverview(nextOverview)
      setCampusRows(nextCampusRows || [])
      setCategories(nextCategories || [])
      setRecords(nextRecords || [])
      setPlans(nextPlans || [])
      setBills(nextBills || [])
    } finally {
      if (requestId === loadRequestRef.current) setOverviewLoading(false)
    }
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '收支加载失败')))
  }, [campusId, month, mode, startDate, endDate])

  const income = records.filter((item) => item.direction === 'income' || item.direction === 'INCOME')
  const expense = records.filter((item) => item.direction !== 'income' && item.direction !== 'INCOME')
  const periodLabel = financePeriodLabel(mode, month, startDate, endDate)

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="收支管理" extra="集中查看收入、支出、待付款与校区财务表现。" />
      <Tabs defaultActiveKey="overview" items={[
        {
          key: 'overview',
          label: '总览',
          children: (
            <FinanceOverviewDashboard
              loading={overviewLoading}
              rows={campusRows}
              fallbackOverview={overview}
              activeCampusId={campusId}
              activeCampusName={shell.campuses.find((item) => item.id === campusId)?.name || '当前校区'}
              periodLabel={periodLabel}
              filter={(
                <div className="finance-overview-filter" aria-label="总览时间筛选">
                  <div className="finance-overview-filter__meta">
                    <span>统计周期</span>
                    <strong>{periodLabel}</strong>
                  </div>
                  <Select
                    className="finance-overview-filter__mode"
                    aria-label="时间范围类型"
                    value={mode}
                    onChange={(value) => {
                      setOverviewLoading(true)
                      if (value === 'custom_range') {
                        const today = todayIso()
                        setStartDate(today)
                        setEndDate(today)
                      }
                      setMode(value)
                    }}
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
                      <Button
                        type="text"
                        shape="circle"
                        className="finance-overview-filter__step"
                        icon={<LeftOutlined />}
                        aria-label="上一期"
                        title="上一期"
                        onClick={() => { setOverviewLoading(true); setMonth(shiftPeriod(periods, month, -1)) }}
                      />
                      <Select
                        className="finance-overview-filter__period"
                        aria-label="选择统计月份"
                        value={month}
                        onChange={(value) => { setOverviewLoading(true); setMonth(value) }}
                        options={periodChoices(periods, month, mode)}
                      />
                      <Button
                        type="text"
                        shape="circle"
                        className="finance-overview-filter__step"
                        icon={<RightOutlined />}
                        aria-label="下一期"
                        title="下一期"
                        onClick={() => { setOverviewLoading(true); setMonth(shiftPeriod(periods, month, 1)) }}
                      />
                    </>
                  ) : null}
                  {mode === 'custom_range' ? (
                    <BusinessDateRangePicker
                      className="finance-overview-filter__range"
                      value={[startDate, endDate]}
                      onChange={([start, end]) => { setOverviewLoading(true); setStartDate(start); setEndDate(end) }}
                    />
                  ) : null}
                </div>
              )}
            />
          ),
        },
        {
          key: 'settings',
          label: '财务设置',
          children: (
            <div className="finance-settings">
            <div className="finance-settings-blocks" role="tablist" aria-label="财务设置分类">
              <button
                type="button"
                role="tab"
                aria-selected={settingsBlock === 'categories'}
                className={settingsBlock === 'categories' ? 'is-active' : ''}
                onClick={() => setSettingsBlock('categories')}
              >
                <span className="finance-settings-blocks__index">01</span>
                <span className="finance-settings-blocks__copy"><strong>收支项目</strong><small>维护收入与支出分类</small></span>
                <span className="finance-settings-blocks__count"><b>{categories.length}</b><small>项</small></span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsBlock === 'plans'}
                className={settingsBlock === 'plans' ? 'is-active' : ''}
                onClick={() => setSettingsBlock('plans')}
              >
                <span className="finance-settings-blocks__index">02</span>
                <span className="finance-settings-blocks__copy"><strong>周期支出</strong><small>管理固定支出计划</small></span>
                <span className="finance-settings-blocks__count"><b>{plans.length}</b><small>项</small></span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsBlock === 'bills'}
                className={settingsBlock === 'bills' ? 'is-active' : ''}
                onClick={() => setSettingsBlock('bills')}
              >
                <span className="finance-settings-blocks__index">03</span>
                <span className="finance-settings-blocks__copy"><strong>本月周期账单</strong><small>{billingPeriodShort}</small></span>
                <span className="finance-settings-blocks__count"><b>{bills.length}</b><small>笔</small></span>
              </button>
            </div>
            {settingsBlock === 'categories' ? <section className="work-card finance-settings-panel">
              <h2>收支项目</h2>
              <Form className="finance-category-form" form={categoryForm} layout="inline" onFinish={async (values: { name: string; direction: string; cycleMonths?: number; startDate?: string }) => {
                const name = String(values.name || '').trim()
                const direction = values.direction || 'income'
                const expense = direction === 'expense'
                const problem = categoryNameError(name, direction, campusId, categories)
                if (problem) {
                  message.warning(problem)
                  return
                }
                const cycleMonths = Number(values.cycleMonths || 0)
                if (expense && expenseRecurring && cycleMonths <= 0) {
                  message.warning('请填写周期月数')
                  return
                }
                const remark = expense
                  ? JSON.stringify({
                    expenseSetting: {
                      isRecurring: expenseRecurring,
                      cycleMonths: expenseRecurring ? cycleMonths : 0,
                      startDate: expenseRecurring ? String(values.startDate || todayIso()) : '',
                    },
                  })
                  : undefined
                try {
                  await postJson('/finance/categories', { name, direction, campusId, enabled: 1, remark })
                  message.success(expense ? '已新增配置项' : '已新增收入项目')
                  categoryForm.resetFields()
                  setExpenseRecurring(false)
                  await load()
                } catch (error) {
                  message.error(tell(error, '保存失败'))
                }
              }}>
                <Form.Item className="finance-category-form__name" name="name"><Input maxLength={8} placeholder={categoryDirection === 'expense' ? '例如：房租（最多8字）' : '例如：课程包收入（最多8字）'} /></Form.Item>
                <Form.Item name="direction" initialValue="income">
                  <Select
                    style={{ width: 120 }}
                    options={[{ value: 'income', label: '收入' }, { value: 'expense', label: '支出' }]}
                    onChange={(value) => { if (value !== 'expense') setExpenseRecurring(false) }}
                  />
                </Form.Item>
                {categoryDirection === 'expense' ? (
                  <Form.Item label="是否周期支出">
                    <Switch checked={expenseRecurring} onChange={setExpenseRecurring} />
                  </Form.Item>
                ) : null}
                {categoryDirection === 'expense' && expenseRecurring ? (
                  <>
                    <Form.Item name="cycleMonths" label="周期月数"><InputNumber min={1} placeholder="3" /></Form.Item>
                    <Form.Item name="startDate" label="开始时间" initialValue={todayIso()}><BusinessDatePicker /></Form.Item>
                  </>
                ) : null}
                <Button htmlType="submit">{categoryDirection === 'expense' ? '新增配置项' : '新增'}</Button>
              </Form>
              <Table style={{ marginTop: 12 }} rowKey="id" dataSource={categories} pagination={false} columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '方向', dataIndex: 'direction' },
                { title: '周期', render: (_: unknown, row: Record<string, unknown>) => expenseCycleText(row, 'mode') },
                { title: '月数', render: (_: unknown, row: Record<string, unknown>) => expenseCycleText(row, 'months') },
                { title: '开始时间', render: (_: unknown, row: Record<string, unknown>) => expenseCycleText(row, 'start') },
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
            </section> : null}
            {settingsBlock === 'plans' ? <section className="work-card finance-settings-panel">
              <h2>周期支出</h2>
              <Form layout="inline" onFinish={async (values: { name?: string; categoryId?: number; singleAmount?: number; cycleMonths?: number; startDate?: string; remark?: string }) => {
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
                <Form.Item name="singleAmount" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber placeholder="金额" min={0} /></Form.Item>
                <Form.Item name="cycleMonths"><InputNumber placeholder="周期月数" min={1} /></Form.Item>
                <Form.Item name="startDate" initialValue={todayIso()}><BusinessDatePicker /></Form.Item>
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
            </section> : null}
            {settingsBlock === 'bills' ? <section className="work-card finance-settings-panel">
              <header className="finance-settings-panel-head">
                <div><h2>本月周期账单</h2><p>统计周期：{billingPeriod}（自然月）</p></div>
                <span>每月 1 日至月末</span>
              </header>
              <Table
                rowKey="id"
                dataSource={bills}
                pagination={false}
                locale={{ emptyText: '本月没有周期账单' }}
                columns={[
                  { title: '月份', dataIndex: 'billMonth' },
                  { title: '计划', render: (_: unknown, row: Record<string, unknown>) => String(plans.find((item) => item.id === row.planId)?.name || row.planId || '') },
                  { title: '应摊', render: (_: unknown, row: Record<string, unknown>) => money(row.apportionedAmount) },
                  { title: '已覆盖', render: (_: unknown, row: Record<string, unknown>) => money(row.coveredAmount) },
                  { title: '状态', render: (_: unknown, row: Record<string, unknown>) => billStatusText(row.status) },
                ]}
              />
            </section> : null}
            </div>
          ),
        },
        { key: 'income', label: '收入明细', children: <RecordTable rows={income.length ? income : (overview?.incomeDetails as Array<Record<string, unknown>> || [])} campusId={campusId} categories={categories} plans={plans} direction="income" onChanged={load} /> },
        { key: 'expense', label: '运营支出明细', children: <RecordTable rows={expense.length ? expense : (overview?.paidExpenseDetails as Array<Record<string, unknown>> || [])} campusId={campusId} categories={categories} plans={plans} direction="expense" onChanged={load} /> },
      ]} />
      <Modal title="修改项目名称" open={!!categoryEdit} onCancel={() => setCategoryEdit(null)} footer={null} destroyOnHidden>
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
      <Modal title="编辑周期支出" open={!!planEdit} onCancel={() => setPlanEdit(null)} footer={null} destroyOnHidden>
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
            <Form.Item name="singleAmount" label="单次金额" rules={[{ required: true }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="cycleMonths" label="周期月数"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
            <Form.Item name="startDate" label="开始日期"><BusinessDatePicker /></Form.Item>
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
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [createForm] = Form.useForm()
  const income = props.direction === 'income'
  const recordName = income ? '收入' : '支出'
  const entries = [
    ...props.categories
      .filter((item) => String(item.direction || '') === props.direction && Number(item.enabled) !== 0)
      .map((item) => ({ value: `category:${item.id}`, label: String(item.name) })),
    ...(props.direction === 'expense' ? props.plans.map((item) => ({ value: `plan:${item.id}`, label: `周期 · ${String(item.name || '')}` })) : []),
  ]
  const editingEntry = editing?.planId ? `plan:${editing.planId}` : editing?.categoryId ? `category:${editing.categoryId}` : ''
  if (editingEntry && !entries.some((item) => item.value === editingEntry)) {
    entries.push({ value: editingEntry, label: String(editing?.sourceName || editing?.title || '历史项目') })
  }
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
  function closeCreate() {
    setCreating(false)
    createForm.resetFields()
  }
  async function createRecord(values: { entry: string; amount: number; bizDate?: string; paymentType: number; remark?: string }) {
    const error = recordError(props.direction, props.campusId, values)
    if (error) return void message.warning(error)
    setSavingCreate(true)
    try {
      await postJson('/finance/records', payloadOf(values))
      message.success(`${recordName}已录入`)
      closeCreate()
      await props.onChanged()
    } catch (error) {
      message.error(tell(error, '保存失败'))
    } finally {
      setSavingCreate(false)
    }
  }
  return (
    <section className="work-card finance-record-card">
      <div className="finance-record-head">
        <div><h2>{income ? '收入明细' : '运营支出明细'}</h2><p>查看已有{recordName}记录，需要新增时点击右侧按钮。</p></div>
        <Button type="primary" onClick={() => setCreating(true)}>录入{recordName}</Button>
      </div>
      <Table rowKey={(row) => String(row.id || row.title)} dataSource={props.rows} pagination={false} columns={[
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
      <Modal
        title={`录入${recordName}`}
        open={creating}
        okText="确认录入"
        cancelText="取消"
        confirmLoading={savingCreate}
        onOk={() => createForm.submit()}
        onCancel={closeCreate}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" initialValues={{ bizDate: todayIso() }} onFinish={createRecord}>
          <Form.Item name="entry" label={`${recordName}项目`} rules={[{ required: true, message: '请选择项目' }]}><Select placeholder={`请选择${recordName}项目`} options={entries} /></Form.Item>
          <PlanEntryHint plans={props.plans} categories={props.categories} />
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入有效金额' }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} placeholder="请输入金额" min={0.01} /></Form.Item>
          <Form.Item name="paymentType" label={`${recordName}方式`} rules={[{ required: true, message: `请选择${recordName}方式` }]}><Select placeholder={`请选择${recordName}方式`} options={PAYMENT_TYPES} /></Form.Item>
          <Form.Item name="bizDate" label={`${recordName}日期`} rules={[{ required: true, message: `请选择${recordName}日期` }]}><BusinessDatePicker /></Form.Item>
          <Form.Item name="remark" label="备注"><Input placeholder="选填" maxLength={200} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="编辑收支" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
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
            <PlanEntryHint plans={props.plans} categories={props.categories} />
            <Form.Item name="bizDate" label="日期" rules={[{ required: true }]}><BusinessDatePicker /></Form.Item>
            <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入有效金额' }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0.01} /></Form.Item>
            <Form.Item name="paymentType" label={props.direction === 'income' ? '收入方式' : '支出方式'} rules={[{ required: true }]}><Select options={PAYMENT_TYPES} /></Form.Item>
            <Form.Item name="remark" label="备注"><Input maxLength={200} /></Form.Item>
            <Button type="primary" htmlType="submit">保存修改</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

function PlanEntryHint(props: { plans: Array<Record<string, unknown>>; categories: Array<Record<string, unknown>> }) {
  const entry = Form.useWatch('entry')
  const value = String(entry || '')
  if (value.startsWith('category:')) {
    const category = props.categories.find((item) => Number(item.id) === Number(value.slice(9)))
    const meta = expenseSettingMeta(category?.remark)
    if (!category || !meta.isRecurring) return null
    return (
      <p>
        周期项目 · {meta.cycleMonths > 0 ? `每${meta.cycleMonths}个月支付一次` : '未设置周期'} · 开始日期 {String(meta.startDate || '').slice(0, 10) || '-'}
      </p>
    )
  }
  if (!value.startsWith('plan:')) return null
  const plan = props.plans.find((item) => Number(item.id) === Number(value.slice(5)))
  if (!plan) return null
  const months = Number(plan.cycleMonths || 0)
  const start = String(plan.startDate || '').slice(0, 10) || '-'
  return (
    <p>
      支付周期 {months > 0 ? `每${months}个月支付一次` : '未设置周期'} · 开始日期 {start}
      {String(plan.remark || '').trim() ? ` · 备注 ${String(plan.remark).trim()}` : ''}
    </p>
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

function expenseSettingMeta(remark: unknown): { isRecurring: boolean; cycleMonths: number; startDate: string } {
  const empty = { isRecurring: false, cycleMonths: 0, startDate: '' }
  if (!remark) return empty
  try {
    const parsed = JSON.parse(String(remark)) as { expenseSetting?: { isRecurring?: boolean; cycleMonths?: number; startDate?: string } }
    const meta = parsed?.expenseSetting
    if (!meta) return empty
    return {
      isRecurring: !!meta.isRecurring,
      cycleMonths: Number(meta.cycleMonths || 0),
      startDate: String(meta.startDate || ''),
    }
  } catch {
    return empty
  }
}

function expenseCycleText(row: Record<string, unknown>, field: 'mode' | 'months' | 'start'): string {
  if (!String(row.direction || '').toLowerCase().includes('expense')) return '-'
  const meta = expenseSettingMeta(row.remark)
  if (field === 'mode') return meta.isRecurring ? '是' : '否'
  if (!meta.isRecurring) return '-'
  return field === 'months' ? `${meta.cycleMonths || 0}个月` : (meta.startDate || '-')
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

function financePeriodLabel(mode: string, month: string, startDate: string, endDate: string): string {
  if (mode === 'today') return '今天'
  if (mode === 'this_week') return '本周'
  if (mode === 'custom_range') return `${startDate} 至 ${endDate}`
  if (mode === 'salary_cycle') return `${month} 记薪周期`
  return `${month} 自然月`
}

function monthBounds(month: string): [string, string] {
  const [year, mon] = month.split('-').map(Number)
  const end = new Date(year, mon, 0).getDate()
  return [`${month}-01`, `${month}-${`${end}`.padStart(2, '0')}`]
}

function naturalMonthRangeLabel(month: string, short = false): string {
  const [year, mon] = month.split('-').map(Number)
  const endDay = Number(monthBounds(month)[1].slice(-2))
  return short ? `${mon}月1日—${mon}月${endDay}日` : `${year}年${mon}月1日—${mon}月${endDay}日`
}
