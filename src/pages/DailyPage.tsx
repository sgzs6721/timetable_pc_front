import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedCampus, PageHead, clampDecimalInput, money, todayIso, tell, useShell } from './kit'

export function DailyPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const campusId = shell.campusId
  const [rules, setRules] = useState('')
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [teachers, setTeachers] = useState<Array<{ id: number; displayName?: string; nickname?: string; status?: number }>>([])
  const [recordForm] = Form.useForm()
  const [recordCreating, setRecordCreating] = useState(false)
  const [recordSaving, setRecordSaving] = useState(false)
  const [recordEdit, setRecordEdit] = useState<Record<string, unknown> | null>(null)

  async function load() {
    if (!campusId) return
    try {
      const settings = await getJson<{ dailyRulesText?: string }>(`/campus-staff/${campusId}/settings`)
      setRules(rulesPlain(settings?.dailyRulesText || ''))
    } catch (error) {
      message.warning(tell(error, '制度加载失败'))
    }
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
      <Tabs items={[
        { key: 'records', label: '奖惩记录', children: (
      <section className="work-card service-settings-card">
        <header className="service-list-head">
          <div><h2>奖惩记录</h2><span>按发生日期自动归属到对应记薪周期</span></div>
          <Button type="primary" onClick={() => {
            if (!teachers.length) { message.warning('当前校区暂无在职老师'); return }
            if (!items.some((item) => Number(item.enabled) !== 0)) { message.warning('请先在校务设置中配置奖惩项'); return }
            recordForm.resetFields()
            recordForm.setFieldValue('occurDate', todayIso())
            setRecordCreating(true)
          }}>新增记录</Button>
        </header>
        <Table
          rowKey="id"
          dataSource={records}
          pagination={false}
          locale={{ emptyText: '当前校区暂无奖惩记录' }}
          columns={[
            { title: '老师', dataIndex: 'staffName' },
            { title: '项目', dataIndex: 'itemName' },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => row.itemType === 'penalty' ? '处罚' : '奖励' },
            { title: '日期', dataIndex: 'occurDate' },
            { title: '归属', dataIndex: 'salaryMonth' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => signedMoney(row.actualAmount) },
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
        ) },
        { key: 'rules', label: '规章制度', children: (
      <section className="work-card">
        <h2>规章制度</h2>
        <p>由校区管理中的其他设置统一维护，这里仅展示当前校区制度。</p>
        {rules ? <p style={{ whiteSpace: 'pre-wrap' }}>{rules}</p> : (
          <>
            <p>尚未配置规章制度</p>
            <p>请前往校区管理的校务设置补充制度说明。</p>
          </>
        )}
        <Button onClick={() => navigate('/campus?tab=affairs')}>去校务设置</Button>
      </section>
        ) },
      ]} />
      <Modal title="新增奖惩记录" open={recordCreating} onCancel={() => { if (!recordSaving) setRecordCreating(false) }} footer={null} destroyOnHidden>
        <Form form={recordForm} layout="vertical" initialValues={{ occurDate: todayIso() }} onFinish={async (values: { staffId?: number; itemId?: number; occurDate?: string; actualAmount?: number; remark?: string }) => {
          if (recordSaving) return
          const enabled = items.filter((item) => Number(item.enabled) !== 0)
          if (!teachers.length) { message.warning('当前校区暂无在职老师'); return }
          if (!enabled.length) { message.warning('请先在校务设置中配置奖惩项'); return }
          if (!values.staffId) { message.warning('请选择老师'); return }
          if (!values.itemId) { message.warning('请选择奖惩项'); return }
          if (!values.occurDate) { message.warning('请选择发生日期'); return }
          const error = amountError(values.actualAmount)
          if (error) { message.warning(error); return }
          setRecordSaving(true)
          try {
            const saved = await postJson<{ salaryMonth?: string }>('/salary/reward-penalty-records', { ...values, campusId, remark: String(values.remark || '').trim() })
            message.success(saved?.salaryMonth ? `已归属 ${saved.salaryMonth}` : '保存成功')
            setRecordCreating(false)
            recordForm.resetFields()
            await load()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          } finally {
            setRecordSaving(false)
          }
        }}>
          <Form.Item name="staffId" label="老师" rules={[{ required: true, message: '请选择老师' }]}><Select placeholder="请选择老师" options={teachers.map((item) => ({ value: item.id, label: item.displayName || item.nickname }))} /></Form.Item>
          <Form.Item name="itemId" label="奖惩项" rules={[{ required: true, message: '请选择奖惩项' }]}>
            <Select placeholder="请选择奖惩项" options={items.filter((item) => Number(item.enabled) !== 0).map((item) => ({ value: item.id, label: String(item.itemName) }))} onChange={(id) => {
              const item = items.find((entry) => entry.id === id)
              recordForm.setFieldsValue({ actualAmount: Number(item?.defaultAmount || 0) || undefined })
            }} />
          </Form.Item>
          <Form.Item name="occurDate" label="发生日期" rules={[{ required: true, message: '请选择发生日期' }]}><Input type="date" /></Form.Item>
          <Form.Item name="actualAmount" label="实际金额" rules={[{ required: true, message: '请输入正确金额' }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} placeholder="请输入实际金额" min={0.01} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea placeholder="选填，用于说明本次奖惩原因" autoSize={{ minRows: 3, maxRows: 5 }} maxLength={120} showCount /></Form.Item>
          <div className="staff-form-actions">
            <Button disabled={recordSaving} onClick={() => setRecordCreating(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={recordSaving}>确认新增</Button>
          </div>
        </Form>
      </Modal>
      <Modal title="编辑奖惩记录" open={!!recordEdit} onCancel={() => setRecordEdit(null)} footer={null} destroyOnHidden>
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
            <Form.Item name="actualAmount" label="实际金额" rules={[{ required: true }]} getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0.01} /></Form.Item>
            <Form.Item name="remark" label="备注"><Input maxLength={120} placeholder="选填，用于说明本次奖惩原因" /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </NeedCampus>
  )
}

function signedMoney(value: unknown): string {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return money(value)
  return `${amount >= 0 ? '+' : '-'}${money(Math.abs(amount))}`
}

function amountError(value: unknown) {
  const amount = Number(value)
  if (value == null || value === '' || !Number.isFinite(amount) || amount <= 0) return '请输入正确金额'
  if (amount > 999999.99) return '金额不能超过999999.99'
  return ''
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

function rulesPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
