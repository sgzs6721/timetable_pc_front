import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedCampus, PageHead, money, todayIso, tell, useShell } from './kit'

export function DailyPage() {
  const shell = useShell()
  const campusId = shell.campusId
  const [rules, setRules] = useState('')
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [teachers, setTeachers] = useState<Array<{ id: number; displayName?: string; nickname?: string; status?: number }>>([])
  const [recordForm] = Form.useForm()
  const [itemEdit, setItemEdit] = useState<Record<string, unknown> | null>(null)
  const [recordEdit, setRecordEdit] = useState<Record<string, unknown> | null>(null)

  async function load() {
    if (!campusId) return
    const settings = await getJson<{ dailyRulesText?: string }>(`/campus-staff/${campusId}/settings`)
    setRules(strip(settings?.dailyRulesText || ''))
    setItems(await getJson(`/campus-staff/${campusId}/reward-penalty-items`))
    setRecords(await getJson('/salary/reward-penalty-records', { campusId }))
    const people = await getJson<Array<{ id: number; displayName?: string; nickname?: string; status?: number }>>(`/campus-teacher/campus/${campusId}`)
    setTeachers((people || []).filter((item) => Number(item.status ?? 1) !== 0))
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '日常管理加载失败')))
  }, [campusId])

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="日常管理" extra="规章制度和奖惩记录都按当前校区保存。" />
      <section className="work-card">
        <h2>规章制度</h2>
        {rules ? null : <p>尚未配置规章制度</p>}
        <Input.TextArea rows={6} value={rules} onChange={(event) => setRules(event.target.value)} />
        <Button style={{ marginTop: 8 }} type="primary" onClick={async () => {
          try {
            const blocks = rules.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean)
            const html = blocks.map((item) => `<p>${item.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char))}</p>`).join('')
            await postJson(`/campus-staff/${campusId}/settings`, { dailyRulesText: html })
            message.success('制度已保存')
          } catch (error) {
            message.error(tell(error, '保存失败'))
          }
        }}>保存</Button>
      </section>
      <section className="work-card">
        <h2>奖惩项</h2>
        <Form layout="inline" onFinish={async (values: { itemName: string; itemType: string; defaultAmount?: number; description?: string }) => {
          const error = itemError(values, items)
          if (error) {
            message.warning(error)
            return
          }
          try {
            await postJson(`/campus-staff/${campusId}/reward-penalty-items`, { ...values, itemName: values.itemName.trim(), enabled: 1 })
            message.success('奖惩项已添加')
            await load()
          } catch (error) {
            message.error(tell(error, '添加失败'))
          }
        }}>
          <Form.Item name="itemName" rules={[{ required: true, message: '请输入奖惩项名称' }]}><Input placeholder="名称" maxLength={8} /></Form.Item>
          <Form.Item name="itemType" initialValue="reward"><Select options={[{ value: 'reward', label: '奖励' }, { value: 'penalty', label: '惩罚' }]} /></Form.Item>
          <Form.Item name="defaultAmount"><InputNumber placeholder="默认金额" min={0.01} max={999999.99} /></Form.Item>
          <Form.Item name="description"><Input placeholder="说明" /></Form.Item>
          <Button htmlType="submit">新增</Button>
        </Form>
        {!items.length ? <p>当前校区还没有奖惩项。</p> : null}
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'itemName' },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => row.itemType === 'penalty' ? '惩罚' : '奖励' },
            { title: '默认金额', dataIndex: 'defaultAmount' },
            { title: '启用', render: (_: unknown, row: Record<string, unknown>) => Number(row.enabled) === 0 ? '停用' : '启用' },
            {
              title: '操作',
              render: (_: unknown, row: Record<string, unknown>) => (
                <SpaceButtons
                  deleteTitle="确认删除"
                  deleteText={`确定删除“${String(row.itemName || '该奖惩项')}”吗？`}
                  onEdit={() => setItemEdit(row)}
                  onDelete={async () => {
                    await delJson(`/campus-staff/${campusId}/reward-penalty-items/${row.id}`)
                    message.success('奖惩项已删除')
                    await load()
                  }}
                />
              ),
            },
          ]}
        />
      </section>
      <section className="work-card">
        <h2>奖惩记录</h2>
        <Form form={recordForm} layout="inline" onFinish={async (values: { staffId?: number; itemId?: number; occurDate?: string; actualAmount?: number; remark?: string }) => {
          const enabled = items.filter((item) => Number(item.enabled) !== 0)
          if (!teachers.length) {
            message.warning('当前校区暂无在职老师')
            return
          }
          if (!enabled.length) {
            message.warning('请先在校区其他设置中配置奖惩项')
            return
          }
          if (!values.staffId) {
            message.warning('请选择老师')
            return
          }
          if (!values.itemId) {
            message.warning('请选择奖惩项')
            return
          }
          if (!values.occurDate) {
            message.warning('请选择发生日期')
            return
          }
          const error = amountError(values.actualAmount)
          if (error) {
            message.warning(error)
            return
          }
          try {
            const saved = await postJson<{ salaryMonth?: string }>('/salary/reward-penalty-records', { ...values, campusId, remark: String(values.remark || '').trim() })
            message.success(saved?.salaryMonth ? `已归属 ${saved.salaryMonth}` : '保存成功')
            recordForm.resetFields()
            await load()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          }
        }}>
          <Form.Item name="staffId" rules={[{ required: true, message: '请选择老师' }]}><Select style={{ width: 140 }} placeholder="老师" options={teachers.map((item) => ({ value: item.id, label: item.displayName || item.nickname }))} /></Form.Item>
          <Form.Item name="itemId" rules={[{ required: true, message: '请选择奖惩项' }]}>
            <Select style={{ width: 140 }} placeholder="奖惩项" options={items.filter((item) => Number(item.enabled) !== 0).map((item) => ({ value: item.id, label: String(item.itemName) }))} onChange={(id) => {
              const item = items.find((entry) => entry.id === id)
              recordForm.setFieldsValue({ actualAmount: Number(item?.defaultAmount || 0) || undefined })
            }} />
          </Form.Item>
          <Form.Item name="occurDate" initialValue={todayIso()}><Input type="date" /></Form.Item>
          <Form.Item name="actualAmount" rules={[{ required: true, message: '请输入正确金额' }]}><InputNumber placeholder="实际金额" min={0.01} max={999999.99} /></Form.Item>
          <Form.Item name="remark"><Input placeholder="备注" /></Form.Item>
          <Button htmlType="submit">新增记录</Button>
        </Form>
        {!records.length ? <p>当前校区还没有奖惩记录。</p> : null}
        <Table
          rowKey="id"
          dataSource={records}
          pagination={false}
          columns={[
            { title: '老师', dataIndex: 'staffName' },
            { title: '项目', dataIndex: 'itemName' },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => row.itemType === 'penalty' ? '惩罚' : '奖励' },
            { title: '日期', dataIndex: 'occurDate' },
            { title: '归属', dataIndex: 'salaryMonth' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.actualAmount) },
            { title: '备注', dataIndex: 'remark' },
            {
              title: '操作',
              render: (_: unknown, row: Record<string, unknown>) => (
                <SpaceButtons
                  deleteTitle="删除奖惩记录"
                  deleteText="确定删除这条奖惩记录吗？"
                  onEdit={() => setRecordEdit(row)}
                  onDelete={async () => {
                    await delJson(`/salary/reward-penalty-records/${row.id}`)
                    message.success('删除成功')
                    await load()
                  }}
                />
              ),
            },
          ]}
        />
      </section>
      <Modal title="编辑奖惩项" open={!!itemEdit} onCancel={() => setItemEdit(null)} footer={null} destroyOnClose>
        {itemEdit ? (
          <Form
            layout="vertical"
            initialValues={itemEdit}
            onFinish={async (values: { itemName: string; itemType: string; defaultAmount?: number; description?: string; enabled?: number }) => {
              const error = itemError(values, items, itemEdit)
              if (error) {
                message.warning(error)
                return
              }
              try {
                await putJson(`/campus-staff/${campusId}/reward-penalty-items/${itemEdit.id}`, { ...itemEdit, ...values, itemName: values.itemName.trim() })
                message.success('奖惩项已保存')
                setItemEdit(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="itemName" label="名称" rules={[{ required: true, message: '请输入奖惩项名称' }]}><Input maxLength={8} /></Form.Item>
            <Form.Item name="itemType" label="类型"><Select options={[{ value: 'reward', label: '奖励' }, { value: 'penalty', label: '惩罚' }]} /></Form.Item>
            <Form.Item name="defaultAmount" label="默认金额"><InputNumber style={{ width: '100%' }} min={0.01} max={999999.99} /></Form.Item>
            <Form.Item name="description" label="说明"><Input /></Form.Item>
            <Form.Item name="enabled" label="启用"><Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Modal title="编辑奖惩记录" open={!!recordEdit} onCancel={() => setRecordEdit(null)} footer={null} destroyOnClose>
        {recordEdit ? (
          <Form
            layout="vertical"
            initialValues={recordEdit}
            onFinish={async (values: { actualAmount: number; occurDate?: string; remark?: string }) => {
              if (!values.occurDate) {
                message.warning('请选择发生日期')
                return
              }
              const error = amountError(values.actualAmount)
              if (error) {
                message.warning(error)
                return
              }
              try {
                const saved = await putJson<{ salaryMonth?: string }>(`/salary/reward-penalty-records/${recordEdit.id}`, { ...recordEdit, ...values, remark: String(values.remark || '').trim() })
                message.success(saved?.salaryMonth ? `已归属 ${saved.salaryMonth}` : '保存成功')
                setRecordEdit(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="occurDate" label="日期"><Input type="date" /></Form.Item>
            <Form.Item name="actualAmount" label="实际金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="remark" label="备注"><Input /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </NeedCampus>
  )
}

function amountError(value: unknown) {
  const amount = Number(value)
  if (value == null || value === '' || !Number.isFinite(amount) || amount <= 0) return '请输入正确金额'
  if (amount > 999999.99) return '金额不能超过999999.99'
  return ''
}

function itemError(values: { itemName?: string; defaultAmount?: number }, items: Array<Record<string, unknown>>, current?: Record<string, unknown> | null) {
  const name = String(values.itemName || '').trim()
  if (!name) return '请输入奖惩项名称'
  if (Array.from(name).length > 8) return '名称最多8个字'
  if (items.some((item) => String(item.itemName || '').trim() === name && item !== current && String(item.id) !== String(current?.id))) return '奖惩项名称不能重复'
  return amountError(values.defaultAmount)
}

function SpaceButtons(props: { onEdit: () => void; onDelete: () => Promise<void>; deleteTitle?: string; deleteText?: string }) {
  return (
    <>
      <Button type="link" onClick={props.onEdit}>编辑</Button>
      <Popconfirm title={props.deleteTitle || '确认删除'} description={props.deleteText} onConfirm={() => props.onDelete().catch((error) => message.error(tell(error, '删除失败')))}>
        <Button type="link" danger>删除</Button>
      </Popconfirm>
    </>
  )
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}
