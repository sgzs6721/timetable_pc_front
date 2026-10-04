import { EditOutlined, HistoryOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Space, Spin, Tag, Timeline, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { BusinessDateTimePicker } from '../components/BusinessDatePicker'
import { tell } from './kit'
import { LeadEditor } from './leads-editor'
import { FOLLOW_CHANNELS, LEAD_STATUSES, isLeadClosed, leadTime, statusInfo, type Lead, type LeadEvent, type LeadPage, type LeadSalesperson } from './leads-model'

function FollowEditor({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const submitting = useRef(false)
  const status = Form.useWatch('status', form) || lead.status
  async function save() {
    if (submitting.current) return
    submitting.current = true
    try {
      const values = await form.validateFields()
      setSaving(true); setSaveError('')
      const next = isLeadClosed(values.status) || !values.nextFollowAt ? null : `${values.nextFollowAt.slice(0, 16)}:00`
      const result = await postJson<Lead>(`/leads/${lead.id}/follow-ups`, { ...values, nextFollowAt: next, version: lead.version })
      message.success('跟进已记录')
      onSaved(result)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'errorFields' in error)) setSaveError(tell(error, '保存失败，请重试'))
    } finally { submitting.current = false; setSaving(false) }
  }
  return <Modal open title={`记录跟进 · ${lead.name}`} width={560} onCancel={onClose} onOk={save} okText="保存跟进" cancelText="取消"
    maskClosable={false} keyboard={!saving} closable={!saving} cancelButtonProps={{ disabled: saving }} confirmLoading={saving}>
    <Form layout="vertical" form={form} onValuesChange={() => setSaveError('')} initialValues={{ status: lead.status === 'NEW' ? 'CONTACTED' : lead.status, channel: 'PHONE', nextFollowAt: '' }}>
      <div className="lead-form-grid">
        <Form.Item name="status" label="客户状态" rules={[{ required: true }]}><Select options={LEAD_STATUSES} /></Form.Item>
        <Form.Item name="channel" label="跟进方式" rules={[{ required: true }]}><Select options={FOLLOW_CHANNELS} /></Form.Item>
      </div>
      <Form.Item name="content" label="本次跟进内容" rules={[{ required: true, whitespace: true, message: '请填写沟通情况和结果' }]}><Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} maxLength={1000} showCount placeholder="沟通了什么？客户反馈如何？下一步准备做什么？" /></Form.Item>
      {!isLeadClosed(status) ? <Form.Item name="nextFollowAt" label="下次跟进时间" rules={[{ validator: (_, value) => !value || new Date(`${value.slice(0, 16)}:00+08:00`).getTime() > Date.now() ? Promise.resolve() : Promise.reject(new Error('下次跟进时间必须晚于当前时间')) }]} extra="选填；留空表示暂不安排下一次跟进。">
        <BusinessDateTimePicker placeholder="选择下一次联系时间" />
      </Form.Item> : <Alert type="info" showIcon message="保存后将结束当前跟进计划；后续仍可重新记录跟进。" />}
    </Form>
    {saveError && <Alert type="error" showIcon message={saveError} />}
  </Modal>
}

