import { Alert, Button, Form, Input, Modal, Switch, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson } from '../api/biz'

export interface OrganizationCreateValues {
  name: string
  description?: string
  campusAdminManageSalary?: boolean
  collaborators?: Array<{ nickname: string; phone: string }>
}

interface OrganizationQuota {
  organizationCount?: number
  organizationLimit?: number
  paid?: boolean
  canCreate?: boolean
}

export function OrganizationCreateModal(props: {
  open: boolean
  phone?: string
  onClose: () => void
  onSubmit: (values: OrganizationCreateValues) => Promise<void>
  onMembership?: () => void
}) {
  const [collaborators, setCollaborators] = useState<Array<{ nickname: string; phone: string }>>([])
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [quota, setQuota] = useState<OrganizationQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!props.open) return
    setCollaborators([])
    setDraftName('')
    setDraftPhone('')
    setQuota(null)
    setQuotaLoading(true)
    getJson<OrganizationQuota>('/organizations/quota')
      .then(setQuota)
      .catch(() => setQuota(null))
      .finally(() => setQuotaLoading(false))
  }, [props.open])

  function addCollaborator() {
    const nickname = draftName.trim()
    const phone = draftPhone.replace(/\D+/g, '').slice(0, 11)
    if (!nickname) return void message.warning('请输入成员姓名')
    if (Array.from(nickname).length > 6) return void message.warning('成员姓名最多6字')
    if (!/^1[3-9]\d{9}$/.test(phone)) return void message.warning('请输入正确的手机号')
    if (phone === String(props.phone || '').trim()) return void message.warning('手机号不能与机构管理员重复')
    if (collaborators.some((item) => item.phone === phone)) return void message.warning('该手机号已添加')
    setCollaborators([...collaborators, { nickname, phone }])
    setDraftName('')
    setDraftPhone('')
  }

  const blocked = quota?.canCreate === false
  const quotaText = quota && quota.organizationLimit != null
    ? `已创建 ${quota.organizationCount || 0} / ${quota.organizationLimit} 个机构`
    : ''

  return (
    <Modal title="创建机构" open={props.open} onCancel={props.onClose} footer={null} destroyOnHidden maskClosable={!saving} closable={!saving}>
      {quotaLoading ? <p>正在核对机构额度…</p> : null}
      {quotaText ? <Alert className="form-alert" type={blocked ? 'warning' : 'info'} showIcon message={quotaText} description={blocked ? '当前套餐的机构数量已达上限，请升级会员后再创建。' : '创建后会自动切换到新机构。'} /> : null}
      {blocked && props.onMembership ? <Button style={{ marginBottom: 14 }} onClick={() => { props.onClose(); props.onMembership?.() }}>查看会员套餐</Button> : null}
      <Form
        layout="vertical"
        initialValues={{ phone: props.phone, campusAdminManageSalary: false }}
        disabled={blocked || saving}
        onFinish={async (values) => {
          setSaving(true)
          try {
            await props.onSubmit({ ...values, collaborators })
          } catch (reason) {
            message.error(reason instanceof Error ? reason.message : '机构创建失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        <Form.Item name="name" label="机构名称" rules={[{ required: true, whitespace: true, message: '请输入机构名称' }, { max: 12, message: '机构名称最多12字' }]}><Input maxLength={12} /></Form.Item>
        <Form.Item name="phone" label="联系电话"><Input disabled /></Form.Item>
        <Form.Item name="description" label="机构简介"><Input.TextArea rows={3} maxLength={200} showCount /></Form.Item>
        <Form.Item name="campusAdminManageSalary" label="校区管理员可管理本校区工资" valuePropName="checked"><Switch /></Form.Item>
        <div>
          <div className="work-toolbar"><span>协同管理员 {collaborators.length} 人</span></div>
          {collaborators.map((item) => (
            <div key={item.phone} className="work-toolbar">
              <span>{item.nickname} {item.phone}</span>
              <Button type="link" onClick={() => setCollaborators(collaborators.filter((row) => row.phone !== item.phone))}>移除</Button>
            </div>
          ))}
          <div className="work-toolbar">
            <Input style={{ width: 120 }} maxLength={6} placeholder="姓名" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            <Input style={{ width: 160 }} maxLength={11} placeholder="手机号" value={draftPhone} onChange={(event) => setDraftPhone(event.target.value)} />
            <Button htmlType="button" onClick={addCollaborator}>添加</Button>
          </div>
        </div>
        <Button type="primary" htmlType="submit" loading={saving}>创建机构</Button>
      </Form>
    </Modal>
  )
}
