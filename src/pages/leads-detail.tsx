import { DownOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Spin, Tag, Timeline, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { BusinessDateTimePicker } from '../components/BusinessDatePicker'
import { PhoneCopyButton, copyPlainText, tell } from './kit'
import { LeadEditor } from './leads-editor'
import { FOLLOW_CHANNELS, LEAD_STATUSES, isLeadClosed, isLeadDue, leadTime, statusInfo, type Lead, type LeadCampus, type LeadEvent, type LeadPage, type LeadSalesperson } from './leads-model'

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
  return <Modal open className="lead-editor-modal" title={`记录跟进 · ${lead.name}`} width={560} onCancel={onClose} onOk={save} okText="保存跟进" cancelText="取消"
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

export function LeadDetail({ id, salespeople, campuses, onClose, onChanged }: {
  id: number; salespeople: LeadSalesperson[]; campuses: LeadCampus[]; onClose: () => void; onChanged: () => void
}) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [events, setEvents] = useState<LeadEvent[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<'profile' | 'follow' | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(true)
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
      <div className="lead-identity">
        <div className="lead-identity-top">
          <div className="lead-avatar">{lead.name.slice(0, 1)}</div>
          <div>
            <h2>{lead.name} <Tag color={statusInfo(lead.status).color}>{statusInfo(lead.status).label}</Tag></h2>
            {lead.contactName ? <span>联系人：{lead.contactName}</span> : null}
          </div>
        </div>
        <div className="lead-identity-facts">
          {lead.phone ? <div className="lead-info-row">
            <span className="lead-info-label">电话</span>
            <Space size={4}><a href={`tel:${lead.phone}`}>{lead.phone}</a><span className="lead-copy-dot">·</span><PhoneCopyButton onClick={async () => { if (await copyPlainText(lead.phone)) message.success('已复制'); else message.error('复制失败') }} /></Space>
          </div> : null}
          <div className="lead-info-row"><span className="lead-info-label">所属校区</span><em className={lead.campusId ? undefined : 'lead-info-muted'}>{campuses.find((item) => item.id === lead.campusId)?.name || (lead.campusId ? '—' : '未分配校区')}</em></div>
          <div className="lead-info-row"><span className="lead-info-label">负责人</span><em className={lead.ownerName ? undefined : 'lead-info-muted'}>{lead.ownerName || '待分配'}</em></div>
          {lead.nextFollowAt && !isLeadClosed(lead.status) ? <div className="lead-info-row">
            <span className="lead-info-label">下次跟进</span>
            <em className={isLeadDue(lead) ? 'lead-info-time lead-due' : 'lead-info-time'}>{leadTime(lead.nextFollowAt)}</em>
          </div> : null}
        </div>
      </div>
      <div className="lead-detail-actions"><Button icon={<EditOutlined />} onClick={() => setEditor('profile')}>编辑资料</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor('follow')} disabled={!lead.ownerId}>记录跟进</Button></div>
      {!lead.campusId && <Alert className="lead-form-note" type="info" showIcon message="这条客源还没有校区。请编辑资料并选择校区，对应校区的管理员和销售才能看到。" />}
      {!lead.ownerId && <Alert className="lead-form-note" type="info" showIcon message="先分配销售负责人，即可开始记录跟进。" />}
      <section className={archiveOpen ? 'lead-pane' : 'lead-pane lead-pane--folded'}>
        <button type="button" className="lead-pane-head" aria-expanded={archiveOpen} onClick={() => setArchiveOpen((open) => !open)}>
          <strong>客源档案</strong>
          <DownOutlined className={archiveOpen ? 'lead-pane-chevron' : 'lead-pane-chevron lead-pane-chevron--folded'} />
        </button>
        {archiveOpen ? <div className="lead-pane-body"><div className="lead-info-list">
          {lead.source ? <div className="lead-info-row"><span className="lead-info-label">客源渠道</span><em>{lead.source}</em></div> : null}
          {lead.sourceDetail ? <div className="lead-info-row"><span className="lead-info-label">来源说明</span><em>{lead.sourceDetail}</em></div> : null}
          {lead.wechat ? <div className="lead-info-row"><span className="lead-info-label">微信号</span><Space size={4}><em>{lead.wechat}</em><span className="lead-copy-dot">·</span><PhoneCopyButton onClick={async () => { if (await copyPlainText(lead.wechat)) message.success('已复制'); else message.error('复制失败') }} /></Space></div> : null}
          {lead.gender === 'MALE' || lead.gender === 'FEMALE' ? <div className="lead-info-row"><span className="lead-info-label">性别</span><em>{lead.gender === 'MALE' ? '男' : '女'}</em></div> : null}
          {lead.age != null ? <div className="lead-info-row"><span className="lead-info-label">年龄</span><em>{lead.age}岁</em></div> : null}
          <div className="lead-info-row"><span className="lead-info-label">录入时间</span><em className="lead-info-time">{leadTime(lead.createTime)}</em></div>
          {lead.remark ? <div className="lead-info-row lead-info-row--split lead-info-row--remark"><span className="lead-info-label lead-info-label--wide">需求与备注</span><em className="lead-prewrap lead-info-remark">{lead.remark}</em></div> : null}
        </div></div> : null}
      </section>
      <section className="lead-pane">
        <div className="lead-pane-head lead-pane-head--static"><strong>跟进时间线</strong><span>已跟进 {lead.followCount} 次</span></div>
        <div className="lead-pane-body">
      {!events.length ? <Empty description="暂无记录" /> : <Timeline items={events.map((event) => ({ color: event.type === 'FOLLOW' ? 'blue' : 'gray', children: <div className="lead-event">
        <div className="lead-event-head"><strong>{event.type === 'CREATE' ? '录入客源' : event.type === 'UPDATE' ? '更新资料' : FOLLOW_CHANNELS.find((item) => item.value === event.channel)?.label || '跟进记录'}</strong><span>{leadTime(event.createTime)}</span></div>
        {event.type === 'FOLLOW' && <Space size={4}>{event.fromStatus !== event.toStatus && <><Tag>{statusInfo(event.fromStatus).label}</Tag><span>→</span></>}<Tag color={statusInfo(event.toStatus).color}>{statusInfo(event.toStatus).label}</Tag></Space>}
        {event.type !== 'CREATE' && event.content ? <p className="lead-prewrap">{event.content}</p> : null}
        {event.nextFollowAt ? <div className="lead-event-meta lead-event-meta--follow">下次跟进：{leadTime(event.nextFollowAt)}</div> : null}
      </div> }))} />}
      {events.length < total && <Button block loading={moreLoading} onClick={more}>加载更早记录</Button>}
        </div>
      </section>
      {editor === 'profile' && <LeadEditor lead={lead} salespeople={salespeople} campuses={campuses} onClose={() => setEditor(null)} onSaved={saved} />}
      {editor === 'follow' && <FollowEditor lead={lead} onClose={() => setEditor(null)} onSaved={saved} />}
    </>}
  </Drawer>
}
