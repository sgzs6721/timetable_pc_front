import { Button, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { clampDecimalInput, money, tell } from './kit'
import type { Person } from './campus-model'

function fixedSalaryTotal(person: Person, items: Array<Record<string, unknown>>, amounts: Array<Record<string, unknown>>): number {
  return items.filter((item) => String(item.itemType) !== 'unit').reduce((sum, item) => {
    const found = amounts.find((amount) => Number(amount.staffId) === person.id && String(amount.salaryItemId) === String(item.id))
    return sum + Number(found?.amount ?? item.defaultValue ?? 0)
  }, 0)
}

function payoutDaysError(values: { itemType?: unknown; fixedPayoutMode?: unknown; fixedPayoutHighDays?: unknown; fixedPayoutLowDays?: unknown }): string {
  if ((values.itemType || 'fixed') === 'unit' || values.fixedPayoutMode !== 'prorate') return ''
  const high = Number(values.fixedPayoutHighDays)
  const low = Number(values.fixedPayoutLowDays)
  if (!high || !low || high < 1 || high > 31 || low < 1 || low > 31) return '请填写1到31的天数'
  if (low > high) return '少于天数不能大于多于天数'
  return ''
}

function PayoutRuleFields() {
  const itemType = Form.useWatch('itemType')
  const mode = Form.useWatch('fixedPayoutMode')
  const high = Number(Form.useWatch('fixedPayoutHighDays') || 0)
  const low = Number(Form.useWatch('fixedPayoutLowDays') || 0)
  if (itemType === 'unit') return null
  return <>
    <Form.Item name="fixedPayoutMode" label="固定工资发放"><Select style={{ width: 140 }} options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按在职天数' }]} /></Form.Item>
    {mode === 'prorate' ? <>
      <p>按入职日期计算本周期在职天数。多于、少于不含等于，介于两者之间（含两端）按天折算。</p>
      <Form.Item name="fixedPayoutHighDays" label="多于多少天"><InputNumber min={1} max={31} /></Form.Item>
      <Form.Item name="fixedPayoutHighAction" label="多于时"><Select style={{ width: 120 }} options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按天折算' }]} /></Form.Item>
      <Form.Item name="fixedPayoutLowDays" label="少于多少天"><InputNumber min={1} max={31} /></Form.Item>
      <Form.Item name="fixedPayoutLowAction" label="少于时"><Select style={{ width: 120 }} options={[{ value: 'none', label: '不发放' }, { value: 'prorate', label: '按天折算' }]} /></Form.Item>
      <p>{low || '-'} 到 {high || '-'} 天（含两端）按天折算</p>
    </> : null}
  </>
}

function cycleDay(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const day = Number(value)
  return Number.isFinite(day) ? day : null
}

function cycleDaysSame(left: { cycleStartDay?: unknown; cycleEndDay?: unknown; payDay?: unknown }, right: Record<string, unknown>) {
  return cycleDay(left.cycleStartDay) === cycleDay(right.cycleStartDay) && cycleDay(left.cycleEndDay) === cycleDay(right.cycleEndDay) && cycleDay(left.payDay) === cycleDay(right.payDay)
}

function salaryAmountSame(left: unknown, right: unknown) {
  const normalize = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : null
  }
  return normalize(left) === normalize(right)
}

function SalaryAmountSaveButton(props: { original: number; saving: boolean }) {
  const amount = Form.useWatch('amount')
  return <Button type="primary" htmlType="submit" disabled={salaryAmountSame(amount, props.original) || props.saving}>{props.saving ? '保存中...' : '保存工资'}</Button>
}

function fixedPayoutSnapshot(items: Array<Record<string, unknown>>): string {
  return JSON.stringify(items.filter((item) => String(item.itemType) !== 'unit').map((item) => ({
    id: item.id,
    mode: item.fixedPayoutMode === 'prorate' ? 'prorate' : 'full',
    highDays: Number(item.fixedPayoutHighDays || 0),
    lowDays: Number(item.fixedPayoutLowDays || 0),
    highAction: item.fixedPayoutHighAction === 'prorate' ? 'prorate' : 'full',
    lowAction: item.fixedPayoutLowAction === 'prorate' ? 'prorate' : 'none',
  })))
}

