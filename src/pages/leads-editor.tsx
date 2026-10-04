import { Alert, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson, postJson, putJson } from '../api/biz'
import { tell } from './kit'
import { LEAD_SOURCES, type Lead, type LeadCampus, type LeadSalesperson } from './leads-model'

export function LeadEditor({ lead, salespeople, campuses, onClose, onSaved }: {
  lead?: Lead; salespeople: LeadSalesperson[]; campuses: LeadCampus[]; onClose: () => void; onSaved: (lead: Lead) => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ownerOptions, setOwnerOptions] = useState(salespeople)
  const submitting = useRef(false)
  const campusId = Form.useWatch('campusId', form)
  useEffect(() => {
    const selected = campusId || lead?.campusId
    if (!selected) {
      setOwnerOptions(salespeople)
      return
    }
    let cancelled = false
    getJson<LeadSalesperson[]>('/leads/salespeople', { campusId: selected })
      .then((people) => { if (!cancelled) setOwnerOptions(people) })
      .catch(() => { if (!cancelled) setOwnerOptions(salespeople) })
    return () => { cancelled = true }
  }, [campusId, lead?.campusId, salespeople])
  const owners = ownerOptions.map((person) => ({ value: person.id, label: person.name }))
  if (lead?.ownerId && !owners.some((owner) => owner.value === lead.ownerId)) {
    owners.push({ value: lead.ownerId, label: `${lead.ownerName}（已不在销售列表）` })
  }
  async function save() {
    if (submitting.current) return
    submitting.current = true
    try {
      const values = await form.validateFields()
      setSaving(true); setSaveError('')
      const payload = {
        name: values.name.trim(),
        phone: values.phone || '',
        contactName: values.contactName || '',
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
    <Form form={form} layout="vertical" scrollToFirstError onValuesChange={() => setSaveError('')} initialValues={lead || { gender: 'UNKNOWN', campusId: campuses.length === 1 ? campuses[0].id : undefined }}>
      <section className="lead-form-section">
        <h3 className="lead-form-section-title">基本信息</h3>
        <Form.Item name="name" label="客户姓名" rules={[{ required: true, whitespace: true, message: '请输入客户姓名' }]}><Input maxLength={60} placeholder="请输入客户姓名" /></Form.Item>
        <div className="lead-form-grid">
          <Form.Item name="phone" label="联系电话" rules={[{ validator: (_, value) => !value || /^\+?\d{6,20}$/.test(String(value || '').replace(/[\s()-]/g, '')) ? Promise.resolve() : Promise.reject(new Error('请输入有效的联系电话')) }]}><Input maxLength={32} placeholder="手机号或固定电话（选填）" /></Form.Item>
          <Form.Item name="contactName" label="联系人"><Input maxLength={60} placeholder="例如：家长姓名（选填）" /></Form.Item>
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
          <Form.Item name="ownerId" label="销售负责人"><Select allowClear showSearch optionFilterProp="label" placeholder="暂不分配" options={owners} notFoundContent="暂无在职销售人员" /></Form.Item>
        </div>
        {!ownerOptions.length && <Alert className="lead-form-note" type="info" showIcon message="暂无销售职位人员，可先保存客源，添加销售人员后再分配。" />}
        <Form.Item name="remark" label="需求与备注"><Input.TextArea rows={3} maxLength={1000} showCount placeholder="记录客户需求、意向和需要留意的信息（选填）" /></Form.Item>
      </section>
    </Form>
    {saveError && <Alert type="error" showIcon message={saveError} />}
  </Modal>
}