export function LeadDetail({ id, salespeople, onClose, onChanged }: {
  id: number; salespeople: LeadSalesperson[]; onClose: () => void; onChanged: () => void
}) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [events, setEvents] = useState<LeadEvent[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<'profile' | 'follow' | null>(null)
  const sequence = useRef(0)
  const morePending = useRef(false)
  const load = useCallback(async () => {
    const token = ++sequence.current
    setLoading(true); setError('')
    try {
      const [record, history] = await Promise.all([getJson<Lead>(`/leads/${id}`), getJson<LeadPage<LeadEvent>>(`/leads/${id}/events`)])
      if (sequence.current !== token) return
      setLead(record); setEvents(history.records); setTotal(history.total); setPage(1)
    } catch (reason) { if (sequence.current === token) setError(tell(reason, '详情加载失败')) }
    finally { if (sequence.current === token) setLoading(false) }
  }, [id])
  useEffect(() => { void load(); return () => { sequence.current++ } }, [load])
  async function more() {
    if (morePending.current || loading) return
    morePending.current = true
    const token = sequence.current
    setMoreLoading(true)
    try {
      const result = await getJson<LeadPage<LeadEvent>>(`/leads/${id}/events`, { page: page + 1 })
      if (token !== sequence.current) return
      setEvents((items) => [...items, ...result.records]); setPage(page + 1); setTotal(result.total)
    } catch (reason) { message.error(tell(reason, '记录加载失败')) }
    finally { morePending.current = false; setMoreLoading(false) }
  }
  function saved(record: Lead) { setLead(record); setEditor(null); void load(); onChanged() }
  return <Drawer open width={680} title="客源详情" onClose={onClose} className="lead-drawer"
    extra={<Button icon={<ReloadOutlined />} onClick={load} disabled={loading}>刷新</Button>}>
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={load}>重试</Button>} /> : loading ? <div className="lead-loading"><Spin /></div> : lead && <>
      <div className="lead-detail-head"><div className="lead-avatar">{lead.name.slice(0, 1)}</div><div><h2>{lead.name} <Tag color={statusInfo(lead.status).color}>{statusInfo(lead.status).label}</Tag></h2><span>{lead.phone} · {lead.contactName || '未填写联系人'}</span></div></div>
      <div className="lead-detail-actions"><Button icon={<EditOutlined />} onClick={() => setEditor('profile')}>编辑资料 / 分配销售</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor('follow')} disabled={!lead.ownerId}>记录跟进</Button></div>
      {!lead.ownerId && <Alert className="lead-form-note" type="info" showIcon message="先分配销售负责人，即可开始记录跟进。" />}
      <Descriptions title="客源档案" column={2} size="small">
        <Descriptions.Item label="客源渠道">{lead.source}</Descriptions.Item><Descriptions.Item label="销售负责人">{lead.ownerName || '待分配'}</Descriptions.Item>
        <Descriptions.Item label="微信号">{lead.wechat || '—'}</Descriptions.Item><Descriptions.Item label="性别 / 年龄">{lead.gender === 'MALE' ? '男' : lead.gender === 'FEMALE' ? '女' : '未填写'} / {lead.age == null ? '未填写' : `${lead.age}岁`}</Descriptions.Item>
        <Descriptions.Item label="录入时间">{leadTime(lead.createTime)}</Descriptions.Item><Descriptions.Item label="下次跟进">{leadTime(lead.nextFollowAt)}</Descriptions.Item>
        <Descriptions.Item label="来源说明" span={2}>{lead.sourceDetail || '—'}</Descriptions.Item><Descriptions.Item label="需求备注" span={2}><span className="lead-prewrap">{lead.remark || '—'}</span></Descriptions.Item>
      </Descriptions>
      <div className="lead-section-title"><h3><HistoryOutlined /> 跟进时间线</h3><span>已跟进 {lead.followCount} 次 · {total} 条记录</span></div>
      {!events.length ? <Empty description="暂无记录" /> : <Timeline items={events.map((event) => ({ color: event.type === 'FOLLOW' ? 'blue' : 'gray', children: <div className="lead-event">
        <div className="lead-event-head"><strong>{event.type === 'CREATE' ? '录入客源' : event.type === 'UPDATE' ? '更新资料 / 分配' : FOLLOW_CHANNELS.find((item) => item.value === event.channel)?.label || '跟进记录'}</strong><span>{leadTime(event.createTime)}</span></div>
        {event.type === 'FOLLOW' && <Space size={4}>{event.fromStatus !== event.toStatus && <><Tag>{statusInfo(event.fromStatus).label}</Tag><span>→</span></>}<Tag color={statusInfo(event.toStatus).color}>{statusInfo(event.toStatus).label}</Tag></Space>}
        <p className="lead-prewrap">{event.type === 'CREATE' ? event.content.replace(/^录入客源\n/, '') : event.content}</p>
        {event.nextFollowAt && <div className="lead-next">下次跟进：{leadTime(event.nextFollowAt)}</div>}
        <small>{event.operatorName} · 负责人：{event.ownerName || '待分配'}</small>
      </div> }))} />}
      {events.length < total && <Button block loading={moreLoading} onClick={more}>加载更早记录</Button>}
      {editor === 'profile' && <LeadEditor lead={lead} salespeople={salespeople} onClose={() => setEditor(null)} onSaved={saved} />}
      {editor === 'follow' && <FollowEditor lead={lead} onClose={() => setEditor(null)} onSaved={saved} />}
    </>}
  </Drawer>
}