function CycleSaveButton(props: { cycle: Record<string, unknown>; saving: boolean; payoutDirty: boolean }) {
  const start = Form.useWatch('cycleStartDay')
  const end = Form.useWatch('cycleEndDay')
  const pay = Form.useWatch('payDay')
  const unchanged = cycleDaysSame({ cycleStartDay: start, cycleEndDay: end, payDay: pay }, props.cycle) && !props.payoutDirty
  return <Button type="primary" htmlType="submit" disabled={unchanged || props.saving}>{props.saving ? '保存中...' : '保存周期'}</Button>
}

export function CampusSalary({ campusId }: { campusId: number | null }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [teachers, setTeachers] = useState<Person[]>([])
  const [amounts, setAmounts] = useState<Array<Record<string, unknown>>>([])
  const [cycle, setCycle] = useState<Record<string, unknown>>({})
  const [payoutSaved, setPayoutSaved] = useState('[]')
  const [savingCycle, setSavingCycle] = useState(false)
  const [savingSalary, setSavingSalary] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [itemEdit, setItemEdit] = useState<Record<string, unknown> | null>(null)
  const [amountEdit, setAmountEdit] = useState<{ person: Person; item: Record<string, unknown>; amount: number } | null>(null)
  const [salarySection, setSalarySection] = useState<'items' | 'cycle' | 'list'>('items')
  const [salaryView, setSalaryView] = useState<'staff' | 'summary'>('staff')
  async function load() {
    if (!campusId) return
    const loadedItems = await getJson<Array<Record<string, unknown>>>('/salary-item/list', { campusId }).catch(() => [])
    setItems(loadedItems)
    setPayoutSaved(fixedPayoutSnapshot(loadedItems))
    setTeachers(await getJson<Person[]>(`/campus-teacher/campus/${campusId}`).catch(() => []))
    setAmounts(await getJson<Array<Record<string, unknown>>>(`/campus-staff-salary/${campusId}`).catch(() => []))
    setCycle(await getJson<Record<string, unknown>>(`/campus-staff/${campusId}/settings`).catch(() => ({})))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  const configuredCount = teachers.filter((person) => amounts.some((amount) => Number(amount.staffId) === person.id)).length
  const fixedGrandTotal = teachers.reduce((sum, person) => sum + fixedSalaryTotal(person, items, amounts), 0)
  const fixedItems = items.filter((item) => String(item.itemType) !== 'unit')
  const payoutDirty = fixedPayoutSnapshot(items) !== payoutSaved
  function updatePayoutItem(id: unknown, patch: Record<string, unknown>) {
    setItems((current) => current.map((item) => String(item.id) === String(id) ? { ...item, ...patch } : item))
  }
  return <>
    <Tabs
      className="campus-sub-tabs salary-settings-tabs"
      activeKey={salarySection}
      onChange={(key) => setSalarySection(key as 'items' | 'cycle' | 'list')}
      items={[
        {
          key: 'items',
          label: '工资构成',
          children: <section className="work-card service-settings-card">
            <header className="service-list-head">
              <div><h2>工资构成</h2><span>维护校区工资项目，用于工资统计</span></div>
              <Button type="primary" onClick={() => setAddingItem(true)}>新增工资项</Button>
            </header>
            <Table rowKey={(row) => String(row.id || row.itemName)} dataSource={items} pagination={false} locale={{ emptyText: '还没有工资项目' }} columns={[
              { title: '工资项', dataIndex: 'itemName' },
              { title: '类型', dataIndex: 'itemType', render: (value: string) => value === 'unit' ? '课时单价' : '固定工资' },
              { title: '默认金额', dataIndex: 'defaultValue', render: (value: unknown) => money(value) },
              { title: '发放', dataIndex: 'fixedPayoutMode', render: (value: string, row: Record<string, unknown>) => String(row.itemType) === 'unit' ? '按课时计算' : value === 'prorate' ? '按在职天数' : '全额发放' },
              { title: '操作', render: (_: unknown, row: Record<string, unknown>) => <Space><Button type="link" onClick={() => setItemEdit(row)}>编辑</Button><Button type="link" danger onClick={async () => {
                if (items.length <= 1) { message.warning('至少保留一项'); return }
                try { await delJson(`/salary-item/${row.id}`, { campusId }); message.success('已删除'); await load() } catch (error) { message.error(tell(error, '删除失败')) }
              }}>删除</Button></Space> },
            ]} />
          </section>,
        },
        {
          key: 'cycle',
          label: '记薪周期',
          children: <section className="work-card salary-cycle-card">
            <header className="salary-panel-head">
              <div><h2>记薪周期设置</h2><span>设置工资统计范围和固定发放日期</span></div>
            </header>
            <Form key={String(cycle.cycleStartDay || '')} className="salary-cycle-form" layout="vertical" initialValues={cycle} onFinish={async (values: { cycleStartDay?: number; cycleEndDay?: number; payDay?: number }) => {
              if ((cycleDaysSame(values, cycle) && !payoutDirty) || savingCycle) return
              const invalidItem = fixedItems.find((item) => payoutDaysError(item))
              if (invalidItem) {
                message.warning(`${String(invalidItem.itemName || '固定工资项')}：${payoutDaysError(invalidItem)}`)
                return
              }
              setSavingCycle(true)
              try {
                if (!cycleDaysSame(values, cycle)) await postJson(`/campus-staff/${campusId}/settings`, values)
                if (payoutDirty) await Promise.all(fixedItems.map((item) => putJson('/salary-item', { ...item, campusId })))
                message.success('记薪周期与发放规则已保存')
                await load()
              }
              catch (error) { message.error(tell(error, '保存失败')) }
              finally { setSavingCycle(false) }
            }}>
              <Form.Item name="cycleStartDay" label="记薪开始日"><InputNumber style={{ width: '100%' }} min={1} max={31} addonAfter="日" /></Form.Item>
              <Form.Item name="cycleEndDay" label="记薪结束日"><InputNumber style={{ width: '100%' }} min={1} max={31} addonAfter="日" /></Form.Item>
              <Form.Item name="payDay" label="工资发放日"><InputNumber style={{ width: '100%' }} min={1} max={31} addonAfter="日" /></Form.Item>
              <div className="salary-payout-rules">
                <div className="salary-payout-rules-head">
                  <strong>固定工资发放</strong>
                  <span>按入职日期计算本周期在职天数。多于、少于不含等于，介于两者之间（含两端）按天折算。</span>
                </div>
                {fixedItems.length ? <div className="salary-payout-rule-grid">
                  {fixedItems.map((item) => {
                    const prorate = item.fixedPayoutMode === 'prorate'
                    return <div className="salary-payout-rule-card" key={String(item.id)}>
                      <strong>{String(item.itemName || '未命名工资项')}</strong>
                      <Segmented
                        block
                        value={prorate ? 'prorate' : 'full'}
                        options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按在职天数' }]}
                        onChange={(value) => updatePayoutItem(item.id, { fixedPayoutMode: value })}
                      />
                      {prorate ? <div className="salary-payout-thresholds">
                        <div className="salary-payout-threshold-row">
                          <span>多于</span>
                          <InputNumber min={1} max={31} value={Number(item.fixedPayoutHighDays || 0) || null} onChange={(value) => updatePayoutItem(item.id, { fixedPayoutHighDays: value })} />
                          <span>天</span>
                          <Select value={item.fixedPayoutHighAction === 'prorate' ? 'prorate' : 'full'} onChange={(value) => updatePayoutItem(item.id, { fixedPayoutHighAction: value })} options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按天折算' }]} />
                        </div>
                        <div className="salary-payout-threshold-row">
                          <span>少于</span>
                          <InputNumber min={1} max={31} value={Number(item.fixedPayoutLowDays || 0) || null} onChange={(value) => updatePayoutItem(item.id, { fixedPayoutLowDays: value })} />
                          <span>天</span>
                          <Select value={item.fixedPayoutLowAction === 'prorate' ? 'prorate' : 'none'} onChange={(value) => updatePayoutItem(item.id, { fixedPayoutLowAction: value })} options={[{ value: 'none', label: '不发放' }, { value: 'prorate', label: '按天折算' }]} />
                        </div>
                        <small>{Number(item.fixedPayoutLowDays || 0) || '-'} 到 {Number(item.fixedPayoutHighDays || 0) || '-'} 天（含两端）按天折算</small>
                      </div> : null}
                    </div>
                  })}
                </div> : <div className="salary-payout-empty">添加固定工资项后，可在这里设置发放规则</div>}
              </div>
              <div className="salary-cycle-action"><CycleSaveButton cycle={cycle} saving={savingCycle} payoutDirty={payoutDirty} /></div>
            </Form>
          </section>,
        },
        {
          key: 'list',
          label: '工资列表',
          children: <section className="work-card salary-list-card">
            <div className="salary-overview-grid">
              <div><strong>{teachers.length}</strong><span>老师人数</span></div>
              <div className={configuredCount < teachers.length ? 'is-warning' : 'is-ready'}><strong>{configuredCount}</strong><span>已完成配置</span></div>
              <div><strong>{money(fixedGrandTotal)}</strong><span>固定工资合计</span></div>
            </div>
            <div className="salary-list-toolbar">
              <div className="salary-view-switch">
                <Button type={salaryView === 'staff' ? 'primary' : 'text'} onClick={() => setSalaryView('staff')}>人员工资</Button>
                <Button type={salaryView === 'summary' ? 'primary' : 'text'} onClick={() => setSalaryView('summary')}>工资汇总</Button>
              </div>
              <span>{salaryView === 'summary' ? '合计仅统计固定工资项目，课时单价不计入合计' : '点击金额可为老师配置对应工资项'}</span>
            </div>
            <Table rowKey="id" dataSource={teachers} pagination={false} locale={{ emptyText: '还没有老师，请先到人员设置添加' }} summary={() => salaryView === 'summary' ? <Table.Summary.Row>
              <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
              {items.map((item, index) => {
                const unit = String(item.itemType) === 'unit'
                const total = teachers.reduce((sum, person) => sum + Number(amounts.find((amount) => Number(amount.staffId) === person.id && String(amount.salaryItemId) === String(item.id))?.amount ?? (unit ? 0 : item.defaultValue) ?? 0), 0)
                return <Table.Summary.Cell key={String(item.id)} index={index + 1}>{unit ? '-' : money(total)}</Table.Summary.Cell>
              })}
              <Table.Summary.Cell index={items.length + 1}>{money(fixedGrandTotal)}</Table.Summary.Cell>
            </Table.Summary.Row> : undefined} columns={[
              { title: '老师', render: (_: unknown, row: Person) => row.displayName || row.nickname },
              ...items.map((item) => ({ title: String(item.itemName), render: (_: unknown, row: Person) => {
                const found = amounts.find((amount) => Number(amount.staffId) === row.id && String(amount.salaryItemId) === String(item.id))
                const value = money(found?.amount ?? item.defaultValue)
                if (salaryView === 'summary') return String(item.itemType) === 'unit' ? (found ? value : '-') : value
                return <Button type="link" onClick={() => setAmountEdit({ person: row, item, amount: Number(found?.amount ?? item.defaultValue ?? 0) })}>{value}</Button>
              } })),
              ...(salaryView === 'summary' ? [{ title: '固定合计', render: (_: unknown, row: Person) => money(fixedSalaryTotal(row, items, amounts)) }] : []),
            ]} />
          </section>,
        },
      ]}
    />
    <Modal title="新增工资项" open={addingItem} onCancel={() => setAddingItem(false)} footer={null} destroyOnHidden>
      <Form layout="vertical" initialValues={{ itemType: 'fixed', fixedPayoutMode: 'full', fixedPayoutHighAction: 'full', fixedPayoutLowAction: 'none' }} onFinish={async (values: { itemName: string; defaultValue?: number; itemType?: string; fixedPayoutMode?: string; fixedPayoutHighDays?: number; fixedPayoutLowDays?: number; fixedPayoutHighAction?: string; fixedPayoutLowAction?: string }) => {
        const name = String(values.itemName || '').trim()
        if (!name) { message.warning('请输入工资项名称'); return }
        if (Array.from(name).length > 6) { message.warning('工资项名称最多6个字'); return }
        if (items.some((item) => String(item.itemName) === name)) { message.warning('工资项名称不能重复'); return }
        const ruleError = payoutDaysError(values)
        if (ruleError) { message.warning(ruleError); return }
        const unit = values.itemType === 'unit'
        const prorate = !unit && values.fixedPayoutMode === 'prorate'
        try {
          await postJson('/salary-item', { ...values, itemName: name, campusId, itemType: values.itemType || 'fixed', fixedPayoutMode: unit ? 'full' : (values.fixedPayoutMode || 'full'), fixedPayoutHighDays: prorate ? values.fixedPayoutHighDays : undefined, fixedPayoutLowDays: prorate ? values.fixedPayoutLowDays : undefined, fixedPayoutHighAction: prorate ? (values.fixedPayoutHighAction || 'full') : undefined, fixedPayoutLowAction: prorate ? (values.fixedPayoutLowAction || 'none') : undefined })
          message.success('保存成功'); setAddingItem(false); await load()
        } catch (error) { message.error(tell(error, '保存失败')) }
      }}>
        <Form.Item name="itemName" label="工资项名称" rules={[{ required: true, message: '请输入工资项名称' }]}><Input placeholder="最多 6 个字" maxLength={6} /></Form.Item>
        <Form.Item name="itemType" label="工资类型"><Select options={[{ value: 'fixed', label: '固定工资' }, { value: 'unit', label: '课时单价' }]} /></Form.Item>
        <Form.Item name="defaultValue" label="默认金额" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} placeholder="请输入默认金额" min={0} /></Form.Item>
        <PayoutRuleFields />
        <div className="staff-form-actions"><Button onClick={() => setAddingItem(false)}>取消</Button><Button type="primary" htmlType="submit">确认新增</Button></div>
      </Form>
    </Modal>
    <Modal title={amountEdit ? `${amountEdit.person.displayName || amountEdit.person.nickname} · ${String(amountEdit.item.itemName)}` : '工资金额'} open={!!amountEdit} onCancel={() => setAmountEdit(null)} footer={null} destroyOnHidden>
      {amountEdit ? <Form layout="vertical" initialValues={{ amount: amountEdit.amount }} onFinish={async (values: { amount: number }) => {
        if (savingSalary || salaryAmountSame(values.amount, amountEdit.amount)) return
        const salaries = items.map((entry) => {
          const current = amounts.find((amount) => Number(amount.staffId) === amountEdit.person.id && String(amount.salaryItemId) === String(entry.id))
          return { staffId: amountEdit.person.id, salaryItemId: entry.id, salaryItemName: entry.itemName, amount: String(entry.id) === String(amountEdit.item.id) ? Number(values.amount) : Number(current?.amount ?? entry.defaultValue ?? 0) }
        })
        setSavingSalary(true)
        try { await postJson(`/campus-staff-salary/${campusId}`, { staffIds: [amountEdit.person.id], salaries }); message.success('工资保存成功'); setAmountEdit(null); await load() }
        catch (error) { message.error(tell(error, '保存失败')) }
        finally { setSavingSalary(false) }
      }}>
        <Form.Item name="amount" label="金额" rules={[{ required: true }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <SalaryAmountSaveButton original={amountEdit.amount} saving={savingSalary} />
      </Form> : null}
    </Modal>
    <Modal title="编辑工资项" open={!!itemEdit} onCancel={() => setItemEdit(null)} footer={null} destroyOnHidden>
      {itemEdit ? <Form layout="vertical" initialValues={itemEdit} onFinish={async (values: { itemName?: string; itemType?: string; fixedPayoutMode?: string; fixedPayoutHighDays?: number; fixedPayoutLowDays?: number; fixedPayoutHighAction?: string; fixedPayoutLowAction?: string; defaultValue?: number }) => {
        const name = String(values.itemName || '').trim()
        if (!name) { message.warning('请输入工资项名称'); return }
        if (Array.from(name).length > 6) { message.warning('工资项名称最多6个字'); return }
        if (items.some((item) => item !== itemEdit && String(item.itemName) === name && String(item.id) !== String(itemEdit.id))) { message.warning('工资项名称不能重复'); return }
        const ruleError = payoutDaysError(values)
        if (ruleError) { message.warning(ruleError); return }
        try { await putJson('/salary-item', { ...itemEdit, ...values, itemName: name, campusId }); message.success('保存成功'); setItemEdit(null); await load() }
        catch (error) { message.error(tell(error, '保存失败')) }
      }}>
        <Form.Item name="itemName" label="名称" rules={[{ required: true, message: '请输入工资项名称' }]}><Input maxLength={6} /></Form.Item>
        <Form.Item name="itemType" label="类型"><Select options={[{ value: 'fixed', label: '固定' }, { value: 'unit', label: '课时单价' }]} /></Form.Item>
        <Form.Item name="defaultValue" label="默认金额" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <PayoutRuleFields /><Button type="primary" htmlType="submit">保存</Button>
      </Form> : null}
    </Modal>
  </>
}
