import { Alert, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson, postJson, putJson } from '../api/biz'
import { tell } from './kit'
import { LEAD_PHONE_MAX_LENGTH, LEAD_SOURCES, leadPhoneError, normalizeLeadPhone, type Lead, type LeadCampus, type LeadSalesperson } from './leads-model'

export function LeadEditor({ lead, salespeople, campuses, currentCampusId, currentUserId: rawCurrentUserId, canAssignOwner, onClose, onSaved }: {
  lead?: Lead; salespeople: LeadSalesperson[]; campuses: LeadCampus[]; currentCampusId?: number | null; currentUserId?: number; canAssignOwner: boolean; onClose: () => void; onSaved: (lead: Lead) => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ownerOptions, setOwnerOptions] = useState(salespeople)
  const submitting = useRef(false)
  const campusId = Form.useWatch('campusId', form)
  const currentUserId = Number(rawCurrentUserId || 0)
  useEffect(() => {
    const applyOwnerOptions = (people: LeadSalesperson[]) => {
      setOwnerOptions(people)
      if (!canAssignOwner) {
        const mine = people.find((person) => Number(person.userId || 0) === currentUserId)
        form.setFieldValue('ownerId', mine?.id)
        return
      }
      const selectedOwnerId = Number(form.getFieldValue('ownerId') || 0)
      const preservedLeadOwner = Number(lead?.ownerId || 0) === selectedOwnerId
      if (selectedOwnerId > 0 && !preservedLeadOwner && !people.some((person) => Number(person.id) === selectedOwnerId)) {
        form.setFieldValue('ownerId', undefined)
      }
    }
    const selected = campusId || lead?.campusId
    if (!selected) {
      applyOwnerOptions(salespeople)
      return
    }
    let cancelled = false
    getJson<LeadSalesperson[]>('/leads/salespeople', { campusId: selected })
      .then((people) => {
        if (cancelled) return
        applyOwnerOptions(people)
      })
      .catch(() => { if (!cancelled) applyOwnerOptions(salespeople) })
    return () => { cancelled = true }
  }, [campusId, lead?.campusId, salespeople, canAssignOwner, currentUserId, form])
  const visibleOwnerOptions = canAssignOwner
    ? ownerOptions
    : ownerOptions.filter((person) => Number(person.userId || 0) === currentUserId)
  const owners = visibleOwnerOptions.map((person) => ({ value: person.id, label: person.name }))
  if (lead?.ownerId && !owners.some((owner) => owner.value === lead.ownerId)) {
    owners.push({ value: lead.ownerId, label: `${lead.ownerName}（已不在销售列表）` })
  }
  async function save() {
    if (submitting.current) return
    submitting.current = true
    try {
      const values = await form.validateFields()
      if (!canAssignOwner && !Number(values.ownerId || 0)) {
        setSaveError('当前账号未关联本校区在职销售职位，无法录入客源')
        return
      }
      setSaving(true); setSaveError('')
      const payload = {
        name: values.name.trim(),
        phone: values.phone || '',
        contactName: String(values.contactName || '').trim(),
        wechat: values.wechat || '',
        gender: values.gender || 'UNKNOWN',
        age: values.age ?? null,
        source: values.source || '',
        sourceDetail: values.sourceDetail || '',
        remark: values.remark || '',
        ownerId: values.ownerId || null,
        campusId: lead?.campusId || values.campusId,
        version: lead?.version,
      }
      const result = lead ? await putJson<Lead>(`/leads/${lead.id}`, payload) : await postJson<Lead>('/leads', payload)
      message.success(lead ? '客源资料已更新' : '客源已录入')
      onSaved(result)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'errorFields' in error)) setSaveError(tell(error, '保存失败，请重试'))
    } finally { submitting.current = false; setSaving(false) }
  }
  return <Modal open className="lead-editor-modal" title={lead ? '编辑客源' : '录入客源'} width={640} onCancel={onClose}
    maskClosable={false} keyboard={!saving} closable={!saving} cancelButtonProps={{ disabled: saving }} confirmLoading={saving} onOk={save} okText="保存客源" cancelText="取消">
    <Form form={form} layout="vertical" scrollToFirstError onValuesChange={() => setSaveError('')} initialValues={lead ? { ...lead, phone: normalizeLeadPhone(lead.phone) } : { gender: 'UNKNOWN', campusId: campuses.some((item) => item.id === currentCampusId) ? currentCampusId : campuses[0]?.id }}>
      <section className="lead-form-section">
        <h3 className="lead-form-section-title">基本信息</h3>
        <Form.Item name="name" label="客户姓名" rules={[{ required: true, whitespace: true, message: '请输入客户姓名' }, { validator: (_, value) => Array.from(String(value || '').trim()).length <= 6 ? Promise.resolve() : Promise.reject(new Error('客户姓名不能超过6个字')) }]}><Input maxLength={6} placeholder="请输入客户姓名（最多6个字）" /></Form.Item>
        <div className="lead-form-grid">
          <Form.Item name="phone" label="联系电话" getValueFromEvent={(event) => normalizeLeadPhone(event?.target?.value ?? event)} rules={[{ validator: (_, value) => { const error = leadPhoneError(String(value || '')); return error ? Promise.reject(new Error(error)) : Promise.resolve() } }]}><Input inputMode="numeric" maxLength={LEAD_PHONE_MAX_LENGTH} placeholder="手机号或固定电话（最多11位）" /></Form.Item>
          <Form.Item name="contactName" label="联系人" rules={[{ validator: (_, value) => Array.from(String(value || '').trim()).length <= 6 ? Promise.resolve() : Promise.reject(new Error('联系人不能超过6个字')) }]}><Input maxLength={6} placeholder="家长姓名（选填，最多6个字）" /></Form.Item>
          <Form.Item name="wechat" label="微信号"><Input maxLength={60} placeholder="选填" /></Form.Item>
          <Form.Item name="gender" label="性别"><Select options={[{ value: 'UNKNOWN', label: '未填写' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]} /></Form.Item>
          <Form.Item name="age" label="年龄"><InputNumber min={0} max={120} precision={0} placeholder="选填" style={{ width: '100%' }} /></Form.Item>
        </div>
      </section>
      <section className="lead-form-section">
        <h3 className="lead-form-section-title">来源与负责人</h3>
        <div className="lead-form-grid">
          <Form.Item name="campusId" label="所属校区" rules={[{ required: !lead?.campusId, message: '请选择校区' }]}>
          <Select disabled={!!lead?.campusId} placeholder="请选择校区" options={campuses.map((item) => ({ value: item.id, label: item.name }))} />
        </Form.Item>
        <Form.Item name="source" label="客源渠道"><Select allowClear placeholder="未填写" options={LEAD_SOURCES.map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="sourceDetail" label="来源说明"><Input maxLength={200} placeholder="介绍人、推广地点或平台名称（选填）" /></Form.Item>
          <Form.Item name="ownerId" label="销售负责人"><Select allowClear={canAssignOwner} disabled={!canAssignOwner} showSearch={canAssignOwner} optionFilterProp="label" placeholder={canAssignOwner ? '暂不分配' : '当前销售'} options={owners} notFoundContent="当前账号未关联本校区在职销售职位" /></Form.Item>
        </div>
        {canAssignOwner && !ownerOptions.length ? <Alert className="lead-form-note" type="info" showIcon message="暂无销售职位人员，可先保存客源，添加销售人员后再分配。" /> : null}
        {!canAssignOwner && !visibleOwnerOptions.length ? <Alert className="lead-form-note" type="warning" showIcon message="当前账号未关联本校区在职销售职位，无法录入客源。" /> : null}
        <Form.Item name="remark" label="需求与备注"><Input.TextArea rows={3} maxLength={1000} showCount placeholder="记录客户需求、意向和需要留意的信息（选填）" /></Form.Item>
      </section>
    </Form>
    {saveError && <Alert type="error" showIcon message={saveError} />}
  </Modal>
}
